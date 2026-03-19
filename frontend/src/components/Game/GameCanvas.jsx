import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import useResizeObserver from '@react-hook/resize-observer';
import axios from 'axios';

function GameCanvas({ username }) {
  const canvasRef = useRef(null);

  // Ref-map: username → HTMLImageElement (avatars)
  const avatarImages = useRef({});

  const [socket, setSocket] = useState(null);
  // const  a[players, setPlayers] = useState({});

  // now map username → { position: {x,y}, color: '#rrggbb' }
  const [players, setPlayers] = useState({});

  // our own avatar data-URL
  const [selfAvatar, setSelfAvatar] = useState(null);

  // our own color (comes from the server on join)
  const [selfColor, setSelfColor] = useState('#e74c3c');

  const [serverColors, setServerColors] = useState({});

  // our shared server position
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const dirRef          = useRef(null);
  const moveIntervalRef = useRef(null);

  // keep the latest position in a ref so our interval always uses fresh coords
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position }, [position]);


  const [isConnected, setIsConnected] = useState(false);

  const [grid, setGrid] = useState({});
  // key = 'x,y' → { username, color }
  const [leaderboard, setLeaderboard] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);

  // Add achievements state
  const [achievements, setAchievements] = useState({
    fiftyPoints: false,
    hundredPoints: false,
    twoHundredPoints: false
  });

  // Add state for tracking whether all achievements are unlocked
  const [allAchievementsUnlocked, setAllAchievementsUnlocked] = useState(false);

  const containerRef = useRef(null);
  const [gridSize, setGridSize] = useState(20);
  const statsIntervalRef = useRef(null);

  const WORLD_COLS = 100, WORLD_ROWS = 100;
  const VIEW_COLS  =  25, VIEW_ROWS  =  25;
  // const gridSize = 20;

  // whenever the container's height changes, recalc cell size:
  // pull our sizing logic into a function we can call on mount, on shrink, or on window resize
  const recalcGridSize = useCallback(() => {
    if (!containerRef.current) return;
    const totalH = containerRef.current.clientHeight;
    const totalW = containerRef.current.clientWidth;
    // canvas panel is flex:3 out of flex:3+1 = 75% of total width
    // subtract padding on the canvas-panel (1.5rem each side ≈ 48px) + canvas-wrapper padding (24px)
    const availW = totalW * 0.75 - 72;
    const availH = totalH - 48; // subtract canvas-panel vertical padding
    const sizeBasedOnHeight = Math.floor(availH / VIEW_ROWS);
    const sizeBasedOnWidth  = Math.floor(availW / VIEW_COLS);
    setGridSize(Math.min(sizeBasedOnHeight, sizeBasedOnWidth));
  }, [VIEW_ROWS, VIEW_COLS]);

  // 1) run once on mount, 2) listen for window.resize
  useEffect(() => {
    recalcGridSize();
    window.addEventListener('resize', recalcGridSize);
    return () => window.removeEventListener('resize', recalcGridSize);
  }, [recalcGridSize]);

  // 3) still catch rapid container‐box shrinks via ResizeObserver
  useResizeObserver(containerRef, recalcGridSize);

  // Fetch player stats periodically
  useEffect(() => {
    if (!username || !isConnected) return;

    const fetchPlayerStats = async () => {
      try {
        const response = await axios.get(`/api/game/player-stats?username=${username}`, {
          withCredentials: true
        });
        setPlayerStats(response.data);
      } catch (error) {
        console.error('Error fetching player stats:', error);
      }
    };

    // Fetch immediately on connection
    fetchPlayerStats();
    
    // Then fetch every 30 seconds
    statsIntervalRef.current = setInterval(fetchPlayerStats, 30000);
    
    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [username, isConnected]);

  // helper function for leaderboard
  function recomputeLeaderboard(gridMap) {
    const counts = {};
    Object.values(gridMap).forEach(({ username }) => {
      counts[username] = (counts[username] || 0) + 1;
    });
    // include disconnected players too if zero
    Object.keys(players).concat(username).forEach(u => {
      if (!(u in counts)) counts[u] = 0;
    });
    // turn into sorted array
    const board = Object.entries(counts)
      .map(([user, count]) => ({ user, count }))
      .sort((a,b) => b.count - a.count);

    // Check for achievements
    const userCount = counts[username] || 0;
    const newAchievements = {
      fiftyPoints: userCount >= 50,
      hundredPoints: userCount >= 100,
      twoHundredPoints: userCount >= 200
    };

    // Check if all achievements are unlocked
    const allUnlocked = newAchievements.fiftyPoints &&
                        newAchievements.hundredPoints &&
                        newAchievements.twoHundredPoints;

    setAllAchievementsUnlocked(allUnlocked);

    // If any achievements have changed, update them and save to server
    if (newAchievements.fiftyPoints !== achievements.fiftyPoints ||
        newAchievements.hundredPoints !== achievements.hundredPoints ||
        newAchievements.twoHundredPoints !== achievements.twoHundredPoints ||
        allUnlocked !== allAchievementsUnlocked) {

      setAchievements(newAchievements);

      // Send updated achievements to the server
      if (socket && isConnected) {
        socket.emit('update_achievements', {
          username,
          achievements: {
            ...newAchievements,
            allUnlocked: allUnlocked
          }
        });
      }
    }

    setLeaderboard(board);
  }

  // Load saved achievements on component mount
  useEffect(() => {
    if (!username) return;

    const loadAchievements = async () => {
      try {
        const response = await fetch(`/api/game/achievements?username=${username}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          if (data.achievements) {
            setAchievements(data.achievements);

            // Check if all achievements are unlocked
            const allUnlocked = data.achievements.fiftyPoints &&
                                data.achievements.hundredPoints &&
                                data.achievements.twoHundredPoints;
            setAllAchievementsUnlocked(allUnlocked);
          }
        }
      } catch (error) {
        console.error('Failed to load achievements:', error);
      }
    };

    loadAchievements();
  }, [username]);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      withCredentials: true
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
      // Clear the stats interval on unmount
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  // Join game when socket is ready
  useEffect(() => {

    if (!socket || !username) return;

    // console.log("🔗 setting up socket listeners, socket:", socket, "username:", username);

    const onConnect = () => {
      // console.log('✅ Connected to WebSocket server');
      setIsConnected(true);
      socket.emit('join_game', { username, room: 'main' });
    };

    const onDisconnect = () => {
      // console.log('❌ Disconnected from WebSocket server');
      setIsConnected(false);
    };

    const onConnectError = (error) => {
      // console.error('Connection error:', error);
      setIsConnected(false);
    };

    const onPlayerJoined = (data) => {
      // data: { username, position, color, avatar }

      if (data.username === username) return; // for when user logs in 2x

      // console.log('⬆️ player_joined:', data);

      // FOR AVATARS
      setPlayers(prev => ({
        ...prev,
        [data.username]: {
          position: data.position,
          color: data.color,
          avatar: data.avatar
        }
      }));

      // cache their avatar image
      if (data.avatar) {
        const img = new Image();
        img.onload = () => {
          avatarImages.current[data.username] = img;
          // << poke React to re-draw now that the image is ready >>
          setPlayers(prev => ({ ...prev }));
        };
        img.onerror = () => {
          // console.warn(`Failed to load avatar for ${data.username}`);
          delete avatarImages.current[data.username];
          // << poke React to re-draw now that the image is ready >>
          setPlayers(prev => ({ ...prev }));
        };
        img.src = data.avatar;
      }
      /////////////////////////////////////

      // Paint their starting cell immediately
      setGrid(prev => {
        const g = { ...prev, [`${data.position.x},${data.position.y}`]: { username: data.username, color: data.color } };
        recomputeLeaderboard(g);
        return g;
      });

      // remember the new player's color
      setServerColors(prev => ({ ...prev, [data.username]: data.color }));
    };

    const onPlayerLeft = (data) => {
      // console.log('⬇️ player_left:', data);
      setPlayers(prev => {
        const copy = { ...prev };
        delete copy[data.username];
        return copy;
      });
    };

    const onPlayerMoved = (data) => {
      if (data.username === username) { // for when user logs in 2x
        setPosition(data.position);

        //   // in case avatar changed
        if (data.avatar) {
          const img = new Image();
          img.onload = () => {
            avatarImages.current[data.username] = img;
            // << poke React to re-draw now that the image is ready >>
            setPlayers(prev => ({ ...prev }));
          };
          img.onerror = () => {
            // console.warn(`Failed to load avatar for ${data.username}`);
            delete avatarImages.current[data.username];
            // << poke React to re-draw now that the image is ready >>
            setPlayers(prev => ({ ...prev }));
          };
          img.src = data.avatar;
        }

        // these players are always on backend map, so "keep it fresh"
        setServerColors(prev => ({ ...prev, [data.username]: data.color }));

      } else {
        // console.log('➡️ player_moved:', data);

        // CHANGED FOR AVATARS
        setPlayers(prev => ({
          ...prev,
          [data.username]: {
            position: data.position,
            color: data.color,
            avatar: data.avatar
          }
        }));

        // cache image
        if (data.avatar) {
          const img = new Image();
          img.onload = () => {
            avatarImages.current[data.username] = img;
            // << poke React to re-draw now that the image is ready >>
            setPlayers(prev => ({ ...prev }));
          };
          img.onerror = () => {
            // console.warn(`Failed to load avatar for ${data.username}`);
            delete avatarImages.current[data.username];
            // << poke React to re-draw now that the image is ready >>
            setPlayers(prev => ({ ...prev }));
          };
          img.src = data.avatar;
        }

        ///////////////////////////////

        setServerColors(prev => ({ ...prev, [data.username]: data.color }));
      }
    };

    const onGameState = (data) => {
      // console.log('📦 game_state:', data);
      // console.log("onGameState payload", data.players);

      // FOR AVATARS
      const map = {};
      data.players.forEach(p => {
        if (p.username === username) return;

        // console.log(`– player ${p.username} has avatar URL:`, p.avatar);
        map[p.username] = {
          position: p.position,
          color:    p.color,
          avatar:   p.avatar
        };

        // cache each avatar
        if (p.avatar) {
          const img = new Image();
          img.onload = () => {
            avatarImages.current[p.username] = img;
            // console.log(`✓ cached avatar for ${p.username}`);
            // << poke React to re-draw now that the image is ready >>
            setPlayers(prev => ({ ...prev }));
          };
          img.onerror = () => {
            // console.warn(`Failed to load avatar for ${p.username}`);
            delete avatarImages.current[p.username];
            // << poke React to re-draw now that the image is ready >>
            setPlayers(prev => ({ ...prev }));
          };
          img.src = p.avatar;
        }
      });
      setPlayers(map);

      // console.log("→ players state is now", map);
      // console.log("→ avatarImages map is now", Object.keys(avatarImages.current));
      ///////////////////////////////

      // load *all* players' colors at once
      setServerColors(prev => {
        const out = { ...prev };
        data.players.forEach(p => { out[p.username] = p.color; });
        return out;
      });
    };

    // Our own initial data
    const onPlayerData = (data) => {
      // data: { username, position, color, avatar }
      // console.log('🔖 player_data:', data);
      setSelfColor(data.color);
      setPosition(data.position);

      if (data.avatar) {
        const img = new Image();
        img.onload = () => {
          avatarImages.current[data.username] = img;
          // << poke React to re-draw now that the image is ready >>
          setPlayers(prev => ({ ...prev }));
        };
        img.onerror = () => {
          console.warn(`Failed to load avatar for ${data.username}`);
          delete avatarImages.current[data.username];
          // << poke React to re-draw now that the image is ready >>
          setPlayers(prev => ({ ...prev }));
        };
        setSelfAvatar(data.avatar);
        img.src = data.avatar;
      }

      // Paint starting cell immediately
      setGrid(prev => {
        const g = { ...prev, [`${data.position.x},${data.position.y}`]: { username: username, color: data.color } };
        recomputeLeaderboard(g);
        return g;
      });

      // remember *our* color from the server
      setServerColors(prev => ({ ...prev, [data.username]: data.color }));
    };

    const onGridState = ({ cells, user_colors }) => {
      // build the grid map
      const g = {};
      cells.forEach(c => {
        g[`${c.x},${c.y}`] = { username: c.username, color: c.color };
      });
      setGrid(g);
      recomputeLeaderboard(g);

      // save the authoritative color map from the server
      if (user_colors) {
        setServerColors(user_colors)
      }
    };

    const onCellPainted = (c) => {
      setGrid(prev => {
        const g = {
          ...prev,
          [`${c.x},${c.y}`]: { username: c.username, color:c.color }
        };
        recomputeLeaderboard(g);
        return g;
      });

      // palette update (in case someone's color changed on the server)
      setServerColors(prev => ({ ...prev, [c.username]: c.color }));
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('player_joined', onPlayerJoined);
    socket.on('player_left', onPlayerLeft);
    socket.on('player_moved', onPlayerMoved);
    socket.on('game_state', onGameState);
    socket.on('player_data', onPlayerData);
    socket.on('grid_state', onGridState);
    socket.on('cell_painted', onCellPainted);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('player_joined', onPlayerJoined);
      socket.off('player_left', onPlayerLeft);
      socket.off('player_moved', onPlayerMoved);
      socket.off('game_state', onGameState);
      socket.off('player_data', onPlayerData);
      socket.off('grid_state', onGridState);
      socket.off('cell_painted', onCellPainted);
    };
  }, [socket, username]);

  // Handle keyboard input
  // —— zero-delay, snappy pivot, steady repeats ——
  useEffect(() => {
    if (!socket || !isConnected) return;

    const MOVE_RATE = 100;  // milliseconds between moves; tweak to taste
    const keyMap = {
      ArrowUp:    { dx:  0, dy: -1 },
      ArrowDown:  { dx:  0, dy:  1 },
      ArrowLeft:  { dx: -1, dy:  0 },
      ArrowRight: { dx:  1, dy:  0 }
    };

    // perform a move using the very latest position
    const doMove = ({ dx, dy }) => {
      const { x, y } = positionRef.current;
      const nx = Math.max(0, Math.min(WORLD_COLS - 1, x + dx));
      const ny = Math.max(0, Math.min(WORLD_ROWS - 1, y + dy));
      socket.emit('move', { position: { x: nx, y: ny } });
    };

    // start or restart moving in this direction
    const startMoving = (dir) => {
      clearInterval(moveIntervalRef.current);
      dirRef.current = `${dir.dx},${dir.dy}`;
      doMove(dir);  // **instant** first step
      // then rock-steady repeats
      moveIntervalRef.current = setInterval(() => {
        doMove(dir);
      }, MOVE_RATE);
    };

    // stop if we release the active direction
    const stopMoving = (dirKey) => {
      if (dirRef.current === dirKey) {
        clearInterval(moveIntervalRef.current);
        dirRef.current = null;
      }
    };

    const onKeyDown = (e) => {
      const dir = keyMap[e.key];
      if (!dir) return;
      const key = `${dir.dx},${dir.dy}`;
      if (dirRef.current !== key) {
        startMoving(dir);
      }
    };

    const onKeyUp = (e) => {
      const dir = keyMap[e.key];
      if (!dir) return;
      stopMoving(`${dir.dx},${dir.dy}`);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      clearInterval(moveIntervalRef.current);
      dirRef.current = null;
    };
  }, [socket, isConnected]);

  // Draw the game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── HiDPI / Retina fix ──────────────────────────────────────
    const dpr = window.devicePixelRatio || 1;
    const logicalW = VIEW_COLS * gridSize;
    const logicalH = VIEW_ROWS * gridSize;

    // Set the *actual* pixel buffer size (2× on Retina, etc.)
    canvas.width  = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);

    // Keep the CSS / layout size at the logical dimensions
    canvas.style.width  = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;

    const ctx = canvas.getContext('2d');
    // Scale all drawing operations so we use logical coordinates everywhere
    ctx.scale(dpr, dpr);
    // ────────────────────────────────────────────────────────────

    // compute camera origin so player is centered when possible
    const camX = Math.max(
      0,
      Math.min(position.x - Math.floor(VIEW_COLS/2), WORLD_COLS - VIEW_COLS)
    );
    const camY = Math.max(
      0,
      Math.min(position.y - Math.floor(VIEW_ROWS/2), WORLD_ROWS - VIEW_ROWS)
    );

    // clear the 25×25 viewport (in logical pixels — context is already scaled)
    ctx.clearRect(0, 0, logicalW, logicalH);

    // paint cells that lie within the viewport
    Object.entries(grid).forEach(([key, {color}]) => {
      const [x,y] = key.split(',').map(Number);
      if (x >= camX && x < camX + VIEW_COLS && y >= camY && y < camY + VIEW_ROWS) {
        ctx.fillStyle = color;
        ctx.fillRect(
          (x - camX) * gridSize,
          (y - camY) * gridSize,
          gridSize,
          gridSize
        );
      }
    });

    // draw grid lines for 25×25 cells
    ctx.strokeStyle = 'rgba(170, 185, 210, 0.55)';
    ctx.lineWidth = 0.5;          // stays crisp because buffer is DPR-scaled
    for (let i = 0; i <= VIEW_COLS; i++) {
      const sx = i * gridSize;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, logicalH);
      ctx.stroke();
    }
    for (let j = 0; j <= VIEW_ROWS; j++) {
      const sy = j * gridSize;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(logicalW, sy);
      ctx.stroke();
    }

    // helper to draw a player square + bordered name
    function drawPlayer(u, pos, color, isSelf=false) {
      const px = (pos.x - camX) * gridSize;
      const py = (pos.y - camY) * gridSize;

      const key = isSelf ? username : u;
      const img = avatarImages.current[key];

      if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        ctx.drawImage(img, px, py, gridSize, gridSize);
      } else {
        ctx.fillStyle = isSelf ? selfColor : color;
        ctx.fillRect(px, py, gridSize, gridSize);
      }

      // border — thinner looks sharper at high DPR
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(px, py, gridSize, gridSize);

      // name tag — font in logical px; the DPR scale makes it razor-sharp
      ctx.font = `bold ${Math.max(10, Math.round(gridSize * 0.48))}px Inter, Arial, sans-serif`;
      const textW = ctx.measureText(u).width;
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.fillRect(px - 1, py - 17, textW + 8, 15);
      ctx.fillStyle = '#1e2530';
      ctx.fillText(u, px + 3, py - 5);
    }

    // draw *other* players
    Object.entries(players).forEach(([u,{position:p,color}]) => {
      drawPlayer(u, p, color);
    });

    // draw yourself on top
    drawPlayer(username, position, selfColor, true);

  }, [grid, players, position, selfColor, username, gridSize]);

  // Achievement item component
  const AchievementItem = ({ achieved, text }) => (
    <div className="achievement-item">
      {achieved ? (
        <span className="achievement-check achieved">✓</span>
      ) : (
        <span className="achievement-check not-achieved">✗</span>
      )}
      <span>{text}</span>
    </div>
  );

  return (
    <div className="game-container" ref={containerRef}>
      {!isConnected && (
        <p className="connection-warning">Connecting to server...</p>
      )}

      {/* Zone 2: Canvas (3/4) */}
      <div className="canvas-panel">
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={VIEW_COLS * gridSize}
            height={VIEW_ROWS * gridSize}
            style={{
              width:  `${VIEW_COLS * gridSize}px`,
              height: `${VIEW_ROWS * gridSize}px`
            }}
          />
        </div>
      </div>
              {/* Zone 3: Sidebar (1/4) */}
      <div className="sidebar">
        <div className="leaderboard">
          <h3>Leaderboard</h3>
          <ol className="leaderboard-list">
            {leaderboard.map(({user, count}) => (
              <li
                key={user}
                style={user === username ? {
                  borderColor: '#d4a0a0',
                  backgroundColor: '#fdf0f0'
                } : {}}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: serverColors[user] || '#ccc',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }} />
                  <span style={{ fontWeight: 'bold' }}>
                    {user}
                  </span>
                </div>
                <span className="leaderboard-score" style={{ color: '#7a5a5a', fontSize: '0.82rem' }}>{count}</span>
              </li>
            ))}
          </ol>

          {/* Player Stats Section */}
          {playerStats && (
            <div className="player-stats-summary">
              <h3>
                <span className="stats-icon">📊</span> Your Stats
              </h3>
              <div className="stat-summary">
                <div className="stat-item">
                  <span className="stat-label">Games:</span>
                  <span className="stat-value-small">{playerStats.games_played}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Best Score:</span>
                  <span className="stat-value-small">{playerStats.max_score}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Avg Score:</span>
                  <span className="stat-value-small">{Math.round(playerStats.average_score * 10) / 10}</span>
                </div>
              </div>
            </div>
          )}

          {/* Achievements section */}
          <div className="achievements">
            <h3>
              Achievements
              {allAchievementsUnlocked && (
                <span className="trophy" style={{
                  marginLeft: '8px',
                  color: 'gold',
                  fontSize: '1.2em',
                  textShadow: '0 0 5px rgba(255, 215, 0, 0.7)'
                }}>
                  🏆
                </span>
              )}
            </h3>
            <AchievementItem
              achieved={achievements.fiftyPoints}
              text="Achieve 50 Points"
            />
            <AchievementItem
              achieved={achievements.hundredPoints}
              text="Achieve 100 Points"
            />
            <AchievementItem
              achieved={achievements.twoHundredPoints}
              text="Achieve 200 Points"
            />

            {/* Show congratulation message when all achievements are unlocked */}
            {allAchievementsUnlocked && (
              <div
                className="all-achievements-unlocked"
                style={{}}
              >
                All Achievements Unlocked!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameCanvas;

// added ahcievemnets as well