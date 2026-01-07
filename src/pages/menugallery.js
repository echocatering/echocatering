import React, { useRef, useEffect, useState } from 'react';
import { IconComponent } from '../utils/iconData';
import { getCountryDisplayList } from '../shared/countryUtils';
import { fetchMenuGalleryData } from '../utils/menuGalleryApi';
import { isCloudinaryUrl } from '../utils/cloudinaryUtils';

function EchoCocktailSubpage({ videoFiles = [], cocktailInfo = {}, title = '', selected, setSelected, subpageOrder, sidebarOpen, setSidebarOpen, galleryRef }) {
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isMidDesktop, setIsMidDesktop] = useState(false);
  const [responsivePadding, setResponsivePadding] = useState(32);
  const [responsiveButtonMarginLeft, setResponsiveButtonMarginLeft] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const reflectionCanvasRef = useRef(null);
  const sidebarRef = useRef(null);
  const titleRef = useRef(null);
  const animationTimeoutsRef = useRef([]); // Store timeout IDs for cleanup
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeStage, setFadeStage] = useState('in'); // 'in', 'out', 'idle'
  const [pendingIndex, setPendingIndex] = useState(null);
  const [pendingPage, setPendingPage] = useState(null);
  const [boxesVisible, setBoxesVisible] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [isScheduleButtonHovered, setIsScheduleButtonHovered] = useState(false);
  
  // Individual animation states for staggered animations
  const [titleVisible, setTitleVisible] = useState(false);
  const [ingredientsVisible, setIngredientsVisible] = useState(false);
  const [garnishVisible, setGarnishVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [countriesVisible, setCountriesVisible] = useState([]); // Array of booleans for each country
  const [conceptVisible, setConceptVisible] = useState(false);
  const [isSquareVideo, setIsSquareVideo] = useState(false);
  const [isTitleTwoLines, setIsTitleTwoLines] = useState(false);
  const [showConceptInfo, setShowConceptInfo] = useState(false);

  // Check screen size for responsive gallery boxes
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsSmallScreen(width <= 1400);
      // Mobile layout: phones (<=768px) and tablets/iPads (768px-1024px)
      setIsMobileView(width <= 1024);
      const isMid = width > 1024 && width <= 1400;
      setIsMidDesktop(isMid);
      
      // Calculate responsive padding
      if (isMid) {
        const minWidth = 1025;
        const maxWidth = 1400;
        const minPadding = 32;
        const maxPadding = 140;
        const ratio = (width - minWidth) / (maxWidth - minWidth);
        const padding = minPadding + (maxPadding - minPadding) * ratio;
        setResponsivePadding(Math.round(padding));
      } else {
        setResponsivePadding(32);
      }
      
      // Calculate responsive button left margin
      if (width > 1400) {
        // Large screens: margin from 80px to 0px (as screen gets larger)
        const minWidth = 1401;
        const maxWidth = 2560; // Common max desktop width
        const minMargin = 80;
        const maxMargin = 0;
        const ratio = Math.min(1, Math.max(0, (width - minWidth) / (maxWidth - minWidth)));
        const margin = minMargin + (maxMargin - minMargin) * ratio;
        setResponsiveButtonMarginLeft(Math.round(margin));
      } else if (width >= 1024 && width <= 1400) {
        // Small/medium screens: margin from 500px to 300px (as screen gets larger)
        const minWidth = 1024;
        const maxWidth = 1400;
        const startMargin = 500; // At 1024px
        const endMargin = 300; // At 1400px
        const ratio = (width - minWidth) / (maxWidth - minWidth);
        const margin = startMargin + (endMargin - startMargin) * ratio;
        setResponsiveButtonMarginLeft(Math.round(margin));
      } else {
        setResponsiveButtonMarginLeft(0);
      }
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Effect to detect if title is on two lines
  useEffect(() => {
    const checkTitleLines = () => {
      if (!titleRef.current || !titleVisible) return;
      
      // Wait for title to be fully rendered
      setTimeout(() => {
        if (!titleRef.current) return;
        
        const titleElement = titleRef.current;
        const lineHeight = parseFloat(window.getComputedStyle(titleElement).lineHeight);
        const height = titleElement.offsetHeight;
        
        // If height is more than 1.5x the line height, it's likely on two lines
        // Account for padding by checking if height exceeds single line significantly
        const isTwoLines = height > lineHeight * 1.5;
        setIsTitleTwoLines(isTwoLines);
      }, 100);
    };
    
    checkTitleLines();
    
    // Also check on window resize
    window.addEventListener('resize', checkTitleLines);
    
    return () => window.removeEventListener('resize', checkTitleLines);
  }, [titleVisible, title, isSmallScreen]);

  // Effect to update video dimensions when screen size changes
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;
    
    const aspectRatio = video.videoWidth / video.videoHeight;
    const isSquare = Math.abs(aspectRatio - 1.0) < 0.05; // Check if 1:1 (within 5% tolerance)
    setIsSquareVideo(isSquare);
    
    // Update canvas dimensions immediately when screen size changes
    if (isMobileView) {
      // Use video container dimensions: 3/4 of section height, 100vw width
      const sectionHeight = window.innerHeight - 80;
      const containerHeight = (sectionHeight * 3) / 4; // 3fr out of 4fr total
      const containerWidth = window.innerWidth;
      
      // Cover behavior: fill container while maintaining aspect ratio
      const containerAspectRatio = containerWidth / containerHeight;
      if (aspectRatio > containerAspectRatio) {
        // Wider than container, fit to height and crop sides
        canvas.height = containerHeight;
        canvas.width = containerHeight * aspectRatio;
      } else {
        // Taller than container, fit to width and crop top/bottom
        canvas.width = containerWidth;
        canvas.height = containerWidth / aspectRatio;
      }
    } else if (isMidDesktop) {
      // Container dimensions: 459px width, 833px height
      if (isSquare) {
        // For square videos, scale to fit within container
        const maxSize = Math.min(459, 833);
        canvas.width = maxSize;
        canvas.height = maxSize;
      } else {
        // Scale down to 85% for mid-desktop
        canvas.width = video.videoWidth * 0.85;
        canvas.height = video.videoHeight * 0.85;
      }
    } else {
      // Container dimensions: 540px width, 980px height
      if (isSquare) {
        // For square videos, scale to fit within container
        const maxSize = Math.min(540, 980);
        canvas.width = maxSize;
        canvas.height = maxSize;
      } else {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }
  }, [isMobileView, isMidDesktop, currentIndex, videoFiles]);

  // Effect for video drawing (match Home.js)
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const reflectionCanvas = reflectionCanvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    const reflectionCtx = reflectionCanvas ? reflectionCanvas.getContext('2d') : null;

    let animationFrameId;
          const draw = () => {
        if (video.readyState === 4) {
          // Set canvas dimensions based on screen size while maintaining aspect ratio
          const aspectRatio = video.videoWidth / video.videoHeight;
          const isSquare = Math.abs(aspectRatio - 1.0) < 0.05; // Check if 1:1 (within 5% tolerance)
          
          if (isMobileView) {
            // For mobile, make video height 50% of screen height
            const screenHeight = window.innerHeight;
            const targetHeight = screenHeight * 0.5;
            
            if (isSquare) {
              // For square videos, scale to fit within container
              const containerWidth = window.innerWidth - 64; // Account for padding
              const maxSize = Math.min(targetHeight, containerWidth);
              canvas.width = maxSize;
              canvas.height = maxSize;
            } else {
              // Calculate width based on target height and aspect ratio
              const scaledHeight = targetHeight;
              const scaledWidth = targetHeight * aspectRatio;
              
              canvas.width = scaledWidth;
              canvas.height = scaledHeight;
            }
          } else if (isMidDesktop) {
            // Container dimensions: 459px width, 833px height
            if (isSquare) {
              // For square videos, scale to fit within container
              const maxSize = Math.min(459, 833);
              canvas.width = maxSize;
              canvas.height = maxSize;
            } else {
              // For mid-desktop, scale to 85%
              canvas.width = video.videoWidth * 0.85;
              canvas.height = video.videoHeight * 0.85;
            }
          } else {
            // Container dimensions: 540px width, 980px height
            if (isSquare) {
              // For square videos, scale to fit within container
              const maxSize = Math.min(540, 980);
              canvas.width = maxSize;
              canvas.height = maxSize;
            } else {
              // For large screens, use full video dimensions
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
          }
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const offsetY = isMobileView ? 0 : (isMidDesktop ? -32 : -40); // Lock top on mobile
          ctx.drawImage(video, 0, offsetY, canvas.width, canvas.height);
        // Chroma key effect - remove white and light grey background
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Make only very light greys transparent (less aggressive)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // If all RGB values are above 240 and similar to each other (only very light)
          if (r > 240 && g > 240 && b > 240 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10) {
            data[i + 3] = 0; // Set alpha to 0
          }
        }
        
        // Add two-stage fade: gentle pre-fade then aggressive main fade
        const preFadeStartRatio = 0.75; // Gentle fade starts at 75%
        const mainFadeStartRatio = 0.85; // Aggressive fade starts at 85%
        const preFadeStart = canvas.height * preFadeStartRatio;
        const mainFadeStart = canvas.height * mainFadeStartRatio;
        
        for (let y = 0; y < canvas.height; y++) {
          let fadeAmount = 1.0;
          
          if (y > preFadeStart && y <= mainFadeStart) {
            // Gentle pre-fade (75% to 85%) - smooth transition
            const preFadeProgress = (y - preFadeStart) / (mainFadeStart - preFadeStart);
            fadeAmount = 1 - (preFadeProgress * 0.5); // Fade to 50% opacity
          } else if (y > mainFadeStart) {
            // Aggressive main fade (85% to 100%) - nearly instant from 50% to 0%
            const mainFadeProgress = (y - mainFadeStart) / (canvas.height - mainFadeStart);
            fadeAmount = 0.5 * (1 - Math.pow(mainFadeProgress, 0.08)); // Start from 50%, fade to 0
          }
          
          if (fadeAmount < 1.0) {
            // Apply fade to each pixel in this row
            for (let x = 0; x < canvas.width; x++) {
              const i = (y * canvas.width + x) * 4;
              data[i + 3] = data[i + 3] * fadeAmount;
            }
          }
        }
        
        // Removed dark boost/contrast adjustment - videos now display with original contrast
        
        ctx.putImageData(imageData, 0, 0);

        // Draw reflection canvas (upside down, black and white, low contrast)
        if (reflectionCanvas && reflectionCtx) {
          // Set reflection canvas to half the height (bottom half only)
          reflectionCanvas.width = canvas.width;
          reflectionCanvas.height = canvas.height / 2;
          
          // Clear reflection canvas
          reflectionCtx.clearRect(0, 0, reflectionCanvas.width, reflectionCanvas.height);
          
          // Draw the bottom half of the main canvas (which already has processed video)
          const sourceY = canvas.height / 2; // Start from middle (bottom half)
          const sourceHeight = canvas.height / 2; // Only half the height
          
          // Save context for transformations
          reflectionCtx.save();
          
          // Flip vertically by scaling and translating
          reflectionCtx.translate(0, reflectionCanvas.height);
          reflectionCtx.scale(1, -1);
          
          // Draw the bottom half of the canvas, flipped
          reflectionCtx.drawImage(
            canvas, // Draw from the processed canvas
            0, // sourceX
            sourceY, // sourceY - start from middle (bottom half)
            canvas.width, // sourceWidth
            sourceHeight, // sourceHeight - only half
            0, // destX
            0, // destY
            reflectionCanvas.width, // destWidth
            reflectionCanvas.height // destHeight
          );
          
          // Restore context
          reflectionCtx.restore();
          
          // Get image data for processing
          const reflectionImageData = reflectionCtx.getImageData(0, 0, reflectionCanvas.width, reflectionCanvas.height);
          const reflectionData = reflectionImageData.data;
          
          // Apply chroma key (same as main canvas)
          for (let i = 0; i < reflectionData.length; i += 4) {
            const r = reflectionData[i];
            const g = reflectionData[i + 1];
            const b = reflectionData[i + 2];
            
            if (r > 240 && g > 240 && b > 240 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && Math.abs(r - b) < 10) {
              reflectionData[i + 3] = 0;
            }
          }
          
          // Convert to grayscale and apply low contrast
          for (let i = 0; i < reflectionData.length; i += 4) {
            // Convert to grayscale
            const gray = reflectionData[i] * 0.299 + reflectionData[i + 1] * 0.587 + reflectionData[i + 2] * 0.114;
            
            // Apply low contrast (reduce contrast significantly)
            const contrast = 0.3; // Low contrast (0.0 = no contrast, 1.0 = full contrast)
            const adjustedGray = ((gray - 128) * contrast) + 128;
            
            // Clamp values
            const clampedGray = Math.max(0, Math.min(255, adjustedGray));
            
            reflectionData[i] = clampedGray;     // R
            reflectionData[i + 1] = clampedGray; // G
            reflectionData[i + 2] = clampedGray; // B
            // Alpha stays the same
          }
          
          // Apply transparency gradient from 80% at top to 0% at bottom
          const maxOpacity = 0.8; // 80% opacity at top
          const minOpacity = 0.0; // 0% opacity at bottom
          
          for (let y = 0; y < reflectionCanvas.height; y++) {
            // Calculate opacity gradient: 80% at top (y=0) to 0% at bottom (y=height)
            const progress = y / reflectionCanvas.height; // 0 at top, 1 at bottom
            const opacity = maxOpacity * (1 - progress); // Linear gradient from 0.8 to 0
            
            // Apply opacity to each pixel in this row
            for (let x = 0; x < reflectionCanvas.width; x++) {
              const i = (y * reflectionCanvas.width + x) * 4;
              reflectionData[i + 3] = reflectionData[i + 3] * opacity;
            }
          }
          
          reflectionCtx.putImageData(reflectionImageData, 0, 0);
        }
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentIndex, videoFiles, isMobileView, isMidDesktop]);

  // Reset all animation states
  const resetAnimations = () => {
    setTitleVisible(false);
    setIngredientsVisible(false);
    setGarnishVisible(false);
    setMapVisible(false);
    setCountriesVisible([]);
    setConceptVisible(false);
  };

  // Scroll to menu gallery section - align bottom of section with bottom of screen
  const scrollToGallery = () => {
    setTimeout(() => {
      if (galleryRef && galleryRef.current) {
        galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 50);
  };

  // Fade logic for cocktail change
  const handlePrev = (e) => {
    e.currentTarget.blur();
    const newIndex = (currentIndex - 1 + videoFiles.length) % videoFiles.length;
    resetAnimations();
    setBoxesVisible(false);
    setFadeStage('out');
    setPendingIndex(newIndex);
    // Close sidebar when clicking arrow buttons
    setSidebarOpen(false);
    // Reset to ingredients/garnish view
    setShowConceptInfo(false);
    // Scroll to gallery section
    scrollToGallery();
  };
  const handleNext = (e) => {
    e.currentTarget.blur();
    const newIndex = (currentIndex + 1) % videoFiles.length;
    resetAnimations();
    setBoxesVisible(false);
    setFadeStage('out');
    setPendingIndex(newIndex);
    // Close sidebar when clicking arrow buttons
    setSidebarOpen(false);
    // Reset to ingredients/garnish view
    setShowConceptInfo(false);
    // Scroll to gallery section
    scrollToGallery();
  };

  // Fade logic for sidebar page change
  const handleSidebarNav = (key) => {
    if (key !== selected) {
      resetAnimations();
      setBoxesVisible(false);
      setFadeStage('out');
      setPendingPage(key);
      // Reset to ingredients/garnish view
      setShowConceptInfo(false);
    }
    // Keep sidebar open when navigating between gallery icons
    // Only close when navigating away from gallery section (handled in parent component)
  };

  // Force sidebar to stay visible
  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.style.opacity = '1';
      sidebarRef.current.style.transition = 'none';
    }
  }, [fadeStage]);

  // Immediate video switching without delays
  useEffect(() => {
    if (fadeStage === 'out') {
      if (pendingIndex !== null) {
        setCurrentIndex(pendingIndex);
        setPendingIndex(null);
      }
      if (pendingPage !== null) {
        setSelected(pendingPage);
        setPendingPage(null);
      }
      setFadeStage('in');
      setBoxesVisible(false); // hide boxes before fade in
    }
  }, [fadeStage, pendingIndex, pendingPage, setSelected]);

  // Trigger staggered animations every time currentIndex changes (new cocktail loaded)
  useEffect(() => {
    if (currentIndex !== null && videoFiles.length > 0) {
      // Clear all previous animation timeouts to prevent glitches when switching quickly
      animationTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      animationTimeoutsRef.current = [];
      
      // Reset all animations first - ensure they start at opacity 0 and translateY(120px)
      resetAnimations();
      setBoxesVisible(false);
      // Reset to ingredients/garnish view when cocktail changes
      setShowConceptInfo(false);
      
      // Get current cocktail info to determine number of countries
      const currentFile = videoFiles[currentIndex];
      const info = cocktailInfo[currentFile];
      const countryDisplayList = info ? getCountryDisplayList(info) : [];
      const countryCount = countryDisplayList.length;
      
      // Initialize countries array with false values - ensure it matches current country count
      setCountriesVisible(new Array(countryCount).fill(false));
      
      // Force a reflow to ensure the browser registers the reset state (opacity 0, translateY 120px)
      // Elements will remain invisible until the delay completes
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Wait 0.5 seconds - elements stay invisible (opacity 0) during this time
          // After delay, start the fade and slide animation
          const titleTimeout = setTimeout(() => {
            // Title: slide up from bottom with fade (starts after 0.5s delay)
            setTitleVisible(true);
            
            // Ingredients: fade in only (starts 0.4s after title starts)
            const ingredientsTimeout = setTimeout(() => {
              setIngredientsVisible(true);
              
              // Garnish: fade in only (starts 0.3s after ingredients starts)
              const garnishTimeout = setTimeout(() => {
                setGarnishVisible(true);
              }, 300);
              animationTimeoutsRef.current.push(garnishTimeout);
            }, 400);
            animationTimeoutsRef.current.push(ingredientsTimeout);
          }, 500);
          animationTimeoutsRef.current.push(titleTimeout);
          
          // Map: fade in starting at 0.5s, fully visible by 1.5s (1s duration)
          const mapTimeout = setTimeout(() => {
            setMapVisible(true);
          }, 500);
          animationTimeoutsRef.current.push(mapTimeout);
          
          // Countries: start 0.5s after map starts (at 1.0s), each one fades in every 0.5s
          // Store current country count to ensure we're updating the correct array
          const currentCountryCount = countryCount;
          for (let i = 0; i < currentCountryCount; i++) {
            const countryTimeout = setTimeout(() => {
              setCountriesVisible(prev => {
                // Only update if the array length still matches (prevent glitches from rapid switching)
                if (prev.length === currentCountryCount) {
                  const newArray = [...prev];
                  newArray[i] = true;
                  return newArray;
                }
                return prev; // Don't update if array size changed
              });
            }, 1000 + (i * 500));
            animationTimeoutsRef.current.push(countryTimeout);
          }
          
          // Concept: slide fade from left (starts at same time as ingredients - 0.4s after title)
          const conceptTimeout = setTimeout(() => {
            setConceptVisible(true);
          }, 400);
          animationTimeoutsRef.current.push(conceptTimeout);
          
          // Keep boxesVisible for container visibility (legacy support)
          const boxesTimeout = setTimeout(() => {
            setBoxesVisible(true);
          }, 150);
          animationTimeoutsRef.current.push(boxesTimeout);
        });
      });
    }
    
    // Cleanup function to clear all timeouts when component unmounts or currentIndex changes
    return () => {
      animationTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      animationTimeoutsRef.current = [];
    };
  }, [currentIndex, videoFiles.length]);

  // Safety check for props - must come after all hooks
  if (!videoFiles || !cocktailInfo || !title) {
    console.warn('EchoCocktailSubpage: Missing required props:', { videoFiles, cocktailInfo, title });
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        fontSize: '1.2rem',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  // Info box positions (flex row)
  const currentFile = videoFiles[currentIndex];
  const info = cocktailInfo[currentFile];
  const countryDisplayList = info ? getCountryDisplayList(info) : [];

  // Left container wrapper (no animation, just positioning)
  const renderTitleBlock = () => {
    if (!info || !info.name) return null;
    return (
      <div 
        ref={titleRef}
        className="cocktail-title" 
        style={{
        border: '2px solid',
          borderImage: 'linear-gradient(to bottom, #222, #aaa) 1',
        borderRadius: 0,
          width: '100%',
          minHeight: '2.5rem',
        padding: isSmallScreen ? '0.4rem 0.6rem' : '0.4rem 0.8rem',
          fontSize: isSmallScreen ? '1.5rem' : '1.9rem',
        fontWeight: 400,
        marginTop: '20px',
        marginBottom: isMobileView ? 0 : '60px',
        textAlign: 'center',
        letterSpacing: '0.12em',
        background: 'transparent',
          display: 'block',
          whiteSpace: 'normal',
        overflow: 'visible',
          textOverflow: 'clip',
        lineHeight: isSmallScreen ? '1.2' : '1.4',
        opacity: titleVisible ? 1 : 0,
        transform: 'translateY(0)',
          transition: titleVisible ? (isMobileView ? 'opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1), border-image 0.3s ease' : 'opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1), border-image 0.3s ease') : 'none',
        pointerEvents: titleVisible ? 'auto' : 'none',
          visibility: titleVisible ? 'visible' : 'hidden',
        }}
      >
        {info.name ? info.name.toUpperCase() : ''}
      </div>
    );
  };

  const renderIngredientsBlock = () => {
    if (!info || !info.ingredients) return null;
    return (
      <div style={{ 
        paddingLeft: isSmallScreen ? '10px' : '20px',
        paddingRight: isSmallScreen ? '10px' : '20px',
        marginTop: 0,
        overflow: 'visible',
        opacity: ingredientsVisible ? 1 : 0,
        transition: ingredientsVisible ? 'opacity 1.5s ease-out' : 'none',
        pointerEvents: ingredientsVisible ? 'auto' : 'none',
        visibility: ingredientsVisible ? 'visible' : 'hidden',
      }}>
        <div style={{ 
          textTransform: 'uppercase', 
          fontWeight: 400, 
          fontSize: isMobileView ? '0.9rem' : '1.4rem',
          marginBottom: isMobileView ? '5px' : '0.5rem',
          ...(isMobileView ? {
            color: '#000'
          } : {
          background: 'linear-gradient(to bottom, #333, #666)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
          })
        }}>Ingredients</div>
        <div style={{ 
          marginBottom: isMobileView ? '5px' : '1.5rem', 
          lineHeight: 1.5, 
          fontSize: isSmallScreen ? '0.9rem' : '1.15rem',
          color: isMobileView ? '#333' : '#888'
        }}>{info.ingredients}</div>
      </div>
    );
  };
      
  const renderGarnishBlock = () => {
    if (!info || !info.garnish) return null;
    return (
        <div style={{ 
        paddingLeft: isSmallScreen ? '10px' : '20px',
        paddingRight: isSmallScreen ? '10px' : '20px',
        marginTop: isMobileView ? '8px' : '2rem',
          overflow: 'visible',
          opacity: garnishVisible ? 1 : 0,
        transition: garnishVisible ? 'opacity 1.5s ease-out' : 'none',
          pointerEvents: garnishVisible ? 'auto' : 'none',
        visibility: garnishVisible ? 'visible' : 'hidden',
        }}>
          <div style={{ 
            textTransform: 'uppercase', 
            fontWeight: 400, 
            fontSize: isMobileView ? '0.9rem' : '1.4rem',
            marginBottom: isMobileView ? '5px' : '0.5rem',
            ...(isMobileView ? {
              color: '#000'
            } : {
            background: 'linear-gradient(to bottom, #333, #666)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
            })
          }}>Garnish</div>
          <div style={{ 
            marginBottom: isMobileView ? '5px' : '1.5rem', 
            lineHeight: 1.5, 
            width: '100%',
            color: isMobileView ? '#333' : '#888'
          }}>{info.garnish}</div>
        </div>
    );
  };

  const renderConceptBlock = () => {
    if (!info || !info.concept) return null;
    return (
    <div style={{
        opacity: conceptVisible ? 1 : 0,
        transform: conceptVisible ? 'translateX(0)' : 'translateX(-30px)',
        transition: conceptVisible ? 'opacity 0.9s ease-out, transform 0.9s ease-out' : 'none',
        visibility: conceptVisible ? 'visible' : 'hidden',
        paddingRight: '20px',
      }}>
        <div style={{ 
          textTransform: 'uppercase', 
          fontWeight: 400, 
          fontSize: isMobileView ? '0.9rem' : '1.1rem', 
            marginBottom: '0.5rem',
            background: 'linear-gradient(to bottom, #333, #666)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
        }}>Concept</div>
        <div style={{ marginBottom: '1.5rem', color: '#888', lineHeight: 1.5, width: '100%' }}>
          {info.concept}
        </div>
      </div>
    );
  };

  const renderMapBlock = (styleOverrides = {}) => (
      <div style={{
        opacity: mapVisible ? 1 : 0,
      transition: mapVisible ? 'opacity 1s ease-in-out' : 'none',
        marginBottom: '1.5rem',
        width: '100%',
      ...styleOverrides
      }}>
        <img
        src={info?.mapSnapshot || '/assets/images/worldmap.svg'}
          alt='World Map'
        style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
        />
      </div>
  );

  const renderArrowButtons = () => {
    const arrowColor = isMobileView ? '#fff' : '#888';
    const hoverColor = isMobileView ? '#fff' : '#222';
    
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 40,
        pointerEvents: 'auto',
      }}>
        <button
          className="cocktail-arrow-btn"
          onClick={handleNext}
          style={{
            background: 'transparent',
            color: arrowColor,
            border: 'none',
            borderRadius: '50%',
            width: 56,
            height: 56,
            fontSize: '2.2rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            margin: 0,
            transition: 'all 0.2s ease'
          }}
          aria-label="Next cocktail"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = hoverColor;
            e.target.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = arrowColor;
            e.target.style.transform = 'scale(1)';
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
            <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="cocktail-arrow-btn"
          onClick={handlePrev}
          style={{
            background: 'transparent',
            color: arrowColor,
            border: 'none',
            borderRadius: '50%',
            width: 56,
            height: 56,
            fontSize: '2.2rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            margin: 0,
            transition: 'all 0.2s ease'
          }}
          aria-label="Previous cocktail"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = hoverColor;
            e.target.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = arrowColor;
            e.target.style.transform = 'scale(1)';
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
            <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    );
  };

  const renderVideoOverlay = (isMobileLayout = false) => {
    const wrapperStyle = isMobileLayout
      ? {
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          position: 'relative',
          width: '100%',
          height: '100%',
          background: 'transparent',
          padding: 0,
          margin: 0,
          marginTop: '-60px',
          boxSizing: 'border-box',
        }
      : {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          padding: 0,
          position: 'relative',
          margin: '0',
          alignSelf: 'center',
          flexShrink: 0,
          zIndex: isMobileView ? 0 : 'auto',
          boxSizing: 'border-box',
        };

    const innerStyle = isMobileLayout
      ? {
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          position: 'relative',
        }
      : {
          width: '100%',
          height: isMidDesktop ? '833px' : '980px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: isSquareVideo ? 'flex-end' : 'center',
          justifyContent: 'center',
          position: 'relative',
          paddingBottom: isSquareVideo ? (isMidDesktop ? '70px' : '93px') : 0,
        };

    const arrowBottom = isMobileLayout ? '-32px' : '16px';
    const arrowTop = 'auto';

    return (
      <div style={wrapperStyle}>
        <video
          ref={videoRef}
          src={videoFiles[currentIndex] ? `/menu-items/${videoFiles[currentIndex]}` : ''}
          autoPlay
          muted
          playsInline
          loop
          crossOrigin="anonymous"
          onLoadedMetadata={(e) => {
            const video = e.target;
            if (video.videoWidth && video.videoHeight) {
              const aspectRatio = video.videoWidth / video.videoHeight;
              const isSquare = Math.abs(aspectRatio - 1.0) < 0.05;
              setIsSquareVideo(isSquare);
            }
          }}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' }}
          aria-label="Spinning cocktail video"
        />

        <div style={{
          ...innerStyle,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          overflow: 'visible', // Allow reflection to be visible
          marginTop: '-40px', // Moved up 40px more (was 0px, now -40px)
        }}>
          <canvas
            ref={canvasRef}
            style={{ 
              display: 'block',
              margin: '0 auto',
              background: 'transparent',
              position: 'relative',
              zIndex: 10,
              opacity: 1,
            }}
          />
          {/* Reflection canvas - upside down, black and white, low contrast */}
          <canvas
            ref={reflectionCanvasRef}
            style={{ 
              display: 'block',
              margin: '0 auto',
              marginTop: '-320px', // Moved up 20px more (was -300px, now -320px)
              background: 'transparent',
              position: 'relative',
              zIndex: 1, // Lower z-index to be underneath
              opacity: 0.8,
            }}
          />

          {!isMobileLayout && (
            <div style={{
              position: 'absolute',
              bottom: arrowBottom,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
              pointerEvents: 'none',
              paddingBottom: '80px',
            }}>
              {renderArrowButtons()}
        </div>
      )}
        </div>
      </div>
    );
  };

  const renderMobileLayout = () => (
    <div style={{
      display: 'grid',
      gridTemplateRows: '3fr 1fr auto',
      height: 'calc(100vh - 80px)',
      width: '100vw',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Light grey gradient overlay - same as desktop menu gallery */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '100%',
        background: isMobileView ? 'linear-gradient(to top, rgba(85, 85, 85, 1) 0%, rgba(85, 85, 85, 0.85) 4%, rgba(85, 85, 85, 0.6) 8%, rgba(85, 85, 85, 0.35) 12.5%, rgba(85, 85, 85, 0.15) 16.5%, rgba(85, 85, 85, 0.05) 20.5%, transparent 25%)' : 'linear-gradient(to top, rgba(85, 85, 85, 1) 0%, rgba(85, 85, 85, 0.85) 5%, rgba(85, 85, 85, 0.6) 10%, rgba(85, 85, 85, 0.35) 15%, rgba(85, 85, 85, 0.15) 20%, rgba(85, 85, 85, 0.05) 25%, transparent 30%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />
      <div style={{ position: 'relative' }}>
        {renderVideoOverlay(true)}
        {renderTitleBlock() && (
          <div style={{
            position: 'absolute',
            top: '64px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 16px',
            pointerEvents: 'none',
            zIndex: 10
          }}>
            <div style={{ width: '100%', maxWidth: '360px' }}>
              {renderTitleBlock()}
            </div>
          </div>
        )}
        {/* Category icon buttons - above title, horizontal, left aligned, mobile only */}
        {isMobileView && subpageOrder && setSelected && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            display: 'flex',
            flexDirection: 'row',
            gap: 16,
            zIndex: 10,
            pointerEvents: 'auto'
          }}>
            {subpageOrder.map(({ key, label }) => {
              const isDisabled = key === 'spirits';
              const iconMap = {
                cocktails: '/assets/icons/classics.svg',
                mocktails: '/assets/icons/originals.svg',
                spirits: '/assets/icons/spirits.svg',
              };
              const iconSrc = iconMap[key];
              return (
                <button
                  key={key}
                  data-category-key={key}
                  onClick={() => {
                    if (!isDisabled) {
                      handleSidebarNav(key);
                    }
                  }}
                  disabled={isDisabled}
                  aria-label={label}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'transparent',
                    border: 'none',
                    cursor: isDisabled ? 'default' : 'pointer',
                    opacity: isDisabled ? 0 : 1,
                    pointerEvents: isDisabled ? 'none' : 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    transition: 'filter 0.2s',
                  }}
                >
                  {iconSrc ? (
                    <img
                      src={iconSrc}
                      alt={label}
                      style={{
                        width: '32px',
                        height: '32px',
                        display: 'block',
                        filter: isDisabled 
                          ? 'brightness(0) saturate(0) opacity(0)' 
                          : (selected === key ? 'brightness(0) saturate(0) opacity(0.7)' : 'brightness(0) saturate(0) opacity(0.4)'),
                      }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {/* Map overlay - pinned to bottom of title, right side */}
        <div style={{
          position: 'absolute',
          top: 'calc(64px + 2.5rem + 0.8rem + 22px)',
          right: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          zIndex: 5,
          pointerEvents: 'none'
        }}>
          {/* White mask overlay for map */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isMobileView ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.5)',
            zIndex: 1,
            pointerEvents: 'none'
          }} />
          {renderMapBlock({ marginBottom: '0.5rem', width: 'auto', maxWidth: '280px' })}
      {countryDisplayList.length > 0 && (
            <div style={{ color: '#888', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', paddingRight: '10px', position: 'relative' }}>
              {/* White mask overlay for codes */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.5)',
                zIndex: 1,
                pointerEvents: 'none'
              }} />
            {countryDisplayList.map((entry, index) => (
              <div 
                key={`${entry.code}-${entry.name}`} 
                style={{ 
                  display: 'flex', 
                    justifyContent: 'flex-end', 
                    fontSize: '1rem', 
                  lineHeight: '1.2',
                    paddingRight: '10px',
                  opacity: (countriesVisible[index] === true) ? 1 : 0,
                    transition: (countriesVisible[index] === true) ? 'opacity 1.2s ease-out' : 'none',
                    visibility: (countriesVisible[index] === true) ? 'visible' : 'hidden',
                }}
              >
                  {!isMobileView && <span>{entry.name}</span>}
                  <span>{entry.code}</span>
              </div>
            ))}
          </div>
      )}
        </div>
      </div>
        <div style={{
        position: 'absolute',
        top: 'calc((100vh - 80px) * 3 / 4 - 80px)',
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 20,
        pointerEvents: 'auto'
      }}>
        <div style={{ width: '100%', padding: '0 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          {/* Conditionally render ingredients/garnish or concept */}
          {showConceptInfo && info && info.concept ? (
            <>
              {/* Concept block - using same styling as ingredients/garnish */}
              <div style={{ 
                paddingLeft: isSmallScreen ? '10px' : '20px',
                paddingRight: isSmallScreen ? '10px' : '20px',
                marginTop: 0,
                overflow: 'visible',
                opacity: 1,
              }}>
                <div style={{ 
                  textTransform: 'uppercase', 
                  fontWeight: 400, 
                  fontSize: isMobileView ? '0.9rem' : '1.4rem',
                  marginBottom: isMobileView ? '5px' : '0.5rem',
                  color: '#000'
                }}>Concept</div>
                <div style={{ 
                  marginBottom: isMobileView ? '5px' : '1.5rem', 
                  lineHeight: 1.5, 
                  fontSize: isSmallScreen ? '0.9rem' : '1.15rem',
                  color: isMobileView ? '#333' : '#888'
                }}>{info.concept}</div>
              </div>
            </>
          ) : (
            <>
              {renderIngredientsBlock()}
              {renderGarnishBlock()}
            </>
          )}
        </div>
      </div>
      {/* Arrows container */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        zIndex: 30
      }}>
        {renderArrowButtons()}
      </div>
      {/* Info button - aligned with ingredients title, 30px up, mobile only */}
      {isMobileView && info && info.concept && (
        <div style={{
          position: 'absolute',
          top: 'calc((100vh - 80px) * 3 / 4 - 80px - 30px)', // Same top as ingredients container, minus 30px
          right: '36px', // 16px padding + 20px right padding
          zIndex: 21,
          pointerEvents: 'auto',
          opacity: ingredientsVisible ? 1 : 0,
          transition: ingredientsVisible ? 'opacity 1.5s ease-out' : 'none',
          visibility: ingredientsVisible ? 'visible' : 'hidden',
        }}>
          <button
            onClick={() => setShowConceptInfo(!showConceptInfo)}
            aria-label={showConceptInfo ? "Show ingredients and garnish" : "Show concept information"}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'filter 0.2s',
            }}
          >
            <img
              src="/assets/icons/info.svg"
              alt="Info"
              style={{
                width: '28px',
                height: '28px',
                display: 'block',
                filter: showConceptInfo 
                  ? 'brightness(0) saturate(0) opacity(0.7)' 
                  : 'brightness(0) saturate(0) opacity(0.4)',
              }}
            />
          </button>
        </div>
      )}
    </div>
  );

  if (isMobileView) {
    return renderMobileLayout();
  }

  const leftContainer = info ? (
    <div style={{
      width: isSmallScreen ? 300 : 388,
      background: 'transparent',
      borderRadius: 12,
      padding: isSmallScreen ? '0.75rem 0.5rem 0.5rem 0.5rem' : '1.5rem 1.25rem 1.25rem 1.25rem',
      fontFamily: 'Montserrat, Helvetica Neue, Helvetica, Arial, sans-serif',
      fontSize: isSmallScreen ? '0.75rem' : '1rem',
      color: '#222',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      alignSelf: 'flex-start',
      marginRight: 0,
      marginTop: isSmallScreen ? '-240px' : '220px',
      overflow: 'visible',
    }}>
      {renderTitleBlock()}
      {renderIngredientsBlock()}
      {renderGarnishBlock()}
    </div>
  ) : null;

  const rightContainer = info ? (
    <div style={{
      width: isSmallScreen ? 300 : 388,
      minHeight: isSmallScreen ? 100 : 'auto',
      background: 'transparent',
      borderRadius: 12,
      padding: isSmallScreen ? '0.75rem 0.5rem 0.5rem 0.5rem' : '1.5rem 1.25rem 1.25rem 1.25rem',
      fontFamily: 'Montserrat, Helvetica Neue, Helvetica, Arial, sans-serif',
      fontSize: isSmallScreen ? '0.75rem' : '1rem',
      color: '#222',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      alignSelf: 'flex-start',
      marginLeft: 0,
      marginTop: isSmallScreen ? '-240px' : '220px',
    }}>
      {renderMapBlock()}
      
      {countryDisplayList.length > 0 && (
        <div style={{ marginBottom: '1.5rem', paddingBottom: '2rem', minHeight: '4rem', color: '#888', display: 'flex', flexDirection: 'column', gap: '0', width: '100%' }}>
            {countryDisplayList.map((entry, index) => (
              <div 
                key={`${entry.code}-${entry.name}`} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  fontSize: '0.85rem', 
                  lineHeight: '1.2',
                  opacity: (countriesVisible[index] === true) ? 1 : 0,
                transition: (countriesVisible[index] === true) ? 'opacity 1.2s ease-out' : 'none',
                visibility: (countriesVisible[index] === true) ? 'visible' : 'hidden',
                }}
              >
                <span>{entry.name} {entry.code}</span>
              </div>
            ))}
          </div>
      )}
      
      {renderConceptBlock()}
    </div>
  ) : null;

      return (
      <>
        {/* Wrapper to center sidebar relative to content */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '0px', paddingBottom: '0px' }}>
          
          {/* Sidebar navigation - outside fade container but centered relative to it */}
          {subpageOrder && setSelected && !isMobileView && (
            <div 
              ref={sidebarRef}
              className="sidebar-no-fade"
              style={{
                position: 'absolute',
                left: sidebarOpen ? '-80px' : '-200px', // Slide in/out
                top: '50%',
                width: 200,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-end',
                zIndex: 100,
                pointerEvents: 'auto',
                transform: 'translateY(-50%)',
                opacity: sidebarOpen ? 1 : 0,
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 32, 
                position: 'relative',
                padding: '8px 12px',
                borderRadius: '8px',
                width: 'fit-content'
              }}>
                {subpageOrder.map(({ key, label }) => {
                  const isDisabled = key === 'spirits';
                  // Map subpage keys to SVG filenames
                  const iconMap = {
                    cocktails: '/assets/icons/classics.svg',
                    mocktails: '/assets/icons/originals.svg',
                    spirits: '/assets/icons/spirits.svg',
                  };
                  const iconSrc = iconMap[key];
                  return (
                    <div key={key} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <button
                        onClick={() => {
                          if (!isDisabled) {
                            handleSidebarNav(key);
                          }
                        }}
                        disabled={isDisabled}
                        aria-label={label}
                        onMouseEnter={() => {
                          if (!isDisabled) {
                            setHoveredButton(key);
                          }
                        }}
                        onMouseLeave={() => {
                          if (!isDisabled) {
                            setHoveredButton(null);
                          }
                        }}
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 12,
                          background: 'transparent',
                          color: isDisabled ? 'transparent' : (hoveredButton === key ? '#222' : (selected === key ? '#222' : '#888')),
                          border: 'none',
                          cursor: isDisabled ? 'default' : 'pointer',
                          opacity: isDisabled ? 0 : 1,
                          pointerEvents: isDisabled ? 'none' : 'auto',
                          fontWeight: 600,
                          fontSize: 18,
                          boxShadow: 'none',
                          outline: 'none',
                          transition: 'color 0.2s, filter 0.2s',
                          marginBottom: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      >
                      {iconSrc ? (
                        <img
                          src={iconSrc}
                          alt={label}
                          style={{
                            width: '60px',
                            height: '60px',
                            display: 'block',
                            transition: 'filter 0.2s',
                            filter: isDisabled 
                              ? 'brightness(0) saturate(0) opacity(0)' 
                              : (hoveredButton === key ? 'brightness(0)' : 'brightness(0) saturate(0) opacity(0.53)'),
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{label.charAt(0)}</span>
                      )}
                      </button>
                                                <span
                            className={hoveredButton === key ? 'sidebar-text-gradient' : ''}
                            style={{
                              position: 'absolute',
                              left: 'calc(100% + 8px)',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '10pt',
                              fontWeight: 400,
                              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                              opacity: hoveredButton === key ? 1 : 0,
                              transition: 'opacity 0.2s, color 0.2s',
                              pointerEvents: 'none',
                            }}
                          >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* White gradient overlay that moves with sidebar */}
          {sidebarOpen && !isMobileView && (
            <div
              style={{
                position: 'absolute',
                left: '-80px',
                top: '50%',
                width: '420px',
                height: 'calc(100vh - 350px)',
                background: 'linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) 60%, rgba(255,255,255,0) 100%)',
                zIndex: 99,
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: 'none',
                transform: 'translateY(-50%)'
              }}
            />
          )}

          {/* Main content without fade effect for videos */}
          <div
            style={{
              opacity: 1,
              height: isMobileView ? '100%' : 'auto',
              display: isMobileView ? 'flex' : 'block',
              flexDirection: isMobileView ? 'column' : 'row',
              alignItems: isMobileView ? 'center' : 'stretch',
              justifyContent: isMobileView ? 'flex-end' : 'flex-start',
              width: isMobileView ? '100%' : 'auto'
            }}
          >
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobileView ? 'column' : 'row',
          justifyContent: isMidDesktop ? 'center' : (isSmallScreen ? 'center' : 'center'), 
          alignItems: isSmallScreen ? 'center' : 'stretch', 
          margin: 0, 
          position: 'relative', 
          zIndex: 1,
          paddingLeft: isSmallScreen && !isMobileView ? '32px' : 0,
          paddingRight: isSmallScreen && !isMobileView ? '32px' : 0,
          minHeight: isSmallScreen ? '100vh' : 'auto',
          width: '100%',
          height: isMobileView ? 'calc(100vh - 80px)' : 'auto',
          overflow: 'visible' // Ensure animations aren't clipped by parent
        }}>
          {!isMidDesktop && !isMobileView && leftContainer}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'transparent', 
            padding: 0, 
            position: isMobileView ? 'absolute' : 'relative',
            inset: isMobileView ? '0' : 'auto',
            margin: '0',
            alignSelf: 'center',
            width: isMobileView ? '100%' : 'auto',
            height: isMobileView ? 'calc(100vh - 80px)' : 'auto',
            flexShrink: 0,
            zIndex: isMobileView ? 0 : 'auto',
            boxSizing: 'border-box'
          }}>
            {(() => {
              const currentFile = videoFiles[currentIndex];
              const currentInfo = currentFile ? cocktailInfo[currentFile] : null;
              const videoSrc = currentInfo?.cloudinaryVideoUrl || currentInfo?.videoUrl;
              return isCloudinaryUrl(videoSrc) ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  loop
                  crossOrigin="anonymous"
                  onLoadedMetadata={(e) => {
                    const video = e.target;
                    if (video.videoWidth && video.videoHeight) {
                      const aspectRatio = video.videoWidth / video.videoHeight;
                      const isSquare = Math.abs(aspectRatio - 1.0) < 0.05;
                      setIsSquareVideo(isSquare);
                    }
                  }}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' }}
                  aria-label="Spinning cocktail video"
                >
                  <source src={videoSrc} type="video/mp4" />
                </video>
              ) : null;
            })()}
            {/* Fixed-size container to crop videos */}
            <div style={{
              width: isMidDesktop ? '459px' : (isMobileView ? '100%' : '540px'),
              height: isMidDesktop ? '833px' : (isMobileView ? 'calc(100vh - 80px)' : '980px'),
              maxHeight: isMobileView ? 'calc(100vh - 80px)' : 'none',
              maxWidth: isMobileView ? '100%' : 'none',
              overflow: 'visible', // Changed to visible to show reflection
              display: 'flex',
              flexDirection: 'column', // Changed to column to stack canvases
              alignItems: 'center',
              justifyContent: isSquareVideo ? 'flex-end' : 'center',
              position: 'relative',
              margin: isMobileView ? '0' : 'auto',
              marginTop: isSmallScreen ? (isMobileView ? '0' : '60px') : '-40px', // Moved up 40px more (was 0px, now -40px; was 100px for small screen, now 60px)
              paddingBottom: isSquareVideo ? (isMobileView ? '6vh' : (isMidDesktop ? '70px' : '93px')) : 0
            }}>
            <canvas
              ref={canvasRef}
              style={{ 
                display: 'block',
                margin: '0 auto',
                background: 'transparent',
                position: 'relative',
                zIndex: 10,
                opacity: 1,
              }}
            />
            {/* Reflection canvas - upside down, black and white, low contrast */}
            <canvas
              ref={reflectionCanvasRef}
              style={{ 
                display: 'block',
                margin: '0 auto',
                marginTop: '-320px', // Moved up 20px more (was -300px, now -320px)
                background: 'transparent',
                position: 'relative',
                zIndex: 1, // Lower z-index to be underneath
                opacity: 0.7,
              }}
            />
            
            {/* Arrows container - positioned at bottom of video, centered */}
            <div style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1000,
              pointerEvents: 'none',
              paddingBottom: isMobileView ? 0 : '80px',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 40,
                pointerEvents: 'auto',
              }}>
                <button
                  className="cocktail-arrow-btn"
                  onClick={handleNext}
                  style={{
                    background: 'transparent',
                    color: '#888',
                    border: 'none',
                    borderRadius: '50%',
                    width: 56,
                    height: 56,
                    fontSize: '2.2rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    margin: 0,
                    transition: 'all 0.2s ease'
                  }}
                  aria-label="Next cocktail"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#222';
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#888';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                    <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  className="cocktail-arrow-btn"
                  onClick={handlePrev}
                  style={{
                    background: 'transparent',
                    color: '#888',
                    border: 'none',
                    borderRadius: '50%',
                    width: 56,
                    height: 56,
                    fontSize: '2.2rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    margin: 0,
                    transition: 'all 0.2s ease'
                  }}
                  aria-label="Previous cocktail"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#222';
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#888';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                    <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          </div>
          {!isMidDesktop && !isMobileView && rightContainer}
        </div>
          </div>
          
          {/* Absolutely positioned boxes for mid-desktop mode */}
          {(isMidDesktop || isMobileView) && !isMobileView && (
            <>
              {leftContainer && React.cloneElement(leftContainer, {
                style: {
                  ...leftContainer.props.style,
                  position: 'absolute',
                  left: `${responsivePadding}px`,
                  top: '320px',
                  marginRight: 0,
                  marginTop: 0,
                  width: leftContainer.props.style.width,
                }
              })}
              {rightContainer && React.cloneElement(rightContainer, {
                style: {
                  ...rightContainer.props.style,
                  position: 'absolute',
                  right: `${responsivePadding}px`,
                  top: '320px',
                  marginLeft: 0,
                  marginTop: 0,
                  width: rightContainer.props.style.width,
                  padding: rightContainer.props.style.padding,
                  fontSize: rightContainer.props.style.fontSize,
                }
              })}
            </>
          )}
        </div>

        {/* Bottom navigation container - Left sidebar and Schedule button */}
        {!isMobileView && (
        <div style={{ 
          display: 'flex', 
          justifyContent: isSmallScreen ? 'flex-start' : 'space-between', 
          alignItems: 'center',
          margin: '0', 
          position: 'relative',
          zIndex: 1000,
          width: '100vw',
          paddingBottom: '2rem',
          paddingLeft: '2rem',
          paddingRight: '2rem',
          marginTop: isMidDesktop ? '-60px' : (isSmallScreen ? '0' : 'auto'),
          top: isSmallScreen ? '0' : 'auto',
        }}>
          {/* Left side - Horizontal Sidebar */}
          <div style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            width: 'fit-content',
            overflow: 'visible'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '0.5rem',
              alignItems: 'center',
              overflow: 'visible'
            }}>
              {subpageOrder.map((item, index) => {
                const isDisabled = item.key === 'spirits';
                return (
                <button
                  key={index}
                  disabled={isDisabled}
                  data-category-key={item.key}
                  aria-label={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isSmallScreen ? '0.25rem' : '0.75rem',
                    padding: isSmallScreen ? '0.5rem 0.8rem' : '0.8rem 1.2rem',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 0,
                    cursor: isDisabled ? 'default' : 'pointer',
                    transition: 'all 0.2s ease',
                    minHeight: isSmallScreen ? '32px' : '50px',
                    boxShadow: 'none',
                    opacity: isDisabled ? 0 : 1,
                    visibility: 'visible',
                    pointerEvents: isDisabled ? 'none' : 'auto'
                  }}
                  onClick={() => {
                    if (!isDisabled) {
                      setSelected(item.key);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isDisabled) {
                      const button = e.currentTarget;
                      button.style.transform = 'scale(1.25)';
                      const img = button.querySelector('img');
                      const span = button.querySelector('span');
                      if (img) img.style.filter = 'brightness(0) invert(1)';
                      if (span) span.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDisabled) {
                      const button = e.currentTarget;
                      button.style.transform = 'scale(1)';
                      const img = button.querySelector('img');
                      const span = button.querySelector('span');
                      if (img) img.style.filter = 'brightness(0) invert(1)';
                      if (span) span.style.color = '#ffffff';
                    }
                  }}
                >
                  <IconComponent
                    iconName={item.key}
                    style={{
                      width: isSmallScreen ? '44px' : '32px',
                      height: isSmallScreen ? '44px' : '32px',
                      filter: isDisabled ? 'brightness(0) saturate(0) opacity(0)' : 'brightness(0) invert(1)'
                    }}
                  />
                  <span style={{
                    fontSize: isSmallScreen ? '0.6rem' : '1.1rem',
                    fontWeight: 400,
                    color: isDisabled ? 'transparent' : '#ffffff',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                    display: isSmallScreen ? 'none' : 'inline'
                  }}>
                    {item.label}
                  </span>
                </button>
              )})}
            </div>
          </div>

          {/* Right side - Schedule An Event button */}
          <div style={{
            alignItems: 'center',
            justifyContent: 'flex-end',
            flex: isMobileView ? 'none' : 1,
            display: isMobileView ? 'none' : 'flex',
            paddingRight: '373px'
          }}>
            <button
              onClick={() => {
                const eventRequestSection = document.getElementById('event-request-section');
                if (eventRequestSection) {
                  eventRequestSection.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isSmallScreen ? '0.25rem' : '0.5rem',
                padding: '8px 16px',
                marginRight: 0,
                marginLeft: 0,
                background: 'transparent',
                border: '2px solid #ffffff',
                borderRadius: 0,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minHeight: isSmallScreen ? '28px' : '32px',
                boxShadow: 'none',
                opacity: 1,
                visibility: 'visible',
                color: '#ffffff',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontSize: '1.05rem',
                fontWeight: 400,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap'
              }}
            >
              SCHEDULE AN EVENT
            </button>
          </div>
        </div>
        )}
      </>
    );
}

// Create a proper MenuGallery component that wraps EchoCocktailSubpage
export default function MenuGallery() {
  // Fetch data from backend API instead of using hardcoded configs
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
  const [selected, setSelected] = useState('cocktails');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Define the subpage order for navigation
  const subpageOrder = [
    { key: 'cocktails', label: 'Cocktails' },
    { key: 'mocktails', label: 'Mocktails' },
    { key: 'spirits', label: 'Spirits' }
  ];
  
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
  
  // Get current category data
  const currentCategory = subpages[selected] || subpages.cocktails;
  const { title, videoFiles, cocktailInfo } = currentCategory;
  
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '1.2rem',
        color: '#666'
      }}>
        Loading menu data...
      </div>
    );
  }
  
  return (
    <EchoCocktailSubpage
      videoFiles={videoFiles}
      cocktailInfo={cocktailInfo}
      title={title}
      selected={selected}
      setSelected={setSelected}
      subpageOrder={subpageOrder}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}

// Export EchoCocktailSubpage for use in other components
export { EchoCocktailSubpage };

