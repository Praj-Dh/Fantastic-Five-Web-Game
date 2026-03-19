import { useState, useEffect } from 'react';
import axios from 'axios';

function Signup({ setUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Password validation states using gpt. created all of this.
  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    specialChar: false,
  });

  // Validate password whenever it changes
  useEffect(() => {
    setPasswordChecks({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    });
  }, [password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/auth/signup', {
        username,
        password
      }, {
        withCredentials: true
      });

      setUser({ username });
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper component for validation indicators
  const ValidationIndicator = ({ isValid, text }) => (
    <div style={{ display: 'flex', alignItems: 'center', margin: '0.2rem 0' }}>
      {isValid ? (
        <span style={{ color: 'var(--success-color)', marginRight: '0.5rem', fontWeight: '600' }}>✓</span>
      ) : (
        <span style={{ color: 'var(--danger-color)', marginRight: '0.5rem', fontWeight: '600' }}>✗</span>
      )}
      <span style={{ color: isValid ? 'var(--success-color)' : 'var(--text-muted)', fontSize: '0.88rem' }}>{text}</span>
    </div>
  );

  return (
    <div className="auth-form">
      <h2>Sign Up</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            placeholder="Min 8 chars with uppercase, lowercase & special character"
          />
          <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            <ValidationIndicator
              isValid={passwordChecks.length}
              text="At least 8 characters"
            />
            <ValidationIndicator
              isValid={passwordChecks.uppercase}
              text="At least 1 uppercase letter"
            />
            <ValidationIndicator
              isValid={passwordChecks.lowercase}
              text="At least 1 lowercase letter"
            />
            <ValidationIndicator
              isValid={passwordChecks.specialChar}
              text="At least 1 special character"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading || !Object.values(passwordChecks).every(Boolean)}
          style={{
            marginTop: '1rem',
            opacity: Object.values(passwordChecks).every(Boolean) ? 1 : 0.7
          }}
        >
          {isLoading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>
    </div>
  );
}

// adding some extra features later.
export default Signup;