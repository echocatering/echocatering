import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isCloudinaryUrl } from '../../utils/cloudinaryUtils';
import { usePosLocalStorage } from '../hooks/usePosLocalStorage';

const CATEGORIES = [
  { id: 'cocktails', label: 'C', fullName: 'Cocktails' },
  { id: 'mocktails', label: 'M', fullName: 'Mocktails' },
  { id: 'beer', label: 'B', fullName: 'Beer' },
  { id: 'wine', label: 'W', fullName: 'Wine' },
  { id: 'spirits', label: 'S', fullName: 'Spirits' }
];

const normalizeCategoryKey = (value = '') => {
  const key = String(value).toLowerCase();
  const categoryMap = {
    'classics': 'cocktails',
    'originals': 'mocktails'
  };
  return categoryMap[key] || key;
};

function useMeasuredSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!window.ResizeObserver) {
      const handle = () => {
        setSize({ width: node.clientWidth, height: node.clientHeight });
      };
      handle();
      window.addEventListener('resize', handle);
      return () => window.removeEventListener('resize', handle);
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

// Inner POS Content Component for 9:19 view
function POSContent({ outerWidth, outerHeight, items, activeCategory, setActiveCategory, onItemClick, loading, total, categoryCounts, selectedItems, lastAction, onRemoveItem, tabs, activeTabId, onCreateTab, onSelectTab, onDeleteTab, onUpdateTabName, onUpdateItemModifiers }) {
  // Bottom drawer (order list) state
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  
  // Top drawer (tabs) state
  const [topDrawerExpanded, setTopDrawerExpanded] = useState(false);
  const [isTopDragging, setIsTopDragging] = useState(false);
  const [topDragStartY, setTopDragStartY] = useState(0);
  const [topDragCurrentY, setTopDragCurrentY] = useState(0);
  
  const [itemToRemove, setItemToRemove] = useState(null); // For confirmation popup
  const [actionKey, setActionKey] = useState(0); // For triggering fade-in animation
  const [flashingItemId, setFlashingItemId] = useState(null); // For item click flash effect
  const [showCloseTabConfirm, setShowCloseTabConfirm] = useState(false); // For close tab confirmation
  
  // Modifier system state
  const [editingItem, setEditingItem] = useState(null); // Item being edited (long-press)
  const [showAddModifierModal, setShowAddModifierModal] = useState(false); // Add modifier modal
  const [newModifierName, setNewModifierName] = useState('');
  const [newModifierPrice, setNewModifierPrice] = useState('');
  const [newModifierLink, setNewModifierLink] = useState(false);
  const [showMaxModifiersAlert, setShowMaxModifiersAlert] = useState(false);
  const [orderingItem, setOrderingItem] = useState(null); // Item being ordered (tap with modifiers)
  const [selectedModifiers, setSelectedModifiers] = useState([]); // Selected modifiers during ordering
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  
  // Handle item long-press start (for editing flow)
  const handleItemPressStart = useCallback((item, e) => {
    e.preventDefault();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setEditingItem(item);
    }, 500); // 500ms for long-press
  }, []);
  
  // Handle item press end
  const handleItemPressEnd = useCallback((item) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // If long-press wasn't triggered, treat as tap (ordering flow)
    if (!longPressTriggeredRef.current) {
      const itemModifiers = item.modifiers || [];
      if (itemModifiers.length === 0) {
        // No modifiers - add item immediately with flash
        setFlashingItemId(item._id);
        onItemClick(item);
        setTimeout(() => setFlashingItemId(null), 500);
      } else {
        // Has modifiers - open modifier selection popup
        setOrderingItem(item);
        setSelectedModifiers([]);
      }
    }
  }, [onItemClick]);
  
  // Handle item click with flash effect (legacy, kept for compatibility)
  const handleItemClickWithFlash = useCallback((item) => {
    setFlashingItemId(item._id);
    onItemClick(item);
    // Clear flash after animation completes
    setTimeout(() => {
      setFlashingItemId(null);
    }, 500);
  }, [onItemClick]);
  
  // Update actionKey when lastAction changes to trigger fade-in
  useEffect(() => {
    if (lastAction) {
      setActionKey(prev => prev + 1);
    }
  }, [lastAction]);
  
  // Calculate dimensions
  // 4px padding on each side (8px total) + 4px gap between each button (2 gaps = 8px) = 16px total
  const itemButtonSize = (outerWidth - 4 - 4 - 4 - 4) / 3; // 4px left padding + 4px right padding + 2x 4px gaps
  const tabButtonSize = itemButtonSize; // Same size as item buttons
  const footerHeight = itemButtonSize / 2; // Collapsed footer height
  const headerHeight = outerWidth / 5; // Header buttons are 1:1, 5 across = width/5 each
  const handleBarHeight = 24; // Height of the swipe handle bar
  const topDrawerCollapsedHeight = handleBarHeight; // Just the handle bar when collapsed
  // Bottom drawer expanded: from footer+subfooter up to header (fully overlaps top drawer handle)
  const bottomDrawerExpandedHeight = outerHeight - headerHeight - footerHeight - handleBarHeight;
  // Top drawer expanded: from header down to footer+subfooter (fully overlaps bottom drawer handle)  
  const topDrawerExpandedHeight = outerHeight - headerHeight - footerHeight - handleBarHeight;
  
  // Calculate current drawer height based on drag or expanded state
  const getDrawerHeight = () => {
    if (isDragging) {
      const dragDelta = dragStartY - dragCurrentY;
      const baseHeight = drawerExpanded ? bottomDrawerExpandedHeight : handleBarHeight;
      const newHeight = Math.max(handleBarHeight, Math.min(bottomDrawerExpandedHeight, baseHeight + dragDelta));
      return newHeight;
    }
    return drawerExpanded ? bottomDrawerExpandedHeight : handleBarHeight;
  };
  
  const currentDrawerHeight = getDrawerHeight();
  
  const handleDragStart = (e) => {
    setIsDragging(true);
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStartY(clientY);
    setDragCurrentY(clientY);
  };
  
  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragCurrentY(clientY);
  }, [isDragging]);
  
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const dragDelta = dragStartY - dragCurrentY;
    const threshold = (bottomDrawerExpandedHeight - handleBarHeight) / 3;
    
    if (drawerExpanded) {
      // If expanded and dragged down enough, collapse
      if (dragDelta < -threshold) {
        setDrawerExpanded(false);
      }
    } else {
      // If collapsed and dragged up enough, expand
      if (dragDelta > threshold) {
        setDrawerExpanded(true);
      }
    }
  }, [isDragging, dragStartY, dragCurrentY, drawerExpanded, bottomDrawerExpandedHeight, footerHeight, handleBarHeight]);
  
  useEffect(() => {
    if (isDragging) {
      const handleMove = (e) => handleDragMove(e);
      const handleEnd = () => handleDragEnd();
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);
  
  // Top drawer (tabs) height calculation
  const getTopDrawerHeight = () => {
    if (isTopDragging) {
      const dragDelta = topDragCurrentY - topDragStartY; // Positive = dragging down
      const baseHeight = topDrawerExpanded ? topDrawerExpandedHeight : topDrawerCollapsedHeight;
      const newHeight = Math.max(topDrawerCollapsedHeight, Math.min(topDrawerExpandedHeight, baseHeight + dragDelta));
      return newHeight;
    }
    return topDrawerExpanded ? topDrawerExpandedHeight : topDrawerCollapsedHeight;
  };
  
  const currentTopDrawerHeight = getTopDrawerHeight();
  
  const handleTopDragStart = (e) => {
    setIsTopDragging(true);
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setTopDragStartY(clientY);
    setTopDragCurrentY(clientY);
  };
  
  const handleTopDragMove = useCallback((e) => {
    if (!isTopDragging) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setTopDragCurrentY(clientY);
  }, [isTopDragging]);
  
  const handleTopDragEnd = useCallback(() => {
    if (!isTopDragging) return;
    setIsTopDragging(false);
    const dragDelta = topDragCurrentY - topDragStartY;
    const threshold = (topDrawerExpandedHeight - topDrawerCollapsedHeight) / 3;
    
    if (topDrawerExpanded) {
      // If expanded and dragged up enough, collapse
      if (dragDelta < -threshold) {
        setTopDrawerExpanded(false);
      }
    } else {
      // If collapsed and dragged down enough, expand
      if (dragDelta > threshold) {
        setTopDrawerExpanded(true);
      }
    }
  }, [isTopDragging, topDragStartY, topDragCurrentY, topDrawerExpanded, topDrawerExpandedHeight, topDrawerCollapsedHeight]);
  
  useEffect(() => {
    if (isTopDragging) {
      const handleMove = (e) => handleTopDragMove(e);
      const handleEnd = () => handleTopDragEnd();
      
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
      };
    }
  }, [isTopDragging, handleTopDragMove, handleTopDragEnd]);
  
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      display: 'flex',
      flexDirection: 'column',
      background: '#f5f5f5',
      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      overflow: 'hidden',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      <style>{`
        @keyframes fadeSlideIn {
          from { 
            opacity: 0; 
            transform: translateY(-8px);
          }
          to { 
            opacity: 1; 
            transform: translateY(0);
          }
        }
        @keyframes flashFadeOut {
          from { 
            opacity: 1;
          }
          to { 
            opacity: 0;
          }
        }
      `}</style>
      {/* Sticky Category Header - 5 buttons, 1:1 aspect ratio, edge-to-edge */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        width: '100%',
        flexShrink: 0,
        background: '#333'
      }}>
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => { setActiveCategory(category.id); setDrawerExpanded(false); setTopDrawerExpanded(false); }}
            title={category.fullName}
            style={{
              flex: 1,
              aspectRatio: '1 / 1',
              border: 'none',
              background: activeCategory === category.id ? '#800080' : '#333',
              color: '#fff',
              fontSize: `${outerWidth / 12}px`,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              padding: 0,
              margin: 0
            }}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Top Sliding Drawer (Tabs) */}
      <div style={{
        position: 'absolute',
        top: headerHeight,
        left: 0,
        right: 0,
        height: `${currentTopDrawerHeight}px`,
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: topDrawerExpanded ? 103 : 101,
        overflow: 'hidden',
        transition: isTopDragging ? 'none' : 'height 0.3s ease-out'
      }}>
        {/* Tab Name Input Row - at top of drawer */}
        {topDrawerExpanded && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px',
            background: '#fff',
            borderBottom: '1px solid #eee',
            flexShrink: 0,
            height: `${Math.max(60, footerHeight * 0.9)}px`
          }}>
            {activeTabId && (
              <>
                {/* NAME: input on left */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, marginRight: '12px' }}>
                  <span style={{
                    color: '#d0d0d0',
                    fontSize: `${Math.max(10, footerHeight * 0.3)}px`,
                    fontWeight: 500,
                    fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                  }}>
                    NAME:
                  </span>
                  <input
                    type="text"
                    value={tabs.find(t => t.id === activeTabId)?.customName || ''}
                    onChange={(e) => onUpdateTabName(activeTabId, e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      color: '#000',
                      fontSize: `${Math.max(14, footerHeight * 0.45)}px`,
                      fontWeight: 600,
                      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                      background: 'transparent',
                      flex: 1,
                      minWidth: 0,
                      textTransform: 'uppercase'
                    }}
                  />
                </div>
                {/* S# on right */}
                <span style={{
                  color: '#800080',
                  fontSize: `${Math.max(14, footerHeight * 0.45)}px`,
                  fontWeight: 600,
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                }}>
                  {tabs.find(t => t.id === activeTabId)?.name}
                </span>
              </>
            )}
          </div>
        )}
        
        {/* Tab Content Area - Scrollable Container */}
        {topDrawerExpanded && (
          <div style={{
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '4px',
                padding: '4px',
                paddingBottom: '8px',
                alignContent: 'start'
              }}>
                {/* Add Tab Button - always first */}
                <button
                  onClick={onCreateTab}
                  style={{
                    aspectRatio: '1 / 1',
                    width: '100%',
                    border: 'none',
                    background: '#fff',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  <span style={{
                    color: '#d0d0d0',
                    fontSize: `${outerWidth / 6}px`,
                    fontWeight: 300,
                    lineHeight: 1
                  }}>+</span>
                </button>
                
                {/* Tab Buttons */}
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    style={{
                      aspectRatio: '1 / 1',
                      width: '100%',
                      border: activeTabId === tab.id ? '2px solid #800080' : 'none',
                      background: activeTabId === tab.id ? '#f0e6f0' : '#fff',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                      padding: '24px',
                      overflow: 'hidden',
                      boxSizing: 'border-box'
                    }}
                  >
                    {(() => {
                      const displayName = (tab.customName || tab.name).toUpperCase();
                      const words = displayName.split(' ');
                      const longestWord = Math.max(...words.map(w => w.length));
                      const numLines = words.length;
                      const buttonWidth = (outerWidth - 16) / 3;
                      const availableWidth = buttonWidth - 48;
                      const availableHeight = buttonWidth - 48;
                      const fontSizeByWidth = availableWidth / (longestWord * 0.6);
                      const fontSizeByHeight = availableHeight / (numLines * 1.2);
                      const fontSize = Math.min(fontSizeByWidth, fontSizeByHeight, outerWidth / 12);
                      
                      return words.map((word, idx) => (
                        <span 
                          key={idx}
                          style={{
                            color: activeTabId === tab.id ? '#800080' : '#333',
                            fontSize: `${fontSize}px`,
                            fontWeight: 600,
                            lineHeight: 1.2
                          }}
                        >
                          {word}
                        </span>
                      ));
                    })()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {topDrawerExpanded && (
          <div style={{
            display: 'flex',
            padding: '8px',
            gap: '8px',
            background: '#fff',
            flexShrink: 0
          }}>
            <button
              onClick={() => activeTabId && setShowCloseTabConfirm(true)}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: '#f0f0f0',
                color: activeTabId ? '#333' : '#999',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: activeTabId ? 'pointer' : 'not-allowed',
                borderRadius: '4px'
              }}
            >
              CLOSE
            </button>
            <button
              onClick={() => { /* TODO: Hold functionality */ }}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: '#f0f0f0',
                color: '#333',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            >
              HOLD
            </button>
            <button
              onClick={() => { /* TODO: Checkout functionality */ }}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: '#800080',
                color: '#fff',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            >
              CHECKOUT
            </button>
          </div>
        )}
        
        {/* Handle Bar at bottom of top drawer - always draggable */}
        <div
          onMouseDown={handleTopDragStart}
          onTouchStart={handleTopDragStart}
          style={{
            height: `${handleBarHeight}px`,
            background: '#f8f8f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            flexShrink: 0,
            borderTop: '1px solid #e0e0e0'
          }}
        >
          <div style={{
            width: '40px',
            height: '4px',
            background: '#ccc',
            borderRadius: '2px'
          }} />
        </div>
      </div>

      {/* Scrollable Item Grid */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '4px',
        paddingTop: `${handleBarHeight + 4}px`,
        paddingBottom: `${footerHeight + handleBarHeight + 12}px`
      }}>
        {loading ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: '#666'
          }}>
            Loading items...
          </div>
        ) : items.length === 0 ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: '#666'
          }}>
            No items in this category
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '4px',
            width: '100%'
          }}>
            {items.map((item) => (
              <button
                key={item._id}
                onMouseDown={(e) => handleItemPressStart(item, e)}
                onMouseUp={() => handleItemPressEnd(item)}
                onMouseLeave={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onTouchStart={(e) => handleItemPressStart(item, e)}
                onTouchEnd={() => handleItemPressEnd(item)}
                onContextMenu={(e) => e.preventDefault()}
                style={{
                  aspectRatio: '1 / 1',
                  border: 'none',
                  background: '#fff',
                  color: '#333',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: 0,
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                  borderRadius: '4px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden',
                  position: 'relative',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none'
                }}
              >
                {/* Flash overlay on click */}
                {flashingItemId === item._id && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#fff',
                    zIndex: 10,
                    animation: 'flashFadeOut 0.5s ease-out forwards'
                  }} />
                )}
                
                {/* Video/Image background */}
                {(() => {
                  const videoSrc = item.cloudinaryIconUrl || item.cloudinaryVideoUrl || item.videoUrl;
                  if (isCloudinaryUrl(videoSrc)) {
                    return (
                      <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        webkit-playsinline="true"
                        style={{ 
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          zIndex: 1
                        }}
                      >
                        <source src={videoSrc} type="video/mp4" />
                      </video>
                    );
                  }
                  return (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1
                    }}>
                      <span style={{ 
                        fontSize: `${outerWidth / 20}px`,
                        color: '#999',
                        padding: '8px',
                        textAlign: 'center',
                        wordBreak: 'break-word'
                      }}>
                        {item.name || 'Item'}
                      </span>
                    </div>
                  );
                })()}
                
                {/* Item name overlay at bottom */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                  padding: '8px 4px 4px 4px',
                  zIndex: 2
                }}>
                  <span style={{
                    fontSize: `${Math.max(10, outerWidth / 28)}px`,
                    fontWeight: 500,
                    color: '#fff',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {item.name || 'Untitled'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sliding Drawer Footer */}
      <div style={{
        position: 'absolute',
        bottom: footerHeight + handleBarHeight,
        left: 0,
        right: 0,
        height: `${currentDrawerHeight}px`,
        background: '#fff',
        borderRadius: '4px',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: drawerExpanded ? 103 : 102,
        overflow: 'hidden',
        transition: isDragging ? 'none' : 'height 0.3s ease-out'
      }}>
        {/* Handle Bar - Swipe indicator - always draggable, overlaps top drawer handle */}
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          style={{
            height: `${handleBarHeight}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            flexShrink: 0,
            background: '#f8f8f8',
            borderBottom: '1px solid #eee'
          }}
        >
          <div style={{
            width: '40px',
            height: '4px',
            background: '#ccc',
            borderRadius: '2px'
          }} />
        </div>
        
        {/* Order List - Only visible when expanded */}
        {currentDrawerHeight > footerHeight + handleBarHeight + 20 && (
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            borderBottom: '1px solid #eee'
          }}>
            {selectedItems.length === 0 ? (
              <div style={{
                color: '#999',
                fontSize: `${Math.max(10, outerWidth / 30)}px`,
                textAlign: 'center',
                padding: '16px'
              }}>
                No items added yet
              </div>
            ) : (
              selectedItems.map((item, index) => (
                <div 
                  key={`${item._id}-${index}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '6px 0',
                    borderBottom: index < selectedItems.length - 1 ? '1px solid #f0f0f0' : 'none'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: `${Math.max(10, outerWidth / 28)}px`,
                    color: '#333'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 500 }}>{item.name || 'Item'}</span>
                      <span style={{ color: '#999' }}>-</span>
                      <span style={{ color: '#999' }}>{item.modifier || CATEGORIES.find(c => c.id === normalizeCategoryKey(item.category))?.fullName || item.category || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#999' }}>{formatTimestamp(item.addedAt)}</span>
                      <button
                        onClick={() => setItemToRemove({ item, index })}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#d0d0d0',
                          fontSize: `${Math.max(18, outerWidth / 16)}px`,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '0 4px',
                          lineHeight: 1
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div style={{
                    fontSize: `${Math.max(9, outerWidth / 32)}px`,
                    color: '#666',
                    marginTop: '2px'
                  }}>
                    ${(parseFloat(item.price) || 0).toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        {drawerExpanded && (
          <div style={{
            display: 'flex',
            padding: '8px',
            gap: '8px',
            background: '#fff',
            flexShrink: 0
          }}>
            <button
              onClick={() => activeTabId && setShowCloseTabConfirm(true)}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: '#f0f0f0',
                color: activeTabId ? '#333' : '#999',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: activeTabId ? 'pointer' : 'not-allowed',
                borderRadius: '4px'
              }}
            >
              CLOSE
            </button>
            <button
              onClick={() => { /* TODO: Hold functionality */ }}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: '#f0f0f0',
                color: '#333',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            >
              HOLD
            </button>
            <button
              onClick={() => { /* TODO: Checkout functionality */ }}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: '#800080',
                color: '#fff',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            >
              CHECKOUT
            </button>
          </div>
        )}
        
      </div>
      
      {/* Fixed Footer Bar - always visible at bottom like header */}
      <div style={{
        position: 'absolute',
        bottom: handleBarHeight,
        left: 0,
        right: 0,
        height: `${footerHeight}px`,
        background: '#fff',
        zIndex: 104,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxShadow: '0 -1px 3px rgba(0,0,0,0.1)'
      }}>
        {/* Top row - Tab S# left, TOTAL right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px'
        }}>
          {/* Tab S# - top left, with custom name to the right if exists */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, marginRight: '12px' }}>
            {activeTabId && tabs.find(t => t.id === activeTabId) && (
              <>
                <span style={{
                  color: '#800080',
                  fontSize: `${Math.max(10, footerHeight * 0.28)}px`,
                  fontWeight: 600,
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                  flexShrink: 0
                }}>
                  {tabs.find(t => t.id === activeTabId)?.name}
                </span>
                {tabs.find(t => t.id === activeTabId)?.customName && (
                  <span style={{
                    color: '#333',
                    fontSize: `${Math.max(10, footerHeight * 0.28)}px`,
                    fontWeight: 500,
                    fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {tabs.find(t => t.id === activeTabId)?.customName?.toUpperCase()}
                  </span>
                )}
              </>
            )}
          </div>
          {/* TOTAL - top right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              color: '#d0d0d0',
              fontSize: `${Math.max(10, footerHeight * 0.3)}px`,
              fontWeight: 500,
              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
            }}>
              TOTAL:
            </span>
            <span style={{
              color: '#000',
              fontSize: `${Math.max(14, footerHeight * 0.45)}px`,
              fontWeight: 600,
              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
            }}>
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
        
        {/* Bottom row - Category Counters left, Action Visualizer right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px'
        }}>
          {/* Category Counters - left */}
          <div style={{ display: 'flex', gap: '12px' }}>
            {CATEGORIES.map((cat) => (
              <span 
                key={cat.id}
                style={{
                  color: '#d0d0d0',
                  fontSize: `${Math.max(8, footerHeight * 0.18)}px`,
                  fontWeight: 500,
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                }}
              >
                {cat.label}{categoryCounts[cat.id] || 0}
              </span>
            ))}
          </div>
          {/* Action Visualizer - right */}
          {lastAction && (
            <span 
              key={actionKey}
              style={{
                color: lastAction.type === 'add' ? '#22c55e' : '#ef4444',
                fontSize: `${Math.max(8, footerHeight * 0.18)}px`,
                fontWeight: 500,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                animation: 'fadeSlideIn 0.5s ease-out'
              }}>
              {lastAction.type === 'add' ? '+' : '-'} {lastAction.itemName}
            </span>
          )}
        </div>
      </div>
      
      {/* Subfooter - white rectangle below the footer */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${handleBarHeight}px`,
        background: '#fff',
        zIndex: 104
      }} />
      
      {/* Confirmation Popup */}
      {itemToRemove && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '16px 24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '80%'
          }}>
            <span style={{
              fontSize: `${Math.max(12, outerWidth / 24)}px`,
              fontWeight: 500,
              color: '#333',
              textAlign: 'center'
            }}>
              Remove "{itemToRemove.item.name}"?
            </span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  onRemoveItem(itemToRemove.index);
                  setItemToRemove(null);
                }}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '8px 20px',
                  fontSize: `${Math.max(11, outerWidth / 28)}px`,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
              <button
                onClick={() => setItemToRemove(null)}
                style={{
                  background: '#e5e5e5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '8px 20px',
                  fontSize: `${Math.max(11, outerWidth / 28)}px`,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Close Tab Confirmation Popup */}
      {showCloseTabConfirm && activeTabId && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '16px 24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '80%'
          }}>
            <span style={{
              fontSize: `${Math.max(12, outerWidth / 24)}px`,
              fontWeight: 500,
              color: '#333',
              textAlign: 'center'
            }}>
              Close tab "{(tabs.find(t => t.id === activeTabId)?.customName || tabs.find(t => t.id === activeTabId)?.name)?.toUpperCase()}"?
            </span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  onDeleteTab(activeTabId);
                  setShowCloseTabConfirm(false);
                  setDrawerExpanded(false);
                }}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '8px 20px',
                  fontSize: `${Math.max(11, outerWidth / 28)}px`,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                CLOSE
              </button>
              <button
                onClick={() => setShowCloseTabConfirm(false)}
                style={{
                  background: '#e5e5e5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '8px 20px',
                  fontSize: `${Math.max(11, outerWidth / 28)}px`,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Item Info Sheet - Editing Flow (Long-press) */}
      {editingItem && (
        <>
          {/* Backdrop - tap to close */}
          <div 
            onClick={() => {
              // Save modifiers and close
              if (onUpdateItemModifiers && editingItem._id) {
                onUpdateItemModifiers(editingItem._id, editingItem.modifiers || []);
              }
              setEditingItem(null);
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.3)',
              zIndex: 200
            }}
          />
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '75%',
            background: '#fff',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
            zIndex: 201,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
          {/* Header Row */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '16px',
            borderBottom: '1px solid #eee',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{
                fontSize: `${Math.max(14, outerWidth / 20)}px`,
                fontWeight: 600,
                color: '#333'
              }}>
                {editingItem.name}
              </span>
              <span style={{
                fontSize: `${Math.max(12, outerWidth / 24)}px`,
                fontWeight: 500,
                color: '#d0d0d0'
              }}>
                ${(parseFloat(editingItem.price) || 0).toFixed(2)}
              </span>
            </div>
            <button
              onClick={() => {
                const currentModifiers = editingItem.modifiers || [];
                if (currentModifiers.length >= 10) {
                  setShowMaxModifiersAlert(true);
                } else {
                  setNewModifierName('');
                  setNewModifierPrice('');
                  setNewModifierLink(false);
                  setShowAddModifierModal(true);
                }
              }}
              style={{
                background: '#800080',
                color: '#fff',
                border: 'none',
                borderRadius: '20px',
                padding: '8px 16px',
                fontSize: `${Math.max(11, outerWidth / 28)}px`,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              NEW MODIFIER
            </button>
          </div>
          
          {/* Modifiers Display */}
          <div style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignContent: 'start'
            }}>
              {(() => {
                const modifiers = editingItem.modifiers || [];
                const categoryName = CATEGORIES.find(c => c.id === activeCategory)?.fullName || activeCategory;
                
                if (modifiers.length === 0) {
                  // Show category as default modifier
                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#f0f0f0',
                      borderRadius: '20px',
                      padding: '8px 14px',
                      fontSize: `${Math.max(11, outerWidth / 28)}px`,
                      color: '#999',
                      fontStyle: 'italic'
                    }}>
                      {categoryName}
                    </div>
                  );
                }
                
                return modifiers.map((mod, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: mod.isLink ? '#e6f0ff' : '#f0f0f0',
                      borderRadius: '20px',
                      padding: '8px 14px',
                      fontSize: `${Math.max(11, outerWidth / 28)}px`,
                      color: '#333'
                    }}
                  >
                    <span>{mod.name}</span>
                    {mod.priceAdjustment !== 0 && (
                      <span style={{ color: mod.priceAdjustment > 0 ? '#22c55e' : '#ef4444' }}>
                        {mod.priceAdjustment > 0 ? '+' : ''}{mod.priceAdjustment.toFixed(2)}
                      </span>
                    )}
                    {mod.isLink && (
                      <span style={{ color: '#3b82f6', fontSize: '10px' }}>LINK</span>
                    )}
                    <button
                      onClick={() => {
                        const newModifiers = [...modifiers];
                        newModifiers.splice(idx, 1);
                        setEditingItem({ ...editingItem, modifiers: newModifiers });
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#999',
                        cursor: 'pointer',
                        padding: '0 2px',
                        fontSize: '14px',
                        lineHeight: 1
                      }}
                    >
                      ×
                    </button>
                  </div>
                ));
              })()}
            </div>
          </div>
          
          {/* Close Button */}
          <div style={{
            padding: '16px',
            borderTop: '1px solid #eee',
            flexShrink: 0
          }}>
            <button
              onClick={() => {
                // Save modifiers back to item
                if (onUpdateItemModifiers && editingItem._id) {
                  onUpdateItemModifiers(editingItem._id, editingItem.modifiers || []);
                }
                setEditingItem(null);
              }}
              style={{
                width: '100%',
                background: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '14px',
                fontSize: `${Math.max(12, outerWidth / 24)}px`,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              DONE
            </button>
          </div>
        </div>
        </>
      )}
      
      {/* Add Modifier Modal */}
      {showAddModifierModal && editingItem && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 202
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            width: '85%',
            maxWidth: '320px'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: `${Math.max(11, outerWidth / 30)}px`,
                color: '#666',
                marginBottom: '6px'
              }}>
                Modifier Name
              </label>
              <input
                type="text"
                value={newModifierName}
                onChange={(e) => setNewModifierName(e.target.value.slice(0, 16))}
                maxLength={16}
                placeholder="Max 16 characters"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: `${Math.max(12, outerWidth / 26)}px`,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: `${Math.max(11, outerWidth / 30)}px`,
                color: '#666',
                marginBottom: '6px'
              }}>
                Price Adjustment
              </label>
              <input
                type="number"
                value={newModifierPrice}
                onChange={(e) => setNewModifierPrice(e.target.value)}
                placeholder="0"
                step="1"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: `${Math.max(12, outerWidth / 26)}px`,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={newModifierLink}
                  onChange={(e) => setNewModifierLink(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{
                  fontSize: `${Math.max(12, outerWidth / 26)}px`,
                  color: '#333'
                }}>
                  LINK
                </span>
              </label>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  if (newModifierName.trim()) {
                    const newMod = {
                      name: newModifierName.trim(),
                      priceAdjustment: parseInt(newModifierPrice, 10) || 0,
                      isLink: newModifierLink
                    };
                    const currentModifiers = editingItem.modifiers || [];
                    setEditingItem({
                      ...editingItem,
                      modifiers: [newMod, ...currentModifiers]
                    });
                    setShowAddModifierModal(false);
                  }
                }}
                style={{
                  flex: 1,
                  background: '#800080',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: `${Math.max(12, outerWidth / 26)}px`,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                SAVE
              </button>
              <button
                onClick={() => setShowAddModifierModal(false)}
                style={{
                  flex: 1,
                  background: '#e5e5e5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: `${Math.max(12, outerWidth / 26)}px`,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Max Modifiers Alert */}
      {showMaxModifiersAlert && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 203
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: `${Math.max(14, outerWidth / 22)}px`,
              fontWeight: 600,
              color: '#333',
              marginBottom: '16px'
            }}>
              10 Modifiers Max
            </div>
            <button
              onClick={() => setShowMaxModifiersAlert(false)}
              style={{
                background: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: `${Math.max(12, outerWidth / 26)}px`,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              BACK
            </button>
          </div>
        </div>
      )}
      
      {/* Modifier Selection Popup - Ordering Flow */}
      {orderingItem && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            width: '85%',
            maxWidth: '320px'
          }}>
            <div style={{
              fontSize: `${Math.max(14, outerWidth / 22)}px`,
              fontWeight: 600,
              color: '#333',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              {orderingItem.name}
            </div>
            
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              marginBottom: '16px',
              justifyContent: 'center'
            }}>
              {(() => {
                const modifiers = orderingItem.modifiers || [];
                const hasLinkSelected = selectedModifiers.some(m => m.isLink);
                
                return modifiers.map((mod, idx) => {
                  const isSelected = selectedModifiers.some(m => m.name === mod.name);
                  const isDisabled = hasLinkSelected && !mod.isLink;
                  
                  return (
                    <button
                      key={idx}
                      disabled={isDisabled}
                      onClick={() => {
                        if (!mod.isLink) {
                          // Non-LINK: add item immediately with this modifier
                          setFlashingItemId(orderingItem._id);
                          onItemClick(orderingItem, mod);
                          setTimeout(() => setFlashingItemId(null), 500);
                          setOrderingItem(null);
                          setSelectedModifiers([]);
                        } else {
                          // LINK: toggle selection
                          if (isSelected) {
                            setSelectedModifiers(selectedModifiers.filter(m => m.name !== mod.name));
                          } else {
                            setSelectedModifiers([...selectedModifiers, mod]);
                          }
                        }
                      }}
                      style={{
                        background: isSelected ? '#800080' : (isDisabled ? '#f5f5f5' : '#f0f0f0'),
                        color: isSelected ? '#fff' : (isDisabled ? '#ccc' : '#333'),
                        border: 'none',
                        borderRadius: '20px',
                        padding: '10px 16px',
                        fontSize: `${Math.max(11, outerWidth / 28)}px`,
                        fontWeight: 500,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.5 : 1
                      }}
                    >
                      {mod.name}
                      {mod.priceAdjustment !== 0 && (
                        <span style={{ marginLeft: '4px' }}>
                          {mod.priceAdjustment > 0 ? '+' : ''}{mod.priceAdjustment.toFixed(2)}
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              {selectedModifiers.length > 0 && selectedModifiers.some(m => m.isLink) && (
                <button
                  onClick={() => {
                    // Add item with all selected LINK modifiers
                    const modifierNames = selectedModifiers.map(m => m.name).join(', ');
                    const totalPriceAdjustment = selectedModifiers.reduce((sum, m) => sum + (m.priceAdjustment || 0), 0);
                    setFlashingItemId(orderingItem._id);
                    onItemClick(orderingItem, { name: modifierNames, priceAdjustment: totalPriceAdjustment });
                    setTimeout(() => setFlashingItemId(null), 500);
                    setOrderingItem(null);
                    setSelectedModifiers([]);
                  }}
                  style={{
                    flex: 1,
                    background: '#800080',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: `${Math.max(12, outerWidth / 26)}px`,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ADD
                </button>
              )}
              <button
                onClick={() => {
                  setOrderingItem(null);
                  setSelectedModifiers([]);
                }}
                style={{
                  flex: 1,
                  background: '#e5e5e5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: `${Math.max(12, outerWidth / 26)}px`,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function POSSalesUI({ layoutMode = 'auto' }) {
  // layoutMode: 'vertical' | 'horizontal' | 'auto'
  // When layoutMode is 'vertical' or 'horizontal', force that layout and ignore user toggle
  // When layoutMode is 'auto', allow user to switch between layouts
  const forcedOrientation = layoutMode === 'auto' ? null : layoutMode;
  const [orientation, setOrientation] = useState(forcedOrientation || 'vertical');
  
  // If layoutMode changes, update orientation to match
  useEffect(() => {
    if (forcedOrientation) {
      setOrientation(forcedOrientation);
    }
  }, [forcedOrientation]);
  const [frameRef, frameSize] = useMeasuredSize();
  const [activeCategory, setActiveCategory] = useState('cocktails');
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastAction, setLastAction] = useState(null); // { type: 'add' | 'remove', itemName: string }
  
  // localStorage-backed tab and event management
  const {
    eventId,
    eventName,
    eventStarted,
    tabs,
    setTabs,
    nextTabNumber,
    setNextTabNumber,
    activeTabId,
    setActiveTabId,
    startEvent,
    clearEvent,
    hasActiveEvent,
  } = usePosLocalStorage();
  
  // Event management UI state
  const [showEventModal, setShowEventModal] = useState(false);
  const [showEndEventModal, setShowEndEventModal] = useState(false);
  const [showSummaryView, setShowSummaryView] = useState(false);
  const [eventSummary, setEventSummary] = useState(null);
  const [newEventName, setNewEventName] = useState('');
  const [syncing, setSyncing] = useState(false);
  
  const { apiCall } = useAuth();

  // Fetch menu items
  useEffect(() => {
    const loadItems = async () => {
      setLoading(true);
      try {
        const data = await apiCall('/menu-items?includeArchived=true');
        const normalized = Array.isArray(data)
          ? data.map((item) => ({
              ...item,
              category: normalizeCategoryKey(item.category || item.section || 'cocktails')
            }))
          : [];
        
        // Filter out archived and placeholder items
        const filtered = normalized.filter(item => {
          const isActive = item.status !== 'archived' && (item.isActive !== false);
          const name = String(item?.name || '').trim();
          const isPlaceholder = /^item\s*\d+$/i.test(name);
          return isActive && !isPlaceholder;
        });

        filtered.sort((a, b) => (a.order || 0) - (b.order || 0));
        setAllItems(filtered);
      } catch (err) {
        console.error('Failed to load menu items:', err);
      } finally {
        setLoading(false);
      }
    };
    loadItems();
  }, [apiCall]);

  // Filter items by active category
  const items = useMemo(() => {
    return allItems.filter(item => normalizeCategoryKey(item.category) === activeCategory);
  }, [allItems, activeCategory]);

  // Get selected items for active tab
  const selectedItems = useMemo(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    return activeTab ? activeTab.items : [];
  }, [tabs, activeTabId]);

  // Calculate total from selected items (active tab)
  const total = useMemo(() => {
    const result = selectedItems.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      console.log(`[POS] Total calc - item: ${item.name}, price: ${price}, modifier: ${item.modifier || 'none'}`);
      return sum + price;
    }, 0);
    console.log(`[POS] Total: ${result}`);
    return result;
  }, [selectedItems]);

  // Calculate category counts from selected items (active tab)
  const categoryCounts = useMemo(() => {
    const counts = {};
    CATEGORIES.forEach(cat => { counts[cat.id] = 0; });
    selectedItems.forEach(item => {
      const cat = normalizeCategoryKey(item.category);
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [selectedItems]);

  // Create a new tab
  const handleCreateTab = useCallback(() => {
    const newTab = {
      id: `tab-${Date.now()}`,
      name: `S${nextTabNumber}`,
      items: []
    };
    setTabs(prev => [newTab, ...prev]);
    setActiveTabId(newTab.id);
    setNextTabNumber(prev => prev + 1);
    console.log(`[POS] Created new tab: ${newTab.name}`);
  }, [nextTabNumber]);

  // Select a tab
  const handleSelectTab = useCallback((tabId) => {
    setActiveTabId(tabId);
  }, []);

  // Delete a tab (not implemented in UI yet, but ready)
  const handleDeleteTab = useCallback((tabId) => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId(tabs.length > 1 ? tabs.find(t => t.id !== tabId)?.id : null);
    }
  }, [activeTabId, tabs]);

  // Update tab custom name
  const handleUpdateTabName = useCallback((tabId, customName) => {
    setTabs(prev => prev.map(tab =>
      tab.id === tabId
        ? { ...tab, customName }
        : tab
    ));
  }, []);

  // Update item modifiers (for editing flow)
  const handleUpdateItemModifiers = useCallback((itemId, modifiers) => {
    setAllItems(prev => prev.map(item =>
      item._id === itemId
        ? { ...item, modifiers }
        : item
    ));
    console.log(`[POS] Updated modifiers for item ${itemId}:`, modifiers);
  }, []);

  // ============================================
  // EVENT MANAGEMENT HANDLERS
  // ============================================

  /**
   * Start a new POS event
   * Creates event in DB and initializes local state
   */
  const handleStartEvent = useCallback(async (name) => {
    try {
      setSyncing(true);
      const response = await apiCall('/pos-events', {
        method: 'POST',
        body: { name },
      });
      
      if (response && response._id) {
        startEvent(response._id, response.name);
        setShowEventModal(false);
        setNewEventName('');
        console.log(`[POS] Started event: ${response.name} (${response._id})`);
      }
    } catch (error) {
      console.error('[POS] Failed to start event:', error);
      alert(`Failed to start event: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }, [apiCall, startEvent]);

  /**
   * End the current event
   * Syncs all tabs to DB and calculates summary
   */
  const handleEndEvent = useCallback(async () => {
    if (!eventId) return;
    
    try {
      setSyncing(true);
      const response = await apiCall(`/pos-events/${eventId}/end`, {
        method: 'PUT',
        body: { tabs },
      });
      
      if (response && response.event) {
        setEventSummary(response.event.summary);
        setShowEndEventModal(false);
        setShowSummaryView(true);
        console.log(`[POS] Ended event: ${eventName}`);
      }
    } catch (error) {
      console.error('[POS] Failed to end event:', error);
      alert(`Failed to end event: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }, [apiCall, eventId, eventName, tabs]);

  /**
   * Close summary view and clear local state
   */
  const handleCloseSummary = useCallback(() => {
    clearEvent();
    setShowSummaryView(false);
    setEventSummary(null);
  }, [clearEvent]);

  /**
   * Sync current state to DB (for periodic saves)
   */
  const handleSyncToDb = useCallback(async () => {
    if (!eventId) return;
    
    try {
      await apiCall(`/pos-events/${eventId}/sync`, {
        method: 'PUT',
        body: { tabs },
      });
      console.log('[POS] Synced to DB');
    } catch (error) {
      console.error('[POS] Failed to sync:', error);
    }
  }, [apiCall, eventId, tabs]);

  // Auto-sync to DB every 30 seconds when event is active
  useEffect(() => {
    if (!eventId) return;
    
    const interval = setInterval(() => {
      handleSyncToDb();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [eventId, handleSyncToDb]);

  const handleItemClick = useCallback((item, modifierData = null) => {
    const timestamp = new Date().toISOString();
    const modifierName = typeof modifierData === 'string' ? modifierData : modifierData?.name;
    const modifierPrice = typeof modifierData === 'object' && modifierData !== null && modifierData.priceAdjustment !== undefined ? Number(modifierData.priceAdjustment) : 0;
    console.log(`[POS] Item clicked: "${item.name}"${modifierName ? ` with modifier: "${modifierName}"` : ''} at ${timestamp}`);
    
    // If no active tab, auto-create one first
    let targetTabId = activeTabId;
    if (!targetTabId) {
      const newTab = {
        id: `tab-${Date.now()}`,
        name: `S${nextTabNumber}`,
        items: []
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      setNextTabNumber(prev => prev + 1);
      targetTabId = newTab.id;
      console.log(`[POS] Auto-created new tab: ${newTab.name}`);
    }
    
    // Add item to the active tab with adjusted price
    const basePrice = parseFloat(item.price) || 0;
    const adjustedPrice = basePrice + modifierPrice;
    console.log(`[POS] Price calculation: item.price=${item.price}, basePrice=${basePrice}, modifierPrice=${modifierPrice}, adjustedPrice=${adjustedPrice}`);
    const newItem = {
      ...item,
      addedAt: timestamp,
      modifier: modifierName || item.modifier || null,
      modifierPriceAdjustment: modifierPrice,
      basePrice: basePrice,
      price: adjustedPrice
    };
    console.log(`[POS] New item created with price: ${newItem.price}`);
    
    setTabs(prev => prev.map(tab => 
      tab.id === targetTabId 
        ? { ...tab, items: [...tab.items, newItem] }
        : tab
    ));
    
    // Update last action
    const actionName = modifierName ? `${item.name} (${modifierName})` : item.name;
    setLastAction({ type: 'add', itemName: actionName });
  }, [activeTabId, nextTabNumber]);

  const handleRemoveItem = useCallback((index) => {
    if (!activeTabId) return;
    
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || !activeTab.items[index]) return;
    
    const itemToRemove = activeTab.items[index];
    console.log(`[POS] Item removed: "${itemToRemove.name}"`);
    
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, items: tab.items.filter((_, i) => i !== index) }
        : tab
    ));
    
    setLastAction({ type: 'remove', itemName: itemToRemove.name });
  }, [activeTabId, tabs]);

  const frameReady = frameSize.width > 0 && frameSize.height > 0;

  const stageDims = useMemo(() => {
    if (!frameReady) return { width: 0, height: 0 };
    const { width: fw, height: fh } = frameSize;
    if (orientation === 'horizontal') return { width: fw, height: fh };
    // 9:19 vertical
    const stageHeight = fh;
    const stageWidth = fh * (9 / 19);
    return { width: stageWidth, height: stageHeight };
  }, [frameReady, frameSize, orientation]);

  // When layoutMode is forced (not 'auto'), we're in standalone mode
  // Render POSContent directly filling the viewport without the viewer wrapper
  const isStandalone = layoutMode !== 'auto';

  // Standalone mode: render POSContent directly filling the viewport
  if (isStandalone) {
    // If showing summary view after event end
    if (showSummaryView && eventSummary) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          background: '#1a1a1a',
          color: '#fff',
          padding: '20px',
          boxSizing: 'border-box',
          overflow: 'auto',
        }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '20px', textAlign: 'center' }}>
              Event Summary
            </h1>
            
            {/* Totals */}
            <div style={{
              background: '#2a2a2a',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4CAF50' }}>
                    ${(eventSummary.totalRevenue || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '14px', color: '#888' }}>Total Revenue</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196F3' }}>
                    {eventSummary.totalItems || 0}
                  </div>
                  <div style={{ fontSize: '14px', color: '#888' }}>Total Items</div>
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {eventSummary.totalTabs || 0}
                </div>
                <div style={{ fontSize: '14px', color: '#888' }}>Total Tabs</div>
              </div>
            </div>
            
            {/* Category Breakdown */}
            <div style={{
              background: '#2a2a2a',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
            }}>
              <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>By Category</h2>
              {eventSummary.categoryBreakdown && Object.entries(
                eventSummary.categoryBreakdown instanceof Map 
                  ? Object.fromEntries(eventSummary.categoryBreakdown)
                  : eventSummary.categoryBreakdown
              ).map(([cat, data]) => (
                <div key={cat} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid #333',
                }}>
                  <span style={{ textTransform: 'capitalize' }}>{cat}</span>
                  <span>
                    {data.count} items • ${(data.revenue || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            
            {/* Timeline Breakdown */}
            {eventSummary.timelineBreakdown && eventSummary.timelineBreakdown.length > 0 && (
              <div style={{
                background: '#2a2a2a',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
              }}>
                <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Timeline (15-min intervals)</h2>
                {eventSummary.timelineBreakdown.map((interval, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #333',
                  }}>
                    <span>
                      {new Date(interval.intervalStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>
                      {interval.itemCount} items • ${(interval.revenue || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Close Button */}
            <button
              onClick={handleCloseSummary}
              style={{
                width: '100%',
                padding: '16px',
                background: '#800080',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              START NEW EVENT
            </button>
          </div>
        </div>
      );
    }

    // If no active event, show start event screen
    if (!hasActiveEvent()) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          background: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#2a2a2a',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center',
          }}>
            <h1 style={{ color: '#fff', fontSize: '24px', marginBottom: '24px' }}>
              Start New Event
            </h1>
            <input
              type="text"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Event Name (optional)"
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                border: '1px solid #444',
                borderRadius: '8px',
                background: '#333',
                color: '#fff',
                marginBottom: '20px',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => handleStartEvent(newEventName || `Event ${new Date().toLocaleDateString()}`)}
              disabled={syncing}
              style={{
                width: '100%',
                padding: '16px',
                background: syncing ? '#555' : '#800080',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: syncing ? 'not-allowed' : 'pointer',
              }}
            >
              {syncing ? 'STARTING...' : 'START EVENT'}
            </button>
          </div>
        </div>
      );
    }

    // Active event: show POS UI with event header
    return (
      <div
        ref={frameRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Event Header Bar */}
        <div style={{
          background: '#1a1a1a',
          color: '#fff',
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '14px' }}>
            <span style={{ fontWeight: 'bold' }}>{eventName}</span>
            {eventStarted && (
              <span style={{ color: '#888', marginLeft: '8px' }}>
                Started {new Date(eventStarted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowEndEventModal(true)}
            style={{
              background: '#c62828',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            END EVENT
          </button>
        </div>

        {/* POS Content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {frameReady && (
            <POSContent
              outerWidth={frameSize.width}
              outerHeight={frameSize.height - 40}
              items={items}
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              onItemClick={handleItemClick}
              loading={loading}
              total={total}
              categoryCounts={categoryCounts}
              selectedItems={selectedItems}
              lastAction={lastAction}
              onRemoveItem={handleRemoveItem}
              tabs={tabs}
              activeTabId={activeTabId}
              onCreateTab={handleCreateTab}
              onSelectTab={handleSelectTab}
              onDeleteTab={handleDeleteTab}
              onUpdateTabName={handleUpdateTabName}
              onUpdateItemModifiers={handleUpdateItemModifiers}
            />
          )}
        </div>

        {/* End Event Confirmation Modal */}
        {showEndEventModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: '#2a2a2a',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '400px',
              width: '90%',
              textAlign: 'center',
            }}>
              <h2 style={{ color: '#fff', fontSize: '20px', marginBottom: '16px' }}>
                End Event?
              </h2>
              <p style={{ color: '#888', marginBottom: '24px' }}>
                This will sync all tabs to the database and show the event summary.
                You have {tabs.length} tab(s) with {selectedItems.length} total item(s).
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowEndEventModal(false)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: '#444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: 'pointer',
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleEndEvent}
                  disabled={syncing}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: syncing ? '#555' : '#c62828',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: syncing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {syncing ? 'SYNCING...' : 'END EVENT'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Preview mode: render with viewer wrapper for admin interface
  const containerPadding = '60px 16px 16px 16px';

  return (
    <div style={{ padding: containerPadding, width: '100%', height: '100%', minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* Only show orientation toggle when layoutMode is 'auto' */}
      {layoutMode === 'auto' && (
        <div style={{ display: 'flex', gap: 12, marginTop: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Orientation:</span>
            {[
              { key: 'horizontal', label: '16:10' },
              { key: 'vertical', label: '9:19' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setOrientation(key)}
                style={{
                  border: '1px solid #333',
                  background: orientation === key ? '#333' : 'transparent',
                  color: orientation === key ? '#fff' : '#333',
                  padding: '6px 10px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '0.85rem',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          position: 'relative',
          width: '100%',
          background: '#f7f7f7',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: '12px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          ref={frameRef}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '100%',
            aspectRatio: '16 / 10',
            overflow: 'hidden',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 6,
          }}
        >
          {frameReady && (
            <div
              style={{
                position: 'absolute',
                width: `${stageDims.width}px`,
                height: `${stageDims.height}px`,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                border: orientation === 'vertical' ? '1px solid #aaa' : 'none',
                overflow: 'hidden'
              }}
            >
              <POSContent
                outerWidth={stageDims.width}
                outerHeight={stageDims.height}
                items={items}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                onItemClick={handleItemClick}
                loading={loading}
                total={total}
                categoryCounts={categoryCounts}
                selectedItems={selectedItems}
                lastAction={lastAction}
                onRemoveItem={handleRemoveItem}
                tabs={tabs}
                activeTabId={activeTabId}
                onCreateTab={handleCreateTab}
                onSelectTab={handleSelectTab}
                onDeleteTab={handleDeleteTab}
                onUpdateTabName={handleUpdateTabName}
                onUpdateItemModifiers={handleUpdateItemModifiers}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
