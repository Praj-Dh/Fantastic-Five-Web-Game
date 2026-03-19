import { useState, useEffect } from 'react';
import axios from 'axios';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';
import GameCanvas from './components/Game/GameCanvas';
import Profile from './components/Profile';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  const [view, setView] = useState("auth"); // "auth" | "game" | "profile"
  const [loading, setLoading] = useState(true);

  // Check if the user is already logged in via session
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await axios.get('/api/auth/check', { withCredentials: true });
        if (response.data.authenticated) {
          setUser({ username: response.data.username });
        }
      } catch (error) {
        console.error('Session check failed:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  const toggleForm = () => {
    setShowLogin(!showLogin);
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch (error) {
      // Proceed with local logout even if the server call fails
      console.warn('Logout API call failed, clearing session locally:', error);
    } finally {
      setUser(null);
      setView('auth');
      setShowLogin(true); // always land on Login tab
    }
  };

  // as soon as we have a user, show the game
  useEffect(() => {
    if (user) {
      setView("game");
    }
  }, [user]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="App">
      {view !== "auth" && (
        <header className="App-header">
          <h1>Paint the Grid</h1>
          {user && (
            <div className="header-user-actions">
              <span className="welcome-text">Greetings, {user.username}</span>
              <button
                onClick={() => setView("profile")}
                style={{
                  backgroundColor: view === 'profile' ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.18)',
                  border: '1.5px solid rgba(255,255,255,0.55)',
                  color: '#fff',
                  boxShadow: 'none'
                }}
              >
                Profile
              </button>
              <button
                onClick={handleLogout}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  border: '1.5px solid rgba(255,255,255,0.55)',
                  color: '#fff',
                  boxShadow: 'none'
                }}
              >
                Logout
              </button>
            </div>
          )}
        </header>
      )}

      <main>
        {/* AUTH */}
        {!user && view === "auth" && (
          <div className="auth-split-layout">
            {/* Left Panel – Game Info */}
            <div className="auth-info-panel">
              <div className="auth-info-content">
                <div className="auth-brand">
                  <span className="auth-brand-icon">🎨</span>
                  <h1 className="auth-brand-name">Paint the Grid</h1>
                </div>
                <p className="auth-tagline">
                  A real-time multiplayer territory game where every move counts.
                </p>

                <div className="auth-description">
                  <p>
                    Compete with players around the world to paint as many cells as
                    possible on a shared 100×100 grid. Dominate the board, climb the
                    leaderboard, and unlock achievements — all in real time.
                  </p>
                </div>

                <div className="auth-how-to-play">
                  <h2>How to Play</h2>
                  <ol className="auth-instructions-list">
                    <li>
                      <span className="step-num">01</span>
                      <span>Create a free account or log in below</span>
                    </li>
                    <li>
                      <span className="step-num">02</span>
                      <span>Use the <strong>arrow keys</strong> to move your player across the grid</span>
                    </li>
                    <li>
                      <span className="step-num">03</span>
                      <span>Every cell you walk on gets painted in <em>your</em> colour</span>
                    </li>
                    <li>
                      <span className="step-num">04</span>
                      <span>Capture the most territory to top the leaderboard</span>
                    </li>
                    <li>
                      <span className="step-num">05</span>
                      <span>Earn achievements by reaching 50, 100 &amp; 200 points</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Right Panel – Auth Form */}
            <div className="auth-form-panel">
              {showLogin ? (
                <>
                  <Login setUser={setUser} />
                  <div className="toggle-auth-prompt">
                    Don't have an account? <button onClick={toggleForm}>Sign Up</button>
                  </div>
                </>
              ) : (
                <>
                  <Signup setUser={setUser} />
                  <div className="toggle-auth-prompt">
                    Already have an account? <button onClick={toggleForm}>Login</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {user && view === "profile" && (
          <Profile
            username={user.username}
            backToGame={() => setView("game")}
          />
        )}

        {/* GAME */}
        {user && view === "game" && (
          <GameCanvas username={user.username} />
        )}
      </main>
    </div>
  );
}

export default App;