import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import { fetchLogo } from './utils/logoUtils';
import './App.css';

export default function Layout({ 
  navigationItems, 
  setHoveredItem, 
  isMobile,
  mobileCurrentPage,
  setMobileCurrentPage,
  isSmallScreen
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const cocktailsRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false); // Add state for dropdown navigation
  const [logoPath, setLogoPath] = useState(''); // Logo path from API
  // Ref to access Home's scrollAndActivate
  const homeRef = useRef(null);

  // Fetch logo on component mount
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const logoData = await fetchLogo();
        if (logoData && logoData.content) {
          setLogoPath(logoData.content);
        }
      } catch (error) {
        console.error('Error loading logo:', error);
      }
    };
    loadLogo();
  }, []);

  // Use props from App.js for screen size detection
  const finalIsMobile = isMobile;
  const finalMobileCurrentPage = mobileCurrentPage;

  // Helper function to handle navigation and scrolling
  const handleNavigation = (sectionName) => {
    if (location.pathname === '/') {
      // Already on homepage, scroll to section
      if (homeRef.current && homeRef.current[`scrollTo${sectionName}Section`]) {
        homeRef.current[`scrollTo${sectionName}Section`]();
      }
    } else {
      // Navigate to homepage, then scroll to section
      navigate('/');
      setTimeout(() => {
        if (homeRef.current && homeRef.current[`scrollTo${sectionName}Section`]) {
          homeRef.current[`scrollTo${sectionName}Section`]();
        }
      }, 400);
    }
  };



  // Handle clicking outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('[data-dropdown]')) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);



  // Desktop Layout
  const desktopHeaderNav = (
    <>
      <div className="app-container">
        <div className="header-nav-row">
          {/* Left Column - Logo */}
          <div className="logo-container">
            <div className="logo-button" onClick={() => navigate('/') }>
              <img
                src={logoPath}
                alt="ECHO Catering Logo"
                className="logo-image"
                style={{
                  width: 'auto',
                  height: 'calc(100vh / 16)',
                  display: 'block',
                  objectFit: 'contain'
                }}
                onError={(e) => {
                  e.target.src = '';
                }}
              />
            </div>
          </div>

          {/* Social Media Icons - To the right of logo */}
          <div style={{
            display: 'flex',
            gap: '40px',
            alignItems: 'center',
            marginLeft: 'calc((100vh / 16) / 2)',
            alignSelf: 'center'
          }}>
            <button className="social-button" aria-label="Instagram" style={{
              background: '#d0d0d0',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              minWidth: '40px',
              minHeight: '40px',
              boxSizing: 'border-box',
              WebkitMaskImage: 'url(/assets/socials/instagram.svg)',
              maskImage: 'url(/assets/socials/instagram.svg)',
              WebkitMaskSize: '32px 32px',
              maskSize: '32px 32px',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
              transition: 'background 0.2s ease'
            }} onMouseEnter={(e) => {
              e.currentTarget.style.background = '#666666';
            }} onMouseLeave={(e) => {
              e.currentTarget.style.background = '#d0d0d0';
            }}>
            </button>
            <button className="social-button" aria-label="Facebook" style={{
              background: '#d0d0d0',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              minWidth: '40px',
              minHeight: '40px',
              boxSizing: 'border-box',
              WebkitMaskImage: 'url(/assets/socials/facebook.svg)',
              maskImage: 'url(/assets/socials/facebook.svg)',
              WebkitMaskSize: '32px 32px',
              maskSize: '32px 32px',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
              transition: 'background 0.2s ease'
            }} onMouseEnter={(e) => {
              e.currentTarget.style.background = '#666666';
            }} onMouseLeave={(e) => {
              e.currentTarget.style.background = '#d0d0d0';
            }}>
            </button>
            <button className="social-button" aria-label="Pinterest" style={{
              background: '#d0d0d0',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              minWidth: '40px',
              minHeight: '40px',
              boxSizing: 'border-box',
              WebkitMaskImage: 'url(/assets/socials/pinterest.svg)',
              maskImage: 'url(/assets/socials/pinterest.svg)',
              WebkitMaskSize: '32px 32px',
              maskSize: '32px 32px',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
              transition: 'background 0.2s ease'
            }} onMouseEnter={(e) => {
              e.currentTarget.style.background = '#666666';
            }} onMouseLeave={(e) => {
              e.currentTarget.style.background = '#d0d0d0';
            }}>
            </button>
          </div>

          {/* Center Column - Navigation */}
          <nav className="nav-bar nav-bar-no-margin">
            <ul className={`nav-list ${isSmallScreen ? 'nav-list-gap' : 'nav-list-no-gap'}`}>
              {navigationItems.map((item, index) => (
                <li
                  key={index}
                  className="nav-item nav-item-relative"
                >
                  <button
                    className="mainmenu-btn"
                    ref={item.title === 'MENU' ? cocktailsRef : undefined}
                    style={{ fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif' }}
                    onClick={() => {
                      // Immediately reset hover state for all button clicks
                      setHoveredItem(null);
                      
                      // Handle navigation based on button title
                      if (item.title === 'MENU') {
                        handleNavigation('Menu');
                      } else if (item.title === 'PHOTOS') {
                        handleNavigation('Events');
                      } else if (item.title === 'ABOUT') {
                        handleNavigation('About');
                      } else if (item.title === 'INQUIRE') {
                        handleNavigation('Contact');
                      }
                    }}
                  >
                    {'\u00A0'}{item.title}{'\u00A0'}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

    </>
  );

    return (
    <div className="app-root">
      {/* White spacer above header - 1/32 browser height */}
      {!finalIsMobile && (
        <div style={{
          width: '100%',
          height: 'calc(100vh / 32)',
          backgroundColor: '#fff',
          position: 'relative',
          zIndex: 100
        }} />
      )}
      {/* Desktop header - only show on desktop */}
      {!finalIsMobile && desktopHeaderNav}
      
      {/* Dropdown Menu - Rendered at root level for both desktop and mobile */}
      {dropdownOpen && (
        <>
          <div 
            data-dropdown
            className="dropdown-overlay"
            onClick={() => setDropdownOpen(false)}>
            <div className="dropdown-content" onClick={(e) => e.stopPropagation()}>
              
              {/* MENU */}
              <div 
                className="dropdown-button"
                onClick={() => {
                  setDropdownOpen(false);
                  if (finalIsMobile) {
                    setMobileCurrentPage('gallery');
                  } else {
                    navigate('/submenu/echo-originals');
                  }
                }}
              >
                MENU
              </div>
              
              {/* EVENTS */}
              <div 
                className="dropdown-button"
                onClick={() => {
                  setDropdownOpen(false);
                  if (finalIsMobile) {
                    setMobileCurrentPage('events');
                  } else {
                    navigate('/submenu/event-gallery');
                  }
                }}
              >
                EVENTS
              </div>
              
              {/* ABOUT */}
              <div 
                className="dropdown-button"
                onClick={() => {
                  setDropdownOpen(false);
                  if (finalIsMobile) {
                    setMobileCurrentPage('about');
                  } else {
                    navigate('/submenu/about');
                  }
                }}
              >
                ABOUT
              </div>
              
              {/* CONTACT */}
              <div 
                className="dropdown-button"
                onClick={() => {
                  setDropdownOpen(false);
                  if (finalIsMobile) {
                    setMobileCurrentPage('contact');
                  } else {
                    navigate('/submenu/contact');
                  }
                }}
              >
                CONTACT
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Mobile header - hidden for now since we have single-page scrolling */}
      {false && finalIsMobile && finalMobileCurrentPage !== 'home' ? (
        <>
          <div className="mobile-header">
            <button 
              className="mobile-home-button"
              onClick={() => setMobileCurrentPage('home')}
            >
              <img
                src={logoPath}
                alt="ECHO Catering Logo"
                className="mobile-logo-image"
                onError={(e) => {
                  e.target.src = '';
                }}
              />
            </button>
            
            <div 
              data-dropdown
              className="mobile-dropdown-button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <img 
                alt="Menu" 
                src="/assets/icons/dropdown.svg" 
              />
            </div>
          </div>
        </>
      ) : null}

      {/* Mobile: Single scrollable page, no top margin needed */}
      <div className="">
        {/* Mobile: Single page with all content loaded upfront */}
        {finalIsMobile ? (
          <Home 
            ref={homeRef} 
            isMobile={finalIsMobile}
            mobileCurrentPage={finalMobileCurrentPage}
            setMobileCurrentPage={setMobileCurrentPage}
            isSmallScreen={isSmallScreen}
            className="home-component"
          />
        ) : (
          /* Desktop: Keep existing React Router structure */
          location.pathname === '/' ? (
            <Home 
              ref={homeRef} 
              isMobile={finalIsMobile}
              mobileCurrentPage={finalMobileCurrentPage}
              setMobileCurrentPage={setMobileCurrentPage}
              isSmallScreen={isSmallScreen}
              className="home-component"
            />
          ) : (
            <Outlet context={{ cocktailsRef }} />
          )
        )}
      </div>
    </div>
  );
}