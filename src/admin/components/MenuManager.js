import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildCountryList, buildCountryMap, ISO_CODE_REGEX } from '../../shared/countryUtils';
import countryAliasMap from '../../shared/countryAliasMap.json';
import { useAuth } from '../contexts/AuthContext';
import RecipeBuilder from './recipes/RecipeBuilder';
import { extractSharedFieldsForInventory, extractMenuManagerOnlyFields, getSheetKeyFromCategory } from '../../utils/menuInventorySync';
import { isCloudinaryUrl } from '../../utils/cloudinaryUtils';

const getCodeFromAttributes = (pathEl) => {
  if (!pathEl) return null;
  const idAttr = pathEl.getAttribute('id');
  if (idAttr && ISO_CODE_REGEX.test(idAttr)) {
    return idAttr.toUpperCase();
  }
  const nameAttr = pathEl.getAttribute('name');
  if (nameAttr && countryAliasMap[nameAttr]) {
    return countryAliasMap[nameAttr];
  }
  const classAttr = pathEl.getAttribute('class');
  if (classAttr && countryAliasMap[classAttr]) {
    return countryAliasMap[classAttr];
  }
  return null;
};

// Map container that renders SVG ONCE outside React's render cycle
// The SVG is mounted directly to the DOM and never re-rendered
// Only highlights are updated via direct DOM manipulation
const MapContainer = ({ mapSvgContent, mapError, mapRef, svgRef, onMapReady }) => {
  const svgMountedRef = useRef(false);
  const statusRef = useRef(null);
  const onMapReadyRef = useRef(onMapReady);

  // Keep callback ref up to date without causing re-renders
  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  // Mount SVG directly to DOM ONCE - never re-render (optimized for speed)
  useEffect(() => {
    if (!mapRef.current || svgMountedRef.current) return;
    if (!mapSvgContent || mapError) return;

    const container = mapRef.current;
    
    // Clear any existing content
    container.innerHTML = '';

    try {
      // Parse SVG (minimal processing for speed)
      const parser = new DOMParser();
      const doc = parser.parseFromString(mapSvgContent, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      
      if (!svg) {
        container.innerHTML = '<div style="text-align: center; color: #b91c1c; font-family: Montserrat, sans-serif; padding: 1rem;">Invalid SVG content</div>';
        return;
      }

      // Configure SVG attributes (minimal setup)
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      if (!svg.getAttribute('viewBox')) {
        svg.setAttribute('viewBox', '0 0 2000 857');
      }
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
      svg.setAttribute('stroke', '#ececec');

      // Mount SVG first for immediate display
      container.appendChild(svg);
      svgMountedRef.current = true;
      
      // Set svgRef for direct access (used for map snapshot saving)
      if (svgRef) {
        svgRef.current = svg;
      }

      // Process paths asynchronously after mount (non-blocking)
      // This allows the map to appear immediately while paths are being configured
      requestAnimationFrame(() => {
        if (!mapRef.current) return;
        
        const allPaths = svg.querySelectorAll('path');
        const batchSize = 200; // Increased batch size for faster processing
        
        const processBatch = (startIndex) => {
          const endIndex = Math.min(startIndex + batchSize, allPaths.length);
          
          for (let i = startIndex; i < endIndex; i++) {
            const path = allPaths[i];
            path.setAttribute('stroke', '#d0d0d0');
            path.setAttribute('stroke-width', '0.4');
            
            const code = getCodeFromAttributes(path);
            if (code) {
              path.dataset.code = code;
              path.style.cursor = 'pointer';
              path.style.transition = 'fill 0.15s ease';
              path.style.setProperty('fill', '#d0d0d0', 'important');
              path.style.setProperty('stroke', '#d0d0d0', 'important');
            }
          }
          
          // Continue with next batch if needed
          if (endIndex < allPaths.length) {
            requestAnimationFrame(() => processBatch(endIndex));
          } else {
            // All paths processed, notify parent
            if (onMapReadyRef.current) {
              onMapReadyRef.current();
            }
          }
        };
        
        processBatch(0);
      });
    } catch (err) {
      console.warn('Failed to mount SVG:', err);
      container.innerHTML = '<div style="text-align: center; color: #b91c1c; font-family: Montserrat, sans-serif; padding: 1rem;">Failed to load map</div>';
    }
  }, [mapSvgContent, mapError, mapRef]);

  // Render status messages (these can change, but SVG never re-renders)
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Only update status div, never touch the SVG
    if (mapError) {
      if (statusRef.current) {
        statusRef.current.textContent = mapError;
        statusRef.current.style.display = 'block';
      } else {
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = 'text-align: center; color: #b91c1c; font-family: Montserrat, sans-serif; padding: 1rem;';
        statusDiv.textContent = mapError;
        statusRef.current = statusDiv;
        mapRef.current.insertBefore(statusDiv, mapRef.current.firstChild);
      }
    } else if (!mapSvgContent && !svgMountedRef.current) {
      if (statusRef.current) {
        statusRef.current.textContent = '';
        statusRef.current.style.color = '#6b7280';
        statusRef.current.style.display = 'block';
      } else {
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = 'text-align: center; color: #6b7280; font-family: Montserrat, sans-serif; padding: 1rem;';
        statusDiv.textContent = '';
        statusRef.current = statusDiv;
        if (mapRef.current) {
          mapRef.current.appendChild(statusDiv);
        }
      }
    } else if (statusRef.current && svgMountedRef.current) {
      statusRef.current.style.display = 'none';
    }
  }, [mapError, mapSvgContent, mapRef]);

  // This component renders ONLY the container div - the SVG is managed entirely via refs and DOM manipulation
  // React will re-render this component, but the SVG inside is never touched by React
  return (
    <div
      ref={mapRef}
      style={{ width: '100%', minHeight: '260px', borderRadius: '8px', paddingTop: 0, paddingRight: '40px', paddingBottom: 0, paddingLeft: 0, background: 'transparent', position: 'relative', marginLeft: '-60px' }}
    />
  );
};

// Wrap in memo to prevent re-renders when parent re-renders
// The component itself can re-render, but the SVG inside is protected by svgMountedRef
const MemoizedMapContainer = memo(MapContainer, () => {
  // Always return true - props are "equal" so React won't re-render
  // The SVG is protected by the svgMountedRef check inside
  return true;
});

MemoizedMapContainer.displayName = 'MapContainer';

/**
 * Hook to measure container size (based on menugallery2.js useContainerSize)
 */
function useContainerSize(containerRef) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        updateSize();
      });
      observer.observe(node);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
  }, [containerRef]);

  return size;
}

/**
 * Video background component for viewer (based on menugallery2.js VideoBackground)
 */
function VideoBackground({ videoSrc, videoRef, onLoadedData, onError, API_BASE_URL, currentCocktail, videoPreviewUrl }) {
  if (!isCloudinaryUrl(videoSrc)) {
    return null;
  }

  return (
    <video
      key={videoSrc}
      ref={videoRef}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      crossOrigin="anonymous"
      onError={onError}
      onLoadedData={onLoadedData}
      onLoadedMetadata={() => {
        if (videoRef?.current) {
          const video = videoRef.current;
        }
      }}
      onCanPlay={() => {
        if (videoRef?.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'center',
        pointerEvents: 'none',
        zIndex: 0, // Video should be at the base layer
      }}
    >
      <source src={videoSrc} type="video/mp4" />
    </video>
  );
}

const MenuManager = () => {
  const { apiCall, isAuthenticated, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002';
  const [cocktails, setCocktails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('cocktails');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingCocktail, setEditingCocktail] = useState(null);
  const [newCocktail, setNewCocktail] = useState({
    name: '',
    concept: '',
    ingredients: '',
    globalIngredients: '',
    // garnish comes from RecipeBuilder (recipe.metadata.garnish), not from cocktail
    category: 'cocktails',
    page: 'cocktails',
    videoFile: '',
    order: 0,
    regions: []
  });
  const [videoUpload, setVideoUpload] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [processingStatus, setProcessingStatus] = useState(null); // { active, stage, progress, total, message, error } for current item
  const processingPollIntervalRef = useRef(null);
  const [videoOptionsModal, setVideoOptionsModal] = useState({
    show: false,
    file: null,
    itemNumber: null
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const viewerContainerRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const viewerSize = useContainerSize(viewerContainerRef);
  const [countries, setCountries] = useState([]);
  const [countryQuery, setCountryQuery] = useState('');
  const mapRef = useRef(null);
  const svgRef = useRef(null); // Direct ref to the SVG element
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapSvgContent, setMapSvgContent] = useState('');
  const [mapError, setMapError] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const fetchInProgressRef = useRef(false);
  const savedCocktailIdRef = useRef(null);
  const savedCategoryRef = useRef(null);
  const [recipe, setRecipe] = useState(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);
  
  // Handle URL parameters to navigate to specific item
  useEffect(() => {
    const urlCategory = searchParams.get('category');
    const urlItemNumber = searchParams.get('itemNumber');
    const urlItemId = searchParams.get('itemId'); // Legacy support
    
    if (urlCategory && cocktails.length > 0) {
      const categoryKey = normalizeCategoryKey(urlCategory);
      setSelectedCategory(categoryKey);
      
      // Find item by itemNumber (preferred) or itemId/name (fallback)
      const categoryFiltered = cocktails.filter(c => {
        const cat = normalizeCategoryKey(c.category);
        return cat === categoryKey;
      });
      
      let targetIndex = -1;
      if (urlItemNumber && Number.isFinite(Number(urlItemNumber))) {
        // Find by itemNumber (most reliable)
        targetIndex = categoryFiltered.findIndex(c => 
          c.itemNumber === Number(urlItemNumber)
        );
      } else if (urlItemId) {
        // Fallback: find by itemId or name (legacy support)
        targetIndex = categoryFiltered.findIndex(c => 
          c.itemId === urlItemId || 
          c.name?.toLowerCase() === decodeURIComponent(urlItemId).toLowerCase()
        );
      }
      
      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex);
        // Clear URL params after navigation
        setSearchParams({});
      }
    }
  }, [cocktails, searchParams, setSearchParams]);

  // Update currentIndex to show saved cocktail after list refreshes
  useEffect(() => {
    if (savedCocktailIdRef.current && cocktails.length > 0) {
      const categoryKey = savedCategoryRef.current || selectedCategory;
      const categoryFiltered = cocktails.filter(c => {
        const cat = normalizeCategoryKey(c.category);
        return cat === categoryKey;
      });
      const savedIndex = categoryFiltered.findIndex(c => 
        (c._id === savedCocktailIdRef.current) || (c.itemId === savedCocktailIdRef.current)
      );
      if (savedIndex !== -1) {
        setCurrentIndex(savedIndex);
        savedCocktailIdRef.current = null; // Reset after finding
        savedCategoryRef.current = null;
      }
    }
  }, [cocktails, selectedCategory]);

  // Menu categories configuration - ordered as specified: COCKTAILS, MOCKTAILS, BEER, WINE, SPIRITS, PRE-MIX
  const menuCategories = [
    { key: 'cocktails', label: 'COCKTAILS', icon: 'classics' },
    { key: 'mocktails', label: 'MOCKTAILS', icon: 'originals' },
    { key: 'beer', label: 'BEER', icon: 'spirits' },
    { key: 'wine', label: 'WINE', icon: 'spirits' },
    { key: 'spirits', label: 'SPIRITS', icon: 'spirits' },
    { key: 'premix', label: 'PRE-MIX', icon: 'spirits' },
    { key: 'archived', label: 'ARCHIVED', icon: 'originals', archived: true }
  ];

  const normalizeCategoryKey = (value = '') => {
    const key = String(value).toLowerCase();
    // Map old category names to new ones for backward compatibility
    const categoryMap = {
      'classics': 'cocktails',
      'originals': 'mocktails'
    };
    return categoryMap[key] || key;
  };


  // Fetch all cocktails - use ref to prevent race conditions with rapid refreshes
  const fetchCocktails = useCallback(async () => {
    // Prevent multiple simultaneous fetches (race condition protection)
    if (fetchInProgressRef.current) {
      return;
    }
    
    try {
      fetchInProgressRef.current = true;
      setLoading(true);
      // Preserve current editingCocktail ID to maintain selection after fetch
      const currentEditingId = editingCocktail?._id;
      
      // Use menu-manager endpoint which merges Inventory (source of truth) with Cocktail data
      const data = await apiCall('/menu-items/menu-manager?includeArchived=true');
      const normalized = Array.isArray(data)
        ? data.map((cocktail) => ({
            ...cocktail,
            category: normalizeCategoryKey(cocktail.category || cocktail.section || 'cocktails')
          }))
        : [];

      normalized.sort((a, b) => {
        if (normalizeCategoryKey(a.category) === normalizeCategoryKey(b.category)) {
          return (a.order || 0) - (b.order || 0);
        }
        return normalizeCategoryKey(a.category).localeCompare(normalizeCategoryKey(b.category));
      });

      setCocktails(normalized);
      
      // Debug: Log Cloudinary URLs for all cocktails
      console.log('[MenuManager] Fetched cocktails with Cloudinary URLs:');
      normalized.forEach(c => {
        if (c.cloudinaryVideoUrl || c.cloudinaryIconUrl) {
          console.log(`  Item ${c.itemNumber} (${c.name}):`, {
            cloudinaryVideoUrl: c.cloudinaryVideoUrl,
            cloudinaryIconUrl: c.cloudinaryIconUrl
          });
        }
      });
      
      return normalized;
      
      // If we had an editingCocktail, try to preserve it by finding its index
      if (currentEditingId && !String(currentEditingId).startsWith('new-')) {
        const filtered = normalized.filter(cocktail => {
          const key = normalizeCategoryKey(cocktail.category);
          if (selectedCategory === 'archived') {
            return cocktail.status === 'archived';
          }
          const isActive = cocktail.status !== 'archived' && (cocktail.isActive !== false);
          const categoryMatches = key === normalizeCategoryKey(selectedCategory);
          return isActive && categoryMatches;
        });
        const preservedIndex = filtered.findIndex(c => c._id === currentEditingId);
        if (preservedIndex >= 0) {
          setCurrentIndex(preservedIndex);
        } else {
          setCurrentIndex(0);
        }
      } else {
        setCurrentIndex(0);
      }
    } catch (error) {
      console.error('Error fetching cocktails:', error);
      setCocktails([]);
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiCall, editingCocktail?._id, selectedCategory]);

  // Filter cocktails by selected category / status
  const filteredCocktails = cocktails.filter(cocktail => {
    const key = normalizeCategoryKey(cocktail.category);
    if (selectedCategory === 'archived') {
      return cocktail.status === 'archived';
    }
    // Include cocktails that are active (status is 'active' or undefined/null, and isActive is true or undefined)
    const isActive = cocktail.status !== 'archived' && (cocktail.isActive !== false);
    const categoryMatches = key === normalizeCategoryKey(selectedCategory);
    return isActive && categoryMatches;
  });

  const archivedGroups = useMemo(() => {
    if (selectedCategory !== 'archived') return {};
    return filteredCocktails.reduce((acc, cocktail) => {
      const key = normalizeCategoryKey(cocktail.category) || 'uncategorized';
      if (!acc[key]) acc[key] = [];
      acc[key].push(cocktail);
      return acc;
    }, {});
  }, [filteredCocktails, selectedCategory]);
  
  // Get the current cocktail from the filtered list
  // When editing, use the editing cocktail data; otherwise use the current cocktail from the list
  const editingCocktailId = editingCocktail?._id || null;
  const isNewDraft = Boolean(editingCocktailId && String(editingCocktailId).startsWith('new-'));
  const currentCocktail = editingCocktail || (filteredCocktails[currentIndex] || filteredCocktails[0]) || {};
  const formValues = editingCocktail || {};
  const canArchive = Boolean(editingCocktail && !isNewDraft && editingCocktail.status !== 'archived');
  const canRestore = Boolean(editingCocktail && editingCocktail.status === 'archived');

  // Memoize selected regions to prevent unnecessary re-renders
  const selectedRegions = useMemo(() => {
    if (editingCocktail && Array.isArray(editingCocktail.regions)) return editingCocktail.regions;
    if (currentCocktail && Array.isArray(currentCocktail.regions)) return currentCocktail.regions;
    return [];
  }, [editingCocktail?.regions, currentCocktail?.regions]);

  const getSelectedRegions = useCallback(() => {
    return selectedRegions;
  }, [selectedRegions]);

  const setSelectedRegions = useCallback((next) => {
    setEditingCocktail(prev => (prev ? { ...prev, regions: next } : prev));
  }, []);

  const toggleRegion = useCallback((code) => {
    if (!code) return;
    const upper = String(code).toUpperCase();
    const current = selectedRegions;
    const exists = current.includes(upper);
    const next = exists ? current.filter(c => c !== upper) : [...current, upper];
    setSelectedRegions(next);
  }, [selectedRegions, setSelectedRegions]);

  const handleCountrySelectChange = useCallback((event) => {
    const options = Array.from(event.target.selectedOptions || []);
    const next = options
      .map(option => String(option.value || '').toUpperCase())
      .filter(Boolean);
    setSelectedRegions(next);
  }, [setSelectedRegions]);

  useEffect(() => {
    // Don't overwrite new drafts - let user continue editing
    if (editingCocktailId && String(editingCocktailId).startsWith('new-')) {
      // Update category if it changed, but keep the draft
      setEditingCocktail(prev => {
        if (prev && prev.category !== selectedCategory && selectedCategory !== 'archived') {
          return { ...prev, category: selectedCategory };
        }
        return prev;
      });
      return;
    }
    const fallback = filteredCocktails[currentIndex] || filteredCocktails[0];
    if (!fallback) {
      // Only clear editingCocktail if we're not in the middle of creating a new item
      // This allows "New Item" to work even when category is empty
      if (!editingCocktailId || !String(editingCocktailId).startsWith('new-')) {
        setEditingCocktail(null);
      }
      return;
    }
    // Only update if:
    // 1. We're not editing a new draft
    // 2. editingCocktail is null OR doesn't match the fallback
    // 3. The fallback actually exists
    // This prevents overwriting a valid editingCocktail that's already correctly set
    const shouldUpdate = (!editingCocktailId || editingCocktailId !== fallback._id) && 
                         (!editingCocktail || editingCocktail._id !== fallback._id);
    
    if (shouldUpdate) {
      // Don't overwrite if we're creating a new item
      if (!editingCocktailId || !String(editingCocktailId).startsWith('new-')) {
        // Only update if we don't already have this cocktail set
        // This prevents the "collapse" issue where correct highlights get overwritten
        setEditingCocktail(prev => {
          // If prev exists and matches fallback, don't update (prevents unnecessary re-renders)
          if (prev && prev._id === fallback._id) {
            return prev;
          }
          return { ...fallback };
        });
        setVideoUpload(null);
        setVideoPreviewUrl(prev => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return '';
        });
      }
    }
  }, [filteredCocktails, currentIndex, editingCocktailId, selectedCategory, editingCocktail]);

  // Fetch countries list for selection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await apiCall('/countries');
        if (!cancelled) {
          if (Array.isArray(list) && list.length > 0) {
            setCountries(buildCountryList(list));
          } else {
            // Fallback: parse from client SVG if server returns empty
            try {
              const svgUrl = `${process.env.PUBLIC_URL || ''}/assets/images/worldmap.svg`;
              const res = await fetch(svgUrl);
              const svgText = await res.text();
              const re = /<path[^>]*\sid="([A-Za-z0-9_-]+)"[^>]*\sname="([^"]+)"[^>]*>/g;
              const arr = [];
              let m;
              while ((m = re.exec(svgText)) !== null) {
                arr.push({ code: String(m[1]).toUpperCase(), name: m[2], svgId: String(m[1]).toUpperCase() });
              }
              setCountries(buildCountryList(arr));
            } catch (e2) {
              console.warn('Countries SVG fallback failed', e2);
              setCountries(buildCountryList());
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load countries', e);
        if (!cancelled) {
          // Fallback: parse from client SVG when API fails
          try {
            const svgUrl = `${process.env.PUBLIC_URL || ''}/assets/images/worldmap.svg`;
            const res = await fetch(svgUrl);
            const svgText = await res.text();
            const re = /<path[^>]*\sid="([A-Za-z0-9_-]+)"[^>]*\sname="([^"]+)"[^>]*>/g;
            const arr = [];
            let m;
            while ((m = re.exec(svgText)) !== null) {
              arr.push({ code: String(m[1]).toUpperCase(), name: m[2], svgId: String(m[1]).toUpperCase() });
            }
            setCountries(buildCountryList(arr));
          } catch (e2) {
            console.warn('Countries SVG fallback failed', e2);
            setCountries(buildCountryList());
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [apiCall]);

  const slugify = (value) => {
    if (!value) return 'map';
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'map';
  };

  // Save map as PNG directly to server (mandatory for all non-premix categories)
  const saveMapSnapshot = async (itemNumber) => {
    if (!itemNumber || !Number.isFinite(itemNumber)) {
      console.warn('⚠️ Cannot save map snapshot: no itemNumber provided');
      return;
    }

    // Use direct SVG ref - the actual SVG element (no searching)
    let svg = svgRef.current;
    let attempts = 0;
    const maxAttempts = 20;
    
    // Wait for SVG to be ready
    while (!svg && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      svg = svgRef.current;
      attempts++;
    }
    
    if (!svg) {
      throw new Error('Map SVG not ready. Please ensure the map is fully loaded.');
    }

    // Ensure highlights are up to date before saving
    // selectedRegions comes from editingCocktail.regions - this is the current state
    refreshMapHighlights();
    
    // Wait a moment for DOM updates to apply
    await new Promise(resolve => setTimeout(resolve, 50));

    // Clone the SVG with all current styles
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    
    // Remove white background rectangles
    const rects = clone.querySelectorAll('rect');
    rects.forEach(rect => {
      const fill = rect.getAttribute('fill') || rect.style.fill || '';
      const fillLower = fill.toLowerCase();
      if (fillLower === '#ffffff' || fillLower === '#fff' || fillLower === 'white' || 
          fillLower === '#f5f5f5' || fillLower === '#fafafa' || fillLower === 'rgb(255, 255, 255)') {
        rect.remove();
      }
    });
    
    clone.style.backgroundColor = 'transparent';
    clone.style.background = 'transparent';
    
    if (!clone.getAttribute('viewBox')) {
      clone.setAttribute('viewBox', '0 0 2000 857');
    }
    clone.setAttribute('width', '1200');
    clone.setAttribute('height', '600');
    
    // Serialize SVG
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 600;
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('Failed to render map snapshot'));
        }, 'image/png', 1.0);
      });

      // Send PNG directly to server
      const formData = new FormData();
      formData.append('map', blob, `${itemNumber}.png`);
      
      const response = await apiCall(`/menu-items/map/${itemNumber}`, {
        method: 'POST',
        body: formData
      });
      
      if (!response || !response.success) {
        throw new Error(response?.message || 'Server did not confirm map save');
      }
      
    } catch (error) {
      console.error('Error saving map snapshot:', error);
      throw error;
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  const buildCocktailFormData = async (data, options = {}) => {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('concept', data.concept || '');
    formData.append('ingredients', data.ingredients || '');
    formData.append('globalIngredients', data.globalIngredients || '');
    // Garnish is NOT saved to cocktail model - it comes from RecipeBuilder (recipe.metadata.garnish)
    formData.append('category', normalizeCategoryKey(data.category || selectedCategory));
    formData.append('regions', JSON.stringify(data.regions || selectedRegions || []));
    formData.append('order', typeof data.order === 'number' ? data.order : 0);
    if (typeof data.featured !== 'undefined') {
      formData.append('featured', data.featured ? 'true' : 'false');
    }
    // Append itemId and itemNumber for video filename
    if (data.itemId) {
      formData.append('itemId', data.itemId);
    }
    if (data.itemNumber && Number.isFinite(data.itemNumber)) {
      formData.append('itemNumber', String(data.itemNumber));
    }

    if (options.videoFile instanceof File) {
      formData.append('video', options.videoFile);
    } else {
    }

    return formData;
  };

  const handleVideoSelection = (file) => {
    if (!file) return;
    
    // Get itemNumber for processing
    const itemNumber = editingCocktail?.itemNumber || currentCocktail?.itemNumber;
    if (!itemNumber) {
      alert('Please save the item first to get an item number.');
      return;
    }
    
    // Show video options modal
    setVideoOptionsModal({
      show: true,
      file: file,
      itemNumber: itemNumber
    });
  };
  
  const handleVideoOption = async (option) => {
    const { file, itemNumber } = videoOptionsModal;
    
    console.log('[MenuManager] handleVideoOption called', { option, file: file?.name, itemNumber });
    
    // Close modal
    setVideoOptionsModal({ show: false, file: null, itemNumber: null });
    
    if (!file || !itemNumber) {
      console.warn('[MenuManager] handleVideoOption: Missing file or itemNumber', { file: !!file, itemNumber });
      return;
    }
    
    switch (option) {
      case 'process':
        await handleProcessVideo(file, itemNumber);
        break;
      case 'upload':
        handleUploadVideo(file);
        break;
      case 'upload-icon':
        await handleUploadIcon(file, itemNumber);
        break;
      case 'cancel':
        // Do nothing, just close
        break;
      default:
        break;
    }
  };
  
  const handleProcessVideo = async (file, itemNumber) => {
    console.log('[MenuManager] handleProcessVideo called', { file: file?.name, itemNumber, API_BASE_URL });
    
    try {
      // Set preview
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      setVideoPreviewUrl(previewUrl);
      setVideoUpload(file);
      if (videoRef.current) {
        videoRef.current.src = previewUrl;
      }
      
      // Initialize processing status
      console.log('[MenuManager] Setting processing status to active for item', itemNumber);
      setProcessingStatus({
        active: true,
        stage: 'uploading',
        progress: 0,
        total: 100,
        message: 'Uploading video...',
        error: null,
        itemNumber: itemNumber // Include itemNumber so overlay can match
      });
      
      // Step 1: Upload to temp_files
      const formData = new FormData();
      formData.append('video', file);
      
      console.log('[MenuManager] Uploading video to:', `${API_BASE_URL}/api/video-processing/upload-base/${itemNumber}`);
      const uploadResponse = await fetch(`${API_BASE_URL}/api/video-processing/upload-base/${itemNumber}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      console.log('[MenuManager] Upload response:', { ok: uploadResponse.ok, status: uploadResponse.status, statusText: uploadResponse.statusText });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('[MenuManager] Upload failed:', errorText);
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }
      
      console.log('[MenuManager] Upload successful, starting processing...');
      
      // Step 2: Start processing
      const processResponse = await fetch(`${API_BASE_URL}/api/video-processing/process/${itemNumber}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log('[MenuManager] Process response:', { ok: processResponse.ok, status: processResponse.status, statusText: processResponse.statusText });
      
      if (!processResponse.ok) {
        const errorText = await processResponse.text();
        console.error('[MenuManager] Process failed:', errorText);
        throw new Error(`Failed to start processing: ${processResponse.status} ${processResponse.statusText}`);
      }
      
      console.log('[MenuManager] Processing started, beginning status polling...');
      
      // Start polling for status
      startProcessingPoll(itemNumber);
      
    } catch (error) {
      console.error('[MenuManager] Process video error:', error);
      setProcessingStatus(prev => ({
        ...prev,
        active: false,
        error: error.message,
        message: `Error: ${error.message}`
      }));
    }
  };
  
  const handleUploadVideo = (file) => {
    // Current upload behavior (as-is)
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(previewUrl);
    setVideoUpload(file);
    if (videoRef.current) {
      videoRef.current.src = previewUrl;
    }
    setEditingCocktail(prev => {
      if (prev) {
        return { ...prev, videoFile: file.name };
      }
      if (currentCocktail && currentCocktail._id) {
        return { ...currentCocktail, videoFile: file.name };
      }
      return {
        name: '',
        concept: '',
        ingredients: '',
        globalIngredients: '',
        garnish: '',
        category: selectedCategory,
        videoFile: file.name,
        regions: selectedRegions
      };
    });
  };
  
  const handleUploadIcon = async (file, itemNumber) => {
    try {
      // Set preview
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      setVideoPreviewUrl(previewUrl);
      
      // Initialize processing status
      setProcessingStatus({
        active: true,
        stage: 'creating-icon',
        progress: 0,
        total: 100,
        message: 'Creating icon version...',
        error: null,
        itemNumber: itemNumber // Include itemNumber so overlay can match
      });
      
      // Upload and process icon
      const formData = new FormData();
      formData.append('video', file);
      
      const response = await fetch(`${API_BASE_URL}/api/video-processing/process-icon/${itemNumber}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to start icon processing');
      }
      
      // Start polling for status
      startProcessingPoll(itemNumber);
      
    } catch (error) {
      console.error('Upload icon error:', error);
      setProcessingStatus(prev => ({
        ...prev,
        active: false,
        error: error.message,
        message: `Error: ${error.message}`
      }));
    }
  };
  
  const startProcessingPoll = (itemNumber) => {
    console.log('[MenuManager] startProcessingPoll called for item', itemNumber);
    
    // Clear any existing interval
    if (processingPollIntervalRef.current) {
      clearInterval(processingPollIntervalRef.current);
    }
    
    // Poll every 2 seconds
    processingPollIntervalRef.current = setInterval(async () => {
      try {
        const statusUrl = `${API_BASE_URL}/api/video-processing/status/${itemNumber}`;
        console.log('[MenuManager] Polling status from:', statusUrl);
        
        const response = await fetch(statusUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (response.ok) {
          const status = await response.json();
          console.log('[MenuManager] Status received:', status);
          setProcessingStatus(status);
          
          // Stop polling if not active
          if (!status.active) {
            console.log('[MenuManager] Processing no longer active, stopping poll');
            clearInterval(processingPollIntervalRef.current);
            processingPollIntervalRef.current = null;
            
            // Refresh cocktails list to get updated video
            if (status.stage === 'complete' && !status.error) {
              console.log('[MenuManager] Processing complete! Refreshing cocktails list...');
              fetchCocktails().then((cocktails) => {
                console.log('[MenuManager] Cocktails refreshed:', cocktails?.length, 'items');
                // Find the item that was just processed
                const processedItem = cocktails?.find(c => c.itemNumber === itemNumber);
                if (processedItem) {
                  console.log('[MenuManager] Processed item data:', {
                    itemNumber: processedItem.itemNumber,
                    name: processedItem.name,
                    cloudinaryVideoUrl: processedItem.cloudinaryVideoUrl,
                    cloudinaryIconUrl: processedItem.cloudinaryIconUrl,
                    videoUrl: processedItem.videoUrl
                  });
                  
                  // Update editingCocktail if it matches the processed item
                  setEditingCocktail(prev => {
                    if (prev && (prev.itemNumber === itemNumber || prev._id === processedItem._id)) {
                      console.log('[MenuManager] Updating editingCocktail with new Cloudinary URL:', processedItem.cloudinaryVideoUrl);
                      return {
                        ...prev,
                        cloudinaryVideoUrl: processedItem.cloudinaryVideoUrl,
                        cloudinaryIconUrl: processedItem.cloudinaryIconUrl,
                        cloudinaryVideoPublicId: processedItem.cloudinaryVideoPublicId,
                        cloudinaryIconPublicId: processedItem.cloudinaryIconPublicId,
                        videoUrl: processedItem.cloudinaryVideoUrl || prev.videoUrl // Also update videoUrl to Cloudinary URL
                      };
                    }
                    return prev;
                  });
                  
                  // Also update the cocktail in the cocktails state array if it matches
                  // This ensures currentCocktail (when not editing) gets the updated URL
                  setCocktails(prevCocktails => {
                    const updated = prevCocktails.map(c => {
                      if (c.itemNumber === itemNumber || c._id === processedItem._id) {
                        console.log('[MenuManager] Updating cocktail in state array with Cloudinary URL:', processedItem.cloudinaryVideoUrl);
                        return {
                          ...c,
                          cloudinaryVideoUrl: processedItem.cloudinaryVideoUrl,
                          cloudinaryIconUrl: processedItem.cloudinaryIconUrl,
                          cloudinaryVideoPublicId: processedItem.cloudinaryVideoPublicId,
                          cloudinaryIconPublicId: processedItem.cloudinaryIconPublicId,
                          videoUrl: processedItem.cloudinaryVideoUrl || c.videoUrl // Also update videoUrl to Cloudinary URL
                        };
                      }
                      return c;
                    });
                    return updated;
                  });
                  
                  // Also clear videoPreviewUrl since we now have the Cloudinary URL
                  if (videoPreviewUrl) {
                    URL.revokeObjectURL(videoPreviewUrl);
                    setVideoPreviewUrl('');
                  }
                } else {
                  console.warn('[MenuManager] Processed item not found in refreshed list:', itemNumber);
                }
              });
            }
          }
        } else {
          console.warn('[MenuManager] Status poll failed:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 2000);
  };
  
  // Stop polling when component unmounts or item changes
  useEffect(() => {
    return () => {
      if (processingPollIntervalRef.current) {
        clearInterval(processingPollIntervalRef.current);
      }
    };
  }, []);
  
  // Check if current item is processing and restore status if needed
  useEffect(() => {
    const currentItemNumber = editingCocktail?.itemNumber || currentCocktail?.itemNumber;
    
    if (!currentItemNumber) {
      // No item selected - stop polling but keep status (user might navigate back)
      if (processingPollIntervalRef.current) {
        clearInterval(processingPollIntervalRef.current);
        processingPollIntervalRef.current = null;
      }
      return;
    }
    
    // Check if we have status for this item
    const hasStatusForItem = processingStatus && processingStatus.itemNumber === currentItemNumber;
    
    // If we have status for a different item, clear it first
    if (processingStatus && processingStatus.itemNumber !== currentItemNumber) {
      // Stop polling for the old item
      if (processingPollIntervalRef.current) {
        clearInterval(processingPollIntervalRef.current);
        processingPollIntervalRef.current = null;
      }
      // Clear the old status
      setProcessingStatus(null);
    }
    
    // If we don't have status for this item, check server
    if (!hasStatusForItem) {
      // Check if this item is processing on the server
      const checkStatus = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/video-processing/status/${currentItemNumber}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (response.ok) {
            const status = await response.json();
            if (status.active) {
              // Item is still processing - restore status and start polling
              setProcessingStatus(status);
              if (!processingPollIntervalRef.current) {
                startProcessingPoll(currentItemNumber);
              }
            }
            // If not active, don't set status (it will remain null)
          }
        } catch (error) {
          console.error('Error checking processing status:', error);
        }
      };
      
      checkStatus();
    } else if (processingStatus.active) {
      // We have status for this item and it's active - ensure polling is running
      if (!processingPollIntervalRef.current) {
        startProcessingPoll(currentItemNumber);
      }
    } else {
      // Status exists but not active - stop polling
      if (processingPollIntervalRef.current) {
        clearInterval(processingPollIntervalRef.current);
        processingPollIntervalRef.current = null;
      }
    }
  }, [editingCocktail?.itemNumber, currentCocktail?.itemNumber]);
  
  // Also check processingStatus changes to ensure polling is active
  useEffect(() => {
    const currentItemNumber = editingCocktail?.itemNumber || currentCocktail?.itemNumber;
    if (processingStatus && processingStatus.active && processingStatus.itemNumber === currentItemNumber) {
      if (!processingPollIntervalRef.current) {
        startProcessingPoll(currentItemNumber);
      }
    } else if (processingStatus && (!processingStatus.active || processingStatus.itemNumber !== currentItemNumber)) {
      // Stop polling if status is not active or for different item
      if (processingPollIntervalRef.current) {
        clearInterval(processingPollIntervalRef.current);
        processingPollIntervalRef.current = null;
      }
    }
  }, [processingStatus]);

  const renderTableRow = (cocktail, rowIndex) => {
    const resolvedIndex = typeof rowIndex === 'number'
      ? rowIndex
      : filteredCocktails.findIndex(item => item._id === cocktail._id);
    const isActiveRow = (editingCocktailId && editingCocktailId === cocktail._id) || resolvedIndex === currentIndex;

    return (
      <tr
        key={`${cocktail._id}-${resolvedIndex}`}
        onClick={() => resolvedIndex >= 0 && setCurrentIndex(resolvedIndex)}
        className={`border-b border-gray-100 hover:bg-gray-50 ${
          isActiveRow ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
        }`}
        style={{ cursor: 'pointer' }}
      >
        <td className="py-3 px-4">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {menuCategories.find(c => normalizeCategoryKey(c.key) === normalizeCategoryKey(cocktail.category))?.label || cocktail.category}
          </span>
        </td>
        <td className="py-3 px-4">
          <div>
            <div className="font-medium text-gray-900">{cocktail.name}</div>
            <div className="text-sm text-gray-500">
              {cocktail.concept ? cocktail.concept.substring(0, 60) + '...' : 'No concept'}
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-gray-600">
          {cocktail.itemNumber || '—'}
        </td>
        <td className="py-3 px-4">
          <div className="flex gap-2">
            <button
              onClick={() => handleDelete(cocktail._id)}
              className="btn btn-sm btn-danger"
            >
              Delete
            </button>
            {cocktail.status === 'archived' ? (
              <button
                onClick={() => handleRestore(cocktail)}
                className="btn btn-sm"
                style={{ backgroundColor: '#10b981', color: '#fff' }}
              >
                Restore
              </button>
            ) : (
              <button
                onClick={() => handleArchive(cocktail)}
                className="btn btn-sm"
                style={{ backgroundColor: '#fbbf24', color: '#111' }}
              >
                Archive
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const filteredCountries = countries.filter(c => {
    if (!countryQuery) return true;
    const q = countryQuery.toLowerCase();
    return (c.name && c.name.toLowerCase().includes(q)) || (c.code && c.code.toLowerCase().includes(q));
  });

  const countryLookup = useMemo(() => buildCountryMap(countries), [countries]);
  const selectedCountryDetails = useMemo(() => {
    return selectedRegions
      .map((code) => {
        const upper = String(code || '').toUpperCase();
        if (!upper) return null;
        const entry = countryLookup[upper];
        return {
          code: upper,
          name: entry?.name || upper
        };
      })
      .filter(Boolean);
  }, [selectedRegions, countryLookup]);

  // Load SVG map asset once - optimized for speed
  useEffect(() => {
    let cancelled = false;
    
    const loadSvg = async () => {
      try {
        const svgUrl = `${process.env.PUBLIC_URL || ''}/assets/images/worldmap.svg`;
        // Use default cache to allow browser caching for faster subsequent loads
        const res = await fetch(svgUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch SVG (${res.status})`);
        }
        const svgText = await res.text();
        if (!svgText || svgText.trim().length === 0) {
          throw new Error('SVG content is empty');
        }
        if (!cancelled) {
          setMapSvgContent(svgText);
          setMapError('');
          setMapLoaded(true);
        }
      } catch (err) {
        console.warn('Failed to load world map SVG', err);
        if (!cancelled) {
          setMapSvgContent('');
          setMapError('Map failed to load. Please refresh the page.');
          setMapLoaded(false);
        }
      }
    };
    
    loadSvg();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update highlights via direct DOM manipulation - never re-render SVG
  const refreshMapHighlights = useCallback(() => {
    if (!mapRef.current) return;
    const selected = new Set(selectedRegions);
    const paths = mapRef.current.querySelectorAll('[data-code]');
    paths.forEach(pathEl => {
      const code = pathEl.getAttribute('data-code');
      if (!code) return;
      const isSelected = selected.has(code);
      const fillColor = isSelected ? '#666666' : '#d0d0d0';
      pathEl.style.setProperty('fill', fillColor, 'important');
      pathEl.style.setProperty('stroke', fillColor, 'important');
      pathEl.style.setProperty('stroke-width', '0.4', 'important');
    });
  }, [selectedRegions]);

  // Set up click handlers once when map is ready
  const handleMapReady = useCallback(() => {
    if (!mapRef.current) return;

    const container = mapRef.current;
    const svg = container.querySelector('svg');
    if (!svg) return;

    // Wait for paths to be ready
    const setupInteractions = () => {
      const interactivePaths = container.querySelectorAll('[data-code]');
      if (interactivePaths.length === 0) {
        setTimeout(setupInteractions, 50);
        return;
      }

      const handlePathClick = (event) => {
        const code = event.target?.dataset?.code;
        if (code) {
          toggleRegion(code);
        }
      };

      // Attach click handlers to all interactive paths
      interactivePaths.forEach(pathEl => {
        // Remove any existing listener to avoid duplicates
        pathEl.removeEventListener('click', handlePathClick);
        pathEl.addEventListener('click', handlePathClick);
      });

      // Initial highlight refresh - reduced delay for faster display
      setTimeout(() => {
        refreshMapHighlights();
      }, 50);
    };

    setupInteractions();
  }, [toggleRegion, refreshMapHighlights]);

  // Update highlights when regions change or when editingCocktail changes (SVG never re-renders)
  useEffect(() => {
    if (mapLoaded && mapRef.current) {
      // Check if paths are ready before highlighting
      const paths = mapRef.current.querySelectorAll('[data-code]');
      if (paths.length > 0) {
        // Minimal delay - paths are already ready
        const timeoutId = setTimeout(() => {
          refreshMapHighlights();
        }, 10);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [refreshMapHighlights, mapLoaded, editingCocktail?.regions, editingCocktail?._id]);

  useEffect(() => {
    fetchCocktails();
  }, [fetchCocktails]);

  // Debug: Log filtered cocktails when they change
  useEffect(() => {
    const classicsCocktails = cocktails.filter(c => {
      const key = normalizeCategoryKey(c.category);
      return key === 'classics';
    });
  }, [filteredCocktails, selectedCategory, cocktails.length, cocktails]);

  // Video canvas drawing effect
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let animationFrameId;

    // Initialize canvas with default dimensions if needed
    if (!canvas.width || !canvas.height) {
      canvas.width = 640;
      canvas.height = 360;
    }

    // If there's no video file or preview, clear the canvas
    if (!currentCocktail.videoFile && !videoPreviewUrl) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Ensure video is playing
    const playVideo = async () => {
      if (video.paused && video.readyState >= 2) {
        try {
          await video.play();
        } catch (error) {
        }
      }
    };

    const draw = () => {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        // Update canvas dimensions if video dimensions changed
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, -40, canvas.width, canvas.height);
        
        // Chroma key effect
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const threshold = 100;
          const chromaR = 255, chromaG = 0, chromaB = 255;
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (Math.abs(r - chromaR) < threshold && Math.abs(g - chromaG) < threshold && Math.abs(b - chromaB) < threshold) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imageData, 0, 0);
        } catch (error) {
          // Handle cross-origin or other canvas errors gracefully
        }
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    playVideo();
    draw();
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [currentIndex, filteredCocktails, editingCocktail, currentCocktail.videoFile, videoPreviewUrl]);

  // Handle video source changes - ONLY use Cloudinary URLs, NO FALLBACK
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Determine video URL - ONLY Cloudinary URLs, no local paths
    let videoSrc = '';
    
    if (isCloudinaryUrl(videoPreviewUrl)) {
      videoSrc = videoPreviewUrl;
    } else if (isCloudinaryUrl(currentCocktail.cloudinaryVideoUrl)) {
      videoSrc = currentCocktail.cloudinaryVideoUrl;
    } else if (isCloudinaryUrl(currentCocktail.videoUrl)) {
      videoSrc = currentCocktail.videoUrl;
    }
    
    if (videoSrc && video.src !== videoSrc && !video.src.endsWith(videoSrc)) {
      video.src = videoSrc;
      video.load(); // Force reload
      video.play().catch(err => {
        // NO FALLBACK - Only Cloudinary URLs
        console.error('❌ [MenuManager] Video failed to load from Cloudinary:', err);
        console.error('   Video URL was:', videoSrc);
        // Hide video if it fails
        if (video) {
          video.style.display = 'none';
        }
      });
    } else if (!videoSrc) {
      video.src = '';
      video.style.display = 'none'; // Hide if no Cloudinary URL
    }
  }, [videoPreviewUrl, currentCocktail.videoUrl, currentCocktail.cloudinaryVideoUrl, currentCocktail.videoFile, currentCocktail.itemNumber, API_BASE_URL]);

  // Debug: Log when currentCocktail changes (especially Cloudinary URLs)
  useEffect(() => {
    console.log('[MenuManager] currentCocktail changed:', {
      itemNumber: currentCocktail?.itemNumber,
      name: currentCocktail?.name,
      cloudinaryVideoUrl: currentCocktail?.cloudinaryVideoUrl,
      videoUrl: currentCocktail?.videoUrl,
      isEditing: !!editingCocktail,
      editingItemNumber: editingCocktail?.itemNumber
    });
  }, [currentCocktail?.itemNumber, currentCocktail?.cloudinaryVideoUrl, currentCocktail?.videoUrl, editingCocktail?.itemNumber]);

  // Sync flipped video with main video

  // Navigation functions
  const handleNext = () => {
    if (filteredCocktails.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % filteredCocktails.length);
    }
  };

  const handlePrev = () => {
    if (filteredCocktails.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + filteredCocktails.length) % filteredCocktails.length);
    }
  };

  // Reset index when category changes
  useEffect(() => {
    setCurrentIndex(0);
    // Ensure we have a valid current cocktail for the new category
    if (filteredCocktails.length > 0 && !filteredCocktails[currentIndex]) {
      setCurrentIndex(0);
    }
  }, [selectedCategory, filteredCocktails.length]);

  const handleSave = async (cocktailData) => {
    if (!cocktailData) return;

    // Only require name for all categories - other fields can be added later
    if (!cocktailData.name || !cocktailData.name.trim()) {
      alert('Please enter a name for the item.');
      return;
    }

    // Determine if this is a new item
    // Must have a valid MongoDB ObjectId (24 hex chars) to be considered existing
    const hasValidId = cocktailData._id && 
                       typeof cocktailData._id === 'string' && 
                       cocktailData._id.length === 24 && 
                       !cocktailData._id.startsWith('new-') &&
                       /^[0-9a-fA-F]{24}$/.test(cocktailData._id);
    const isNew = !hasValidId;

    try {
      setLoading(true);
      const normalizedOrder = Number(cocktailData.order);
      const targetCategory = cocktailData.category || (selectedCategory === 'archived' ? 'cocktails' : selectedCategory);
      // Step 1: Save shared fields to Inventory (source of truth)
      const sheetKey = getSheetKeyFromCategory(targetCategory);
      if (sheetKey) {
        try {
          const sharedFields = extractSharedFieldsForInventory(cocktailData, targetCategory);
          // For new items, we only need name - other fields can be empty
          if (sharedFields && sharedFields.name) {
            if (isNew) {
              // Create new inventory row
              const inventoryResponse = await apiCall(`/inventory/${sheetKey}/rows`, {
                method: 'POST',
                body: JSON.stringify({
                  values: sharedFields,
                  updatedBy: 'menumanager'
                }),
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              
              // Get the itemNumber from the created inventory row
              if (inventoryResponse?.sheet?.rows) {
                const newRow = inventoryResponse.sheet.rows.find(r => 
                  r.values?.name === sharedFields.name
                );
                if (newRow?.values?.itemNumber) {
                  cocktailData.itemNumber = Number(newRow.values.itemNumber);
                }
              }
            } else {
              // Update existing inventory row using itemNumber as the primary key (no name/menuManagerId lookup)
              const itemNumber = cocktailData.itemNumber;
              let inventoryRowId = null;
              let inventoryVersion = null;
              
              if (itemNumber && Number.isFinite(Number(itemNumber))) {
                const byItemResponse = await apiCall(`/inventory/${sheetKey}/by-item-number/${itemNumber}`);
                const inventoryRow = byItemResponse?.row;
                if (inventoryRow?._id) {
                  inventoryRowId = inventoryRow._id;
                }
              }
              
              // Fallback: fetch sheet once to get version (and rowId if not found above)
              if (!inventoryRowId) {
                const inventorySheet = await apiCall(`/inventory/${sheetKey}`);
                inventoryVersion = inventorySheet?.version;
                if (inventorySheet?.rows && itemNumber && Number.isFinite(Number(itemNumber))) {
                  const found = inventorySheet.rows.find(r => {
                    const values = r.values || {};
                  const rowItemNumber = values.itemNumber;
                    return Number(rowItemNumber) === Number(itemNumber);
                  });
                  if (found?._id) {
                    inventoryRowId = found._id;
                  }
                }
                
                // If still not found, warn but do not create new (avoid duplicates)
                if (!inventoryRowId) {
                  console.error('❌ Could not find inventory row by itemNumber for existing cocktail:', {
                    cocktailId: cocktailData._id,
                    cocktailName: cocktailData.name,
                    itemNumber: cocktailData.itemNumber,
                    sheetKey: sheetKey
                  });
                  alert(`Warning: Could not find inventory row for ${cocktailData.name} (item #${cocktailData.itemNumber || '?'}). Please link it in Inventory Manager.`);
                }
              }
                
              if (inventoryRowId) {
                // Ensure itemNumber + menuManagerId are included
                  const updatedSharedFields = {
                    ...sharedFields,
                  itemNumber: itemNumber,
                  menuManagerId: String(cocktailData._id || '')
                  };
                  
                // If we didn’t fetch version yet, fetch it now (lightweight head)
                if (!inventoryVersion) {
                  const sheetMeta = await apiCall(`/inventory/${sheetKey}`);
                  inventoryVersion = sheetMeta?.version;
                }
                
                  await apiCall(`/inventory/${sheetKey}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                    version: inventoryVersion,
                      rows: [{
                      _id: inventoryRowId,
                        values: updatedSharedFields
                      }],
                      updatedBy: 'menumanager'
                    }),
                    headers: {
                      'Content-Type': 'application/json'
                    }
                  });
              }
            }
          }
        } catch (inventoryError) {
          console.error('Error saving to inventory:', inventoryError);
          // Don't fail the whole save if inventory save fails, but warn user
          alert(`Warning: Could not save to inventory: ${inventoryError.message}. Cocktail will still be saved.`);
        }
      }
      
      // Step 2: Save MenuManager-only fields to Cocktail model
      const menuManagerOnlyFields = extractMenuManagerOnlyFields(cocktailData);
      
      // Use itemNumber from inventory if we received it, otherwise use existing
      const itemNumberToSave = cocktailData.itemNumber;
      
      // Build form data with itemNumber - backend will use it to generate itemId for filename
      const formData = await buildCocktailFormData({
        ...menuManagerOnlyFields,
        itemNumber: itemNumberToSave, // Include itemNumber from inventory - backend uses this for itemId
        itemId: itemNumberToSave ? `item${itemNumberToSave}` : undefined, // Pass itemId if we have itemNumber
        order: Number.isFinite(normalizedOrder) ? normalizedOrder : 0,
        category: targetCategory,
        name: cocktailData.name, // Name is needed for the form
        regions: cocktailData.regions || selectedRegions || [] // Regions - empty array is fine for new items
      }, { videoFile: videoUpload });

      // Ensure we never create a duplicate - if we have a valid _id, we MUST update
      if (!isNew && !cocktailData._id) {
        console.error('❌ CRITICAL: Existing cocktail missing _id! Cannot save safely.');
        throw new Error('Cannot save: Existing item is missing its ID. Please refresh and try again.');
      }
      
      // Determine endpoint and method - ensure existing items always use PUT
      let endpoint, method;
      if (hasValidId) {
        // Existing item - MUST use PUT to update, never POST
        endpoint = `/menu-items/${cocktailData._id}`;
        method = 'PUT';
      } else {
        // New item - use POST to create
        endpoint = '/menu-items';
        method = 'POST';
      }

      const savedCocktail = await apiCall(endpoint, {
        method,
        body: formData
      });

      
      // Save map snapshot (mandatory) - always generate PNG, even with no selections (blank map)
      // Works for all categories except premix: cocktails, mocktails, wine, beer, spirits
      const categoryKey = normalizeCategoryKey(savedCocktail?.category || targetCategory);
      const isPremix = categoryKey === 'premix';
      const finalItemNumber = savedCocktail?.itemNumber || cocktailData.itemNumber;
      
      // Map snapshot is mandatory for all non-premix items
      if (!isPremix && finalItemNumber && Number.isFinite(finalItemNumber)) {
        try {
          await saveMapSnapshot(finalItemNumber);
        } catch (error) {
          console.error('Error saving map snapshot:', error);
          // Show error to user but don't fail the whole save
          alert(`Map snapshot could not be saved: ${error.message || error}. The item was saved successfully.`);
        }
      } else if (!isPremix) {
        // Warn if we couldn't save map due to missing itemNumber
        console.warn('⚠️ Could not save map snapshot: missing itemNumber');
      }
      
      // Save recipe if it exists and category supports it
      if (recipe && shouldShowRecipeBuilder(targetCategory)) {
        try {
          setSavingRecipe(true);
          const recipeType = getRecipeType(targetCategory);
          if (recipeType) {
            // Update recipe title to match cocktail name
            // Sync garnish from MenuManager form to recipe metadata
            const recipeToSave = {
              ...recipe,
              title: cocktailData.name || recipe.title || '',
              type: recipeType,
              metadata: {
                ...recipe.metadata,
                garnish: formValues.garnish || ''
              }
            };

            // Check if recipe already exists (by title)
            let existingRecipe = null;
            try {
              const response = await apiCall(`/recipes?type=${recipeType}`);
              // Handle both array response and { recipes: [...] } response format
              const recipes = Array.isArray(response) 
                ? response 
                : (response?.recipes || []);
              
              // Try exact match first, then case-insensitive match
              existingRecipe = recipes.find(r => r.title === cocktailData.name);
              if (!existingRecipe) {
                existingRecipe = recipes.find(r => 
                  r.title && cocktailData.name && 
                  r.title.toLowerCase() === cocktailData.name.toLowerCase()
                );
              }
              
            } catch (err) {
              console.warn('Could not check for existing recipe:', err);
            }

            const recipeEndpoint = existingRecipe?._id ? `/recipes/${existingRecipe._id}` : '/recipes';
            const recipeMethod = existingRecipe?._id ? 'PUT' : 'POST';

            // Use FormData if there's a video file, otherwise JSON
            const videoFile = recipeToSave._videoFile;
            let recipeBody;
            if (videoFile instanceof File) {
              const recipeFormData = new FormData();
              recipeFormData.append('title', recipeToSave.title);
              recipeFormData.append('type', recipeToSave.type);
              if (cocktailData.itemNumber) {
                recipeFormData.append('itemNumber', cocktailData.itemNumber);
              }
              recipeFormData.append('metadata', JSON.stringify(recipeToSave.metadata || {}));
              recipeFormData.append('items', JSON.stringify(recipeToSave.items || []));
              recipeFormData.append('totals', JSON.stringify(recipeToSave.totals || { volumeOz: 0, costEach: 0 }));
              recipeFormData.append('batch', JSON.stringify(recipeToSave.batch || {}));
              recipeFormData.append('backgroundColor', recipeToSave.backgroundColor || '#e5e5e5');
              if (recipeToSave.notes) {
                recipeFormData.append('notes', recipeToSave.notes);
              }
              recipeFormData.append('video', videoFile);
              recipeBody = recipeFormData;
            } else {
              // Remove _videoFile from JSON payload (it's not part of the schema)
              const { _videoFile, ...recipeJson } = recipeToSave;
              recipeJson.itemNumber = cocktailData.itemNumber || null;
              recipeBody = recipeJson;
            }

            const savedRecipeResponse = await apiCall(recipeEndpoint, {
              method: recipeMethod,
              body: recipeBody
            });

            // Handle both { recipe: {...} } and direct recipe object responses
            const savedRecipe = savedRecipeResponse?.recipe || savedRecipeResponse;
            if (savedRecipe) {
              setRecipe(savedRecipe);
            }
          }
        } catch (recipeError) {
          console.error('Error saving recipe:', recipeError);
          // Don't fail the whole save if recipe save fails
          alert(`Cocktail saved, but recipe save failed: ${recipeError.message}`);
        } finally {
          setSavingRecipe(false);
        }
      }
      
      // Update selectedCategory to match where the item was saved
      // This ensures the new item appears in the list after refresh
      const savedCategory = normalizeCategoryKey(savedCocktail?.category || targetCategory);
      
      if (savedCategory && savedCategory !== 'archived') {
        setSelectedCategory(savedCategory);
      }
      
      // Fetch cocktails to refresh the list first and rehydrate from inventory (source of truth)
      const refreshedCocktails = await fetchCocktails();
      const refreshedMatch = Array.isArray(refreshedCocktails)
        ? refreshedCocktails.find(c => {
            if (finalItemNumber && Number.isFinite(finalItemNumber)) {
              return Number(c.itemNumber) === Number(finalItemNumber);
            }
            return savedCocktail?._id && c._id === savedCocktail._id;
          })
        : null;
      
      setEditingCocktail(refreshedMatch ? { ...refreshedMatch } : (savedCocktail ? { ...savedCocktail } : null));
      setVideoUpload(null);
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        setVideoPreviewUrl('');
      }
      setNewCocktail({
        name: '',
        concept: '',
        ingredients: '',
        globalIngredients: '',
        // garnish comes from RecipeBuilder (recipe.metadata.garnish), not from cocktail
        category: savedCategory || selectedCategory,
        videoFile: '',
        order: 0
      });
      
      // Store saved cocktail ID and category in refs for useEffect to find and update index
      // This ensures the video display updates with the saved cocktail's video
      const savedCocktailId = savedCocktail._id || savedCocktail.itemId;
      if (savedCocktailId) {
        savedCocktailIdRef.current = savedCocktailId;
        savedCategoryRef.current = savedCategory || selectedCategory;
      } else {
        // If no ID, reset to 0
        setCurrentIndex(0);
      }
      
      alert(`Cocktail ${isNew ? 'created' : 'updated'} successfully!`);
    } catch (error) {
      console.error('Error saving cocktail:', error);
      alert(`Error saving cocktail: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setEditingCocktail(prev => (prev ? { ...prev, [field]: value } : prev));
    // Keep name in sync with recipe title while typing
    if (field === 'name') {
      setRecipe(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          title: value
        };
      });
    }
    // Keep garnish in sync with recipe metadata while typing
    if (field === 'garnish') {
      setRecipe(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          metadata: {
            ...(prev.metadata || {}),
            garnish: value
          }
        };
      });
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this cocktail?')) {
      try {
        await apiCall(`/menu-items/${id}`, { method: 'DELETE' });
        fetchCocktails();
      } catch (error) {
        console.error('Error deleting cocktail:', error);
      }
    }
  };

  const handleArchive = async (cocktail) => {
    if (!cocktail?._id) return;
    if (!window.confirm(`Archive ${cocktail.name}? It will be hidden from the site until restored.`)) return;
    try {
      await apiCall(`/menu-items/${cocktail._id}/archive`, { method: 'POST' });
      if (editingCocktail && editingCocktail._id === cocktail._id) {
        setEditingCocktail(null);
      }
      fetchCocktails();
      alert(`${cocktail.name} archived. It can be restored from the Archived section.`);
    } catch (error) {
      console.error('Error archiving cocktail:', error);
      alert(`Error archiving item: ${error.message}`);
    }
  };


  const handleRestore = async (cocktail) => {
    if (!cocktail?._id) return;
    try {
      await apiCall(`/menu-items/${cocktail._id}/restore`, { method: 'POST' });
      fetchCocktails();
      alert(`${cocktail.name} restored to the ${cocktail.category?.toUpperCase()} section.`);
    } catch (error) {
      console.error('Error restoring cocktail:', error);
      alert(`Error restoring item: ${error.message}`);
    }
  };

  const handleRevertChanges = () => {
    if (!editingCocktail) return;
    if (isNewDraft) {
      setEditingCocktail(prev => prev ? {
        ...prev,
        name: '',
        concept: '',
        ingredients: '',
        globalIngredients: '',
        // garnish comes from RecipeBuilder (recipe.metadata.garnish), not from cocktail
        regions: []
      } : prev);
    } else {
      const fallback = filteredCocktails[currentIndex] || filteredCocktails[0];
      if (fallback) {
        setEditingCocktail({ 
          ...fallback
        });
      }
    }
    setVideoUpload(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl('');
    }
  };

  // Get recipe type from category
  const getRecipeType = (category) => {
    const cat = normalizeCategoryKey(category);
    if (cat === 'cocktails') return 'cocktail';
    if (cat === 'mocktails') return 'mocktail';
    if (cat === 'premix') return 'premix';
    return null;
  };

  // Check if category should show recipe builder
  const shouldShowRecipeBuilder = (category) => {
    const cat = normalizeCategoryKey(category);
    return cat === 'cocktails' || cat === 'mocktails' || cat === 'premix';
  };

  // Create blank recipe
  const createBlankRecipe = (type) => ({
    title: '',
    type: type,
    items: [],
    totals: { volumeOz: 0, costEach: 0 },
    metadata: {},
    backgroundColor: '#e5e5e5',
    batch: { size: 0, unit: 'ml', yieldCount: 0 }
  });

  // Fetch recipe for a cocktail
  const fetchRecipeForCocktail = useCallback(async (cocktail) => {
    if (!cocktail || !cocktail._id || String(cocktail._id).startsWith('new-')) {
      // New item - create blank recipe with itemNumber if available
      const recipeType = getRecipeType(cocktail?.category || selectedCategory);
      if (recipeType) {
        const blankRecipe = createBlankRecipe(recipeType);
        if (cocktail?.itemNumber) {
          blankRecipe.itemNumber = cocktail.itemNumber;
        }
        setRecipe(blankRecipe);
      } else {
        setRecipe(null);
      }
      return;
    }

    const recipeType = getRecipeType(cocktail.category);
    if (!recipeType) {
      setRecipe(null);
      return;
    }

    try {
      setRecipeLoading(true);
      
      // NEW: Try to find recipe by itemNumber first (primary method)
      if (cocktail.itemNumber) {
        try {
          const itemNumberResponse = await apiCall(`/recipes?type=${recipeType}&itemNumber=${cocktail.itemNumber}`);
          const itemNumberRecipes = Array.isArray(itemNumberResponse) 
            ? itemNumberResponse 
            : (itemNumberResponse?.recipes || []);
          
          const matchingRecipe = itemNumberRecipes.find(r => r.itemNumber === cocktail.itemNumber);
          if (matchingRecipe) {
            setRecipe(matchingRecipe);
            return;
          }
        } catch (itemNumberError) {
          console.warn('Error fetching recipe by itemNumber:', itemNumberError);
        }
      }
      
      // FALLBACK: Try to find recipe by title (cocktail name) - for backward compatibility
      const response = await apiCall(`/recipes?type=${recipeType}`);
      // Handle both array response and { recipes: [...] } response format
      const recipes = Array.isArray(response) 
        ? response 
        : (response?.recipes || []);
      
      
      // Try exact match first, then case-insensitive match
      let matchingRecipe = recipes.find(r => r.title === cocktail.name);
      if (!matchingRecipe) {
        matchingRecipe = recipes.find(r => 
          r.title && cocktail.name && 
          r.title.toLowerCase() === cocktail.name.toLowerCase()
        );
      }
      
      if (matchingRecipe) {
        // If recipe doesn't have itemNumber but cocktail does, update it
        if (cocktail.itemNumber && !matchingRecipe.itemNumber) {
          matchingRecipe.itemNumber = cocktail.itemNumber;
        }
        setRecipe(matchingRecipe);
      } else {
        // Create blank recipe if none exists, with itemNumber if available
        const blankRecipe = createBlankRecipe(recipeType);
        if (cocktail.itemNumber) {
          blankRecipe.itemNumber = cocktail.itemNumber;
        }
        setRecipe(blankRecipe);
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
      const recipeType = getRecipeType(cocktail.category);
      if (recipeType) {
        const blankRecipe = createBlankRecipe(recipeType);
        if (cocktail.itemNumber) {
          blankRecipe.itemNumber = cocktail.itemNumber;
        }
        setRecipe(blankRecipe);
      } else {
        setRecipe(null);
      }
    } finally {
      setRecipeLoading(false);
    }
  }, [apiCall, selectedCategory]);

  // Update recipe when editingCocktail changes
  useEffect(() => {
    if (editingCocktail && shouldShowRecipeBuilder(editingCocktail.category)) {
      fetchRecipeForCocktail(editingCocktail);
    } else {
      setRecipe(null);
    }
  }, [editingCocktail?._id, editingCocktail?.category, fetchRecipeForCocktail]);

  // Sync garnish from recipe.metadata.garnish to MenuManager form when recipe loads
  useEffect(() => {
    if (recipe && recipe.metadata?.garnish !== undefined && editingCocktail) {
      // Only update if different to avoid infinite loops
      if (editingCocktail.garnish !== recipe.metadata.garnish) {
        setEditingCocktail(prev => ({
          ...prev,
          garnish: recipe.metadata.garnish || ''
        }));
      }
    }
  }, [recipe?.metadata?.garnish, recipe?._id]);

  // Sync name bidirectionally between MenuManager and RecipeBuilder
  // For PRE-MIX, recipe title drives the cocktail name (uppercase), not the other way around
  useEffect(() => {
    if (recipe && editingCocktail) {
      const isPremix = normalizeCategoryKey(editingCocktail.category) === 'premix';
      if (isPremix) {
        // For PRE-MIX, recipe title drives the cocktail name (uppercase)
        if (recipe.title && recipe.title.toUpperCase() !== editingCocktail.name?.toUpperCase()) {
          setEditingCocktail(prev => ({
            ...prev,
            name: recipe.title.toUpperCase()
          }));
        }
      } else {
        // For other categories: bidirectional sync
        // If recipe title exists and differs from cocktail name, sync recipe → MenuManager
        if (recipe.title && recipe.title !== editingCocktail.name) {
          setEditingCocktail(prev => ({
            ...prev,
            name: recipe.title
          }));
        }
        // If cocktail name exists and differs from recipe title, sync MenuManager → recipe
        else if (editingCocktail.name && editingCocktail.name !== recipe.title) {
          setRecipe(prev => {
            if (!prev) return null;
            return { ...prev, title: editingCocktail.name };
          });
        }
      }
    }
  }, [recipe?.title, recipe?._id, editingCocktail?.name, editingCocktail?.category]);

  const handleNewItem = () => {
    const blankCocktail = {
      _id: `new-${Date.now()}`,
      name: '',
      concept: '',
      ingredients: '',
      globalIngredients: '',
      garnish: '',
      category: selectedCategory === 'archived' ? 'cocktails' : selectedCategory,
      videoFile: '',
      order: filteredCocktails.length, // Set order to end of list
      isActive: true,
      status: 'active',
      regions: []
    };
    
    // Always set editingCocktail, even if switching categories
    setEditingCocktail(blankCocktail);
    
    // Create blank recipe if category supports it
    const recipeType = getRecipeType(blankCocktail.category);
    if (recipeType) {
      setRecipe(createBlankRecipe(recipeType));
    } else {
      setRecipe(null);
    }
    
    setVideoUpload(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl('');
    }
    setCurrentIndex(0);

    if (videoRef.current) {
      videoRef.current.src = '';
    }
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, canvasRef.current.width || 400, canvasRef.current.height || 300);
    }
  };



  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <>
      {/* Video Options Modal */}
      {videoOptionsModal.show && (
        <div className="delete-modal">
          <div className="delete-modal-content">
            <p className="delete-warning">Video Options</p>
            <p className="delete-question">Choose how to handle this video:</p>
            <div className="delete-modal-actions" style={{ flexDirection: 'column', gap: '0.5rem', width: '100%', alignItems: 'stretch' }}>
              <button
                type="button"
                onClick={() => handleVideoOption('process')}
                style={{ 
                  width: '100%', 
                  background: '#f3f4f6', 
                  color: '#374151',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Process Video
              </button>
              <button
                type="button"
                onClick={() => handleVideoOption('upload')}
                style={{ 
                  width: '100%', 
                  background: '#f3f4f6', 
                  color: '#374151',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Upload Video
              </button>
              <button
                type="button"
                onClick={() => handleVideoOption('upload-icon')}
                style={{ 
                  width: '100%', 
                  background: '#f3f4f6', 
                  color: '#374151',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Upload Icon
              </button>
              <button
                type="button"
                onClick={() => handleVideoOption('cancel')}
                style={{ 
                  width: '100%', 
                  background: '#f3f4f6', 
                  color: '#374151',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '0.35rem 0.9rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="menu-manager bg-white min-h-screen px-6 pb-6 w-full" style={{ paddingTop: 0, position: 'relative' }}>
        {filteredCocktails.length > 0 || editingCocktail ? (
          normalizeCategoryKey(selectedCategory) !== 'premix' ? (
            /* Viewer container wrapper with vignette */
            <div style={{ position: 'relative', width: '100%', paddingTop: '62.5%' }}>
              {/* White vignette overlay - around viewer container edges */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(255, 255, 255, 0.5) 60%, rgba(255, 255, 255, 1) 100%)',
                  pointerEvents: 'none',
                  zIndex: 1
                }}
              />
              {/* Viewer container - spans from sidebar to right edge, 16:10 aspect ratio */}
              <div
                ref={viewerContainerRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: '#fff',
                  overflow: 'hidden',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                }}
              >
              {/* Category Navigation - On top of viewer, pinned to top, aligned right */}
              <div style={{ position: 'absolute', top: '60px', right: 0, zIndex: 101, display: 'flex', justifyContent: 'flex-end', paddingRight: '100px' }}>
                <div className="flex gap-4">
                  {menuCategories.map((category) => (
                    <button
                      key={category.key}
                      onClick={() => setSelectedCategory(category.key)}
                      className={`px-6 py-3 rounded-lg border transition-all text-lg font-semibold ${
                        selectedCategory === category.key
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Video background fills entire viewer container */}
              {(currentCocktail.videoFile || currentCocktail.itemNumber || currentCocktail.videoUrl || currentCocktail.cloudinaryVideoUrl || videoPreviewUrl) ? (
                <VideoBackground
                  videoSrc={(() => {
                    // Prioritize Cloudinary URLs first, then preview URL (only if Cloudinary), then nothing
                    let finalVideoSrc = '';
                    
                    if (isCloudinaryUrl(currentCocktail.cloudinaryVideoUrl)) {
                      finalVideoSrc = currentCocktail.cloudinaryVideoUrl;
                      console.log('[MenuManager] Video source: Using cloudinaryVideoUrl', finalVideoSrc);
                    } else if (isCloudinaryUrl(currentCocktail.videoUrl)) {
                      finalVideoSrc = currentCocktail.videoUrl;
                      console.log('[MenuManager] Video source: Using videoUrl', finalVideoSrc);
                    } else if (isCloudinaryUrl(videoPreviewUrl)) {
                      // Only use videoPreviewUrl if it's a Cloudinary URL (blob URLs are not valid for final display)
                      finalVideoSrc = videoPreviewUrl;
                      console.log('[MenuManager] Video source: Using videoPreviewUrl', finalVideoSrc);
                    } else {
                      // No valid Cloudinary URL - return empty string so VideoBackground component doesn't render
                      console.log('[MenuManager] Video source: No valid Cloudinary URL found', {
                        hasCloudinaryVideoUrl: !!currentCocktail.cloudinaryVideoUrl,
                        cloudinaryVideoUrl: currentCocktail.cloudinaryVideoUrl,
                        hasVideoUrl: !!currentCocktail.videoUrl,
                        videoUrl: currentCocktail.videoUrl,
                        hasVideoPreviewUrl: !!videoPreviewUrl,
                        videoPreviewUrl: videoPreviewUrl,
                        itemNumber: currentCocktail.itemNumber
                      });
                      finalVideoSrc = '';
                    }
                    
                    return finalVideoSrc;
                  })()}
                  videoRef={videoRef}
                  currentCocktail={currentCocktail}
                  videoPreviewUrl={videoPreviewUrl}
                  API_BASE_URL={API_BASE_URL}
                  onLoadedData={() => {
                    if (videoRef.current) {
                      const video = videoRef.current;
                      if (video.paused) {
                        video.play().catch(() => {});
                      }
                    }
                  }}
                />
              ) : (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  color: '#6c757d',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: '1.2rem',
                  zIndex: 1,
                }}>
                  No Video Selected
                </div>
              )}

              {/* Processing status overlay - appears in center of viewer behind arrows and form fields */}
              {(() => {
                const shouldShow = processingStatus && processingStatus.active && (processingStatus.itemNumber === (editingCocktail?.itemNumber || currentCocktail?.itemNumber));
                if (processingStatus && processingStatus.active) {
                  console.log('[MenuManager] Processing status check:', {
                    hasProcessingStatus: !!processingStatus,
                    isActive: processingStatus.active,
                    statusItemNumber: processingStatus.itemNumber,
                    editingItemNumber: editingCocktail?.itemNumber,
                    currentItemNumber: currentCocktail?.itemNumber,
                    shouldShow: shouldShow
                  });
                }
                return shouldShow;
              })() && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.95)',
                    zIndex: 5, // Above video (zIndex: 0) and vignette (zIndex: 1), but below arrows (zIndex: 10) and form fields (zIndex: 25)
                    pointerEvents: 'none', // Don't block interaction with arrows and form fields
                  }}>
                    <div className="loading-spinner" style={{ marginBottom: '1rem', width: '50px', height: '50px' }}></div>
                    <div style={{
                      textAlign: 'center',
                      color: '#333',
                      fontSize: '0.9rem',
                      fontFamily: 'Montserrat, sans-serif',
                      padding: '0 1rem'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                        {processingStatus.stage === 'uploading' && 'Uploading video...'}
                        {processingStatus.stage === 'preprocessing' && 'Cropping and trimming...'}
                        {processingStatus.stage === 'white-balance' && 'Applying white balance...'}
                        {processingStatus.stage === 'icon-generation' && 'Generating icon video...'}
                        {processingStatus.stage === 'extracting' && 'Extracting frames...'}
                        {processingStatus.stage === 'preprocessing-frames' && 'Preprocessing frames...'}
                        {processingStatus.stage === 'processing' && 'Processing video...'}
                        {processingStatus.stage === 'blurring' && 'Blurring background...'}
                        {processingStatus.stage === 'compositing' && 'Compositing video...'}
                        {processingStatus.stage === 'encoding' && 'Encoding final video...'}
                        {processingStatus.stage === 'cloudinary-upload' && 'Uploading to Cloudinary...'}
                        {processingStatus.stage === 'creating-icon' && 'Creating icon version...'}
                        {processingStatus.stage === 'complete' && 'Processing complete!'}
                        {processingStatus.stage === 'initializing' && 'Initializing...'}
                        {!processingStatus.stage && 'Processing...'}
                      </div>
                      <div style={{ color: '#666', fontSize: '0.85rem' }}>
                        {processingStatus.message || ''}
                      </div>
                      {processingStatus.error && (
                        <div style={{ color: '#d32f2f', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                          Error: {processingStatus.error}
                        </div>
                      )}
                      {processingStatus.progress > 0 && processingStatus.total > 0 && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#888' }}>
                          {Math.floor((processingStatus.progress / processingStatus.total) * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
              )}

              {/* LEFT COLUMN - Form Fields (NAME, INGREDIENTS, GARNISH, CONCEPT, PAGE, VIDEO) - positioned absolutely on top */}
              <div
                      style={{ 
                        position: 'absolute',
                        left: 0,
                  top: 0,
                  width: '33.33%',
                        height: '100%',
                  paddingLeft: '48px',
                  boxSizing: 'border-box',
                  zIndex: 25,
                  pointerEvents: 'auto',
                    display: 'flex',
                  flexDirection: 'column',
                    justifyContent: 'center',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ marginBottom: '10px' }}>
                    {(!formValues.name || formValues.name.trim() === '') && (
                      <label className="text-lg font-semibold text-gray-800 uppercase tracking-wide block" style={{ marginBottom: '4px' }}>Name</label>
                    )}
                      <input
                        type="text"
                      value={formValues.name || ''}
                        onChange={(e) => handleFieldChange('name', e.target.value)}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                        className="w-full px-3 py-2 focus:outline-none"
                        placeholder=""
                        style={{ 
                          fontFamily: 'Montserrat, sans-serif',
                          border: '2px solid #666666',
                          borderRadius: 0,
                          outline: 'none',
                          background: 'transparent',
                          fontSize: '2rem',
                          fontWeight: 'normal',
                          padding: '1rem',
                          minHeight: '60px',
                          textAlign: 'center',
                          textTransform: 'uppercase'
                        }}
                      disabled={!editingCocktail}
                    />
                  </div>
                  <div>
                    <label className="text-lg font-semibold text-gray-800 uppercase tracking-wide block" style={{ marginBottom: '4px' }}>Ingredients</label>
                      <textarea
                      value={formValues.ingredients || ''}
                      onChange={(e) => handleFieldChange('ingredients', e.target.value)}
                      onFocus={() => setFocusedField('ingredients')}
                      onBlur={() => setFocusedField(null)}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter ingredients"
                        rows={2}
                        style={{ 
                          fontFamily: 'Montserrat, sans-serif',
                          border: focusedField === 'ingredients' ? '1px solid #d1d5db' : 'none',
                          outline: 'none',
                          background: 'transparent'
                        }}
                      disabled={!editingCocktail}
                    />
                  </div>
                  <div>
                    <label className="text-lg font-semibold text-gray-800 uppercase tracking-wide block" style={{ marginBottom: '4px' }}>Garnish</label>
                      <input
                        type="text"
                      value={formValues.garnish || ''}
                      onChange={(e) => handleFieldChange('garnish', e.target.value)}
                      onFocus={() => setFocusedField('garnish')}
                      onBlur={() => setFocusedField(null)}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter garnish"
                        style={{ 
                          fontFamily: 'Montserrat, sans-serif',
                          border: focusedField === 'garnish' ? '1px solid #d1d5db' : 'none',
                          outline: 'none',
                          background: 'transparent'
                        }}
                      disabled={!editingCocktail}
                    />
                  </div>
                  <div>
                    <label className="text-lg font-semibold text-gray-800 uppercase tracking-wide block" style={{ marginBottom: '4px' }}>Concept</label>
                    <textarea
                      value={formValues.concept || ''}
                      onChange={(e) => handleFieldChange('concept', e.target.value)}
                      onFocus={() => setFocusedField('concept')}
                      onBlur={() => setFocusedField(null)}
                      className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter cocktail concept"
                      rows={3}
                      style={{ 
                        fontFamily: 'Montserrat, sans-serif',
                        border: focusedField === 'concept' ? '1px solid #d1d5db' : 'none',
                        outline: 'none',
                        background: 'transparent'
                      }}
                      disabled={!editingCocktail}
                    />
                  </div>
                  <div style={{ marginTop: '-0.5rem' }}>
                    <label className="text-lg font-semibold text-gray-800 uppercase tracking-wide mb-2 block">Page</label>
                    {editingCocktail ? (
                      <select
                        value={editingCocktail.page || editingCocktail.category || selectedCategory}
                        onChange={(e) => {
                          const next = e.target.value;
                          setEditingCocktail({
                            ...editingCocktail,
                            page: next
                          });
                        }}
                        onFocus={() => setFocusedField('page')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ 
                          fontFamily: 'Montserrat, sans-serif',
                          border: focusedField === 'page' ? '1px solid #d1d5db' : 'none',
                          outline: 'none',
                          background: 'transparent'
                        }}
                      >
                        {menuCategories.filter(cat => !cat.archived).map((category) => (
                          <option key={category.key} value={category.key}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        onFocus={() => setFocusedField('page')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ 
                          fontFamily: 'Montserrat, sans-serif',
                          border: focusedField === 'page' ? '1px solid #d1d5db' : 'none',
                          outline: 'none',
                          background: 'transparent'
                        }}
                      >
                        {menuCategories.map((category) => (
                          <option key={category.key} value={category.key}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                )}
              </div>
                    <label className="text-lg font-semibold text-gray-800 uppercase tracking-wide block" style={{ marginBottom: '4px' }}>Video</label>
                    <input
                      type="file"
                      accept="video/*"
                      ref={videoFileInputRef}
                      onChange={(e) => handleVideoSelection(e.target.files?.[0])}
                      disabled={!editingCocktail}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => videoFileInputRef.current?.click()}
                      disabled={!editingCocktail}
                      className="menu-manager-action-button"
                      style={{ 
                        background: 'transparent',
                        border: '2px solid #666666',
                        borderColor: '#666666',
                        color: '#666666',
                        padding: '10px 16px',
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: 500,
                        fontSize: '14px',
                        cursor: editingCocktail ? 'pointer' : 'not-allowed',
                        textTransform: 'uppercase',
                        transition: 'all 0.2s ease',
                        opacity: editingCocktail ? 1 : 0.5,
                        outline: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        appearance: 'none',
                        margin: 0,
                        zIndex: 200,
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!e.currentTarget.disabled && e.currentTarget.matches(':hover')) {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                        } else if (!e.currentTarget.disabled) {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }
                      }}
                      onFocus={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }
                      }}
                      onBlur={(e) => {
                        if (!e.currentTarget.disabled) {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }
                      }}
                    >
                      Choose Video File
                    </button>
                  </div>
              </div>

              {/* CENTER COLUMN - Arrows positioned at 1/3 height */}
              <div
                style={{
                  position: 'absolute',
                  left: '33.33%',
                  top: '33.33%',
                  width: '33.33%',
                  height: '33.33%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'auto',
                  zIndex: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', pointerEvents: 'auto' }}>
                <button
                    aria-label="Previous"
                  onClick={handlePrev}
                  style={{
                    background: 'transparent',
                      color: '#666666',
                    border: 'none',
                      width: `${viewerSize.height / 3}px`,
                      height: `${viewerSize.height / 3}px`,
                      fontSize: `${(viewerSize.height / 3) * 0.4}px`,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    margin: 0,
                      transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#000';
                      e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#666666';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <svg 
                      width={`${(viewerSize.height / 3) * 0.571}px`}
                      height={`${(viewerSize.height / 3) * 0.571}px`}
                      viewBox="0 0 32 32"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ display: 'block' }}
                    >
                    <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                    aria-label="Next"
                  onClick={handleNext}
                  style={{
                    background: 'transparent',
                      color: '#666666',
                    border: 'none',
                      width: `${viewerSize.height / 3}px`,
                      height: `${viewerSize.height / 3}px`,
                      fontSize: `${(viewerSize.height / 3) * 0.4}px`,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    margin: 0,
                      transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#000';
                      e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#666666';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <svg 
                      width={`${(viewerSize.height / 3) * 0.571}px`}
                      height={`${(viewerSize.height / 3) * 0.571}px`}
                      viewBox="0 0 32 32"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ display: 'block' }}
                    >
                    <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
                  </div>

              {/* RIGHT COLUMN - Map, Countries - positioned absolutely on top */}
              <div
                        style={{ 
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  width: '33.33%',
                  height: '100%',
                  paddingTop: '1rem',
                  paddingRight: '1rem',
                  paddingBottom: '1rem',
                  paddingLeft: 0,
                  boxSizing: 'border-box',
                  zIndex: 10,
                  pointerEvents: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0',
                }}
              >
              <div style={{ marginBottom: '0' }}>
                <MemoizedMapContainer
                  mapSvgContent={mapSvgContent}
                  mapError={mapError}
                  mapRef={mapRef}
                  svgRef={svgRef}
                  onMapReady={handleMapReady}
                />
              </div>

              <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: '-60px' }}>
                  <label className="text-lg font-semibold text-gray-800 uppercase tracking-wide block" style={{ marginBottom: '6px' }}>Countries</label>
                  <input
                    type="text"
                    value={countryQuery}
                    onChange={(e) => setCountryQuery(e.target.value)}
                    onFocus={() => setFocusedField('countrySearch')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Search countries..."
                      className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ 
                    fontFamily: 'Montserrat, sans-serif', 
                    marginBottom: '10px',
                    border: focusedField === 'countrySearch' ? '1px solid #d1d5db' : 'none',
                    outline: 'none',
                    background: 'transparent'
                  }}
                  />
                <div style={{ maxHeight: '200px', overflow: 'auto', borderRadius: '8px', padding: '8px' }}>
                  {filteredCountries.map((c) => {
                      const selected = selectedRegions.includes(c.code);
                      return (
                      <label
                        key={c.code}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '4px 2px',
                          cursor: 'pointer',
                          fontFamily: 'Montserrat, sans-serif',
                          color: selected ? '#111' : '#555'
                        }}
                      >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleRegion(c.code)}
                            style={{ accentColor: '#d0d0d0' }}
                          />
                        <span>{c.name} ({c.code})</span>
                        </label>
                      );
                    })}
                    {filteredCountries.length === 0 && (
                      <div style={{ color: '#888', fontFamily: 'Montserrat, sans-serif' }}>No countries found</div>
                    )}
                  </div>
                <div style={{ 
                  marginTop: '40px', 
                  color: '#555', 
                  fontFamily: 'Montserrat, sans-serif', 
                  fontSize: '0.9rem',
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap',
                  paddingBottom: '4px',
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box'
                }}>
                  {selectedCountryDetails.length ? (
                    selectedCountryDetails.map((entry, index) => (
                      <span key={entry.code} style={{ flexShrink: 0, color: '#000' }}>
                        {entry.name} {entry.code}{index < selectedCountryDetails.length - 1 ? ',' : ''}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#000' }}>No countries selected</span>
                  )}
                  </div>
                  </div>
                </div>

              {/* White fade at bottom of viewer */}
              <div
                  style={{ 
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '300px',
                  background: 'linear-gradient(to bottom, transparent, rgba(255, 255, 255, 1))',
                  pointerEvents: 'none',
                  zIndex: 15
                }}
              />

              {/* Admin Actions - positioned at bottom of viewer */}
              <div
                      style={{ 
                  position: 'absolute',
                  bottom: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '2005px',
                  padding: 0,
                  paddingBottom: '60px',
                  margin: 0,
                  boxSizing: 'border-box',
                  zIndex: 30, // Increased from 20 to 30 to be above form fields (zIndex: 25)
                  pointerEvents: 'auto',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  justifyContent: 'center',
                }}
              >
                <button
                  onClick={(e) => {
                    if (editingCocktail) {
                      const button = e.currentTarget;
                      button.style.setProperty('color', '#000', 'important');
                      button.style.setProperty('borderColor', '#000', 'important');
                      handleSave(editingCocktail);
                      setTimeout(() => {
                        // Check if button still exists and is not disabled
                        if (button && !button.disabled) {
                          button.style.setProperty('color', '#666666', 'important');
                          button.style.setProperty('borderColor', '#666666', 'important');
                        }
                      }, 200);
                    }
                  }}
                    disabled={!editingCocktail}
              className="menu-manager-action-button"
              style={{ 
                    background: 'transparent',
                    border: '2px solid #666666',
                    padding: '10px 16px',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 500,
                    fontSize: '14px',
                    cursor: editingCocktail ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                    opacity: editingCocktail ? 1 : 0.5,
                    outline: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    appearance: 'none',
                    margin: 0,
                    position: 'relative',
                    zIndex: 31, // Ensure button is above container (zIndex: 30)
                    pointerEvents: 'auto',
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onMouseDown={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (!e.currentTarget.disabled && e.currentTarget.matches(':hover')) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                    } else if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onFocus={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                }
              }}
            >
              Save Changes
                        </button>
                        <button
              onClick={handleRevertChanges}
              disabled={!editingCocktail}
              className="menu-manager-action-button"
              style={{ 
                    background: 'transparent',
                    border: '2px solid #666666',
                    padding: '10px 16px',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 500,
                    fontSize: '14px',
                    cursor: editingCocktail ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                    opacity: editingCocktail ? 1 : 0.5,
                    outline: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    appearance: 'none',
                    margin: 0,
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onMouseDown={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (!e.currentTarget.disabled && e.currentTarget.matches(':hover')) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                    } else if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onFocus={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                }
              }}
                        >
              Revert Changes
                        </button>
                        <button
              onClick={handleNewItem}
              disabled={selectedCategory === 'archived'}
              className="menu-manager-action-button"
              style={{ 
                    background: 'transparent',
                    border: '2px solid #666666',
                    padding: '10px 16px',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 500,
                    fontSize: '14px',
                    cursor: selectedCategory !== 'archived' ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s ease',
                    opacity: selectedCategory !== 'archived' ? 1 : 0.5,
                    outline: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    appearance: 'none',
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onMouseDown={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (!e.currentTarget.disabled && e.currentTarget.matches(':hover')) {
                      e.currentTarget.style.setProperty('color', '#000', 'important');
                      e.currentTarget.style.borderColor = '#000';
                    } else if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onFocus={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                    }
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.setProperty('color', '#666666', 'important');
                      e.currentTarget.style.borderColor = '#666666';
                }
              }}
            >
              {(() => {
                const cat = normalizeCategoryKey(selectedCategory);
                if (cat === 'cocktails') return 'NEW COCKTAIL';
                if (cat === 'mocktails') return 'NEW MOCKTAIL';
                if (cat === 'beer') return 'NEW BEER';
                if (cat === 'wine') return 'NEW WINE';
                if (cat === 'spirits') return 'NEW SPIRIT';
                if (cat === 'premix') return 'NEW PRE-MIX';
                return 'NEW ITEM';
              })()}
                        </button>
            {editingCocktail && !isNewDraft && (
              <>
                        <button
                  onClick={() => handleDelete(editingCocktail._id)}
                  className="menu-manager-action-button"
                  style={{ 
                          background: 'transparent',
                          border: '2px solid #666666',
                          padding: '10px 16px',
                          fontFamily: 'Montserrat, sans-serif',
                          fontWeight: 500,
                          fontSize: '14px',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          transition: 'all 0.2s ease',
                          outline: 'none',
                          WebkitAppearance: 'none',
                          MozAppearance: 'none',
                          appearance: 'none',
                  }}
                  onMouseEnter={(e) => {
                        e.currentTarget.style.setProperty('color', '#000', 'important');
                        e.currentTarget.style.borderColor = '#000';
                  }}
                  onMouseLeave={(e) => {
                        e.currentTarget.style.setProperty('color', '#666666', 'important');
                        e.currentTarget.style.borderColor = '#666666';
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.setProperty('color', '#000', 'important');
                        e.currentTarget.style.borderColor = '#000';
                      }}
                      onMouseUp={(e) => {
                        if (e.currentTarget.matches(':hover')) {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                        } else {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.setProperty('color', '#666666', 'important');
                        e.currentTarget.style.borderColor = '#666666';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.setProperty('color', '#666666', 'important');
                        e.currentTarget.style.borderColor = '#666666';
                  }}
                        >
                  {(() => {
                    const cat = normalizeCategoryKey(editingCocktail?.category || selectedCategory);
                    if (cat === 'cocktails') return 'DELETE COCKTAIL';
                    if (cat === 'mocktails') return 'DELETE MOCKTAIL';
                    if (cat === 'beer') return 'DELETE BEER';
                    if (cat === 'wine') return 'DELETE WINE';
                    if (cat === 'spirits') return 'DELETE SPIRIT';
                    if (cat === 'premix') return 'DELETE PRE-MIX';
                    return 'DELETE ITEM';
                  })()}
                        </button>
                {canArchive && (
                        <button
                    onClick={() => handleArchive(editingCocktail)}
                    className="menu-manager-action-button"
                    style={{ 
                          background: 'transparent',
                          border: '2px solid #666666',
                          padding: '10px 16px',
                          fontFamily: 'Montserrat, sans-serif',
                          fontWeight: 500,
                          fontSize: '14px',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          transition: 'all 0.2s ease',
                          outline: 'none',
                          WebkitAppearance: 'none',
                          MozAppearance: 'none',
                          appearance: 'none',
                    }}
                    onMouseEnter={(e) => {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                    }}
                    onMouseLeave={(e) => {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                        }}
                        onMouseUp={(e) => {
                          if (e.currentTarget.matches(':hover')) {
                            e.currentTarget.style.setProperty('color', '#000', 'important');
                            e.currentTarget.style.borderColor = '#000';
                          } else {
                            e.currentTarget.style.setProperty('color', '#666666', 'important');
                            e.currentTarget.style.borderColor = '#666666';
                          }
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                    }}
                        >
                    ARCHIVE
                        </button>
                )}
                {canRestore && (
            <button 
                    onClick={() => handleRestore(editingCocktail)}
                    className="menu-manager-action-button"
                    style={{ 
                          background: 'transparent',
                          border: '2px solid #666666',
                          padding: '10px 16px',
                          fontFamily: 'Montserrat, sans-serif',
                          fontWeight: 500,
                          fontSize: '14px',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          transition: 'all 0.2s ease',
                          outline: 'none',
                          WebkitAppearance: 'none',
                          MozAppearance: 'none',
                          appearance: 'none',
                    }}
                    onMouseEnter={(e) => {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                    }}
                    onMouseLeave={(e) => {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.setProperty('color', '#000', 'important');
                          e.currentTarget.style.borderColor = '#000';
                        }}
                        onMouseUp={(e) => {
                          if (e.currentTarget.matches(':hover')) {
                            e.currentTarget.style.setProperty('color', '#000', 'important');
                            e.currentTarget.style.borderColor = '#000';
                          } else {
                            e.currentTarget.style.setProperty('color', '#666666', 'important');
                            e.currentTarget.style.borderColor = '#666666';
                          }
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.setProperty('color', '#666666', 'important');
                          e.currentTarget.style.borderColor = '#666666';
                        }}
                      >
                        RESTORE
            </button>
        )}
              </>
            )}
          </div>
        </div>
          </div>
          ) : (
            /* PREMIX layout - keep original structure for now */
              <div>
              {/* Premix content would go here */}
                    </div>
          )
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500 text-lg mb-4">No items found in {menuCategories.find(c => c.key === selectedCategory)?.label}.</p>
            <button 
              onClick={handleNewItem}
              className="btn btn-primary"
              disabled={selectedCategory === 'archived'}
            >
              Add first item to {menuCategories.find(c => c.key === selectedCategory)?.label}
            </button>
          </div>
        )}

        {/* Recipe Builder - Show for COCKTAILS and MOCKTAILS only (not PRE-MIX) */}
        {editingCocktail && shouldShowRecipeBuilder(editingCocktail.category) && recipe && normalizeCategoryKey(editingCocktail.category) !== 'premix' && (
          <div className="rounded-lg p-6" style={{ position: 'relative', backgroundColor: 'transparent', border: 'none', background: 'transparent' }}>
            <RecipeBuilder
              recipe={{
                ...recipe,
                title: editingCocktail.name || recipe.title // Keep MM name as initial title
              }}
              onChange={(updatedRecipe) => {
                // Allow title edits and keep MM name in sync with RecipeBuilder
                setRecipe(updatedRecipe);
                if (updatedRecipe?.title !== undefined) {
                  setEditingCocktail(prev => {
                    if (!prev) return prev;
                    return { ...prev, name: updatedRecipe.title };
                  });
                }
              }}
              type={getRecipeType(editingCocktail.category)}
              saving={savingRecipe}
              onSave={async () => {
                // Recipe will be saved when cocktail is saved
                // This is just a placeholder to satisfy RecipeBuilder's onSave prop
              }}
              onDelete={null}
              disableTitleEdit={false} // Allow typing; MM name stays synced via onChange
              hideActions={true} // Hide SAVE and DELETE buttons - saving is handled by MenuManager's "Save Changes" button
            />
          </div>
        )}

        {/* Recipe Builder for PRE-MIX - Show only recipe name field (editable, always CAPS) */}
        {editingCocktail && normalizeCategoryKey(editingCocktail.category) === 'premix' && recipe && (
          <div className="rounded-lg p-6 mt-6" style={{ position: 'relative', zIndex: 1, backgroundColor: 'transparent', borderColor: 'transparent', border: 'none' }}>
            <RecipeBuilder
              recipe={{
                ...recipe,
                title: recipe.title || editingCocktail.name || '' // Use recipe title, fallback to cocktail name
              }}
              onChange={(updatedRecipe) => {
                // For PRE-MIX, allow title editing and sync it back to cocktail name
                setRecipe(updatedRecipe);
                // Update cocktail name to match recipe title (always uppercase)
                setEditingCocktail(prev => ({
                  ...prev,
                  name: updatedRecipe.title?.toUpperCase() || prev.name
                }));
              }}
              type={getRecipeType(editingCocktail.category)}
              saving={savingRecipe}
              onSave={async () => {
                // Recipe will be saved when cocktail is saved
              }}
              onDelete={null}
              disableTitleEdit={false} // Allow title editing for PRE-MIX
              hideActions={true} // Hide SAVE and DELETE buttons
              forceUppercaseTitle={true} // Force uppercase for PRE-MIX
            />
          </div>
        )}

    </div>
    </>
  );
};

export default MenuManager;
