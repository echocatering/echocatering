import React, { useState, useEffect, useRef } from 'react';
import dynamicGallery from '../utils/dynamicGallery';
import DynamicLogo from './DynamicLogo';
import { IconComponent } from '../utils/iconData';
import { isCloudinaryUrl, getHeroOptimizedUrl } from '../utils/cloudinaryUtils';

export default function DynamicHero({ logoCanvasRef, setMobileCurrentPage }) {
  const [heroImages, setHeroImages] = useState([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const wmamoContainerRef = useRef(null);
  const logoContainerRef = useRef(null);

  // Manual refresh function for testing
  const manualRefresh = async () => {
    try {
      console.log('🔄 Manual refresh triggered...');
      setIsLoading(true);
      const images = await dynamicGallery.getHeroImages();
      console.log('✅ Manual refresh completed:', images.length, 'images');
      setHeroImages(images);
      setIsLoading(false);
    } catch (error) {
      console.error('❌ Manual refresh failed:', error);
      setIsLoading(false);
    }
  };

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
      const mobile = !isLandscape && (width <= 768 || (width <= 1024 && aspectRatio < 1.2));
      const smallScreen = width <= 1400;
      console.log('📱 Screen width:', width, 'height:', height, 'aspectRatio:', aspectRatio, 'Mobile:', mobile, 'SmallScreen:', smallScreen);
      setIsMobile(mobile);
      setIsSmallScreen(smallScreen);
    };
    
    // Handle resize with full page refresh on orientation or significant size change
    const handleResize = () => {
      // Prevent reload during initial page load (first 2 seconds)
      const timeSinceLoad = Date.now() - loadTime;
      if (timeSinceLoad < 2000) {
        console.log('📱 DynamicHero - Ignoring resize during initial load');
        checkScreenSize();
        return;
      }
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isLandscape = width > height;
      
      // Refresh if orientation changed
      if (isLandscape !== initialIsLandscape) {
        console.log('📱 DynamicHero - Orientation changed - refreshing page');
        window.location.reload();
        return;
      }
      
      // Refresh if significant size change (more than 100px in either dimension)
      const widthChange = Math.abs(width - initialWidth);
      const heightChange = Math.abs(height - initialHeight);
      if (widthChange > 100 || heightChange > 100) {
        console.log('📱 DynamicHero - Significant size change - refreshing page');
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
        console.log('📱 DynamicHero - Ignoring orientation change during initial load');
        checkScreenSize();
        return;
      }
      
      console.log('📱 DynamicHero - Orientation change event - refreshing page');
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



  // Load hero images once
  useEffect(() => {
    const loadImages = async () => {
      try {
        const images = await dynamicGallery.getHeroImages();
        setHeroImages(images);
      } catch (error) {
        console.error('Error loading hero images:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadImages();
  }, []);



  // Auto-cycle through images
  useEffect(() => {
    if (heroImages.length === 0) return;

    console.log('🔄 Starting hero image cycling with', heroImages.length, 'images');
    
    const interval = setInterval(() => {
      if (!isTransitioning) {
        console.log('🔄 Transitioning to next image, current index:', heroIndex);
        setIsTransitioning(true);
        setTimeout(() => {
          setHeroIndex((prev) => {
            const nextIndex = (prev + 1) % heroImages.length;
            console.log('✅ Moved to image index:', nextIndex);
            return nextIndex;
          });
          setIsTransitioning(false);
        }, 600);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [heroImages, isTransitioning, heroIndex]);

  if (isLoading) {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height: '120vh',
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem'
      }}>
        <div>Loading gallery...</div>
        <button 
          onClick={manualRefresh}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
        >
          🔄 Refresh Gallery
        </button>
      </div>
    );
  }

  if (heroImages.length === 0) {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height: '120vh',
        backgroundColor: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>No gallery images found</div>
      </div>
    );
  }

  console.log('🎯 Rendering hero with', heroImages.length, 'images, current index:', heroIndex);
  console.log('📱 isMobile state:', isMobile);
  console.log('🎨 logoCanvasRef:', logoCanvasRef);

  // Mobile Hero Layout
  if (isMobile) {
    console.log('📱 Rendering MOBILE layout');
    return (
      <div style={{
        position: 'relative',
        width: '100vw',
        height: 'calc(100vh * 14 / 16)',
        overflow: 'hidden',
        marginTop: '0',
      }}>
        {/* Stacked hero images */}
        {heroImages.map((image, index) => {
          const isCurrent = index === heroIndex;
          const isNext = index === (heroIndex + 1) % heroImages.length;
          const isPrevious = index === (heroIndex - 1 + heroImages.length) % heroImages.length;
          
          let zIndex = 1;
          let opacity = 0;
          
          if (isCurrent) {
            zIndex = 3;
            opacity = isTransitioning ? 0 : 1;
          } else if (isNext) {
            zIndex = 2;
            opacity = isTransitioning ? 1 : 0;
          } else if (isPrevious) {
            zIndex = 1;
            opacity = 0;
          }
          
          return (
            <div
              key={`${image}-${index}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                backgroundImage: (() => {
                  const imageUrl = image.cloudinaryUrl || image.src || image.imagePath;
                  if (isCloudinaryUrl(imageUrl)) {
                    return `url('${getHeroOptimizedUrl(imageUrl)}')`;
                  }
                  return 'none';
                })(),
                backgroundPosition: 'center',
                backgroundSize: 'cover',
                backgroundRepeat: 'no-repeat',
                opacity: opacity,
                transition: 'opacity 0.6s cubic-bezier(0.4,0,0.2,1)',
                zIndex: zIndex,
              }}
            />
          );
        })}

        {/* Subtle White Vignette Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.1) 60%, rgba(255,255,255,0.15) 100%)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />

        {/* Desktop-style radial gradient background for mobile */}
        {isMobile && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '1200px',
              height: '800px',
              background: 'radial-gradient(ellipse 110% 70% at center, rgba(40, 20, 5, 0.3) 0%, rgba(40, 20, 5, 0.25) 20%, rgba(40, 20, 5, 0.08) 35%, rgba(40, 20, 5, 0.02) 45%, rgba(40, 20, 5, 0.005) 50%, rgba(40, 20, 5, 0.001) 55%, rgba(40, 20, 5, 0.0005) 60%, rgba(40, 20, 5, 0.0001) 65%, rgba(40, 20, 5, 0.00005) 70%, rgba(40, 20, 5, 0) 85%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, black 0%, black 60%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse at center, black 0%, black 60%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          />
        )}

                {/* Logo Container - Flexible container above main container */}
        <div 
          ref={logoContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 7,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 'min(355px, calc(100vh - 560px))',
            height: 'min(355px, calc(100vh - 560px))',
            gap: '0.5rem',
            padding: '15px'
          }}
        >
          <div style={{
              width: 'clamp(180px, 35vw, 280px)',
              height: 'clamp(180px, 35vw, 280px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}>
            <DynamicLogo
              alt="ECHO Catering Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
        </div>

        {/* Main container - wmamo/dropdown at bottom */}
        <div 
          ref={wmamoContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 7,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            width: '100vw',
            height: '100vh'
          }}
        >
          {/* Content layer without mask */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'auto'
          }}>
            {/* Black multiply fade overlay - from right side - behind content */}
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to left, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 50%, rgba(0, 0, 0, 0.8) 65%, rgba(0, 0, 0, 0.5) 75%, rgba(0, 0, 0, 0.2) 85%, rgba(0, 0, 0, 0) 100%)',
              mixBlendMode: 'multiply',
              opacity: 0.9,
              pointerEvents: 'none',
              zIndex: 0
            }} />
            {/* Additional darkening overlay for stronger effect */}
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to left, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.6) 50%, rgba(0, 0, 0, 0.4) 65%, rgba(0, 0, 0, 0.25) 75%, rgba(0, 0, 0, 0.1) 85%, rgba(0, 0, 0, 0) 100%)',
              pointerEvents: 'none',
              zIndex: 0
            }} />
            {/* Wmamo and Dropdown Group */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'absolute',
              bottom: '40px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              zIndex: 2
            }}>
              {/* Originals Icon SVG - positioned above the cocktail SVG */}
                <IconComponent
                  iconName="originals"
                  style={{
                    width: '6vw',
                    minWidth: '40px',
                    maxWidth: '80px',
                    height: 'auto',
                    filter: 'brightness(0) invert(1)',
                    backgroundColor: 'transparent',
                    display: 'block',
                    WebkitBackfaceVisibility: 'hidden',
                    WebkitPerspective: 1000,
                    WebkitTransform: 'translate3d(0, 0, 0)',
                    isolation: 'isolate',
                    position: 'relative',
                    zIndex: 10,
                    marginBottom: '3px'
                  }}
                />
                
                {/* COCKTAILS / Plus / EVENT CATERING grouped */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                width: '95vw',
                marginTop: '10px',
                marginBottom: '0px'
              }}>
                <div
                  style={{
                    fontSize: 'clamp(2.7rem, 6.75vw, 5.25rem)',
                    color: '#ffffff',
                    fontWeight: 400,
                    textAlign: 'center',
                    letterSpacing: '0.12em',
                    backgroundColor: 'transparent',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    lineHeight: '1.2'
                  }}
                >
                  COCKTAILS
                </div>
                <div style={{
                  fontSize: 'clamp(1.2rem, 3.2vw, 2.4rem)',
                  color: '#ffffff',
                  fontWeight: 500,
                  textAlign: 'center',
                  backgroundColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  lineHeight: '1',
                  height: '5px',
                  overflow: 'visible',
                  marginTop: '-16px'
                }}>
                  +
                </div>
                <div style={{
                  fontSize: 'clamp(1.26rem, 3.15vw, 2.45rem)',
                  color: '#ffffff',
                  fontWeight: 400,
                  textAlign: 'center',
                  letterSpacing: '0.12em',
                  backgroundColor: 'transparent',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  lineHeight: '1.2',
                  marginTop: '0px'
                }}>
                  EVENT CATERING
                </div>
              </div>
              
              {/* BOOK NOW Button */}
              <div 
                onClick={() => {
                  if (setMobileCurrentPage) {
                    setMobileCurrentPage('contact');
                  } else {
                    // Fallback for desktop
                    const contactSection = document.getElementById('event-request-section');
                    if (contactSection) {
                      contactSection.scrollIntoView({ behavior: 'smooth' });
                    }
                  }
                }}
                style={{
                  border: '2px solid #ffffff',
                  borderRadius: 0,
                  width: 'clamp(150px, 18vw, 210px)',
                  height: 'clamp(32px, 3.5vh, 48px)',
                  padding: '5px',
                  fontSize: 'clamp(0.7rem, 1.8vh, 1.1rem)',
                  color: '#ffffff',
                  fontWeight: 600,
                  textAlign: 'center',
                  letterSpacing: '0.12em',
                  backgroundColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  marginTop: '20px',
                  transition: 'all 0.2s ease',
                  minHeight: '44px',
                  touchAction: 'manipulation',
                  boxShadow: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  outline: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  zIndex: 10,
                  position: 'relative',
                  pointerEvents: 'auto'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#ffffff';
                  e.target.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#ffffff';
                }}
              >
                BOOK NOW
              </div>
              
            </div>
          </div>

          {/* Dropdown Button Container - Same size as dropdown buttons, positioned on top */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2vh',
            alignItems: 'center',
            zIndex: 8,
            height: '25vh',
            justifyContent: 'center',
            marginTop: '20px',
            padding: '20px',
            marginBottom: '20px',
            position: 'absolute',
            bottom: '84px',
            left: '50%',
            transform: 'translateX(-50%)'
          }}>
            {/* Spherical Shadow Behind Dropdown Button - Only visible when dropdown is open */}
            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                width: '500px',
                height: '500px',
                background: 'radial-gradient(circle 200px at center, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.25) 20%, rgba(0, 0, 0, 0.2) 40%, rgba(0, 0, 0, 0.08) 60%, rgba(0, 0, 0, 0.04) 80%, rgba(0, 0, 0, 0) 100%)',
                borderRadius: '50%',
                zIndex: 1,
                filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5)) drop-shadow(0 16px 32px rgba(0,0,0,0.35)) drop-shadow(0 32px 64px rgba(0,0,0,0.25)) drop-shadow(0 64px 128px rgba(0,0,0,0.15))'
              }} />
            )}
            
            {/* Dropdown Button - Centered in its container */}
            <div
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                opacity: dropdownOpen ? 0 : 1,
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 8
              }}
            >
              <svg
                className="hide-until-mounted"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  width: 'clamp(32px, 8vw, 48px)',
                  height: 'clamp(32px, 8vw, 48px)',
                  display: 'block',
                  color: '#ffffff',
                  filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.85)) drop-shadow(0 16px 32px rgba(0,0,0,0.7))'
                }}
                aria-hidden="true"
                focusable="false"
              >
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Sliding Menu - Fixed size container */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2vh',
            alignItems: 'center',
            transition: 'all 0.4s ease',
            opacity: dropdownOpen ? 1 : 0,
            transform: dropdownOpen ? 'translateY(0)' : 'translateY(-20px)',
            pointerEvents: dropdownOpen ? 'auto' : 'none',
            zIndex: 9,
            height: '25vh',
            width: '25vh',
            justifyContent: 'center',
            marginTop: '20px',
            marginBottom: '20px',
            background: dropdownOpen ? 'radial-gradient(circle 75% at center, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 20%, rgba(0, 0, 0, 0.3) 35%, rgba(0, 0, 0, 0.15) 45%, rgba(0, 0, 0, 0.08) 50%, rgba(0, 0, 0, 0.04) 55%, rgba(0, 0, 0, 0.02) 60%, rgba(0, 0, 0, 0.01) 65%, rgba(0, 0, 0, 0.005) 70%, rgba(0, 0, 0, 0) 75%)' : 'transparent',
            borderRadius: '20px 20px 0 0'
          }}>
            {/* MENU Button */}
            <div style={{
              border: '2px solid #ffffff',
              borderRadius: 0,
              width: 'clamp(150px, 18vw, 210px)',
              height: 'clamp(32px, 3.5vh, 48px)',
              padding: '5px',
              fontSize: 'clamp(0.7rem, 1.8vh, 1.1rem)',
              color: '#ffffff',
              fontWeight: 600,
              textAlign: 'center',
              letterSpacing: '0.12em',
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'all 0.2s ease',
              minHeight: '44px',
              touchAction: 'manipulation',
              textShadow: '0 2px 8px rgba(0,0,0,0.7)',
              boxShadow: 'none',
              WebkitTapHighlightColor: 'transparent',
              outline: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#ffffff';
              e.target.style.color = '#000000';
              e.target.style.borderColor = '#000000';
              e.target.style.textShadow = 'none';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#ffffff';
              e.target.style.borderColor = '#ffffff';
              e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
            }}
            onTouchStart={(e) => {
              e.target.style.backgroundColor = '#ffffff';
              e.target.style.color = '#000000';
              e.target.style.borderColor = '#000000';
              e.target.style.textShadow = 'none';
            }}
            onTouchEnd={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#ffffff';
              e.target.style.borderColor = '#ffffff';
              e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
            }}
            onClick={() => {
              // Navigate to gallery page
              if (setMobileCurrentPage) {
                setMobileCurrentPage('gallery');
              }
            }}
            >
              MENU
            </div>
            
            {/* EVENTS Button */}
            <div 
              onClick={() => {
                if (setMobileCurrentPage) {
                  setMobileCurrentPage('events');
                }
              }}
              style={{
                border: '2px solid #ffffff',
                borderRadius: 0,
                width: 'clamp(150px, 18vw, 210px)',
                height: 'clamp(32px, 3.5vh, 48px)',
                padding: '5px',
                fontSize: 'clamp(0.7rem, 1.8vh, 1.1rem)',
                color: '#ffffff',
                fontWeight: 600,
                textAlign: 'center',
                letterSpacing: '0.12em',
                backgroundColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                transition: 'all 0.2s ease',
                minHeight: '44px',
                touchAction: 'manipulation',
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
                boxShadow: 'none',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none'
              }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#ffffff';
              e.target.style.color = '#000000';
              e.target.style.borderColor = '#000000';
              e.target.style.textShadow = 'none';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#ffffff';
              e.target.style.borderColor = '#ffffff';
              e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
            }}
            onTouchStart={(e) => {
              e.target.style.backgroundColor = '#ffffff';
              e.target.style.color = '#000000';
              e.target.style.borderColor = '#000000';
              e.target.style.textShadow = 'none';
            }}
            onTouchEnd={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#ffffff';
              e.target.style.borderColor = '#ffffff';
              e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
            }}
            >
              EVENTS
            </div>
            
            {/* ABOUT Button */}
            <div 
              onClick={() => {
                if (setMobileCurrentPage) {
                  setMobileCurrentPage('about');
                }
              }}
              style={{
                border: '2px solid #ffffff',
                borderRadius: 0,
                width: 'clamp(150px, 18vw, 210px)',
                height: 'clamp(32px, 3.5vh, 48px)',
                padding: '5px',
                fontSize: 'clamp(0.7rem, 1.8vh, 1.1rem)',
                color: '#ffffff',
                fontWeight: 600,
                textAlign: 'center',
                letterSpacing: '0.12em',
                backgroundColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                transition: 'all 0.2s ease',
                minHeight: '44px',
                touchAction: 'manipulation',
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
                boxShadow: 'none',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.color = '#000000';
                e.target.style.borderColor = '#000000';
                e.target.style.textShadow = 'none';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
                e.target.style.borderColor = '#ffffff';
                e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
              }}
              onTouchStart={(e) => {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.color = '#000000';
                e.target.style.borderColor = '#000000';
                e.target.style.textShadow = 'none';
              }}
              onTouchEnd={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
                e.target.style.borderColor = '#ffffff';
                e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
              }}
            >
              ABOUT
            </div>
            
            <div 
              onClick={() => {
                if (setMobileCurrentPage) {
                  setMobileCurrentPage('contact');
                } else {
                  // Fallback for desktop
                  const contactSection = document.getElementById('event-request-section');
                  if (contactSection) {
                    contactSection.scrollIntoView();
                  }
                }
              }}
              style={{
                border: '2px solid #ffffff',
                borderRadius: 0,
                width: 'clamp(150px, 18vw, 210px)',
                height: 'clamp(32px, 3.5vh, 48px)',
                padding: '5px',
                fontSize: 'clamp(0.7rem, 1.8vh, 1.1rem)',
                color: '#ffffff',
                fontWeight: 600,
                textAlign: 'center',
                letterSpacing: '0.12em',
                backgroundColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                transition: 'all 0.2s ease',
                minHeight: '44px',
                touchAction: 'manipulation',
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
                boxShadow: 'none',
                WebkitTapHighlightColor: 'transparent',
                outline: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.color = '#000000';
                e.target.style.borderColor = '#000000';
                e.target.style.textShadow = 'none';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
                e.target.style.borderColor = '#ffffff';
                e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
              }}
              onTouchStart={(e) => {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.color = '#000000';
                e.target.style.borderColor = '#000000';
                e.target.style.textShadow = 'none';
              }}
              onTouchEnd={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
                e.target.style.borderColor = '#ffffff';
                e.target.style.textShadow = '0 2px 8px rgba(0,0,0,0.7)';
              }}
            >
              INQUIRE
            </div>
          </div>

          {/* Social Media Icons - Now part of the wmamo container */}
          <div style={{
            display: 'flex',
            gap: window.innerWidth > 500 ? '100px' : '50px',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            marginTop: '20px',
            marginBottom: '20px',
            zIndex: 10,
            position: 'relative'
          }}>
            <button style={{
              background: 'none',
              border: 'none',
              padding: '0',
              borderRadius: '50%',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'all 0.2s ease',
              minHeight: '44px',
              minWidth: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }} onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.1)';
            }} onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
            }}>
              <svg
                className="hide-until-mounted"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  width: 'clamp(32px, 8vw, 48px)',
                  height: 'clamp(32px, 8vw, 48px)',
                  display: 'block',
                  color: '#ffffff',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M17.5 6.5h.01"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button style={{
              background: 'none',
              border: 'none',
              padding: '0',
              borderRadius: '50%',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'all 0.2s ease',
              minHeight: '44px',
              minWidth: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }} onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.1)';
            }} onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
            }}>
              <svg
                className="hide-until-mounted"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  width: 'clamp(32px, 8vw, 48px)',
                  height: 'clamp(32px, 8vw, 48px)',
                  display: 'block',
                  color: '#ffffff',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v3H8v3h2v5h3v-5h3l1-3h-4v-3c0-.55.45-1 1-1Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button style={{
              background: 'none',
              border: 'none',
              padding: '0',
              borderRadius: '50%',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'all 0.2s ease',
              minHeight: '44px',
              minWidth: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }} onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.1)';
            }} onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)';
            }}>
              <svg
                className="hide-until-mounted"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  width: 'clamp(32px, 8vw, 48px)',
                  height: 'clamp(32px, 8vw, 48px)',
                  display: 'block',
                  color: '#ffffff',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 2a10 10 0 0 0-3.6 19.33l.95-3.84-.6-2.18c-.2-.78-.2-1.52 0-2.22.6-2.08 2.3-3.55 4.34-3.55 2.39 0 3.64 1.73 3.64 3.81 0 2.93-1.85 5.12-4.6 5.12-.9 0-1.74-.48-2.03-1.04l-.55 2.11c-.2.78-.72 1.76-1.08 2.35.81.25 1.66.38 2.53.38A10 10 0 0 0 12 2Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Brown Gradient Background - Only visible when icons are present */}
        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100vw',
            height: 'clamp(100px, calc(40vh - 100px), 400px)',
            background: 'radial-gradient(ellipse 110% 70% at center, rgba(40, 20, 5, 0.3) 0%, rgba(40, 20, 5, 0.25) 20%, rgba(40, 20, 5, 0.08) 35%, rgba(40, 20, 5, 0.02) 45%, rgba(40, 20, 5, 0.005) 50%, rgba(40, 20, 5, 0.001) 55%, rgba(40, 20, 5, 0.0005) 60%, rgba(40, 20, 5, 0.0001) 65%, rgba(40, 20, 5, 0.00005) 70%, rgba(40, 20, 5, 0) 85%)',
            zIndex: 6,
            pointerEvents: 'none'
          }} />
        )}

        {/* Dark Brown Gradient at Bottom - Matching Desktop */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '120px',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.15) 50%, rgba(0, 0, 0, 0.05) 80%, transparent 100%)',
          zIndex: 4,
          pointerEvents: 'none'
        }} />


      </div>
    );
  }

  // Desktop Hero Layout (existing code)
  console.log('🖥️ Rendering DESKTOP layout');
  const getResponsiveDimensions = () => {
    if (window.innerWidth <= 480) {
      return {
        menuBoxWidth: '150px',
        menuBoxHeight: '35px',
        menuBoxFontSize: '0.8rem',
        triangleLeft: '150px',
        triangleSize: '35px',
        wmamoRight: '1rem',
        wmamoTop: 'calc(50% - 30px)',
        wmamoWidth: '200px',
        eventsWidth: '100px',
        eventsFontSize: '0.8rem',
        eventsPadding: '0.25rem 0',
        eventsBottom: '-35px',
        eventsBorder: '1px solid #ffffff'
      };
    } else if (window.innerWidth <= 600) {
      return {
        menuBoxWidth: '200px',
        menuBoxHeight: '40px',
        menuBoxFontSize: '0.9rem',
        triangleLeft: '200px',
        triangleSize: '40px',
        wmamoRight: '2rem',
        wmamoTop: 'calc(50% - 40px)',
        wmamoWidth: '280px',
        eventsWidth: '120px',
        eventsFontSize: '0.9rem',
        eventsPadding: '0.3rem 0',
        eventsBottom: '-40px',
        eventsBorder: '1px solid #ffffff'
      };
    } else if (window.innerWidth <= 900) {
      return {
        menuBoxWidth: '300px',
        menuBoxHeight: '45px',
        menuBoxFontSize: '1rem',
        triangleLeft: '300px',
        triangleSize: '45px',
        wmamoRight: '4rem',
        wmamoTop: 'calc(50% - 60px)',
        wmamoWidth: '420px',
        eventsWidth: '150px',
        eventsFontSize: '1rem',
        eventsPadding: '0.4rem 0',
        eventsBottom: '-45px',
        eventsBorder: '2px solid #ffffff'
      };
    } else {
      return {
        menuBoxWidth: '400px',
        menuBoxHeight: '50px',
        menuBoxFontSize: '1.1rem',
        triangleLeft: '400px',
        triangleSize: '50px',
        wmamoRight: '8rem',
        wmamoTop: 'calc(50% - 80px)',
        wmamoWidth: '480px',
        eventsWidth: '200px',
        eventsFontSize: '1.1rem',
        eventsPadding: '0.5rem 0',
        eventsBottom: '-50px',
        eventsBorder: '2px solid #ffffff'
      };
    }
  };

  const dimensions = getResponsiveDimensions();

  return (
    <div
      className="homepage-hero"
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh * 14 / 16)',
        overflow: 'hidden',
        marginTop: '0',
      }}
    >
      {/* White triangle box to the left of menu gallery tab - Desktop only */}
      {!isMobile && (
        <div style={{
          position: 'absolute',
          bottom: '-3px',
          right: dimensions.menuBoxWidth,
          width: dimensions.triangleSize,
          height: dimensions.triangleSize,
          backgroundColor: 'white',
          clipPath: 'polygon(100% 0, 0 100%, 100% 100%)',
          zIndex: 20,
        }} />
      )}
      
      {/* White box at bottom right of hero - Desktop only */}
      {!isMobile && (
        <div 
          style={{
            position: 'absolute',
            bottom: '-3px',
            right: 0,
            width: dimensions.menuBoxWidth,
            height: dimensions.menuBoxHeight,
            backgroundColor: 'white',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
            fontSize: dimensions.menuBoxFontSize,
            fontWeight: 400,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            pointerEvents: 'none'
          }}
        >
          <span style={{
            background: 'linear-gradient(to bottom, #555, #ccc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            MENU
          </span>
        </div>
      )}

      {/* Stacked hero images with improved fade system */}
      {heroImages.map((image, index) => {
        const isCurrent = index === heroIndex;
        const isNext = index === (heroIndex + 1) % heroImages.length;
        const isPrevious = index === (heroIndex - 1 + heroImages.length) % heroImages.length;
        
        let zIndex = 1;
        let opacity = 0;
        
        if (isCurrent) {
          zIndex = 3;
          opacity = isTransitioning ? 0 : 1;
        } else if (isNext) {
          zIndex = 2;
          opacity = isTransitioning ? 1 : 0;
        } else if (isPrevious) {
          zIndex = 1;
          opacity = 0;
        }
        
        console.log(`🖼️ Rendering image ${index}: ${image}, current: ${isCurrent}, opacity: ${opacity}, zIndex: ${zIndex}, heroIndex: ${heroIndex}, totalImages: ${heroImages.length}`);
        
        return (
          <div
            key={`${image}-${index}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: (() => {
                const imageUrl = image.cloudinaryUrl || image.src || image.imagePath;
                if (isCloudinaryUrl(imageUrl)) {
                  return `url('${getHeroOptimizedUrl(imageUrl)}')`;
                }
                return 'none';
              })(),
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              opacity: opacity,
              transition: 'opacity 0.6s cubic-bezier(0.4,0,0.2,1)',
              zIndex: zIndex,
              pointerEvents: 'none',
            }}
          />
        );
      })}




      {/* White Gradient Background - Only visible when icons are present - Disabled for PC */}
      {/* {dropdownOpen && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100vw',
          height: 'clamp(100px, calc(40vh - 100px), 400px)',
          background: 'linear-gradient(to top, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 30%, rgba(255,255,255,0.5) 70%, transparent 100%)',
          zIndex: 6,
          pointerEvents: 'none',
          transform: 'translateY(-50%)',
          top: '50%'
        }} />
      )} */}



      {/* Wmamo SVG in upper right quadrant - Mobile responsive */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '75%',
          transform: 'translate(-50%, -50%)',
          zIndex: 7,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      >
        {/* Content layer without mask */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'auto'
        }}>
          {/* Black multiply fade overlay - from right side - behind content */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(to left, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 100%)',
            mixBlendMode: 'multiply',
            opacity: 0.9,
            pointerEvents: 'none',
            zIndex: 0
          }} />
          {/* Additional darkening overlay for stronger effect */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to left, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.6) 50%, rgba(0, 0, 0, 0.4) 65%, rgba(0, 0, 0, 0.25) 75%, rgba(0, 0, 0, 0.1) 85%, rgba(0, 0, 0, 0) 100%)',
            pointerEvents: 'none',
            zIndex: 0
          }} />
        {/* Content wrapper to maintain same visual position */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, calc(-50% - 20px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1200px',
          height: '800px',
          pointerEvents: 'none'
        }}>
        {/* Originals Icon SVG - positioned above the cocktail SVG */}
        <IconComponent
          iconName="originals"
          style={{
            width: '6vw',
            minWidth: '40px',
            maxWidth: '80px',
            height: 'auto',
            filter: 'brightness(0) invert(1)',
            backgroundColor: 'transparent',
            display: 'block',
            WebkitBackfaceVisibility: 'hidden',
            WebkitPerspective: 1000,
            WebkitTransform: 'translate3d(0, 0, 0)',
            isolation: 'isolate',
            position: 'relative',
            zIndex: 2,
            marginBottom: '3px'
          }}
        />
        
        {/* COCKTAILS / Plus / EVENT CATERING grouped - Mobile */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          position: 'relative',
          zIndex: 2,
          marginTop: 'calc(1vh + 4px)'
        }}>
          <div style={{
            fontSize: 'clamp(2.7rem, 6.75vw, 5.25rem)',
            color: '#ffffff',
            fontWeight: 400,
            textAlign: 'center',
            letterSpacing: '0.12em',
            backgroundColor: 'transparent',
            display: 'block',
            whiteSpace: 'nowrap',
            fontFamily: 'Montserrat, \"Helvetica Neue\", Helvetica, Arial, sans-serif',
            lineHeight: '1.2'
          }}>
            COCKTAILS
          </div>
          <div style={{
            fontSize: '3vw',
            color: '#ffffff',
            fontWeight: 400,
            textAlign: 'center',
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Montserrat, \"Helvetica Neue\", Helvetica, Arial, sans-serif',
            lineHeight: '1',
            height: '5px',
            overflow: 'visible',
            marginTop: '-10px'
          }}>
            +
          </div>
          <div style={{
            fontSize: '2.45vw',
            color: '#ffffff',
            fontWeight: 400,
            textAlign: 'center',
            letterSpacing: '0.12em',
            backgroundColor: 'transparent',
            display: 'block',
            whiteSpace: 'nowrap',
            fontFamily: 'Montserrat, \"Helvetica Neue\", Helvetica, Arial, sans-serif',
            lineHeight: '1.2'
          }}>
            EVENT CATERING
          </div>
        </div>
        
        {/* BOOK NOW Button - Desktop */}
        <div 
          onClick={() => {
            if (setMobileCurrentPage) {
              setMobileCurrentPage('contact');
            } else {
              // Fallback for desktop
              const contactSection = document.getElementById('event-request-section');
              if (contactSection) {
                contactSection.scrollIntoView({ behavior: 'smooth' });
              }
            }
          }}
          style={{
            border: '2px solid #ffffff',
            borderRadius: 0,
            width: '200px',
            padding: '0.6rem 0',
            fontSize: '0.8rem',
            color: '#ffffff',
            fontWeight: 600,
            textAlign: 'center',
            letterSpacing: '0.12em',
            backgroundColor: 'transparent',
            display: 'block',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
            marginTop: '40px',
            margin: '40px auto',
            transition: 'all 0.2s ease',
            zIndex: 10,
            position: 'relative',
            pointerEvents: 'auto'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#ffffff';
            e.target.style.color = '#000000';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = 'transparent';
            e.target.style.color = '#ffffff';
          }}
        >
          BOOK NOW
        </div>
        </div>
        </div>

      </div>

      {/* Top-level fade overlay - white with 30% opacity at edges transitioning to 0 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 25%, rgba(255,255,255,0) 75%, rgba(255,255,255,0.2) 100%)',
        pointerEvents: 'none',
        zIndex: 8
      }} />

    </div>
  );
} 