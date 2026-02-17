import React, { useEffect } from 'react';
import MenuGallery2 from './menuGallery2';

const Menu = () => {
  useEffect(() => {
    // Lock screen orientation to portrait on mobile devices
    if (window.screen?.orientation?.lock) {
      window.screen.orientation.lock('portrait').catch((err) => {
        console.log('Orientation lock not supported:', err);
      });
    }

    // Cleanup: unlock orientation when component unmounts
    return () => {
      if (window.screen?.orientation?.unlock) {
        window.screen.orientation.unlock();
      }
    };
  }, []);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      <MenuGallery2 
        viewMode="web"
        orientationOverride="vertical"
      />
    </div>
  );
};

export default Menu;
