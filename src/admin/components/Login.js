import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchLogo } from '../../utils/logoUtils';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [destination, setDestination] = useState(null); // 'pos' or 'admin'
  const { login } = useAuth();
  const navigate = useNavigate();

  // Fetch logo on mount
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const logoData = await fetchLogo();
        if (logoData && logoData.content && logoData.content.startsWith('https://res.cloudinary.com/')) {
          setLogoUrl(logoData.content);
        }
      } catch (error) {
        console.error('Error fetching logo:', error);
      }
    };
    loadLogo();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await login(username, password);
      
      if (result.success) {
        // Navigate based on which button was clicked
        if (destination === 'pos') {
          navigate('/admin/pos');
        } else {
          navigate('/admin/');
        }
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const buttonStyle = {
    background: 'transparent',
    border: '2px solid #666666',
    padding: '10px 32px',
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 500,
    fontSize: '14px',
    cursor: 'pointer',
    textTransform: 'uppercase',
    transition: 'all 0.2s ease',
    outline: 'none',
    color: '#666666',
    minWidth: '180px',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(to top, rgba(179, 179, 179, 1) 0%, rgba(185, 185, 185, 1) 8%, rgba(210, 210, 210, 1) 25%, rgba(240, 240, 240, 1) 50%, rgba(255, 255, 255, 1) 70%)',
      padding: '20px',
    }}>
      <div style={{
        background: 'transparent',
        padding: '48px',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
      }}>
        {/* Logo */}
        {logoUrl && (
          <div style={{ marginBottom: '40px' }}>
            <img 
              src={logoUrl} 
              alt="Echo" 
              style={{ height: '80px', width: 'auto' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ marginBottom: '32px' }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}
          
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <input
              type="text"
              id="username"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Username"
              autoComplete="username"
              style={{ textAlign: 'center' }}
            />
          </div>
          
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <input
              type="password"
              id="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Password"
              style={{ textAlign: 'center' }}
            />
          </div>
          
          {/* Two buttons stacked */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '12px', 
            alignItems: 'center',
            marginTop: '16px'
          }}>
            <button
              type="submit"
              disabled={loading}
              onClick={() => setDestination('pos')}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.borderColor = '#000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#666666';
                e.currentTarget.style.borderColor = '#666666';
              }}
            >
              {loading && destination === 'pos' ? 'Loading...' : 'ECHO POS'}
            </button>
            
            <button
              type="submit"
              disabled={loading}
              onClick={() => setDestination('admin')}
              style={buttonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.borderColor = '#000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#666666';
                e.currentTarget.style.borderColor = '#666666';
              }}
            >
              {loading && destination === 'admin' ? 'Loading...' : 'ADMIN PANEL'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;


