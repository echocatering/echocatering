import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isCloudinaryUrl } from '../../utils/cloudinaryUtils';
import { usePosLocalStorage } from '../hooks/usePosLocalStorage';
import MenuGallery2 from '../../pages/menuGallery2';

/**
 * POSDualViewer - Shows both horizontal (16:9) and vertical (9:19) POS layouts side by side
 * Left: 16:9 horizontal customer-facing view (MenuGallery2)
 * Right: 9:19 vertical POS admin interface
 * Both share the same state and run simultaneously
 */

const normalizeCategoryKey = (value = '') => {
  const key = String(value).toLowerCase();
  const categoryMap = {
    'classics': 'cocktails',
    'originals': 'mocktails'
  };
  return categoryMap[key] || key;
};

export default function POSDualViewer() {
  const { apiCall } = useAuth();
  const [activeCategory, setActiveCategory] = useState('cocktails');
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch menu items
  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true);
        const data = await apiCall('/cocktails');
        const items = (data || [])
          .filter(item => item.status !== 'archived' && item.isActive !== false)
          .map(item => ({
            ...item,
            category: normalizeCategoryKey(item.category),
          }));
        setAllItems(items);
      } catch (error) {
        console.error('Error fetching items:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [apiCall]);

  const items = useMemo(() => {
    return allItems.filter(item => item.category === activeCategory);
  }, [allItems, activeCategory]);

  // Calculate dimensions to fit both viewers in available space
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: rect.height
        });
      }
    };
    
    // Initial measurement
    updateDimensions();
    
    // Use ResizeObserver for accurate container size tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('resize', updateDimensions);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Calculate viewer sizes to fit within container
  // Both viewers have same height, widths based on aspect ratios
  // 16:10 ratio = 1.6, 9:19 ratio = 0.474
  // Total width ratio = 1.6 + 0.474 = 2.074 (plus gap)
  const gap = 20;
  const availableWidth = dimensions.width - gap;
  const availableHeight = dimensions.height;
  
  // Calculate height that fits both viewers in available width
  const totalWidthRatio = (16/10) + (9/19); // ~2.07
  const heightFromWidth = availableWidth / totalWidthRatio;
  
  // Use the smaller of height-constrained or width-constrained (no arbitrary max)
  const viewerHeight = Math.min(availableHeight, heightFromWidth);
  const horizontalWidth = viewerHeight * (16 / 10);
  const verticalWidth = viewerHeight * (9 / 19);

  return (
    <div style={{ 
      padding: '20px', 
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <h1 
        className="text-3xl tracking-wide uppercase" 
        style={{ 
          fontWeight: 400, 
          margin: '0 0 16px 0',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        POS UI
      </h1>
      
      <div 
        ref={containerRef}
        style={{
          display: 'flex',
          gap: `${gap}px`,
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {dimensions.width > 0 && (
          <>
            {/* 16:9 Horizontal View (Customer-facing) */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '500',
                marginBottom: '6px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                16:10 Customer View
              </div>
              <div style={{
                width: `${horizontalWidth}px`,
                height: `${viewerHeight}px`,
                border: '1px solid #ddd',
                borderRadius: '4px',
                overflow: 'hidden',
                background: '#000',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}>
                <MenuGallery2 
                  embedded={true}
                  initialCategory={activeCategory}
                />
              </div>
            </div>

            {/* 9:19 Vertical View (POS Admin) */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '500',
                marginBottom: '6px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                9:19 POS Admin
              </div>
              <div style={{
                width: `${verticalWidth}px`,
                height: `${viewerHeight}px`,
                border: '1px solid #ddd',
                borderRadius: '4px',
                overflow: 'hidden',
                background: '#fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}>
                <iframe
                  src="/admin/pos"
                  title="POS Vertical View"
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
