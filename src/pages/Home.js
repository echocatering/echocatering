import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { EchoCocktailSubpage } from './menuGallery2';
import DynamicHero from '../components/DynamicHero';
import DynamicLogo from '../components/DynamicLogo';
import EventGallery from './event_gallery';
import EventRequestForm from './EventRequestForm';
import { fetchMenuGalleryData } from '../utils/menuGalleryApi';
import { getCountryDisplayList } from '../shared/countryUtils';
import { IconComponent } from '../utils/iconData';
import dynamicGallery from '../utils/dynamicGallery';
import { isCloudinaryUrl, getHeroOptimizedUrl, getAboutOptimizedUrl } from '../utils/cloudinaryUtils';




const defaultSubpageOrder = [
  { key: 'cocktails', label: 'Cocktails' },
  { key: 'mocktails', label: 'Mocktails' },
  { key: 'spirits', label: 'Spirits' },
];

function AutoFitTextCard({
  containerStyle,
  title,
  renderTitle,
  content,
  titleStyle,
  bodyStyle,
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [baseFontSizePx, setBaseFontSizePx] = useState(null);
  const [allowScroll, setAllowScroll] = useState(false);

  const fitNow = useCallback(() => {
    const container = containerRef.current;
    const inner = contentRef.current;
    if (!container || !inner) return;

    const minPx = 11;
    const maxPx = 18;
    const containerStyle = window.getComputedStyle(container);
    const paddingTop = parseFloat(containerStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(containerStyle.paddingBottom) || 0;
    const available = container.clientHeight - paddingTop - paddingBottom;
    if (!available) return;

    const original = container.style.fontSize;

    const fitsAt = (px) => {
      container.style.fontSize = `${px}px`;
      return inner.scrollHeight <= available;
    };

    let lo = minPx;
    let hi = maxPx;
    let best = minPx;

    if (!fitsAt(minPx)) {
      setBaseFontSizePx(minPx);
      setAllowScroll(true);
      container.style.fontSize = original;
      return;
    }

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fitsAt(mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    setBaseFontSizePx(best);
    setAllowScroll(false);
    container.style.fontSize = original;
  }, []);

  useLayoutEffect(() => {
    fitNow();
  }, [fitNow, title, content]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      fitNow();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitNow]);

  return (
    <div
      ref={containerRef}
      style={{
        ...containerStyle,
        fontSize: baseFontSizePx ? `${baseFontSizePx}px` : containerStyle?.fontSize,
        overflowY: allowScroll ? 'auto' : 'hidden',
      }}
    >
      <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 'inherit' }}>
        {title ? (
          <h2 style={titleStyle}>
            {typeof renderTitle === 'function' ? renderTitle() : title}
          </h2>
        ) : null}
        {content ? (
          <p style={bodyStyle}>
            {content}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function renderMobileAboutTitle(rawTitle) {
  const text = (rawTitle ?? '').toString().trim();
  if (!text) return null;

  const parts = text
    .match(/[^.]+\.?/g)
    ?.map((p) => p.trim())
    .filter(Boolean);

  if (!parts || parts.length <= 1) return text;

  return parts.map((part, idx) => (
    <React.Fragment key={`${idx}-${part}`}>
      {part}
      {idx < parts.length - 1 ? <br /> : null}
    </React.Fragment>
  ));
}

const Home = forwardRef((props, ref) => {
  const [selected, setSelected] = useState('cocktails');
  const [subpages, setSubpages] = useState({
    cocktails: {
      title: 'Echo Cocktails',
      videoFiles: [],
      cocktailInfo: {}
    },
    mocktails: {
      title: 'Echo Mocktails',
      videoFiles: [],
      cocktailInfo: {}
    },
    spirits: {
      title: 'Echo Spirits',
      videoFiles: [],
      cocktailInfo: {}
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [aboutContent, setAboutContent] = useState({
    storyTitle: '',
    story: '',
    missionTitle: '',
    mission: '',
    teamTitle: '',
    team: '',
    images: {
      story: '',
      mission: '',
      team: ''
    },
    imageVisibility: {
      story: false,
      mission: false,
      team: false
    }
  });

  // Hero slideshow state
  const [heroImages, setHeroImages] = useState([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [isHeroTransitioning, setIsHeroTransitioning] = useState(false);

  // Fetch menu gallery data from API
  useEffect(() => {
    const loadMenuData = async () => {
      try {
        const data = await fetchMenuGalleryData();
        setSubpages(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading menu data:', error);
        setIsLoading(false);
      }
    };

    loadMenuData();
  }, []);

  // Filter subpageOrder based on menuNavEnabled setting from API
  const subpageOrder = useMemo(() => {
    return defaultSubpageOrder.filter(({ key }) => subpages?.[key]?.menuNavEnabled === true);
  }, [subpages]);

  // Update selected category if current selection becomes disabled
  useEffect(() => {
    const enabledKeys = subpageOrder.map(({ key }) => key);
    if (enabledKeys.length && !enabledKeys.includes(selected)) {
      setSelected(enabledKeys[0]);
    }
  }, [subpageOrder, selected]);

  // Load hero images for slideshow
  useEffect(() => {
    const loadHeroImages = async () => {
      try {
        const images = await dynamicGallery.getHeroImages();
        console.log('✅ Hero images loaded:', images);
        setHeroImages(images);
      } catch (error) {
        console.error('❌ Error loading hero images:', error);
      }
    };

    loadHeroImages();
  }, []);

  // Auto-cycle through hero images
  useEffect(() => {
    if (heroImages.length === 0) return;

    const interval = setInterval(() => {
      if (!isHeroTransitioning) {
        setIsHeroTransitioning(true);
        setTimeout(() => {
          setHeroIndex((prev) => (prev + 1) % heroImages.length);
          setIsHeroTransitioning(false);
        }, 600);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [heroImages, isHeroTransitioning]);

  // Fetch about content from API with localStorage fallback
  useEffect(() => {
    const fetchAboutContent = async () => {
      // First, try to load from localStorage
      const cachedContent = localStorage.getItem('aboutContent');
      if (cachedContent) {
        try {
          const parsedContent = JSON.parse(cachedContent);
          console.log('📦 Loaded about content from localStorage:', parsedContent);
          setAboutContent(parsedContent);
        } catch (error) {
          console.error('❌ Error parsing cached about content:', error);
        }
      }

      // Then try to fetch from API to get latest content
      try {
        const response = await fetch('/api/content/about');
        if (response.ok) {
          const data = await response.json();
          console.log('📥 About content received from API:', data);
          setAboutContent(data);
          localStorage.setItem('aboutContent', JSON.stringify(data));
        } else {
          console.log('⚠️ API not available, using cached content');
        }
      } catch (error) {
        console.log('⚠️ Backend not running, using cached content');
      }
    };

    fetchAboutContent();
  }, []);

  // Ensure page background matches about section dark tone
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#111111';
    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  // Build about sections (prefer dynamic sections; fallback to legacy fields)
  const buildAboutSections = () => {
    const apiSections = Array.isArray(aboutContent.sections) ? aboutContent.sections : [];
    const normalized = apiSections.map((sec, idx) => ({
      id: sec.id ?? idx + 1,
      title: sec.title || '',
      content: sec.content || '',
      image: sec.image || '',
      imageVisibility: sec.imageVisibility !== false
    }));
    const visible = normalized.filter(
      (sec) => sec.imageVisibility && (sec.title || sec.content || sec.image)
    );
    if (visible.length > 0) return visible;

    // Legacy fallback
    const legacy = [
      {
        id: 1,
        title: aboutContent.storyTitle,
        content: aboutContent.story,
        image: aboutContent.images?.story,
        imageVisibility: aboutContent.imageVisibility?.story !== false
      },
      {
        id: 2,
        title: aboutContent.missionTitle,
        content: aboutContent.mission,
        image: aboutContent.images?.mission,
        imageVisibility: aboutContent.imageVisibility?.mission !== false
      },
      {
        id: 3,
        title: aboutContent.teamTitle,
        content: aboutContent.team,
        image: aboutContent.images?.team,
        imageVisibility: aboutContent.imageVisibility?.team !== false
      }
    ].filter(sec => sec.imageVisibility && (sec.title || sec.content || sec.image));

    return legacy;
  };

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [rightInfoOpen, setRightInfoOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [sidebarClosing, setSidebarClosing] = useState(false);
  const [isEventGalleryHovered, setIsEventGalleryHovered] = useState(false);
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  const galleryRef = useRef(null);
  const aboutRef = useRef(null);
  const aboutRectangleRef = useRef(null);
  const eventsRef = useRef(null);
  const contactRef = useRef(null);
  const { isMobile, mobileCurrentPage, setMobileCurrentPage, isSmallScreen } = props || {};

  useEffect(() => {
    const updateWidth = () => setWidth(window.innerWidth);
    updateWidth(); // initialize
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Optional dev-only scroll tracing to identify unexpected scroll "jumps".
  // Enable in DevTools with: window.__ECHO_SCROLL_TRACE__ = true
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (typeof window === 'undefined') return;
    if (window.__ECHO_SCROLL_TRACE__ !== true) return;
    if (window.__ECHO_SCROLL_TRACE_PATCHED__ === true) return;

    window.__ECHO_SCROLL_TRACE_PATCHED__ = true;

    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      try {
        // eslint-disable-next-line no-console
        console.log('[scroll trace] window.scrollTo', args, new Error('scrollTo stack').stack);
      } catch (_) {}
      return originalScrollTo(...args);
    };

    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
      try {
        // eslint-disable-next-line no-console
        console.log(
          '[scroll trace] element.scrollIntoView',
          { id: this?.id, className: this?.className, tagName: this?.tagName },
          args,
          new Error('scrollIntoView stack').stack
        );
      } catch (_) {}
      return originalScrollIntoView.apply(this, args);
    };

    return () => {
      // Intentionally do not unpatch: this is an opt-in debug tool that should persist for the session.
    };
  }, []);

  console.log('🏠 Home component - isMobile:', isMobile, 'mobileCurrentPage:', mobileCurrentPage);

  // Close sidebar when navigating away from gallery section
  useEffect(() => {
    // Define gallery section keys
    const galleryKeys = ['cocktails', 'mocktails', 'spirits'];
    
    // If we're not in a gallery section, close the sidebar
    if (!galleryKeys.includes(selected)) {
      setSidebarOpen(false);
    }
  }, [selected]);



  // Handle scroll events to fade out event gallery overlay when scrolling away
  useEffect(() => {
    const handleScroll = () => {
      if (isEventGalleryHovered && eventsRef.current) {
        const rect = eventsRef.current.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        
        // If event gallery is not visible in viewport, fade out overlay
        if (!isVisible) {
          setIsEventGalleryHovered(false);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isEventGalleryHovered]);

  // Handle mobile navigation to events section - align top with bottom of header
  useEffect(() => {
    if (isMobile && mobileCurrentPage === 'events' && eventsRef.current) {
      setTimeout(() => {
        const headerHeight = 80; // Mobile header height
        const elementTop = eventsRef.current.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementTop - headerHeight;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      }, 50);
    }
  }, [isMobile, mobileCurrentPage]);



  // Expose scrollAndActivate, scrollToMenuSection, scrollToAboutSection, and scrollToEventsSection to parent via ref
  useImperativeHandle(ref, () => ({
    scrollAndActivate: (key) => {
      setSelected(key);
      if (isMobile) {
        setMobileCurrentPage('gallery');
      } else {
        setTimeout(() => {
          if (galleryRef.current) {
            galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
      }
    },
    scrollToMenuSection: () => {
      // Set to the first menu item (cocktails) and scroll to gallery
      setSelected('cocktails');
      if (isMobile) {
        setMobileCurrentPage('gallery');
      } else {
        setTimeout(() => {
          if (galleryRef.current) {
            galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
      }
    },
    scrollToEventsSection: () => {
      // Scroll to the events gallery section
      if (isMobile) {
        // For mobile, align top of event gallery with bottom of header (80px)
        setTimeout(() => {
          if (eventsRef.current) {
            const headerHeight = 80; // Mobile header height
            const elementTop = eventsRef.current.getBoundingClientRect().top + window.pageYOffset;
            const offsetPosition = elementTop - headerHeight;
            window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
          }
        }, 50);
      } else {
        // For desktop, align the top of the event gallery outer container with the top of the viewport
        setTimeout(() => {
          if (eventsRef.current) {
            const rect = eventsRef.current.getBoundingClientRect();
            const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
            const elementTop = rect.top + currentScrollY;
            // Scroll so the top of the container aligns exactly with top of viewport
            window.scrollTo({ top: elementTop, behavior: 'smooth' });
          }
        }, 50);
      }
    },
    scrollToAboutSection: () => {
      // Scroll to the bottom edge of the ABOUT rectangle
      if (isMobile) {
        setMobileCurrentPage('about');
      } else {
        setTimeout(() => {
          if (aboutRectangleRef.current) {
            const rect = aboutRectangleRef.current.getBoundingClientRect();
            const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
            const elementBottom = rect.top + currentScrollY + rect.height;
            // Scroll so the bottom edge of the ABOUT rectangle aligns with the top of the viewport
            window.scrollTo({ top: elementBottom, behavior: 'smooth' });
          }
        }, 50);
      }
    },
    scrollToContactSection: () => {
      // Scroll to the contact section
      if (isMobile) {
        setMobileCurrentPage('contact');
      } else {
        setTimeout(() => {
          if (contactRef.current) {
            contactRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 50);
      }
    }
  }));

  // Mobile: Single Scrollable Page with all sections stacked
  if (isMobile) {
    console.log('📱 Rendering MOBILE SINGLE-PAGE layout');
    console.log('📱 isMobile:', isMobile, 'mobileCurrentPage:', mobileCurrentPage);
    return (
      <div style={{ 
        background: '#fff',
        width: '100%',
        overflowX: 'hidden',
        position: 'relative'
      }}>
        {/* Fixed Mobile Header */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '80px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1rem',
          zIndex: 1000
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px'
          }}>
            {/* Logo */}
            <div 
              style={{
                width: '120px',
                height: '60px',
                cursor: 'pointer',
                paddingLeft: '8px'
              }}
              onClick={() => {
                const homeSection = document.getElementById('mobile-home-section');
                if (homeSection) {
                  homeSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            >
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

          {/* Dropdown Menu Button */}
          <div
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              cursor: 'pointer',
              minHeight: '44px',
              minWidth: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg
              className="hide-until-mounted"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                width: '24px',
                height: '24px',
                display: 'block',
                color: 'rgba(0,0,0,0.6)'
              }}
              aria-hidden="true"
              focusable="false"
            >
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Dropdown Menu Overlay */}
        {dropdownOpen && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(15px)',
              WebkitBackdropFilter: 'blur(15px)',
              zIndex: 1001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setDropdownOpen(false)}
          >
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100vh',
              width: '100%',
              position: 'relative'
            }} 
            onClick={(e) => e.stopPropagation()}>
              
              {/* Menu Items Container - Centered */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'clamp(16px, 4vw, 28px)',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
              {/* MENU Button */}
              <div
                onClick={() => {
                  setDropdownOpen(false);
                  const menuSection = document.getElementById('mobile-menu-section');
                  if (menuSection) {
                    // Calculate scroll position to align bottom of section with bottom of screen
                    const rect = menuSection.getBoundingClientRect();
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    const viewportHeight = window.innerHeight;
                    const sectionHeight = rect.height;
                    const targetScroll = scrollTop + rect.top + sectionHeight - viewportHeight;
                    
                    // Force mobile browser UI to hide: scroll slightly more first, then correct
                    // This triggers the address bar to hide on mobile browsers
                    window.scrollBy({ top: 1, behavior: 'auto' });
                    setTimeout(() => {
                      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
                    }, 10);
                  }
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  minHeight: '60px',
                  width: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                MENU
              </div>

              {/* EVENTS Button */}
              <div
                onClick={() => {
                  setDropdownOpen(false);
                  const eventsSection = document.getElementById('mobile-events-section');
                  if (eventsSection) {
                    const headerHeight = 80; // Mobile header height
                    const elementTop = eventsSection.getBoundingClientRect().top + window.pageYOffset;
                    const offsetPosition = elementTop - headerHeight;
                    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                  }
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  minHeight: '60px',
                  width: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                EVENTS
              </div>

              {/* ABOUT Button */}
              <div
                onClick={() => {
                  setDropdownOpen(false);
                  const aboutSection = document.getElementById('mobile-about-section');
                  if (aboutSection) {
                    aboutSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  minHeight: '60px',
                  width: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                ABOUT
              </div>

              {/* CONTACT Button */}
              <div
                onClick={() => {
                  setDropdownOpen(false);
                  const contactSection = document.getElementById('mobile-contact-section');
                  if (contactSection) {
                    contactSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  minHeight: '60px',
                  width: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                INQUIRE
              </div>
              </div>

              {/* Social Media Icons - Positioned at bottom, doesn't affect menu centering */}
              <div style={{
                position: 'absolute',
                bottom: 'clamp(60px, 12vw, 90px)',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '42px',
                justifyContent: 'center',
                paddingTop: 'clamp(24px, 6vw, 32px)',
                borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                width: '100%',
                maxWidth: '300px'
              }}>
                <button className="social-button hide-until-mounted" aria-label="Instagram" style={{
                  background: '#d0d0d0',
                  border: 'none',
                  padding: '0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  minWidth: '36px',
                  minHeight: '36px',
                  boxSizing: 'border-box',
                  WebkitMaskImage: 'url(/assets/socials/instagram.svg)',
                  maskImage: 'url(/assets/socials/instagram.svg)',
                  WebkitMaskSize: '28px 28px',
                  maskSize: '28px 28px',
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
                <button className="social-button hide-until-mounted" aria-label="Facebook" style={{
                  background: '#d0d0d0',
                  border: 'none',
                  padding: '0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  minWidth: '36px',
                  minHeight: '36px',
                  boxSizing: 'border-box',
                  WebkitMaskImage: 'url(/assets/socials/facebook.svg)',
                  maskImage: 'url(/assets/socials/facebook.svg)',
                  WebkitMaskSize: '28px 28px',
                  maskSize: '28px 28px',
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
                <button className="social-button hide-until-mounted" aria-label="Pinterest" style={{
                  background: '#d0d0d0',
                  border: 'none',
                  padding: '0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  minWidth: '36px',
                  minHeight: '36px',
                  boxSizing: 'border-box',
                  WebkitMaskImage: 'url(/assets/socials/pinterest.svg)',
                  maskImage: 'url(/assets/socials/pinterest.svg)',
                  WebkitMaskSize: '28px 28px',
                  maskSize: '28px 28px',
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
            </div>
          </div>
        )}

        {/* Add padding to account for fixed header */}
        <div style={{ paddingTop: '80px' }}>
        {/* SECTION 1: HOME - Hero */}
        <div id="mobile-home-section" style={{ 
          width: '100vw',
          height: 'calc(100vh - 120px)',
          background: '#fff',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          overflow: 'hidden'
        }}>
          {/* Hero Background Images */}
          {heroImages.map((image, index) => {
            const isCurrent = index === heroIndex;
            const isNext = index === (heroIndex + 1) % heroImages.length;
            
            let zIndex = 1;
            let opacity = 0;
            
            if (isCurrent) {
              zIndex = 3;
              opacity = isHeroTransitioning ? 0 : 1;
            } else if (isNext) {
              zIndex = 2;
              opacity = isHeroTransitioning ? 1 : 0;
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
                  width: '100%',
                  height: '100%',
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

          {/* White vignette overlay at edges */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.15) 70%, rgba(255,255,255,0.25) 100%)',
            zIndex: 3,
            pointerEvents: 'none'
          }} />

          {/* Shadow gradient behind text */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '800px',
            height: '600px',
            background: 'radial-gradient(ellipse 110% 70% at center, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 20%, rgba(0, 0, 0, 0.25) 35%, rgba(0, 0, 0, 0.12) 45%, rgba(0, 0, 0, 0.06) 50%, rgba(0, 0, 0, 0.03) 55%, rgba(0, 0, 0, 0.015) 60%, rgba(0, 0, 0, 0.007) 65%, rgba(0, 0, 0, 0.003) 70%, rgba(0, 0, 0, 0) 80%)',
            zIndex: 4,
            pointerEvents: 'none'
          }} />

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
          
          {/* COCKTAILS SVG, Plus, and EVENT CATERING */}
          <div style={{
            textAlign: 'center',
            maxWidth: '90vw',
            position: 'relative',
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0
          }}>
            <div
              style={{
                fontSize: 'clamp(2.25rem, 6vw, 3.75rem)',
                color: '#ffffff',
                fontWeight: 400,
                textAlign: 'center',
                letterSpacing: '0.12em',
                display: 'block',
                whiteSpace: 'nowrap',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                textShadow: '0 4px 8px rgba(0,0,0,0.5)'
              }}
            >
              COCKTAILS
            </div>
            <div style={{
              fontSize: 'clamp(1.2rem, 3.2vw, 2rem)',
              color: '#ffffff',
              fontWeight: 500,
              textAlign: 'center',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              lineHeight: '1',
              textShadow: '0 4px 8px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 'auto',
              marginTop: '-10px'
            }}>
              +
            </div>
            <div style={{
              fontSize: 'clamp(1.05rem, 2.8vw, 1.75rem)',
              color: '#ffffff',
              fontWeight: 400,
              textAlign: 'center',
              letterSpacing: '0.12em',
              display: 'block',
              whiteSpace: 'nowrap',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              lineHeight: '1.2',
              textShadow: '0 4px 8px rgba(0,0,0,0.5)',
              marginTop: '0px'
            }}>
              EVENT CATERING
            </div>

            {/* BOOK NOW Button */}
            <div 
              onClick={() => {
                const contactSection = document.getElementById('mobile-contact-section');
                if (contactSection) {
                  contactSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              style={{
                border: '2px solid #ffffff',
                borderRadius: 0,
                width: 'clamp(150px, 45vw, 200px)',
                padding: '0.6rem 0',
                fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
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
                marginTop: '1.5rem',
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
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
              }}
              onTouchStart={(e) => {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.color = '#000000';
              }}
              onTouchEnd={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
              }}
            >
              BOOK NOW
            </div>
          </div>

        </div>

        {/* SECTION 2: MENU GALLERY - Cocktail Gallery */}
        <div id="mobile-menu-section" ref={galleryRef} style={{ 
          height: '100vh',
          width: '100vw',
          background: '#fff',
          padding: '0',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid #fff'
        }}>
          {/* White to transparent gradient at top */}
          {false && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 'calc(100vh / 4)',
              background: 'linear-gradient(to bottom, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 100%)',
              pointerEvents: 'none',
              zIndex: 5
            }} />
          )}
          {/* White vignette overlay at edges for menu gallery */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.15) 70%, rgba(255,255,255,0.25) 100%)',
            zIndex: 1,
            pointerEvents: 'none'
          }} />
          {/* Cocktail Gallery Content */}
          {isLoading ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              flex: 1,
              fontSize: '1.2rem',
              color: '#666',
              position: 'relative',
              zIndex: 1
            }}>
              Loading menu data...
            </div>
          ) : subpages[selected] ? (
            <div style={{ position: 'relative', zIndex: 1, flex: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
              <EchoCocktailSubpage
                {...subpages[selected]}
                selected={selected}
                setSelected={setSelected}
                subpageOrder={subpageOrder}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                galleryRef={galleryRef}
              />
            </div>
          ) : (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              flex: 1,
              fontSize: '1.2rem',
              color: '#666',
              position: 'relative',
              zIndex: 1
            }}>
              Loading...
            </div>
          )}
        </div>

        {/* SECTION 3: EVENT GALLERY */}
        <div id="mobile-events-section" ref={eventsRef} style={{ 
          minHeight: isMobile ? 'auto' : '100vh',
          background: '#fff',
          padding: '4px 4px 4px 4px',
          position: 'relative'
        }}>
          <EventGallery embedded={true} isMobile={isMobile} isSmallScreen={isSmallScreen} />
        </div>

        {/* SECTION 4: ABOUT */}
        <div id="mobile-about-section" ref={aboutRef} style={{ 
          minHeight: '100vh',
          backgroundColor: '#111111',
          padding: 0,
          position: 'relative'
        }}>
          {/* Darker gradient overlay in the middle - matching desktop */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(17, 17, 17, 0.25) 0%, rgba(17, 17, 17, 0.3) 10%, rgba(17, 17, 17, 0.4) 30%, rgba(17, 17, 17, 0.5) 45%, rgba(17, 17, 17, 0.55) 50%, rgba(17, 17, 17, 0.5) 55%, rgba(17, 17, 17, 0.4) 70%, rgba(17, 17, 17, 0.3) 90%, rgba(17, 17, 17, 0.25) 100%)',
            pointerEvents: 'none',
            zIndex: 0
          }} />
          {/* About Content */}
          <div style={{
            position: 'relative',
            zIndex: 1
          }}>
            {/* Render all sections if provided; fallback to legacy fields */}
            {buildAboutSections().map((section, idx) => {
              const alignRight = idx % 2 === 0;
              const textAlignLeft = idx % 2 === 0;
              const sectionImage = section.image
                ? (isCloudinaryUrl(section.image) ? getAboutOptimizedUrl(section.image) : section.image)
                : '';

              return (
                <div
                  key={`about-section-${section.id || idx}`}
                  style={{
                    position: 'relative',
                    width: '100vw',
                    height: '125vh',
                    overflow: 'hidden',
                    backgroundColor: '#111111'
                  }}
                >
                  {sectionImage && (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: '75vh',
                          backgroundImage: `url(${sectionImage})`,
                          backgroundRepeat: 'no-repeat',
                          backgroundSize: 'auto 100%',
                          backgroundPosition: alignRight ? 'right center' : 'left center',
                          zIndex: 0
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '62.5vh',
                          left: 0,
                          right: 0,
                          height: '12.5vh',
                          background: 'linear-gradient(to bottom, rgba(17,17,17,0) 0%, rgba(17,17,17,0.95) 100%)',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    </>
                  )}

                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: alignRight
                        ? 'linear-gradient(to right, rgba(17,17,17,0.85) 0%, rgba(17,17,17,0.35) 55%, rgba(17,17,17,0) 100%)'
                        : 'linear-gradient(to left, rgba(17,17,17,0.85) 0%, rgba(17,17,17,0.35) 55%, rgba(17,17,17,0) 100%)',
                      pointerEvents: 'none',
                      zIndex: 1
                    }}
                  />

                  <div
                    style={{ display: 'contents' }}
                  >
                    <AutoFitTextCard
                      containerStyle={{
                        position: 'absolute',
                        bottom: '12.5vw',
                        left: textAlignLeft ? 0 : 'auto',
                        right: textAlignLeft ? 'auto' : 0,
                        width: '87.5vw',
                        height: 'min(600px, 70vh)',
                        background: 'rgba(255,255,255,0.9)',
                        padding: 'clamp(1.1rem, 3.2vh, 1.75rem) clamp(1.25rem, 5vw, 2.25rem)',
                        boxShadow: '0 16px 36px rgba(0,0,0,0.2)',
                        borderRadius: '0px',
                        color: '#222',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'clamp(0.55rem, 1.5vh, 0.85rem)',
                        zIndex: 3,
                        boxSizing: 'border-box',
                        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                        fontSize: 'clamp(13px, 1.6vh, 16px)',
                        WebkitOverflowScrolling: 'touch'
                      }}
                      title={section.title}
                      renderTitle={() => renderMobileAboutTitle(section.title)}
                      content={section.content}
                      titleStyle={{
                        color: '#222',
                        margin: 0,
                        fontSize: '1.45em',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%'
                      }}
                      bodyStyle={{
                        color: '#444',
                        margin: 0,
                        lineHeight: 1.6,
                        fontSize: '1em',
                        whiteSpace: 'pre-wrap',
                        overflow: 'hidden',
                        wordWrap: 'break-word',
                        maxWidth: '100%'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 5: REQUEST/INQUIRE */}
        <div id="mobile-contact-section" ref={contactRef} style={{ 
          minHeight: '100vh',
          background: '#fff',
          padding: '2rem 1rem',
          position: 'relative'
        }}>
          {/* Gradient overlay from #d0d0d0 (top) to white (bottom), full opacity */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '100%',
            background: 'linear-gradient(to bottom, #e6e6e6 0%, #ffffff 100%)',
            pointerEvents: 'none',
            zIndex: 0
          }} />
          <div style={{
            maxWidth: '600px',
            margin: '0 auto'
            ,
            position: 'relative',
            zIndex: 1
          }}>
            <EventRequestForm />
          </div>
        </div>
        </div>
      </div>
    );
  }

  // OLD MOBILE CODE - Remove all the individual page conditionals below
  // Mobile Gallery Page (Cocktail Gallery)
  if (false && isMobile && mobileCurrentPage === 'gallery') {
    console.log('🏠 Rendering MOBILE GALLERY page');
    console.log('🏠 isMobile:', isMobile, 'mobileCurrentPage:', mobileCurrentPage);
    return (
      <div style={{ 
        background: '#fff',
        minHeight: 'calc(100vh - 80px)', // Account for fixed header
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'auto'
      }}>
        {/* Mobile Gallery Content */}
        <div style={{
          padding: '1rem',
          background: '#fff',
          minHeight: 'calc(100vh - 120px)', // Account for header height + padding
          marginTop: '120px', // Start below the fixed header
          overflowY: 'auto', // Make it scrollable
          WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
        }}>
          {/* Cocktail Title - Below Top Container - Responsive */}
          {(() => {
            const currentVideo = `cocktail${selected === 'cocktails' ? '2' : selected === 'mocktails' ? '3' : selected === 'spirits' ? '2' : '2'}.mp4`;
            const cocktailData = subpages[selected]?.cocktailInfo?.[currentVideo];
            
            if (cocktailData) {
              return (
                <div style={{
                  position: 'absolute',
                  top: '130px', // 80px for top container height + 30px + 20px additional
                  left: '50%',
                  transform: 'translateX(-50%)',
                  border: '2px solid',
                  borderImage: 'linear-gradient(to bottom, #222, #aaa) 1',
                  borderRadius: 0,
                  width: 'clamp(180px, 50vw, 280px)',
                  padding: 'clamp(0.3rem, 1vw, 0.7rem) 0',
                  fontSize: 'clamp(1.35rem, 3.75vw, 1.95rem)',
                  fontWeight: 400,
                  textAlign: 'center',
                  letterSpacing: '0.12em',
                  background: 'transparent',
                  display: 'inline-block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: '#222',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 10
                }}>
                  {cocktailData.name}
                </div>
              );
            }
            return null;
          })()}



          {/* Navigation Container - Bottom Center - Responsive */}
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10,
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '1rem 0',
            backdropFilter: 'blur(10px)'
          }}>
            {/* Classics Button - Left */}
            <button
              onClick={() => {
                setLeftSidebarOpen(!leftSidebarOpen);
                setRightInfoOpen(false);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid rgba(0,0,0,0.2)',
                cursor: 'pointer',
                padding: '1rem',
                borderRadius: '12px',
                transition: 'all 0.2s ease',
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                marginLeft: '20px'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(255,255,255,0.9)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
            >
              <IconComponent
                iconName="cocktails"
                style={{
                  width: '32px',
                  height: '32px',
                  filter: 'brightness(0) saturate(0) opacity(0.6)'
                }}
              />
            </button>

            {/* Left Arrow Button */}
            <button
              onClick={() => {
                const currentIndex = subpageOrder.findIndex(item => item.key === selected);
                const prevIndex = (currentIndex - 1 + subpageOrder.length) % subpageOrder.length;
                setSelected(subpageOrder[prevIndex].key);
                setRightInfoOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '1rem',
                borderRadius: '50%',
                transition: 'all 0.2s ease',
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'scale(1)';
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Right Arrow Button */}
            <button
              onClick={() => {
                const currentIndex = subpageOrder.findIndex(item => item.key === selected);
                const nextIndex = (currentIndex + 1) % subpageOrder.length;
                setSelected(subpageOrder[nextIndex].key);
                setRightInfoOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '1rem',
                borderRadius: '50%',
                transition: 'all 0.2s ease',
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'scale(1)';
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M9 18L15 12L9 6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Information Button - Opens Info Box */}
            <button
              onClick={() => {
                if (rightInfoOpen) {
                  setRightInfoOpen(false);
                } else {
                  setRightInfoOpen(true);
                }
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid rgba(0,0,0,0.2)',
                cursor: 'pointer',
                padding: '1rem',
                borderRadius: '12px',
                transition: 'all 0.2s ease',
                minHeight: '44px',
                minWidth: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                marginRight: '20px'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(255,255,255,0.9)';
                e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-9h-2V7h2v2z" fill="#666"/>
              </svg>
            </button>
          </div>









          {/* Left Sidebar - Menu Gallery Options */}
          {leftSidebarOpen && (
            <>
              {/* Background overlay to catch clicks outside sidebar */}
              <div 
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 29
                }}
                onClick={() => {
                  setSidebarClosing(true);
                  setTimeout(() => {
                    setLeftSidebarOpen(false);
                    setSidebarClosing(false);
                  }, 300);
                }}
              />
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: '280px',
                background: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(15px)',
                zIndex: 30,
                display: 'flex',
                flexDirection: 'column',
                padding: '2rem 1rem',
                boxShadow: '2px 0 20px rgba(0,0,0,0.1)',
                animation: sidebarClosing ? 'none' : 'slideInLeft 0.3s ease-out',
                transition: 'transform 0.3s ease-out',
                transform: sidebarClosing ? 'translateX(-100%)' : 'translateX(0)',
                maskImage: 'linear-gradient(to right, black 0%, black 85%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, black 0%, black 85%, transparent 100%)'
              }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'clamp(16px, 4vw, 28px)',
                alignItems: 'flex-start',
                justifyContent: 'center',
                height: '100%',
                animation: 'slideInLeft 0.3s ease-out'
              }}>
                <button
                  onClick={(e) => {
                    // Make icon and text black
                    const icon = e.target.querySelector('div'); // IconComponent renders as div
                    const text = e.target.querySelector('span');
                    if (icon) icon.style.filter = 'brightness(0) saturate(0)';
                    if (text) {
                      text.style.background = '#000';
                      text.style.WebkitBackgroundClip = 'text';
                      text.style.WebkitTextFillColor = 'transparent';
                      text.style.backgroundClip = 'text';
                    }
                    
                    // Remove any border that might appear
                    e.target.style.border = '1px solid transparent';
                    
                    // After 200ms, slide left and close
                    setTimeout(() => {
                      setSidebarClosing(true);
                      setTimeout(() => {
                        setSelected('mocktails');
                        setLeftSidebarOpen(false);
                        setSidebarClosing(false);
                      }, 300);
                    }, 200);
                  }}
                  style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    border: '1px solid transparent',
                    boxShadow: 'none',
                    outline: 'none',
                    textAlign: 'left',
                    fontSize: 'clamp(1.1rem, 3vw, 1.6rem)',
                    fontWeight: 400,
                    letterSpacing: '0.12em',
                    padding: 'clamp(0.6rem, 2vw, 0.9rem) clamp(2rem, 6vw, 4rem)',
                    cursor: 'pointer',
                    transition: 'all 0.2s, border 0.2s',
                    appearance: 'none',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    zIndex: 100,
                    position: 'relative',
                    minHeight: '60px',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.2rem'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#222';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid #222';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid transparent';
                  }}
                >
                  <IconComponent
                    iconName="mocktails"
                    style={{
                      width: '64px',
                      height: '64px',
                      filter: 'brightness(0) saturate(0) opacity(0.6)'
                    }}
                  />
                  <span style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>MOCKTAILS</span>
                </button>

                <button
                  onClick={(e) => {
                    // Make icon and text black
                    const icon = e.target.querySelector('div'); // IconComponent renders as div
                    const text = e.target.querySelector('span');
                    if (icon) icon.style.filter = 'brightness(0) saturate(0)';
                    if (text) {
                      text.style.background = '#000';
                      text.style.WebkitBackgroundClip = 'text';
                      text.style.WebkitTextFillColor = 'transparent';
                      text.style.backgroundClip = 'text';
                    }
                    
                    // Remove any border that might appear
                    e.target.style.border = '1px solid transparent';
                    
                    // After 200ms, slide left and close
                    setTimeout(() => {
                      setSidebarClosing(true);
                      setTimeout(() => {
                        setSelected('cocktails');
                        setLeftSidebarOpen(false);
                        setSidebarClosing(false);
                      }, 300);
                    }, 200);
                  }}
                  style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    border: '1px solid transparent',
                    boxShadow: 'none',
                    outline: 'none',
                    textAlign: 'left',
                    fontSize: 'clamp(1.1rem, 3vw, 1.6rem)',
                    fontWeight: 400,
                    letterSpacing: '0.12em',
                    padding: 'clamp(0.6rem, 2vw, 0.9rem) clamp(2rem, 6vw, 4rem)',
                    cursor: 'pointer',
                    transition: 'all 0.2s, border 0.2s',
                    appearance: 'none',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    zIndex: 100,
                    position: 'relative',
                    minHeight: '60px',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.2rem'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#222';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid #222';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid transparent';
                  }}
                >
                  <IconComponent
                    iconName="cocktails"
                    style={{
                      width: '64px',
                      height: '64px',
                      filter: 'brightness(0) saturate(0) opacity(0.6)'
                    }}
                  />
                  <span style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>COCKTAILS</span>
                </button>

                <button
                  onClick={(e) => {
                    // Make icon and text black
                    const icon = e.target.querySelector('div'); // IconComponent renders as div
                    const text = e.target.querySelector('span');
                    if (icon) icon.style.filter = 'brightness(0) saturate(0)';
                    if (text) {
                      text.style.background = '#000';
                      text.style.WebkitBackgroundClip = 'text';
                      text.style.WebkitTextFillColor = 'transparent';
                      text.style.backgroundClip = 'text';
                    }
                    
                    // Remove any border that might appear
                    e.target.style.border = '1px solid transparent';
                    
                    // After 200ms, slide left and close
                    setTimeout(() => {
                      setSidebarClosing(true);
                      setTimeout(() => {
                        setSelected('spirits');
                        setLeftSidebarOpen(false);
                        setSidebarClosing(false);
                      }, 300);
                    }, 200);
                  }}
                  style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    border: '1px solid transparent',
                    boxShadow: 'none',
                    outline: 'none',
                    textAlign: 'left',
                    fontSize: 'clamp(1.1rem, 3vw, 1.6rem)',
                    fontWeight: 400,
                    letterSpacing: '0.12em',
                    padding: 'clamp(0.6rem, 2vw, 0.9rem) clamp(2rem, 6vw, 4rem)',
                    cursor: 'pointer',
                    transition: 'all 0.2s, border 0.2s',
                    appearance: 'none',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    zIndex: 100,
                    position: 'relative',
                    minHeight: '60px',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.2rem'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#222';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid #222';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid transparent';
                  }}
                >
                  <IconComponent
                    iconName="spirits"
                    style={{
                      width: '64px',
                      height: '64px',
                      filter: 'brightness(0) saturate(0) opacity(0.6)'
                    }}
                  />
                  <span style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>SPIRITS</span>
                </button>

              </div>
            </div>
            </>
          )}

          {/* Information Box - Responsive */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: rightInfoOpen ? 'translate(-50%, -50%)' : 'translate(-50%, -50%) scale(0.8)',
            width: 'clamp(320px, 85vw, 440px)',
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(25px)',
            zIndex: rightInfoOpen ? 25 : -1,
            transition: 'all 0.3s ease-out',
            display: 'flex',
            flexDirection: 'column',
            padding: 'clamp(1.5rem, 4vw, 3rem)',
            boxShadow: rightInfoOpen ? '0 8px 32px rgba(0,0,0,0.05)' : 'none',
            borderRadius: 'clamp(16px, 4vw, 24px)',
            maxHeight: '80vh',
            overflow: 'hidden',
            opacity: rightInfoOpen ? 1 : 0,
            pointerEvents: rightInfoOpen ? 'auto' : 'none'
          }}>
            {/* Content */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              padding: '0',
              WebkitOverflowScrolling: 'touch'
            }}>
              {(() => {
                const currentVideo = `cocktail${selected === 'cocktails' ? '2' : selected === 'mocktails' ? '3' : selected === 'spirits' ? '2' : '2'}.mp4`;
                const cocktailData = subpages[selected]?.cocktailInfo?.[currentVideo];
                
                if (cocktailData) {
                  return (
                    <>
                      {/* Left Info Box Content */}
                      <div style={{ paddingLeft: '10px', paddingRight: '10px' }}>
                        <div style={{ textTransform: 'uppercase', fontWeight: 400, color: '#888', fontSize: '1.4rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
                          Ingredients
                        </div>
                        <div style={{ color: '#888', marginBottom: '1.5rem', lineHeight: 1.5, fontSize: '1.15rem' }}>
                          {cocktailData.ingredients}
                        </div>
                      </div>
                      {/* Right Info Box Content */}
                      <div style={{
                        padding: '1rem',
                        marginBottom: '1.5rem'
                      }}>
                        <img 
                          src={cocktailData.mapSnapshot || '/assets/images/worldmap.svg'} 
                          alt='World Map' 
                          style={{ 
                            width: '100%', 
                            height: 'auto',
                            filter: cocktailData.mapSnapshot ? 'none' : 'brightness(0) saturate(0) opacity(0.6)'
                          }} 
                        />
                      </div>
                      {(() => {
                        const countryDisplayList = getCountryDisplayList(cocktailData);
                        if (!countryDisplayList.length) return null;
                        return (
                          <>
                            <div style={{ textTransform: 'uppercase', fontWeight: 400, color: '#888', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                              Countries
                            </div>
                            <div style={{ marginBottom: '1.5rem', color: '#888', display: 'flex', flexDirection: 'column', gap: '0' }}>
                              {countryDisplayList.map((entry) => (
                                <div key={`${entry.code}-${entry.name}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', lineHeight: '1.2' }}>
                                  <span>{entry.name} {entry.code}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                      {cocktailData.concept && (
                        <>
                          <div style={{ textTransform: 'uppercase', fontWeight: 400, color: '#888', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                            Concept
                          </div>
                          <div style={{ marginBottom: '1.5rem', color: '#888', lineHeight: 1.5 }}>
                            {cocktailData.concept}
                          </div>
                        </>
                      )}
                    </>
                  );
                }
                
                return (
                  <>
                    <h3 style={{
                      fontSize: '1.5rem',
                      fontWeight: 600,
                      marginBottom: '1rem',
                      color: '#333',
                      fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
                    }}>
                      About Our Cocktails
                    </h3>
                    <div style={{
                      fontSize: '1rem',
                      lineHeight: '1.6',
                      color: '#666',
                      fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
                    }}>
                      <p style={{ marginBottom: '1rem' }}>
                        Each cocktail is crafted with attention to detail, using only the finest spirits and fresh ingredients.
                      </p>
                      <p style={{ marginBottom: '1rem' }}>
                        Our mixologists bring years of experience and creativity to every drink, ensuring a memorable experience.
                      </p>
                      <p style={{ marginBottom: '1rem' }}>
                        Whether you prefer something classic or adventurous, we have the perfect cocktail for you.
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Menu Buttons Overlay */}
          {dropdownOpen && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255, 255, 255, 0.5)',
              backdropFilter: 'blur(15px)',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }} onClick={() => setDropdownOpen(false)}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'clamp(16px, 4vw, 28px)',
                alignItems: 'center',
                animation: 'slideInRight 0.3s ease-out'
              }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('home');
                }}
                >
                  HOME
                </div>
                
                <div style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('events');
                }}
                >
                  EVENTS
                </div>
                
                <div 
                  onClick={(e) => {
                    e.target.style.background = '#000';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid #000';
                    setDropdownOpen(false);
                    setMobileCurrentPage('about');
                  }}
                  style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    border: '1px solid transparent',
                    borderRadius: 0,
                    boxShadow: 'none',
                    outline: 'none',
                    textAlign: 'center',
                    fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                    fontWeight: 400,
                    letterSpacing: '0.12em',
                    padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                    cursor: 'pointer',
                    transition: 'all 0.2s, border 0.2s',
                    appearance: 'none',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    zIndex: 100,
                    position: 'relative',
                    minHeight: '60px',
                    width: '200px',
                    touchAction: 'manipulation'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#222';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid #222';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid transparent';
                  }}
                >
                  ABOUT
                </div>
                
                <div 
                  onClick={(e) => {
                    e.target.style.background = '#000';
                    e.target.style.WebkitBackgroundClip = 'text';
                    e.target.style.WebkitTextFillColor = 'transparent';
                    e.target.style.backgroundClip = 'text';
                    e.target.style.border = '1px solid #000';
                    setDropdownOpen(false);
                    setMobileCurrentPage('contact');
                  }}
                  style={{
                    background: 'linear-gradient(to bottom, #555, #ccc)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    border: '1px solid transparent',
                    borderRadius: 0,
                    boxShadow: 'none',
                    outline: 'none',
                    textAlign: 'center',
                    fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                    fontWeight: '400',
                    letterSpacing: '0.12em',
                    padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                    cursor: 'pointer',
                    transition: 'all 0.2s, border 0.2s',
                    appearance: 'none',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    zIndex: 100,
                    position: 'relative',
                    minHeight: '60px',
                    width: '200px',
                    touchAction: 'manipulation'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = 'rgba(255,255,255,0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                  }}
                >
                  INQUIRE
                </div>
              </div>
            </div>
          )}

          <div style={{
            maxWidth: '100%',
            margin: '0 auto',
            textAlign: 'center',
            background: '#fff'
          }}>
            {/* Cocktail Video with Title - Centered - Responsive */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: 'clamp(1rem, 4vh, 3rem)',
              marginBottom: 'clamp(1.5rem, 4vw, 3rem)',
              padding: '2rem'
            }}>
              <div style={{ // New container for video positioning
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'absolute',
                top: '120px', // Start below the header
                left: '20px', // Add left margin to prevent cutoff
                right: '20px', // Add right margin to prevent cutoff
                bottom: '120px', // Leave space for bottom navigation
                padding: '1rem'
              }}>
                {/* Video removed - only Cloudinary URLs are supported */}
              </div>
            </div>


          </div>
        </div>
      </div>
    );
  }

  // Mobile About Page (About Section + Footer)
  // OLD MOBILE CODE - Disabled
  if (false && isMobile && mobileCurrentPage === 'about') {
    console.log('🏠 Rendering MOBILE ABOUT page');
    return (
      <div style={{ 
        background: '#fff',
        minHeight: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'auto'
      }}>


        {/* Mobile About Section */}
        <div style={{
          padding: '1rem',
          backgroundColor: '#3a3a3a',
          minHeight: 'calc(100vh - 120px - 200px)', // Account for header height + padding and footer
          marginTop: '120px', // Start below the fixed header (80px + 10px + 30px for content)
          overflowY: 'auto', // Make it scrollable
          WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
          position: 'relative'
        }}>
          {/* Darker gradient overlay in the middle - matching desktop */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.3) 10%, rgba(0, 0, 0, 0.4) 30%, rgba(0, 0, 0, 0.5) 45%, rgba(0, 0, 0, 0.55) 50%, rgba(0, 0, 0, 0.5) 55%, rgba(0, 0, 0, 0.4) 70%, rgba(0, 0, 0, 0.3) 90%, rgba(0, 0, 0, 0.25) 100%)',
            pointerEvents: 'none',
            zIndex: 0
          }} />
          <div style={{
            maxWidth: '100%',
            margin: '0 auto',
            position: 'relative',
            zIndex: 1
          }}>
            {/* Mobile About Content - Text first */}
            {(aboutContent.sections && aboutContent.sections.length > 0
              ? aboutContent.sections
              : [
                  {
                    title: aboutContent.storyTitle,
                    content: aboutContent.story,
                    image: aboutContent.images?.story,
                    imageVisibility: aboutContent.imageVisibility?.story
                  },
                  {
                    title: aboutContent.missionTitle,
                    content: aboutContent.mission,
                    image: aboutContent.images?.mission,
                    imageVisibility: aboutContent.imageVisibility?.mission
                  },
                  {
                    title: aboutContent.teamTitle,
                    content: aboutContent.team,
                    image: aboutContent.images?.team,
                    imageVisibility: aboutContent.imageVisibility?.team
                  }
                ].filter(s => s.title || s.content || s.image)
            ).map((section, idx) => (
              <div key={`about-section-mobile-${idx}`} style={{ marginBottom: '2rem' }}>
                {(section.title || section.content) && (
                  <div style={{
                    textAlign: 'center',
                    marginBottom: '1.5rem'
                  }}>
                    {section.title && (
                      <h2 style={{
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        color: '#ffffff',
                        marginBottom: '1rem',
                        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                        lineHeight: '1.2'
                      }}>
                        {section.title}
                      </h2>
                    )}
                    
                    <div style={{
                      width: '40px',
                      height: '2px',
                      backgroundColor: '#ffffff',
                      margin: '0 auto 1.0rem',
                    }} />
                    
                    {section.content && (
                      <div style={{
                        fontSize: '0.9rem',
                        lineHeight: '1.6',
                        color: '#ffffff',
                        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                        marginBottom: '1rem',
                        textAlign: 'left'
                      }}>
                        {section.content}
                      </div>
                    )}
                  </div>
                )}
                
                {section.image && section.imageVisibility !== false && (
                  <div style={{
                    marginBottom: '2rem',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}>
                    <img
                      src={section.image}
                      alt={section.title || 'About image'}
                      style={{
                        width: '100%',
                        height: '250px',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                    />
                  </div>
                )}
              </div>
            ))}

          </div>
        </div>

        {/* Menu Buttons Overlay - ABOUT PAGE */}
        {dropdownOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(15px)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }} onClick={() => setDropdownOpen(false)}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(16px, 4vw, 28px)',
              alignItems: 'center',
              animation: 'slideInRight 0.3s ease-out'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{
                background: 'linear-gradient(to bottom, #555, #ccc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                border: '1px solid transparent',
                borderRadius: 0,
                boxShadow: 'none',
                outline: 'none',
                textAlign: 'center',
                fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                fontWeight: 400,
                letterSpacing: '0.12em',
                padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                cursor: 'pointer',
                transition: 'all 0.2s, border 0.2s',
                appearance: 'none',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                zIndex: 100,
                position: 'relative',
                minHeight: '60px',
                width: '200px',
                touchAction: 'manipulation'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#222';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #222';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid transparent';
              }}
              onClick={(e) => {
                e.target.style.background = '#000';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #000';
                setDropdownOpen(false);
                setMobileCurrentPage('home');
              }}
              >
                HOME
              </div>
              
              <div style={{
                background: 'linear-gradient(to bottom, #555, #ccc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                border: '1px solid transparent',
                borderRadius: 0,
                boxShadow: 'none',
                outline: 'none',
                textAlign: 'center',
                fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                fontWeight: 400,
                letterSpacing: '0.12em',
                padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                cursor: 'pointer',
                transition: 'all 0.2s, border 0.2s',
                appearance: 'none',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                zIndex: 100,
                position: 'relative',
                minHeight: '60px',
                width: '200px',
                touchAction: 'manipulation'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#222';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #222';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid transparent';
              }}
              onClick={(e) => {
                e.target.style.background = '#000';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #000';
                setDropdownOpen(false);
                setMobileCurrentPage('gallery');
              }}
              >
                MENU
              </div>
              
              <div 
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('events');
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                EVENTS
              </div>
              
              <div 
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('contact');
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: '400',
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(255,255,255,0.9)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                }}
              >
                INQUIRE
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Mobile Contact Page (Event Request Form)
  // OLD MOBILE CODE - Disabled
  if (false && isMobile && mobileCurrentPage === 'contact') {
    console.log('🏠 Rendering MOBILE CONTACT page');
    return (
      <div style={{ 
        background: '#fff',
        minHeight: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'auto'
      }}>


        {/* Mobile Contact Section */}
        <div style={{
          padding: '1rem',
          background: '#fff',
          minHeight: 'calc(100vh - 120px)', // Account for header height + padding
          marginTop: '120px', // Start below the fixed header (80px + 10px + 30px for content)
          overflowY: 'auto', // Make it scrollable
          WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
          width: '100%'
        }}>
          <div style={{
            maxWidth: '100%',
            margin: '0 auto'
          }}>
            {/* Mobile Contact Header */}
            <div style={{
              textAlign: 'center',
              marginBottom: '2rem'
            }}>
              <h2 style={{
                fontSize: '1.9rem',
                fontWeight: 600,
                color: '#222',
                marginBottom: '1rem',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                lineHeight: '1.2'
              }}>
                Begin your experience
              </h2>
              
              <div style={{
                width: '40px',
                height: '2px',
                backgroundColor: '#222',
                margin: '0 auto 1.5rem',
              }} />
              
              <div style={{
                fontSize: '1rem',
                lineHeight: '1.6',
                color: '#333',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                marginBottom: '1rem',
                textAlign: 'left'
              }}>
                Ready to create a memorable gathering? Share a few details about your event, and we’ll get back to you with a personalized plan.
              </div>
              
              <div style={{
                fontSize: '1rem',
                lineHeight: '1.6',
                color: '#333',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                marginBottom: '1rem',
                textAlign: 'left'
              }}>
                Our team will connect with you to explore your vision, curate a beverage experience, and answer any questions — ensuring every detail reflects the story, flavors, and connections you want to share.
              </div>
              <div style={{
                fontSize: '1rem',
                lineHeight: '1.6',
                color: '#333',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                marginBottom: '1rem',
                textAlign: 'left'
              }}>
                Whether it’s a corporate gathering, wedding celebration, or intimate cocktail party, we’ll craft an experience that feels effortless, thoughtful, and unforgettable.
              </div>
            </div>
            
            {/* Mobile Event Request Form */}
            <div style={{
              marginTop: '2rem'
            }}>
              <EventRequestForm />
            </div>
          </div>
        </div>





        {/* Menu Buttons Overlay - CONTACT PAGE */}
        {dropdownOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.5)',
            backdropFilter: 'blur(15px)',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }} onClick={() => setDropdownOpen(false)}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(16px, 4vw, 28px)',
              alignItems: 'center',
              animation: 'slideInRight 0.3s ease-out'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{
                background: 'linear-gradient(to bottom, #555, #ccc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                border: '1px solid transparent',
                borderRadius: 0,
                boxShadow: 'none',
                outline: 'none',
                textAlign: 'center',
                fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                fontWeight: 400,
                letterSpacing: '0.12em',
                padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                cursor: 'pointer',
                transition: 'all 0.2s, border 0.2s',
                appearance: 'none',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                zIndex: 100,
                position: 'relative',
                minHeight: '60px',
                width: '200px',
                touchAction: 'manipulation'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#222';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #222';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid transparent';
              }}
              onClick={(e) => {
                e.target.style.background = '#000';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #000';
                setDropdownOpen(false);
                setMobileCurrentPage('home');
              }}
              >
                HOME
              </div>
              
              <div style={{
                background: 'linear-gradient(to bottom, #555, #ccc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                border: '1px solid transparent',
                borderRadius: 0,
                boxShadow: 'none',
                outline: 'none',
                textAlign: 'center',
                fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                fontWeight: 400,
                letterSpacing: '0.12em',
                padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                cursor: 'pointer',
                transition: 'all 0.2s, border 0.2s',
                appearance: 'none',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                zIndex: 100,
                position: 'relative',
                minHeight: '60px',
                width: '200px',
                touchAction: 'manipulation'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#222';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #222';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid transparent';
              }}
              onClick={(e) => {
                e.target.style.background = '#000';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #000';
                setDropdownOpen(false);
                setMobileCurrentPage('gallery');
              }}
              >
                MENU
              </div>
              
              <div 
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('events');
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                EVENTS
              </div>
              
              <div 
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('about');
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: '400',
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
            >
                INQUIRE
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Mobile Event Gallery Page
  // OLD MOBILE CODE - Disabled
  if (false && isMobile && mobileCurrentPage === 'events') {
    console.log('🏠 Rendering MOBILE EVENT GALLERY page');
    return (
      <div style={{ 
        background: '#fff',
        minHeight: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'auto'
      }}>


        {/* Mobile Event Gallery Section */}
        <div style={{
          padding: '0 4px 0 4px', // No side padding
          background: '#fff',
          minHeight: 'calc(100vh - 80px)', // Account for header height only
          marginTop: '100px', // Start below the fixed header with extra space
          paddingTop: '4px',
          paddingBottom: '4px',
          overflowY: 'visible',
          position: 'relative', // Ensure proper positioning
          zIndex: 1 // Below header z-index
        }}>
          <div style={{
            maxWidth: '100%',
            margin: '0 auto'
          }}>

            
            {/* Mobile Event Gallery Component */}
            <div style={{
              marginTop: '0',
              paddingTop: '0'
            }}>
              <EventGallery embedded={true} isMobile={isMobile} />
            </div>
          </div>
        </div>

        {/* Social Media Icons - Fixed Bottom */}
        <div style={{
          position: 'fixed',
          bottom: '0',
          left: '0',
          right: '0',
          display: 'flex',
          gap: window.innerWidth > 500 ? '100px' : '50px',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '0',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000
        }}>
          <button style={{
            background: 'none',
            border: 'none',
            padding: '0',
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#666',
            transition: 'all 0.2s ease',
          }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}>
            <svg
              className="hide-until-mounted"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '32px', height: '32px', display: 'block', color: 'currentColor' }}
              aria-hidden="true"
              focusable="false"
            >
              <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="2" />
              <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" />
              <path d="M17.5 6.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
          <button style={{
            background: 'none',
            border: 'none',
            padding: '0',
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#666',
            transition: 'all 0.2s ease',
          }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}>
            <svg
              className="hide-until-mounted"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '32px', height: '32px', display: 'block', color: 'currentColor' }}
              aria-hidden="true"
              focusable="false"
            >
              <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v3H8v3h2v5h3v-5h3l1-3h-4v-3c0-.55.45-1 1-1Z" fill="currentColor" />
            </svg>
          </button>
          <button style={{
            background: 'none',
            border: 'none',
            padding: '0',
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#666',
            transition: 'all 0.2s ease',
          }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
          }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}>
            <svg
              className="hide-until-mounted"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '32px', height: '32px', display: 'block', color: 'currentColor' }}
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 2a10 10 0 0 0-3.6 19.33l.95-3.84-.6-2.18c-.2-.78-.2-1.52 0-2.22.6-2.08 2.3-3.55 4.34-3.55 2.39 0 3.64 1.73 3.64 3.81 0 2.93-1.85 5.12-4.6 5.12-.9 0-1.74-.48-2.03-1.04l-.55 2.11c-.2.78-.72 1.76-1.08 2.35.81.25 1.66.38 2.53.38A10 10 0 0 0 12 2Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* Menu Buttons Overlay - EVENT GALLERY PAGE */}
        {dropdownOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(15px)',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }} onClick={() => setDropdownOpen(false)}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(16px, 4vw, 28px)',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'slideInRight 0.3s ease-out',
              minHeight: '100vh',
              width: '100%'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{
                background: 'linear-gradient(to bottom, #555, #ccc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                border: '1px solid transparent',
                borderRadius: 0,
                boxShadow: 'none',
                outline: 'none',
                textAlign: 'center',
                fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                fontWeight: 400,
                letterSpacing: '0.12em',
                padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                cursor: 'pointer',
                transition: 'all 0.2s, border 0.2s',
                appearance: 'none',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                zIndex: 100,
                position: 'relative',
                minHeight: '60px',
                width: '200px',
                touchAction: 'manipulation',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#222';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #222';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid transparent';
              }}
              onClick={(e) => {
                e.target.style.background = '#000';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #000';
                setDropdownOpen(false);
                setMobileCurrentPage('home');
              }}
              >
                HOME
              </div>
              
              <div style={{
                background: 'linear-gradient(to bottom, #555, #ccc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                border: '1px solid transparent',
                borderRadius: 0,
                boxShadow: 'none',
                outline: 'none',
                textAlign: 'center',
                fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                fontWeight: 400,
                letterSpacing: '0.12em',
                padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                cursor: 'pointer',
                transition: 'all 0.2s, border 0.2s',
                appearance: 'none',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                zIndex: 100,
                position: 'relative',
                minHeight: '60px',
                width: '200px',
                touchAction: 'manipulation',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#222';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #222';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid transparent';
              }}
              onClick={(e) => {
                e.target.style.background = '#000';
                e.target.style.WebkitBackgroundClip = 'text';
                e.target.style.WebkitTextFillColor = 'transparent';
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid #000';
                setDropdownOpen(false);
                setMobileCurrentPage('gallery');
              }}
              >
                MENU
              </div>
              
              <div 
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('about');
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: 400,
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                ABOUT
              </div>
              
              <div 
                onClick={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #000';
                  setDropdownOpen(false);
                  setMobileCurrentPage('contact');
                }}
                style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  border: '1px solid transparent',
                  borderRadius: 0,
                  boxShadow: 'none',
                  outline: 'none',
                  textAlign: 'center',
                  fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                  fontWeight: '400',
                  letterSpacing: '0.12em',
                  padding: 'clamp(0.8rem, 2vw, 1.2rem) clamp(2.5rem, 7vw, 5rem)',
                  cursor: 'pointer',
                  transition: 'all 0.2s, border 0.2s',
                  appearance: 'none',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  minHeight: '60px',
                  width: '200px',
                  touchAction: 'manipulation',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.WebkitTextFillColor = 'transparent';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid #222';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'linear-gradient(to bottom, #555, #ccc)';
                  e.target.style.WebkitBackgroundClip = 'text';
                  e.target.style.backgroundClip = 'text';
                  e.target.style.border = '1px solid transparent';
                }}
              >
                INQUIRE
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop Layout (existing code)
  console.log('🏠 Rendering DESKTOP layout');
  return (
    <>
      <DynamicHero />
      
      {/* Global Darkening Overlay - covers everything outside Event Gallery when hovered */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
                  background: 'radial-gradient(ellipse 120% 60% at center, transparent 0%, transparent 45%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.10) 75%, rgba(0,0,0,0.15) 100%)',
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: isEventGalleryHovered ? 1 : 0,
        transition: isEventGalleryHovered ? 'opacity 1s ease-in' : 'opacity 0.2s ease-out'
      }} />
      
      <div style={{ background: '#fff', position: 'relative', zIndex: 0 }}>
        <div ref={galleryRef} style={{ 
          height: 'calc(100vh * 17 / 16)', // Menu gallery - 17/16 screen height
          minHeight: 'calc(100vh * 17 / 16)',
          boxSizing: 'border-box', // Ensure consistent padding calculation
          position: 'relative',
          zIndex: 1
        }}>
          {/* White to transparent gradient at top */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 'calc(100vh / 8)',
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 100%)',
            pointerEvents: 'none',
            zIndex: 5
          }} />
          
          {isLoading ? (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '250px',
              fontSize: '1.2rem',
              color: '#666',
              position: 'relative',
              zIndex: 1
            }}>
              Loading menu data...
            </div>
          ) : subpages[selected] ? (
            <div style={{ position: 'relative', zIndex: 1 }}>
              <EchoCocktailSubpage
                {...subpages[selected]}
                selected={selected}
                setSelected={setSelected}
                subpageOrder={subpageOrder}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                galleryRef={galleryRef}
                outerHeightOverride={!isMobile ? window.innerHeight * 17 / 16 : undefined}
              />
            </div>
          ) : (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '250px',
              fontSize: '1.2rem',
              color: '#666',
              position: 'relative',
              zIndex: 1
            }}>
              Loading...
            </div>
          )}
          

          
          {/* Event Gallery Tab and Triangle - Desktop only */}
          {!isMobile && (
            <>
              {/* Event Gallery Tab */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-3px',
                  left: 0,
                  width: '400px',
                  height: '50px',
                  backgroundColor: 'white',
                  zIndex: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSize: '1rem',
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
                  PHOTOS
                </span>
              </div>
              
              {/* Triangle to the right of Event Gallery tab */}
              <div style={{
                position: 'absolute',
                bottom: '-3px',
                left: '400px',
                width: '50px',
                height: '50px',
                backgroundColor: 'white',
                clipPath: 'polygon(0 0, 0 100%, 100% 100%)',
                zIndex: 20,
              }} />
            </>
          )}
          
          {/* Navigation Elements - Event Gallery Box and Triangle - HIDDEN */}
          {false && !isMobile && (
            <>
              {/* Light grey triangle box to the left (flipped horizontally) */}
              <div style={{
                position: 'absolute',
                bottom: '-3px',
                right: '300px', // Position to the left of the text box
                width: '45px',
                height: '45px',
                backgroundColor: '#ffffff',
                clipPath: 'polygon(100% 0, 0 100%, 100% 100%)', // Flipped horizontally
                zIndex: 20,
              }} />
              
              {/* White box at bottom right */}
              <div style={{
                position: 'absolute',
                bottom: '-3px',
                right: 0,
                width: '400px',
                height: '50px',
                backgroundColor: '#ffffff',
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontSize: '1rem',
                fontWeight: 400,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                cursor: 'pointer'
              }}
              onClick={() => {
                if (eventsRef.current) {
                  eventsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              >
                <span style={{
                  background: 'linear-gradient(to bottom, #555, #ccc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  PHOTOS
                </span>
              </div>
            </>
          )}
        </div>
        
        {/* ===== EVENT GALLERY CONTAINER - This is the main wrapper with white background and grey gradient ===== */}
        {/* Event Gallery Section */}
        <div
          ref={eventsRef}
          style={{
            background: '#fff',
            paddingTop: 'calc(100vh / 16)',
            paddingLeft: 'calc(100vh / 16)',
            paddingRight: 'calc(100vh / 16)',
            paddingBottom: 'calc(100vh / 16)',
            width: '100%',
            height: '100vh',
            minHeight: '100vh',
            boxSizing: 'border-box', // Ensure consistent padding calculation
            position: 'relative',
            border: 'none',

          }}
        >
          {/* Bottom overlay from white (top) to #d0d0d0 (bottom), no opacity */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '100%',
            background: 'linear-gradient(to top, #d0d0d0 0%, #ffffff 100%)',
            pointerEvents: 'none',
            zIndex: 0
          }} />
            {/* Event Gallery Component */}
            <div 
              style={{ 
                background: 'transparent',
                padding: 0
              }}
            >
              <EventGallery 
                embedded={true} 
                isMobile={isMobile}
                isSmallScreen={isSmallScreen}
                onGalleryHoverChange={setIsEventGalleryHovered}
                onArrowClick={() => {
                  // Use the same navigation as the header PHOTOS button
                  if (!isMobile) {
                    // For desktop, align the top of the event gallery outer container with the top of the viewport
                    setTimeout(() => {
                      if (eventsRef.current) {
                        const rect = eventsRef.current.getBoundingClientRect();
                        const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
                        const elementTop = rect.top + currentScrollY;
                        // Scroll so the top of the container aligns exactly with top of viewport
                        window.scrollTo({ top: elementTop, behavior: 'smooth' });
                      }
                    }, 50);
                  } else {
                    // For mobile, align top of event gallery with bottom of header (80px)
                    setTimeout(() => {
                      if (eventsRef.current) {
                        const headerHeight = 80; // Mobile header height
                        const elementTop = eventsRef.current.getBoundingClientRect().top + window.pageYOffset;
                        const offsetPosition = elementTop - headerHeight;
                        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                      }
                    }, 50);
                  }
                }}
              />
            </div>
        </div>
        
        {/* About Section */}
        <div
          ref={aboutRef}
          style={{
            backgroundColor: '#111111',
            padding: '0 2rem 0 2rem',
            width: '100%',
            position: 'relative'
          }}
        >
          {/* Top About bar with transparent rectangle/triangle and white fill to the right */}
          {!isMobile && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                marginLeft: '-50vw',
                width: '100vw',
                height: '45px',
                zIndex: 2,
                pointerEvents: 'none',
                backgroundColor: 'transparent'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'flex-end',
                  width: '100%',
                  height: '100%'
                }}
              >
                {/* White fill for remaining space */}
                <div
                  style={{
                    flex: 1,
                    height: '100%',
                    backgroundColor: '#d0d0d0',
                    clipPath: 'polygon(0 0, 100% 0, calc(100% - 45px) 100%, 0 100%)',
                    overflow: 'hidden',
                    position: 'relative',
                    top: '-1px'
                  }}
                />

                {/* Transparent rectangle with ABOUT text (no angled cut) */}
                <div
                  ref={aboutRectangleRef}
                  style={{
                    width: '400px',
                    height: '45px',
                    backgroundColor: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    fontSize: '1rem',
                    fontWeight: 400,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    border: 'none',
                    boxShadow: 'none',
                    pointerEvents: 'none'
                  }}
                >
                  <span
                    style={{
                      background: 'linear-gradient(to bottom, #eee, #888)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}
                  >
                    ABOUT
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* Darker gradient overlay in the middle */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.3) 10%, rgba(0, 0, 0, 0.4) 30%, rgba(0, 0, 0, 0.5) 45%, rgba(0, 0, 0, 0.55) 50%, rgba(0, 0, 0, 0.5) 55%, rgba(0, 0, 0, 0.4) 70%, rgba(0, 0, 0, 0.3) 90%, rgba(0, 0, 0, 0.25) 100%)',
            pointerEvents: 'none',
            zIndex: 0
          }} />
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
              position: 'relative',
              zIndex: 1,
              paddingBottom: '6.25vh' // 1/16 of viewport height
            }}
          >
            {buildAboutSections().map((section, idx, arr) => {
              const isOdd = (idx + 1) % 2 === 1;
              const isTop = idx === 0;
              const isSecond = idx === 1;
              const isThird = idx === 2;
              const isBottom = idx === arr.length - 1;
              return (
                <div
                  key={`about-desktop-section-${section.id || idx}`}
                  style={{
                    position: 'relative',
                    width: '100vw',
                    left: '50%',
                    right: '50%',
                    marginLeft: '-50vw',
                    marginRight: '-50vw',
                    overflow: 'hidden',
                    backgroundColor: '#111111',
                    marginBottom: 0,
                    marginTop: 0
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16 / 10',
                      overflow: 'hidden',
                      backgroundColor: '#111111',
                      transform: 'none',
                      transformOrigin: 'center center'
                    }}
                  >
                    {(isTop || isThird) && (
                      <>
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '12.5%',
                            background: 'linear-gradient(to bottom, rgba(17,17,17,0.9), rgba(17,17,17,0))',
                            zIndex: 3,
                            pointerEvents: 'none'
                          }}
                        />
                        {isTop && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: '12.5%',
                              background: 'linear-gradient(to top, #111111 0%, rgba(17,17,17,0) 100%)',
                              zIndex: 2,
                              pointerEvents: 'none'
                            }}
                          />
                        )}
                      </>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: (() => {
                          const toRight = 'linear-gradient(to right, rgba(17,17,17,0.85) 0%, rgba(17,17,17,0) 50%)';
                          const toLeft = 'linear-gradient(to left, rgba(17,17,17,0.85) 0%, rgba(17,17,17,0) 50%)';
                          if (isThird) return toLeft; // flip horizontally for section 3
                          return isOdd ? toRight : toLeft;
                        })(),
                        mixBlendMode: 'multiply',
                        pointerEvents: 'none',
                        zIndex: 1,
                        transform: idx === 1 ? 'scale(0.85)' : 'none',
                        transformOrigin: 'center center'
                      }}
                    />
                    {section.image && (
                      <img
                        src={section.image}
                        alt={section.title || 'About'}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          position: 'absolute',
                          inset: 0,
                          transform: idx === 1 ? 'scale(0.85)' : 'none',
                          transformOrigin: 'center center',
                          zIndex: 0,
                          WebkitMaskImage: isTop
                            ? 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)'
                            : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)',
                          maskImage: isTop
                            ? 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)'
                            : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)',
                          WebkitMaskSize: '100% 100%',
                          maskSize: '100% 100%',
                          WebkitMaskRepeat: 'no-repeat',
                          maskRepeat: 'no-repeat'
                        }}
                      />
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: isThird ? '8%' : (isSecond ? '8%' : (isTop ? '8%' : 0)),
                        top: 'auto',
                        transform: 'none',
                        left: isThird ? '55%' : (isSecond ? '55%' : (isTop ? '5%' : (isOdd ? '5%' : '55%'))),
                        right: 'auto',
                        background: 'rgba(255,255,255,0.9)',
                        padding: '1.75rem 2.25rem',
                        width: isTop ? '50%' : (isThird ? '50%' : (isSecond ? '40%' : '40%')),
                        height: isTop ? '50%' : (isThird ? '33%' : (isSecond ? '66%' : '50%')),
                        boxShadow: '0 16px 36px rgba(0,0,0,0.2)',
                        borderRadius: '0px',
                        color: '#222',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem',
                        zIndex: 3,
                        justifyContent: 'center',
                        alignItems: 'stretch',
                        fontSize: isTop ? 'clamp(0.6rem, 1vw, 1rem)' : (isThird ? 'clamp(0.6rem, 1.25vw, 1rem)' : (isSecond ? 'clamp(0.6rem, 1vw, 1rem)' : 'clamp(0.6rem, 1vw, 1rem)')),
                        overflow: isTop ? 'auto' : 'hidden',
                        overflowY: isTop ? 'auto' : 'hidden',
                        boxSizing: 'border-box'
                      }}
                    >
                      {(section.title || section.content) && (
                        <>
                          {section.title && (
                            <h2
                              style={{
                                color: '#222',
                                margin: 0,
                                fontSize: isTop ? 'clamp(0.9rem, 2vw, 2.2rem)' : (isThird ? 'clamp(0.9rem, 2.5vw, 2.2rem)' : (isSecond ? 'clamp(0.9rem, 2vw, 2.2rem)' : 'clamp(0.9rem, 2vw, 2.2rem)')),
                                fontWeight: 600,
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%'
                              }}
                            >
                              {section.title}
                            </h2>
                          )}
                          {section.content && (
                            <p
                              style={{
                                color: '#444',
                                margin: 0,
                                lineHeight: 1.6,
                                fontSize: '1em',
                                whiteSpace: 'pre-wrap',
                                overflow: 'hidden',
                                wordWrap: 'break-word',
                                maxWidth: '100%'
                              }}
                            >
                              {section.content}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Photos-style bar at About bottom */}
        <div style={{ position: 'relative', height: '45px', marginTop: '-45px' }}>
          {!isMobile && (
            <>
              {/* Tab matching request form top gradient color */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-3px',
                  left: 0,
                  width: '400px',
                  height: '50px',
                  backgroundColor: '#e6e6e6',
                  zIndex: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSize: '1rem',
                  fontWeight: 400,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  pointerEvents: 'none'
                }}
              >
                  <span style={{
                    background: 'linear-gradient(to bottom, #222, #666)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>
                  INQUIRE
                </span>
              </div>

              {/* Triangle matching request form top gradient color */}
              <div style={{
                position: 'absolute',
                bottom: '-3px',
                left: '400px',
                width: '50px',
                height: '50px',
                backgroundColor: '#e6e6e6',
                clipPath: 'polygon(0 0, 0 100%, 100% 100%)',
                zIndex: 20,
              }} />
            </>
          )}
        </div>
        
        {/* Event Request Form Section */}
        <div
          ref={contactRef}
          id="event-request-section"
          style={{
            background: '#fff',
            paddingTop: '96px',
            paddingRight: '2rem',
            paddingBottom: isSmallScreen ? '2rem' : '6rem',
            paddingLeft: '2rem',
            width: '100%',
            position: 'relative'
          }}
        >
          {/* Gradient overlay from #d0d0d0 (top) to white (bottom), full opacity */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '100%',
            background: 'linear-gradient(to bottom, #e6e6e6 0%, #ffffff 100%)',
            pointerEvents: 'none',
            zIndex: 0
          }} />
          <div style={{ maxWidth: '1400px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
            {/* Header spanning full width */}
            <div
              style={{
                width: '100%',
                textAlign: 'center',
                marginBottom: isSmallScreen ? '1.5rem' : '2rem',
                paddingLeft: isSmallScreen ? '48px' : '0',
                paddingRight: isSmallScreen ? '48px' : '0'
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <h2
                  style={{
                    fontSize: '3.8rem',
                    fontWeight: 600,
                    color: '#222',
                    marginBottom: '0.5rem',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    lineHeight: '1.2'
                  }}
                >
                  Begin your experience
                </h2>
                <div
                  style={{
                    width: '40px',
                    height: '2px',
                    backgroundColor: '#222',
                    margin: 0
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: isSmallScreen ? '0' : '2.5rem',
                alignItems: 'stretch',
                background: 'transparent',
                position: 'relative'
              }}
            >
              {/* Description column */}
              <div
                style={{
                  padding: '1.25rem',
                  paddingTop: '12px',
                  paddingLeft: isSmallScreen ? '48px' : '0',
                  paddingRight: isSmallScreen ? '48px' : '1.25rem',
                  marginTop: 0,
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  gap: '0.75rem',
                  gridColumn: isSmallScreen ? '1 / -1' : 'span 1',
                  height: '100%'
                }}
              >
                <div
                  style={{
                    fontSize: '1rem',
                    lineHeight: '1.6',
                    color: '#333',
                    fontFamily: 'Montserrat, \"Helvetica Neue\", Helvetica, Arial, sans-serif',
                    textAlign: 'left'
                  }}
                >
                  Ready to create a memorable gathering? Share a few details about your event, and we'll get back to you with a personalized plan.
                </div>
                <div
                  style={{
                    fontSize: '1rem',
                    lineHeight: '1.6',
                    color: '#333',
                    fontFamily: 'Montserrat, \"Helvetica Neue\", Helvetica, Arial, sans-serif',
                    textAlign: 'left'
                  }}
                >
                  Our team will connect with you to explore your vision, curate a beverage experience, and answer any questions — ensuring every detail reflects the story, flavors, and connections you want to share.
                </div>
                <div
                  style={{
                    fontSize: '1rem',
                    lineHeight: '1.6',
                    color: '#333',
                    fontFamily: 'Montserrat, \"Helvetica Neue\", Helvetica, Arial, sans-serif',
                    textAlign: 'left'
                  }}
                >
                  Whether it's a corporate gathering, wedding celebration, or intimate cocktail party, we'll craft an experience that feels effortless, thoughtful, and unforgettable.
                </div>
              </div>
              
              {/* Form spans remaining columns */}
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  background: 'transparent',
                  gridColumn: isSmallScreen ? '1 / -1' : 'span 2'
                }}
              >
                <EventRequestForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export default Home; 