# backend/game/routes.py
from flask import Blueprint, request, jsonify
from flask_socketio import emit, join_room, leave_room

# from app import socketio
from extensions import socketio

from db import users_collection, player_collection

import random

game_bp = Blueprint('game', __name__)

# Store active players and their positions
# username: { username, position:{x,y}, room, color }
players = {}

# which sockets belong to which username
# username: set(sid1, sid2, ...)
user_sids = {}

# reverse lookup
# sid: username
sid_to_user = {}

# keep a record of painted cells: map "x,y" → username
grid_owner: dict[str, str] = {}

WORLD_COLS = 100
WORLD_ROWS = 100

# Keep one color per username (defunct?)
user_colors = {}


def generate_color(username):
    """Give each username a distinct hex color (first‐seen wins)."""

    if username in user_colors:
        return user_colors[username]
    color = "#{:06x}".format(random.randint(0, 0xFFFFFF))
    user_colors[username] = color
    return color


# Register socket events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    user = sid_to_user.get(sid)
    if not user:
        # print(f"Unknown sid disconnected: {sid}")
        return

    # remove this connection
    user_sids[user].discard(sid)
    sid_to_user.pop(sid, None)
    # print(f"{user} disconnected SID {sid}. Remaining tabs: {len(user_sids[user])}")

    # if no more tabs for this user, fully remove them
    if not user_sids[user]:
        room = players[user]['room']
        # Save game stats before player fully disconnects
        update_player_stats(user)
        players.pop(user, None)
        user_sids.pop(user, None)
        emit('player_left', {'username': user}, room=room)
        # print(f"{user} left room {room} (all tabs closed)")


def update_player_stats(username):
    """Update player statistics when a game session ends"""
    # Count cells owned by this player as their score
    current_score = sum(1 for owner in grid_owner.values() if owner == username)
    
    # Get existing stats or create default ones
    player_stats = player_collection.find_one({"username": username}) or {
        "username": username,
        "games_played": 0,
        "max_score": 0,
        "min_score": float('inf'),
        "total_score": 0,
        "average_score": 0
    }
    
    # Update stats
    games_played = player_stats.get("games_played", 0) + 1
    total_score = player_stats.get("total_score", 0) + current_score
    max_score = max(player_stats.get("max_score", 0), current_score)
    
    # Handle min_score, ensuring it's not float('inf') in the database
    old_min = player_stats.get("min_score", float('inf'))
    if old_min == float('inf'):
        min_score = current_score
    else:
        min_score = min(old_min, current_score)
    
    # Calculate average
    average_score = total_score / games_played if games_played > 0 else 0
    
    # Update in database
    player_collection.update_one(
        {"username": username},
        {"$set": {
            "username": username,
            "games_played": games_played,
            "max_score": max_score,
            "min_score": min_score,
            "total_score": total_score,
            "average_score": average_score
        }},
        upsert=True
    )


@socketio.on('join_game')
def handle_join(data):
    print(f"👉 handle_join called, sid={request.sid}, data={data}")
    # print("   players before:", players)

    username = data.get('username')
    room = data.get('room', 'main')
    sid = request.sid

    # if first time login: create the player and pick random start cell
    if username not in players:
        # Spawn within the central zone so players start in the middle of the grid
        SPAWN_MARGIN = 30   # keep away from the outer 30% on each side
        start_x = random.randint(SPAWN_MARGIN, WORLD_COLS - 1 - SPAWN_MARGIN)
        start_y = random.randint(SPAWN_MARGIN, WORLD_ROWS - 1 - SPAWN_MARGIN)
        players[username] = {
            'username': username,
            'position': {'x': start_x, 'y': start_y},
            'room': room,
            'color': generate_color(username)
        }

    # Defensively ensure user_sids[username] exists before adding.
    # If a player re-joins before their old disconnect event fully propagates,
    # players[username] may still exist but user_sids[username] could have been
    # deleted — using setdefault() prevents a silent KeyError crash.
    user_sids.setdefault(username, set()).add(sid)
    sid_to_user[sid] = username
    join_room(room)
    # print(f"{username} joined SID={sid}; tabs now={len(user_sids[username])}")

    # print("   players after:", players)

    # FOR AVATARS: get avatar for user
    # inside your handle_join(), right after players[username] = { … }
    user_doc = users_collection.find_one(
        {"username": username},
        {"avatar": 1})
    if user_doc and user_doc.get("avatar"):
        # uri = f"data:{user_doc['avatar_content_type']};base64,{user_doc['avatar']}"
        uri = user_doc.get("avatar")
    else:
        uri = None
    players[username]["avatar"] = uri

    #######################

    # Paint their starting cell immediately
    start = players[username]['position']
    key = f"{start['x']},{start['y']}"
    grid_owner[key] = username
    emit('cell_painted', {
        'x': start['x'],
        'y': start['y'],
        'username': username,
        'color': players[username]['color']
    }, room=room)

    # to get paint on initial join
    full = [
        {
            'x': int(k.split(',')[0]),
            'y': int(k.split(',')[1]),
            'username': u,
            'color': user_colors[u]
        }
        for k, u in grid_owner.items()
    ]
    emit('grid_state', {
        'cells': full,
        'user_colors': user_colors
    }, room=room)

    # CHANGED FOR AVATAR INFORMATION:

    # send this tab its own data
    # emit('player_data', players[username], room=sid)
    emit('player_data', {
        'username': username,
        'position': players[username]['position'],
        'color': players[username]['color'],
        'avatar': players[username]['avatar']
    }, room=sid)

    # send everyone in room the full state
    # all_players = list(players.values())
    # emit('game_state', {'players': all_players}, room=sid)
    existing = []
    for p in players.values():
        if p['username'] != username and p['room'] == room:
            existing.append({
                'username': p['username'],
                'position': p['position'],
                'color': p['color'],
                'avatar': p.get('avatar')
            })
    emit('game_state', {'players': existing})

    # if this was the first tab (len==1), notify others of a new arrival
    if len(user_sids[username]) == 1:
        # emit('player_joined', players[username], room=room, include_self=False)
        # print(f"Broadcasted player_joined for {username}")
        emit('player_joined', {
            'username': username,
            'position': players[username]['position'],
            'color': players[username]['color'],
            'avatar': players[username]['avatar']
        }, room=room, include_self=False)


@socketio.on('move')
def handle_move(data):
    # print(f"👉 handle_move called, sid={request.sid}, data={data}")

    sid = request.sid
    username = sid_to_user.get(sid)
    if not username or username not in players:
        return

    # 1) update the shared/canonical position of the player
    new_pos = data['position']
    players[username]['position'] = new_pos
    room = players[username]['room']
    # print(f"{username} moved to {new_pos}")

    # 2) paint that cell
    cell_key = f"{new_pos['x']},{new_pos['y']}"
    grid_owner[cell_key] = username

    # 3) broadcast both the move AND the paint
    emit('player_moved', {
        'username': username,
        'position': new_pos,
        'color': players[username]['color'],
        'avatar': players[username].get('avatar')
    }, room=room)

    emit('cell_painted', {
        'x': new_pos['x'],
        'y': new_pos['y'],
        'username': username,
        'color': players[username]['color']
    }, room=room)


# New endpoint to handle achievements from client
@socketio.on('update_achievements')
def handle_achievement_update(data):
    """Handle achievement updates from the client"""
    username = data.get('username')
    achievements = data.get('achievements')

    if not username or not achievements:
        return

    # Update the achievements in the database
    users_collection.update_one(
        {"username": username},
        {"$set": {"achievements": achievements}}
    )

    print(f"Updated achievements for {username}: {achievements}")

    # Could emit an event to notify other tabs/clients if needed
    # emit('achievements_updated', {'username': username, 'achievements': achievements}, room=username)


# Add a REST endpoint to get achievements
@game_bp.route('/achievements', methods=['GET'])
def get_achievements():
    """Get the achievements for a user."""
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "Username is required"}), 400

    user = users_collection.find_one({"username": username})
    if not user:
        return jsonify({"error": "User not found"}), 404

    # If the user doesn't have achievements yet, return defaults
    achievements = user.get('achievements', {
        "fiftyPoints": False,
        "hundredPoints": False,
        "twoHundredPoints": False,
        "allUnlocked": False
    })

    # If allUnlocked flag isn't present but should be based on other achievements
    if "allUnlocked" not in achievements and all([
        achievements.get("fiftyPoints", False),
        achievements.get("hundredPoints", False),
        achievements.get("twoHundredPoints", False)
    ]):
        achievements["allUnlocked"] = True
        # Update the database with the computed allUnlocked status
        users_collection.update_one(
            {"username": username},
            {"$set": {"achievements": achievements}}
        )

    return jsonify({"achievements": achievements}), 200


@game_bp.route('/player-stats', methods=['GET'])
def get_player_stats():
    """Get the statistics for a player."""
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "Username is required"}), 400

    # For currently active players, calculate their current score
    current_score = 0
    if username in players:
        current_score = sum(1 for owner in grid_owner.values() if owner == username)

    # Get stored player stats from database
    player_stats = player_collection.find_one({"username": username})
    
    if not player_stats:
        # Return default stats if player has no history
        return jsonify({
            "username": username,
            "games_played": 0,
            "max_score": current_score,
            "min_score": current_score if current_score > 0 else 0,
            "total_score": current_score,
            "average_score": current_score,
            "current_score": current_score
        }), 200
    
    # Add the current score to the response 
    player_stats["current_score"] = current_score
    
    # Remove MongoDB _id from the response
    if "_id" in player_stats:
        del player_stats["_id"]
        
    return jsonify(player_stats), 200


# Add a endpoint to get leaderboard
@game_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    """Get the top players by max score."""
    limit = int(request.args.get('limit', 10))
    
    # Query the database for players sorted by max_score
    top_players = list(player_collection.find(
        {},
        {"username": 1, "max_score": 1, "games_played": 1, "average_score": 1, "_id": 0}
    ).sort("max_score", -1).limit(limit))
    
    return jsonify({"leaderboard": top_players}), 200

# added achievements functionality here.