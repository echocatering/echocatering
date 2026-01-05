import React, { useRef, useState, useEffect, useMemo } from 'react';
import MenuGallery2 from '../../pages/menuGallery2';
import FullMenu from './FullMenu';
import { fetchLogo } from '../../utils/logoUtils';

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

// Shared state and data for POS pages
const packages = [
  {
    id: 'beer-wine',
    title: 'Beer + Wine',
    description: '6 Beers\n3 White + 3 Red\nmax',
    price: '$14pp/hr',
    priceAfterTwoHours: null
  },
  {
    id: 'mocktails',
    title: 'Mocktails',
    description: '6 Mocktails\nmax',
    price: '$18pp/hr',
    priceAfterTwoHours: null
  },
  {
    id: 'cocktails-mocktails',
    title: 'Cocktails + Mocktails',
    description: '8 Cocktails + Mocktails\nmax',
    price: '$22pp/hr',
    priceAfterTwoHours: '$18pp/hr after two hours'
  },
  {
    id: 'all-inclusive',
    title: 'All Inclusive',
    description: '8 Cocktails + Mocktails\n6 Beers + 3 White + 3 Red\nmax',
    price: '$30pp/hr',
    priceAfterTwoHours: '$28pp/hr after two hours'
  }
];

const allAddOns = {
  1: { title: 'Basic Brews', description: '+3 Beers', descriptionLine2: 'of your choice', price: '$2pp/hr' },
  2: { title: 'Master Brewer', description: '+6 Beers', descriptionLine2: 'of your choice', price: '$4pp/hr' },
  3: { title: 'House Wine', description: '+1 Red +1 White', descriptionLine2: 'of your choice', price: '$2pp/hr' },
  4: { title: 'Sommelier', description: '+3 Red +3 White', descriptionLine2: 'of your choice', price: '$4pp/hr' },
  7: { title: 'Custom Mocktail', description: '+1 Custom Mocktail', descriptionLine2: 'designed for you', price: '$2pp/hr' },
  8: { title: 'Custom Cocktail', description: '+1 Custom Cocktail', descriptionLine2: 'designed for you', price: '$3pp/hr' }
};

// TYPE Page Component
function TypePage({ outerWidth, outerHeight, orientation, selectedPackage, setSelectedPackage, numberOfPeople, setNumberOfPeople, eventDate, setEventDate, hoveredPackage, setHoveredPackage, focusedInput, setFocusedInput, setCurrentPage }) {
  // State for calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [dateInputValue, setDateInputValue] = useState('');
  const calendarRef = useRef(null);
  
  // Sync dateInputValue with eventDate
  useEffect(() => {
    setDateInputValue(formatDateForDisplay(eventDate));
  }, [eventDate]);
  
  // Calculate font sizes based on container dimensions - hooks must be called before any returns
  const baseFontSize = useMemo(() => {
    return Math.max(0.5, Math.min(3, outerHeight / 200));
  }, [outerHeight]);

  // Format YYYY-MM-DD to MM/DD/YYYY for display
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };
  
  // Parse MM/DD/YYYY to YYYY-MM-DD
  const parseDateInput = (inputStr) => {
    if (!inputStr) return '';
    const parts = inputStr.split('/');
    if (parts.length !== 3) return '';
    const [month, day, year] = parts;
    if (month.length === 2 && day.length === 2 && year.length === 4) {
      return `${year}-${month}-${day}`;
    }
    return '';
  };
  
  // Handle date input change with auto-formatting
  const handleDateInputChange = (e) => {
    let value = e.target.value.replace(/[^\d/]/g, '');
    
    // Auto-format as user types
    if (value.length > 2 && value[2] !== '/') {
      value = value.slice(0, 2) + '/' + value.slice(2);
    }
    if (value.length > 5 && value[5] !== '/') {
      value = value.slice(0, 5) + '/' + value.slice(5);
    }
    
    // Limit to MM/DD/YYYY format
    if (value.length <= 10) {
      setDateInputValue(value);
      const parsed = parseDateInput(value);
      if (parsed || value === '') {
        setEventDate(parsed);
      }
      // Keep text black when typing
      e.target.style.color = '#000000';
    }
  };
  
  // Handle calendar date selection
  const handleCalendarDateSelect = (year, month, day) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setEventDate(dateStr);
    setShowCalendar(false);
  };
  
  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendar]);

  // Add CSS for date field selection highlight and placeholder styling
  useEffect(() => {
    const styleId = 'pos-input-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        input[type="text"]::placeholder {
          color: #666666 !important;
        }
        input[type="text"]::-webkit-input-placeholder {
          color: #666666 !important;
        }
        input[type="text"]::-moz-placeholder {
          color: #666666 !important;
        }
        input[type="text"]:-ms-input-placeholder {
          color: #666666 !important;
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      // Cleanup not needed as style persists
    };
  }, []);

  const handleNumberOfPeopleChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setNumberOfPeople(value);
    }
  };

  // Calculate dimensions based on outerHeight
  const innerContainerHeight = outerHeight;
  const titleFontSize = innerContainerHeight / 16;
  const titleTopPosition = innerContainerHeight / 4;
  const boxHeight = innerContainerHeight / 3;
  const boxWidth = innerContainerHeight / 3;
  const labelFontSize = innerContainerHeight / 32;
  const fieldWidth = (innerContainerHeight * 4) / 9;
  const fieldHeight = innerContainerHeight / 16;
  const fieldFontSize = innerContainerHeight / 24;
  // Calculate spacing: equal space between fields and from edges
  // Use a fraction of inner container height for consistent spacing
  const fieldSpacing = innerContainerHeight / 32;
  const fieldGap = innerContainerHeight / 9; // Gap between fields is 1/9 of inner container height
  // Position container so input fields are 1/4 height from bottom
  // Account for label height + gap + input height
  // Gap is 1% of field container, estimate as small fixed value
  const estimatedGap = innerContainerHeight * 0.015; // Small gap estimate
  const fieldsBottomPosition = innerContainerHeight / 4 - fieldHeight - estimatedGap - labelFontSize;

  // Vertical layout dimensions
  const verticalTitleFontSize = outerHeight / 20;
  const verticalInnerContainerHeight = outerHeight;
  const verticalTitleTopPosition = (verticalInnerContainerHeight * 3) / 32;
  const verticalBoxGap = outerWidth * 0.08;
  const verticalSidePadding = outerWidth * 0.05; // Padding on each side
  // Calculate max box width: (total width - 2*padding - gap) / 2
  const verticalBoxWidth = (outerWidth - (verticalSidePadding * 2) - verticalBoxGap) / 2;
  const verticalBoxHeight = outerWidth / 2;
  const verticalLabelFontSize = outerHeight / 40;
  const verticalFieldWidth = outerWidth * 0.7;
  const verticalFieldHeight = outerHeight / 20;
  const verticalFieldFontSize = outerHeight / 35;
  const verticalFieldGap = outerHeight / 50;
  const verticalFieldsBottom = outerHeight / 16; // Group positioned 1/16 height from bottom
  const verticalGridTop = outerHeight / 6; // Top row at 1/6 height from top

  // Vertical view layout
  if (orientation !== 'horizontal') {
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      background: '#fff',
      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: `${baseFontSize}rem`,
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Gradient overlay - bottom half only */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
            background: 'linear-gradient(to top, rgba(105, 90, 78, 0.6) 0%, rgba(105, 90, 78, 0.5) 16%, rgba(105, 90, 78, 0.4) 32%, rgba(105, 90, 78, 0.25) 56%, rgba(105, 90, 78, 0.12) 80%, rgba(105, 90, 78, 0.04) 90%, rgba(105, 90, 78, 0.02) 94%, rgba(105, 90, 78, 0.01) 97%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      <div 
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          background: 'transparent',
          position: 'relative',
          zIndex: 2
        }}
      >
        {/* Title */}
        <h1 
          style={{
              fontSize: `${verticalTitleFontSize}px`,
            fontWeight: 300,
            textAlign: 'center',
            margin: 0,
              padding: 0,
              position: 'absolute',
              top: `${verticalTitleTopPosition - verticalTitleFontSize / 2}px`,
              left: 0,
              right: 0,
              width: '100%',
            background: 'linear-gradient(to bottom, #1a1a1a, #888)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
          }}
        >
          Begin your experience
        </h1>

          {/* Package Selection Boxes - 2x2 Grid */}
        <div 
          style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              gap: `${verticalBoxGap}px`,
              position: 'absolute',
              top: `${verticalGridTop}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              width: `${verticalBoxWidth * 2 + verticalBoxGap}px`,
              height: `${verticalBoxHeight * 2 + verticalBoxGap}px`
          }}
        >
          {packages.map((pkg) => {
            return (
              <div
                key={pkg.id}
                style={{
                    position: 'relative',
                    height: `${verticalBoxHeight}px`,
                    width: `${verticalBoxWidth}px`,
                    flexShrink: 0
                }}
              >
                <button
                  onClick={() => setSelectedPackage(pkg.id)}
                  style={{
                    width: '100%',
                    height: '100%',
                      border: 'none',
                      borderRadius: 0,
                      backgroundColor: 'transparent',
                    padding: '3% 1.5%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2%',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    color: selectedPackage === pkg.id ? '#000' : '#333',
                    transform: (hoveredPackage === pkg.id || selectedPackage === pkg.id) ? 'scale(1.05)' : 'scale(1)',
                    zIndex: (hoveredPackage === pkg.id || selectedPackage === pkg.id) ? 10 : 1,
                    position: 'relative',
                      boxShadow: 'none',
                      opacity: (selectedPackage === pkg.id || hoveredPackage === pkg.id) ? 1 : (selectedPackage && selectedPackage !== pkg.id) ? 0.5 : 1,
                      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                  }}
                  onMouseEnter={() => setHoveredPackage(pkg.id)}
                  onMouseLeave={() => setHoveredPackage(null)}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      justifyContent: 'space-between',
                      gap: '3%',
                      width: '100%'
                    }}
                  >
                      {/* Section 1: Icon - On Top */}
                    <div 
                      style={{ 
                          display: hoveredPackage === pkg.id ? 'none' : 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          height: `${innerContainerHeight / 5}px`,
                          flexShrink: 0
                        }}
                      >
                        {(() => {
                          const iconMap = {
                            'beer-wine': '/assets/icons/beer&wine-01.png',
                            'mocktails': '/assets/icons/mocktail-01.png',
                            'cocktails-mocktails': '/assets/icons/cocktail-01.png',
                            'all-inclusive': '/assets/icons/everything-01.png'
                          };
                          const iconPath = iconMap[pkg.id];
                          return iconPath ? (
                            <img 
                              src={iconPath} 
                              alt={pkg.title}
                              style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain'
                              }}
                            />
                          ) : null;
                        })()}
      </div>

                      {/* Section 2: Title - In Center */}
                        <div 
                          style={{ 
                            fontSize: hoveredPackage === pkg.id ? `${innerContainerHeight / 40}px` : `${innerContainerHeight / 24}px`,
                        fontWeight: 900, 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.2em',
                          flex: 1,
                          minHeight: 0,
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                      }}
                    >
                      {(() => {
                          if (hoveredPackage === pkg.id) {
                            // Show descriptive text on hover (without title prefix)
                            const hoverTexts = {
                              'beer-wine': 'Choose up to\n5 Beers & 6 Wines\nFrom our selection',
                              'mocktails': 'Our classics +\n6 Mocktails\nFrom our selection',
                              'cocktails-mocktails': 'Our classics +\n6 Cocktails\nFrom our selection',
                              'all-inclusive': 'Our classics +\n6 Cocktails\n6 Mocktails\n5 Beers - 4 Wines\nFrom our selection'
                            };
                            const hoverText = hoverTexts[pkg.id] || '';
                            return (
                              <span style={{
            color: '#666',
            background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                                lineHeight: '1.3',
                                padding: '0 5%',
                                willChange: 'background'
                              }}>
                                {hoverText}
                              </span>
                            );
                          }
                          
                        const titleStyle = {
            color: '#666',
                          background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            fontWeight: 400,
                            fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                            whiteSpace: 'nowrap',
                            willChange: 'background'
                        };
                        
                        const cocktailsTitleStyle = {
                            color: '#666',
                          background: 'linear-gradient(to bottom, #0f0f0f, #666)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            fontWeight: 400,
                            fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                            whiteSpace: 'nowrap',
                            willChange: 'background'
                        };
                        
                        const allInclusiveTitleStyle = {
                            color: '#555',
                          background: 'linear-gradient(to bottom, #000, #555)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            fontWeight: 400,
                            fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                            whiteSpace: 'nowrap',
                            willChange: 'background'
                        };
                        
                        if (pkg.id === 'cocktails-mocktails') {
                            return <span style={cocktailsTitleStyle}>{pkg.title}</span>;
                        } else if (pkg.id === 'all-inclusive') {
                            return <span style={allInclusiveTitleStyle}>{pkg.title}</span>;
                        } else if (pkg.id === 'mocktails') {
                            return <span style={titleStyle}>{pkg.title}</span>;
                        } else {
                          return <span style={titleStyle}>{pkg.title}</span>;
                        }
                      })()}
                    </div>

                      {/* Section 3: Cost */}
                    <div 
                      style={{ 
                          fontSize: '1.5em', 
                          fontWeight: 300, 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                          gap: '0.3em',
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                        }}
                      >
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Date and Number of People - Stacked Below */}
          <div 
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: `${verticalFieldGap}px`,
                        alignItems: 'center',
                        justifyContent: 'center',
              position: 'absolute',
              bottom: `${verticalFieldsBottom}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
              width: '100%'
            }}
          >
            {/* Guest count */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1%', position: 'relative', zIndex: 3, alignItems: 'center' }}>
              <label style={{ fontSize: `${verticalLabelFontSize}px`, fontWeight: 300, fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Guest count</label>
              <input
                type="text"
                inputMode="numeric"
                value={numberOfPeople}
                onChange={handleNumberOfPeopleChange}
                onFocus={() => setFocusedInput('people')}
                onBlur={() => setFocusedInput(null)}
                placeholder="#"
                style={{
                  fontSize: `${verticalFieldFontSize}px`,
                  padding: '2%',
                  border: '1px solid #666666',
                  borderRadius: 0,
                  width: `${verticalFieldWidth}px`,
                  height: `${verticalFieldHeight}px`,
                  boxSizing: 'border-box',
                  backgroundColor: 'transparent',
                  background: 'transparent',
                  outline: 'none',
                  textAlign: 'center',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                  color: numberOfPeople ? '#000000' : '#666666'
          }}
        />
      </div>

            {/* Date Picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1%', position: 'relative', zIndex: 3, alignItems: 'center' }}>
              <label style={{ fontSize: `${verticalLabelFontSize}px`, fontWeight: 300, fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Date of the event</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  value={dateInputValue}
                  onChange={handleDateInputChange}
                  onFocus={(e) => {
                    setFocusedInput('date');
                    if (!eventDate) {
                      setDateInputValue('');
                    }
                    e.target.style.color = '#000000';
                  }}
                  onBlur={(e) => {
                    setFocusedInput(null);
                    if (e.target.value && !eventDate) {
                      const parsed = parseDateInput(e.target.value);
                      if (parsed) {
                        setEventDate(parsed);
                      } else {
                        setDateInputValue('');
                      }
                    }
                    e.target.style.color = eventDate ? '#000000' : '#666666';
                  }}
                  placeholder="mm/dd/yyyy"
                  style={{
                    fontSize: `${verticalFieldFontSize}px`,
                    padding: '2%',
                    border: '1px solid #666666',
                    borderRadius: 0,
                    width: `${verticalFieldWidth}px`,
                    height: `${verticalFieldHeight}px`,
                    boxSizing: 'border-box',
                    color: focusedInput === 'date' ? '#000000' : (eventDate ? '#000000' : '#666666'),
                    backgroundColor: 'transparent',
                    background: 'transparent',
                    outline: 'none',
                    textAlign: 'center',
                    fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                    caretColor: '#000000'
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!showCalendar && eventDate) {
                      const [year, month] = eventDate.split('-').map(Number);
                      setCalendarMonth({ year, month });
                    }
                    setShowCalendar(!showCalendar);
                  }}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: `${verticalFieldFontSize * 1.2}px`,
                    height: `${verticalFieldFontSize * 1.2}px`
                  }}
                >
                  <img 
                    src="/assets/icons/calendar.png" 
                    alt="Calendar"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      filter: eventDate ? 'brightness(0) saturate(100%)' : 'brightness(0) saturate(100%) opacity(0.4)',
                      opacity: 1
                    }}
                  />
                </button>
                
                {/* Calendar Popup */}
                {showCalendar && (
                  <div
                    ref={calendarRef}
                    style={{
                      position: 'absolute',
                      bottom: `${verticalFieldHeight + 8}px`,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: '#ffffff',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      padding: '12px',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                      zIndex: 1000,
                      minWidth: '280px'
                    }}
                  >
                    {(() => {
                      const { year, month } = calendarMonth;
                      const [selectedYear, selectedMonth, selectedDay] = eventDate ? eventDate.split('-').map(Number) : [null, null, null];
                      
                      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                      const daysInMonth = new Date(year, month, 0).getDate();
                      const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
                      
                      const days = [];
                      for (let i = 0; i < firstDayOfWeek; i++) {
                        days.push(null);
                      }
                      for (let day = 1; day <= daysInMonth; day++) {
                        days.push(day);
                      }
                      
                      const isSelectedDay = (day) => {
                        return selectedYear === year && selectedMonth === month && selectedDay === day;
                      };
                      
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const newMonth = month === 1 ? 12 : month - 1;
                                const newYear = month === 1 ? year - 1 : year;
                                setCalendarMonth({ year: newYear, month: newMonth });
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                            >
                              ‹
                            </button>
                            <div style={{ fontWeight: 600, fontSize: '14px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
                              {monthNames[month - 1]} {year}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newMonth = month === 12 ? 1 : month + 1;
                                const newYear = month === 12 ? year + 1 : year;
                                setCalendarMonth({ year: newYear, month: newMonth });
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                            >
                              ›
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                              <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#666', padding: '4px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
                                {day}
                        </div>
                      ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                            {days.map((day, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => day && handleCalendarDateSelect(year, month, day)}
                                disabled={!day}
                                style={{
                                  background: isSelectedDay(day) ? '#d0d0d0' : 'transparent',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '8px',
                                  cursor: day ? 'pointer' : 'default',
                                  fontSize: '12px',
                                  color: day ? '#333' : 'transparent',
                                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                                }}
                              >
                                {day || ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      background: '#fff',
      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: `${baseFontSize}rem`,
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Gradient overlay - bottom half only */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(105, 90, 78, 0.6) 0%, rgba(105, 90, 78, 0.5) 16%, rgba(105, 90, 78, 0.4) 32%, rgba(105, 90, 78, 0.25) 56%, rgba(105, 90, 78, 0.12) 80%, rgba(105, 90, 78, 0.04) 90%, rgba(105, 90, 78, 0.02) 94%, rgba(105, 90, 78, 0.01) 97%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />


      <div 
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '4%',
          background: 'transparent',
          position: 'relative',
          zIndex: 2
        }}
      >
        {/* Title */}
        <h1 
          style={{
            fontSize: `${titleFontSize}px`,
            fontWeight: 300,
            textAlign: 'center',
            margin: 0,
            padding: 0,
            position: 'absolute',
            top: `${titleTopPosition - titleFontSize / 2}px`,
            left: 0,
            right: 0,
            width: '100%',
            background: 'linear-gradient(to bottom, #1a1a1a, #888)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
          }}
        >
          Begin your experience
        </h1>

        {/* Package Selection Boxes */}
        <div 
          style={{
            display: 'flex',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            transform: 'translateY(-50%)',
            height: `${boxHeight}px`
          }}
        >
          {packages.map((pkg) => {
            const borderWidth = pkg.id === 'all-inclusive' ? '0.4em' : 
              pkg.id === 'cocktails-mocktails' ? '0.3em' : '0.2em';
            
            return (
              <div
                key={pkg.id}
                style={{
                  position: 'relative',
                  height: `${boxHeight}px`,
                  width: `${boxWidth}px`,
                  flexShrink: 0
                }}
              >
                <button
                  onClick={() => setSelectedPackage(pkg.id)}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    borderRadius: 0,
                    backgroundColor: 'transparent',
                    padding: '3% 1.5%',
                    paddingTop: (pkg.id === 'cocktails-mocktails' || pkg.id === 'all-inclusive' || pkg.id === 'mocktails') ? 'calc(3% + 12px)' : '3%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2%',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    color: selectedPackage === pkg.id ? '#000' : '#333',
                    transform: (hoveredPackage === pkg.id || selectedPackage === pkg.id) ? 'scale(1.05)' : 'scale(1)',
                    zIndex: (hoveredPackage === pkg.id || selectedPackage === pkg.id) ? 10 : 1,
                    position: 'relative',
                    boxShadow: 'none',
                    opacity: (selectedPackage === pkg.id || hoveredPackage === pkg.id) ? 1 : (selectedPackage && selectedPackage !== pkg.id) ? 0.5 : 1,
                    fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                  }}
                  onMouseEnter={() => setHoveredPackage(pkg.id)}
                  onMouseLeave={() => setHoveredPackage(null)}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      justifyContent: 'space-between',
                      gap: '3%',
                      width: '100%'
                    }}
                  >
                    {/* Section 1: Icon - Now on Top */}
                    <div 
                      style={{ 
                        display: hoveredPackage === pkg.id ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: `${innerContainerHeight / 5}px`,
                        flexShrink: 0
                      }}
                    >
                      {(() => {
                        const iconMap = {
                          'beer-wine': '/assets/icons/beer&wine-01.png',
                          'mocktails': '/assets/icons/mocktail-01.png',
                          'cocktails-mocktails': '/assets/icons/cocktail-01.png',
                          'all-inclusive': '/assets/icons/everything-01.png'
                        };
                        const iconPath = iconMap[pkg.id];
                        return iconPath ? (
                          <img 
                            src={iconPath} 
                            alt={pkg.title}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain'
                            }}
                          />
                        ) : null;
                      })()}
                    </div>

                    {/* Section 2: Title - Now in Center */}
                    <div 
                      style={{ 
                        fontSize: hoveredPackage === pkg.id ? `${innerContainerHeight / 40}px` : '1.8em', 
                        fontWeight: 900, 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.2em',
                        flex: 1,
                        minHeight: 0,
                        fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                      }}
                    >
                      {(() => {
                        if (hoveredPackage === pkg.id) {
                          // Show descriptive text on hover (without title prefix)
                          const hoverTexts = {
                            'beer-wine': 'Choose up to\n5 Beers & 6 Wines\nFrom our selection',
                            'mocktails': 'Our classics +\n6 Mocktails\nFrom our selection',
                            'cocktails-mocktails': 'Our classics +\n6 Cocktails\nFrom our selection',
                            'all-inclusive': 'Our classics +\n6 Cocktails\n6 Mocktails\n5 Beers - 4 Wines\nFrom our selection'
                          };
                          const hoverText = hoverTexts[pkg.id] || '';
                          return (
                            <span style={{
                          background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text',
                              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                              lineHeight: '1.3',
                              padding: '0 5%',
                              whiteSpace: 'pre-line',
                              textAlign: 'center'
                            }}>
                              {hoverText}
                            </span>
                          );
                        }
                        
                        const titleStyle = {
                          background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                          fontWeight: 400,
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                        };
                        
                        if (pkg.id === 'cocktails-mocktails') {
                          return <span style={titleStyle}>Cocktails</span>;
                        } else if (pkg.id === 'all-inclusive') {
                          return <span style={titleStyle}>{pkg.title}</span>;
                        } else if (pkg.id === 'mocktails') {
                          return <span style={titleStyle}>{pkg.title}</span>;
                        } else {
                          return <span style={titleStyle}>{pkg.title}</span>;
                        }
                      })()}
                    </div>

                    {/* Section 3: Cost */}
                    <div 
                      style={{ 
                        fontSize: '1.5em', 
                        fontWeight: 300, 
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3em',
                        fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                      }}
                    >
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Date and Number of People */}
        <div 
          style={{
            display: 'flex',
            gap: `${fieldGap}px`,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'absolute',
            bottom: `${fieldsBottomPosition}px`,
            left: `${fieldSpacing}px`,
            right: `${fieldSpacing}px`,
            zIndex: 3
          }}
        >
          {/* Guest count */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1%', position: 'relative', zIndex: 3, alignItems: 'center' }}>
            <label style={{ fontSize: `${labelFontSize}px`, fontWeight: 300, fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Guest count</label>
            <input
              type="text"
              inputMode="numeric"
              value={numberOfPeople}
              onChange={handleNumberOfPeopleChange}
              onFocus={() => setFocusedInput('people')}
              onBlur={() => setFocusedInput(null)}
              placeholder="#"
              style={{
                fontSize: `${fieldFontSize}px`,
                padding: '2%',
                border: '1px solid #666666',
                borderRadius: 0,
                width: `${fieldWidth}px`,
                height: `${fieldHeight}px`,
                boxSizing: 'border-box',
                backgroundColor: 'transparent',
                background: 'transparent',
                outline: 'none',
                textAlign: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                color: numberOfPeople ? '#000000' : '#666666'
              }}
            />
          </div>

          {/* Date Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1%', position: 'relative', zIndex: 3, alignItems: 'center' }}>
            <label style={{ fontSize: `${labelFontSize}px`, fontWeight: 300, fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Date of the event</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
                type="text"
                value={dateInputValue}
                onChange={handleDateInputChange}
                onFocus={(e) => {
                  setFocusedInput('date');
                  if (!eventDate) {
                    setDateInputValue('');
                  }
                  e.target.style.color = '#000000';
                }}
                onBlur={(e) => {
                  setFocusedInput(null);
                  // Ensure value is formatted correctly on blur
                  if (e.target.value && !eventDate) {
                    const parsed = parseDateInput(e.target.value);
                    if (parsed) {
                      setEventDate(parsed);
                    } else {
                      setDateInputValue('');
                    }
                  }
                  e.target.style.color = eventDate ? '#000000' : '#666666';
                }}
                placeholder="mm/dd/yyyy"
              style={{
                  fontSize: `${fieldFontSize}px`,
                padding: '2%',
                  border: '1px solid #666666',
                  borderRadius: 0,
                  width: `${fieldWidth}px`,
                  height: `${fieldHeight}px`,
                boxSizing: 'border-box',
                  color: focusedInput === 'date' ? '#000000' : (eventDate ? '#000000' : '#666666'),
                backgroundColor: 'transparent',
                background: 'transparent',
                outline: 'none',
                  textAlign: 'center',
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                  caretColor: '#000000'
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (!showCalendar && eventDate) {
                    const [year, month] = eventDate.split('-').map(Number);
                    setCalendarMonth({ year, month });
                  }
                  setShowCalendar(!showCalendar);
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: `${fieldFontSize * 1.2}px`,
                  height: `${fieldFontSize * 1.2}px`
                }}
              >
                <img 
                  src="/assets/icons/calendar.png" 
                  alt="Calendar"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    filter: eventDate ? 'brightness(0) saturate(100%)' : 'brightness(0) saturate(100%) opacity(0.4)',
                    opacity: 1
                  }}
                />
              </button>
              
              {/* Calendar Popup */}
              {showCalendar && (
                <div
                  ref={calendarRef}
                  style={{
                    position: 'absolute',
                    bottom: `${fieldHeight + 8}px`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#ffffff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '12px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                    minWidth: '280px'
                  }}
                >
                  {(() => {
                    const { year, month } = calendarMonth;
                    const [selectedYear, selectedMonth, selectedDay] = eventDate ? eventDate.split('-').map(Number) : [null, null, null];
                    
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                    const daysInMonth = new Date(year, month, 0).getDate();
                    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
                    
                    const days = [];
                    for (let i = 0; i < firstDayOfWeek; i++) {
                      days.push(null);
                    }
                    for (let day = 1; day <= daysInMonth; day++) {
                      days.push(day);
                    }
                    
                    const isSelectedDay = (day) => {
                      return selectedYear === year && selectedMonth === month && selectedDay === day;
                    };
                    
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const newMonth = month === 1 ? 12 : month - 1;
                              const newYear = month === 1 ? year - 1 : year;
                              setCalendarMonth({ year: newYear, month: newMonth });
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                          >
                            ‹
                          </button>
                          <div style={{ fontWeight: 600, fontSize: '14px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
                            {monthNames[month - 1]} {year}
          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newMonth = month === 12 ? 1 : month + 1;
                              const newYear = month === 12 ? year + 1 : year;
                              setCalendarMonth({ year: newYear, month: newMonth });
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                          >
                            ›
                          </button>
        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                            <div key={day} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#666', padding: '4px', fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
                              {day}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                          {days.map((day, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => day && handleCalendarDateSelect(year, month, day)}
                              disabled={!day}
                              style={{
                                background: isSelectedDay(day) ? '#d0d0d0' : 'transparent',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '8px',
                                cursor: day ? 'pointer' : 'default',
                                fontSize: '12px',
                                color: day ? '#333' : 'transparent',
                                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                              }}
                            >
                              {day || ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ADD-ONS Page Component
function AddOnsPage({ outerWidth, outerHeight, orientation, selectedPackage, selectedAddOns, setSelectedAddOns, hoveredAddOn, setHoveredAddOn, customMocktailQuantity, setCustomMocktailQuantity, customCocktailQuantity, setCustomCocktailQuantity, createEventClicked, setCreateEventClicked, numberOfPeople, eventDate, setCurrentPage }) {
  // Calculate font sizes based on container dimensions - hooks must be called before any returns
  const baseFontSize = useMemo(() => {
    return Math.max(0.5, Math.min(3, outerHeight / 200));
  }, [outerHeight]);

  // Fetch current logo and get dimensions
  const [logoPath, setLogoPath] = useState('/assets/icons/Echo_.svg');
  const [logoDimensions, setLogoDimensions] = useState({ width: null, height: null });
  
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const logoData = await fetchLogo();
        if (logoData && logoData.content) {
          setLogoPath(logoData.content);
          
          // Load image to get natural dimensions for aspect ratio
          const img = new Image();
          img.onload = () => {
            setLogoDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          };
          img.onerror = () => {
            setLogoDimensions({ width: 350, height: 100 }); // Fallback
          };
          img.src = logoData.content;
        }
      } catch (error) {
        console.error('Error loading logo:', error);
      }
    };
    loadLogo();
  }, []);

  // Calculate dimensions based on outerHeight (same as TYPE page)
  const innerContainerHeight = outerHeight;

  // Calculate logo display size maintaining aspect ratio
  const maxLogoHeight = useMemo(() => {
    return orientation === 'horizontal' ? innerContainerHeight / 16 : parseFloat(getComputedStyle(document.documentElement).fontSize || '16') * 1.8;
  }, [orientation, innerContainerHeight]);
  
  const logoDisplaySize = useMemo(() => {
    if (!logoDimensions.width || !logoDimensions.height) {
      return { width: maxLogoHeight * 3.5, height: maxLogoHeight };
    }
    const aspectRatio = logoDimensions.width / logoDimensions.height;
    const height = maxLogoHeight;
    const width = height * aspectRatio;
    return { width, height };
  }, [logoDimensions, maxLogoHeight]);

  if (orientation !== 'horizontal') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ fontSize: '2rem', color: '#333' }}>ADD-ONS Page - Vertical view coming soon</div>
      </div>
    );
  }

  // Define add-ons with icons and titles
  const addOnsList = [
    { id: 1, title: 'Basic Brews', icon: '/assets/icons/beer-01.png', price: allAddOns[1].price },
    { id: 2, title: 'Master Brewer', icon: '/assets/icons/growler-01.png', price: allAddOns[2].price },
    { id: 3, title: 'House Wine', icon: '/assets/icons/wine-01.png', price: allAddOns[3].price },
    { id: 4, title: 'Sommelier', icon: '/assets/icons/sommelier-01.png', price: allAddOns[4].price },
    { id: 7, title: 'Custom Mocktail', icon: '/assets/icons/mocktail-01.png', price: allAddOns[7].price },
    { id: 8, title: 'Custom Cocktail', icon: '/assets/icons/cocktail-01.png', price: allAddOns[8].price }
  ];

  // Filter add-ons based on selected package
  // When "Beer and Wine" is selected, hide "Master Brewer" (id 2) and "Sommelier" (id 4)
  const filteredAddOnsList = selectedPackage === 'beer-wine' 
    ? addOnsList.filter(addon => addon.id !== 2 && addon.id !== 4)
    : addOnsList;
  
  // Order add-ons ensuring pairs are stacked vertically when both are available
  // Pairs: Basic Brews(1)/Master Brewer(2), House Wine(3)/Sommelier(4), Custom Mocktail(7)/Custom Cocktail(8)
  // House Wine should always be to the left of Custom Mocktail
  // Layout: 6 = 2 rows of 3, 4 = 2 rows of 2, 2 = 2 rows of 1
  const addOnMap = new Map(filteredAddOnsList.map(addon => [addon.id, addon]));
  
  // Build columns: each column can have 0, 1, or 2 items (stacked)
  const columns = [[], [], []]; // [column1, column2, column3]
  
  // Column 1: Basic Brews (1) on top, Master Brewer (2) below
  if (addOnMap.has(1)) columns[0].push(addOnMap.get(1));
  if (addOnMap.has(2)) columns[0].push(addOnMap.get(2));
  
  // Column 2: House Wine (3) on top, Sommelier (4) below
  if (addOnMap.has(3)) columns[1].push(addOnMap.get(3));
  if (addOnMap.has(4)) columns[1].push(addOnMap.get(4));
  
  // Column 3: Custom Mocktail (7) on top, Custom Cocktail (8) below
  if (addOnMap.has(7)) columns[2].push(addOnMap.get(7));
  if (addOnMap.has(8)) columns[2].push(addOnMap.get(8));
  
  // Build rows from columns, maintaining row structure (3-3, 2-2, or 1-1)
  // Pairs are already stacked in columns (first on top, second on bottom)
  const row1AddOns = [];
  const row2AddOns = [];
  
  // Process columns in order
  // For each column: add top item to row1, bottom item to row2 (if exists)
  // This naturally creates equal rows when pairs are complete
  columns.forEach(column => {
    if (column.length === 2) {
      // Complete pair: first goes to row1, second to row2
      row1AddOns.push(column[0]);
      row2AddOns.push(column[1]);
    } else if (column.length === 1) {
      // Single item: add to the row that needs it to balance
      // If row1 has fewer items, add to row1; otherwise add to row2
      if (row1AddOns.length <= row2AddOns.length) {
        row1AddOns.push(column[0]);
      } else {
        row2AddOns.push(column[0]);
      }
    }
  });
  
  // Ensure rows have equal items (for centering)
  // If row1 has more items, we need to adjust (shouldn't happen with pairs, but just in case)
  // The grid will handle centering based on the number of items per row
  
  // Calculate starting column to center items in a 3-column grid
  const getStartColumn = (itemCount, index) => {
    if (itemCount === 3) return index + 1; // Columns 1, 2, 3
    if (itemCount === 2) return index === 0 ? 1 : 3; // Columns 1, 3 (centered)
    if (itemCount === 1) return 2; // Column 2 (center)
    return index + 1;
  };
  const titleFontSize = innerContainerHeight / 16;
  const titleTopPosition = innerContainerHeight / 12;
  const boxHeight = innerContainerHeight / 3;
  const boxWidth = (outerWidth * 3) / 10;

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      background: '#fff',
      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: `${baseFontSize}rem`,
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Type selection info - upper right corner */}
      {(() => {
        const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
        const formatDateForDisplay = (dateStr) => {
          if (!dateStr) return null;
          const [year, month, day] = dateStr.split('-');
          return `${month}/${day}/${year}`;
        };
        
        const parts = [];
        
        // Only show package if selected
        if (selectedPkg) {
          parts.push(selectedPkg.title);
        }
        
        // Only show people/date if both are provided
        if (numberOfPeople && eventDate) {
          const dateText = formatDateForDisplay(eventDate);
          if (dateText) {
            parts.push(`${numberOfPeople} People - ${dateText}`);
          }
        }
        
        // Only show add-ons if there are any
        if (selectedAddOns.length > 0) {
          const addOnTitles = selectedAddOns.map(id => {
            const addOnId = id.replace('addon-', '');
            const addOn = allAddOns[addOnId];
            if (addOnId === '7') {
              return `Custom Mocktail (${customMocktailQuantity || 1})`;
            } else if (addOnId === '8') {
              return `Custom Cocktail (${customCocktailQuantity || 1})`;
            }
            return addOn ? addOn.title : '';
          }).filter(Boolean).join(' - ');
          
          if (addOnTitles) {
            parts.push(addOnTitles);
          }
        }
        
        const displayText = parts.length > 0 ? parts.join('\n') : null;
        
        if (!displayText) return null;
        
        return (
          <div
            style={{
              position: 'absolute',
              top: '2%',
              right: '2%',
              fontSize: `${innerContainerHeight / 48}px`,
                fontWeight: 300,
                textAlign: 'right',
              color: '#666',
                background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              zIndex: 10,
              pointerEvents: 'none',
              willChange: 'background',
              whiteSpace: 'pre-line',
              lineHeight: '1.4'
            }}
          >
            {displayText}
            </div>
        );
      })()}

      {/* Gradient overlay - bottom half only */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(105, 90, 78, 0.6) 0%, rgba(105, 90, 78, 0.5) 16%, rgba(105, 90, 78, 0.4) 32%, rgba(105, 90, 78, 0.25) 56%, rgba(105, 90, 78, 0.12) 80%, rgba(105, 90, 78, 0.04) 90%, rgba(105, 90, 78, 0.02) 94%, rgba(105, 90, 78, 0.01) 97%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />


      <div 
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '4%',
          background: 'transparent',
          position: 'relative',
          zIndex: 2
        }}
      >
        {/* Title */}
        <h1 
          style={{
            fontSize: `${titleFontSize}px`,
            fontWeight: 300,
            textAlign: 'center',
            margin: 0,
            padding: 0,
            position: 'absolute',
            top: `${titleTopPosition - titleFontSize / 2}px`,
            left: 0,
            right: 0,
            width: '100%',
            background: 'linear-gradient(to bottom, #1a1a1a, #888)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
          }}
        >
          Choose your add-ons...
        </h1>

        {/* Add-on Selection Boxes - Two Rows of 3 */}
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: `${boxHeight * 0.1}px`,
            position: 'absolute',
            top: '55%',
            left: 0,
            right: 0,
            transform: 'translateY(-50%)',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Row 1 */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: `${boxHeight}px`,
                gap: 0
              }}
            >
            {row1AddOns.map((addOn, index) => {
                return (
                  <div
                  key={`addon-${addOn.id}`}
                    style={{
                    position: 'relative',
                    height: `${boxHeight}px`,
                    width: `${boxWidth}px`,
                    flexShrink: 0
                    }}
                  >
                    <button
                      onClick={() => {
                      const addOnId = `addon-${addOn.id}`;
                        setSelectedAddOns(prev => 
                          prev.includes(addOnId) 
                            ? prev.filter(id => id !== addOnId)
                            : [...prev, addOnId]
                        );
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                      border: 'none',
                      borderRadius: 0,
                      backgroundColor: 'transparent',
                      padding: '3% 1.5%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2%',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      color: selectedAddOns.includes(`addon-${addOn.id}`) ? '#000' : '#333',
                      transform: (hoveredAddOn === `addon-${addOn.id}` || selectedAddOns.includes(`addon-${addOn.id}`)) ? 'scale(1.05)' : 'scale(1)',
                      zIndex: (hoveredAddOn === `addon-${addOn.id}` || selectedAddOns.includes(`addon-${addOn.id}`)) ? 10 : 1,
                        position: 'relative',
                      boxShadow: 'none',
                      opacity: (selectedAddOns.includes(`addon-${addOn.id}`) || hoveredAddOn === `addon-${addOn.id}`) ? 1 : (selectedAddOns.length > 0) ? 0.5 : 1,
                      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                      }}
                    onMouseEnter={() => setHoveredAddOn(`addon-${addOn.id}`)}
                      onMouseLeave={() => setHoveredAddOn(null)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          height: '100%',
                          justifyContent: 'space-between',
                          gap: '3%',
                          width: '100%'
                        }}
                      >
                      {/* Section 1: Icon - On Top */}
                        <div 
                          style={{ 
                          display: hoveredAddOn === `addon-${addOn.id}` ? 'none' : 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          height: `${innerContainerHeight / 5}px`,
                          flexShrink: 0
                        }}
                      >
                        <img 
                          src={addOn.icon} 
                          alt={addOn.title}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain'
                          }}
                        />
                      </div>

                      {/* Section 2: Title - In Center */}
                        <div 
                          style={{ 
                            fontSize: hoveredAddOn === `addon-${addOn.id}` ? `${innerContainerHeight / 40}px` : '1.8em', 
                            fontWeight: 900, 
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.2em',
                          flex: 1,
                          minHeight: 0,
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                          }}
                        >
                          {(() => {
                            if (hoveredAddOn === `addon-${addOn.id}`) {
                              // Show descriptive text on hover (without title prefix)
                              const hoverTexts = {
                                1: 'Choose 3 beers from our selection',
                                2: 'Choose 6 beers from our selection',
                                3: 'Choose 2 whites and 2 reds from our selection',
                                4: 'Choose 4 whites and 4 reds from our selection',
                                7: 'Submit your concept and we will make it happen!',
                                8: 'Submit your concept and we will make it happen!'
                              };
                              const hoverText = hoverTexts[addOn.id] || '';
                              return (
                                <span style={{
                                  background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  backgroundClip: 'text',
                                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                                  lineHeight: '1.3',
                                  padding: '0 5%',
                                  whiteSpace: 'pre-line',
                                  textAlign: 'center'
                                }}>
                                  {hoverText}
                                </span>
                              );
                            }
                            
                            return (
                          <span
                            style={{
                              background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%'
                            }}
                          >
                            {addOn.title}
                          </span>
                            );
                          })()}
                        </div>

                      {/* Section 3: Price */}
                        <div 
                          style={{ 
                            fontSize: '1.5em', 
                            fontWeight: 300, 
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3em',
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                        }}
                      >
                          {(addOn.id === 7 || addOn.id === 8) && selectedAddOns.includes(`addon-${addOn.id}`) ? (() => {
                            const quantity = addOn.id === 7 ? customMocktailQuantity : customCocktailQuantity;
                            const pricePerUnit = addOn.id === 7 ? 2 : 3;
                            const totalPrice = quantity * pricePerUnit;
                            const isAtMinimum = quantity === 1;
                            
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3em' }}>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    if (addOn.id === 7) {
                                      setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                      } else {
                                      setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      if (addOn.id === 7) {
                                        setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                        } else {
                                        setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                        }
                                      }
                                    }}
                                    style={{
                                    width: '1.2em',
                                    height: '1.2em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                    cursor: isAtMinimum ? 'default' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    fontSize: '1em',
                                    padding: 0,
                                    color: isAtMinimum ? '#666666' : '#333',
                                    opacity: isAtMinimum ? 0.5 : 1
                                  }}
                                >
                                  −
                                </div>
                                <div style={{ 
                                  fontSize: '1em', 
                                  fontWeight: 400,
                                  minWidth: '2em',
                                  textAlign: 'center'
                                }}>
                                  {quantity}
                                  </div>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    if (addOn.id === 7) {
                                      setCustomMocktailQuantity(prev => prev + 1);
                                      } else {
                                      setCustomCocktailQuantity(prev => prev + 1);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      if (addOn.id === 7) {
                                        setCustomMocktailQuantity(prev => prev + 1);
                                        } else {
                                        setCustomCocktailQuantity(prev => prev + 1);
                                        }
                                      }
                                    }}
                                    style={{
                                    width: '1.2em',
                                    height: '1.2em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    fontSize: '1em',
                                    padding: 0,
                                    color: '#333'
                                    }}
                                  >
                                  +
                                  </div>
                                </div>
                            );
                          })() : null}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

          {/* Row 2 */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: `${boxHeight}px`,
                gap: 0
              }}
            >
            {row2AddOns.map((addOn, index) => {
                return (
                  <div
                  key={`addon-${addOn.id}`}
                    style={{
                    position: 'relative',
                    height: `${boxHeight}px`,
                    width: `${boxWidth}px`,
                    flexShrink: 0
                    }}
                  >
                    <button
                      onClick={() => {
                      const addOnId = `addon-${addOn.id}`;
                        setSelectedAddOns(prev => 
                          prev.includes(addOnId) 
                            ? prev.filter(id => id !== addOnId)
                            : [...prev, addOnId]
                        );
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                      border: 'none',
                      borderRadius: 0,
                      backgroundColor: 'transparent',
                      padding: '3% 1.5%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2%',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      color: selectedAddOns.includes(`addon-${addOn.id}`) ? '#000' : '#333',
                      transform: (hoveredAddOn === `addon-${addOn.id}` || selectedAddOns.includes(`addon-${addOn.id}`)) ? 'scale(1.05)' : 'scale(1)',
                      zIndex: (hoveredAddOn === `addon-${addOn.id}` || selectedAddOns.includes(`addon-${addOn.id}`)) ? 10 : 1,
                        position: 'relative',
                      boxShadow: 'none',
                      opacity: (selectedAddOns.includes(`addon-${addOn.id}`) || hoveredAddOn === `addon-${addOn.id}`) ? 1 : (selectedAddOns.length > 0) ? 0.5 : 1,
                      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                      }}
                    onMouseEnter={() => setHoveredAddOn(`addon-${addOn.id}`)}
                      onMouseLeave={() => setHoveredAddOn(null)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          height: '100%',
                          justifyContent: 'space-between',
                          gap: '3%',
                          width: '100%'
                        }}
                      >
                      {/* Section 1: Icon - On Top */}
                        <div 
                          style={{ 
                          display: hoveredAddOn === `addon-${addOn.id}` ? 'none' : 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '100%',
                          height: `${innerContainerHeight / 5}px`,
                          flexShrink: 0
                        }}
                      >
                        <img 
                          src={addOn.icon} 
                          alt={addOn.title}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain'
                          }}
                        />
                      </div>

                      {/* Section 2: Title - In Center */}
                        <div 
                          style={{ 
                            fontSize: hoveredAddOn === `addon-${addOn.id}` ? `${innerContainerHeight / 40}px` : '1.8em', 
                            fontWeight: 900, 
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.2em',
                          flex: 1,
                          minHeight: 0,
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                          }}
                        >
                          {(() => {
                            if (hoveredAddOn === `addon-${addOn.id}`) {
                              // Show descriptive text on hover (without title prefix)
                              const hoverTexts = {
                                1: 'Choose 3 beers from our selection',
                                2: 'Choose 6 beers from our selection',
                                3: 'Choose 2 whites and 2 reds from our selection',
                                4: 'Choose 4 whites and 4 reds from our selection',
                                7: 'Submit your concept and we will make it happen!',
                                8: 'Submit your concept and we will make it happen!'
                              };
                              const hoverText = hoverTexts[addOn.id] || '';
                              return (
                                <span style={{
                                  background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  backgroundClip: 'text',
                                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                                  lineHeight: '1.3',
                                  padding: '0 5%',
                                  whiteSpace: 'pre-line',
                                  textAlign: 'center'
                                }}>
                                  {hoverText}
                                </span>
                              );
                            }
                            
                            return (
                          <span
                            style={{
                              background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%'
                            }}
                          >
                            {addOn.title}
                          </span>
                            );
                          })()}
                        </div>

                      {/* Section 3: Price */}
                        <div 
                          style={{ 
                            fontSize: '1.5em', 
                            fontWeight: 300, 
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3em',
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                        }}
                      >
                          {(addOn.id === 7 || addOn.id === 8) && selectedAddOns.includes(`addon-${addOn.id}`) ? (() => {
                            const quantity = addOn.id === 7 ? customMocktailQuantity : customCocktailQuantity;
                            const pricePerUnit = addOn.id === 7 ? 2 : 3;
                            const totalPrice = quantity * pricePerUnit;
                            const isAtMinimum = quantity === 1;
                            
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3em' }}>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    if (addOn.id === 7) {
                                      setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                      } else {
                                      setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      if (addOn.id === 7) {
                                        setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                        } else {
                                        setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                        }
                                      }
                                    }}
                                    style={{
                                    width: '1.2em',
                                    height: '1.2em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                    cursor: isAtMinimum ? 'default' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    fontSize: '1em',
                                    padding: 0,
                                    color: isAtMinimum ? '#666666' : '#333',
                                    opacity: isAtMinimum ? 0.5 : 1
                                  }}
                                >
                                  −
                                </div>
                                <div style={{ 
                                  fontSize: '1em', 
                                  fontWeight: 400,
                                  minWidth: '2em',
                                  textAlign: 'center'
                                }}>
                                  {quantity}
                                  </div>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    if (addOn.id === 7) {
                                      setCustomMocktailQuantity(prev => prev + 1);
                                      } else {
                                      setCustomCocktailQuantity(prev => prev + 1);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      if (addOn.id === 7) {
                                        setCustomMocktailQuantity(prev => prev + 1);
                                        } else {
                                        setCustomCocktailQuantity(prev => prev + 1);
                                        }
                                      }
                                    }}
                                    style={{
                                    width: '1.2em',
                                    height: '1.2em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    fontSize: '1em',
                                    padding: 0,
                                    color: '#333'
                                    }}
                                  >
                                  +
                                  </div>
                                </div>
                            );
                          })() : null}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
        </div>
      </div>
    </div>
  );
}

// SUMMARY Page Component
function SummaryPage({ outerWidth, outerHeight, orientation, selectedPackage, selectedAddOns, numberOfPeople, eventDate }) {
  // Calculate font sizes based on container dimensions
  const baseFontSize = useMemo(() => {
    return Math.max(0.5, Math.min(3, outerHeight / 200));
  }, [outerHeight]);

  if (orientation !== 'horizontal') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ fontSize: '2rem', color: '#333' }}>SUMMARY Page - Vertical view coming soon</div>
      </div>
    );
  }

  return (
    <div style={{ 
              width: '100%',
      height: '100%', 
      position: 'relative',
      background: '#fff',
              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: `${baseFontSize}rem`,
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '2rem', color: '#333' }}>SUMMARY Page - Coming soon</div>
      </div>
    </div>
  );
}

// ITEMS Page Component (Menu Gallery with navigation)
function ItemsPage({ outerWidth, outerHeight, orientation, selectedCocktails, setSelectedCocktails, hasCheckmark, setHasCheckmark, allowCheckmarkFade, setAllowCheckmarkFade, currentCocktailName, setCurrentCocktailName, selectedPackage, numberOfPeople, eventDate, selectedAddOns, customMocktailQuantity, customCocktailQuantity, selectedItemFromMenu, setSelectedItemFromMenu, onNavigateToMenu, setCurrentPage }) {
  // Update current cocktail name - hooks must be called before any returns
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

      let cocktailName = titleEl.textContent.trim();
      cocktailName = cocktailName.replace(/✓/g, '').trim();
      
      if (cocktailName && cocktailName !== currentCocktailName) {
        setCurrentCocktailName(cocktailName);
        
        const checkmark = document.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
        setHasCheckmark(!!checkmark);
      } else if (cocktailName === currentCocktailName) {
        const checkmark = document.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
        setHasCheckmark(!!checkmark);
      }
    };

    updateCurrentCocktail();
    const interval = setInterval(updateCurrentCocktail, 300);
    
    return () => clearInterval(interval);
  }, [currentCocktailName, hasCheckmark, setHasCheckmark, setCurrentCocktailName]);

  // Fetch current logo and get dimensions
  const [logoPath, setLogoPath] = useState('/assets/icons/Echo_.svg');
  const [logoDimensions, setLogoDimensions] = useState({ width: null, height: null });
  
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const logoData = await fetchLogo();
        if (logoData && logoData.content) {
          setLogoPath(logoData.content);
          
          // Load image to get natural dimensions for aspect ratio
          const img = new Image();
          img.onload = () => {
            setLogoDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          };
          img.onerror = () => {
            setLogoDimensions({ width: 350, height: 100 }); // Fallback
          };
          img.src = logoData.content;
        }
      } catch (error) {
        console.error('Error loading logo:', error);
      }
    };
    loadLogo();
  }, []);

  const innerContainerHeight = outerHeight;

  // Calculate logo display size maintaining aspect ratio
  const maxLogoHeight = useMemo(() => {
    return orientation === 'horizontal' ? innerContainerHeight / 16 : parseFloat(getComputedStyle(document.documentElement).fontSize || '16') * 1.8;
  }, [orientation, innerContainerHeight]);
  
  const logoDisplaySize = useMemo(() => {
    if (!logoDimensions.width || !logoDimensions.height) {
      return { width: maxLogoHeight * 3.5, height: maxLogoHeight };
    }
    const aspectRatio = logoDimensions.width / logoDimensions.height;
    const height = maxLogoHeight;
    const width = height * aspectRatio;
    return { width, height };
  }, [logoDimensions, maxLogoHeight]);

  if (orientation !== 'horizontal') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ fontSize: '2rem', color: '#333' }}>ITEMS Page - Vertical view coming soon</div>
      </div>
    );
  }

  // Checkmark management functions
  const addCheckmarkImmediately = (cocktailName) => {
    const titleEl = document.querySelector('.cocktail-title');
    if (!titleEl) return;

    const titleParent = titleEl.parentElement;
    if (!titleParent) return;

    const existingCheckmark = titleParent.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
    if (existingCheckmark) {
      existingCheckmark.remove();
    }

    const checkmark = document.createElement('span');
    checkmark.className = 'pos-checkmark';
    checkmark.setAttribute('data-cocktail-id', cocktailName);
    checkmark.textContent = '✓';
    
    checkmark.style.cssText = `
      position: absolute;
      color: #800080;
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
    
    const titleRect = titleEl.getBoundingClientRect();
    const parentRect = titleParent.getBoundingClientRect();
    if (titleRect.width > 0 && titleRect.height > 0) {
      const relativeLeft = titleRect.left - parentRect.left;
      const relativeTop = titleRect.top - parentRect.top;
      checkmark.style.left = `${relativeLeft + titleRect.width + 10}px`;
      checkmark.style.top = `${relativeTop + titleRect.height / 2}px`;
      checkmark.style.transform = 'translateY(-50%)';
    }
    
    if (currentCocktailName === cocktailName) {
      setHasCheckmark(true);
    }
  };

  const removeCheckmarkImmediately = (cocktailName) => {
    const allCheckmarks = document.querySelectorAll('.pos-checkmark');
    allCheckmarks.forEach(checkmark => {
      if (checkmark.getAttribute('data-cocktail-id') === cocktailName) {
        checkmark.remove();
      }
    });
    
    if (currentCocktailName === cocktailName) {
      setHasCheckmark(false);
    }
  };

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      background: '#fff',
      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      boxSizing: 'border-box'
    }}>
      {/* Type selection info - upper right corner */}
      {(() => {
        const mocktailQty = customMocktailQuantity || 1;
        const cocktailQty = customCocktailQuantity || 1;
        const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
        const formatDateForDisplay = (dateStr) => {
          if (!dateStr) return null;
          const [year, month, day] = dateStr.split('-');
          return `${month}/${day}/${year}`;
        };
        
        const parts = [];
        
        // Only show package if selected
        if (selectedPkg) {
          parts.push(selectedPkg.title);
        }
        
        // Only show people/date if both are provided
        if (numberOfPeople && eventDate) {
          const dateText = formatDateForDisplay(eventDate);
          if (dateText) {
            parts.push(`${numberOfPeople} People - ${dateText}`);
          }
        }
        
        // Only show add-ons if there are any
        if (selectedAddOns.length > 0) {
          const addOnTitles = selectedAddOns.map(id => {
            const addOnId = id.replace('addon-', '');
            const addOn = allAddOns[addOnId];
            if (addOnId === '7') {
              return `Custom Mocktail (${mocktailQty})`;
            } else if (addOnId === '8') {
              return `Custom Cocktail (${cocktailQty})`;
            }
            return addOn ? addOn.title : '';
          }).filter(Boolean).join(' - ');
          
          if (addOnTitles) {
            parts.push(addOnTitles);
          }
        }
        
        const displayText = parts.length > 0 ? parts.join('\n') : null;
        
        if (!displayText) return null;
        
        return (
      <div
        style={{
          position: 'absolute',
              top: '2%',
              right: '2%',
              fontSize: `${innerContainerHeight / 48}px`,
              fontWeight: 300,
              textAlign: 'right',
              color: '#666',
            background: 'linear-gradient(to bottom, #1a1a1a, #888)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              zIndex: 10,
              pointerEvents: 'none',
              willChange: 'background',
              whiteSpace: 'pre-line',
              lineHeight: '1.4'
            }}
          >
            {displayText}
      </div>
        );
      })()}

      {/* Gradient overlay */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(92, 85, 82, 0.6) 0%, rgba(92, 85, 82, 0.5) 16%, rgba(92, 85, 82, 0.4) 32%, rgba(92, 85, 82, 0.25) 56%, rgba(92, 85, 82, 0.12) 80%, rgba(92, 85, 82, 0.04) 90%, rgba(92, 85, 82, 0.02) 94%, rgba(92, 85, 82, 0.01) 97%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      {/* Menu Gallery */}
      <div 
        className="menu-gallery-wrapper"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          background: 'transparent',
          zIndex: 0
        }}
      >
        <div style={{ width: '100%', height: '100%', background: 'transparent' }}>
          <MenuGallery2
            viewMode="pos"
            orientationOverride="horizontal"
            outerWidth={outerWidth}
            outerHeight={outerHeight}
            selectedCocktails={selectedCocktails}
            setSelectedCocktails={setSelectedCocktails}
            initialItem={selectedItemFromMenu}
            onItemNavigated={() => setSelectedItemFromMenu(null)}
            onAllItemsClick={onNavigateToMenu}
          />
        </div>
      </div>

      {/* Event summary header - overlays on top, aligned right */}
      <div 
        style={{
          width: 'auto',
          padding: '1% 2%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'flex-start',
          gap: '0.05em',
          position: 'absolute',
          top: '2%',
          right: '2%',
          zIndex: 10,
          pointerEvents: 'none'
        }}
      >
        {/* This will be populated from shared state */}
      </div>

    </div>
  );
}

// MENU Page Component
function MenuPage({ outerWidth, outerHeight, orientation, viewMode, selectedPackage, numberOfPeople, eventDate, selectedAddOns, customMocktailQuantity, customCocktailQuantity, logoDisplaySize, selectedCocktails, setSelectedCocktails, onItemClick, setCurrentPage }) {
  const innerContainerHeight = outerHeight;


  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      background: '#fff',
      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      boxSizing: 'border-box'
    }}>
      {/* Type selection info - upper right corner */}
      {null}

      {/* Gradient overlay */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(92, 85, 82, 0.6) 0%, rgba(92, 85, 82, 0.5) 16%, rgba(92, 85, 82, 0.4) 32%, rgba(92, 85, 82, 0.25) 56%, rgba(92, 85, 82, 0.12) 80%, rgba(92, 85, 82, 0.04) 90%, rgba(92, 85, 82, 0.02) 94%, rgba(92, 85, 82, 0.01) 97%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />

      {/* Full Menu */}
      <div 
        className="full-menu-wrapper"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'auto',
          background: 'transparent',
          zIndex: 0
        }}
      >
        <FullMenu 
          disableNavigation={true} 
          hideSearch={true} 
          containerHeight={outerHeight} 
          logoHeight={logoDisplaySize.height}
          selectedCocktails={selectedCocktails}
          setSelectedCocktails={setSelectedCocktails}
          hiddenCategories={['spirits', 'premix']}
          onItemClick={onItemClick}
        />
      </div>
    </div>
  );
}

// INFO Page Component
function InfoPage({ outerWidth, outerHeight, orientation, selectedPackage, numberOfPeople, eventDate, selectedAddOns, customMocktailQuantity, customCocktailQuantity, selectedCocktails, setCurrentPage }) {
  // Calculate inner container height (for horizontal, inner height = outer height)
  const innerContainerHeight = outerHeight;
  
  // Calculate font sizes based on container dimensions - hooks must be called before any returns
  const baseFontSize = useMemo(() => {
    return Math.max(0.5, Math.min(3, outerHeight / 200)) * 0.5;
  }, [outerHeight]);


  if (orientation !== 'horizontal') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ fontSize: '2rem', color: '#333' }}>INFO Page - Vertical view coming soon</div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      background: '#fff',
      fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
      fontSize: `${baseFontSize}rem`,
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Gradient overlay */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(92, 85, 82, 0.6) 0%, rgba(92, 85, 82, 0.5) 16%, rgba(92, 85, 82, 0.4) 32%, rgba(92, 85, 82, 0.25) 56%, rgba(92, 85, 82, 0.12) 80%, rgba(92, 85, 82, 0.04) 90%, rgba(92, 85, 82, 0.02) 94%, rgba(92, 85, 82, 0.01) 97%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      {/* Transaction Database Content */}
      <div 
        style={{
          width: '100%',
          height: '100%',
          padding: '2%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'transparent'
        }}
      >
        {/* Header */}
        <h1 
          style={{
            fontSize: '1.2em',
            fontWeight: 300,
            textAlign: 'center',
            margin: '0 0 2% 0',
            padding: '2% 0',
            background: 'linear-gradient(to bottom, #1a1a1a, #888)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          EVENT INFORMATION
        </h1>

        {/* Single Column Container */}
        <div 
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Single Box */}
          <div 
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5em',
              background: '#fff',
              overflow: 'auto',
              padding: '0.5em'
            }}
          >
            {/* Field 1: EVENT TYPE */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', height: `${innerContainerHeight / 24}px` }}>
              <div style={{ width: '15%', padding: '0 0.3em 0 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, fontWeight: 400, color: '#374151', whiteSpace: 'nowrap' }}>Event Type</span>
              </div>
              <div style={{ width: '85%', padding: '0 0.5em 0 0.3em', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, color: '#374151' }}>
                  {selectedPackage ? (() => {
                    const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
                    return selectedPkg ? selectedPkg.title : '—';
                  })() : '—'}
                </span>
              </div>
            </div>
            {/* Field 2: ADD-ONS */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', height: `${innerContainerHeight / 24}px` }}>
              <div style={{ width: '15%', padding: '0 0.3em 0 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, fontWeight: 400, color: '#374151', whiteSpace: 'nowrap' }}>Add-ons</span>
              </div>
              <div style={{ width: '85%', padding: '0 0.5em 0 0.3em', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, color: '#374151' }}>
                  {selectedAddOns.length > 0 ? (() => {
                    const addOnTitles = selectedAddOns
                      .map(addOnId => {
                        const boxNum = parseInt(addOnId.replace('addon-', ''));
                        const addOn = allAddOns[boxNum];
                        if (boxNum === 7) {
                          return customMocktailQuantity > 1 ? `Custom Mocktail (${customMocktailQuantity})` : 'Custom Mocktail';
                        } else if (boxNum === 8) {
                          return customCocktailQuantity > 1 ? `Custom Cocktail (${customCocktailQuantity})` : 'Custom Cocktail';
                        }
                        return addOn?.title;
                      })
                      .filter(Boolean)
                      .join(', ');
                    
                    return addOnTitles || '—';
                  })() : '—'}
                </span>
              </div>
            </div>
            {/* Field 3: Guest count */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', height: `${innerContainerHeight / 24}px` }}>
              <div style={{ width: '15%', padding: '0 0.3em 0 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, fontWeight: 400, color: '#374151', whiteSpace: 'nowrap' }}>Guest count</span>
              </div>
              <div style={{ width: '85%', padding: '0 0.5em 0 0.3em', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, color: '#374151' }}>{numberOfPeople || '—'}</span>
              </div>
            </div>
            {/* Field 4: Date Requested */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', height: `${innerContainerHeight / 24}px` }}>
              <div style={{ width: '15%', padding: '0 0.3em 0 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, fontWeight: 400, color: '#374151', whiteSpace: 'nowrap' }}>Date Requested</span>
              </div>
              <div style={{ width: '85%', padding: '0 0.5em 0 0.3em', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, color: '#374151' }}>
                  {eventDate || '—'}
                </span>
              </div>
            </div>
            {/* Field 6: Location */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', height: `${innerContainerHeight / 24}px` }}>
              <div style={{ width: '15%', padding: '0 0.3em 0 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, fontWeight: 400, color: '#374151', whiteSpace: 'nowrap' }}>Location</span>
              </div>
              <div style={{ width: '85%', padding: '0 0.5em 0 0.3em', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, color: '#6b7280' }}>—</span>
              </div>
            </div>
            {/* Field 7: Menu Selection */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', height: `${innerContainerHeight / 24}px` }}>
              <div style={{ width: '15%', padding: '0 0.3em 0 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, fontWeight: 400, color: '#374151', whiteSpace: 'nowrap' }}>Menu Selection</span>
              </div>
              <div style={{ width: '85%', padding: '0 0.5em 0 0.3em', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, color: '#374151' }}>
                  {selectedCocktails.length > 0 ? selectedCocktails.join(', ') : '—'}
                </span>
              </div>
            </div>
            {/* Field 8 */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', height: `${innerContainerHeight / 24}px` }}>
              <div style={{ width: '15%', padding: '0 0.3em 0 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, fontWeight: 400, color: '#374151', whiteSpace: 'nowrap' }}></span>
              </div>
              <div style={{ width: '85%', padding: '0 0.5em 0 0.3em', display: 'flex', alignItems: 'center', height: '100%' }}>
                <span style={{ fontSize: `${innerContainerHeight / 64}px`, color: '#6b7280' }}>—</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function POSUIPreview() {
  const [currentPage, setCurrentPage] = useState('type');
  const [orientation, setOrientation] = useState('horizontal');
  const [frameRef, frameSize] = useMeasuredSize();

  // Shared state for all pages
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [hoveredPackage, setHoveredPackage] = useState(null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [hoveredAddOn, setHoveredAddOn] = useState(null);
  const [eventDate, setEventDate] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('');
  const [customCocktailQuantity, setCustomCocktailQuantity] = useState(1);
  const [customMocktailQuantity, setCustomMocktailQuantity] = useState(1);
  const [createEventClicked, setCreateEventClicked] = useState(false);
  const [selectedCocktails, setSelectedCocktails] = useState([]);
  const [currentCocktailName, setCurrentCocktailName] = useState('');
  const [allowCheckmarkFade, setAllowCheckmarkFade] = useState(false);
  const [hasCheckmark, setHasCheckmark] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const [selectedItemFromMenu, setSelectedItemFromMenu] = useState(null);

  // Logo state - shared across all pages
  const [logoPath, setLogoPath] = useState('/assets/icons/Echo_.svg');
  const [logoDimensions, setLogoDimensions] = useState({ width: null, height: null });
  
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const logoData = await fetchLogo();
        if (logoData && logoData.content) {
          setLogoPath(logoData.content);
          
          // Load image to get natural dimensions for aspect ratio
          const img = new Image();
          img.onload = () => {
            setLogoDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          };
          img.onerror = () => {
            setLogoDimensions({ width: 350, height: 100 }); // Fallback
          };
          img.src = logoData.content;
        }
      } catch (error) {
        console.error('Error loading logo:', error);
      }
    };
    loadLogo();
  }, []);

  const frameReady = frameSize.width > 0 && frameSize.height > 0;

  const stageDims = useMemo(() => {
    if (!frameReady) return { width: 0, height: 0 };
    const { width: fw, height: fh } = frameSize;
    if (orientation === 'horizontal') return { width: fw, height: fh };
    const stageHeight = fh;
    const stageWidth = fh * (9 / 19);
    return { width: stageWidth, height: stageHeight };
  }, [frameReady, frameSize, orientation]);

  // Calculate logo display size maintaining aspect ratio
  const innerContainerHeight = stageDims.height;
  const maxLogoHeight = useMemo(() => {
    return orientation === 'horizontal' ? innerContainerHeight / 16 : parseFloat(getComputedStyle(document.documentElement).fontSize || '16') * 1.8;
  }, [orientation, innerContainerHeight]);
  
  const logoDisplaySize = useMemo(() => {
    if (!logoDimensions.width || !logoDimensions.height) {
      return { width: maxLogoHeight * 3.5, height: maxLogoHeight };
    }
    const aspectRatio = logoDimensions.width / logoDimensions.height;
    const height = maxLogoHeight;
    const width = height * aspectRatio;
    return { width, height };
  }, [logoDimensions, maxLogoHeight]);

  const pages = [
    { key: 'type', label: 'TYPE' },
    { key: 'add-ons', label: 'ADD-ONS' },
    { key: 'items', label: 'ITEMS' },
    { key: 'menu', label: 'MENU' },
    { key: 'info', label: 'INFO' },
  ];

  const renderPage = () => {
    const baseProps = {
      outerWidth: stageDims.width,
      outerHeight: stageDims.height,
      orientation,
    };

    switch (currentPage) {
      case 'type':
        return (
          <TypePage
            {...baseProps}
            selectedPackage={selectedPackage}
            setSelectedPackage={setSelectedPackage}
            numberOfPeople={numberOfPeople}
            setNumberOfPeople={setNumberOfPeople}
            eventDate={eventDate}
            setEventDate={setEventDate}
            hoveredPackage={hoveredPackage}
            setHoveredPackage={setHoveredPackage}
            focusedInput={focusedInput}
            setFocusedInput={setFocusedInput}
            setCurrentPage={setCurrentPage}
          />
        );
      case 'add-ons':
        return (
          <AddOnsPage
            {...baseProps}
            selectedPackage={selectedPackage}
            selectedAddOns={selectedAddOns}
            setSelectedAddOns={setSelectedAddOns}
            hoveredAddOn={hoveredAddOn}
            setHoveredAddOn={setHoveredAddOn}
            customMocktailQuantity={customMocktailQuantity}
            setCustomMocktailQuantity={setCustomMocktailQuantity}
            customCocktailQuantity={customCocktailQuantity}
            setCustomCocktailQuantity={setCustomCocktailQuantity}
            createEventClicked={createEventClicked}
            setCreateEventClicked={setCreateEventClicked}
            numberOfPeople={numberOfPeople}
            eventDate={eventDate}
            setCurrentPage={setCurrentPage}
          />
        );
      case 'items':
        return (
          <ItemsPage
            {...baseProps}
            selectedCocktails={selectedCocktails}
            setSelectedCocktails={setSelectedCocktails}
            hasCheckmark={hasCheckmark}
            setHasCheckmark={setHasCheckmark}
            allowCheckmarkFade={allowCheckmarkFade}
            setAllowCheckmarkFade={setAllowCheckmarkFade}
            currentCocktailName={currentCocktailName}
            setCurrentCocktailName={setCurrentCocktailName}
            selectedPackage={selectedPackage}
            numberOfPeople={numberOfPeople}
            eventDate={eventDate}
            selectedAddOns={selectedAddOns}
            customMocktailQuantity={customMocktailQuantity}
            customCocktailQuantity={customCocktailQuantity}
            selectedItemFromMenu={selectedItemFromMenu}
            setSelectedItemFromMenu={setSelectedItemFromMenu}
            onNavigateToMenu={() => setCurrentPage('menu')}
            setCurrentPage={setCurrentPage}
          />
        );
      case 'menu':
        return (
          <MenuPage 
            {...baseProps} 
            viewMode="pos"
            selectedPackage={selectedPackage}
            numberOfPeople={numberOfPeople}
            eventDate={eventDate}
            selectedAddOns={selectedAddOns}
            customMocktailQuantity={customMocktailQuantity}
            customCocktailQuantity={customCocktailQuantity}
            logoDisplaySize={logoDisplaySize}
            selectedCocktails={selectedCocktails}
            setSelectedCocktails={setSelectedCocktails}
            onItemClick={(item) => {
              setSelectedItemFromMenu(item);
              setCurrentPage('items');
            }}
            setCurrentPage={setCurrentPage}
          />
        );
      case 'info':
        return (
          <InfoPage
            {...baseProps}
            selectedPackage={selectedPackage}
            numberOfPeople={numberOfPeople}
            eventDate={eventDate}
            selectedAddOns={selectedAddOns}
            customMocktailQuantity={customMocktailQuantity}
            customCocktailQuantity={customCocktailQuantity}
            selectedCocktails={selectedCocktails}
            setCurrentPage={setCurrentPage}
          />
        );
      default:
        return <TypePage {...baseProps} selectedPackage={selectedPackage} setSelectedPackage={setSelectedPackage} numberOfPeople={numberOfPeople} setNumberOfPeople={setNumberOfPeople} eventDate={eventDate} setEventDate={setEventDate} hoveredPackage={hoveredPackage} setHoveredPackage={setHoveredPackage} focusedInput={focusedInput} setFocusedInput={setFocusedInput} setCurrentPage={setCurrentPage} />;
    }
  };

  return (
    <div style={{ padding: '60px 16px 16px 16px', width: '100%', height: '100%', minHeight: '100vh', boxSizing: 'border-box' }}>
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Page:</span>
          {pages.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCurrentPage(key)}
              style={{
                border: '1px solid #333',
                background: currentPage === key ? '#333' : 'transparent',
                color: currentPage === key ? '#fff' : '#333',
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
              }}
            >
              {/* Shared Logo - appears on all pages */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  zIndex: 1000,
                  filter: 'drop-shadow(0.25em 0.2em 0.1em rgba(0, 0, 0, 0.1))',
                  display: 'inline-block',
                  paddingTop: '24px',
                  paddingRight: '24px',
                  paddingBottom: '24px',
                  paddingLeft: '24px',
                  minWidth: `${logoDisplaySize.width}px`,
                  minHeight: `${logoDisplaySize.height}px`
                }}
              >
                <div
                  style={{
                    background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                    WebkitMask: `url(${logoPath}) no-repeat center / contain`,
                    mask: `url(${logoPath}) no-repeat center / contain`,
                    WebkitMaskImage: `url(${logoPath})`,
                    maskImage: `url(${logoPath})`,
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    height: `${logoDisplaySize.height}px`,
                    width: `${logoDisplaySize.width}px`
                  }}
                />
              </div>

              {/* Shared Navigation Buttons - appear on all pages */}
              {(() => {
                // Treat menu and items as the same page for navigation
                // Both should navigate: prev → add-ons, next → info
                let prevPage, nextPage;
                if (currentPage === 'menu' || currentPage === 'items') {
                  prevPage = 'add-ons';
                  nextPage = 'info';
                } else {
                  const currentIndex = pages.findIndex(p => p.key === currentPage);
                  prevPage = currentIndex > 0 ? pages[currentIndex - 1].key : null;
                  nextPage = currentIndex < pages.length - 1 ? pages[currentIndex + 1].key : null;
                }

                return (
                  <>
                    {/* PREV button - bottom left */}
                    {prevPage && (
                      <button
                        onClick={(e) => {
                          e.currentTarget.style.color = '#000';
                          setCurrentPage(prevPage);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#000';
                          const svg = e.currentTarget.querySelector('svg');
                          if (svg) svg.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#666666';
                          const svg = e.currentTarget.querySelector('svg');
                          if (svg) svg.style.transform = 'scale(1)';
                        }}
                        style={{
                          position: 'absolute',
                          bottom: '2%',
                          left: '2%',
                          background: 'transparent',
                          color: '#666666',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5em',
                          fontSize: '36px',
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                          fontWeight: 300,
                          transition: 'all 0.2s ease',
                          padding: 0,
                          zIndex: 1001,
                          pointerEvents: 'auto'
                        }}
                      >
                        <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', transition: 'transform 0.2s ease' }}>
                          <path d="M20 8l-8 8 8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Prev</span>
                      </button>
                    )}

                    {/* NEXT button - bottom right */}
                    {nextPage && (
                      <button
                        onClick={(e) => {
                          e.currentTarget.style.color = '#000';
                          setCurrentPage(nextPage);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#000';
                          const svg = e.currentTarget.querySelector('svg');
                          if (svg) svg.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#666666';
                          const svg = e.currentTarget.querySelector('svg');
                          if (svg) svg.style.transform = 'scale(1)';
                        }}
                        style={{
                          position: 'absolute',
                          bottom: '2%',
                          right: '2%',
                          background: 'transparent',
                          color: '#666666',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5em',
                          fontSize: '36px',
                          fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                          fontWeight: 300,
                          transition: 'all 0.2s ease',
                          padding: 0,
                          zIndex: 1001,
                          pointerEvents: 'auto'
                        }}
                      >
                        <span>Next</span>
                        <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', transition: 'transform 0.2s ease' }}>
                          <path d="M12 8l8 8-8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                  </>
                );
              })()}

              {renderPage()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}