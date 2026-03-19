# backend/auth/routes.py
import logging

from flask import Blueprint, request, jsonify, session
import bcrypt
import os
import datetime

# from db import users_collection
from db import users_collection

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    # Validate input
    if not username:
        logging.info('user attempted to sign up, but username required')
        return jsonify({"error": "Username is required"}), 400
    if not password:
        logging.info('user attempted to sign up, but password required')
        return jsonify({"error": "Password is required"}), 400

    # Password validation
    if len(password) < 8:
        logging.info('user attempted to sign up, but password too short')
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if not any(c.isupper() for c in password):
        logging.info('user attempted to sign up, but user attempted to sign up, but password must contain uppercase letters')
        return jsonify({"error": "Password must contain at least one uppercase letter"}), 400
    if not any(c.islower() for c in password):
        logging.info('user attempted to sign up, but password must contain lowercase letters')
        return jsonify({"error": "Password must contain at least one lowercase letter"}), 400
    if not any(c in '!@#$%^&*(),.?":{}|<>' for c in password):
        logging.info('user attempted to sign up, but password must contain special characters')
        return jsonify({"error": "Password must contain at least one special character"}), 400

    # Check if username already exists
    if users_collection.find_one({"username": username}):
        logging.info('user attempted to sign up, but username already exists')
        return jsonify({"error": "Username already exists"}), 409

    # Hash password
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    # Create user
    user = {
        "username": username,
        "password": hashed_password.decode('utf-8'),
        "created_at": datetime.datetime.utcnow()
    }

    users_collection.insert_one(user)
    logging.info(f'{username} successfully signed up')
    session['username'] = username
    return jsonify({"message": "User created successfully"}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    # Find user
    user = users_collection.find_one({"username": username})

    if not user:
        logging.info('user attempted to login up, but username does not exist')
        return jsonify({"error": "Invalid username"}), 401
    elif not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        logging.info(f'{user.get("username")} attempted to login, but password does not match')
        return jsonify({"error": "Invalid password"}), 401

    logging.info(f'{user.get("username")} successfully logged in')
    session['username'] = username
    return jsonify({
        "message": "Login successful",
        "username": username
    }), 200


@auth_bp.route('/logout', methods=['POST'])
def logout():
    username = session.get('username', 'unknown')
    session.clear()
    logging.info(f'{username} logged out')
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.route('/check', methods=['GET'])
def check_auth():
    """Return whether the current session has an authenticated user."""
    username = session.get('username')
    if username:
        return jsonify({"authenticated": True, "username": username}), 200
    return jsonify({"authenticated": False}), 200

############################

# FOR AVATARS

import io, base64, time
from PIL import Image
from flask import current_app, url_for
from werkzeug.utils import secure_filename
from game.routes import players
from extensions import socketio

ALLOWED = {'png','jpg','jpeg'}

def allowed_file(fname):
    return '.' in fname and fname.rsplit('.',1)[1].lower() in ALLOWED

@auth_bp.route('/profile', methods=['GET'])
def get_profile():
    """Return the current user's avatar as a data URL."""
    username = request.args.get('username')
    if not username:
        return jsonify(error="username required"), 400

    user = users_collection.find_one(
        {"username": username},
        {"avatar": 1}
    )

    return jsonify(avatar=(user.get('avatar') if user else None)), 200

@auth_bp.route('/avatar', methods=['POST'])
def upload_avatar():
    """Accept multipart/form-data file 'avatar', crop & resize to square, store as base64."""
    # again we'll pull username from a query param or form field
    username = request.form.get("username")
    if not username:
        return jsonify(error="username required"), 400

    # if "avatar" not in request.files:
    #     return jsonify(error="No file part"), 400

    file = request.files["avatar"]
    if not file or not allowed_file(file.filename):
        return jsonify(error='Bad file'), 400

    # — Crop & resize on the server if you like —
    # load with PIL.Image.open(file.stream), apply .crop() or .thumbnail()

    # save to disk
    # filename = secure_filename(f"{username.username}_{int(time.time())}.{file.filename.rsplit('.', 1)[1]}")
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = secure_filename(f"{username}_{int(time.time())}.{ext}")

    out_dir = os.path.join(current_app.static_folder, 'avatars')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, filename)
    file.save(path)

    # store (relative) URL in MongoDB:
    # avatar_url = url_for('serve_avatar', filename=filename, _external=True)
    avatar_url = f"/avatars/{filename}"
    users_collection.update_one(
        {'username': username},
        {'$set': {'avatar': avatar_url}}
    )

    # also update in-memory player map so new joins get the URL
    # players[username.username]['avatar'] = avatar_url
    if username in players:
        players[username]['avatar'] = avatar_url

    # broadcast to everyone that changed avatar
    # re-emit a “player_moved” (re-using that handler) with the exact same pos but
    # now carrying the new avatar URL.  Clients already listen for this and will
    # update their local players[u].avatar and cache the image immediately.
    player = players.get(username)
    if player:
        socketio.emit('player_moved', {
            'username': username,
            'position': player['position'],
            'color': player['color'],
            'avatar': avatar_url
        }, room='main')

    return jsonify(avatar=avatar_url), 200
