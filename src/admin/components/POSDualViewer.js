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

  // Calculate container heights to make both viewers the same height
  const containerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        // Use available height minus padding
        const availableHeight = window.innerHeight - 120;
        setContainerHeight(Math.max(400, availableHeight));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Calculate widths based on aspect ratios with same height
  // 16:9 means width = height * 16/9
  // 9:19 means width = height * 9/19
  const horizontalWidth = containerHeight * (16 / 9);
  const verticalWidth = containerHeight * (9 / 19);

  return (
    <div 
      ref={containerRef}
      style={{ 
        padding: '20px', 
        height: '100%', 
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h1 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 'bold' }}>
        POS UI Dual Viewer
      </h1>
      
      <div style={{
        display: 'flex',
        gap: '20px',
        flex: 1,
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflow: 'auto',
      }}>
        {/* 16:9 Horizontal View (Customer-facing) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '8px',
            color: '#666',
          }}>
            16:9 Horizontal (Customer View)
          </div>
          <div style={{
            width: `${horizontalWidth}px`,
            height: `${containerHeight}px`,
            border: '2px solid #ccc',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#000',
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
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '8px',
            color: '#666',
          }}>
            9:19 Vertical (POS Admin)
          </div>
          <div style={{
            width: `${verticalWidth}px`,
            height: `${containerHeight}px`,
            border: '2px solid #ccc',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#fff',
          }}>
            {/* Embed vertical POS via iframe to isolate state */}
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
      </div>
    </div>
  );
}
