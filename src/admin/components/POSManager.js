import React, { useState, useEffect, useRef } from 'react';
import MenuGallery from '../../pages/menuGallery2';

const POSManager = () => {
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [hoveredPackage, setHoveredPackage] = useState(null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [hoveredAddOn, setHoveredAddOn] = useState(null);
  const [eventDate, setEventDate] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('');
  const [currentLayer, setCurrentLayer] = useState(1);
  const [container1FadeOut, setContainer1FadeOut] = useState(false);
  const [container2FadeIn, setContainer2FadeIn] = useState(false);
  const [container2FadeOut, setContainer2FadeOut] = useState(false);
  const [container3FadeIn, setContainer3FadeIn] = useState(false);
  const [customCocktailQuantity, setCustomCocktailQuantity] = useState(1);
  const [customMocktailQuantity, setCustomMocktailQuantity] = useState(1);
  const [createEventClicked, setCreateEventClicked] = useState(false);
  const [selectedCocktails, setSelectedCocktails] = useState([]);
  const [currentCocktailName, setCurrentCocktailName] = useState('');
  const [allowCheckmarkFade, setAllowCheckmarkFade] = useState(false); // Controls whether checkmarks fade in (true only when arrow is clicked)
  const [hasCheckmark, setHasCheckmark] = useState(false); // Track if current cocktail has a checkmark
  const [focusedInput, setFocusedInput] = useState(null); // Track which input is focused


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

  const handleNumberOfPeopleChange = (e) => {
    const value = e.target.value;
    // Only allow whole numbers
    if (value === '' || /^\d+$/.test(value)) {
      setNumberOfPeople(value);
    }
  };

  // Handle fade animations when all selections are made
  useEffect(() => {
    if (selectedPackage && eventDate && numberOfPeople && !container1FadeOut) {
      // Start fading out container 1
      setContainer1FadeOut(true);
    }
  }, [selectedPackage, eventDate, numberOfPeople, container1FadeOut]);

  // Fade in container 2 after container 1 has faded out
  useEffect(() => {
    if (container1FadeOut && !container2FadeIn) {
      const timer = setTimeout(() => {
        setContainer2FadeIn(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [container1FadeOut, container2FadeIn]);

  // Handle fade animations when "Choose your menu!" is clicked
  useEffect(() => {
    if (createEventClicked && !container2FadeOut) {
      // Start fading out container 2
      setContainer2FadeOut(true);
    }
  }, [createEventClicked, container2FadeOut]);

  // Fade in container 3 after container 2 has faded out
  useEffect(() => {
    if (container2FadeOut && !container3FadeIn) {
      const timer = setTimeout(() => {
        setContainer3FadeIn(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [container2FadeOut, container3FadeIn]);

  // ========== NEW CLEAN CHECKMARK LOGIC ==========
  
  // Function to position checkmark to the right of the title
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
    if (!selectedCocktails.includes(cocktailName)) return; // Only if cocktail is in list

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
      color: #800080;
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

  // Effect to update current cocktail name and check for checkmark
  useEffect(() => {
    // Temporarily disabled fade check - always run
    // if (!container3FadeIn) return;

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
        
        // Check if checkmark exists for this cocktail
        const checkmark = document.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
        setHasCheckmark(!!checkmark);
        
        // If fade is enabled (arrow was clicked), check and fade checkmark
        if (allowCheckmarkFade) {
          checkAndFadeCheckmark(cocktailName);
        }
      } else if (cocktailName === currentCocktailName) {
        // Even if name hasn't changed, re-check checkmark state (in case it was added/removed)
        const checkmark = document.querySelector(`.pos-checkmark[data-cocktail-id="${cocktailName}"]`);
        setHasCheckmark(!!checkmark);
      }
    };

    // Update immediately and on interval
    updateCurrentCocktail();
    const interval = setInterval(updateCurrentCocktail, 300); // More frequent checks
    
    return () => clearInterval(interval);
  }, [container3FadeIn, allowCheckmarkFade, selectedCocktails, currentCocktailName]);

  return (
    <>
      <style>{`
        .pos-tablet-container {
          aspect-ratio: 16 / 10 !important;
          width: 100%;
          height: auto;
          max-width: 100%;
          max-height: 100%;
          font-size: clamp(0.5rem, 1.2vw, 3rem);
          font-family: 'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }
        .pos-manager {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pos-tablet-container * {
          box-sizing: border-box;
          font-family: 'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-weight: 300;
        }
        .pos-tablet-container input::placeholder {
          color: #9CA3AF;
        }
        .pos-tablet-container input[type="date"]:invalid {
          color: #9CA3AF;
        }
        @media (min-width: 1200px) {
          .pos-tablet-container {
            font-size: clamp(0.8rem, 1.5vw, 4rem);
          }
        }
        @media (min-width: 1600px) {
          .pos-tablet-container {
            font-size: clamp(1rem, 2vw, 5rem);
          }
        }
        /* Hide arrows inside MenuGallery component in Container 3 */
        .pos-tablet-container:nth-of-type(3) .menu-gallery-wrapper .cocktail-arrow-btn,
        .pos-tablet-container:nth-of-type(3) .menu-gallery-wrapper button.cocktail-arrow-btn {
          display: none !important;
          visibility: hidden !important;
        }
        /* Style ONLY our custom arrow buttons in Container 3 - remove shadows, ensure white */
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn {
          display: flex !important;
          color: #fff !important;
          z-index: 10 !important;
          position: relative !important;
          opacity: 1 !important;
        }
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn svg {
          stroke: #fff !important;
          stroke-width: 4 !important;
          filter: none !important;
        }
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn svg path {
          stroke: #fff !important;
          stroke-width: 4 !important;
          fill: none !important;
        }
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn:hover {
          color: #fff !important;
          transform: scale(1.2) !important;
          opacity: 1 !important;
        }
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn:hover svg {
          stroke: #fff !important;
          filter: none !important;
        }
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn:hover svg path {
          stroke: #fff !important;
        }
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn:active {
          transform: scale(1.15) !important;
          opacity: 1 !important;
          color: #fff !important;
        }
        .pos-tablet-container:nth-of-type(3) > div > div > div:last-child .cocktail-arrow-btn:active svg path {
          stroke: #fff !important;
        }
      `}</style>
      <div 
        className="pos-manager bg-gray-100 w-full h-full"
        style={{ 
          width: '100%',
          height: 'calc(100vh - 5em)', // Account for header
          paddingTop: '60px',
          paddingRight: '16px',
          paddingBottom: '16px',
          paddingLeft: '16px',
          boxSizing: 'border-box',
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '2%'
        }}
      >
        {/* First Tablet Container - 16:10 aspect ratio, fits available space */}
        {/* 16:10 = 1.6:1 ratio */}
          <div 
          className="pos-tablet-container bg-white shadow-2xl"
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            maxHeight: '100%',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '0.5em',
            aspectRatio: '16 / 10',
            flexShrink: 0,
            boxSizing: 'border-box',
            border: '0.3em solid purple',
            background: '#fff',
            opacity: 1,
            transition: 'none',
            pointerEvents: 'auto'
          }}
        >
          {/* ECHO POS Title - Fixed in upper left */}
          <div
            style={{
              position: 'absolute',
              top: '2%',
              left: '2%',
              zIndex: 1000,
              filter: 'drop-shadow(0.25em 0.2em 0.1em rgba(0, 0, 0, 0.1))'
            }}
          >
            <img 
              src="/assets/icons/Echo_.svg" 
              alt="ECHO" 
              style={{
                height: '1.2em',
                width: 'auto'
              }}
            />
          </div>

          {/* Container 1 Content Wrapper */}
          <div 
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
            {/* Gradient overlay - bottom half only */}
            <div 
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: 'linear-gradient(to top, rgba(85, 85, 85, 0.6) 0%, rgba(85, 85, 85, 0.5) 16%, rgba(85, 85, 85, 0.4) 32%, rgba(85, 85, 85, 0.25) 56%, rgba(85, 85, 85, 0.12) 80%, rgba(85, 85, 85, 0.04) 90%, rgba(85, 85, 85, 0.02) 94%, rgba(85, 85, 85, 0.01) 97%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 0
              }}
            />

          {/* Layer 1: CREATE AN EVENT */}
          {currentLayer === 1 && (
            <div 
              style={{
                width: '100%',
                height: '100%',
                padding: '4%',
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
                  fontSize: '1.2em',
                  fontWeight: 300,
                  textAlign: 'center',
                  margin: 0,
                  padding: '8% 0 2% 0',
                  background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                Create an event...
              </h1>

              {/* Package Selection Boxes */}
              <div 
                style={{
                  display: 'flex',
                  gap: '2%',
                  justifyContent: 'space-between',
                  flex: 1
                }}
              >
                {packages.map((pkg) => {
                  const borderWidth = pkg.id === 'all-inclusive' ? '0.4em' : 
                    pkg.id === 'cocktails-mocktails' ? '0.3em' : '0.2em';
                  
                  return (
                  <div
                    key={pkg.id}
                    style={{
                      flex: 1,
                      position: 'relative'
                    }}
                  >
                    <button
                      onClick={() => setSelectedPackage(pkg.id)}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: `${borderWidth} solid ${pkg.id === 'beer-wine' ? '#4B5563' : '#800080'}`,
                        borderRadius: '1em',
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
                        boxShadow: '0 0.5em 1em rgba(0, 0, 0, 0.15)',
                        opacity: (selectedPackage === pkg.id || hoveredPackage === pkg.id) ? 1 : (selectedPackage && selectedPackage !== pkg.id) ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => {
                        setHoveredPackage(pkg.id);
                      }}
                      onMouseLeave={(e) => {
                        setHoveredPackage(null);
                      }}
                    >
                    {/* Inner Container */}
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
                      {/* Section 1: Title */}
                      <div 
                        style={{ 
                          fontSize: '1.8em', 
                          fontWeight: 900, 
                          textAlign: 'center',
                          minHeight: '2.5em',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.2em',
                          marginBottom: pkg.id === 'beer-wine' ? '18px' : '6px'
                        }}
                      >
                        {(() => {
                          const titleStyle = {
                            background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                          };
                          
                          const cocktailsTitleStyle = {
                            background: 'linear-gradient(to bottom, #0f0f0f, #666)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                          };
                          
                          const allInclusiveTitleStyle = {
                            background: 'linear-gradient(to bottom, #000, #555)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                          };
                          
                          if (pkg.id === 'cocktails-mocktails') {
                            return (
                              <>
                                <span style={cocktailsTitleStyle}>
                                  Cocktails
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.7em',
                                    ...cocktailsTitleStyle
                                  }}
                                >
                                  (+ mocktails)
                                </span>
                              </>
                            );
                          } else if (pkg.id === 'all-inclusive') {
                            return (
                              <>
                                <span style={allInclusiveTitleStyle}>
                                  {pkg.title}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.7em',
                                    ...allInclusiveTitleStyle
                                  }}
                                >
                                  (get it all)
                                </span>
                              </>
                            );
                          } else if (pkg.id === 'mocktails') {
                            return (
                              <>
                                <span style={titleStyle}>
                                  {pkg.title}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.7em',
                                    ...titleStyle
                                  }}
                                >
                                  (keep it NA)
                                </span>
                              </>
                            );
                          } else {
                            return (
                              <span style={titleStyle}>
                                {pkg.title}
                              </span>
                            );
                          }
                        })()}
                      </div>

                      {/* Section 2: What's Included */}
                      <div 
                        style={{ 
                          fontSize: '1.2em', 
                          textAlign: 'center',
                          flex: '0.6',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5em',
                          marginTop: '-1.5%'
                        }}
                      >
                        {pkg.description.split('\n').map((line, idx) => (
                          <div key={idx}>
                            {line.split(/(\bmax\b)/i).map((part, partIdx) => 
                              part.toLowerCase() === 'max' ? (
                                <span key={partIdx} style={{ fontSize: '0.7em', color: '#9CA3AF' }}>
                                  {part}
                                </span>
                              ) : (
                                <span key={partIdx} style={pkg.id === 'all-inclusive' ? { fontSize: '0.85em' } : {}}>
                                  {part}
                                </span>
                              )
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Section 3: Cost */}
                      <div 
                        style={{ 
                          fontSize: '1.5em', 
                          fontWeight: 300, 
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.3em'
                        }}
                      >
                        <div>{pkg.price}</div>
                        {pkg.priceAfterTwoHours ? (
                          <div style={{ fontSize: '0.7em', color: '#9CA3AF' }}>
                            {pkg.priceAfterTwoHours}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.7em', color: '#9CA3AF' }}>
                            add-ons are available
                          </div>
                        )}
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
                  gap: '3%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2% 0'
                }}
              >
                {/* Number of People */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1%', flex: 1, maxWidth: '40%', position: 'relative', zIndex: 3 }}>
                  <label style={{ fontSize: '1em', fontWeight: 300 }}>
                    Number of people
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={numberOfPeople}
                    onChange={handleNumberOfPeopleChange}
                    onFocus={() => setFocusedInput('people')}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="Enter number"
                    style={{
                      fontSize: '0.9em',
                      padding: '2%',
                      border: `0.1em solid ${focusedInput === 'people' ? '#800080' : '#9CA3AF'}`,
                      borderRadius: '0.5em',
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: '#ffffff',
                      background: '#ffffff',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Date Picker */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1%', flex: 1, maxWidth: '40%', position: 'relative', zIndex: 3 }}>
                  <label style={{ fontSize: '1em', fontWeight: 300 }}>
                    Date of the event
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    onFocus={() => setFocusedInput('date')}
                    onBlur={() => setFocusedInput(null)}
                    style={{
                      fontSize: '0.9em',
                      padding: '2%',
                      border: `0.1em solid ${focusedInput === 'date' ? '#800080' : '#9CA3AF'}`,
                      borderRadius: '0.5em',
                      width: '100%',
                      boxSizing: 'border-box',
                      color: eventDate ? '#333' : '#9CA3AF',
                      backgroundColor: '#ffffff',
                      background: '#ffffff',
                      outline: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Layer 2: Placeholder for next layer */}
          {currentLayer === 2 && (
            <div 
              style={{
                width: '100%',
                height: '100%',
                padding: '4%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4%',
                background: '#fff'
              }}
            >
              <h1 style={{ fontSize: '1.2em', fontWeight: 300, color: '#333' }}>
                Layer 2 - Coming Soon
              </h1>
            </div>
           )}
          </div>
        </div>

        {/* Second Tablet Container - Same size with purple outline */}
        <div 
          className="pos-tablet-container bg-white shadow-2xl"
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            maxHeight: '100%',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '0.5em',
            aspectRatio: '16 / 10',
            flexShrink: 0,
            boxSizing: 'border-box',
            border: '0.3em solid purple',
            background: '#fff',
            opacity: 1,
            transition: 'none',
            pointerEvents: 'auto'
          }}
        >
          {/* ECHO POS Title - Fixed in upper left */}
          <div
            style={{
              position: 'absolute',
              top: '2%',
              left: '2%',
              zIndex: 1000,
              filter: 'drop-shadow(0.25em 0.2em 0.1em rgba(0, 0, 0, 0.1))'
            }}
          >
            <img 
              src="/assets/icons/Echo_.svg" 
              alt="ECHO" 
              style={{
                height: '1.2em',
                width: 'auto'
              }}
            />
          </div>

          {/* Container 2 Content Wrapper */}
          <div 
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
            {/* Gradient overlay - bottom half only */}
            <div 
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: 'linear-gradient(to top, rgba(85, 85, 85, 0.6) 0%, rgba(85, 85, 85, 0.5) 16%, rgba(85, 85, 85, 0.4) 32%, rgba(85, 85, 85, 0.25) 56%, rgba(85, 85, 85, 0.12) 80%, rgba(85, 85, 85, 0.04) 90%, rgba(85, 85, 85, 0.02) 94%, rgba(85, 85, 85, 0.01) 97%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 0
              }}
            />

          {/* Selected Package Title - Fixed in upper right */}
          {selectedPackage && (() => {
            const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
            return selectedPkg ? (
              <div
                style={{
                  position: 'absolute',
                  top: '2%',
                  right: '2%',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '0'
                }}
              >
                <div
                  style={{
                    fontSize: '1.2em',
                    fontWeight: 300,
                    textAlign: 'right',
                    background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  {selectedPkg.title}
                </div>
                {numberOfPeople && (
                  <div
                    style={{
                      fontSize: '1em',
                      fontWeight: 300,
                      textAlign: 'right',
                      background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}
                  >
                    {numberOfPeople} people
                  </div>
                )}
                {eventDate && (
                  <div
                    style={{
                      fontSize: '0.85em',
                      fontWeight: 300,
                      textAlign: 'right',
                      marginTop: '6px',
                      background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}
                  >
                    {eventDate}
                  </div>
                )}
              </div>
            ) : null;
          })()}
          {/* Add-ons Section */}
          <div 
            style={{
              width: '100%',
              height: '100%',
              padding: '110px 4% 30px 4%',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '4%',
              background: 'transparent'
            }}
          >
            {/* Title */}
            <h1 
              style={{
                fontSize: '1.2em',
                fontWeight: 300,
                textAlign: 'center',
                margin: 0,
                padding: '0',
                background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              Choose your add-ons...
            </h1>

            {/* Package Selection Boxes - filtered based on first container selection */}
            <div 
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4%',
                flex: 1
              }}
            >
              {/* Determine which boxes to show based on selectedPackage */}
              {(() => {
                let availableBoxes = [];
                if (selectedPackage === 'beer-wine') {
                  availableBoxes = [7, 8];
                } else if (selectedPackage === 'mocktails') {
                  availableBoxes = [1, 2, 3, 4, 7, 8];
                } else if (selectedPackage === 'cocktails-mocktails') {
                  availableBoxes = [1, 2, 3, 4, 7, 8];
                } else if (selectedPackage === 'all-inclusive') {
                  availableBoxes = [7, 8];
                } else {
                  availableBoxes = [];
                }

                const row1Boxes = availableBoxes.filter(box => box === 1 || box === 3 || box === 7);
                const row2Boxes = availableBoxes.filter(box => box === 2 || box === 4 || box === 8);
                const isTwoBoxesOnly = availableBoxes.length === 2;

                return (
                  <>
                    {/* Row 1 */}
                    {row1Boxes.length > 0 && (
                      <div 
                        style={{
                          display: 'flex',
                          gap: '2%',
                          justifyContent: isTwoBoxesOnly ? 'center' : 'space-between',
                          flex: isTwoBoxesOnly ? '0 0 50%' : '0 0 38%'
                        }}
                      >
                        {row1Boxes.map((boxNum) => {
                  const borderWidth = (boxNum === 2 || boxNum === 4 || boxNum === 8) ? '0.4em' : 
                    (boxNum === 1 || boxNum === 3 || boxNum === 7) ? '0.3em' : '0.2em';
                  const allAddOns = {
                    1: { title: 'Basic Brews', description: '+3 Beers', descriptionLine2: 'of your choice', price: '+$2pp/hr' },
                    2: { title: 'Master Brewer', description: '+6 Beers', descriptionLine2: 'of your choice', price: '+$4pp/hr' },
                    3: { title: 'House Wine', description: '+1 Red +1 White', descriptionLine2: 'of your choice', price: '+$2pp/hr' },
                    4: { title: 'Sommelier', description: '+3 Red +3 White', descriptionLine2: 'of your choice', price: '+$4pp/hr' },
                    7: { title: 'Custom Mocktail', description: '+1 Custom Mocktail', descriptionLine2: 'designed for you', price: '+$2pp/hr' },
                    8: { title: 'Custom Cocktail', description: '+1 Custom Cocktail', descriptionLine2: 'designed for you', price: '+$3pp/hr' }
                  };
                  const addOn = allAddOns[boxNum];
                  
                  return (
                  <div
                    key={`addon-${boxNum}`}
                    style={{
                      width: '32%',
                      flexShrink: 0,
                      position: 'relative'
                    }}
                  >
                    <button
                      onClick={() => {
                        const addOnId = `addon-${boxNum}`;
                        setSelectedAddOns(prev => 
                          prev.includes(addOnId) 
                            ? prev.filter(id => id !== addOnId)
                            : [...prev, addOnId]
                        );
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: `${borderWidth} solid ${(boxNum === 1 || boxNum === 3 || boxNum === 7 || boxNum === 2 || boxNum === 4 || boxNum === 8) ? '#800080' : '#9CA3AF'}`,
                        borderRadius: '1em',
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        padding: '3% 1.5% 5% 1.5%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2%',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: selectedAddOns.includes(`addon-${boxNum}`) ? '#000' : '#333',
                        transform: (hoveredAddOn === `addon-${boxNum}` || selectedAddOns.includes(`addon-${boxNum}`)) ? 'scale(1.05)' : 'scale(1)',
                        zIndex: (hoveredAddOn === `addon-${boxNum}` || selectedAddOns.includes(`addon-${boxNum}`)) ? 10 : 1,
                        position: 'relative',
                        boxShadow: '0 0.5em 1em rgba(0, 0, 0, 0.15)',
                        opacity: (!selectedAddOns.includes(`addon-${boxNum}`) && !(hoveredAddOn === `addon-${boxNum}`) && selectedAddOns.length > 0) ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => {
                        setHoveredAddOn(`addon-${boxNum}`);
                      }}
                      onMouseLeave={(e) => {
                        setHoveredAddOn(null);
                      }}
                    >
                      {/* Inner Container */}
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
                        {/* Section 1: Title */}
                        <div 
                          style={{ 
                            fontSize: '1.8em', 
                            fontWeight: 900, 
                            textAlign: 'center',
                            minHeight: '2.5em',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.2em',
                            marginBottom: '0'
                          }}
                        >
                          <span
                            style={{
                              background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text'
                            }}
                          >
                            {addOn.title}
                          </span>
                        </div>

                        {/* Section 2: Description */}
                        <div 
                          style={{ 
                            fontSize: '1.2em', 
                            textAlign: 'center',
                            flex: '0.6',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5em',
                            marginTop: '-1.5%',
                            marginBottom: '8px'
                          }}
                        >
                          <div>{addOn.description}</div>
                          {addOn.descriptionLine2 && (
                            <div style={{ fontSize: '0.9em', color: '#666' }}>{addOn.descriptionLine2}</div>
                          )}
                        </div>

                        {/* Section 3: Price or Quantity Selector */}
                        <div 
                          style={{ 
                            fontSize: '1.5em', 
                            fontWeight: 300, 
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3em',
                            minHeight: '4.5em',
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}
                        >
                          {(boxNum === 7 || boxNum === 8) && selectedAddOns.includes(`addon-${boxNum}`) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5em', alignItems: 'center' }}>
                              <div style={{ fontSize: '0.9em', fontWeight: 300, color: '#666' }}>
                                how many would you like to add?
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2em' }}>
                                <div style={{ 
                                  fontSize: '1.2em', 
                                  fontWeight: 400,
                                  minWidth: '2em',
                                  textAlign: 'center'
                                }}>
                                  {boxNum === 7 ? customMocktailQuantity : customCocktailQuantity}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1em' }}>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (boxNum === 7) {
                                        setCustomMocktailQuantity(prev => Math.max(1, prev + 1));
                                      } else {
                                        setCustomCocktailQuantity(prev => Math.max(1, prev + 1));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (boxNum === 7) {
                                          setCustomMocktailQuantity(prev => Math.max(1, prev + 1));
                                        } else {
                                          setCustomCocktailQuantity(prev => Math.max(1, prev + 1));
                                        }
                                      }
                                    }}
                                    style={{
                                      width: '1em',
                                      height: '1em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.5em',
                                      padding: 0
                                    }}
                                  >
                                    ▲
                                  </div>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (boxNum === 7) {
                                        setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                      } else {
                                        setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (boxNum === 7) {
                                          setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                        } else {
                                          setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                        }
                                      }
                                    }}
                                    style={{
                                      width: '1em',
                                      height: '1em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.5em',
                                      padding: 0
                                    }}
                                  >
                                    ▼
                                  </div>
                                </div>
                                <div style={{ 
                                  fontSize: '1.2em', 
                                  fontWeight: 300,
                                  marginLeft: '0.5em',
                                  color: '#333'
                                }}>
                                  ${boxNum === 7 ? customMocktailQuantity * 2 : customCocktailQuantity * 3}pp/hr
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>{addOn.price}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                  );
                        })}
                      </div>
                    )}

                    {/* Row 2 */}
                    {row2Boxes.length > 0 && (
                      <div 
                        style={{
                          display: 'flex',
                          gap: '2%',
                          justifyContent: isTwoBoxesOnly ? 'center' : 'space-between',
                          flex: isTwoBoxesOnly ? '0 0 50%' : '0 0 38%'
                        }}
                      >
                        {row2Boxes.map((boxNum) => {
                  const borderWidth = (boxNum === 2 || boxNum === 4 || boxNum === 8) ? '0.4em' : 
                    (boxNum === 1 || boxNum === 3 || boxNum === 7) ? '0.3em' : '0.2em';
                  const allAddOns = {
                    1: { title: 'Basic Brews', description: '+3 Beers', descriptionLine2: 'of your choice', price: '+$2pp/hr' },
                    2: { title: 'Master Brewer', description: '+6 Beers', descriptionLine2: 'of your choice', price: '+$4pp/hr' },
                    3: { title: 'House Wine', description: '+1 Red +1 White', descriptionLine2: 'of your choice', price: '+$2pp/hr' },
                    4: { title: 'Sommelier', description: '+3 Red +3 White', descriptionLine2: 'of your choice', price: '+$4pp/hr' },
                    7: { title: 'Custom Mocktail', description: '+1 Custom Mocktail', descriptionLine2: 'designed for you', price: '+$2pp/hr' },
                    8: { title: 'Custom Cocktail', description: '+1 Custom Cocktail', descriptionLine2: 'designed for you', price: '+$3pp/hr' }
                  };
                  const addOn = allAddOns[boxNum];
                  
                  return (
                  <div
                    key={`addon-${boxNum}`}
                    style={{
                      width: '32%',
                      flexShrink: 0,
                      position: 'relative'
                    }}
                  >
                    <button
                      onClick={() => {
                        const addOnId = `addon-${boxNum}`;
                        setSelectedAddOns(prev => 
                          prev.includes(addOnId) 
                            ? prev.filter(id => id !== addOnId)
                            : [...prev, addOnId]
                        );
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: `${borderWidth} solid ${(boxNum === 1 || boxNum === 3 || boxNum === 7 || boxNum === 2 || boxNum === 4 || boxNum === 8) ? '#800080' : '#9CA3AF'}`,
                        borderRadius: '1em',
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        padding: '3% 1.5% 5% 1.5%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2%',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: selectedAddOns.includes(`addon-${boxNum}`) ? '#000' : '#333',
                        transform: (hoveredAddOn === `addon-${boxNum}` || selectedAddOns.includes(`addon-${boxNum}`)) ? 'scale(1.05)' : 'scale(1)',
                        zIndex: (hoveredAddOn === `addon-${boxNum}` || selectedAddOns.includes(`addon-${boxNum}`)) ? 10 : 1,
                        position: 'relative',
                        boxShadow: '0 0.5em 1em rgba(0, 0, 0, 0.15)',
                        opacity: (!selectedAddOns.includes(`addon-${boxNum}`) && !(hoveredAddOn === `addon-${boxNum}`) && selectedAddOns.length > 0) ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => {
                        setHoveredAddOn(`addon-${boxNum}`);
                      }}
                      onMouseLeave={(e) => {
                        setHoveredAddOn(null);
                      }}
                    >
                      {/* Inner Container */}
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
                        {/* Section 1: Title */}
                        <div 
                          style={{ 
                            fontSize: '1.8em', 
                            fontWeight: 900, 
                            textAlign: 'center',
                            minHeight: '2.5em',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.2em',
                            marginBottom: '0'
                          }}
                        >
                          <span
                            style={{
                              background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text'
                            }}
                          >
                            {addOn.title}
                          </span>
                        </div>

                        {/* Section 2: Description */}
                        <div 
                          style={{ 
                            fontSize: '1.2em', 
                            textAlign: 'center',
                            flex: '0.6',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5em',
                            marginTop: '-1.5%',
                            marginBottom: '8px'
                          }}
                        >
                          <div>{addOn.description}</div>
                          {addOn.descriptionLine2 && (
                            <div style={{ fontSize: '0.9em', color: '#666' }}>{addOn.descriptionLine2}</div>
                          )}
                        </div>

                        {/* Section 3: Price or Quantity Selector */}
                        <div 
                          style={{ 
                            fontSize: '1.5em', 
                            fontWeight: 300, 
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3em',
                            minHeight: '4.5em',
                            justifyContent: 'center',
                            alignItems: 'center'
                          }}
                        >
                          {(boxNum === 7 || boxNum === 8) && selectedAddOns.includes(`addon-${boxNum}`) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5em', alignItems: 'center' }}>
                              <div style={{ fontSize: '0.9em', fontWeight: 300, color: '#666' }}>
                                how many would you like to add?
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2em' }}>
                                <div style={{ 
                                  fontSize: '1.2em', 
                                  fontWeight: 400,
                                  minWidth: '2em',
                                  textAlign: 'center'
                                }}>
                                  {boxNum === 7 ? customMocktailQuantity : customCocktailQuantity}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1em' }}>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (boxNum === 7) {
                                        setCustomMocktailQuantity(prev => Math.max(1, prev + 1));
                                      } else {
                                        setCustomCocktailQuantity(prev => Math.max(1, prev + 1));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (boxNum === 7) {
                                          setCustomMocktailQuantity(prev => Math.max(1, prev + 1));
                                        } else {
                                          setCustomCocktailQuantity(prev => Math.max(1, prev + 1));
                                        }
                                      }
                                    }}
                                    style={{
                                      width: '1em',
                                      height: '1em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.5em',
                                      padding: 0
                                    }}
                                  >
                                    ▲
                                  </div>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (boxNum === 7) {
                                        setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                      } else {
                                        setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (boxNum === 7) {
                                          setCustomMocktailQuantity(prev => Math.max(1, prev - 1));
                                        } else {
                                          setCustomCocktailQuantity(prev => Math.max(1, prev - 1));
                                        }
                                      }
                                    }}
                                    style={{
                                      width: '1em',
                                      height: '1em',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.5em',
                                      padding: 0
                                    }}
                                  >
                                    ▼
                                  </div>
                                </div>
                                <div style={{ 
                                  fontSize: '1.2em', 
                                  fontWeight: 300,
                                  marginLeft: '0.5em',
                                  color: '#333'
                                }}>
                                  ${boxNum === 7 ? customMocktailQuantity * 2 : customCocktailQuantity * 3}pp/hr
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>{addOn.price}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                  );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Title below boxes */}
            <div 
              style={{ 
                margin: '0 auto', 
                width: '32%', 
                backgroundColor: 'white', 
                borderRadius: '0.5em', 
                border: '0.15em solid #800080', 
                padding: '1% 0', 
                opacity: 1,
                transform: createEventClicked ? 'scale(1.1)' : 'scale(1)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = createEventClicked ? 'scale(1.1)' : 'scale(1)';
              }}
              onClick={() => {
                setCreateEventClicked(true);
              }}
            >
              <button
                style={{
                  fontSize: '1em',
                  fontWeight: 300,
                  textAlign: 'center',
                  width: '100%',
                  background: 'transparent',
                  backgroundImage: 'linear-gradient(to bottom, #1a1a1a, #888)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                  border: 'none',
                  borderRadius: '0.5em',
                  cursor: 'pointer',
                  fontFamily: "'Montserrat', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                  padding: 0,
                  pointerEvents: 'none'
                }}
              >
                Choose your menu!
              </button>
            </div>
          </div>

          </div>
        </div>

        {/* Third Tablet Container - Same size with purple outline */}
        <div 
          className="pos-tablet-container bg-white shadow-2xl"
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            maxHeight: '100%',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '0.5em',
            aspectRatio: '16 / 10',
            flexShrink: 0,
            boxSizing: 'border-box',
            border: '0.3em solid purple',
            background: '#fff',
            opacity: 1,
            transition: 'none',
            pointerEvents: 'auto'
          }}
        >
          {/* ECHO POS Title - Fixed in upper left */}
          <div
            style={{
              position: 'absolute',
              top: '2%',
              left: '2%',
              zIndex: 1000,
              filter: 'drop-shadow(0.25em 0.2em 0.1em rgba(0, 0, 0, 0.1))'
            }}
          >
            <img 
              src="/assets/icons/Echo_.svg" 
              alt="ECHO" 
              style={{
                height: '1.2em',
                width: 'auto'
              }}
            />
          </div>

          {/* Container 3 Content Wrapper */}
          <div 
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
            {/* Gradient overlay - bottom half only */}
            <div 
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: 'linear-gradient(to top, rgba(85, 85, 85, 0.6) 0%, rgba(85, 85, 85, 0.5) 16%, rgba(85, 85, 85, 0.4) 32%, rgba(85, 85, 85, 0.25) 56%, rgba(85, 85, 85, 0.12) 80%, rgba(85, 85, 85, 0.04) 90%, rgba(85, 85, 85, 0.02) 94%, rgba(85, 85, 85, 0.01) 97%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 0
              }}
            />

            {/* Menu Gallery - fills entire container, ignores header */}
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
                <MenuGallery />
              </div>
            </div>

            {/* Navigation icons - bottom left */}
            <div 
              style={{
                position: 'absolute',
                bottom: '2%',
                left: '2%',
                zIndex: 10,
                display: 'flex',
                gap: '16px',
                pointerEvents: 'auto',
                padding: '40px 40px 0 40px'
              }}
            >
              {[
                { key: 'classics', label: 'Classics', icon: '/assets/icons/classics.svg', menuGalleryKey: 'cocktails' },
                { key: 'originals', label: 'Originals', icon: '/assets/icons/originals.svg', menuGalleryKey: 'mocktails' },
                { key: 'spirits', label: 'Spirits', icon: '/assets/icons/spirits.svg', menuGalleryKey: 'spirits' }
              ].map(({ key, label, icon, menuGalleryKey }) => {
                const isDisabled = key === 'spirits';
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (!isDisabled) {
                        // Remove all checkmarks when category icon is clicked (same as arrow behavior)
                        const allCheckmarks = document.querySelectorAll('.pos-checkmark');
                        allCheckmarks.forEach(checkmark => checkmark.remove());
                        setHasCheckmark(false);
                        
                        // Enable fade for new cocktail (same as arrow behavior)
                        setAllowCheckmarkFade(true);
                        
                        // Trigger navigation in MenuGallery using data-category-key attribute
                        // Map POSManager keys to MenuGallery keys: originals -> mocktails, classics -> cocktails
                        const menuGalleryButton = document.querySelector(`button[data-category-key="${menuGalleryKey}"]`);
                        if (menuGalleryButton) {
                          menuGalleryButton.click();
                        } else {
                          // Fallback: try to find by aria-label (for sidebar buttons)
                          const fallbackButton = document.querySelector(`button[aria-label="${label}"]`);
                          if (fallbackButton) fallbackButton.click();
                        }
                      }
                    }}
                    disabled={isDisabled}
                    aria-label={label}
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: 'transparent',
                      border: 'none',
                      cursor: isDisabled ? 'default' : 'pointer',
                      opacity: isDisabled ? 0 : 1,
                      pointerEvents: isDisabled ? 'none' : 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      transition: 'filter 0.2s'
                    }}
                  >
                    <img
                      src={icon}
                      alt={label}
                      style={{
                        width: '48px',
                        height: '48px',
                        display: 'block',
                        filter: isDisabled 
                          ? 'brightness(0) saturate(0) opacity(0)' 
                          : 'brightness(0) saturate(0) invert(1)',
                        transition: 'all 0.2s ease',
                        transform: 'scale(1)'
                      }}
                      onMouseEnter={(e) => {
                        if (!isDisabled) {
                          e.target.style.filter = 'brightness(0) saturate(0) invert(1)';
                          e.target.style.transform = 'scale(1.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isDisabled) {
                          e.target.style.filter = 'brightness(0) saturate(0) invert(1)';
                          e.target.style.transform = 'scale(1)';
                        }
                      }}
                      onClick={(e) => {
                        if (!isDisabled) {
                          e.target.style.transform = 'scale(1.15)';
                          setTimeout(() => {
                            e.target.style.transform = 'scale(1)';
                          }, 200);
                        }
                      }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Navigation arrows - bottom center */}
            <div 
              style={{
                position: 'absolute',
                bottom: '2%',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
                display: 'flex',
                gap: '40px',
                pointerEvents: 'auto'
              }}
            >
              <button
                className="cocktail-arrow-btn"
                onClick={() => {
                  // Remove all checkmarks when arrow is clicked
                  const allCheckmarks = document.querySelectorAll('.pos-checkmark');
                  allCheckmarks.forEach(checkmark => checkmark.remove());
                  setHasCheckmark(false);
                  
                  // Enable fade (becomes TRUE when arrow is clicked)
                  setAllowCheckmarkFade(true);
                  // Trigger next navigation in MenuGallery
                  const nextButton = document.querySelector('.cocktail-arrow-btn[aria-label="Next cocktail"]');
                  if (nextButton) nextButton.click();
                }}
                style={{
                  background: 'transparent',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
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
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.transform = 'scale(1.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                  <path d="M20 8l-8 8 8 8" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className="cocktail-arrow-btn"
                onClick={() => {
                  // Remove all checkmarks when arrow is clicked
                  const allCheckmarks = document.querySelectorAll('.pos-checkmark');
                  allCheckmarks.forEach(checkmark => checkmark.remove());
                  setHasCheckmark(false);
                  
                  // Enable fade (becomes TRUE when arrow is clicked)
                  setAllowCheckmarkFade(true);
                  // Trigger previous navigation in MenuGallery
                  const prevButton = document.querySelector('.cocktail-arrow-btn[aria-label="Previous cocktail"]');
                  if (prevButton) prevButton.click();
                }}
                style={{
                  background: 'transparent',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
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
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.transform = 'scale(1.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                  <path d="M12 8l8 8-8 8" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* ADD ITEM / REMOVE ITEM button - bottom right */}
            <div 
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
                    
                    if (selectedCocktails.includes(cocktailName)) {
                      // REMOVE ITEM: Remove from list and remove checkmark immediately
                      removeCheckmarkImmediately(cocktailName);
                      setSelectedCocktails(prev => prev.filter(name => name !== cocktailName));
                    } else {
                      // ADD ITEM: Add to list and show checkmark immediately
                      addCheckmarkImmediately(cocktailName);
                      setSelectedCocktails(prev => [...prev, cocktailName]);
                    }
                  }
                }
              }}
              style={{
                position: 'absolute',
                bottom: '2%',
                right: '2%',
                zIndex: 10,
                border: '2px solid #ffffff',
                borderRadius: 0,
                width: '200px',
                padding: '0.6rem 0',
                fontSize: '0.8rem',
                color: '#ffffff',
                fontWeight: 600,
                textAlign: 'center',
                letterSpacing: '0.12em',
                backgroundColor: 'transparent',
                display: 'block',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                transition: 'all 0.2s ease',
                pointerEvents: 'auto'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#ffffff';
                e.target.style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#ffffff';
              }}
            >
              {hasCheckmark ? 'REMOVE ITEM' : 'ADD ITEM'}
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
            {/* Row 1: Box selection from container 1 */}
            {selectedPackage && (() => {
              const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
              return selectedPkg ? (
                <div
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 300,
                    textAlign: 'right',
                    background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  {selectedPkg.title}
                </div>
              ) : null;
            })()}

            {/* Row 2: Number of people and date */}
            {(numberOfPeople || eventDate) && (
              <div
                style={{
                  fontSize: '0.75em',
                  fontWeight: 300,
                  textAlign: 'right',
                  background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  display: 'flex',
                  gap: '0.5em',
                  justifyContent: 'flex-end',
                  alignItems: 'center'
                }}
              >
                {numberOfPeople && <span>{numberOfPeople} people</span>}
                {numberOfPeople && eventDate && <span>•</span>}
                {eventDate && <span>{eventDate}</span>}
              </div>
            )}

            {/* Row 3: Add-ons from container 2 */}
            {selectedAddOns.length > 0 && (() => {
              const allAddOns = {
                1: { title: 'Basic Brews' },
                2: { title: 'Master Brewer' },
                3: { title: 'House Wine' },
                4: { title: 'Sommelier' },
                7: { title: customMocktailQuantity > 1 ? 'Custom Mocktails' : 'Custom Mocktail' },
                8: { title: customCocktailQuantity > 1 ? 'Custom Cocktails' : 'Custom Cocktail' }
              };
              
              const addOnTitles = selectedAddOns
                .map(addOnId => {
                  const boxNum = parseInt(addOnId.replace('addon-', ''));
                  return allAddOns[boxNum]?.title;
                })
                .filter(Boolean)
                .join(' • ');
              
              return (
                <div
                  style={{
                    fontSize: '0.75em',
                    fontWeight: 300,
                    textAlign: 'right',
                    background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  {addOnTitles}
                </div>
              );
            })()}
          </div>

          </div>
        </div>

        {/* Fourth Tablet Container - ECHO POS */}
        <div 
          className="pos-tablet-container bg-white shadow-2xl"
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            maxHeight: '100%',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '0.5em',
            aspectRatio: '16 / 10',
            flexShrink: 0,
            boxSizing: 'border-box',
            border: '0.3em solid purple',
            background: '#fff',
            opacity: 1,
            transition: 'none',
            pointerEvents: 'auto'
          }}
        >
          {/* ECHO POS Title - Fixed in upper left */}
          <div
            style={{
              position: 'absolute',
              top: '2%',
              left: '2%',
              zIndex: 1000,
              filter: 'drop-shadow(0.25em 0.2em 0.1em rgba(0, 0, 0, 0.1))'
            }}
          >
            <img 
              src="/assets/icons/Echo_.svg" 
              alt="ECHO" 
              style={{
                height: '1.2em',
                width: 'auto'
              }}
            />
          </div>

          {/* Container 4 Content Wrapper */}
          <div 
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
            {/* Gradient overlay - bottom half only */}
            <div 
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: 'linear-gradient(to top, rgba(85, 85, 85, 0.6) 0%, rgba(85, 85, 85, 0.5) 16%, rgba(85, 85, 85, 0.4) 32%, rgba(85, 85, 85, 0.25) 56%, rgba(85, 85, 85, 0.12) 80%, rgba(85, 85, 85, 0.04) 90%, rgba(85, 85, 85, 0.02) 94%, rgba(85, 85, 85, 0.01) 97%, transparent 100%)',
                pointerEvents: 'none',
                zIndex: 0
              }}
            />

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
            {/* Row 1: Box selection from container 1 */}
            {selectedPackage && (() => {
              const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
              return selectedPkg ? (
                <div
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 300,
                    textAlign: 'right',
                    background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  {selectedPkg.title}
                </div>
              ) : null;
            })()}

            {/* Row 2: Number of people and date */}
            {(numberOfPeople || eventDate) && (
              <div
                style={{
                  fontSize: '0.75em',
                  fontWeight: 300,
                  textAlign: 'right',
                  background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  display: 'flex',
                  gap: '0.5em',
                  justifyContent: 'flex-end',
                  alignItems: 'center'
                }}
              >
                {numberOfPeople && <span>{numberOfPeople} people</span>}
                {numberOfPeople && eventDate && <span>•</span>}
                {eventDate && <span>{eventDate}</span>}
              </div>
            )}

            {/* Row 3: Add-ons from container 2 */}
            {selectedAddOns.length > 0 && (() => {
              const allAddOns = {
                1: { title: 'Basic Brews' },
                2: { title: 'Master Brewer' },
                3: { title: 'House Wine' },
                4: { title: 'Sommelier' },
                7: { title: customMocktailQuantity > 1 ? 'Custom Mocktails' : 'Custom Mocktail' },
                8: { title: customCocktailQuantity > 1 ? 'Custom Cocktails' : 'Custom Cocktail' }
              };
              
              const addOnTitles = selectedAddOns
                .map(addOnId => {
                  const boxNum = parseInt(addOnId.replace('addon-', ''));
                  return allAddOns[boxNum]?.title;
                })
                .filter(Boolean)
                .join(' • ');
              
              return (
                <div
                  style={{
                    fontSize: '0.75em',
                    fontWeight: 300,
                    textAlign: 'right',
                    background: 'linear-gradient(to bottom, #1a1a1a, #888)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  {addOnTitles}
                </div>
              );
            })()}
          </div>

          </div>
        </div>

        {/* Fifth Tablet Container - Transaction Database */}
        <div 
          className="pos-tablet-container bg-white shadow-2xl"
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            maxHeight: '100%',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '0.5em',
            aspectRatio: '16 / 10',
            flexShrink: 0,
            boxSizing: 'border-box',
            border: '0.3em solid purple',
            background: '#fff',
            opacity: 1,
            pointerEvents: 'auto'
          }}
        >
          {/* ECHO POS Title - Fixed in upper left */}
          <div
            style={{
              position: 'absolute',
              top: '2%',
              left: '2%',
              zIndex: 1000,
              filter: 'drop-shadow(0.25em 0.2em 0.1em rgba(0, 0, 0, 0.1))'
            }}
          >
            <img 
              src="/assets/icons/Echo_.svg" 
              alt="ECHO" 
              style={{
                height: '1.2em',
                width: 'auto'
              }}
            />
          </div>

          {/* Container 5 Content Wrapper */}
          <div 
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              boxSizing: 'border-box'
            }}
          >
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

            {/* Two Boxes Container */}
            <div 
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'row',
                gap: '2%',
                overflow: 'hidden'
              }}
            >
              {/* Left Box */}
              <div 
                style={{
                  flex: 1,
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
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}>Event Type</span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#374151' }}>
                      {selectedPackage ? (() => {
                        const selectedPkg = packages.find(pkg => pkg.id === selectedPackage);
                        return selectedPkg ? selectedPkg.title : '—';
                      })() : '—'}
                    </span>
                  </div>
                </div>
                {/* Field 2: ADD-ONS */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}>Add-ons</span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#374151' }}>
                      {selectedAddOns.length > 0 ? (() => {
                        const allAddOns = {
                          1: { title: 'Basic Brews' },
                          2: { title: 'Master Brewer' },
                          3: { title: 'House Wine' },
                          4: { title: 'Sommelier' },
                          7: { title: customMocktailQuantity > 1 ? `Custom Mocktail (${customMocktailQuantity})` : 'Custom Mocktail' },
                          8: { title: customCocktailQuantity > 1 ? `Custom Cocktail (${customCocktailQuantity})` : 'Custom Cocktail' }
                        };
                        
                        const addOnTitles = selectedAddOns
                          .map(addOnId => {
                            const boxNum = parseInt(addOnId.replace('addon-', ''));
                            return allAddOns[boxNum]?.title;
                          })
                          .filter(Boolean)
                          .join(', ');
                        
                        return addOnTitles || '—';
                      })() : '—'}
                    </span>
                  </div>
                </div>
                {/* Field 3: Number of People */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}>Number of People</span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#374151' }}>{numberOfPeople || '—'}</span>
                  </div>
                </div>
                {/* Field 4: Date Requested and Time */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}>Date Requested</span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#374151' }}>
                      {eventDate ? `${eventDate}${/* time will be added later */ ''}` : '—'}
                    </span>
                  </div>
                </div>
                {/* Field 5 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '12.5%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '87.5%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 6: Location */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}>Location</span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 7: Menu Selection */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}>Menu Selection</span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#374151' }}>
                      {selectedCocktails.length > 0 ? selectedCocktails.join(', ') : '—'}
                    </span>
                  </div>
                </div>
                {/* Field 8 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', minHeight: '12.5%' }}>
                  <div style={{ width: '12.5%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '87.5%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
              </div>

              {/* Right Box */}
              <div 
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5em',
                  background: '#fff',
                  overflow: 'auto',
                  padding: '0.5em'
                }}
              >
                {/* Field 1 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 2 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 3 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 4 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 5 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 6 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 7 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', marginBottom: '0.5em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
                {/* Field 8 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '0.25em', minHeight: '12.5%' }}>
                  <div style={{ width: '25%', padding: '0.5em 0.4em', borderRight: '1px solid #d1d5db', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', fontWeight: 400, color: '#374151' }}></span>
                  </div>
                  <div style={{ width: '75%', padding: '0.5em', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55em', color: '#6b7280' }}>—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
      </>
    );
  };
  
  export default POSManager;

