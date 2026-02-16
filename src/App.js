import React, { useState, useEffect } from 'react';
import './App.css';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from './Layout';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import PlaceholderPage from './pages/PlaceholderPage';
import MenuGallery from './pages/menuGallery2';
import EventGallery from './pages/event_gallery';
import VideoEdgeTest from './pages/VideoEdgeTest';
import CloudinaryTest from './pages/CloudinaryTest';

// Admin Panel Components
import AdminApp from './admin/App';

function slugToTitle(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Move SubmenuPage OUTSIDE App so it is not recreated on every render
function SubmenuPage({ isMobile }) {
  const location = useLocation();
  const match = location.pathname.match(/^\/submenu\/([^/]+)$/);
  const slug = match ? match[1] : '';
  // Only log when the slug actually changes
  if (slug !== SubmenuPage.lastSlug) {
    console.log('SubmenuPage called with pathname:', location.pathname, 'slug:', slug);
    SubmenuPage.lastSlug = slug;
  }
  if (slug === 'echo-originals') {
    return <MenuGallery />;
  }
  if (slug === "event-gallery") {
    return <EventGallery isMobile={isMobile} />;
  }
  if (slug === "about") {
    return <About />;
  }
  if (slug === "contact") {
    return <Contact />;
  }
  return <PlaceholderPage title={slugToTitle(slug)} />;
}



function App() {
  const [hoveredItem, setHoveredItem] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileCurrentPage, setMobileCurrentPage] = useState('home');
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.add('app-mounted');
    return () => {
      document.documentElement.classList.remove('app-mounted');
    };
  }, []);
  
  // Check screen size for responsive design
  useEffect(() => {
    // Store initial dimensions to detect changes
    const initialWidth = window.innerWidth;
    const initialHeight = window.innerHeight;
    const initialIsLandscape = initialWidth > initialHeight;
    const loadTime = Date.now();
    
    const checkScreenSize = () => {
      // More flexible mobile detection - consider both width and height
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspectRatio = width / height;
      
      // Mobile if width is small AND in portrait orientation (height > width)
      // Landscape mode (width > height) always uses desktop layout
      const isLandscape = width > height;
      const mobile = !isLandscape && width <= 1024;
      const smallScreen = width <= 1400;
      console.log('📱 App - Screen width:', width, 'height:', height, 'aspectRatio:', aspectRatio, 'Mobile:', mobile, 'SmallScreen:', smallScreen);
      setIsMobile(mobile);
      setIsSmallScreen(smallScreen);
      if (!mobile) {
        setMobileCurrentPage('home');
      }
    };
    
    // Handle resize with full page refresh on orientation or significant size change
    const handleResize = () => {
      // Prevent reload during initial page load (first 2 seconds)
      const timeSinceLoad = Date.now() - loadTime;
      if (timeSinceLoad < 2000) {
        console.log('📱 Ignoring resize during initial load');
        checkScreenSize();
        return;
      }
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isLandscape = width > height;
      
      // Refresh if orientation changed
      if (isLandscape !== initialIsLandscape) {
        console.log('📱 Orientation changed - refreshing page');
        window.location.reload();
        return;
      }
      
      // Refresh if significant size change (more than 100px in either dimension)
      const widthChange = Math.abs(width - initialWidth);
      const heightChange = Math.abs(height - initialHeight);
      if (widthChange > 100 || heightChange > 100) {
        console.log('📱 Significant size change - refreshing page');
        window.location.reload();
        return;
      }
      
      // Otherwise just update state
      checkScreenSize();
    };
    
    // Handle orientation change
    const handleOrientationChange = () => {
      // Prevent reload during initial page load (first 2 seconds)
      const timeSinceLoad = Date.now() - loadTime;
      if (timeSinceLoad < 2000) {
        console.log('📱 Ignoring orientation change during initial load');
        checkScreenSize();
        return;
      }
      
      console.log('📱 Orientation change event - refreshing page');
      window.location.reload();
    };
    
    checkScreenSize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);



  const navigationItems = [
    {
      title: 'MENU',
      submenu: []
    },
    {
      title: 'PHOTOS',
      submenu: []
    },
    {
      title: 'ABOUT',
      submenu: []
    },
    {
      title: 'INQUIRE',
      submenu: []
    }
  ];



  // Always check for admin routes first, regardless of screen size
  return (
    <Routes>
      {/* Admin Panel Routes - Always accessible */}
      <Route path="admin/*" element={<AdminApp />} />
      
      {/* Test Routes */}
      <Route path="test/video-edge" element={<VideoEdgeTest />} />
      <Route path="cloudinary-test" element={<CloudinaryTest />} />
      
      {/* Main Website Routes */}
      {isMobile ? (
        <Route path="*" element={
          <Layout 
            navigationItems={navigationItems} 
            hoveredItem={hoveredItem} 
            setHoveredItem={setHoveredItem} 
            isMobile={isMobile}
            mobileCurrentPage={mobileCurrentPage}
            setMobileCurrentPage={setMobileCurrentPage}
            isSmallScreen={isSmallScreen}
          />
        } />
      ) : (
        <Route element={<Layout navigationItems={navigationItems} hoveredItem={hoveredItem} setHoveredItem={setHoveredItem} isSmallScreen={isSmallScreen} /> }>
          <Route index element={<Home />} />
          <Route path="submenu/:slug" element={<SubmenuPage isMobile={isMobile} />} />
        </Route>
      )}
    </Routes>
  );
}

export default App;
