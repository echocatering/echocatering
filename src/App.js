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
  
  // Check screen size for responsive design
  useEffect(() => {
    const checkScreenSize = () => {
      // More flexible mobile detection - consider both width and height
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspectRatio = width / height;
      
      // Mobile if width is small OR if it's a tablet/iPad (768px-1024px range)
      const mobile = width <= 1024;
      const smallScreen = width <= 1400;
      console.log('📱 App - Screen width:', width, 'height:', height, 'aspectRatio:', aspectRatio, 'Mobile:', mobile, 'SmallScreen:', smallScreen);
      setIsMobile(mobile);
      setIsSmallScreen(smallScreen);
      if (!mobile) {
        setMobileCurrentPage('home');
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
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
