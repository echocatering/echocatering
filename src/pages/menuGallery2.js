import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { IconComponent } from '../utils/iconData';
import { getCountryDisplayList } from '../shared/countryUtils';
import { fetchMenuGalleryData } from '../utils/menuGalleryApi';
import { isCloudinaryUrl } from '../utils/cloudinaryUtils';
import { normalizeIngredients } from '../utils/ingredientUtils';
import FullMenu from '../admin/components/FullMenu';

const isProbablyIOS = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isIOSDevice = /iPad|iPhone|iPod/i.test(ua);
  const isIPadOS = platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
  return isIOSDevice || isIPadOS;
};

const isProbablyMobileDevice = () => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const uaDataMobile = navigator.userAgentData && navigator.userAgentData.mobile;
  if (typeof uaDataMobile === 'boolean') return uaDataMobile;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const touchPoints = Number(navigator.maxTouchPoints || 0) > 1;
  return coarse || touchPoints;
};

const getIosSafeCloudinaryVideoUrl = (url) => {
   if (!isCloudinaryUrl(url)) return url;

   const [baseUrl, queryString] = String(url).split('?');
   const marker = '/video/upload/';
   const idx = baseUrl.indexOf(marker);
   if (idx === -1) return url;

   const prefix = baseUrl.slice(0, idx + marker.length);
   const rest = baseUrl.slice(idx + marker.length);

   // Check if required iOS-safe directives are already present
   const hasQAuto = /(^|[\/, ])q_auto($|[\/, ])/.test(rest);
   const hasFMp4 = /(^|[\/, ])f_mp4($|[\/, ])/.test(rest);
   const hasVcH264 = /(^|[\/, ])vc_h264($|[\/, ])/.test(rest);

   // If all required directives exist, return as-is
   if (hasQAuto && hasFMp4 && hasVcH264) return url;

   // Build missing directives (no sp_auto - not supported for .mp4 files)
   const missing = [];
   if (!hasQAuto) missing.push('q_auto');
   if (!hasFMp4) missing.push('f_mp4');
   if (!hasVcH264) missing.push('vc_h264');

   const transformed = `${prefix}${missing.join(',')}/${rest}`;
   return queryString ? `${transformed}?${queryString}` : transformed;
 };

/**
 * Computes sizes and positions for OuterContainer, InnerContainer, and Video.
 * Maintains fixed aspect ratios and inverse fit rules for the 1:1 video.
 */
function computeStageLayout(outerWidth, outerHeight, viewMode = 'web') {
  const outerAR = outerWidth / Math.max(outerHeight, 1);
  const orientation = outerAR >= 1 ? 'horizontal' : 'vertical';
  const innerAR = orientation === 'horizontal' ? 16 / 10 : 9 / 19;

  let innerFit;
  let innerWidth;
  let innerHeight;

  if (orientation === 'horizontal') {
    if (outerAR <= innerAR) {
      innerFit = 'width';
      innerWidth = outerWidth;
      innerHeight = innerWidth / innerAR;
    } else {
      innerFit = 'height';
      innerHeight = outerHeight;
      innerWidth = innerHeight * innerAR;
    }
  } else {
    // For vertical: always fit by height
      innerFit = 'height';
      innerHeight = outerHeight;
      innerWidth = innerHeight * innerAR;
      // Scale inner container by 1.10x in web mode for vertical orientation
      if (viewMode === 'web') {
        innerWidth *= 1.10;
        innerHeight *= 1.10;
      }
  }

  // Video fit: for vertical, always fit by height; for horizontal, use inverse of inner fit
  const videoFit = orientation === 'vertical' ? 'height' : (innerFit === 'width' ? 'height' : 'width');
  let videoSize = videoFit === 'width' ? { width: innerWidth, height: innerWidth } : { width: innerHeight, height: innerHeight };
  
  
  return {
    orientation,
    inner: { width: innerWidth, height: innerHeight, fit: innerFit },
    video: { ...videoSize, fit: videoFit },
  };
}

/**
 * Hook to measure a container with ResizeObserver; falls back to window.
 * In web mode without overrides, always uses viewport dimensions.
 */
function useContainerSize(outerWidthOverride, outerHeightOverride, viewMode = 'web') {
  const ref = useRef(null);
  // Store the initial stable size in a ref so it never changes
  const stableSizeRef = useRef(null);
  const maxViewportRef = useRef({ width: null, height: null });
  
  const [size, setSize] = useState(() => {
    if (outerWidthOverride && outerHeightOverride) {
      return { width: outerWidthOverride, height: outerHeightOverride };
    }

    const initialWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const initialHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const isVerticalMobile = isProbablyMobileDevice() && initialHeight > initialWidth;

    if (typeof window !== 'undefined' && isVerticalMobile && viewMode === 'web') {
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const initialSize = { width: vw, height: vh };
      stableSizeRef.current = initialSize;
      return initialSize;
    }
    
    // In web mode, capture initial viewport size once and never update
    if (viewMode === 'web' && typeof window !== 'undefined' && !isVerticalMobile) {
      // Capture initial size (lock it in - won't respond to browser UI changes)
      const initialSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      stableSizeRef.current = initialSize;
      return initialSize;
    }
    
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    
    return { width: 1280, height: 720 };
  });

  useEffect(() => {
    if (outerWidthOverride && outerHeightOverride) return;
    
    // In web mode without overrides, use the stable size from ref (never update)
    const isVerticalMobile =
      typeof window !== 'undefined' &&
      isProbablyMobileDevice() &&
      window.innerHeight > window.innerWidth;

    if (viewMode === 'web' && !outerWidthOverride && !outerHeightOverride && !isVerticalMobile) {
      // Size is already set in useState initializer
      // Don't listen to resize events - this prevents resizing when browser UI shows/hides
      return;
    }
    
    const handleViewport = () => {
      const vv = window.visualViewport;
      const width = vv?.width ?? window.innerWidth;
      const height = vv?.height ?? window.innerHeight;

      if (viewMode === 'web' && !outerWidthOverride && !outerHeightOverride && isProbablyMobileDevice() && height > width) {
        const stable = stableSizeRef.current;
        if (stable && typeof stable.width === 'number' && Math.abs(width - stable.width) < 50) {
          return;
        }
        const nextStable = { width, height };
        stableSizeRef.current = nextStable;
        setSize(nextStable);
        return;
      }

      const shouldUseMaxViewport = isProbablyMobileDevice() && height > width;

      if (shouldUseMaxViewport) {
        const prev = maxViewportRef.current;

        // Reset max tracking when width changes materially (e.g., rotation)
        const shouldReset =
          typeof prev.width === 'number' &&
          Math.abs(width - prev.width) > 50;

        const nextMaxHeight = shouldReset
          ? height
          : Math.max(typeof prev.height === 'number' ? prev.height : 0, height);

        maxViewportRef.current = { width, height: nextMaxHeight };
        setSize({ width, height: nextMaxHeight });
        return;
      }

      setSize({ width, height });
    };

    if (viewMode === 'web' && !outerWidthOverride && !outerHeightOverride && isVerticalMobile) {
      const shouldUseVisualViewport = !!window.visualViewport;
      if (shouldUseVisualViewport) {
        window.visualViewport.addEventListener('resize', handleViewport);
        window.visualViewport.addEventListener('scroll', handleViewport);
      }

      window.addEventListener('resize', handleViewport);
      handleViewport();

      return () => {
        window.removeEventListener('resize', handleViewport);
        if (shouldUseVisualViewport) {
          window.visualViewport.removeEventListener('resize', handleViewport);
          window.visualViewport.removeEventListener('scroll', handleViewport);
        }
      };
    }

    // On mobile devices, visualViewport is the most reliable signal for address bar / browser UI changes.
    // Always attach these listeners so we don't get gaps when the browser chrome expands/collapses.
    const shouldUseVisualViewport = isProbablyMobileDevice() && !!window.visualViewport && window.innerHeight > window.innerWidth;
    if (shouldUseVisualViewport) {
      window.visualViewport.addEventListener('resize', handleViewport);
      window.visualViewport.addEventListener('scroll', handleViewport);
    }

    const node = ref.current;
    if (!node || !window.ResizeObserver) {
      window.addEventListener('resize', handleViewport);
      return () => {
        window.removeEventListener('resize', handleViewport);
        if (shouldUseVisualViewport) {
          window.visualViewport.removeEventListener('resize', handleViewport);
          window.visualViewport.removeEventListener('scroll', handleViewport);
        }
      };
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (shouldUseVisualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewport);
        window.visualViewport.removeEventListener('scroll', handleViewport);
      }
    };
  }, [outerWidthOverride, outerHeightOverride, viewMode]);

  useEffect(() => {
    if (outerWidthOverride && outerHeightOverride) {
      setSize({ width: outerWidthOverride, height: outerHeightOverride });
    }
  }, [outerWidthOverride, outerHeightOverride]);

  return [ref, size];
}

/**
 * Video background that fills the outer container (viewport).
 */
function VideoBackground({ videoSrc, isVertical = false, viewMode = 'web' }) {
  const videoRef = useRef(null);

  const safeVideoSrc = useMemo(() => getIosSafeCloudinaryVideoUrl(videoSrc), [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // iOS requires programmatic play() call even with autoplay
    const playVideo = () => {
      if (video.paused) {
        // Ensure muted is set before play (iOS requirement)
        video.muted = true;
        video.play().catch(() => {
          // Silently handle play() errors (common on iOS)
        });
      }
    };

    // Try to play when video can play
    video.addEventListener('canplay', playVideo);
    video.addEventListener('loadeddata', playVideo);
    video.addEventListener('loadedmetadata', playVideo);

    // Resume on any user gesture (iOS often needs this)
    const resumeOnGesture = () => {
      playVideo();
    };

    document.addEventListener('touchstart', resumeOnGesture, { passive: true });
    document.addEventListener('touchend', resumeOnGesture, { passive: true });
    document.addEventListener('click', resumeOnGesture, { passive: true });
    document.addEventListener('scroll', resumeOnGesture, { passive: true, once: true });

    // Initial attempt after a small delay (helps iOS)
    setTimeout(playVideo, 100);
    setTimeout(playVideo, 500);

    return () => {
      video.removeEventListener('canplay', playVideo);
      video.removeEventListener('loadeddata', playVideo);
      video.removeEventListener('loadedmetadata', playVideo);
      document.removeEventListener('touchstart', resumeOnGesture);
      document.removeEventListener('touchend', resumeOnGesture);
      document.removeEventListener('click', resumeOnGesture);
      document.removeEventListener('scroll', resumeOnGesture);
    };
  }, [safeVideoSrc]);

  return (
    <video
      data-role="menu-background-video"
      ref={videoRef}
      key={safeVideoSrc}
      autoPlay
      muted
      loop
      playsInline
      webkit-playsinline="true"
      preload="auto"
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        video.muted = true;
        requestAnimationFrame(() => {
          video.play().catch(() => {});
        });
      }}
      poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: isVertical && viewMode === 'web' ? 'center 40%' : 'center',
        pointerEvents: 'none',
        zIndex: 0,
        transform: isVertical && viewMode === 'web' ? 'scale(1.36) translateY(-2vh)' : (isVertical ? 'scale(1.32)' : (viewMode === 'menu' ? 'scale(1.20) translateY(-3vh)' : 'scale(1)')),
        background: (viewMode === 'menu' || viewMode === 'web') ? 'linear-gradient(to top, rgba(179, 179, 179, 1) 0%, rgba(185, 185, 185, 1) 8%, rgba(210, 210, 210, 1) 25%, rgba(240, 240, 240, 1) 50%, rgba(255, 255, 255, 1) 70%)' : '#000',
      }}
    >
      <source src={safeVideoSrc} type="video/mp4" />
    </video>
  );
}

/**
 * Legacy VideoStage component (kept for compatibility, but moved video to outer container).
 * This is now a placeholder - videos are rendered in the outer container.
 */
function VideoStage({ videoSrc, layout }) {
  // Videos are now rendered in the outer container, so this is a no-op
  return null;
}

function ArrowButtons({ onPrev, onNext, color = '#888', hoverColor = '#222', size = 56, noHover = false }) {
  const arrowFontSize = size * 0.4; // Scale font size relative to button size
  const base = {
    background: 'transparent',
    color,
    border: 'none',
    borderRadius: '50%',
    width: size,
    height: size,
    fontSize: `${arrowFontSize}px`,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    transition: noHover ? 'none' : 'all 0.2s ease',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  };

  const hoverHandlers = (isNext) => noHover ? {
    onClick: isNext ? onNext : onPrev,
  } : {
    onMouseEnter: (e) => {
      e.currentTarget.style.color = hoverColor;
      e.currentTarget.style.transform = 'scale(1.1)';
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.color = color;
      e.currentTarget.style.transform = 'scale(1)';
    },
    onClick: isNext ? onNext : onPrev,
  };

  const svgSize = Math.round(size * 0.6);
  const strokeWidth = Math.max(2, Math.round(size / 28));
  
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: size * 0.5, pointerEvents: 'auto' }}>
      <button aria-label="Previous" style={base} {...hoverHandlers(false)}>
        <svg width={svgSize} height={svgSize} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button aria-label="Next" style={base} {...hoverHandlers(true)}>
        <svg width={svgSize} height={svgSize} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Core subpage component adapted to AR layout.
 */
function EchoCocktailSubpage2({
  videoFiles = [],
  cocktailInfo = {},
  title = '',
  selected,
  setSelected,
  subpageOrder,
  sidebarOpen,
  setSidebarOpen,
  viewMode = 'web',
  orientationOverride,
  outerWidthOverride,
  outerHeightOverride,
  galleryRef,
  selectedCocktails: propSelectedCocktails,
  setSelectedCocktails: propSetSelectedCocktails,
  initialIndex,
  onIndexSet,
  onAllItemsClick,
  onFullMenuClick,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex !== null && initialIndex !== undefined ? initialIndex : 0);
  const [fadeStage, setFadeStage] = useState('in'); // 'in' | 'out'
  const [pendingIndex, setPendingIndex] = useState(null);
  const [initialIndexSet, setInitialIndexSet] = useState(false);

  // Handle initial index navigation
  useEffect(() => {
    if (initialIndex !== null && initialIndex !== undefined && videoFiles.length > 0) {
      if (initialIndex >= 0 && initialIndex < videoFiles.length) {
        console.log('[EchoCocktailSubpage2] Navigating to initialIndex:', initialIndex, 'current:', currentIndex);
        setCurrentIndex(initialIndex);
        setInitialIndexSet(true);
        if (onIndexSet) {
          setTimeout(() => onIndexSet(initialIndex), 100);
        }
      }
    }
  }, [initialIndex, videoFiles.length, onIndexSet]);
  const [pendingPage, setPendingPage] = useState(null);
  const [boxesVisible, setBoxesVisible] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [showConceptInfo, setShowConceptInfo] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [isNavHovered, setIsNavHovered] = useState(false);
  // Checkmark state management
  // Use props if provided, otherwise use local state
  const [localSelectedCocktails, setLocalSelectedCocktails] = useState([]);
  
  // Use props if provided, otherwise use local state
  const selectedCocktailsList = propSelectedCocktails !== undefined ? propSelectedCocktails : localSelectedCocktails;
  const setSelectedCocktailsList = propSetSelectedCocktails !== undefined ? propSetSelectedCocktails : setLocalSelectedCocktails;
  const [hasCheckmark, setHasCheckmark] = useState(false);
  const [allowCheckmarkFade, setAllowCheckmarkFade] = useState(false);
  const [currentCocktailName, setCurrentCocktailName] = useState('');
  const [edgeColor, setEdgeColor] = useState('rgba(210, 210, 210, 1)');
  const [edgeRgb, setEdgeRgb] = useState({ r: 210, g: 210, b: 210 });
  const [topRgb, setTopRgb] = useState({ r: 255, g: 255, b: 255 });
  const [middleRgb, setMiddleRgb] = useState({ r: 235, g: 235, b: 235 });
  const [bottomRgb, setBottomRgb] = useState({ r: 210, g: 210, b: 210 });
  const animationTimeoutsRef = useRef([]);
  const titleRef = useRef(null);
  const ingredientsContainerRef = useRef(null);
  const infoConceptContainerRef = useRef(null);
  const bottomControlsRef = useRef(null);
  const navBarRef = useRef(null);
  const innerContainerRef = useRef(null);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);
  const [verticalInfoFontScale, setVerticalInfoFontScale] = useState(1);
  const [bottomControlsHeight, setBottomControlsHeight] = useState(60);

  const [ref, size] = useContainerSize(outerWidthOverride, outerHeightOverride, viewMode);
  const [forceRecalc, setForceRecalc] = useState(0);
  
  // Force layout recalculation on button clicks in web mode
  useEffect(() => {
    if (viewMode === 'web' && !outerWidthOverride && !outerHeightOverride) {
      // Trigger resize event to ensure proper centering
      window.dispatchEvent(new Event('resize'));
    }
  }, [currentIndex, selected, forceRecalc, viewMode, outerWidthOverride, outerHeightOverride]);
  
  const layout = useMemo(() => {
    if (!orientationOverride) return computeStageLayout(size.width, size.height, viewMode);

    const outerWidth = size.width;
    const outerHeight = size.height;
    const innerAR = orientationOverride === 'horizontal' ? 16 / 10 : 9 / 19;
    let innerFit;
    let innerWidth;
    let innerHeight;

    if (orientationOverride === 'horizontal') {
      if (outerWidth / outerHeight <= innerAR) {
        innerFit = 'width';
        innerWidth = outerWidth;
        innerHeight = innerWidth / innerAR;
      } else {
        innerFit = 'height';
        innerHeight = outerHeight;
        innerWidth = innerHeight * innerAR;
      }
      // Scale inner container by 1.10x to extend beyond screen edge (only in app/menu mode)
      if (viewMode === 'menu') {
        innerWidth *= 1.10;
        innerHeight *= 1.10;
      }
    } else {
      // For vertical: always fit by height
        innerFit = 'height';
        innerHeight = outerHeight;
        innerWidth = innerHeight * innerAR;
        // Scale inner container by 1.10x in web mode for vertical orientation
        if (viewMode === 'web') {
          innerWidth *= 1.10;
          innerHeight *= 1.10;
        }
    }

    // Video fit: for vertical, always fit by height; for horizontal, use inverse of inner fit
    const videoFit = orientationOverride === 'vertical' ? 'height' : (innerFit === 'width' ? 'height' : 'width');
    const videoSize = videoFit === 'width' ? { width: innerWidth, height: innerWidth } : { width: innerHeight, height: innerHeight };

    return {
      orientation: orientationOverride,
      inner: { width: innerWidth, height: innerHeight, fit: innerFit },
      video: { ...videoSize, fit: videoFit },
    };
  }, [size.width, size.height, orientationOverride, viewMode]);

  const isVertical = layout.orientation === 'vertical';
  const innerLeft = (size.width - layout.inner.width) / 2;
  // Move video up 10% screen height in vertical web mode
  // Move video up 6vh in horizontal menu view (but not title/ingredients/garnish)
  const verticalOffset = isVertical && viewMode === 'web' 
    ? -size.height * 0.10 
    : (!isVertical && viewMode === 'menu' ? -size.height * 0.06 : 0);
  const innerTop = (size.height - layout.inner.height) / 2 + verticalOffset;
  // Title/ingredients/garnish offset: half of map/countries/concept offset in menu view
  const titleOffset = !isVertical && viewMode === 'menu' ? -size.height * 0.03 : 0;
  const originalInnerTop = (size.height - layout.inner.height) / 2 + titleOffset;
  const arrowY = innerTop + layout.inner.height * 0.8;

  // Animation states (kept from original)
  const [titleVisible, setTitleVisible] = useState(false);
  const [ingredientsVisible, setIngredientsVisible] = useState(false);
  const [garnishVisible, setGarnishVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [countriesVisible, setCountriesVisible] = useState([]);
  const [countriesSidebarVisible, setCountriesSidebarVisible] = useState(true);
  const [conceptVisible, setConceptVisible] = useState(false);

  const currentFile = videoFiles[currentIndex];
  const info = currentFile ? cocktailInfo[currentFile] : null;
  const countryDisplayList = info ? getCountryDisplayList(info) : [];

  // Helpers
  const resetAnimations = useCallback(() => {
    setTitleVisible(false);
    setIngredientsVisible(false);
    setGarnishVisible(false);
    setMapVisible(false);
    setCountriesVisible([]);
    setCountriesSidebarVisible(false);
    setConceptVisible(false);
  }, []);

  // Reset index to 0 when category changes
  useEffect(() => {
    setCurrentIndex(0);
    resetAnimations();
    setBoxesVisible(false);
    setShowConceptInfo(false);
    setShowCategories(false);
  }, [selected, resetAnimations]);

  useEffect(() => {
    setVerticalInfoFontScale(1);
  }, [currentIndex, showConceptInfo]);

  useEffect(() => {
    if (!isVertical) return;

    const container = infoConceptContainerRef.current;
    if (!container) return;

    const shouldMeasure = showConceptInfo ? conceptVisible : (ingredientsVisible || garnishVisible);
    if (!shouldMeasure) return;

    const measure = () => {
      const minScale = 0.75;
      const maxScale = 1.45;
      const epsilon = 1;
      const iters = 12;

      const prev = container.style.getPropertyValue('--verticalInfoFontScale');

      const fitsAt = (scale) => {
        container.style.setProperty('--verticalInfoFontScale', String(scale));
        return container.scrollHeight <= container.clientHeight + epsilon;
      };

      if (!fitsAt(minScale)) {
        setVerticalInfoFontScale(minScale);
        if (prev) container.style.setProperty('--verticalInfoFontScale', prev);
        else container.style.removeProperty('--verticalInfoFontScale');
        return;
      }

      let lo = minScale;
      let hi = maxScale;
      let best = minScale;

      for (let i = 0; i < iters; i += 1) {
        const mid = Number(((lo + hi) / 2).toFixed(3));
        if (fitsAt(mid)) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      setVerticalInfoFontScale(best);

      if (prev) container.style.setProperty('--verticalInfoFontScale', prev);
      else container.style.removeProperty('--verticalInfoFontScale');
    };

    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    return () => cancelAnimationFrame(raf);
  }, [isVertical, showConceptInfo, conceptVisible, ingredientsVisible, garnishVisible, verticalInfoFontScale, info?.ingredients, info?.garnish, info?.concept]);

  useEffect(() => {
    if (!isVertical) return;
    if (typeof ResizeObserver === 'undefined') return;

    const el = bottomControlsRef.current;
    if (!el) return;

    const update = () => {
      const next = Math.round(el.getBoundingClientRect().height || 0);
      if (next > 0) setBottomControlsHeight(next);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isVertical]);

  // Prefer cloudinaryVideoUrl, fallback to videoUrl; only transform if it's Cloudinary
  const videoSrc = info?.cloudinaryVideoUrl || info?.videoUrl || '';
  

  // Function to scroll gallery container so BOTTOM aligns with viewport bottom (match Home MENU button behavior)
  const scrollToBottomAlign = useCallback(() => {
    if (viewMode !== 'web' || !galleryRef?.current) return;
    
    const galleryElement = galleryRef.current;
    const rect = galleryElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const viewportHeight = window.innerHeight;
    const sectionHeight = rect.height;

    // Align bottom of section with bottom of viewport
    const targetScroll = scrollTop + rect.top + sectionHeight - viewportHeight;

    // Force mobile browser UI to hide: scroll slightly more first, then correct
    // This triggers the address bar to hide on mobile browsers
    window.scrollBy({ top: 1, behavior: 'auto' });
    setTimeout(() => {
      window.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }, 10);
  }, [viewMode, galleryRef]);

  // Swipe gesture handlers
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  };
  
  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };
  
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;
    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        handleNext(); // Swipe left = next
      } else {
        handlePrev(); // Swipe right = prev
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Fade logic for prev/next
  const handlePrev = (e) => {
    e?.currentTarget?.blur?.();
    // Remove all checkmarks when arrow is clicked
    const allCheckmarks = document.querySelectorAll('.pos-checkmark');
    allCheckmarks.forEach(checkmark => checkmark.remove());
    setHasCheckmark(false);
    
    // Enable fade (becomes TRUE when arrow is clicked)
    setAllowCheckmarkFade(true);
    
    const newIndex = (currentIndex - 1 + videoFiles.length) % videoFiles.length;
    resetAnimations();
    setBoxesVisible(false);
    setFadeStage('out');
    setPendingIndex(newIndex);
    setShowConceptInfo(false);
    setShowCategories(false);
    if (viewMode === 'web') setForceRecalc(prev => prev + 1);
    // Scroll to align bottom with viewport
    setTimeout(scrollToBottomAlign, 100);
  };

  const handleNext = (e) => {
    e?.currentTarget?.blur?.();
    // Remove all checkmarks when arrow is clicked
    const allCheckmarks = document.querySelectorAll('.pos-checkmark');
    allCheckmarks.forEach(checkmark => checkmark.remove());
    setHasCheckmark(false);
    
    // Enable fade (becomes TRUE when arrow is clicked)
    setAllowCheckmarkFade(true);
    
    const newIndex = (currentIndex + 1) % videoFiles.length;
    resetAnimations();
    setBoxesVisible(false);
    setFadeStage('out');
    setPendingIndex(newIndex);
    setShowConceptInfo(false);
    setShowCategories(false);
    if (viewMode === 'web') setForceRecalc(prev => prev + 1);
    // Scroll to align bottom with viewport
    setTimeout(scrollToBottomAlign, 100);
  };

  const handleSidebarNav = (key) => {
    if (key !== selected) {
      // Remove all checkmarks when category is changed
      const allCheckmarks = document.querySelectorAll('.pos-checkmark');
      allCheckmarks.forEach(checkmark => checkmark.remove());
      setHasCheckmark(false);
      
      // Enable fade for new cocktail
      setAllowCheckmarkFade(true);
      
      resetAnimations();
      setBoxesVisible(false);
      setFadeStage('out');
      setPendingPage(key);
      setShowConceptInfo(false);
      setShowCategories(false);
      if (viewMode === 'web') setForceRecalc(prev => prev + 1);
    }
    if (setSidebarOpen) setSidebarOpen(false);
    // Scroll to align bottom with viewport
    setTimeout(scrollToBottomAlign, 100);
  };

  // Checkmark management functions
  const positionCheckmark = (titleEl, checkmark) => {
    const titleParent = titleEl.parentElement;
    if (!titleParent || !checkmark) return;

    // Ensure parent has position relative for absolute positioning
    const parentStyle = window.getComputedStyle(titleParent);
    if (parentStyle.position === 'static') {
      titleParent.style.position = 'relative';
    }

    const titleRect = titleEl.getBoundingClientRect();
    const parentRect = titleParent.getBoundingClientRect();
    
    if (titleRect.width > 0 && titleRect.height > 0) {
      const relativeLeft = titleRect.left - parentRect.left;
      const relativeTop = titleRect.top - parentRect.top;
      
      checkmark.style.position = 'absolute';
      checkmark.style.left = `${relativeLeft + titleRect.width + 10}px`; // 10px to the right
      checkmark.style.top = `${relativeTop + titleRect.height / 2}px`; // Vertically centered
      checkmark.style.transform = 'translateY(-50%)';
      checkmark.style.visibility = 'visible';
    }
  };

  // Add checkmark immediately (for ADD ITEM button)
  const addCheckmarkImmediately = (cocktailName) => {
    const titleEl = document.querySelector('.cocktail-title');
    if (!titleEl) return;

    const titleParent = titleEl.parentElement;
    if (!titleParent) return;

    // Remove any existing checkmark for this cocktail
    const existingCheckmark = titleParent.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
    if (existingCheckmark) {
      existingCheckmark.remove();
    }

    // Create new checkmark
    const checkmark = document.createElement('span');
    checkmark.className = 'pos-checkmark';
    checkmark.setAttribute('data-cocktail-id', cocktailName);
    checkmark.textContent = '✓';
    
    checkmark.style.cssText = `
      position: absolute;
      color: #009900;
      font-size: 2.5em;
      font-weight: bold;
      display: block;
      z-index: 10000;
      pointer-events: none;
      white-space: nowrap;
      opacity: 0.6;
      transition: none;
      line-height: 1;
      visibility: visible;
    `;
    
    titleParent.appendChild(checkmark);
    positionCheckmark(titleEl, checkmark);
    
    // Update hasCheckmark state if this is the current cocktail
    if (currentCocktailName === cocktailName) {
      setHasCheckmark(true);
    }
  };

  // Remove checkmark immediately (for REMOVE ITEM button)
  const removeCheckmarkImmediately = (cocktailName) => {
    const allCheckmarks = document.querySelectorAll('.pos-checkmark');
    allCheckmarks.forEach(checkmark => {
      if (checkmark.getAttribute('data-cocktail-id') === cocktailName) {
        checkmark.remove();
      }
    });
    
    // Update hasCheckmark state if this is the current cocktail
    if (currentCocktailName === cocktailName) {
      setHasCheckmark(false);
    }
  };

  // Check list and fade in checkmark with title (only when arrow is clicked)
  const checkAndFadeCheckmark = (cocktailName) => {
    if (!allowCheckmarkFade) return; // Only work if fade is enabled (arrow was clicked)
    if (!selectedCocktailsList.includes(cocktailName)) return; // Only if cocktail is in list

    const titleEl = document.querySelector('.cocktail-title');
    if (!titleEl) return;

    const titleParent = titleEl.parentElement;
    if (!titleParent) return;

    // Check if checkmark already exists
    const existingCheckmark = titleParent.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
    if (existingCheckmark) {
      // Update hasCheckmark state if this is the current cocktail
      if (currentCocktailName === cocktailName) {
        setHasCheckmark(true);
      }
      return; // Already exists, don't recreate
    }

    // Create checkmark with fade - sync with title animation timing
    const checkmark = document.createElement('span');
    checkmark.className = 'pos-checkmark';
    checkmark.setAttribute('data-cocktail-id', cocktailName);
    checkmark.textContent = '✓';
    
    // Set initial state (invisible, positioned)
    checkmark.style.cssText = `
      position: absolute;
      color: #00ff00;
      font-size: 2.5em;
      font-weight: bold;
      display: block;
      z-index: 10000;
      pointer-events: none;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1);
      line-height: 1;
      visibility: visible;
    `;
    
    titleParent.appendChild(checkmark);
    positionCheckmark(titleEl, checkmark);
    
    // Update hasCheckmark state if this is the current cocktail
    if (currentCocktailName === cocktailName) {
      setHasCheckmark(true);
    }
    
    // Start fade immediately - title animation delay is already accounted for
    // The checkmark should start fading as soon as it's created to match title timing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (checkmark.parentElement) {
          checkmark.style.opacity = '0.6';
        }
      });
    });
  };

  // Immediate switch on fade out
  useEffect(() => {
    if (fadeStage === 'out') {
      if (pendingIndex !== null) {
        setCurrentIndex(pendingIndex);
        setPendingIndex(null);
      }
      if (pendingPage !== null) {
        setSelected?.(pendingPage);
        setPendingPage(null);
      }
      setFadeStage('in');
      setBoxesVisible(false);
    }
  }, [fadeStage, pendingIndex, pendingPage, setSelected]);

  // Effect to update current cocktail name and check for checkmark
  useEffect(() => {
    const updateCurrentCocktail = () => {
      const titleEl = document.querySelector('.cocktail-title');
      if (!titleEl) {
        setTimeout(updateCurrentCocktail, 100);
        return;
      }

      const titleStyle = window.getComputedStyle(titleEl);
      if (titleStyle.opacity === '0' || titleStyle.visibility === 'hidden') {
        setTimeout(updateCurrentCocktail, 100);
        return;
      }

      // Get cocktail name
      let cocktailName = titleEl.textContent.trim();
      cocktailName = cocktailName.replace(/✓/g, '').trim();
      
      if (cocktailName && cocktailName !== currentCocktailName) {
        setCurrentCocktailName(cocktailName);
        
        // Check if cocktail is in selectedCocktails list
        const isSelected = selectedCocktailsList.includes(cocktailName);
        setHasCheckmark(isSelected);
        
        // Check if checkmark exists for this cocktail
        const checkmark = document.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
        
        if (isSelected && !checkmark) {
          // Cocktail is selected but checkmark doesn't exist - create it
          if (allowCheckmarkFade) {
            // Fade in if navigating
            checkAndFadeCheckmark(cocktailName);
          } else {
            // Show immediately if not navigating
            addCheckmarkImmediately(cocktailName);
          }
        } else if (!isSelected && checkmark) {
          // Cocktail is not selected but checkmark exists - remove it
          removeCheckmarkImmediately(cocktailName);
        } else if (isSelected && checkmark) {
          // Cocktail is selected and checkmark exists - ensure it's visible
          setHasCheckmark(true);
        }
      } else if (cocktailName === currentCocktailName) {
        // Even if name hasn't changed, re-check checkmark state (in case it was added/removed from Info page)
        const isSelected = selectedCocktailsList.includes(cocktailName);
        const checkmark = document.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
        
        if (isSelected && !checkmark) {
          // Cocktail was added to selectedCocktails (e.g., from Info page) - show checkmark
          addCheckmarkImmediately(cocktailName);
        } else if (!isSelected && checkmark) {
          // Cocktail was removed from selectedCocktails - remove checkmark
          removeCheckmarkImmediately(cocktailName);
        } else {
          setHasCheckmark(isSelected);
        }
      }
    };

    // Update immediately and on interval
    updateCurrentCocktail();
    const interval = setInterval(updateCurrentCocktail, 300); // More frequent checks
    
    return () => clearInterval(interval);
  }, [titleVisible, allowCheckmarkFade, selectedCocktailsList, currentCocktailName]);

  // Effect to sync checkmarks when selectedCocktailsList changes (e.g., from Info page)
  useEffect(() => {
    // Wait a bit for title to be visible
    const syncCheckmarks = () => {
      const titleEl = document.querySelector('.cocktail-title');
      if (!titleEl) {
        setTimeout(syncCheckmarks, 100);
        return;
      }

      const titleStyle = window.getComputedStyle(titleEl);
      if (titleStyle.opacity === '0' || titleStyle.visibility === 'hidden') {
        setTimeout(syncCheckmarks, 100);
        return;
      }

      // Get current cocktail name
      let cocktailName = titleEl.textContent.trim();
      cocktailName = cocktailName.replace(/✓/g, '').trim();
      
      if (cocktailName) {
        const isSelected = selectedCocktailsList.includes(cocktailName);
        const checkmark = document.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
        
        if (isSelected && !checkmark) {
          // Should have checkmark but doesn't - add it
          addCheckmarkImmediately(cocktailName);
        } else if (!isSelected && checkmark) {
          // Shouldn't have checkmark but does - remove it
          removeCheckmarkImmediately(cocktailName);
        }
        
        // Update hasCheckmark state
        setHasCheckmark(isSelected);
      }
    };

    // Sync after a short delay to ensure DOM is ready
    const timeout = setTimeout(syncCheckmarks, 200);
    return () => clearTimeout(timeout);
  }, [selectedCocktailsList, titleVisible, currentCocktailName, addCheckmarkImmediately, removeCheckmarkImmediately, setHasCheckmark]);

  // Staggered animations when index changes
  useEffect(() => {
    if (currentIndex === null || videoFiles.length === 0) return;
    animationTimeoutsRef.current.forEach((id) => clearTimeout(id));
    animationTimeoutsRef.current = [];

    resetAnimations();
    setBoxesVisible(false);
    setShowConceptInfo(false);
    setShowCategories(false);

    const count = countryDisplayList.length;
    // Limit visible count to 5 (4 countries + "..." indicator)
    const visibleCount = Math.min(count, 5);
    setCountriesVisible(new Array(visibleCount).fill(false));

    if (isVertical) {
      // Vertical view: controlled by info button
      if (showConceptInfo) {
        // Show concept, map, and countries
        const conceptMapTimeout = setTimeout(() => {
          setConceptVisible(true);
          setMapVisible(true);
          setCountriesSidebarVisible(true);
        }, 400);
        animationTimeoutsRef.current.push(conceptMapTimeout);

        for (let i = 0; i < visibleCount; i++) {
          const countryTimeout = setTimeout(() => {
            setCountriesVisible((prev) => {
              if (prev.length !== visibleCount) return prev;
              const next = [...prev];
              next[i] = true;
              return next;
            });
          }, 1000 + i * 500);
          animationTimeoutsRef.current.push(countryTimeout);
        }
      } else {
        // Show title, ingredients, and garnish
        const titleTimeout = setTimeout(() => {
          setTitleVisible(true);
          const ingredientsTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // 1) Scale font to 100% fit
                scaleFontToFitRef.current?.();
                // 2) Brief hesitation, then adjust separators row by row
                const separatorTimeout = setTimeout(async () => {
                  await adjustSeparatorsRef.current?.();
                  // 3) Fade in after all rows processed
                  setIngredientsVisible(true);
                  const garnishTimeout = setTimeout(() => setGarnishVisible(true), 300);
                  animationTimeoutsRef.current.push(garnishTimeout);
                }, 50);
                animationTimeoutsRef.current.push(separatorTimeout);
              });
            });
          }, 400);
          animationTimeoutsRef.current.push(ingredientsTimeout);
        }, 500);
        animationTimeoutsRef.current.push(titleTimeout);
      }
    } else {
      // Horizontal view: original animation sequence
    const titleTimeout = setTimeout(() => {
      setTitleVisible(true);
      const ingredientsTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            adjustSeparatorsRef.current?.();
            setIngredientsVisible(true);
          });
        });
        const garnishTimeout = setTimeout(() => setGarnishVisible(true), 300);
        animationTimeoutsRef.current.push(garnishTimeout);
      }, 400);
      animationTimeoutsRef.current.push(ingredientsTimeout);
    }, 500);
    animationTimeoutsRef.current.push(titleTimeout);

      // Map: fade in starting at 0.5s (same as title)
      const mapTimeout = setTimeout(() => {
        setMapVisible(true);
      }, 500);
    animationTimeoutsRef.current.push(mapTimeout);

      // Concept: fade in after map (staggered)
      const conceptTimeout = setTimeout(() => {
        setConceptVisible(true);
      }, 800);
      animationTimeoutsRef.current.push(conceptTimeout);

      // Show countries in horizontal view
    for (let i = 0; i < visibleCount; i++) {
      const countryTimeout = setTimeout(() => {
        setCountriesVisible((prev) => {
          if (prev.length !== visibleCount) return prev;
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, 1000 + i * 500);
      animationTimeoutsRef.current.push(countryTimeout);
      }
    }

    const boxesTimeout = setTimeout(() => setBoxesVisible(true), 150);
    animationTimeoutsRef.current.push(boxesTimeout);

    return () => {
      animationTimeoutsRef.current.forEach((id) => clearTimeout(id));
      animationTimeoutsRef.current = [];
    };
  }, [currentIndex, videoFiles.length, countryDisplayList.length, resetAnimations, isVertical]);

  // Adjust separators at line boundaries - runs BEFORE fade-in
  // Returns a promise that resolves when all rows are processed
  const adjustSeparatorsRef = useRef(null);
  
  adjustSeparatorsRef.current = useCallback(() => {
    return new Promise((resolve) => {
      const container = ingredientsContainerRef.current;
      if (!container) {
        resolve();
        return;
      }
      
      const separators = Array.from(container.querySelectorAll('.ingredient-separator'));
      if (separators.length === 0) {
        resolve();
        return;
      }

      // Reset all separators first
      separators.forEach((sep) => {
        sep.style.display = 'inline';
        sep.style.visibility = 'visible';
        const dash = sep.querySelector('.sep-dash');
        if (dash) {
          dash.style.display = 'inline';
          dash.style.visibility = 'visible';
        }
      });

      // Group separators by row (based on their top position)
      const getRowTop = (el) => Math.round(el.getBoundingClientRect().top);
      const rows = [];
      let currentRowTop = null;
      let currentRowSeparators = [];

      separators.forEach((sep) => {
        const sepTop = getRowTop(sep);
        if (currentRowTop === null || Math.abs(sepTop - currentRowTop) <= 5) {
          currentRowTop = currentRowTop ?? sepTop;
          currentRowSeparators.push(sep);
        } else {
          if (currentRowSeparators.length > 0) {
            rows.push(currentRowSeparators);
          }
          currentRowTop = sepTop;
          currentRowSeparators = [sep];
        }
      });
      if (currentRowSeparators.length > 0) {
        rows.push(currentRowSeparators);
      }

      // Process each row sequentially
      let rowIndex = 0;

      const processRow = () => {
        if (rowIndex >= rows.length) {
          resolve();
          return;
        }

        const rowSeparators = rows[rowIndex];
        const isFirstRow = rowIndex === 0;

        // For first row: only check trailing
        // For subsequent rows: first check leading, then trailing
        rowSeparators.forEach((sep) => {
          const sepRect = sep.getBoundingClientRect();
          const prev = sep.previousElementSibling;
          const next = sep.nextElementSibling;

          // Leading check (not for first row)
          if (!isFirstRow && prev) {
            const prevRect = prev.getBoundingClientRect();
            const space = sep.querySelector('.sep-space');
            const dash = sep.querySelector('.sep-dash');
            
            if (space && dash) {
              const spaceRect = space.getBoundingClientRect();
              const dashRect = dash.getBoundingClientRect();
              
              // If space is on previous line but dash wrapped to new line
              // Only remove the dash, keep the space
              if (spaceRect.top <= prevRect.top + 5 && dashRect.top > prevRect.top + 5) {
                dash.style.display = 'none';
                return; // Skip trailing check
              }
              
              // If whole separator wrapped to new line, remove it all
              if (spaceRect.top > prevRect.top + 5) {
                sep.style.display = 'none';
                return; // Skip trailing check if removed
              }
            }
          }

          // Trailing check - only hide the "- " part, keep the leading space
          if (next) {
            const nextRect = next.getBoundingClientRect();
            if (nextRect.top > sepRect.top + 5) {
              const dash = sep.querySelector('.sep-dash');
              if (dash) {
                dash.style.visibility = 'hidden';
              }
            }
          }
        });

        rowIndex++;
        requestAnimationFrame(processRow);
      };

      requestAnimationFrame(processRow);
    });
  }, []);

  // Scale font to fit container - runs BEFORE fade-in (vertical only)
  const scaleFontToFitRef = useRef(null);
  
  scaleFontToFitRef.current = useCallback(() => {
    if (!isVertical) return;
    const container = infoConceptContainerRef.current;
    if (!container) return;

    const minScale = 0.75;
    const maxScale = 1.45;
    const epsilon = 1;
    const iters = 12;

    const fitsAt = (scale) => {
      container.style.setProperty('--verticalInfoFontScale', String(scale));
      // Use 100% of container height
      return container.scrollHeight <= container.clientHeight + epsilon;
    };

    if (!fitsAt(minScale)) {
      setVerticalInfoFontScale(minScale);
      return;
    }

    let lo = minScale;
    let hi = maxScale;
    let best = minScale;

    for (let i = 0; i < iters; i += 1) {
      const mid = Number(((lo + hi) / 2).toFixed(3));
      if (fitsAt(mid)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    setVerticalInfoFontScale(best);
  }, [isVertical]);

  // Run separator adjustment on layout changes and resize
  useEffect(() => {
    if (!ingredientsContainerRef.current) return;
    if (isVertical && showConceptInfo) return;
    
    const container = ingredientsContainerRef.current;
    
    // Run immediately on mount/change
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        adjustSeparatorsRef.current?.();
      });
    });
    
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        adjustSeparatorsRef.current?.();
      });
    });
    resizeObserver.observe(container);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [currentIndex, info?.ingredients, layout, isVertical, showConceptInfo]);

  // Sample center-left pixel color for fade overlay
  useEffect(() => {
    if (!isVertical || !layout?.inner) return;
    
    const samplePixels = () => {
      // Find the video element
      const video = document.querySelector('video[data-role="menu-background-video"]');
      if (!video || video.readyState < 2) return; // Video not ready

      if (isProbablyIOS()) {
        setTopRgb({ r: 255, g: 255, b: 255 });
        setMiddleRgb({ r: 235, g: 235, b: 235 });
        setBottomRgb({ r: 210, g: 210, b: 210 });
        setEdgeColor('rgba(210, 210, 210, 1)');
        setEdgeRgb({ r: 210, g: 210, b: 210 });
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Sample top-left pixel (x = 0, y = 0)
        ctx.drawImage(video, 0, 0, 1, 1, 0, 0, 1, 1);
        const topData = ctx.getImageData(0, 0, 1, 1);
        const [topR, topG, topB] = topData.data;
        setTopRgb({ r: topR, g: topG, b: topB });

        // Sample middle-left pixel (x = 0, y = center)
        const middleY = video.videoHeight / 2;
        ctx.drawImage(video, 0, middleY, 1, 1, 0, 0, 1, 1);
        const middleData = ctx.getImageData(0, 0, 1, 1);
        const [middleR, middleG, middleB] = middleData.data;
        setMiddleRgb({ r: middleR, g: middleG, b: middleB });

        // Sample bottom-left pixel (x = 0, y = bottom)
        const bottomY = video.videoHeight - 1;
        ctx.drawImage(video, 0, bottomY, 1, 1, 0, 0, 1, 1);
        const bottomData = ctx.getImageData(0, 0, 1, 1);
        const [bottomR, bottomG, bottomB] = bottomData.data;
        setBottomRgb({ r: bottomR, g: bottomG, b: bottomB });

        // Keep middle for backward compatibility
        setEdgeColor(`rgba(${middleR}, ${middleG}, ${middleB}, 1)`);
        setEdgeRgb({ r: middleR, g: middleG, b: middleB });
      } catch {
        return;
      }
    };
    
    // Try to sample when video is ready
    const video = document.querySelector('video[data-role="menu-background-video"]');
    if (video) {
      if (video.readyState >= 2) {
        samplePixels();
      } else {
        video.addEventListener('loadeddata', samplePixels, { once: true });
        video.addEventListener('timeupdate', samplePixels, { once: true });
      }
    }
    
    // Also try after a delay to ensure video is playing
    const timeout = setTimeout(samplePixels, 500);
    
    return () => {
      clearTimeout(timeout);
      if (video) {
        video.removeEventListener('loadeddata', samplePixels);
        video.removeEventListener('timeupdate', samplePixels);
      }
    };
  }, [isVertical, layout, currentIndex, videoSrc]);

  // Render helpers (styles simplified to avoid filters/overlays)
  const getTitleFontSize = () => {
    if (!layout?.inner?.height) return isVertical ? '1.2rem' : '1.95rem';
    // Scale with inner height; slightly larger range.
    const px = isVertical ? layout.inner.height / 35 : layout.inner.height / 26;
    const clamped = isVertical ? Math.max(14, Math.min(24, px)) : Math.max(17, Math.min(32, px));
    return `${clamped.toFixed(1)}px`;
  };

  const getFontSize = (baseDivisor, minRem = 0.8, maxRem = 2.5) => {
    if (!layout?.inner?.height) return `${minRem}rem`;
    const px = layout.inner.height / baseDivisor;
    const minPx = (minRem * 16);
    const maxPx = (maxRem * 16);
    const clamped = Math.max(minPx, Math.min(maxPx, px));
    return `${clamped.toFixed(1)}px`;
  };

  const renderTitleBlock = () => {
    if (!info?.name) return null;
    const baseHeight = layout?.inner?.height ? (isVertical ? layout.inner.height / 20 : layout.inner.height / 15) : null;
    return (
      <div
        ref={titleRef}
        className="cocktail-title"
        style={{
          width: '100%',
          height: 'auto',
          minHeight: baseHeight ? `${baseHeight}px` : 'auto',
          maxHeight: baseHeight ? `${baseHeight * 2}px` : 'none',
          padding: isVertical ? '0.3rem 0.6rem' : '0.4rem 0.8rem',
          fontSize: getTitleFontSize(),
          fontWeight: 300,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: '0.12em',
          background: 'transparent',
          color: '#111',
          border: '2px solid',
          borderImage: 'linear-gradient(to bottom, #222, #aaa) 1',
          opacity: titleVisible ? 1 : 0,
          transition: titleVisible ? 'opacity 0.9s ease' : 'none',
          boxSizing: 'border-box',
        }}
      >
        {info.name.toUpperCase()}
      </div>
    );
  };

  const renderIngredients = () => {
    const items = normalizeIngredients(info?.ingredients);
    if (items.length === 0) return null;
    const ingredientsPaddingTop = isVertical
      ? '0.75rem'
      : layout?.inner?.height
        ? `${(layout.inner.height / 16).toFixed(1)}px`
        : '0.75rem';
    const ingredientsBottomPadding = isVertical
      ? '0.75rem'
      : layout?.inner?.height
        ? `${(layout.inner.height / 24).toFixed(1)}px`
        : '0.75rem';
    return (
      <div
        style={{
          paddingTop: ingredientsPaddingTop,
          paddingBottom: ingredientsBottomPadding,
          paddingLeft: isVertical ? 0 : (layout?.inner?.height ? `${(layout.inner.height / 64).toFixed(1)}px` : '0.35rem'),
          paddingRight: (isVertical && isProbablyMobileDevice()) ? '16.6667vw' : (isVertical ? 0 : 0),
          opacity: ingredientsVisible ? 1 : 0,
          transition: ingredientsVisible ? 'opacity 1.5s ease-out' : 'none',
          color: '#555',
          lineHeight: 1.4,
        }}
      >
        <div
          style={{
            textTransform: 'uppercase',
            fontWeight: 300,
            fontSize: isVertical ? getFontSize(55, 0.9, 1.4) : getFontSize(35, 1.1, 1.8),
            marginBottom: '0.4rem',
            color: '#222',
          }}
        >
          Ingredients
        </div>
        <div
          ref={ingredientsContainerRef}
          style={{
            fontSize: isVertical ? `calc(${getFontSize(58, 0.85, 1.3)} * var(--verticalInfoFontScale, 1))` : getFontSize(40, 1.0, 1.6),
            marginBottom: 0,
            lineHeight: isVertical ? '1.2' : '1.4',
          }}
        >
          {items.map((item, idx) => (
            <React.Fragment key={idx}>
              <span style={{ whiteSpace: 'nowrap' }}>{item}</span>
              {idx < items.length - 1 && (
                <span className="ingredient-separator">
                  <span className="sep-space"> </span>
                  <span className="sep-dash">- </span>
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderGarnish = () => {
    if (!info?.garnish) return null;
    return (
      <div
        style={{
          marginTop: 0,
          paddingLeft: isVertical ? 0 : (layout?.inner?.height ? `${(layout.inner.height / 64).toFixed(1)}px` : '0.35rem'),
          paddingBottom: (isVertical && isProbablyMobileDevice()) ? '12px' : 0,
          opacity: garnishVisible ? 1 : 0,
          transition: garnishVisible ? 'opacity 1.5s ease-out' : 'none',
          color: '#555',
          lineHeight: 1.4,
        }}
      >
        <div
          style={{
            textTransform: 'uppercase',
            fontWeight: 300,
            fontSize: isVertical ? getFontSize(55, 0.9, 1.4) : getFontSize(40, 0.9, 1.4),
            marginBottom: '0.4rem',
            color: '#222',
          }}
        >
          Garnish
        </div>
        <div style={{ fontSize: isVertical ? `calc(${getFontSize(58, 0.85, 1.3)} * var(--verticalInfoFontScale, 1))` : getFontSize(45, 0.85, 1.3) }}>{info.garnish}</div>
      </div>
    );
  };

  const renderConcept = () => {
    if (!info?.concept) return null;
    if (isVertical) {
      // Vertical layout styling
      const conceptPaddingTop = '0.75rem';
      const conceptBottomPadding = '0.75rem';
    return (
      <div
        style={{
            paddingTop: conceptPaddingTop,
            paddingBottom: conceptBottomPadding,
            paddingLeft: 0,
            opacity: conceptVisible ? 1 : 0,
            transition: conceptVisible ? 'opacity 1.5s ease-out' : 'none',
            color: '#555',
            lineHeight: 1.4,
          }}
        >
          <div
            style={{
              textTransform: 'uppercase',
              fontWeight: 300,
              fontSize: getFontSize(55, 0.9, 1.4),
              marginBottom: '0.4rem',
              color: '#222',
            }}
          >
            Concept
          </div>
          <div style={{ fontSize: `calc(${getFontSize(58, 0.85, 1.3)} * var(--verticalInfoFontScale, 1))`, marginBottom: 0 }}>{info.concept}</div>
        </div>
      );
    } else {
      // Horizontal layout styling (original)
      const conceptPaddingLeft = layout?.inner?.height
        ? `${(layout.inner.height / 6).toFixed(1)}px`
        : '0.75rem';
      const conceptPaddingRight = layout?.inner?.height
        ? `${(layout.inner.height / 16).toFixed(1)}px`
        : '0.75rem';
      return (
        <div
          style={{
            marginTop: 0,
            opacity: conceptVisible ? 1 : 0,
            transform: conceptVisible ? 'translateX(0)' : 'translateX(-20px)',
            transition: conceptVisible ? 'opacity 0.9s ease, transform 0.9s ease' : 'none',
            color: '#555',
            lineHeight: 1.4,
            paddingLeft: conceptPaddingLeft,
            paddingRight: conceptPaddingRight,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              textTransform: 'uppercase',
              fontWeight: 300,
              fontSize: getFontSize(50, 0.9, 1.4),
              marginBottom: '0.4rem',
              color: '#222',
            }}
          >
            Concept
          </div>
          <div style={{ fontSize: getFontSize(55, 0.85, 1.3) }}>{info.concept}</div>
        </div>
      );
    }
  };

  const renderMap = () => {
    // Prioritize Cloudinary map URLs - NO FALLBACK to local paths
    let mapSrc = '/assets/images/worldmap.svg'; // Default fallback to SVG
    
    // Priority 1: cloudinaryMapSnapshotUrl (direct Cloudinary field)
    if (isCloudinaryUrl(info?.cloudinaryMapSnapshotUrl)) {
      mapSrc = info.cloudinaryMapSnapshotUrl;
    } 
    // Priority 2: mapSnapshotUrl (virtual that should prefer Cloudinary)
    else if (isCloudinaryUrl(info?.mapSnapshotUrl)) {
      mapSrc = info.mapSnapshotUrl;
    } 
    // Priority 3: mapSnapshot (if it's a Cloudinary URL)
    else if (isCloudinaryUrl(info?.mapSnapshot)) {
      mapSrc = info.mapSnapshot;
    }
    // If no valid Cloudinary URL, use default SVG (don't use local paths)
    
    if (isVertical) {
      // Vertical layout styling
      return (
    <div
      style={{
        position: 'relative',
        zIndex: 11,
        transition: mapVisible ? 'opacity 1s ease' : 'none',
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        paddingLeft: '46px',
        paddingRight: '78px',
        paddingBottom: 0,
        boxSizing: 'border-box',
      }}
    >
          <img src={mapSrc} alt="World Map" style={{ width: '100%', height: 'auto', objectFit: 'contain', mixBlendMode: 'multiply', display: 'block' }} />
    </div>
  );
    } else {
      // Horizontal layout styling (original)
      return (
        <div
          style={{
            opacity: mapVisible ? 1 : 0,
            transition: mapVisible ? 'opacity 1s ease' : 'none',
            width: '100%',
            paddingLeft: layout?.inner?.height ? `${(layout.inner.height / 10).toFixed(1)}px` : '0.75rem',
            paddingRight: layout?.inner?.height ? `${(layout.inner.height / 24).toFixed(1)}px` : '0.75rem',
            boxSizing: 'border-box',
          }}
        >
          <img src={mapSrc} alt="World Map" style={{ width: '100%', height: 'auto', objectFit: 'contain', mixBlendMode: 'multiply' }} />
        </div>
      );
    }
  };

  const renderCountries = () => {
    if (!countryDisplayList.length) return null;
    const countryFontSize = layout?.inner?.height
      ? `${Math.min(12, Math.max(9, (layout.inner.height / 400) * 12)).toFixed(1)}px`
      : '0.85rem';
    const countryGap = layout?.inner?.height
      ? `${Math.max(2, Math.min(8, layout.inner.height / 240)).toFixed(1)}px`
      : '0.25rem';
    const countryMarginTop = 0;
    const countryPaddingTop = 0;
    const countryPaddingBottom = isVertical
      ? '0.75rem'
      : layout?.inner?.height
        ? `${(layout.inner.height / 24).toFixed(1)}px`
        : '0.75rem';
    const countriesPaddingLeft = isVertical
      ? '0'
      : layout?.inner?.height
        ? `${(layout.inner.height / 3).toFixed(1)}px`
        : '1.5rem';
    const countriesPaddingRight = isVertical
      ? `${layout.inner.width / 12}px`
      : layout?.inner?.height
        ? `${(layout.inner.height / 8).toFixed(1)}px`
        : 0;
    return (
      <div style={{
        marginTop: countryMarginTop,
        paddingTop: countryPaddingTop,
        paddingBottom: countryPaddingBottom,
        display: 'flex',
        flexDirection: 'column',
        gap: countryGap,
        color: '#666',
        paddingRight: countriesPaddingRight,
        paddingLeft: countriesPaddingLeft,
        boxSizing: 'border-box'
      }}>
        {countryDisplayList.slice(0, 4).map((entry, index) => (
          <div
            key={`${entry.code}-${entry.name}`}
            style={{
              display: 'flex',
              justifyContent: isVertical ? 'flex-end' : 'space-between',
              alignItems: 'center',
              opacity: countriesVisible[index] ? 1 : 0,
              transition: countriesVisible[index] ? 'opacity 1.2s ease-out' : 'none',
              fontSize: countryFontSize,
              lineHeight: 1.2,
            }}
          >
            {!isVertical ? (
              <>
                {/* Country name on the left */}
                <span style={{ textAlign: 'left', flex: 1 }}>{entry.name || ''}</span>
                {/* Country code on the right */}
                <span style={{ textAlign: 'right', marginLeft: 'auto' }}>{entry.code}</span>
              </>
            ) : (
              <span>{entry.code}</span>
            )}
          </div>
        ))}
        {countryDisplayList.length > 4 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              opacity: countriesVisible[4] ? 1 : 0,
              transition: countriesVisible[4] ? 'opacity 1.2s ease-out' : 'none',
              fontSize: countryFontSize,
              lineHeight: 1.2,
            }}
          >
            <span>...</span>
          </div>
        )}
      </div>
    );
  };

  const categoryList = useMemo(() => {
    return Array.isArray(subpageOrder) ? subpageOrder : [];
  }, [subpageOrder]);

  const renderHorizontalLayout = () => {
    const buttonTextColor = '#111';
    const borderColor = '#111';
    const bottomBarPadding = layout?.inner?.height ? `${(layout.inner.height / 24).toFixed(1)}px` : '0.75rem';
    const gradientHeight = layout?.inner?.height ? (layout.inner.height * 5) / 12 : 300;
    
    // Calculate bottom nav position: 1/16 for web and pos view, 1/32 for menu view
    const bottomNavBottom = size.height ? (viewMode === 'menu' ? size.height / 32 : size.height / 16) : 0;
    
    // Calculate arrow bottom position: innerHeight/5 from the bottom of inner container
    // Distance from bottom of inner container: layout.inner.height / 5
    // Bottom of inner container from top of outer: innerTop + layout.inner.height
    // Arrows from top of outer: (innerTop + layout.inner.height) - (layout.inner.height / 5)
    // Using bottom positioning: size.height - ((innerTop + layout.inner.height) - (layout.inner.height / 5))
    const arrowBottom = (layout && layout.inner && layout.inner.height) ? (size.height - ((innerTop + layout.inner.height) - (layout.inner.height / 5))) : 0;
    return (
      <>
        <VideoStage videoSrc={videoSrc} layout={layout} />

        {/* Gaussian blur vignette over inner container */}
        <div
          style={{
            position: 'absolute',
            left: `${innerLeft}px`,
            top: `${innerTop}px`,
            width: `${layout.inner.width}px`,
            height: `${layout.inner.height}px`,
            background: `radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.15) 100%)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
            zIndex: 15,
          }}
        />


        {/* Bottom category bar */}
        <div
          ref={navBarRef}
          style={{
            position: 'absolute',
            left: `${innerLeft}px`,
            bottom: `${bottomNavBottom}px`,
            width: `${layout.inner.width}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: bottomBarPadding,
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            zIndex: 20,
            background: 'transparent',
          }}
        >
          <div 
            onMouseEnter={() => setIsNavHovered(true)}
            onMouseLeave={() => {
              setIsNavHovered(false);
              setHoveredButton(null);
            }}
            style={{ display: 'flex', gap: 12 }}
          >
            {categoryList.map(({ key, label, icon }) => {
              const isSelected = selected === key;
              const isHovered = hoveredButton === key;
              let color;
              
              if (isNavHovered) {
                // When mouse is in nav: all white, hovered item is black
                color = isHovered ? '#000' : '#fff';
              } else {
                // When mouse is not in nav: selected is black, others are white
                color = isSelected ? '#000' : '#fff';
              }
              
              // Determine icon filter based on state
              let iconFilter;
              if (isNavHovered) {
                iconFilter = isHovered ? 'brightness(0) saturate(0) opacity(1)' : 'brightness(0) saturate(0) invert(1) opacity(1)';
              } else {
                iconFilter = isSelected ? 'brightness(0) saturate(0) opacity(1)' : 'brightness(0) saturate(0) invert(1) opacity(1)';
              }
              
              return (
              <button
                key={key}
                onClick={() => {
                  // Remove all checkmarks when category icon is clicked (same as arrow behavior)
                  const allCheckmarks = document.querySelectorAll('.pos-checkmark');
                  allCheckmarks.forEach(checkmark => checkmark.remove());
                  setHasCheckmark(false);
                  
                  // Enable fade for new cocktail (same as arrow behavior)
                  setAllowCheckmarkFade(true);
                  
                  setSelected?.(key);
                  if (viewMode === 'web') setForceRecalc(prev => prev + 1);
                  // Scroll to align bottom with viewport
                  setTimeout(scrollToBottomAlign, 100);
                }}
                  onMouseEnter={() => setHoveredButton(key)}
                  onMouseLeave={() => setHoveredButton(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: color,
                  fontSize: viewMode === 'menu' ? '1.8rem' : '1.3rem',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  padding: viewMode === 'menu' ? '12px 16px' : '8px 12px',
                  transition: 'color 0.2s ease, filter 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: viewMode === 'menu' ? '12px' : '8px',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              >
                {icon && (
                  <img
                    src={icon}
                    alt={label}
                    style={{
                      width: viewMode === 'menu' ? '32px' : '24px',
                      height: viewMode === 'menu' ? '32px' : '24px',
                      display: 'block',
                      filter: iconFilter,
                      transition: 'filter 0.2s ease',
                    }}
                  />
                )}
                {label}
              </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            {viewMode === 'web' && (
              <button
                onClick={() => {
                  const section = document.getElementById('event-request-section');
                  if (section) section.scrollIntoView({ behavior: 'smooth' });
                }}
                onMouseEnter={() => setHoveredButton('schedule-event')}
                onMouseLeave={() => setHoveredButton(null)}
                style={{
                  background: 'transparent',
                  border: `2px solid ${hoveredButton === 'schedule-event' ? '#000' : '#fff'}`,
                  color: hoveredButton === 'schedule-event' ? '#000' : '#fff',
                  padding: '10px 16px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'border 0.2s ease, color 0.2s ease',
                  fontSize: '1.1rem',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  position: 'relative',
                }}
              >
                Schedule an Event
              </button>
            )}
            {viewMode === 'pos' && (
              <>
                <button
                  onClick={() => {
                    // Get the current cocktail title from the MenuGallery
                    const cocktailTitleElement = document.querySelector('.cocktail-title');
                    if (cocktailTitleElement) {
                      // Get text content, removing any existing checkmark
                      let cocktailName = cocktailTitleElement.textContent.trim();
                      cocktailName = cocktailName.replace(/✓/g, '').trim();
                      
                      if (cocktailName) {
                        // Disable fade (becomes FALSE when ADD/REMOVE ITEM is clicked)
                        setAllowCheckmarkFade(false);
                        
                        if (selectedCocktailsList.includes(cocktailName)) {
                          // REMOVE ITEM: Remove from list and remove checkmark immediately
                          removeCheckmarkImmediately(cocktailName);
                          setSelectedCocktailsList(prev => prev.filter(name => name !== cocktailName));
                        } else {
                          // ADD ITEM: Add to list and show checkmark immediately
                          addCheckmarkImmediately(cocktailName);
                          setSelectedCocktailsList(prev => [...prev, cocktailName]);
                        }
                      }
                    }
                  }}
                  onMouseEnter={() => setHoveredButton('add-item')}
                  onMouseLeave={() => setHoveredButton(null)}
                  style={{
                    background: 'transparent',
                  border: `2px solid ${hoveredButton === 'add-item' ? '#000' : '#fff'}`,
                  color: hoveredButton === 'add-item' ? '#000' : '#fff',
                    padding: '10px 16px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  transition: 'border 0.2s ease, color 0.2s ease',
                    fontSize: '1.1rem',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    position: 'relative',
                  }}
                >
                  {hasCheckmark ? 'REMOVE ITEM' : 'ADD ITEM'}
                </button>
                <button
                  onClick={() => {
                    if (onAllItemsClick) {
                      onAllItemsClick();
                    }
                  }}
                  onMouseEnter={() => setHoveredButton('all-items')}
                  onMouseLeave={() => setHoveredButton(null)}
                  style={{
                    background: 'transparent',
                  border: `2px solid ${hoveredButton === 'all-items' ? '#000' : '#888'}`,
                  color: hoveredButton === 'all-items' ? '#000' : '#888',
                    padding: '10px 16px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  transition: 'border 0.2s ease, color 0.2s ease',
                    fontSize: '1.1rem',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    position: 'relative',
                  }}
                >
                  All Items
                </button>
              </>
            )}
{/* All Items button hidden for menu viewMode (horizontal POS view) */}
          </div>
          
          {/* Arrows - centered in category bar */}
          <div style={{ 
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}>
            <ArrowButtons onPrev={handlePrev} onNext={handleNext} size={viewMode === 'menu' ? 80 : 56} noHover={viewMode === 'menu'} />
          </div>
          
          {/* FULL MENU button - right half of screen, centered (menu view only) */}
          {viewMode === 'menu' && (
            <div style={{
              position: 'absolute',
              right: 0,
              width: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
            }}>
              <button
                onClick={() => {
                  if (onFullMenuClick) {
                    onFullMenuClick();
                  }
                }}
                onMouseEnter={() => setHoveredButton('full-menu')}
                onMouseLeave={() => setHoveredButton(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: hoveredButton === 'full-menu' ? '#000' : '#fff',
                  fontSize: '1.8rem',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  padding: '12px 16px',
                  transition: 'color 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              >
                FULL MENU
              </button>
            </div>
          )}
        </div>

        {/* Left info */}
        <div
          style={{
            position: 'absolute',
            left: `${innerLeft}px`,
            top: `${originalInnerTop + layout.inner.height / 5}px`,
            width: `${layout.inner.width / 3}px`,
            paddingLeft: layout?.inner?.height ? `${(layout.inner.height / 16).toFixed(1)}px` : '0.75rem',
            paddingTop: layout?.inner?.height ? `${(layout.inner.height / 42).toFixed(1)}px` : '0.35rem',
            paddingRight: layout?.inner?.height ? `${(layout.inner.height / 32).toFixed(1)}px` : '0.5rem',
            paddingBottom: 0,
            boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
        >
          {renderTitleBlock()}
          {renderIngredients()}
          {renderGarnish()}
        </div>

        {/* Right info */}
        <div
          style={{
            position: 'absolute',
            left: `${innerLeft + layout.inner.width - (layout.inner.width * 5) / 12}px`,
            top: `${innerTop + layout.inner.height / 5}px`,
            width: `${(layout.inner.width * 5) / 12}px`,
            padding: 0,
            boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
        >
          {renderMap()}
        {renderCountries()}
        <div style={{ marginTop: 0 }}>
          {renderConcept()}
        </div>
        </div>

        {/* QR Code - bottom right of inner container (menu view only) - stays in place, dark grey */}
        {viewMode === 'menu' && (
          <img
            src="/assets/icons/QR1.png?v=2"
            alt="QR Code"
            style={{
              position: 'absolute',
              right: `${innerLeft + parseFloat(bottomBarPadding) * 2 - 24}px`,
              bottom: `${size.height / 32 + parseFloat(bottomBarPadding)}px`,
              width: 'auto',
              height: 'auto',
              maxWidth: '120px',
              maxHeight: '120px',
              filter: 'brightness(0) invert(0.3)',
              pointerEvents: 'none',
              zIndex: 25,
              transform: 'translateY(15%)',
            }}
          />
        )}

      </>
    );
  };

  const renderVerticalLayout = () => {
    const headerHeight = layout.inner.height / 12; // fraction
    const arrowsWidth = layout.inner.width / 3;
    const topFadeHeight = size?.height ? `${size.height / 3}px` : `${layout.inner.height / 3}px`;
    return (
      <>
        <VideoStage videoSrc={videoSrc} layout={layout} />

        {/* Gaussian blur vignette over inner container */}
        <div
          style={{
            position: 'absolute',
            left: `${innerLeft}px`,
            top: `${innerTop}px`,
            width: `${layout.inner.width}px`,
            height: `${layout.inner.height}px`,
            background: `radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.15) 100%)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: `${innerTop}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100vw',
            height: topFadeHeight,
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 1) 0px, rgba(255, 255, 255, 1) 80px, rgba(255, 255, 255, 0) 100%)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />

        {/* Header */}
        {false && (
          <div
            style={{
              position: 'absolute',
              left: `${innerLeft}px`,
              top: `${innerTop}px`,
              width: `${layout.inner.width}px`,
              height: `${headerHeight}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
              {viewMode === 'pos' && (
                <button
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#222';
                    e.currentTarget.style.borderColor = '#222';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#888';
                    e.currentTarget.style.borderColor = '#888';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid #888',
                    color: '#888',
                    padding: '6px 8px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    position: 'relative',
                    opacity: isVertical && sidebarOpen ? 0 : 1,
                    transition: isVertical ? 'opacity 0.3s ease-out, all 0.2s ease' : 'all 0.2s ease',
                  }}
                >
                  Add Item
                </button>
              )}
              {viewMode === 'pos' && (
                <button
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#222';
                    e.currentTarget.style.borderColor = '#222';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#888';
                    e.currentTarget.style.borderColor = '#888';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid #888',
                    color: '#888',
                    padding: '6px 8px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    position: 'relative',
                  }}
                >
                  All Items
                </button>
              )}
{/* All Items button hidden for menu viewMode */}
            </div>
          </div>
        )}

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            left: showConceptInfo ? `${innerLeft}px` : `${innerLeft + layout.inner.width / 6}px`,
            top: showConceptInfo ? '80px' : '100px',
            width: showConceptInfo ? `${layout.inner.width}px` : `${(layout.inner.width * 2) / 3}px`,
            boxSizing: 'border-box',
            zIndex: 16,
          }}
        >
          {showConceptInfo ? renderMap() : renderTitleBlock()}
        </div>

        {/* Countries */}
        {showConceptInfo && (
        <div
          style={{
            position: 'absolute',
              right: `${innerLeft}px`,
              top: '50%',
              transform: 'translateY(-50%)',
              width: `${(layout.inner.width * 5) / 12}px`,
            boxSizing: 'border-box',
            opacity: countriesSidebarVisible ? 1 : 0,
            transition: countriesSidebarVisible ? 'opacity 0.5s ease-out' : 'opacity 0.3s ease-out',
          }}
        >
          {renderCountries()}
        </div>
        )}

        {/* Info/Concept container */}
        <div
          ref={infoConceptContainerRef}
          style={{
            position: 'absolute',
            left: `${innerLeft}px`,
            bottom: `${18 + bottomControlsHeight}px`,
            height: 'calc(100vh / 5)',
            width: `${layout.inner.width}px`,
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingBottom: 0,
            boxSizing: 'border-box',
            overflow: 'hidden',
            '--verticalInfoFontScale': verticalInfoFontScale,
          }}
        >
          {showConceptInfo ? renderConcept() : (
            <>
              {renderIngredients()}
              {renderGarnish()}
            </>
          )}
        </div>

        {/* Bottom controls container */}
        <div
          ref={bottomControlsRef}
          style={{
            position: 'absolute',
            left: `${innerLeft + layout.inner.width / 2}px`,
            bottom: '18px',
            transform: 'translateX(-50%)',
            width: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          {/* Left menu button */}
          <div style={{ pointerEvents: 'auto', marginRight: '6.25vw' }}>
            <button
              onClick={() => {
                const newSidebarOpen = !sidebarOpen;
                setSidebarOpen?.(newSidebarOpen);

                // Clear any existing animation timeouts
                animationTimeoutsRef.current.forEach((id) => clearTimeout(id));
                animationTimeoutsRef.current = [];

                // Scroll to align bottom with viewport
                setTimeout(scrollToBottomAlign, 100);

                if (newSidebarOpen) {
                  // Fade out all elements when opening sidebar
                  setTitleVisible(false);
                  setIngredientsVisible(false);
                  setGarnishVisible(false);
                  setConceptVisible(false);
                  setMapVisible(false);
                  setCountriesSidebarVisible(false);
                } else {
                  // Fade in with normal animations when closing sidebar (vertical view only)
                  if (isVertical) {
                    if (showConceptInfo) {
                      // Show concept, map, and countries with normal animation
                      const conceptMapTimeout = setTimeout(() => {
                        setConceptVisible(true);
                        setMapVisible(true);
                        setCountriesSidebarVisible(true);
                      }, 400);
                      animationTimeoutsRef.current.push(conceptMapTimeout);

                      // Countries normal staggered animation
                      const count = countryDisplayList.length;
                      const visibleCount = Math.min(count, 5);
                      setCountriesVisible(new Array(visibleCount).fill(false));
                      for (let i = 0; i < visibleCount; i++) {
                        const countryTimeout = setTimeout(() => {
                          setCountriesVisible((prev) => {
                            if (prev.length !== visibleCount) return prev;
                            const next = [...prev];
                            next[i] = true;
                            return next;
                          });
                        }, 1000 + i * 500);
                        animationTimeoutsRef.current.push(countryTimeout);
                      }
                    } else {
                      // Show title, ingredients, and garnish
                      const titleTimeout = setTimeout(() => {
                        setTitleVisible(true);
                        const ingredientsTimeout = setTimeout(() => {
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                              // 1) Scale font to 100% fit
                              scaleFontToFitRef.current?.();
                              // 2) Brief hesitation, then adjust separators row by row
                              const separatorTimeout = setTimeout(async () => {
                                await adjustSeparatorsRef.current?.();
                                // 3) Fade in after all rows processed
                                setIngredientsVisible(true);
                                const garnishTimeout = setTimeout(() => setGarnishVisible(true), 300);
                                animationTimeoutsRef.current.push(garnishTimeout);
                              }, 50);
                              animationTimeoutsRef.current.push(separatorTimeout);
                            });
                          });
                        }, 400);
                        animationTimeoutsRef.current.push(ingredientsTimeout);
                      }, 500);
                      animationTimeoutsRef.current.push(titleTimeout);
                    }
                  }
                }
              }}
              onMouseEnter={(e) => {
                if (!isVertical) {
                  e.currentTarget.style.transform = 'scale(1.1)';
                  const div = e.currentTarget.querySelector('div'); // IconComponent renders as div
                  if (div) {
                    div.style.filter = 'brightness(0) saturate(100%)';
                  }
                }
              }}
              onMouseLeave={(e) => {
                if (!isVertical) {
                  e.currentTarget.style.transform = 'scale(1)';
                  const div = e.currentTarget.querySelector('div'); // IconComponent renders as div
                  if (div) {
                    div.style.filter = 'brightness(0) saturate(100%) invert(47%)';
                  }
                }
              }}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 8,
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                flexShrink: 0,
                minWidth: '56px',
                minHeight: '56px',
              }}
            >
              <IconComponent
                iconName="categories"
                className="hide-until-mounted"
                style={{
                  width: '40%',
                  height: '40%',
                  display: 'block',
                  filter: 'brightness(0) saturate(100%) invert(47%)',
                  opacity: 1,
                  transition: 'filter 0.2s ease',
                  flexShrink: 0,
                }}
              />
            </button>
          </div>

          {/* Arrows */}
          <div style={{ pointerEvents: 'auto' }}>
            <ArrowButtons onPrev={handlePrev} onNext={handleNext} />
          </div>

          {/* Right info button */}
          <div style={{ pointerEvents: 'auto', marginLeft: '6.25vw' }}>
            {(info?.concept ? (
              <button
            onClick={() => {
              if (sidebarOpen) {
                // Close the sidebar when X is clicked
                setSidebarOpen?.(false);
                if (viewMode === 'web') setForceRecalc(prev => prev + 1);
                // Scroll to align bottom with viewport
                setTimeout(scrollToBottomAlign, 100);
                return;
              }

              // Normal information button functionality
              // Clear any existing animation timeouts
              animationTimeoutsRef.current.forEach((id) => clearTimeout(id));
              animationTimeoutsRef.current = [];

              const newValue = !showConceptInfo;
              setShowConceptInfo(newValue);
              setShowCategories(false);
              if (viewMode === 'web') setForceRecalc(prev => prev + 1);
              // Scroll to align bottom with viewport
              setTimeout(scrollToBottomAlign, 100);

              if (newValue) {
                // Show concept, map, and countries with animations
                const count = countryDisplayList.length;
                const visibleCount = Math.min(count, 5);
                setCountriesVisible(new Array(visibleCount).fill(false));

                // Hide title, ingredients, and garnish immediately
                setTitleVisible(false);
                setIngredientsVisible(false);
                setGarnishVisible(false);

                // Show concept and map with animation
                const conceptMapTimeout = setTimeout(() => {
                  setConceptVisible(true);
                  setMapVisible(true);
                  setCountriesSidebarVisible(true);
                }, 400);
                animationTimeoutsRef.current.push(conceptMapTimeout);

                // Show countries with staggered animation
                for (let i = 0; i < visibleCount; i++) {
                  const countryTimeout = setTimeout(() => {
                    setCountriesVisible((prev) => {
                      if (prev.length !== visibleCount) return prev;
                      const next = [...prev];
                      next[i] = true;
                      return next;
                    });
                  }, 1000 + i * 500);
                  animationTimeoutsRef.current.push(countryTimeout);
                }
              } else {
                // Hide concept, map, and countries immediately
                setConceptVisible(false);
                setMapVisible(false);
                setCountriesSidebarVisible(false);
                setCountriesVisible(new Array(Math.min(countryDisplayList.length, 5)).fill(false));

                // Show title, ingredients, and garnish with animations
                const titleTimeout = setTimeout(() => {
                  setTitleVisible(true);
                  const ingredientsTimeout = setTimeout(() => {
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        // 1) Scale font to 100% fit
                        scaleFontToFitRef.current?.();
                        // 2) Brief hesitation, then adjust separators row by row
                        const separatorTimeout = setTimeout(async () => {
                          await adjustSeparatorsRef.current?.();
                          // 3) Fade in after all rows processed
                          setIngredientsVisible(true);
                          const garnishTimeout = setTimeout(() => setGarnishVisible(true), 300);
                          animationTimeoutsRef.current.push(garnishTimeout);
                        }, 50);
                        animationTimeoutsRef.current.push(separatorTimeout);
                      });
                    });
                  }, 400);
                  animationTimeoutsRef.current.push(ingredientsTimeout);
                }, 500);
                animationTimeoutsRef.current.push(titleTimeout);
              }
            }}
            onMouseEnter={(e) => {
              if (!isVertical) {
                e.currentTarget.style.transform = 'scale(1.1)';
                if (sidebarOpen) {
                  const span = e.currentTarget.querySelector('span');
                  if (span) {
                    span.style.color = '#222';
                  }
                } else {
                  const img = e.currentTarget.querySelector('img');
                  if (img) {
                    // #222 (rgb(34,34,34)) - darker, almost black
                    img.style.filter = 'brightness(0) saturate(100%)';
                  }
                }
              }
            }}
            onMouseLeave={(e) => {
              if (!isVertical) {
                e.currentTarget.style.transform = 'scale(1)';
                if (sidebarOpen) {
                  const span = e.currentTarget.querySelector('span');
                  if (span) {
                    span.style.color = '#888';
                  }
                } else {
                  const img = e.currentTarget.querySelector('img');
                  if (img) {
                    // #888 (rgb(136,136,136)) - medium gray
                    img.style.filter = 'brightness(0) saturate(100%) invert(47%)';
                  }
                }
              }
            }}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              minWidth: '56px',
              minHeight: '56px',
            }}
          >
            {sidebarOpen ? (
              <span style={{
                fontSize: '32px',
                color: '#888',
                fontWeight: 300,
                lineHeight: 1,
                transition: 'color 0.2s ease',
              }}>×</span>
            ) : (
              <img
                className="hide-until-mounted"
                src="/assets/icons/information-button.png"
                alt="Information"
                style={{
                  width: '40%',
                  height: '40%',
                  objectFit: 'contain',
                  filter: 'brightness(0) saturate(100%) invert(47%)',
                  opacity: 1,
                  transition: 'filter 0.2s ease',
                  flexShrink: 0,
                }}
              />
            )}
              </button>
            ) : (
              <button
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#222';
              const svg = e.currentTarget.querySelector('svg');
              if (svg) svg.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#888';
              const svg = e.currentTarget.querySelector('svg');
              if (svg) svg.style.transform = 'scale(1)';
            }}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              minWidth: '56px',
              minHeight: '56px',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: 'block', width: '40%', height: '40%', transition: 'transform 0.2s ease', flexShrink: 0 }}
            >
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div
          style={{
            position: 'absolute',
            left: isVertical
              ? `${sidebarOpen ? 0 : -layout.inner.width}px`
              : `${sidebarOpen ? innerLeft : innerLeft - layout.inner.width}px`,
            ...(isVertical 
              ? { 
                  top: `${innerTop}px`,
                  height: `${layout.inner.height}px`,
                }
              : { top: `${innerTop + headerHeight}px` }
            ),
            width: `${layout.inner.width}px`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: isVertical ? 'center' : 'flex-start',
            gap: 16,
            paddingTop: isVertical ? '0' : '12px',
            paddingBottom: isVertical ? '0' : '12px',
            paddingLeft: isVertical 
              ? (layout?.inner?.height ? `${(layout.inner.height / 64).toFixed(1)}px` : '0.35rem')
              : '12px',
            paddingRight: '12px',
            boxSizing: 'border-box',
            transition: 'left 0.3s ease',
            pointerEvents: sidebarOpen ? 'auto' : 'none',
          }}
        >
          {/* Fade overlay underneath navigation */}
          {isVertical && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                background: `linear-gradient(to bottom, 
                  rgba(${topRgb.r}, ${topRgb.g}, ${topRgb.b}, 0) 0%, 
                  rgba(${topRgb.r}, ${topRgb.g}, ${topRgb.b}, 1) 33%, 
                  rgba(${middleRgb.r}, ${middleRgb.g}, ${middleRgb.b}, 1) 50%, 
                  rgba(${bottomRgb.r}, ${bottomRgb.g}, ${bottomRgb.b}, 1) 66%, 
                  rgba(${bottomRgb.r}, ${bottomRgb.g}, ${bottomRgb.b}, 0) 100%)`,
                maskImage: `linear-gradient(to right, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.8) 50%, rgba(0, 0, 0, 0.3) 75%, rgba(0, 0, 0, 0) 100%)`,
                WebkitMaskImage: `linear-gradient(to right, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.8) 50%, rgba(0, 0, 0, 0.3) 75%, rgba(0, 0, 0, 0) 100%)`,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
          )}
          {categoryList.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSidebarNav(key)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '0.25rem 0',
                paddingLeft: isVertical && layout?.inner?.width ? `${layout.inner.width / 24}px` : '0',
                textTransform: 'uppercase',
                fontWeight: 300,
                fontSize: getFontSize(28, 0.9, 1.4),
                color: selected === key ? '#222' : '#555',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                position: 'relative',
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                if (!isVertical) {
                  e.currentTarget.style.color = '#222';
                }
              }}
              onMouseLeave={(e) => {
                if (!isVertical) {
                  e.currentTarget.style.color = selected === key ? '#222' : '#555';
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </>
    );
  };

  if (!videoFiles || !cocktailInfo || !title) {
    return (
      <div
        ref={ref}
        style={{
          position: 'relative',
          width: outerWidthOverride ? `${outerWidthOverride}px` : '100%',
          height: outerHeightOverride ? `${outerHeightOverride}px` : '100vh',
          overflow: 'hidden',
          background: 'linear-gradient(to top, rgba(179, 179, 179, 1) 0%, rgba(185, 185, 185, 1) 8%, rgba(210, 210, 210, 1) 25%, rgba(240, 240, 240, 1) 50%, rgba(255, 255, 255, 1) 70%)',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        width: outerWidthOverride ? `${outerWidthOverride}px` : (viewMode === 'web' ? `${size.width}px` : '100%'),
        height: outerHeightOverride ? `${outerHeightOverride}px` : (viewMode === 'web' ? `${size.height}px` : '100vh'),
        overflow: 'hidden',
        background: 'linear-gradient(to top, rgba(179, 179, 179, 1) 0%, rgba(185, 185, 185, 1) 8%, rgba(210, 210, 210, 1) 25%, rgba(240, 240, 240, 1) 50%, rgba(255, 255, 255, 1) 70%)',
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Video background fills entire outer container/viewport */}
      {videoSrc ? (
        <VideoBackground videoSrc={videoSrc} isVertical={isVertical} viewMode={viewMode} />
      ) : (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: '#f5f5f5',
          zIndex: 0,
        }}>
          {/* No video available */}
        </div>
      )}
      
      {/* Gradient mask at bottom of outer container (16:10 horizontal view) - behind nav */}
      {layout.orientation === 'horizontal' && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: `${size.height / 4}px`,
            background: `linear-gradient(to top, rgba(179, 179, 179, 1) 0%, rgba(185, 185, 185, 1) 10%, rgba(210, 210, 210, 1) 40%, rgba(250, 250, 250, 1) 90%, rgba(255, 255, 255, 1) 100%)`,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
      
      {layout.orientation === 'horizontal' ? renderHorizontalLayout() : renderVerticalLayout()}
    </div>
  );
}

/**
 * Wrapper component preserving data fetch + selected state.
 */
export default function MenuGallery2({ viewMode = 'web', orientationOverride, outerWidth, outerHeight, selectedCocktails, setSelectedCocktails, initialItem, onItemNavigated, onAllItemsClick }) {
  const [subpages, setSubpages] = useState({
    cocktails: { title: 'Echo Cocktails', videoFiles: [], cocktailInfo: {} },
    mocktails: { title: 'Echo Mocktails', videoFiles: [], cocktailInfo: {} },
    beer: { title: 'Echo Beer', videoFiles: [], cocktailInfo: {} },
    wine: { title: 'Echo Wine', videoFiles: [], cocktailInfo: {} },
    spirits: { title: 'Echo Spirits', videoFiles: [], cocktailInfo: {} },
  });
  const [selected, setSelected] = useState('cocktails');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initialItemProcessed, setInitialItemProcessed] = useState(false);
  const [showFullMenu, setShowFullMenu] = useState(false);
  const [fullMenuSelectedItem, setFullMenuSelectedItem] = useState(null);

  const subpageOrder = useMemo(() => [
    { key: 'cocktails', label: 'Cocktails' },
    { key: 'mocktails', label: 'Mocktails' },
    { key: 'beer', label: 'Beer' },
    { key: 'wine', label: 'Wine' },
    { key: 'spirits', label: 'Spirits' },
  ], []);

  const enabledSubpageOrder = useMemo(() => {
    return subpageOrder.filter(({ key }) => subpages?.[key]?.menuNavEnabled === true);
  }, [subpageOrder, subpages]);

  useEffect(() => {
    const enabledKeys = enabledSubpageOrder.map((entry) => entry.key);
    if (!enabledKeys.length) return;
    if (!enabledKeys.includes(selected)) {
      setSelected(enabledKeys[0]);
    }
  }, [enabledSubpageOrder, selected]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchMenuGalleryData();
        setSubpages((prev) => ({ ...prev, ...data }));
      } catch (e) {
        console.error('Error loading menu data:', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Preload videos: first video immediately, rest in background
  useEffect(() => {
    if (isLoading || !subpages) return;

    const allVideoUrls = [];
    
    // Collect all video URLs from all categories
    Object.values(subpages).forEach((category) => {
      if (category?.videoFiles && Array.isArray(category.videoFiles)) {
        category.videoFiles.forEach((file) => {
          const info = category.cocktailInfo?.[file];
          if (info?.cloudinaryVideoUrl) {
            const safeUrl = getIosSafeCloudinaryVideoUrl(info.cloudinaryVideoUrl);
            allVideoUrls.push(safeUrl);
          }
        });
      }
    });

    if (allVideoUrls.length === 0) return;

    // Load first video immediately (high priority)
    const firstVideo = document.createElement('video');
    firstVideo.preload = 'auto';
    firstVideo.src = allVideoUrls[0];
    firstVideo.muted = true;
    firstVideo.load();

    // Preload remaining videos in batches after a short delay
    const remainingUrls = allVideoUrls.slice(1);
    
    const preloadTimer = setTimeout(() => {
      const preloadBatch = (urls, batchSize = 3, delayMs = 1000) => {
        let currentIndex = 0;

        const loadNextBatch = () => {
          const batch = urls.slice(currentIndex, currentIndex + batchSize);
          if (batch.length === 0) return;

          batch.forEach((url) => {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.src = url;
            video.muted = true;
            video.load();
          });

          currentIndex += batchSize;
          if (currentIndex < urls.length) {
            setTimeout(loadNextBatch, delayMs);
          }
        };

        loadNextBatch();
      };

      // Start preloading remaining videos
      preloadBatch(remainingUrls, 3, 1000);
    }, 1000); // Wait 1 second before preloading remaining videos

    return () => clearTimeout(preloadTimer);
  }, [isLoading, subpages]);

  // Navigate to initial item when provided
  useEffect(() => {
    if (initialItem && !isLoading && !initialItemProcessed && Object.keys(subpages).length > 0) {
      const normalizeCategoryKey = (value = '') => {
        const key = String(value).toLowerCase();
        const categoryMap = {
          'classics': 'cocktails'
        };
        return categoryMap[key] || key;
      };

      const itemCategory = normalizeCategoryKey(initialItem.category || 'cocktails');
      const categoryKey = itemCategory in subpages ? itemCategory : 'cocktails';
      
      // Set the category
      if (categoryKey !== selected) {
        setSelected(categoryKey);
      }
      setInitialItemProcessed(true);
    }
  }, [initialItem, isLoading, subpages, selected, initialItemProcessed]);

  const currentCategory = subpages[selected] || subpages.cocktails;
  const { title, videoFiles, cocktailInfo } = currentCategory;

  // Calculate initial index if initialItem is provided and matches current category
  // Also handles navigation from full menu view via fullMenuSelectedItem
  const initialIndex = useMemo(() => {
    // Check for fullMenuSelectedItem first (navigation from full menu view)
    if (fullMenuSelectedItem && fullMenuSelectedItem.index !== undefined) {
      console.log('[MenuGallery2] fullMenuSelectedItem check:', {
        itemName: fullMenuSelectedItem.name,
        itemCategory: fullMenuSelectedItem.category,
        itemIndex: fullMenuSelectedItem.index,
        currentSelected: selected,
        categoryMatch: fullMenuSelectedItem.category === selected
      });
      
      // If category matches, return the index
      if (fullMenuSelectedItem.category === selected) {
        console.log('[MenuGallery2] Returning fullMenuSelectedItem index:', fullMenuSelectedItem.index);
        return fullMenuSelectedItem.index;
      }
    }
    
    if (!initialItem || isLoading || !videoFiles.length || initialItemProcessed === false) return null;
    
    const normalizeCategoryKey = (value = '') => {
      const key = String(value).toLowerCase();
      const categoryMap = {
        'classics': 'cocktails',
        'originals': 'mocktails'
      };
      return categoryMap[key] || key;
    };

    const itemCategory = normalizeCategoryKey(initialItem.category || 'cocktails');
    if (itemCategory !== selected) return null;

    const itemIndex = videoFiles.findIndex((file) => {
      const info = cocktailInfo[file] || {};
      return info.name === initialItem.name || 
             (initialItem.itemNumber && info.itemNumber === initialItem.itemNumber) ||
             (initialItem._id && info._id === initialItem._id);
    });

    return itemIndex !== -1 ? itemIndex : null;
  }, [initialItem, isLoading, videoFiles, cocktailInfo, selected, initialItemProcessed, fullMenuSelectedItem]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e0e0e0',
          borderTop: '4px solid #999',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!enabledSubpageOrder.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#666' }}>
        No menu categories are enabled for navigation.
      </div>
    );
  }

  // Show FullMenu overlay when in menu view and showFullMenu is true
  if (viewMode === 'menu' && showFullMenu) {
    return (
      <div 
        style={{
          width: outerWidth || '100%',
          height: outerHeight || '100%',
          position: 'relative',
          background: '#fff',
          overflow: 'auto',
          overflowY: 'scroll',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          msOverflowStyle: 'none',
          scrollbarWidth: 'thin',
        }}
        onTouchMove={(e) => {
          // Allow touch scrolling
          e.stopPropagation();
        }}
      >
        {/* Back button to return to normal view */}
        <button
          onClick={() => setShowFullMenu(false)}
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            zIndex: 100,
            background: 'rgba(255,255,255,0.9)',
            border: 'none',
            color: '#333',
            fontSize: '1.4rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '8px',
          }}
        >
          ← BACK
        </button>
        <FullMenu 
          disableNavigation={true} 
          hideSearch={true} 
          containerHeight={outerHeight}
          hiddenCategories={['spirits', 'premix']}
          showFullMenuByDefault={true}
          onItemClick={(item) => {
            // Navigate to the item in the original menu view
            const normalizeCategoryKey = (value = '') => {
              const key = String(value).toLowerCase();
              const categoryMap = { 'classics': 'cocktails', 'originals': 'mocktails' };
              return categoryMap[key] || key;
            };
            const itemCategory = normalizeCategoryKey(item.category || 'cocktails');
            
            // Find the index of the item in the category's videoFiles
            const categoryData = subpages[itemCategory];
            if (categoryData) {
              const itemIndex = categoryData.videoFiles.findIndex((file) => {
                const info = categoryData.cocktailInfo[file] || {};
                // Match by name (case-insensitive), itemNumber, or _id
                const nameMatch = info.name && item.name && 
                  info.name.toLowerCase().trim() === item.name.toLowerCase().trim();
                const itemNumberMatch = item.itemNumber && info.itemNumber === item.itemNumber;
                const idMatch = item._id && info._id === item._id;
                return nameMatch || itemNumberMatch || idMatch;
              });
              
              console.log('FullMenu item click:', { 
                itemName: item.name, 
                itemCategory, 
                foundIndex: itemIndex,
                videoFilesCount: categoryData.videoFiles.length 
              });
              
              // Set the selected item with its index BEFORE changing category
              // This ensures the index is captured correctly
              if (itemIndex !== -1) {
                setFullMenuSelectedItem({ ...item, index: itemIndex, category: itemCategory });
              } else {
                // If not found by exact match, default to first item
                console.warn('Item not found in category, defaulting to index 0');
                setFullMenuSelectedItem({ ...item, index: 0, category: itemCategory });
              }
            }
            
            // Set the category (this may trigger re-render)
            if (itemCategory !== selected && subpages[itemCategory]) {
              setSelected(itemCategory);
            }
            
            // Close full menu view
            setShowFullMenu(false);
          }}
        />
      </div>
    );
  }

  return (
    <EchoCocktailSubpage2
      videoFiles={videoFiles}
      cocktailInfo={cocktailInfo}
      title={title}
      selected={selected}
      setSelected={setSelected}
      subpageOrder={enabledSubpageOrder}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      viewMode={viewMode}
      orientationOverride={orientationOverride}
      outerWidthOverride={outerWidth}
      outerHeightOverride={outerHeight}
      selectedCocktails={selectedCocktails}
      setSelectedCocktails={setSelectedCocktails}
      initialIndex={initialIndex}
      onIndexSet={(index) => {
        // Clear fullMenuSelectedItem after navigation is complete
        if (fullMenuSelectedItem) {
          setFullMenuSelectedItem(null);
        }
        if (onItemNavigated) {
          onItemNavigated(index);
        }
      }}
      onAllItemsClick={onAllItemsClick}
      onFullMenuClick={() => setShowFullMenu(true)}
    />
  );
}

export { EchoCocktailSubpage2 as EchoCocktailSubpage };

