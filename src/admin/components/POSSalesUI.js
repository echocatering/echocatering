import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isCloudinaryUrl } from '../../utils/cloudinaryUtils';
import { usePosLocalStorage } from '../hooks/usePosLocalStorage';
import { usePosWebSocket } from '../hooks/usePosWebSocket';
import MenuGallery2 from '../../pages/menuGallery2';

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

// Convert string to Title Case
const toTitleCase = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

function useMeasuredSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    
    // Immediately measure on mount to prevent stuck loading state
    const initialMeasure = () => {
      setSize({ width: node.clientWidth, height: node.clientHeight });
    };
    initialMeasure();
    
    if (!window.ResizeObserver) {
      const handle = () => {
        setSize({ width: node.clientWidth, height: node.clientHeight });
      };
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
function POSContent({ outerWidth, outerHeight, items, activeCategory, setActiveCategory, onItemClick, loading, total, categoryCounts, selectedItems, lastAction, onRemoveItem, tabs, activeTabId, onCreateTab, onSelectTab, onDeleteTab, onUpdateTabName, onUpdateItemModifiers, onMoveItems, onCheckout, checkoutLoading }) {
  // Bottom drawer state - starts collapsed, receipt view is default
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  
  // Drawer view state: 'receipt' or 'tabs'
  const [drawerView, setDrawerView] = useState('receipt');
  
  const [itemToRemove, setItemToRemove] = useState(null); // For confirmation popup
  const [actionKey, setActionKey] = useState(0); // For triggering fade-in animation
  const [flashingItemId, setFlashingItemId] = useState(null); // For item click flash effect
  const [showCloseTabConfirm, setShowCloseTabConfirm] = useState(false); // For close tab confirmation
  
  // Receipt item selection state (for moving items between tabs)
  const [selectedReceiptIndices, setSelectedReceiptIndices] = useState(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const receiptLongPressTimerRef = useRef(null);
  const receiptLongPressTriggeredRef = useRef(false);
  
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
  const pressHandledRef = useRef(false); // Track if current press has been handled to prevent double-fire
  const resetHandledTimeoutRef = useRef(null);
  
  // Handle item long-press start (for editing flow)
  const handleItemPressStart = useCallback((item, e) => {
    // Don't reset pressHandledRef here - it will be reset after a delay in handleItemPressEnd
    // This prevents the double-fire issue where touch events fire, then mouse events fire
    
    // Only start long-press timer if not already handled
    if (pressHandledRef.current) {
      return;
    }
    
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      pressHandledRef.current = true; // Mark as handled
      setEditingItem(item);
      
      // Reset after a delay
      setTimeout(() => {
        pressHandledRef.current = false;
      }, 300);
    }, 500); // 500ms for long-press
  }, []);
  
  // Handle item press end
  const handleItemPressEnd = useCallback((item, e) => {
    // If already handled (by long-press or previous event), skip
    if (pressHandledRef.current) {
      return;
    }
    
    // Mark as handled immediately to prevent double-fire
    pressHandledRef.current = true;
    
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
        console.log(`[POS] Opening modifier popup for "${item.name}", base price: ${item.price}`);
        setOrderingItem(item);
        setSelectedModifiers([]);
      }
    }
    
    // Reset the handled flag after 300ms to allow the next press
    // This prevents mouse events from firing after touch events
    if (resetHandledTimeoutRef.current) {
      clearTimeout(resetHandledTimeoutRef.current);
    }
    resetHandledTimeoutRef.current = setTimeout(() => {
      pressHandledRef.current = false;
    }, 300);
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
  
  // Handle receipt item long-press start (for selection/move flow)
  const handleReceiptItemPressStart = useCallback((index, e) => {
    e.preventDefault();
    receiptLongPressTriggeredRef.current = false;
    receiptLongPressTimerRef.current = setTimeout(() => {
      receiptLongPressTriggeredRef.current = true;
      // Toggle selection for this item
      setSelectedReceiptIndices(prev => {
        const newSet = new Set(prev);
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
        return newSet;
      });
    }, 400); // 400ms for long-press
  }, []);
  
  // Handle receipt item press end
  const handleReceiptItemPressEnd = useCallback((e) => {
    if (receiptLongPressTimerRef.current) {
      clearTimeout(receiptLongPressTimerRef.current);
      receiptLongPressTimerRef.current = null;
    }
  }, []);
  
  // Clear selection when drawer view changes or drawer closes
  useEffect(() => {
    if (drawerView !== 'receipt' || !drawerExpanded) {
      setSelectedReceiptIndices(new Set());
    }
  }, [drawerView, drawerExpanded]);
  
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
  const handleBarHeight = 36; // Height of the swipe handle bar (balanced for touch and aesthetics)
  // Bottom drawer expanded: from footer up to header
  const bottomDrawerExpandedHeight = outerHeight - headerHeight - footerHeight - handleBarHeight;
  
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
  }, [isDragging, dragStartY, dragCurrentY, drawerExpanded, bottomDrawerExpandedHeight, handleBarHeight]);
  
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
        background: '#d0d0d0'
      }}>
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => { setActiveCategory(category.id); setDrawerExpanded(false); }}
            title={category.fullName}
            style={{
              flex: 1,
              aspectRatio: '1 / 1',
              border: 'none',
              background: activeCategory === category.id ? '#800080' : '#999',
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

      {/* Scrollable Item Grid */}
      <div className="scrollable-content" style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '4px',
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
                onMouseUp={(e) => handleItemPressEnd(item, e)}
                onMouseLeave={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onTouchStart={(e) => handleItemPressStart(item, e)}
                onTouchEnd={(e) => handleItemPressEnd(item, e)}
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
                  const displayName = (item.name || 'Item').toUpperCase();
                  const words = displayName.split(' ');
                  const longestWord = Math.max(...words.map(w => w.length));
                  const numLines = words.length;
                  const buttonWidth = (outerWidth - 16) / 3;
                  const availableWidth = buttonWidth - 24;
                  const availableHeight = buttonWidth - 24;
                  const fontSizeByWidth = availableWidth / (longestWord * 0.6);
                  const fontSizeByHeight = availableHeight / (numLines * 1.2);
                  const fontSize = Math.min(fontSizeByWidth, fontSizeByHeight, outerWidth / 12);
                  
                  return (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#f0f0f0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      padding: '12px',
                      boxSizing: 'border-box'
                    }}>
                      {words.map((word, idx) => (
                        <span 
                          key={idx}
                          style={{ 
                            fontSize: `${fontSize}px`,
                            fontWeight: 600,
                            color: '#999',
                            lineHeight: 1.1,
                            textAlign: 'center'
                          }}
                        >
                          {word}
                        </span>
                      ))}
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
                    {(item.name || 'Untitled').toUpperCase()}
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
        {/* Handle Bar - Swipe indicator - always draggable */}
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
            width: '60px',
            height: '6px',
            background: '#999',
            borderRadius: '3px'
          }} />
        </div>
        
        {/* Drawer Content - switches between Receipt and Tabs views */}
        {currentDrawerHeight > handleBarHeight + 20 && (
          <>
            {/* Tab Name Input Row - only show when on tabs view and a tab is selected */}
            {drawerView === 'tabs' && activeTabId && (
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
                <span style={{
                  color: '#800080',
                  fontSize: `${Math.max(14, footerHeight * 0.45)}px`,
                  fontWeight: 600,
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                }}>
                  {tabs.find(t => t.id === activeTabId)?.name}
                </span>
              </div>
            )}
            
            {/* Receipt View - Order List */}
            {drawerView === 'receipt' && (
              <div className="scrollable-content" style={{
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
                  selectedItems.map((item, index) => {
                    const isSelected = selectedReceiptIndices.has(index);
                    return (
                      <div 
                        key={`${item._id}-${index}`}
                        onMouseDown={(e) => handleReceiptItemPressStart(index, e)}
                        onMouseUp={handleReceiptItemPressEnd}
                        onMouseLeave={handleReceiptItemPressEnd}
                        onTouchStart={(e) => handleReceiptItemPressStart(index, e)}
                        onTouchEnd={handleReceiptItemPressEnd}
                        onTouchCancel={handleReceiptItemPressEnd}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '6px 8px',
                          marginBottom: '2px',
                          borderRadius: '4px',
                          background: isSelected ? '#f0f0f0' : 'transparent',
                          cursor: 'pointer',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: `${Math.max(10, outerWidth / 28)}px`,
                          color: isSelected ? '#fff' : '#333'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 500, color: isSelected ? '#333' : '#333' }}>{(item.name || 'Item').toUpperCase()}</span>
                            <span style={{ color: isSelected ? '#666' : '#999' }}>-</span>
                            <span style={{ color: isSelected ? '#666' : '#999' }}>{item.modifier || CATEGORIES.find(c => c.id === normalizeCategoryKey(item.category))?.fullName || item.category || '—'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: isSelected ? '#666' : '#999' }}>{formatTimestamp(item.addedAt)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setItemToRemove({ item, index }); }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: isSelected ? '#666' : '#d0d0d0',
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
                          color: isSelected ? '#666' : '#666',
                          marginTop: '2px'
                        }}>
                          ${(parseFloat(item.price) || 0).toFixed(2)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
            
            {/* Tabs View - Tab Grid */}
            {drawerView === 'tabs' && (
              <div className="scrollable-content" style={{
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
            )}
          </>
        )}
        
        {/* Action Buttons - always visible when drawer is expanded */}
        {drawerExpanded && (
          <div style={{
            display: 'flex',
            padding: '8px',
            gap: '8px',
            background: '#fff',
            flexShrink: 0
          }}>
            {/* Page Switcher Button - TABS/MOVE when on receipt, VIEW when on tabs */}
            <button
              onClick={() => {
                if (drawerView === 'receipt' && selectedReceiptIndices.size > 0) {
                  // MOVE mode - open tab selection modal
                  setShowMoveModal(true);
                } else {
                  // Normal mode - switch views
                  setDrawerView(drawerView === 'receipt' ? 'tabs' : 'receipt');
                }
              }}
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
              {drawerView === 'receipt' ? (selectedReceiptIndices.size > 0 ? 'MOVE' : 'TABS') : 'VIEW'}
            </button>
            {/* Close/Cancel Button */}
            <button
              onClick={() => {
                if (selectedReceiptIndices.size > 0) {
                  // CANCEL mode - deselect all items
                  setSelectedReceiptIndices(new Set());
                } else {
                  // Normal mode - close tab
                  activeTabId && setShowCloseTabConfirm(true);
                }
              }}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: '#f0f0f0',
                color: (selectedReceiptIndices.size > 0 || activeTabId) ? '#333' : '#999',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: (selectedReceiptIndices.size > 0 || activeTabId) ? 'pointer' : 'not-allowed',
                borderRadius: '4px'
              }}
            >
              {selectedReceiptIndices.size > 0 ? 'CANCEL' : 'CLOSE'}
            </button>
            {/* Checkout Button */}
            <button
              onClick={() => onCheckout && onCheckout()}
              disabled={checkoutLoading || selectedItems.length === 0}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                background: checkoutLoading ? '#666' : (selectedItems.length === 0 ? '#ccc' : '#800080'),
                color: '#fff',
                fontSize: `${Math.max(12, outerWidth / 25)}px`,
                fontWeight: 600,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                cursor: checkoutLoading || selectedItems.length === 0 ? 'not-allowed' : 'pointer',
                borderRadius: '4px'
              }}
            >
              {checkoutLoading ? 'PROCESSING...' : 'CHECKOUT'}
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
        {/* Top row - Tab P# left, TOTAL right */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px'
        }}>
          {/* Tab P# - top left, with custom name to the right if exists */}
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
                fontSize: `${Math.max(8, footerHeight * 0.18)}px`,
                fontWeight: 500,
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                animation: 'fadeSlideIn 0.5s ease-out'
              }}>
              {lastAction.tabName && (
                <span style={{ color: '#d0d0d0' }}>{lastAction.tabName} </span>
              )}
              <span style={{ color: lastAction.type === 'add' ? '#22c55e' : '#ef4444' }}>
                {lastAction.type === 'add' ? '+' : '-'} {lastAction.itemName}
              </span>
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
              Remove "{toTitleCase(itemToRemove.item.name)}"?
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
      
      {/* Move Items Modal - Select destination tab */}
      {showMoveModal && (
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
            maxWidth: '80%',
            minWidth: '200px'
          }}>
            <span style={{
              fontSize: `${Math.max(12, outerWidth / 24)}px`,
              fontWeight: 500,
              color: '#333',
              textAlign: 'center'
            }}>
              SELECT TAB
            </span>
            {tabs.filter(t => t.id !== activeTabId).length === 0 ? (
              <span style={{
                fontSize: `${Math.max(10, outerWidth / 30)}px`,
                color: '#999',
                textAlign: 'center',
                padding: '8px'
              }}>
                No other tabs available
              </span>
            ) : (
              <div style={{
                width: '100%',
                maxHeight: '200px',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {tabs.filter(t => t.id !== activeTabId).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (onMoveItems) {
                        onMoveItems(activeTabId, tab.id, Array.from(selectedReceiptIndices));
                      }
                      setSelectedReceiptIndices(new Set());
                      setShowMoveModal(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: `${Math.max(14, outerWidth / 24)}px`,
                      fontWeight: 500,
                      color: '#333',
                      background: '#f0f0f0',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      flexShrink: 0
                    }}
                  >
                    {(tab.customName || tab.name).toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowMoveModal(false)}
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
                {toTitleCase(editingItem.name)}
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
                
                return modifiers.map((mod, idx) => {
                  const modPrice = mod.priceAdjustment ?? mod.price ?? 0;
                  const modIsLink = mod.isLink ?? !!mod.linkedItemId;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: modIsLink ? '#e6f0ff' : '#f0f0f0',
                        borderRadius: '20px',
                        padding: '8px 14px',
                        fontSize: `${Math.max(11, outerWidth / 28)}px`,
                        color: '#333'
                      }}
                    >
                      <span>{mod.name}</span>
                      {modPrice !== 0 && (
                        <span style={{ color: modPrice > 0 ? '#22c55e' : '#ef4444' }}>
                          {modPrice > 0 ? '+' : ''}{modPrice.toFixed(2)}
                        </span>
                      )}
                      {modIsLink && (
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
                  );
                });
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
              {toTitleCase(orderingItem.name)}
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
                  const modIsLink = mod.isLink ?? !!mod.linkedItemId;
                  const isDisabled = hasLinkSelected && !modIsLink;
                  
                  return (
                    <button
                      key={idx}
                      disabled={isDisabled}
                      onClick={() => {
                        // Normalize modifier to ensure priceAdjustment exists
                        const normalizedMod = {
                          ...mod,
                          priceAdjustment: mod.priceAdjustment ?? mod.price ?? 0,
                          isLink: mod.isLink ?? !!mod.linkedItemId
                        };
                        if (!normalizedMod.isLink) {
                          // Non-LINK: add item immediately with this modifier
                          setFlashingItemId(orderingItem._id);
                          onItemClick(orderingItem, normalizedMod);
                          setTimeout(() => setFlashingItemId(null), 500);
                          setOrderingItem(null);
                          setSelectedModifiers([]);
                        } else {
                          // LINK: toggle selection
                          if (isSelected) {
                            setSelectedModifiers(selectedModifiers.filter(m => m.name !== mod.name));
                          } else {
                            setSelectedModifiers([...selectedModifiers, normalizedMod]);
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
                      {(mod.priceAdjustment ?? mod.price ?? 0) !== 0 && (
                        <span style={{ marginLeft: '4px' }}>
                          {(mod.priceAdjustment ?? mod.price ?? 0) > 0 ? '+' : ''}{(mod.priceAdjustment ?? mod.price ?? 0).toFixed(2)}
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
  // When layoutMode is 'vertical' or 'horizontal', force that layout and ignore device orientation
  // When layoutMode is 'auto', detect device orientation and switch layouts automatically:
  //   - Horizontal (landscape): Show MenuGallery2 customer view
  //   - Vertical (portrait): Show POS admin interface
  const forcedOrientation = layoutMode === 'auto' ? null : layoutMode;
  const [orientation, setOrientation] = useState(forcedOrientation || 'vertical');
  
  // Device orientation detection for layoutMode='auto'
  useEffect(() => {
    if (layoutMode !== 'auto') return;
    
    const detectOrientation = () => {
      const isHorizontal = window.innerWidth > window.innerHeight;
      setOrientation(isHorizontal ? 'horizontal' : 'vertical');
      console.log('[POS] Device orientation:', isHorizontal ? 'HORIZONTAL' : 'VERTICAL');
    };
    
    // Check on mount
    detectOrientation();
    
    // Listen for changes
    window.addEventListener('resize', detectOrientation);
    window.addEventListener('orientationchange', detectOrientation);
    
    return () => {
      window.removeEventListener('resize', detectOrientation);
      window.removeEventListener('orientationchange', detectOrientation);
    };
  }, [layoutMode]);
  
  // If layoutMode is forced (not 'auto'), update orientation to match
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
  const [showEndEventButton, setShowEndEventButton] = useState(false);
  const endEventTimeoutRef = useRef(null);
  
  // Checkout state
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showCheckoutSuccess, setShowCheckoutSuccess] = useState(false);
  const [lastCheckoutResult, setLastCheckoutResult] = useState(null);
  
  // Square callback result state (for TWA return flow)
  const [squareCallbackResult, setSquareCallbackResult] = useState(null);
  
  // ============================================
  // SQUARE CALLBACK HANDLER
  // Parses callback from Square POS app when returning to TWA
  // Callback URL format: echocatering://square-callback?data=...
  // ============================================
  useEffect(() => {
    const parseSquareCallback = () => {
      // Check URL for Square callback parameters
      const url = window.location.href;
      const urlParams = new URLSearchParams(window.location.search);
      
      // Square returns data in various formats depending on success/cancel
      const status = urlParams.get('status');
      const transactionId = urlParams.get('transaction_id');
      const clientTransactionId = urlParams.get('client_transaction_id');
      const errorCode = urlParams.get('error_code');
      const stateParam = urlParams.get('state');
      
      // Also check for base64 encoded data parameter
      const dataParam = urlParams.get('data');
      
      console.log('[POS] Checking for Square callback...', { url, status, transactionId, errorCode, dataParam });
      
      // If we have any Square callback parameters, process them
      if (status || transactionId || errorCode || dataParam) {
        let callbackData = {
          status: status || (transactionId ? 'ok' : 'error'),
          transactionId: transactionId,
          clientTransactionId: clientTransactionId,
          errorCode: errorCode,
          state: null
        };
        
        // Parse state if present (contains our original checkout data)
        if (stateParam) {
          try {
            callbackData.state = JSON.parse(stateParam);
          } catch (e) {
            console.warn('[POS] Failed to parse state param:', e);
          }
        }
        
        // Parse base64 data if present
        if (dataParam) {
          try {
            const decoded = JSON.parse(atob(dataParam));
            callbackData = { ...callbackData, ...decoded };
          } catch (e) {
            console.warn('[POS] Failed to parse data param:', e);
          }
        }
        
        console.log('[POS] Square callback received:', callbackData);
        
        // Set the callback result to show appropriate UI
        setSquareCallbackResult(callbackData);
        
        // Clear the URL parameters to prevent re-processing on refresh
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        
        // If payment was successful, reset checkout mode
        if (callbackData.status === 'ok' && transactionId) {
          console.log('[POS] Payment successful! Transaction ID:', transactionId);
          setCheckoutMode(false);
          setCheckoutItems([]);
          setCheckoutSubtotal(0);
          setCheckoutTabInfo(null);
          
          // Show success message briefly
          setTimeout(() => {
            setSquareCallbackResult(null);
          }, 5000);
        } else if (callbackData.status === 'error' || errorCode) {
          console.log('[POS] Payment failed or canceled:', errorCode);
          // Keep checkout mode active so user can retry
          // Clear callback result after showing message
          setTimeout(() => {
            setSquareCallbackResult(null);
          }, 5000);
        }
      }
    };
    
    // Parse on mount
    parseSquareCallback();
    
    // Also listen for popstate in case TWA navigates back
    window.addEventListener('popstate', parseSquareCallback);
    return () => window.removeEventListener('popstate', parseSquareCallback);
  }, []);
  
  // Checkout mode for horizontal view - when true, shows receipt/tipping screen instead of MenuGallery2
  // This state is synced via WebSocket so it works across different devices
  const [checkoutMode, setCheckoutMode] = useState(false);
  const [checkoutItems, setCheckoutItems] = useState([]);
  const [checkoutSubtotal, setCheckoutSubtotal] = useState(0);
  const [checkoutTabInfo, setCheckoutTabInfo] = useState(null);
  const [showCustomTip, setShowCustomTip] = useState(false); // Show custom tip input (local only)
  const [customTipAmount, setCustomTipAmount] = useState(''); // Custom tip in dollars (local only)
  const [showTabView, setShowTabView] = useState(false); // Toggle between tip view and receipt view
  
  // WebSocket handlers for checkout sync across devices
  const handleWsCheckoutStart = useCallback((data) => {
    console.log('[POS] WebSocket checkout_start received:', data);
    setCheckoutMode(true);
    setCheckoutItems(data.items || []);
    setCheckoutSubtotal(data.subtotal || 0);
    setCheckoutTabInfo(data.tabInfo || null);
    setShowCustomTip(false);
    setCustomTipAmount('');
    setShowTabView(false);
  }, []);
  
  const handleWsCheckoutComplete = useCallback((data) => {
    console.log('[POS] WebSocket checkout_complete received:', data);
    setCheckoutMode(false);
    setCheckoutItems([]);
    setCheckoutSubtotal(0);
    setCheckoutTabInfo(null);
  }, []);
  
  const handleWsCheckoutCancel = useCallback(() => {
    console.log('[POS] WebSocket checkout_cancel received');
    setCheckoutMode(false);
    setCheckoutItems([]);
    setCheckoutSubtotal(0);
    setCheckoutTabInfo(null);
  }, []);
  
  // Connect to WebSocket for cross-device checkout sync
  const { isConnected: wsConnected, sendCheckoutStart, sendCheckoutComplete, sendCheckoutCancel } = usePosWebSocket(
    handleWsCheckoutStart,
    handleWsCheckoutComplete,
    handleWsCheckoutCancel
  );
  
  // ============================================
  // SQUARE POS TEST MODE
  // When true: all items are $0.01, orders labeled as TEST
  // When false: real prices, production checkout
  // ============================================
  const [squareTestMode, setSquareTestMode] = useState(true);
  
  // Logo state - fetched from admin logo uploader
  const [logoUrl, setLogoUrl] = useState(null);
  
  // Ref for receipt container to scroll to bottom
  const receiptContainerRef = useRef(null);
  
  // Scroll receipt to bottom when tab view is shown
  useEffect(() => {
    if (showTabView && receiptContainerRef.current) {
      // Use setTimeout to ensure DOM has rendered
      setTimeout(() => {
        if (receiptContainerRef.current) {
          receiptContainerRef.current.scrollTop = receiptContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [showTabView]);
  
  const { apiCall } = useAuth();
  
  // On startup, sync with backend to check for active events
  // This handles the case where localStorage is out of sync with DB
  useEffect(() => {
    const syncWithBackend = async () => {
      try {
        const response = await apiCall('/pos-events/active');
        
        if (response && response.active && response.event) {
          // There's an active event in the DB
          const dbEvent = response.event;
          
          if (!eventId) {
            // localStorage has no event but DB does - restore it
            console.log(`[POS] Restoring active event from DB: ${dbEvent.name}`);
            startEvent(dbEvent._id, dbEvent.name);
          } else if (eventId !== dbEvent._id) {
            // localStorage has different event than DB - use DB's event
            console.log(`[POS] Syncing to DB event: ${dbEvent.name} (was: ${eventId})`);
            startEvent(dbEvent._id, dbEvent.name);
          }
          // If eventId matches dbEvent._id, we're already in sync
        } else {
          // No active event in DB
          if (eventId) {
            // localStorage has event but DB doesn't - clear localStorage
            console.log('[POS] No active event in DB - clearing localStorage');
            clearEvent();
          }
        }
      } catch (error) {
        console.error('[POS] Error syncing with backend:', error);
      }
    };
    
    syncWithBackend();
  }, [apiCall]); // Only run once on mount - don't include eventId/startEvent/clearEvent to avoid loops
  
  // Fetch logo from admin logo uploader
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const response = await apiCall('/media/logo');
        if (response && response.content && response.content.startsWith('https://res.cloudinary.com/')) {
          setLogoUrl(response.content);
        }
      } catch (error) {
        console.error('[POS] Error fetching logo:', error);
      }
    };
    fetchLogo();
  }, [apiCall]);

  // Fetch menu items
  useEffect(() => {
    const loadItems = async () => {
      setLoading(true);
      try {
        const data = await apiCall('/menu-items?includeArchived=true');
        
        // Default modifiers for Spirits category
        const defaultSpiritsModifiers = [
          { name: 'Shot', priceAdjustment: 0, isLink: false },
          { name: 'Single', priceAdjustment: 3, isLink: false },
          { name: 'Double', priceAdjustment: 5, isLink: false }
        ];
        
        const normalized = Array.isArray(data)
          ? data.map((item) => {
              const category = normalizeCategoryKey(item.category || item.section || 'cocktails');
              // Apply default modifiers for spirits if none exist
              const modifiers = (item.modifiers && item.modifiers.length > 0) 
                ? item.modifiers 
                : (category === 'spirits' ? defaultSpiritsModifiers : []);
              return {
                ...item,
                category,
                modifiers
              };
            })
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
      name: `P${nextTabNumber}`,
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

  // Update item modifiers (for editing flow) - persists to database
  const handleUpdateItemModifiers = useCallback(async (itemId, modifiers) => {
    // Update local state immediately
    setAllItems(prev => prev.map(item =>
      item._id === itemId
        ? { ...item, modifiers }
        : item
    ));
    
    // Persist to database
    try {
      await apiCall(`/menu-items/${itemId}/modifiers`, {
        method: 'PUT',
        body: { modifiers }
      });
      console.log(`[POS] Saved modifiers for item ${itemId} to database:`, modifiers);
    } catch (error) {
      console.error(`[POS] Failed to save modifiers for item ${itemId}:`, error);
    }
  }, [apiCall]);

  // ============================================
  // EVENT MANAGEMENT HANDLERS
  // ============================================

  /**
   * Handle header tap to reveal END EVENT button
   * Button auto-hides after 3 seconds if not clicked
   */
  const handleHeaderTap = useCallback(() => {
    // Clear any existing timeout
    if (endEventTimeoutRef.current) {
      clearTimeout(endEventTimeoutRef.current);
    }
    
    // Show the END EVENT button
    setShowEndEventButton(true);
    
    // Auto-hide after 3 seconds
    endEventTimeoutRef.current = setTimeout(() => {
      setShowEndEventButton(false);
    }, 3000);
  }, []);

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
      
      // Check if error is due to existing active event
      if (error.message && error.message.includes('active event already exists')) {
        // Try to get the active event info and offer options
        try {
          const activeResponse = await apiCall('/pos-events/active');
          if (activeResponse && activeResponse.active && activeResponse.event) {
            const activeEvent = activeResponse.event;
            const choice = window.confirm(
              `An active event "${activeEvent.name}" already exists.\n\n` +
              `Click OK to resume this event, or Cancel to end it and start a new one.`
            );
            
            if (choice) {
              // Resume the existing event
              startEvent(activeEvent._id, activeEvent.name);
              setShowEventModal(false);
              setNewEventName('');
              console.log(`[POS] Resumed existing event: ${activeEvent.name}`);
            } else {
              // End the existing event first, then start new one
              try {
                await apiCall(`/pos-events/${activeEvent._id}/end`, {
                  method: 'PUT',
                  body: { tabs: [] },
                });
                console.log(`[POS] Ended existing event: ${activeEvent.name}`);
                
                // Now try to start the new event again
                const newResponse = await apiCall('/pos-events', {
                  method: 'POST',
                  body: { name },
                });
                
                if (newResponse && newResponse._id) {
                  startEvent(newResponse._id, newResponse.name);
                  setShowEventModal(false);
                  setNewEventName('');
                  console.log(`[POS] Started new event: ${newResponse.name}`);
                }
              } catch (endError) {
                console.error('[POS] Failed to end existing event:', endError);
                alert(`Failed to end existing event: ${endError.message}`);
              }
            }
          }
        } catch (activeError) {
          console.error('[POS] Failed to get active event:', activeError);
          alert(`Failed to start event: ${error.message}`);
        }
      } else {
        alert(`Failed to start event: ${error.message}`);
      }
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
      
      // If the event is not active (already ended or doesn't exist), clear local state
      if (error.message && error.message.includes('not active')) {
        console.log('[POS] Event already ended - clearing local state');
        clearEvent();
        setShowEndEventModal(false);
      } else {
        alert(`Failed to end event: ${error.message}`);
      }
    } finally {
      setSyncing(false);
    }
  }, [apiCall, eventId, eventName, tabs, clearEvent]);

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

  /**
   * Handle checkout - Enter checkout mode to show tipping screen on horizontal view
   * 
   * CHECKOUT FLOW:
   * 1. User clicks CHECKOUT on vertical POS
   * 2. Horizontal view switches from MenuGallery2 to receipt/tipping screen
   * 3. Customer selects tip (15%, 20%, 25%, or custom)
   * 4. Tip selection triggers Square deep-link with total + tip
   */
  const handleCheckout = useCallback(() => {
    if (!activeTabId || selectedItems.length === 0) {
      alert('No items to checkout');
      return;
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) {
      alert('No active tab found');
      return;
    }

    console.log(`[POS Checkout] Entering checkout mode for tab ${activeTab.id} (${activeTab.customName || activeTab.name})`);
    
    const checkoutData = {
      items: [...selectedItems],
      subtotal: total,
      tabInfo: {
        id: activeTab.id,
        name: activeTab.customName || activeTab.name
      }
    };
    
    // Store checkout data locally for the tipping screen
    setCheckoutItems(checkoutData.items);
    setCheckoutSubtotal(checkoutData.subtotal);
    setCheckoutTabInfo(checkoutData.tabInfo);
    setShowCustomTip(false);
    setCustomTipAmount('');
    
    // Enter checkout mode locally
    setCheckoutMode(true);
    
    // Broadcast checkout start via WebSocket to sync horizontal view on other devices
    sendCheckoutStart(checkoutData);
    
    console.log(`[POS Checkout] Checkout mode activated. Subtotal: $${total.toFixed(2)}, Items: ${selectedItems.length}`);
  }, [activeTabId, selectedItems, tabs, total, sendCheckoutStart]);

  /**
   * Process payment with tip - Opens Square app via deep-link
   * Called when customer selects a tip option
   */
  const handleProcessPaymentWithTip = useCallback(async (tipAmount) => {
    if (!checkoutTabInfo || checkoutItems.length === 0) {
      alert('No checkout data');
      return;
    }

    const finalTotal = checkoutSubtotal + tipAmount;
    
    try {
      setCheckoutLoading(true);
      
      // ============================================
      // SQUARE POS CHECKOUT FLOW
      // ============================================
      const testModeLabel = squareTestMode ? '[TEST MODE] ' : '';
      console.log(`[POS Checkout] ${testModeLabel}Processing payment with tip`);
      console.log(`[POS Checkout] Subtotal: $${checkoutSubtotal.toFixed(2)}, Tip: $${tipAmount.toFixed(2)}, Total: $${finalTotal.toFixed(2)}`);

      // Prepare checkout data for Square order creation
      const checkoutData = {
        tabId: checkoutTabInfo.id,
        tabName: checkoutTabInfo.name,
        items: checkoutItems.map(item => ({
          name: item.name,
          quantity: 1,
          price: item.price || 0,
          modifier: item.modifier || null,
          category: item.category
        })),
        total: finalTotal,
        testMode: squareTestMode  // TEST_MODE flag
      };

      // Get Square location ID
      const locationResponse = await apiCall('/square/location');
      if (!locationResponse || !locationResponse.locationId) {
        throw new Error('Square location not configured');
      }
      
      // Calculate total in cents (with tip included)
      const totalCents = squareTestMode 
        ? checkoutItems.length  // $0.01 per item in test mode
        : Math.round(finalTotal * 100);
      
      // Store checkout result
      setLastCheckoutResult({
        success: true,
        locationId: locationResponse.locationId,
        testMode: squareTestMode,
        totalCents: totalCents,
        tipAmount: tipAmount,
        tabId: checkoutTabInfo.id,
        tabName: checkoutTabInfo.name
      });
      
      // ============================================
      // OPEN SQUARE APP VIA DEEP-LINK
      // Using square-commerce-v1:// scheme for TWA compatibility
      // Callback uses custom scheme echocatering:// for reliable return
      // ============================================
      const clientId = process.env.REACT_APP_SQUARE_CLIENT_ID;
      
      // Custom callback URL using echocatering:// scheme for TWA intent filter
      // This ensures Android routes the callback back to the TWA app, not Chrome
      const callbackUrl = 'echocatering://square-callback';
      
      console.log(`[POS Checkout] CLIENT_ID:`, clientId);
      console.log(`[POS Checkout] Location ID:`, locationResponse.locationId);
      console.log(`[POS Checkout] Total cents (with tip):`, totalCents);
      console.log(`[POS Checkout] Callback URL:`, callbackUrl);
      
      if (!clientId || clientId === 'sq0idp-') {
        console.error('[POS Checkout] Missing REACT_APP_SQUARE_CLIENT_ID');
        alert('Error: Square Client ID not configured. Please add REACT_APP_SQUARE_CLIENT_ID to environment variables.');
        return;
      }
      
      // Build Square POS payment data object
      const squarePaymentData = {
        amount_money: {
          amount: totalCents,
          currency_code: 'USD'
        },
        callback_url: callbackUrl,
        client_id: clientId,
        version: '1.3',
        notes: `Tab: ${checkoutTabInfo.name}${squareTestMode ? ' [TEST]' : ''}`,
        location_id: locationResponse.locationId,
        options: {
          supported_tender_types: ['CREDIT_CARD', 'CASH', 'OTHER', 'SQUARE_GIFT_CARD', 'CARD_ON_FILE']
        },
        state: JSON.stringify({
          tabId: checkoutTabInfo.id,
          tabName: checkoutTabInfo.name,
          testMode: squareTestMode,
          tipAmount: tipAmount,
          items: checkoutItems.map(i => ({ name: i.name, modifier: i.modifier, price: i.price }))
        })
      };
      
      // Encode payment data as base64 for the deep link
      const encodedData = btoa(JSON.stringify(squarePaymentData));
      const deepLinkUrl = `square-commerce-v1://payment/create?data=${encodedData}`;
      
      console.log(`[POS Checkout] Square payment data:`, squarePaymentData);
      console.log(`[POS Checkout] Opening Square POS app:`, deepLinkUrl);
      
      // Open Square app via deep-link immediately (no alert to avoid blocking)
      window.location.href = deepLinkUrl;
      
      // Broadcast checkout complete via WebSocket to reset horizontal view on other devices
      sendCheckoutComplete({ tipAmount, finalTotal, tabId: checkoutTabInfo.id });
      
      // Exit checkout mode after a delay (user is now in Square app)
      setTimeout(() => {
        setCheckoutMode(false);
        setCheckoutLoading(false);
      }, 2000);

    } catch (error) {
      console.error('[POS Checkout] Error:', error);
      alert(`Checkout failed: ${error.message}`);
      setCheckoutLoading(false);
    }
  }, [checkoutTabInfo, checkoutItems, checkoutSubtotal, apiCall, squareTestMode, sendCheckoutComplete]);

  const handleItemClick = useCallback((item, modifierData = null) => {
    const timestamp = new Date().toISOString();
    const modifierName = typeof modifierData === 'string' ? modifierData : modifierData?.name;
    const modifierPrice = typeof modifierData === 'object' && modifierData !== null && modifierData.priceAdjustment !== undefined ? Number(modifierData.priceAdjustment) : 0;
    console.log(`[POS] Item clicked: "${item.name}"${modifierName ? ` with modifier: "${modifierName}"` : ''} at ${timestamp}`);
    console.log(`[POS] DEBUG - item.price: ${item.price}, modifierData:`, modifierData);
    
    // If no active tab, auto-create one first
    let targetTabId = activeTabId;
    if (!targetTabId) {
      const newTab = {
        id: `tab-${Date.now()}`,
        name: `P${nextTabNumber}`,
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
    
    // Update last action with tab name
    const actionName = modifierName ? `${toTitleCase(item.name)} ${modifierName}` : toTitleCase(item.name);
    const targetTab = tabs.find(t => t.id === targetTabId);
    const tabDisplayName = targetTab?.customName || targetTab?.name || '';
    setLastAction({ type: 'add', itemName: actionName, tabName: tabDisplayName });
  }, [activeTabId, nextTabNumber, tabs]);

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
    
    // Update last action with tab name
    const tabDisplayName = activeTab?.customName || activeTab?.name || '';
    setLastAction({ type: 'remove', itemName: toTitleCase(itemToRemove.name), tabName: tabDisplayName });
  }, [activeTabId, tabs]);

  const handleMoveItems = useCallback((fromTabId, toTabId, indices) => {
    if (!fromTabId || !toTabId || indices.length === 0) return;
    
    const fromTab = tabs.find(t => t.id === fromTabId);
    const toTab = tabs.find(t => t.id === toTabId);
    if (!fromTab || !toTab) return;
    
    // Get items to move (sorted indices in reverse to remove from end first)
    const sortedIndices = [...indices].sort((a, b) => b - a);
    const itemsToMove = indices.map(i => fromTab.items[i]).filter(Boolean);
    
    if (itemsToMove.length === 0) return;
    
    console.log(`[POS] Moving ${itemsToMove.length} items from ${fromTab.name} to ${toTab.name}`);
    
    setTabs(prev => prev.map(tab => {
      if (tab.id === fromTabId) {
        // Remove items from source tab
        const newItems = tab.items.filter((_, i) => !indices.includes(i));
        return { ...tab, items: newItems };
      }
      if (tab.id === toTabId) {
        // Add items to destination tab
        return { ...tab, items: [...tab.items, ...itemsToMove] };
      }
      return tab;
    }));
    
    // Update last action
    const fromTabName = fromTab?.customName || fromTab?.name || '';
    const toTabName = toTab?.customName || toTab?.name || '';
    setLastAction({ type: 'move', itemName: `${itemsToMove.length} item${itemsToMove.length > 1 ? 's' : ''}`, tabName: `${fromTabName} → ${toTabName}` });
  }, [tabs]);

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

  // ============================================
  // HORIZONTAL VIEW (CUSTOMER-FACING)
  // When orientation is horizontal and layoutMode is 'auto':
  // - If checkoutMode is true: show receipt/tipping screen
  // - Otherwise: show MenuGallery2
  // ============================================
  if (layoutMode === 'auto' && orientation === 'horizontal') {
    // CHECKOUT MODE: Show receipt with tip options (Square-style light theme)
    if (checkoutMode && checkoutItems.length > 0) {
      const tipPercentages = [
        { label: '15%', value: 0.15 },
        { label: '20%', value: 0.20 },
        { label: '25%', value: 0.25 },
      ];
      
      return (
        <div style={{ 
          width: '100vw', 
          height: '100vh', 
          overflow: 'hidden', 
          background: 'linear-gradient(to top, rgba(179, 179, 179, 1) 0%, rgba(185, 185, 185, 1) 8%, rgba(210, 210, 210, 1) 25%, rgba(240, 240, 240, 1) 50%, rgba(255, 255, 255, 1) 70%)',
          display: 'flex',
          flexDirection: 'column',
          color: '#333',
        }} className="pos-horizontal-checkout">
          {/* Header with logo - white background, no border */}
          <div style={{
            padding: '24px 36px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            minHeight: '102px',
            boxSizing: 'border-box',
          }}>
            {logoUrl && (
              <img 
                src={logoUrl} 
                alt="Echo" 
                style={{ height: '54px', width: 'auto' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
          </div>
          
          {/* Main Content Container - fixed height between header and footer */}
          <div style={{
            height: 'calc(100vh - 204px)',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '16px 20px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}>
            {/* Inner container for all screens */}
            <div style={{
              width: '100%',
              maxWidth: '600px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              overflow: 'hidden',
            }}>
              {!showTabView ? (
                /* TIP VIEW or KEYPAD VIEW - fills container height */
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                }}>
                  {/* Large Total Display */}
                  <div style={{ textAlign: 'center', marginBottom: '1vh', flexShrink: 0 }}>
                    <div style={{ fontSize: 'clamp(28px, 5vh, 42px)', fontWeight: '700', color: '#333' }}>
                      ${checkoutSubtotal.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 'clamp(12px, 1.8vh, 16px)', color: '#888', marginTop: '0.3vh' }}>
                      Add a tip
                    </div>
                  </div>
                  
                  {/* Content area - flex grows to fill */}
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
                    {!showCustomTip ? (
                      <>
                        {/* Tip percentage buttons - horizontal row - takes up most space */}
                        <div style={{ display: 'flex', gap: 'clamp(8px, 1.5vw, 16px)', width: '100%', flex: 2 }}>
                          {tipPercentages.map(({ label, value }) => {
                            const tipAmount = checkoutSubtotal * value;
                            return (
                              <button
                                key={label}
                                onClick={() => handleProcessPaymentWithTip(tipAmount)}
                                disabled={checkoutLoading}
                                style={{
                                  flex: 1,
                                  fontSize: 'clamp(12px, 2vh, 16px)',
                                  background: '#fff',
                                  color: '#800080',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '8px',
                                  cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '1vh',
                                  opacity: checkoutLoading ? 0.6 : 1,
                                }}
                              >
                                <span style={{ fontSize: 'clamp(28px, 6vh, 44px)', fontWeight: '400' }}>{label}</span>
                                <span style={{ fontSize: 'clamp(16px, 3vh, 22px)', color: '#666' }}>${tipAmount.toFixed(2)}</span>
                              </button>
                            );
                          })}
                        </div>
                        
                        {/* Custom Tip Amount button */}
                        <button
                          onClick={() => setShowCustomTip(true)}
                          disabled={checkoutLoading}
                          style={{
                            width: '100%',
                            flex: 1,
                            fontSize: 'clamp(16px, 3vh, 22px)',
                            fontWeight: '600',
                            background: '#fff',
                            color: '#800080',
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          Custom Tip Amount
                        </button>
                        
                        {/* No Tip button */}
                        <button
                          onClick={() => handleProcessPaymentWithTip(0)}
                          disabled={checkoutLoading}
                          style={{
                            width: '100%',
                            flex: 1,
                            fontSize: 'clamp(16px, 3vh, 22px)',
                            fontWeight: '600',
                            background: '#fff',
                            color: '#800080',
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          No Tip
                        </button>
                      </>
                    ) : (
                      /* Custom tip input with number pad */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(4px, 0.8vh, 8px)', width: '100%', flex: 1 }}>
                        {/* Display area */}
                        <div style={{
                          width: '100%',
                          padding: 'clamp(6px, 1vh, 12px)',
                          fontSize: 'clamp(20px, 3.5vh, 32px)',
                          fontWeight: '500',
                          background: '#fff',
                          color: '#333',
                          border: '1px solid #e0e0e0',
                          borderRadius: '8px',
                          boxSizing: 'border-box',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          ${customTipAmount || '0'}
                        </div>
                        
                        {/* Show calculated total */}
                        <div style={{ textAlign: 'center', fontSize: 'clamp(12px, 1.8vh, 16px)', color: '#666' }}>
                          Total: ${(checkoutSubtotal + (parseFloat(customTipAmount) || 0)).toFixed(2)}
                        </div>
                        
                        {/* Number pad */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3px, 0.6vh, 6px)', flex: 1 }}>
                          {/* Row 1: 1, 2, 3 */}
                          <div style={{ display: 'flex', gap: 'clamp(3px, 0.6vh, 6px)', flex: 1 }}>
                            {['1', '2', '3'].map((num) => (
                              <button
                                key={num}
                                onClick={() => setCustomTipAmount(prev => prev + num)}
                                style={{
                                  flex: 1,
                                  fontSize: 'clamp(16px, 2.5vh, 22px)',
                                  fontWeight: '600',
                                  background: '#fff',
                                  color: '#333',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                          {/* Row 2: 4, 5, 6 */}
                          <div style={{ display: 'flex', gap: 'clamp(3px, 0.6vh, 6px)', flex: 1 }}>
                            {['4', '5', '6'].map((num) => (
                              <button
                                key={num}
                                onClick={() => setCustomTipAmount(prev => prev + num)}
                                style={{
                                  flex: 1,
                                  fontSize: 'clamp(16px, 2.5vh, 22px)',
                                  fontWeight: '600',
                                  background: '#fff',
                                  color: '#333',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                          {/* Row 3: 7, 8, 9 */}
                          <div style={{ display: 'flex', gap: 'clamp(3px, 0.6vh, 6px)', flex: 1 }}>
                            {['7', '8', '9'].map((num) => (
                              <button
                                key={num}
                                onClick={() => setCustomTipAmount(prev => prev + num)}
                                style={{
                                  flex: 1,
                                  fontSize: 'clamp(16px, 2.5vh, 22px)',
                                  fontWeight: '600',
                                  background: '#fff',
                                  color: '#333',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                          {/* Row 4: Undo, 0, Check */}
                          <div style={{ display: 'flex', gap: 'clamp(3px, 0.6vh, 6px)', flex: 1 }}>
                            {/* Undo button */}
                            <button
                              onClick={() => setCustomTipAmount(prev => prev.slice(0, -1))}
                              style={{
                                flex: 1,
                                fontSize: 'clamp(14px, 2vh, 18px)',
                                fontWeight: '600',
                                background: '#fff',
                                color: '#666',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <img 
                                src="/assets/icons/backspace.svg" 
                                alt="Backspace" 
                                style={{ width: 'clamp(24px, 4vh, 36px)', height: 'clamp(24px, 4vh, 36px)' }}
                              />
                            </button>
                            {/* 0 button */}
                            <button
                              onClick={() => setCustomTipAmount(prev => prev + '0')}
                              style={{
                                flex: 1,
                                fontSize: 'clamp(16px, 2.5vh, 22px)',
                                fontWeight: '600',
                                background: '#fff',
                                color: '#333',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              0
                            </button>
                            {/* Green check button */}
                            <button
                              onClick={() => handleProcessPaymentWithTip(parseFloat(customTipAmount) || 0)}
                              disabled={checkoutLoading}
                              style={{
                                flex: 1,
                                fontSize: 'clamp(16px, 2.5vh, 22px)',
                                fontWeight: '600',
                                background: checkoutLoading ? '#ccc' : '#fff',
                                color: '#22c55e',
                                border: '1px solid #e0e0e0',
                                borderRadius: '8px',
                                cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <img 
                                src="/assets/icons/check.svg" 
                                alt="Confirm" 
                                style={{ width: 'clamp(20px, 3.5vh, 32px)', height: 'clamp(20px, 3.5vh, 32px)', filter: 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(86deg) brightness(95%) contrast(90%)' }}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* View Tab / Back button - always at bottom */}
                  <button
                    onClick={() => {
                      if (showCustomTip) {
                        setShowCustomTip(false);
                        setCustomTipAmount('');
                      } else {
                        setShowTabView(true);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '16px',
                      fontWeight: '600',
                      background: 'transparent',
                      color: '#666',
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginTop: '8px',
                    }}
                  >
                    {showCustomTip ? 'Back' : 'View Tab'}
                  </button>
                </div>
              ) : (
                /* TAB VIEW - Receipt with items - fills container */
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                }}>
                  {/* Receipt container - scrollable items inside */}
                  <div style={{
                    width: '100%',
                    flex: 1,
                    minHeight: 0,
                    background: '#fff',
                    borderRadius: '8px',
                    padding: '16px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}>
                    {/* Items list - ONLY this scrolls */}
                    <div ref={receiptContainerRef} style={{
                      flex: 1,
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      minHeight: 0,
                      WebkitOverflowScrolling: 'touch',
                      touchAction: 'pan-y',
                    }}>
                      {checkoutItems.map((item, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '10px 0',
                          borderBottom: idx < checkoutItems.length - 1 ? '1px solid #e0e0e0' : 'none',
                          fontSize: '16px',
                        }}>
                          <span style={{ color: '#333' }}>
                            {(item.name || '').toUpperCase()}
                            {item.modifier && <span style={{ color: '#888', marginLeft: '6px' }}>({item.modifier})</span>}
                          </span>
                          <span style={{ fontWeight: '500', color: '#333' }}>${(item.price || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Total - always visible at bottom of receipt */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '12px 0 0 0',
                      marginTop: '8px',
                      borderTop: '2px solid #333',
                      fontSize: '18px',
                      fontWeight: '600',
                      color: '#333',
                      flexShrink: 0,
                    }}>
                      <span>Total</span>
                      <span>${checkoutSubtotal.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  {/* Back button - always visible at bottom */}
                  <button
                    onClick={() => setShowTabView(false)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '16px',
                      fontWeight: '600',
                      background: 'transparent',
                      color: '#666',
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginTop: '8px',
                    }}
                  >
                    Back
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Empty footer - same size as header */}
          <div style={{
            padding: '24px 36px',
            background: 'transparent',
            minHeight: '102px',
            boxSizing: 'border-box',
            flexShrink: 0,
          }} />
        </div>
      );
    }
    
    // DEFAULT: Show MenuGallery2
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        overflow: 'hidden', 
        background: '#000',
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
      }}>
        <MenuGallery2 
          viewMode="menu"
          orientationOverride="horizontal"
        />
      </div>
    );
  }

  // ============================================
  // VERTICAL VIEW (POS ADMIN INTERFACE)
  // When layoutMode is forced (not 'auto'), OR when layoutMode is 'auto' with vertical orientation
  // we're in standalone mode - render POSContent directly filling the viewport without the viewer wrapper
  // ============================================
  const isStandalone = layoutMode !== 'auto' || (layoutMode === 'auto' && orientation === 'vertical');

  // Standalone mode: render POSContent directly filling the viewport
  if (isStandalone) {
    // If showing summary view after event end
    if (showSummaryView && eventSummary) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header with logo - matching POS UI */}
          <div style={{
            background: '#fff',
            padding: '8px 16px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            {logoUrl && (
              <img 
                src={logoUrl} 
                alt="Echo" 
                style={{ 
                  height: '32px', 
                  width: 'auto',
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
          </div>
          
          {/* Summary content */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px',
          }}>
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h1 style={{ fontSize: '24px', marginBottom: '20px', textAlign: 'center', color: '#333' }}>
                Event Summary
              </h1>
              
              {/* Totals */}
              <div style={{
                background: '#f5f5f5',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                border: '1px solid #e0e0e0',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4CAF50' }}>
                      ${(eventSummary.totalRevenue || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Total Revenue</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196F3' }}>
                      {eventSummary.totalItems || 0}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>Total Items</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
                    {eventSummary.totalTabs || 0}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>Total Tabs</div>
                </div>
              </div>
              
              {/* Category Breakdown */}
              <div style={{
                background: '#f5f5f5',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                border: '1px solid #e0e0e0',
              }}>
                <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#333' }}>By Category</h2>
                {eventSummary.categoryBreakdown && Object.entries(
                  eventSummary.categoryBreakdown instanceof Map 
                    ? Object.fromEntries(eventSummary.categoryBreakdown)
                    : eventSummary.categoryBreakdown
                ).map(([cat, data]) => (
                  <div key={cat} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #ddd',
                    color: '#333',
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
                  background: '#f5f5f5',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '20px',
                  border: '1px solid #e0e0e0',
                }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#333' }}>Timeline (15-min intervals)</h2>
                  {eventSummary.timelineBreakdown.map((interval, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid #ddd',
                      color: '#333',
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
              
              {/* Home Button */}
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
                HOME
              </button>
            </div>
          </div>
        </div>
      );
    }

    // If no active event, show start event screen
    if (!eventId) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header with logo - matching POS UI */}
          <div style={{
            background: '#fff',
            padding: '8px 16px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            {logoUrl && (
              <img 
                src={logoUrl} 
                alt="Echo" 
                style={{ 
                  height: '32px', 
                  width: 'auto',
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
          </div>
          
          {/* Start event form - centered */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}>
            <div style={{
              maxWidth: '400px',
              width: '100%',
            }}>
              <h1 style={{ color: '#333', fontSize: '24px', marginBottom: '24px', textAlign: 'center' }}>
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
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  background: '#fff',
                  color: '#333',
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
                  background: syncing ? '#ccc' : '#800080',
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
        </div>
      );
    }

    // Active event: show POS UI with event header
    // Header height for positioning calculations - exported to POSContent via prop
    const eventHeaderHeight = 50;
    
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Event Header Bar - tap to reveal END EVENT button */}
        <div 
          onClick={handleHeaderTap}
          style={{
            background: '#fff',
            color: '#333',
            padding: '8px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            height: `${eventHeaderHeight}px`,
            boxSizing: 'border-box',
            borderBottom: '1px solid #e0e0e0',
            cursor: 'pointer',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Left side: Logo */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {logoUrl && (
              <img 
                src={logoUrl} 
                alt="Echo" 
                style={{ 
                  height: '32px', 
                  width: 'auto',
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
          </div>
          
          {/* Center: TEST MODE toggle */}
          <button
            onClick={() => setSquareTestMode(prev => !prev)}
            style={{
              background: squareTestMode ? '#ff9800' : '#4caf50',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginRight: '12px',
            }}
          >
            {squareTestMode ? 'TEST' : 'LIVE'}
          </button>
          
          {/* Right side: Event name/time OR End Event button */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            position: 'relative',
            height: '100%',
          }}>
            {/* Event name and time OR Payment Processing indicator */}
            <div style={{ 
              fontSize: '14px',
              textAlign: 'right',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              opacity: showEndEventButton ? 0 : 1,
              transform: showEndEventButton ? 'translateX(20px)' : 'translateX(0)',
              pointerEvents: showEndEventButton ? 'none' : 'auto',
            }}>
              {checkoutMode ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: 'bold', color: '#800080' }}>PAYMENT PROCESSING</span>
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid #e0e0e0',
                    borderTopColor: '#800080',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                <>
                  <span style={{ fontWeight: 'bold', color: '#333' }}>{eventName}</span>
                  {eventStarted && (
                    <span style={{ color: '#666', marginLeft: '8px' }}>
                      {new Date(eventStarted).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </>
              )}
            </div>
            
            {/* End Event button - slides in from right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (endEventTimeoutRef.current) {
                  clearTimeout(endEventTimeoutRef.current);
                }
                setShowEndEventButton(false);
                setShowEndEventModal(true);
              }}
              style={{
                position: 'absolute',
                right: 0,
                background: '#c62828',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                opacity: showEndEventButton ? 1 : 0,
                transform: showEndEventButton ? 'translateX(0)' : 'translateX(50px)',
                pointerEvents: showEndEventButton ? 'auto' : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              END EVENT
            </button>
          </div>
        </div>

        {/* POS Content */}
        <div 
          ref={frameRef}
          style={{ 
            flex: 1, 
            overflow: 'hidden',
            width: '100%',
            background: '#fff',
          }}
        >
          {frameReady ? (
            <POSContent
              outerWidth={frameSize.width}
              outerHeight={frameSize.height}
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
              onMoveItems={handleMoveItems}
              onCheckout={handleCheckout}
              checkoutLoading={checkoutLoading}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
            }}>
              Loading POS...
            </div>
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

        {/* Checkout Success Overlay */}
        {showCheckoutSuccess && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,128,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}>
            <div style={{ textAlign: 'center', color: '#fff' }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>✓</div>
              <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>Payment Successful</h2>
              {lastCheckoutResult && (
                <p style={{ fontSize: '18px', opacity: 0.9 }}>
                  ${(lastCheckoutResult.totalCharged?.amount / 100).toFixed(2)} charged
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* Square Callback Result Overlay (TWA return flow) */}
        {squareCallbackResult && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: squareCallbackResult.status === 'ok' ? 'rgba(0,128,0,0.95)' : 'rgba(200,50,50,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}>
            <div style={{ textAlign: 'center', color: '#fff', padding: '20px' }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>
                {squareCallbackResult.status === 'ok' ? '✓' : '✕'}
              </div>
              <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>
                {squareCallbackResult.status === 'ok' ? 'Payment Successful' : 'Payment Canceled'}
              </h2>
              {squareCallbackResult.transactionId && (
                <p style={{ fontSize: '14px', opacity: 0.8, marginBottom: '10px' }}>
                  Transaction: {squareCallbackResult.transactionId}
                </p>
              )}
              {squareCallbackResult.errorCode && (
                <p style={{ fontSize: '14px', opacity: 0.8 }}>
                  {squareCallbackResult.errorCode === 'payment_canceled' ? 'Payment was canceled' : `Error: ${squareCallbackResult.errorCode}`}
                </p>
              )}
              <button
                onClick={() => setSquareCallbackResult(null)}
                style={{
                  marginTop: '20px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  fontWeight: '600',
                  background: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  border: '2px solid #fff',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                {squareCallbackResult.status === 'ok' ? 'Continue' : 'Try Again'}
              </button>
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
                onMoveItems={handleMoveItems}
                onCheckout={handleCheckout}
                checkoutLoading={checkoutLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
