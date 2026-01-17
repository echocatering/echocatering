import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamicGallery from '../utils/dynamicGallery';
import { isCloudinaryUrl, getEventOptimizedUrl } from '../utils/cloudinaryUtils';

// CSS animations for modal transitions
const modalAnimations = `
  @keyframes fadeInScale {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
`;

/*
 * Event Gallery Rules:
 * 1. Photos are on a grid made up of squares (important)
 * 2. Grid is flexible but maintains square proportions
 * 3. Only 3 possible photo sizes: 3x2 landscape, 2x2 square, and 4x2 landscape
 * 4. Grid creates one continuous strip for infinite scrolling with 5 sequences of 9x4
 * 5. Each sequence is broken into top (9x2) and bottom (9x2) segments
 * 6. Virtual scrolling for performance - only renders visible content + buffer
 * 7. Navigation is arrow-only with smooth sliding animations
 * 8. Mobile: Responsive grid that scales with screen size while maintaining square proportions
 */

export default function EventGallery({ embedded = false, isMobile = false, isSmallScreen = false, onGalleryHoverChange, onArrowClick }) {
  console.log('🎯 EventGallery - isMobile:', isMobile, 'embedded:', embedded, 'isSmallScreen:', isSmallScreen);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasNavigatedRight, setHasNavigatedRight] = useState(false);
  const [leftmostPosition, setLeftmostPosition] = useState(0);
  const [initialScrollPosition, setInitialScrollPosition] = useState(0);

  
  const containerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  // Gallery hover state
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);
  const [hoveredPhotoId, setHoveredPhotoId] = useState(null);

  // Responsive mobile grid sizing
  const [mobileGridSize, setMobileGridSize] = useState(60);
  const [mobileGap, setMobileGap] = useState(3);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Calculate responsive mobile grid dimensions and track viewport width
  useEffect(() => {
    const calculateMobileGridSize = () => {
      if (isMobile) {
        // Calculate grid size to always fit exactly 5 squares across
        const screenWidth = window.innerWidth;
        const availableWidth = screenWidth;
        
        // Calculate grid size: (availableWidth - 4 gaps) / 5 squares
        // This ensures exactly 5 squares fit across with equal gaps
        const newGap = 4; // Fixed 4px gap for consistent spacing
        const newGridSize = Math.floor((availableWidth - (newGap * 4)) / 5);
        
        setMobileGridSize(newGridSize);
        setMobileGap(newGap);
        
        console.log('📱 Mobile grid size calculated:', {
          screenWidth,
          availableWidth,
          gridSize: newGridSize,
          gap: newGap,
          totalWidth: (newGridSize * 5) + (newGap * 4)
        });
      }
    };

    const handleResize = () => {
      console.log('🔄 Resize detected - new width:', window.innerWidth, 'new height:', window.innerHeight);
      calculateMobileGridSize();
      
      // Force re-render to update responsive desktop grid size
      if (!isMobile) {
        // Trigger a re-render by updating a state variable
        setMobileGridSize(prev => prev + 0.0001); // Small change to trigger re-render
      }
    };

    // Always calculate mobile grid size on mount
    console.log('🚀 Initial mobile grid size calculated');
    calculateMobileGridSize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  // Calculate optimal mobile grid dimensions for different screen sizes
  const getOptimalMobileGridSize = useCallback(() => {
    if (!isMobile) return { gridSize: 60, gap: 3 };
    
    // Always calculate to fit exactly 5 squares across
    const screenWidth = window.innerWidth;
    const availableWidth = screenWidth;
    
    // Calculate grid size: (availableWidth - 4 gaps) / 5 squares
    const gap = 4; // Fixed 4px gap for consistent spacing
    const gridSize = Math.floor((availableWidth - (gap * 4)) / 5);
    
    return { gridSize, gap };
  }, [isMobile]);

  // Calculate responsive desktop grid size based on container height
  const getResponsiveDesktopGridSize = useCallback(() => {
    if (isMobile) return { gridSize: 160, gap: 16 };
    
    // For desktop, calculate grid size based on available container height
    // The grid should always fit within the container height (97vh - padding)
    const containerHeight = window.innerHeight * 0.97; // 97vh
    const padding = 120; // 60px top + 60px bottom
    const availableHeight = containerHeight - padding;
    
    // The grid has 4 rows, so each row should be availableHeight / 4
    // But we need to account for gaps between rows (3 gaps between 4 rows)
    const rowHeight = (availableHeight - 48) / 4; // 48px = 3 gaps × 16px
    
    // Ensure minimum and maximum sizes
    const minGridSize = 60; // Minimum 60px grid size
    const maxGridSize = 200; // Maximum 200px grid size
    const gridSize = Math.max(minGridSize, Math.min(maxGridSize, Math.floor(rowHeight)));
    
    // Calculate gap proportionally (maintain the same ratio as the original design)
    const gap = Math.max(4, Math.floor(gridSize * 0.1)); // Gap is 10% of grid size, minimum 4px
    
    console.log('🖥️ Desktop grid size calculated:', {
      containerHeight,
      availableHeight,
      rowHeight,
      gridSize,
      gap,
      totalHeight: (gridSize * 4) + (gap * 3)
    });
    
    return { gridSize, gap };
  }, [isMobile]);

  // Load gallery images dynamically
  useEffect(() => {
    const loadImages = async () => {
      try {
        setIsLoading(true);
        const galleryImages = await dynamicGallery.getAllImages();
        console.log('🖼️ Loaded gallery images:', galleryImages.length);
        setImages(galleryImages);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading gallery images:', error);
        setIsLoading(false);
      }
    };

    loadImages();
  }, []);



  // Create content with all 5 sequences on one 45x4 grid
  const createInfiniteContent = useCallback(() => {
    if (images.length === 0) return [];
    
    // Create one large 45x4 grid (5 sequences × 9 columns)
    const gridItems = [];
    
    // Define the complete 45x4 grid layout
    const gridLayout = [
      // TOP ROW (rows 1-2) - 45 columns total
      // Sequence 1 (columns 1-9)
      { size: '4x2', rowSpan: 2, colSpan: 4, gridColumn: '1 / span 4', gridRow: '1 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '5 / span 2', gridRow: '1 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '7 / span 3', gridRow: '1 / span 2' },
      // Sequence 2 (columns 10-18)
      { size: '4x2', rowSpan: 2, colSpan: 4, gridColumn: '10 / span 4', gridRow: '1 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '14 / span 3', gridRow: '1 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '17 / span 2', gridRow: '1 / span 2' },
      // Sequence 3 (columns 19-27)
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '19 / span 3', gridRow: '1 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '22 / span 3', gridRow: '1 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '25 / span 3', gridRow: '1 / span 2' },
      // Sequence 4 (columns 28-36)
      { size: '4x2', rowSpan: 2, colSpan: 4, gridColumn: '28 / span 4', gridRow: '1 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '32 / span 3', gridRow: '1 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '35 / span 2', gridRow: '1 / span 2' },
      // Sequence 5 (columns 37-45)
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '37 / span 3', gridRow: '1 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '40 / span 2', gridRow: '1 / span 2' },
      { size: '4x2', rowSpan: 2, colSpan: 4, gridColumn: '42 / span 4', gridRow: '1 / span 2' },
      
      // BOTTOM ROW (rows 3-4) - 45 columns total
      // Sequence 1 (columns 1-9)
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '1 / span 2', gridRow: '3 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '3 / span 3', gridRow: '3 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '6 / span 2', gridRow: '3 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '8 / span 2', gridRow: '3 / span 2' },
      // Sequence 2 (columns 10-18)
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '10 / span 3', gridRow: '3 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '13 / span 2', gridRow: '3 / span 2' },
      { size: '4x2', rowSpan: 2, colSpan: 4, gridColumn: '15 / span 4', gridRow: '3 / span 2' },
      // Sequence 3 (columns 19-27)
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '19 / span 2', gridRow: '3 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '21 / span 3', gridRow: '3 / span 2' },
      { size: '4x2', rowSpan: 2, colSpan: 4, gridColumn: '24 / span 4', gridRow: '3 / span 2' },
      // Sequence 4 (columns 28-36)
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '28 / span 3', gridRow: '3 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '31 / span 3', gridRow: '3 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '34 / span 3', gridRow: '3 / span 2' },
      // Sequence 5 (columns 37-45)
      { size: '4x2', rowSpan: 2, colSpan: 4, gridColumn: '37 / span 4', gridRow: '3 / span 2' },
      { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '41 / span 3', gridRow: '3 / span 2' },
      { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '44 / span 2', gridRow: '3 / span 2' }
    ];
    
    // Mobile-specific 5x48 grid layout with 12 alternating sequences
    // Always maintains exactly 5 columns across, scaling with viewport width
    const createMobileGrid = () => {
      const optimalSize = getOptimalMobileGridSize();
      const totalSequences = Math.max(1, Math.ceil(images.length / 3));
      let imageCursor = 0;

      const getImageSrcAtIndex = (index) => {
        const image = images[index];
        let imageSrc = '';
        if (isCloudinaryUrl(image?.cloudinaryUrl)) {
          imageSrc = image.cloudinaryUrl;
        } else if (isCloudinaryUrl(image?.src)) {
          imageSrc = image.src;
        } else if (isCloudinaryUrl(image?.imagePath)) {
          imageSrc = image.imagePath;
        } else if (isCloudinaryUrl(image)) {
          imageSrc = image;
        } else {
          imageSrc = image?.src || image?.imagePath || (typeof image === 'string' ? image : `/gallery/${image?.filename}`) || '';
        }
        return imageSrc;
      };

      const getNextImage = () => {
        const safeLen = Math.max(images.length, 1);
        const wrappedIndex = imageCursor < safeLen ? imageCursor : ((imageCursor - safeLen) % safeLen);
        const imageSrc = getImageSrcAtIndex(wrappedIndex);
        const assignedIndex = imageCursor;
        imageCursor += 1;
        return { imageSrc, assignedIndex, wrappedIndex };
      };

      const sequences = [];
      for (let sequenceIndex = 0; sequenceIndex < totalSequences; sequenceIndex++) {
        const isEvenSequence = sequenceIndex % 2 === 0;
        const baseItems = isEvenSequence
          ? [
              { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '1 / span 3', gridRow: '1 / span 2' },
              { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '4 / span 2', gridRow: '1 / span 2' },
              { size: '5x2', rowSpan: 2, colSpan: 5, gridColumn: '1 / span 5', gridRow: '3 / span 2' }
            ]
          : [
              { size: '2x2', rowSpan: 2, colSpan: 2, gridColumn: '1 / span 2', gridRow: '1 / span 2' },
              { size: '3x2', rowSpan: 2, colSpan: 3, gridColumn: '3 / span 3', gridRow: '1 / span 2' },
              { size: '5x2', rowSpan: 2, colSpan: 5, gridColumn: '1 / span 5', gridRow: '3 / span 2' }
            ];

        const gridItems = baseItems.map((item, itemIndex) => {
          const { imageSrc, assignedIndex } = getNextImage();
          return {
            ...item,
            imageSrc,
            sequenceIndex,
            itemIndex: assignedIndex,
            uniqueKey: `mobile-seq-${sequenceIndex}-${itemIndex}`
          };
        });

        sequences.push({
          sequenceIndex,
          gridItems,
          width: '100%',
          optimalGridSize: optimalSize.gridSize,
          optimalGap: optimalSize.gap
        });
      }

      return sequences;
    };
    
    // Use mobile grid layout if on mobile, otherwise use desktop layout
    if (isMobile) {
      console.log('📱 Creating mobile grid layout');
      const mobileSequences = createMobileGrid();
      const totalMobileItems = mobileSequences.reduce((sum, s) => sum + (s.gridItems?.length || 0), 0);
      console.log('📱 Mobile grid items:', totalMobileItems, 'Sequences:', mobileSequences.length);
      return mobileSequences;
    } else {
      console.log('🖥️ Creating desktop grid layout');
      // Desktop layout - add all items from the grid layout
      const imageCount = images.length;

      const getImageSrcAtIndex = (index) => {
        const image = images[index];
        let imageSrc = '';
        if (isCloudinaryUrl(image?.cloudinaryUrl)) {
          imageSrc = image.cloudinaryUrl;
        } else if (isCloudinaryUrl(image?.src)) {
          imageSrc = image.src;
        } else if (isCloudinaryUrl(image?.imagePath)) {
          imageSrc = image.imagePath;
        } else if (isCloudinaryUrl(image)) {
          imageSrc = image;
        } else {
          imageSrc = image?.src || image?.imagePath || (typeof image === 'string' ? image : `/gallery/${image?.filename}`) || '';
        }
        return imageSrc;
      };

      const parseGridPlacement = (placement) => {
        const parts = String(placement || '').split('/').map(s => s.trim());
        const start = Number.parseInt(parts[0], 10);
        const span = parts[1]?.startsWith('span') ? Number.parseInt(parts[1].replace('span', '').trim(), 10) : 1;
        return {
          start: Number.isFinite(start) ? start : 1,
          span: Number.isFinite(span) ? span : 1
        };
      };

      const desktopSequenceWidthColumns = 9;
      const baseSequenceCount = 5;

      const sequenceTemplates = Array.from({ length: baseSequenceCount }, () => []);
      gridLayout.forEach((item) => {
        const { start: colStart } = parseGridPlacement(item.gridColumn);
        const seqIndex = Math.floor((colStart - 1) / desktopSequenceWidthColumns);
        if (seqIndex < 0 || seqIndex >= baseSequenceCount) return;

        const seqStartCol = (seqIndex * desktopSequenceWidthColumns) + 1;
        const relativeStartCol = colStart - seqStartCol + 1;
        sequenceTemplates[seqIndex].push({
          ...item,
          _relativeStartCol: relativeStartCol
        });
      });

      let desktopSequenceCount = 0;
      let desktopSlots = 0;
      while (desktopSlots < imageCount) {
        const template = sequenceTemplates[desktopSequenceCount % sequenceTemplates.length];
        desktopSlots += template.length;
        desktopSequenceCount += 1;
      }
      desktopSequenceCount = Math.max(desktopSequenceCount, 1);
      const desktopTotalColumns = desktopSequenceCount * desktopSequenceWidthColumns;

      let imageCursor = 0;
      for (let seq = 0; seq < desktopSequenceCount; seq++) {
        const template = sequenceTemplates[seq % sequenceTemplates.length];
        for (let t = 0; t < template.length; t++) {
          const templateItem = template[t];
          const colSpan = templateItem.colSpan;
          const absStartCol = (seq * desktopSequenceWidthColumns) + templateItem._relativeStartCol;

          const wrappedIndex = imageCursor < imageCount
            ? imageCursor
            : (imageCursor - imageCount < imageCount ? (imageCursor - imageCount) : (imageCursor % imageCount));

          const imageSrc = getImageSrcAtIndex(wrappedIndex);
          gridItems.push({
            ...templateItem,
            gridColumn: `${absStartCol} / span ${colSpan}`,
            imageSrc,
            sequenceIndex: seq,
            itemIndex: imageCursor,
            uniqueKey: `desktop-seq-${seq}-${t}`
          });

          imageCursor += 1;
        }
      }
      
      // Return one large grid instead of separate sequences
      const responsiveSize = getResponsiveDesktopGridSize();
      return [{
        sequenceIndex: 0,
        gridItems: gridItems,
        width: (desktopTotalColumns * responsiveSize.gridSize) + ((desktopTotalColumns - 1) * responsiveSize.gap),
        totalColumns: desktopTotalColumns,
        optimalGridSize: responsiveSize.gridSize,
        optimalGap: responsiveSize.gap
      }];
    }
  }, [images, isMobile, getOptimalMobileGridSize, getResponsiveDesktopGridSize]);

  // Memoize content to prevent unnecessary re-renders
  const infiniteContent = useMemo(() => createInfiniteContent(), [createInfiniteContent]);

  const desktopTotalColumns = useMemo(() => {
    if (isMobile) return 0;
    return infiniteContent?.[0]?.totalColumns || 45;
  }, [infiniteContent, isMobile]);

  // Set initial scroll position once when images load
  useEffect(() => {
    if (images.length > 0 && !isLoading) {
      // Start at the beginning of the 45-column grid
      const startPosition = 0;
      
      // Set scroll position with minimal delay to ensure DOM is ready
      requestAnimationFrame(() => {
        setScrollPosition(startPosition);
        setInitialScrollPosition(startPosition);
        setLeftmostPosition(startPosition);
      });
    }
  }, [images, isLoading]);

  // Add boundary constraints to prevent over-scrolling
  const constrainScrollPosition = useCallback((position) => {
    // Remove artificial constraints - let navigation work naturally
    return position;
  }, []);

  // Update scroll position with constraints
  const updateScrollPosition = useCallback((newPosition) => {
    const constrainedPosition = constrainScrollPosition(newPosition);
    setScrollPosition(constrainedPosition);
  }, [constrainScrollPosition]);

  // Handle arrow key navigation
  const handleKeyDown = useCallback((e) => {
    if (isAnimating) return;
    
    switch (e.key) {
      case 'ArrowLeft':
      {
        e.preventDefault();
        const responsiveSize = getResponsiveDesktopGridSize();
        const columnWidth = responsiveSize.gridSize;
        const columnGap = responsiveSize.gap;
        const navColumns = 9;
        const navigationWidthFor = (cols) => (cols * columnWidth) + (Math.max(cols - 1, 0) * columnGap);
        const sequenceWidth = navigationWidthFor(navColumns);
        if (hasNavigatedRight) { // Only allow left navigation after right navigation has occurred
          // Simple check - if we're at the beginning, don't go further left
          if (scrollPosition === initialScrollPosition) {
            return; // Already at the first sequence, can't go further left
          }

          const totalGridWidth = (desktopTotalColumns * columnWidth) + ((desktopTotalColumns - 1) * columnGap);
          const containerWidth = containerRef.current?.offsetWidth || 0;
          const minScrollLeft = containerWidth > 0 ? -(totalGridWidth - containerWidth) : -Infinity;
          const maxScrollLeft = 0;
          const newLeftPosition = Math.min(maxScrollLeft, Math.max(minScrollLeft, scrollPosition + sequenceWidth));
          updateScrollPosition(newLeftPosition);
        }
        break;
      }
      case 'ArrowRight':
      {
        e.preventDefault();
        setHasNavigatedRight(true); // Enable left navigation after first right navigation
        const responsiveSize = getResponsiveDesktopGridSize();
        const columnWidth = responsiveSize.gridSize;
        const columnGap = responsiveSize.gap;
        const navColumns = 9;
        const navigationWidthFor = (cols) => (cols * columnWidth) + (Math.max(cols - 1, 0) * columnGap);
        const totalGridWidth = (desktopTotalColumns * columnWidth) + ((desktopTotalColumns - 1) * columnGap);
        const currentPosition = Math.abs(scrollPosition);
        const remainingColumns = Math.ceil((totalGridWidth - currentPosition) / (columnWidth + columnGap)); // Calculate remaining columns
        
        // If no columns left, we're at the end
        if (remainingColumns <= 0) {
          return; // Already at the end, can't go further right
        }
        
        let navigationWidth;
        const colsToMove = Math.min(navColumns, remainingColumns);
        navigationWidth = navigationWidthFor(colsToMove);
        
        const containerWidth = containerRef.current?.offsetWidth || 0;
        const minScrollLeft = containerWidth > 0 ? -(totalGridWidth - containerWidth) : -Infinity;
        const maxScrollLeft = 0;
        const newRightPosition = Math.min(maxScrollLeft, Math.max(minScrollLeft, scrollPosition - navigationWidth));
        
        // Track the leftmost position reached
        if (newRightPosition < leftmostPosition) {
          setLeftmostPosition(newRightPosition);
        }
        updateScrollPosition(newRightPosition);
        break;
      }
      default:
        break;
    }
  }, [isAnimating, scrollPosition, updateScrollPosition, hasNavigatedRight, leftmostPosition, initialScrollPosition, getResponsiveDesktopGridSize, desktopTotalColumns]);

  // Cleanup animation frame
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Scroll event gallery to align bottom with bottom of screen
  const scrollGalleryToBottom = useCallback(() => {
    if (isMobile) return; // Only for desktop
    
    // Find the event gallery container element by traversing up the DOM
    // The containerRef is inside the EventGallery component, which is inside a div with eventsRef in Home.js
    let parentElement = containerRef.current;
    let eventGallerySection = null;
    
    // Traverse up to find the parent container with background style (the eventsRef div)
    while (parentElement && !eventGallerySection) {
      parentElement = parentElement.parentElement;
      if (parentElement) {
        const style = window.getComputedStyle(parentElement);
        // Look for the container with white background and padding (the eventsRef container)
        if (style.backgroundColor === 'rgb(255, 255, 255)' || 
            parentElement.style?.background === '#fff' ||
            parentElement.getAttribute('ref') === 'eventsRef') {
          eventGallerySection = parentElement;
          break;
        }
      }
    }
    
    // Fallback: try to find by ID or use containerRef's parent
    if (!eventGallerySection) {
      eventGallerySection = document.getElementById('mobile-events-section') ||
                           containerRef.current?.closest('div[style*="background"]');
    }
    
    if (eventGallerySection) {
      setTimeout(() => {
        eventGallerySection.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    } else {
      // Final fallback: calculate scroll position manually
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const scrollTarget = window.pageYOffset + containerRect.bottom - window.innerHeight;
        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
      }
    }
  }, [isMobile]);

  // Navigation functions with smooth animation
  const handlePrev = useCallback(() => {
    if (isAnimating || !hasNavigatedRight) return; // Prevent left navigation until right navigation has occurred
    
    // Simple check - if we're at the beginning, don't go further left
    if (scrollPosition === initialScrollPosition) {
      return; // Already at the first sequence, can't go further left
    }
    
    setIsAnimating(true);
    
    // Use a simpler, more predictable navigation approach for left scrolling
    // Move 5 columns (or as many as possible to reach the beginning)
    const responsiveSize = getResponsiveDesktopGridSize();
    const columnWidth = responsiveSize.gridSize; // Width of each column
    const columnGap = responsiveSize.gap; // Gap between columns
    const navColumns = 9;
    
    // Calculate how far we can move left (towards 0)
    const distanceToBeginning = Math.abs(scrollPosition - initialScrollPosition);
    const maxColumnsToMove = Math.ceil(distanceToBeginning / (columnWidth + columnGap));
    
    // If we can move navColumns or more columns, move navColumns; otherwise move the exact amount needed
    let columnsToMove;
    if (maxColumnsToMove >= navColumns) {
      columnsToMove = navColumns;
    } else {
      columnsToMove = maxColumnsToMove;
    }
    
    // Calculate the navigation width
    let navigationWidth = columnsToMove * columnWidth + (Math.max(columnsToMove - 1, 0) * columnGap);
    
    // Calculate the new position (moving towards 0)
    const newPosition = scrollPosition + navigationWidth;
    
    // Check boundary: ensure the left edge of the grid doesn't go further right than 0px from left side
    // The boundary is calculated based on the 0px margin from left
    if (containerRef.current) {
      const maxScrollLeft = 0; // 0px margin from left (initial position)
      
      if (newPosition > maxScrollLeft) {
        // Adjust to respect the boundary
        navigationWidth = maxScrollLeft - scrollPosition;
        // Recalculate the new position
        const adjustedNewPosition = scrollPosition + navigationWidth;
        
        // If we can't move at all due to boundary, don't animate
        if (adjustedNewPosition === scrollPosition) {
          setIsAnimating(false);
          return;
        }
        
        // Update the new position to the boundary
        const finalPosition = adjustedNewPosition;
        
        // Scroll to top of event gallery immediately (before animation)
        if (onArrowClick) {
          onArrowClick();
        }
        
        // Smooth animation to the boundary
        const startPosition = scrollPosition;
        const endPosition = finalPosition;
        const startTime = performance.now();
        const duration = 600; // 600ms for smooth sliding
        
        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Easing function for smooth deceleration
          const easeOutCubic = 1 - Math.pow(1 - progress, 3);
          const currentPosition = startPosition + (endPosition - startPosition) * easeOutCubic;
          
          updateScrollPosition(currentPosition);
          
          if (progress < 1) {
            animationFrameRef.current = requestAnimationFrame(animate);
          } else {
            setIsAnimating(false);
          }
        };
        
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
    }
    
    // Ensure we don't go past the initial position
    const finalPosition = Math.min(newPosition, initialScrollPosition);
    
    // Scroll to top of event gallery immediately (before animation)
    if (onArrowClick) {
      onArrowClick();
    }
    
    // Smooth animation
    const startPosition = scrollPosition;
    const endPosition = finalPosition;
    const startTime = performance.now();
    const duration = 600; // 600ms for smooth sliding
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth deceleration
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentPosition = startPosition + (endPosition - startPosition) * easeOutCubic;
      
      updateScrollPosition(currentPosition);
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isAnimating, scrollPosition, updateScrollPosition, hasNavigatedRight, initialScrollPosition, getResponsiveDesktopGridSize, onArrowClick]);

  const handleNext = useCallback(() => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    setHasNavigatedRight(true); // Enable left navigation after first right navigation
    
    // Calculate how many columns are left to navigate on the 45-column grid
    const responsiveSize = getResponsiveDesktopGridSize();
    const columnWidth = responsiveSize.gridSize;
    const columnGap = responsiveSize.gap;
    const totalGridWidth = (desktopTotalColumns * columnWidth) + ((desktopTotalColumns - 1) * columnGap);
    const currentPosition = Math.abs(scrollPosition);
    const remainingColumns = Math.ceil((totalGridWidth - currentPosition) / (columnWidth + columnGap)); // Calculate remaining columns
    
    // If no columns left, we're at the end
    if (remainingColumns <= 0) {
      setIsAnimating(false);
      return; // Already at the end, can't go further right
    }
    
    const navColumns = 9;
    const colsToMove = Math.min(navColumns, remainingColumns);
    let navigationWidth = colsToMove * columnWidth + (Math.max(colsToMove - 1, 0) * columnGap);
    
    const newPosition = scrollPosition - navigationWidth;
    
    // Check boundary: ensure the right edge of the grid doesn't go further left than 0px from right side
    // The boundary is calculated based on the container width and the 0px margin
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const maxScrollLeft = -(totalGridWidth - containerWidth + 0); // 0px margin from right
      
      if (newPosition < maxScrollLeft) {
        // Adjust to respect the boundary
        navigationWidth = scrollPosition - maxScrollLeft;
        // Recalculate the new position
        const adjustedNewPosition = scrollPosition - navigationWidth;
        
        // If we can't move at all due to boundary, don't animate
        if (adjustedNewPosition === scrollPosition) {
          setIsAnimating(false);
          return;
        }
        
        // Update the new position to the boundary
        const finalNewPosition = adjustedNewPosition;
        
        // Track the leftmost position reached (most negative scroll position)
        if (finalNewPosition < leftmostPosition) {
          setLeftmostPosition(finalNewPosition);
        }
        
        // Scroll to top of event gallery immediately (before animation)
        if (onArrowClick) {
          onArrowClick();
        }
        
        // Smooth animation to the boundary
        const startPosition = scrollPosition;
        const endPosition = finalNewPosition;
        const startTime = performance.now();
        const duration = 600; // 600ms for smooth sliding
        
        const animate = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          
          // Easing function for smooth deceleration
          const easeOutCubic = 1 - Math.pow(1 - progress, 3);
          const currentPosition = startPosition + (endPosition - startPosition) * easeOutCubic;
          
          updateScrollPosition(currentPosition);
          
          if (progress < 1) {
            animationFrameRef.current = requestAnimationFrame(animate);
          } else {
            setIsAnimating(false);
          }
        };
        
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
    }
    
    // Track the leftmost position reached (most negative scroll position)
    if (newPosition < leftmostPosition) {
      setLeftmostPosition(newPosition);
    }
    
    // Scroll to top of event gallery immediately (before animation)
    if (onArrowClick) {
      onArrowClick();
    }
    
    // Smooth animation
    const startPosition = scrollPosition;
    const endPosition = newPosition;
    const startTime = performance.now();
    const duration = 600; // 600ms for smooth sliding
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth deceleration
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentPosition = startPosition + (endPosition - startPosition) * easeOutCubic;
      
      updateScrollPosition(currentPosition);
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isAnimating, scrollPosition, updateScrollPosition, leftmostPosition, getResponsiveDesktopGridSize, onArrowClick, desktopTotalColumns]);


  
  // Create a flat list of all unique images for navigation
  const allImagesList = useMemo(() => {
    if (infiniteContent.length === 0) return [];
    const imageSet = new Set();
    const imageList = [];
    
    infiniteContent.forEach(sequence => {
      sequence.gridItems.forEach(item => {
        if (item.imageSrc && !imageSet.has(item.imageSrc)) {
          imageSet.add(item.imageSrc);
          imageList.push(item.imageSrc);
        }
      });
    });
    
    return imageList;
  }, [infiniteContent]);

  const handleModalPrev = useCallback(() => {
    if (selectedImageIndex !== null && selectedImageIndex > 0) {
      const newIndex = selectedImageIndex - 1;
      setSelectedImageIndex(newIndex);
      setSelectedImage(allImagesList[newIndex]);
    }
  }, [selectedImageIndex, allImagesList]);

  const handleModalNext = useCallback(() => {
    if (selectedImageIndex !== null && selectedImageIndex < allImagesList.length - 1) {
      const newIndex = selectedImageIndex + 1;
      setSelectedImageIndex(newIndex);
      setSelectedImage(allImagesList[newIndex]);
    }
  }, [selectedImageIndex, allImagesList]);

  const handleFullscreenPrev = useCallback(() => {
    if (fullscreenImageIndex !== null && fullscreenImageIndex > 0) {
      const newIndex = fullscreenImageIndex - 1;
      setFullscreenImageIndex(newIndex);
      setFullscreenImage(allImagesList[newIndex]);
    }
  }, [fullscreenImageIndex, allImagesList]);

  const handleFullscreenNext = useCallback(() => {
    if (fullscreenImageIndex !== null && fullscreenImageIndex < allImagesList.length - 1) {
      const newIndex = fullscreenImageIndex + 1;
      setFullscreenImageIndex(newIndex);
      setFullscreenImage(allImagesList[newIndex]);
    }
  }, [fullscreenImageIndex, allImagesList]);

  const handleImageClick = (imageSrc) => {
    if (isMobile) {
      // On mobile, open fullscreen view with navigation
      const imageIndex = allImagesList.findIndex(img => img === imageSrc);
      setFullscreenImage(imageSrc);
      setFullscreenImageIndex(imageIndex >= 0 ? imageIndex : null);
      setIsFullscreen(true);
    } else {
      // On desktop, open modal
      const imageIndex = allImagesList.findIndex(img => img === imageSrc);
      setSelectedImage(imageSrc);
      setSelectedImageIndex(imageIndex >= 0 ? imageIndex : null);
    }
  };

  const closeModal = () => {
    setSelectedImage(null);
    setSelectedImageIndex(null);
  };

  const closeFullscreen = () => {
    setIsFullscreen(false);
    setFullscreenImage(null);
    setFullscreenImageIndex(null);
  };

  // Handle screen orientation unlock for mobile fullscreen photo view
  useEffect(() => {
    if (!isMobile) return;

    if (isFullscreen && fullscreenImage) {
      // Check initial orientation
      const checkOrientation = () => {
        const isLandscapeMode = window.innerWidth > window.innerHeight;
        setIsLandscape(isLandscapeMode);
      };
      
      checkOrientation();

      // Listen for orientation changes
      const handleOrientationChange = () => {
        setTimeout(() => {
          const isLandscapeMode = window.innerWidth > window.innerHeight;
          setIsLandscape(isLandscapeMode);
        }, 100);
      };

      window.addEventListener('resize', handleOrientationChange);
      window.addEventListener('orientationchange', handleOrientationChange);

      // Unlock orientation when fullscreen opens
      const unlockOrientation = async () => {
        try {
          // Check if Screen Orientation API is available
          if (window.screen.orientation && window.screen.orientation.unlock) {
            await window.screen.orientation.unlock();
            console.log('📱 Orientation unlocked for fullscreen photo view');
          } else if (window.screen.lockOrientation) {
            // Fallback for older browsers
            window.screen.lockOrientation('any');
          } else if (window.screen.mozLockOrientation) {
            // Firefox
            window.screen.mozLockOrientation('any');
          } else if (window.screen.msLockOrientation) {
            // IE/Edge
            window.screen.msLockOrientation('any');
          }
        } catch (error) {
          console.log('⚠️ Could not unlock orientation:', error);
        }
      };

      unlockOrientation();

      // Lock back to portrait when fullscreen closes
      return () => {
        window.removeEventListener('resize', handleOrientationChange);
        window.removeEventListener('orientationchange', handleOrientationChange);
        
        const lockOrientation = async () => {
          try {
            if (window.screen.orientation && window.screen.orientation.lock) {
              await window.screen.orientation.lock('portrait');
              console.log('📱 Orientation locked back to portrait');
            } else if (window.screen.lockOrientation) {
              window.screen.lockOrientation('portrait');
            } else if (window.screen.mozLockOrientation) {
              window.screen.mozLockOrientation('portrait');
            } else if (window.screen.msLockOrientation) {
              window.screen.msLockOrientation('portrait');
            }
          } catch (error) {
            console.log('⚠️ Could not lock orientation:', error);
          }
        };

        lockOrientation();
      };
    }
  }, [isFullscreen, fullscreenImage, isMobile]);

  // Handle keyboard navigation for modal (desktop)
  useEffect(() => {
    if (!selectedImage || isMobile) return;

    const handleModalKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleModalPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleModalNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleModalKeyDown);
    };
  }, [selectedImage, isMobile, handleModalPrev, handleModalNext]);

  // Handle keyboard navigation for fullscreen (mobile)
  useEffect(() => {
    if (!isFullscreen || !isMobile) return;

    const handleFullscreenKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleFullscreenPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleFullscreenNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeFullscreen();
      }
    };

    window.addEventListener('keydown', handleFullscreenKeyDown);
    return () => {
      window.removeEventListener('keydown', handleFullscreenKeyDown);
    };
  }, [isFullscreen, isMobile, handleFullscreenPrev, handleFullscreenNext]);

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: embedded ? '200px' : '100vh', 
        backgroundColor: '#fff', 
        padding: embedded ? '1rem 0' : '2rem 0',
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>Loading gallery...</div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div style={{ 
        minHeight: embedded ? '200px' : '100vh', 
        backgroundColor: '#fff', 
        padding: embedded ? '1rem 0' : '2rem 0',
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>No gallery images found</div>
      </div>
    );
  }

  // Don't render until content is ready
  if (infiniteContent.length === 0) {
    return (
      <div style={{ 
        minHeight: embedded ? '200px' : '100vh', 
        backgroundColor: '#fff', 
        padding: embedded ? '1rem 0' : '2rem 0',
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>No gallery content found</div>
      </div>
    );
  }

  return (
    <>
      <style>{modalAnimations}</style>
      <div style={{ 
        minHeight: embedded ? 'auto' : 'auto', // No fixed height to prevent spacing
        padding: embedded ? '0' : '0 0 120px 0', // Add 60px more lower padding (60px + 60px = 120px)
        margin: embedded ? '0' : '0 0 60px 0', // No top margin, keep bottom margin
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
        width: '100%',
        height: isMobile ? 'auto' : '100%',
        overflow: 'hidden',
        background: 'transparent'
      }}>
      {/* MAIN GALLERY CONTAINER - THIS IS THE ONE YOU WANT FOR BACKGROUND COLORS/FILLS */}
      <div style={{ 
        width: '100%', 
        maxWidth: embedded ? '100%' : '1400px', 
        margin: '0 auto', 
        padding: embedded ? '0' : isSmallScreen ? '0 1rem 120px 1rem' : '0 1rem', // Add bottom padding for small screens
        backgroundColor: 'transparent',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'center',
        minHeight: isMobile ? 'auto' : '100%'
      }}>
        {/* Container - Horizontal scrolling for desktop, vertical scrolling for mobile */}
        <div 
          ref={containerRef}
          style={{
            width: '100%',
            maxWidth: '100%', // Ensure it doesn't exceed container width
            overflow: isMobile ? 'visible' : 'hidden', // Hidden for desktop to contain scrolling grid
            position: 'relative',
            background: 'transparent',
            pointerEvents: 'auto', // Enable pointer events for hover detection
            height: isMobile ? 'auto' : 'calc(100vh * 29 / 32)', // Grid (27/32) + arrows (1/16 = 2/32) = 29/32 browser screen height
            display: 'flex',
            flexDirection: 'column', // Stack scrollContainer and arrows vertically
            alignItems: 'stretch', // Stretch to full width
            justifyContent: 'flex-start' // Align to top instead of center
          }}
          onKeyDown={isMobile ? undefined : handleKeyDown}
          tabIndex={0}
        >
          <div 
            ref={scrollContainerRef}
            onMouseEnter={() => {
              setIsGalleryHovered(true);
              if (onGalleryHoverChange) {
                onGalleryHoverChange(true);
              }
            }}
            onMouseLeave={() => {
              setIsGalleryHovered(false);
              if (onGalleryHoverChange) {
                onGalleryHoverChange(false);
              }
              // Clear any remaining hovered photo
              setHoveredPhotoId(null);
              
              // Force a clean restart of the animation system
              setTimeout(() => {
                // This will trigger the useEffect to restart the animation
              }, 100);
            }}
            style={{
              display: isMobile ? 'block' : 'flex', // Block for mobile (vertical), flex for desktop (horizontal)
              flexDirection: isMobile ? 'column' : 'row', // Explicit flex direction
              transform: isMobile ? 'none' : `translateX(${scrollPosition}px)`, // No transform for mobile
              transition: 'none', // No CSS transition, using JS animation instead
              willChange: isMobile ? 'auto' : 'transform',
              userSelect: 'none',
              maxWidth: 'none', // Allow content to extend beyond container for horizontal scrolling
              opacity: isLoading ? 0 : 1, // Fade in when ready
              background: 'transparent',
              overflow: isMobile ? 'visible' : 'hidden', // Clip content for horizontal scrolling
              position: 'relative',
              zIndex: 1, // Lower z-index than arrows
              height: isMobile ? 'auto' : 'calc(100vh * 27 / 32)', // Grid height - 27/32 browser screen height
              width: 'fit-content', // Fit content width (sequence width) so grid can extend beyond viewport
              minWidth: '100%', // At least viewport width
              flexShrink: 0, // Don't shrink
              alignSelf: 'stretch' // Ensure it stretches to full width
            }}
          >
            {infiniteContent.map((sequence, sequenceRenderIndex) => (
              (() => {
                const mobileRowsUsed = isMobile
                  ? (() => {
                      let maxRow = 0;
                      for (const item of sequence.gridItems || []) {
                        if (item?.itemIndex === -1) continue;
                        const gridRow = typeof item?.gridRow === 'string' ? item.gridRow : '';
                        const parts = gridRow.split('/').map(s => s.trim());
                        const start = Number.parseInt(parts[0], 10);
                        const span = parts[1]?.startsWith('span') ? Number.parseInt(parts[1].replace('span', '').trim(), 10) : 1;
                        if (!Number.isFinite(start)) continue;
                        const end = start + (Number.isFinite(span) ? span : 1) - 1;
                        if (end > maxRow) maxRow = end;
                      }
                      return Math.max(maxRow, 1);
                    })()
                  : 0;

                const mobileGridSizePx = sequence.optimalGridSize || mobileGridSize;
                const mobileGapPx = sequence.optimalGap || mobileGap;
                const mobileGridHeight = `${(mobileGridSizePx * mobileRowsUsed) + (Math.max(mobileRowsUsed - 1, 0) * mobileGapPx)}px`;
                const desktopCols = sequence.totalColumns || desktopTotalColumns || 45;

                return (
              <div 
                key={`sequence-${sequence.sequenceIndex}`}
                style={{ 
                  marginRight: isMobile ? '0' : '2rem',
                  marginBottom: isMobile
                    ? (sequenceRenderIndex === infiniteContent.length - 1 ? '0' : '4px')
                    : '0', // Add bottom margin for mobile stacking
                  flexShrink: isMobile ? '1' : '0',
                  flexGrow: '0', // Don't grow
                  flexBasis: 'auto', // Use natural width
                  maxWidth: 'none', // Allow sequence to extend beyond container for horizontal scrolling
                  width: isMobile ? 'auto' : `${(desktopCols * (sequence.optimalGridSize || 160)) + ((desktopCols - 1) * (sequence.optimalGap || 16))}px`, // Explicit width matching grid
                  background: 'transparent'
                }}
              >
                {/* Grid - 45x4 for desktop, 5x48 for mobile, responsive for small screens */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? `repeat(5, ${sequence.optimalGridSize || mobileGridSize}px)` : `repeat(${desktopCols}, ${sequence.optimalGridSize || 160}px)`,
                  gridTemplateRows: isMobile ? `repeat(${mobileRowsUsed}, 1fr)` : 'repeat(4, 1fr)', // Scale rows to fit container height
                  gap: isMobile ? `${sequence.optimalGap || mobileGap}px` : `${sequence.optimalGap || 16}px`, // Responsive gap for desktop
                  width: isMobile ? '100%' : `${(desktopCols * (sequence.optimalGridSize || 160)) + ((desktopCols - 1) * (sequence.optimalGap || 16))}px`,
                  maxWidth: 'none', // Allow grid to extend beyond container for horizontal scrolling
                  height: isMobile ? mobileGridHeight : 'calc(100vh * 27 / 32)', // 27/32 browser height for desktop
                  margin: '0', // Remove auto margin that might constrain width
                  padding: isMobile ? '0' : '0', // No padding for desktop
                  lineHeight: '0', // Remove any line height spacing
                  fontSize: '0', // Remove any font size spacing
                  boxSizing: 'border-box', // Ensure padding and borders are included in dimensions
                  background: 'transparent' // Ensure grid area is transparent to show gradient behind
                }}>
                  {sequence.gridItems.map((item) => (
                    <div 
                      key={item.uniqueKey}
                      style={{ 
                        position: 'relative',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        gridColumn: item.gridColumn,
                        gridRow: item.gridRow,
                        transformOrigin: 'center center',
                        border: 'none',
                        margin: '0', // Remove any margins
                        padding: '0', // Remove any padding
                        lineHeight: '0', // Remove line height spacing
                        fontSize: '0', // Remove font size spacing
                        pointerEvents: 'auto', // Re-enable pointer events for images only
                        // Mobile-specific sizing - let photos flow naturally in square grid
                        minHeight: isMobile ? 'auto' : 'auto',
                        maxHeight: isMobile ? 'auto' : 'auto'
                      }}
                      onMouseEnter={(e) => {
                        if (!isMobile) {
                          const container = e.currentTarget;
                          container.style.transform = 'scale(1.025)';
                          container.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
                          container.style.zIndex = '10';
                        }
                        // Track which photo is being hovered
                        setHoveredPhotoId(item.uniqueKey);
                        // Ensure gallery is marked as hovered
                        setIsGalleryHovered(true);
                      }}
                      onMouseLeave={(e) => {
                        if (!isMobile) {
                          const container = e.currentTarget;
                          container.style.transform = 'scale(1)';
                          container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                          container.style.zIndex = '1';
                        }
                        // Clear hovered photo tracking
                        setHoveredPhotoId(null);
                        
                        // Check if mouse is still over the gallery area
                        // Use a small delay to prevent flickering between states
                        setTimeout(() => {
                          // Only change state if we're not hovering over any photo and not over the gallery
                          if (!containerRef.current?.matches(':hover') && !hoveredPhotoId) {
                            setIsGalleryHovered(false);
                          }
                        }, 100);
                      }}
                      onClick={() => handleImageClick(item.imageSrc)}
                    >
                      {item.imageSrc && (
                        <img
                          src={isCloudinaryUrl(item.imageSrc) ? getEventOptimizedUrl(item.imageSrc) : item.imageSrc}
                          loading="lazy"
                          decoding="async"
                          alt={`Gallery ${item.sequenceIndex}-${item.itemIndex}`}
                        onError={(e) => {
                          console.error(`❌ Image failed to load:`, item.imageSrc);
                          console.error(`   Item details:`, item);
                          // Hide the broken image
                          e.target.style.display = 'none';
                        }}
                        onLoad={() => {
                          console.log(`✅ Image loaded successfully:`, item.imageSrc);
                        }}
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          objectFit: 'cover',
                          display: 'block',
                          pointerEvents: 'none',
                          // Mobile-specific image sizing - let photos flow naturally in square grid
                          minHeight: isMobile ? 'auto' : 'auto',
                          maxHeight: isMobile ? 'auto' : 'auto',
                          filter: (() => {
                            // Mobile: no darkening filter
                            if (isMobile) {
                              return 'brightness(1)';
                            }
                            // Desktop: HOVER STATE: When gallery is hovered, all photos go dark except the one being hovered
                            if (isGalleryHovered) {
                              // If this specific photo is being hovered, make it bright
                              if (hoveredPhotoId === item.uniqueKey) {
                                return 'brightness(1)';
                              }
                              // Otherwise, make it less dark
                              return 'brightness(0.7)';
                            }
                            
                            // When not hovered, all photos stay at normal brightness
                            return 'brightness(1)';
                          })(),
                          transition: 'filter 0.75s ease-in-out' // Smooth fade transition
                        }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
                );
              })()
            ))}
          </div>

          {/* Gallery navigation arrows - positioned directly under the gallery grid (hidden for mobile and when modal/fullscreen is open) */}
          {!isMobile && !selectedImage && !isFullscreen && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            position: 'relative',
            width: '100%',
            height: 'calc(100vh / 16)', // 1/16 browser screen height
            paddingTop: '14px',
            paddingBottom: '0',
            paddingLeft: '0',
            paddingRight: '0',
            marginBottom: '0',
            zIndex: 10010
          }}>
        {/* Left side - Schedule An Event button */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '244px',
          paddingLeft: 0,
          boxSizing: 'border-box'
        }}>
          <button
            onClick={() => {
              const eventRequestSection = document.getElementById('event-request-section');
              if (eventRequestSection) {
                eventRequestSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            onMouseEnter={(e) => {
              e.target.style.color = '#000000';
              e.target.style.borderColor = '#000000';
            }}
            onMouseLeave={(e) => {
              e.target.style.color = '#888888';
              e.target.style.borderColor = '#888888';
            }}
            onMouseDown={(e) => {
              e.target.style.color = '#000000';
              e.target.style.borderColor = '#000000';
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '10px 16px',
              background: 'transparent',
              border: '2px solid #888888',
              borderRadius: 0,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              minHeight: '32px',
              boxShadow: 'none',
              opacity: 1,
              visibility: 'visible',
              color: '#888888',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              fontSize: '1.1rem',
              fontWeight: 400,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap'
            }}
          >
            SCHEDULE AN EVENT
          </button>
        </div>

                  {/* Center - Navigation arrows */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            gap: 40,
            flex: 1
          }}>
          <button
            onClick={handlePrev}
            disabled={isAnimating || !hasNavigatedRight || scrollPosition >= initialScrollPosition}
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
              display: 'flex', // Always visible
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              margin: 0,
              transition: 'all 0.3s ease', // Smooth transition for color changes
              opacity: isAnimating ? 0.6 : 1
            }}
            aria-label="Previous gallery"
            onMouseEnter={(e) => {
              if (!isAnimating) {
                e.currentTarget.style.color = '#000';
                e.target.style.transform = 'scale(1.1)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#888';
              e.target.style.transform = 'scale(1)';
            }}
          >
            <svg 
              width="32" 
              height="32" 
              viewBox="0 0 32 32" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg" 
              style={{ display: 'block' }}
            >
              <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          
          <button
            onClick={handleNext}
            disabled={isAnimating}
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
              transition: 'all 0.2s ease',
              opacity: isAnimating ? 0.6 : 1
            }}
            aria-label="Next gallery"
            onMouseEnter={(e) => {
              if (!isAnimating) {
                e.currentTarget.style.color = '#000';
                e.target.style.transform = 'scale(1.1)';
              }
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

        {/* Right side - Social media icons */}
        <div style={{
          display: 'flex',
          gap: '50px',
          alignItems: 'center'
        }}>
          <button style={{
            background: 'none',
            border: 'none',
            padding: '8px',
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#666',
            transition: 'all 0.2s ease',
          }} onMouseEnter={(e) => {
            e.target.style.transform = 'scale(1.1)';
            const img = e.currentTarget.querySelector('img');
            if (img) img.style.filter = 'brightness(0) saturate(100%)';
          }} onMouseLeave={(e) => {
            e.target.style.transform = 'scale(1)';
            const img = e.currentTarget.querySelector('img');
            if (img) img.style.filter = 'brightness(0) saturate(100%) invert(46%) sepia(0%) saturate(0%) hue-rotate(0deg)';
          }}>
            <img src="/assets/socials/instagram.svg" alt="Instagram" style={{ width: '32px', height: '32px', filter: 'brightness(0) saturate(100%) invert(46%) sepia(0%) saturate(0%) hue-rotate(0deg)', transition: 'all 0.2s ease' }} />
          </button>
          <button style={{
            background: 'none',
            border: 'none',
            padding: '8px',
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#666',
            transition: 'all 0.2s ease',
          }} onMouseEnter={(e) => {
            e.target.style.transform = 'scale(1.1)';
            const img = e.currentTarget.querySelector('img');
            if (img) img.style.filter = 'brightness(0) saturate(100%)';
          }} onMouseLeave={(e) => {
            e.target.style.transform = 'scale(1)';
            const img = e.currentTarget.querySelector('img');
            if (img) img.style.filter = 'brightness(0) saturate(100%) invert(46%) sepia(0%) saturate(0%) hue-rotate(0deg)';
          }}>
            <img src="/assets/socials/facebook.svg" alt="Facebook" style={{ width: '32px', height: '32px', filter: 'brightness(0) saturate(100%) invert(46%) sepia(0%) saturate(0%) hue-rotate(0deg)', transition: 'all 0.2s ease' }} />
          </button>
          <button style={{
            background: 'none',
            border: 'none',
            padding: '8px',
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#666',
            transition: 'all 0.2s ease',
          }} onMouseEnter={(e) => {
            e.target.style.transform = 'scale(1.1)';
            const img = e.currentTarget.querySelector('img');
            if (img) img.style.filter = 'brightness(0) saturate(100%)';
          }} onMouseLeave={(e) => {
            e.target.style.transform = 'scale(1)';
            const img = e.currentTarget.querySelector('img');
            if (img) img.style.filter = 'brightness(0) saturate(100%) invert(46%) sepia(0%) saturate(0%) hue-rotate(0deg)';
          }}>
            <img src="/assets/socials/pinterest.svg" alt="Pinterest" style={{ width: '32px', height: '32px', filter: 'brightness(0) saturate(100%) invert(46%) sepia(0%) saturate(0%) hue-rotate(0deg)', transition: 'all 0.2s ease' }} />
          </button>
        </div>
      </div>
      )}
        </div>

      </div>

      {/* Fullscreen overlay for mobile */}
      {false && isFullscreen && fullscreenImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            zIndex: 20020,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            pointerEvents: 'auto'
          }}
          onClick={closeFullscreen}
        >
          {/* Image container - fills screen as much as possible */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100vw',
              height: '100vh',
              pointerEvents: 'auto',
              boxSizing: 'border-box',
              padding: 0
            }}
          >
            {isCloudinaryUrl(fullscreenImage) && (
              <img
                src={fullscreenImage}
                alt="Fullscreen gallery"
              style={{
                maxWidth: '100vw',
                maxHeight: '100vh',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                pointerEvents: 'auto',
                display: 'block'
              }}
              onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
          {/* Bottom controls */}
          <div 
            style={{ 
              position: 'absolute',
              bottom: 24,
              left: 0,
              right: 0,
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFullscreenPrev();
                }}
                disabled={fullscreenImageIndex === null || fullscreenImageIndex === 0}
                style={{
                  background: 'transparent',
                  color: '#888',
                  border: 'none',
                  borderRadius: '50%',
                  width: 56,
                  height: 56,
                  fontSize: '2.2rem',
                  fontWeight: 700,
                  cursor: (fullscreenImageIndex === null || fullscreenImageIndex === 0) ? 'not-allowed' : 'pointer',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  margin: 0,
                  transition: 'all 0.3s ease',
                  opacity: (fullscreenImageIndex === null || fullscreenImageIndex === 0) ? 0.3 : 1
                }}
                aria-label="Previous image"
                onMouseEnter={(e) => {
                  if (fullscreenImageIndex !== null && fullscreenImageIndex > 0) {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onTouchStart={(e) => {
                  if (fullscreenImageIndex !== null && fullscreenImageIndex > 0) {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onTouchEnd={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg 
                  width="32" 
                  height="32" 
                  viewBox="0 0 32 32" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg" 
                  style={{ display: 'block' }}
                >
                  <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleFullscreenNext();
                }}
                disabled={fullscreenImageIndex === null || fullscreenImageIndex >= allImagesList.length - 1}
                style={{
                  background: 'transparent',
                  color: '#888',
                  border: 'none',
                  borderRadius: '50%',
                  width: 56,
                  height: 56,
                  fontSize: '2.2rem',
                  fontWeight: 700,
                  cursor: (fullscreenImageIndex === null || fullscreenImageIndex >= allImagesList.length - 1) ? 'not-allowed' : 'pointer',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  margin: 0,
                  transition: 'all 0.3s ease',
                  opacity: (fullscreenImageIndex === null || fullscreenImageIndex >= allImagesList.length - 1) ? 0.3 : 1
                }}
                aria-label="Next image"
                onMouseEnter={(e) => {
                  if (fullscreenImageIndex !== null && fullscreenImageIndex < allImagesList.length - 1) {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onTouchStart={(e) => {
                  if (fullscreenImageIndex !== null && fullscreenImageIndex < allImagesList.length - 1) {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onTouchEnd={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                  <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Close button aligned to bottom right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeModal();
              }}
              style={{
                position: 'absolute',
                bottom: 24,
                right: 24,
                background: 'transparent',
                color: '#888',
                border: 'none',
                borderRadius: '50%',
                width: 56,
                height: 56,
                fontSize: '2rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                transition: 'all 0.3s ease'
              }}
              aria-label="Close viewer"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#888';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ✕
            </button>
            <div style={{ position: 'absolute', right: 24 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeFullscreen();
                }}
                style={{
                  background: 'transparent',
                  color: '#888',
                  border: 'none',
                  borderRadius: '50%',
                  width: 56,
                  height: 56,
                  fontSize: '2rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  margin: 0,
                  transition: 'all 0.3s ease'
                }}
                aria-label="Close viewer"
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onTouchStart={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onTouchEnd={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Close button bottom-right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFullscreen();
              }}
              style={{
                position: 'absolute',
                bottom: 24,
                right: 24,
                background: 'transparent',
                color: '#888',
                border: 'none',
                borderRadius: '50%',
                width: 56,
                height: 56,
                fontSize: '2rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                transition: 'all 0.3s ease'
              }}
              aria-label="Close viewer"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#888';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modal for enlarged image */}
      {false && selectedImage && (
        <>
          {/* Backdrop overlay - click outside to close */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.9)',
              zIndex: 20020,
              cursor: 'pointer'
            }}
            onClick={closeModal}
          />
          
          {/* Modal content - full screen with arrows */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 20021,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              pointerEvents: 'none',
              width: '100vw',
              height: '100vh',
              boxSizing: 'border-box'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image container - fills screen as much as possible */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100vw',
                height: '100vh',
                pointerEvents: 'auto',
                boxSizing: 'border-box',
                padding: 0
            }}
          >
          {isCloudinaryUrl(selectedImage) && (
            <img
              src={selectedImage}
              alt="Enlarged gallery"
            style={{
                  maxWidth: '100vw',
                  maxHeight: '100vh',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  pointerEvents: 'auto',
                  display: 'block'
                }}
                onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>

            {/* Navigation and close controls - bottom row */}
            <div 
              style={{ 
                position: 'absolute',
                bottom: 24,
                left: 0,
                right: 0,
                display: 'flex', 
                justifyContent: 'center', 
                gap: 24,
                alignItems: 'center',
                pointerEvents: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleModalPrev();
                }}
                disabled={selectedImageIndex === null || selectedImageIndex === 0}
                style={{
                  background: 'transparent',
                  color: '#888',
                  border: 'none',
                  borderRadius: '50%',
                  width: 56,
                  height: 56,
                  fontSize: '2.2rem',
                  fontWeight: 700,
                  cursor: selectedImageIndex === null || selectedImageIndex === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  margin: 0,
                  transition: 'all 0.3s ease',
                  opacity: (selectedImageIndex === null || selectedImageIndex === 0) ? 0.3 : 1
                }}
                aria-label="Previous image"
                onMouseEnter={(e) => {
                  if (selectedImageIndex !== null && selectedImageIndex > 0) {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg 
                  width="32" 
                  height="32" 
                  viewBox="0 0 32 32" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg" 
                  style={{ display: 'block' }}
                >
                  <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleModalNext();
                }}
                disabled={selectedImageIndex === null || selectedImageIndex >= allImagesList.length - 1}
                style={{
                  background: 'transparent',
                  color: '#888',
                  border: 'none',
                  borderRadius: '50%',
                  width: 56,
                  height: 56,
                  fontSize: '2.2rem',
                  fontWeight: 700,
                  cursor: (selectedImageIndex === null || selectedImageIndex >= allImagesList.length - 1) ? 'not-allowed' : 'pointer',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  margin: 0,
                  transition: 'all 0.3s ease',
                  opacity: (selectedImageIndex === null || selectedImageIndex >= allImagesList.length - 1) ? 0.3 : 1
                }}
                aria-label="Next image"
                onMouseEnter={(e) => {
                  if (selectedImageIndex !== null && selectedImageIndex < allImagesList.length - 1) {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                  <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeModal();
                }}
                style={{
                  background: 'transparent',
                  color: '#888',
                  border: 'none',
                  borderRadius: '50%',
                  width: 56,
                  height: 56,
                  fontSize: '2rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  margin: 0,
                  transition: 'all 0.3s ease'
                }}
                aria-label="Close viewer"
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#888';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </>
      )}

      {/* New unified lightbox (desktop modal + mobile fullscreen) */}
      {(isFullscreen && fullscreenImage) || selectedImage ? (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            zIndex: 20030,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            pointerEvents: 'auto'
          }}
          onClick={() => {
            if (isFullscreen) closeFullscreen();
            else closeModal();
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100vw',
              height: '100vh',
              pointerEvents: 'auto',
              boxSizing: 'border-box',
              padding: 0
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isCloudinaryUrl(isFullscreen ? fullscreenImage : selectedImage) && (
              <img
                src={isFullscreen ? fullscreenImage : selectedImage}
                alt="Gallery"
              style={{
                maxWidth: '100vw',
                maxHeight: 'calc(100vh - 140px)',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                pointerEvents: 'auto',
                display: 'block'
              }}
              />
            )}
          </div>

          <div 
            style={{ 
              width: '100%',
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              padding: '0 24px 24px 24px',
              boxSizing: 'border-box',
              pointerEvents: 'auto',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isFullscreen) handleFullscreenPrev();
                else handleModalPrev();
              }}
              disabled={
                isFullscreen
                  ? fullscreenImageIndex === null || fullscreenImageIndex === 0
                  : selectedImageIndex === null || selectedImageIndex === 0
              }
              style={{
                background: 'transparent',
                color: '#888',
                border: 'none',
                borderRadius: '50%',
                width: 56,
                height: 56,
                fontSize: '2.2rem',
                fontWeight: 700,
                cursor: (isFullscreen
                  ? fullscreenImageIndex === null || fullscreenImageIndex === 0
                  : selectedImageIndex === null || selectedImageIndex === 0) ? 'not-allowed' : 'pointer',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                transition: 'all 0.3s ease',
                opacity: (isFullscreen
                  ? fullscreenImageIndex === null || fullscreenImageIndex === 0
                  : selectedImageIndex === null || selectedImageIndex === 0) ? 0.3 : 1
              }}
              aria-label="Previous image"
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isFullscreen) handleFullscreenNext();
                else handleModalNext();
              }}
              disabled={
                isFullscreen
                  ? fullscreenImageIndex === null || fullscreenImageIndex >= allImagesList.length - 1
                  : selectedImageIndex === null || selectedImageIndex >= allImagesList.length - 1
              }
              style={{
                background: 'transparent',
                color: '#888',
                border: 'none',
                borderRadius: '50%',
                width: 56,
                height: 56,
                fontSize: '2.2rem',
                fontWeight: 700,
                cursor: (isFullscreen
                  ? fullscreenImageIndex === null || fullscreenImageIndex >= allImagesList.length - 1
                  : selectedImageIndex === null || selectedImageIndex >= allImagesList.length - 1) ? 'not-allowed' : 'pointer',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                transition: 'all 0.3s ease',
                opacity: (isFullscreen
                  ? fullscreenImageIndex === null || fullscreenImageIndex >= allImagesList.length - 1
                  : selectedImageIndex === null || selectedImageIndex >= allImagesList.length - 1) ? 0.3 : 1
              }}
              aria-label="Next image"
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isFullscreen) closeFullscreen();
                else closeModal();
              }}
              style={{
                position: 'absolute',
                right: 24,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                color: '#888',
                border: 'none',
                borderRadius: '50%',
                width: 44,
                height: 44,
                fontSize: '1.6rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                transition: 'all 0.3s ease'
              }}
              aria-label="Close viewer"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile Dropdown Menu */}
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
              // Navigate to home
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
              // Navigate to menu
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
                // Navigate to events
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
                // Navigate to about
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
                // Navigate to contact
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
                e.target.style.backgroundClip = 'text';
                e.target.style.border = '1px solid transparent';
              }}
            >
              CONTACT
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
} 