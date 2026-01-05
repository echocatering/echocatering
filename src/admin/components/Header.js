import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Header = () => {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
  };

  return (
    <header className="header">
      <div className="header-left">
      </div>
      
      <div className="header-right">
        <div className="user-menu" onClick={() => setShowUserMenu(!showUserMenu)}>
          <div className="user-avatar">
            {user?.username?.charAt(0).toUpperCase() || 'A'}
          </div>
          <span className="user-name">{user?.username || 'Admin'}</span>
          <span className="user-role">({user?.role || 'admin'})</span>
        </div>
        
        {showUserMenu && (
          <div className="user-dropdown">
            <div className="dropdown-item" onClick={handleLogout}>
              <span>🚪</span>
              <span>Logout</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;


