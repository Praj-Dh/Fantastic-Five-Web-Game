import { useState, useEffect } from 'react';
import axios from 'axios';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';

export default function Profile({ username, backToGame }) {
  const [avatar, setAvatar] = useState(null);
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [playerStats, setPlayerStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile', 'stats', 'leaderboard'

  // for cropping
  const [imageSrc, setImageSrc] = useState(null);
  const [crop,     setCrop]     = useState({ x: 0, y: 0 });
  const [zoom,     setZoom]     = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // load existing avatar
  useEffect(() => {
    axios.get(`/api/auth/profile?username=${username}`, { withCredentials: true })
      .then(r => setAvatar(r.data.avatar))
      .catch(() => {});
  }, [username]);

  // load player stats
  useEffect(() => {
    if (activeTab === 'stats' || activeTab === 'leaderboard') {
      // Get player stats
      axios.get(`/api/game/player-stats?username=${username}`, { withCredentials: true })
        .then(response => {
          setPlayerStats(response.data);
        })
        .catch(error => {
          console.error('Error fetching player stats:', error);
        });
      
      // Get leaderboard
      axios.get('/api/game/leaderboard?limit=10', { withCredentials: true })
        .then(response => {
          setLeaderboard(response.data.leaderboard);
        })
        .catch(error => {
          console.error('Error fetching leaderboard:', error);
        });
    }
  }, [activeTab, username]);

  // on file select
  const handleFile = e => {
    // setMsg('');
    // setFile(e.target.files[0]);
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result);
    reader.readAsDataURL(f);
  };

  const handleUpload = async e => {
    e.preventDefault();
    if (!file) return setMsg("Pick a file first");

    setMsg("Processing…");
    // grab the cropped blob
    const blob = croppedAreaPixels
      ? await getCroppedImg(imageSrc, croppedAreaPixels)
      : file;

    const form = new FormData();
    form.append("username", username);
    // form.append("avatar", file);
    form.append("avatar",  blob, file.name);

    try {
      await axios.post('/api/auth/avatar', form, {
        headers: { 'Content-Type':'multipart/form-data' },
        withCredentials: true
      });
      // refresh preview
      const r = await axios.get(`/api/auth/profile?username=${username}`, { withCredentials: true });
      setAvatar(r.data.avatar);
      setMsg("Uploaded!");
      setImageSrc(null);            // clear out the crop UI
    } catch {
      setMsg("Upload failed");
    }
  };

  return (
    <div className="profile-page">
      <h2>{username}'s Dashboard</h2>
      
      <div className="profile-tabs">
        <button 
          className={activeTab === 'profile' ? 'active' : ''} 
          onClick={() => setActiveTab('profile')}>
          Profile
        </button>
        <button 
          className={activeTab === 'stats' ? 'active' : ''} 
          onClick={() => setActiveTab('stats')}>
          My Stats
        </button>
        <button 
          className={activeTab === 'leaderboard' ? 'active' : ''} 
          onClick={() => setActiveTab('leaderboard')}>
          Leaderboard
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="profile-section">
          <h3>Profile Picture</h3>
          {avatar
            ? <img
                src={avatar}
                alt="Avatar"
                style={{
                  width:128,
                  height:128,
                  objectFit:'cover',
                  // borderRadius:'50%'
                }}
              />
            : <p>No avatar yet</p>
          }

          {/* ==== cropper UI ==== */}
          {imageSrc && (
            <>
              {/* 1) the cropping "viewport" */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',    // or e.g. 300px
                  maxWidth: 300,
                  height: 300,
                  background: '#e8eef5',
                  margin: '1rem auto',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden'
                }}
              >
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                />
              </div>

              {/* 2) a little zoom slider */}
              <div
                  className="zoom-slider"
                  style={{
                    position: 'relative', // establish a new stacking context
                    zIndex: 10, // high enough to sit on top of the cropper
                    margin: '1rem 0',
                    textAlign:'center'
                  }}>
                <label style={{ marginRight: 8 }}>Zoom:</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={e => setZoom(Number(e.target.value))}
                  style={{ position: 'relative', zIndex: 11 }}
                />
              </div>
            </>
          )}

          <form onSubmit={handleUpload}>
            <input
                type="file"
                accept="image/png,image/jpeg"
                onClick={e => e.target.value = null}     // <— clear previous selection
                onChange={handleFile}/>
            <button type="submit">Upload</button>
          </form>
          {msg && <p>{msg}</p>}
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="stats-section">
          <h3>
            <span className="stats-icon">📊</span> Your Game Statistics
          </h3>
          {playerStats ? (
            <div className="stats-container">
              <div className="stat-card">
                <h4>Games Played</h4>
                <p className="stat-value">{playerStats.games_played}</p>
              </div>
              <div className="stat-card">
                <h4>Highest Score</h4>
                <p className="stat-value">{playerStats.max_score}</p>
              </div>
              <div className="stat-card">
                <h4>Lowest Score</h4>
                <p className="stat-value">
                  {playerStats.min_score === Number.POSITIVE_INFINITY ? 0 : playerStats.min_score}
                </p>
              </div>
              <div className="stat-card">
                <h4>Average Score</h4>
                <p className="stat-value">{Math.round(playerStats.average_score * 10) / 10}</p>
              </div>
              <div className="stat-card">
                <h4>Current Score</h4>
                <p className="stat-value">{playerStats.current_score || 0}</p>
              </div>
            </div>
          ) : (
            <p>Loading statistics...</p>
          )}
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className="leaderboard-section">
          <h3>Top Players</h3>
          {leaderboard.length > 0 ? (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Best Score</th>
                  <th>Games Played</th>
                  <th>Avg. Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((player, index) => (
                  <tr key={player.username} className={player.username === username ? 'current-user' : ''}>
                    <td>{index + 1}</td>
                    <td>{player.username}</td>
                    <td>{player.max_score}</td>
                    <td>{player.games_played}</td>
                    <td>{Math.round(player.average_score * 10) / 10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Loading leaderboard...</p>
          )}
        </div>
      )}

      <button onClick={backToGame} className="back-button">Back to Game</button>
    </div>
  );
}