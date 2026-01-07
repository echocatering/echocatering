import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isCloudinaryUrl } from '../../utils/cloudinaryUtils';

// Menu categories configuration - matches MenuManager
const MENU_CATEGORIES = [
  { key: 'cocktails', label: 'COCKTAILS' },
  { key: 'mocktails', label: 'MOCKTAILS' },
  { key: 'beer', label: 'BEER' },
  { key: 'wine', label: 'WINE' },
  { key: 'spirits', label: 'SPIRITS' },
  { key: 'premix', label: 'PRE-MIX' }
];

const normalizeCategoryKey = (value = '') => {
  const key = String(value).toLowerCase();
  const categoryMap = {
    'classics': 'cocktails',
    'originals': 'mocktails'
  };
  return categoryMap[key] || key;
};

const FullMenu = ({ onItemClick, disableNavigation = false, defaultCategory = 'cocktails', hideSearch = false, containerHeight, logoHeight, selectedCocktails, setSelectedCocktails, hiddenCategories = [] }) => {
  const hiddenCategoriesList = hiddenCategories || [];
  const params = useParams();
  const recipeType = params?.recipeType;
  const navigate = useNavigate();
  const { apiCall } = useAuth();
  const [cocktails, setCocktails] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullMenu, setShowFullMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  // Get active category from route or state
  const activeCategory = useMemo(() => {
    const categoryKey = disableNavigation ? selectedCategory : (recipeType || defaultCategory);
    const fallback = MENU_CATEGORIES[0];
    return MENU_CATEGORIES.find((cat) => cat.key === categoryKey) || fallback;
  }, [recipeType, selectedCategory, disableNavigation, defaultCategory]);

  // Redirect to cocktails if no route (only if navigation is enabled)
  useEffect(() => {
    if (!disableNavigation && !recipeType) {
      navigate('/admin/inventory/recipes/cocktails', { replace: true });
    }
  }, [recipeType, navigate, disableNavigation]);

  // Fetch all cocktails from MenuManager's endpoint and recipes for backgroundColor
  useEffect(() => {
    const loadCocktails = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiCall('/menu-items?includeArchived=true');
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

        // Fetch recipes to get backgroundColor for premix items
        try {
          const recipeResponse = await apiCall('/recipes?type=premix');
          const premixRecipes = Array.isArray(recipeResponse) 
            ? recipeResponse 
            : (recipeResponse?.recipes || []);
          console.log('Loaded premix recipes:', premixRecipes.length, premixRecipes.map(r => ({
            title: r.title,
            backgroundColor: r.backgroundColor,
            _id: r._id
          })));
          setRecipes(premixRecipes);
        } catch (recipeErr) {
          console.warn('Failed to load recipes for backgroundColor:', recipeErr);
          setRecipes([]);
        }
      } catch (err) {
        setError(err.message || 'Failed to load menu items.');
      } finally {
        setLoading(false);
      }
    };
    loadCocktails();
  }, [apiCall]);

  // Filter cocktails based on active category and search
  const filteredCocktails = useMemo(() => {
    let filtered = cocktails.filter(cocktail => {
      const key = normalizeCategoryKey(cocktail.category);
      // Only show active items (not archived)
      const isActive = cocktail.status !== 'archived' && (cocktail.isActive !== false);
      if (!isActive) return false;
      
      // If showing full menu, include all categories
      if (showFullMenu) return true;
      
      // Otherwise filter by active category
      return key === normalizeCategoryKey(activeCategory.key);
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((cocktail) =>
        cocktail.name?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [cocktails, activeCategory.key, searchQuery, showFullMenu]);

  // Group cocktails by category for full menu view
  const cocktailsByCategory = useMemo(() => {
    const grouped = {};
    filteredCocktails.forEach(cocktail => {
      const key = normalizeCategoryKey(cocktail.category);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(cocktail);
    });
    return grouped;
  }, [filteredCocktails]);

  // Handle category tab change
  const handleTabChange = (category) => {
    setShowFullMenu(false);
    if (disableNavigation) {
      setSelectedCategory(category.key);
    } else {
      navigate(`/admin/inventory/recipes/${category.key}`);
    }
  };

  // Handle item click - navigate to MenuManager or use custom handler
  const handleItemClick = (cocktail) => {
    // Set selected item for ADD ITEM button
    setSelectedItem(cocktail);
    
    if (onItemClick) {
      onItemClick(cocktail);
      return;
    }
    if (disableNavigation) {
      return; // Don't navigate, just display
    }
    const categoryKey = normalizeCategoryKey(cocktail.category);
    const itemName = encodeURIComponent(cocktail.name);
    navigate(`/admin/menu?category=${categoryKey}&itemId=${itemName}`);
  };

  // Handle ADD ITEM / REMOVE ITEM button
  const handleAddItem = () => {
    if (!selectedItem || !setSelectedCocktails) return;
    const cocktailName = selectedItem.name;
    const isSelected = selectedCocktails?.includes(cocktailName) || false;
    
    if (isSelected) {
      // Remove item
      setSelectedCocktails(prev => prev.filter(name => name !== cocktailName));
    } else {
      // Add item
      setSelectedCocktails(prev => [...(prev || []), cocktailName]);
    }
  };

  // Check if selected item is in selectedCocktails
  const hasCheckmark = selectedItem && selectedCocktails?.includes(selectedItem.name);

  // Handle All Items button - show full menu
  const handleAllItems = () => {
    setShowFullMenu(true);
    setSelectedCategory(defaultCategory);
  };

  // Handle full menu button
  const handleFullMenuClick = () => {
    setShowFullMenu(true);
  };

  return (
    <div className="inventory-manager bg-white min-h-screen w-full p-8">
      <div className="max-w-6xl mx-auto">
        <header 
          className="mb-6 flex flex-col gap-4" 
          style={{ 
            position: containerHeight ? 'fixed' : 'relative',
            top: containerHeight && logoHeight ? `${24 + (logoHeight / 2) - (containerHeight / 16)}px` : (containerHeight ? '24px' : undefined),
            left: containerHeight ? 0 : undefined,
            right: containerHeight ? 0 : undefined,
            width: containerHeight ? '100%' : undefined,
            height: containerHeight ? `${containerHeight / 8}px` : undefined,
            zIndex: 1001, 
            pointerEvents: 'auto',
            padding: containerHeight ? '30px 2rem 0 2rem' : undefined,
            alignItems: containerHeight ? 'flex-end' : undefined,
            backgroundColor: containerHeight ? '#fff' : undefined
          }}
        >
          <div className="flex flex-wrap gap-4 items-center" style={{ justifyContent: containerHeight ? 'flex-end' : 'space-between' }}>
            {!hideSearch && (
              <div className="w-full md:w-auto flex items-center gap-2">
                <label className="text-xs uppercase tracking-widest text-gray-500 recipes-search-label">
                  Search items
                </label>
                <input
                  type="text"
                  className="recipes-search-input"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-2 items-center" style={{ pointerEvents: 'auto', zIndex: 1003 }}>
              <button 
                type="button" 
                className="recipes-primary-btn" 
                onClick={handleFullMenuClick}
                style={{ 
                  backgroundColor: '#d0d0d0',
                  color: '#000',
                  borderColor: '#b0b0b0',
                  flex: '1 1 auto',
                  minWidth: '160px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#b8b8b8';
                  e.currentTarget.style.borderColor = '#a0a0a0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#d0d0d0';
                  e.currentTarget.style.borderColor = '#b0b0b0';
                }}
              >
                FULL MENU
              </button>
              {MENU_CATEGORIES.filter(category => !hiddenCategoriesList.includes(category.key)).map((category) => {
                const isActiveTab = category.key === activeCategory.key && !showFullMenu;
                return (
                  <button
                    key={category.key}
                    className={`recipes-tab recipes-tab-white ${isActiveTab ? 'active' : ''}`}
                    onClick={() => handleTabChange(category)}
                    type="button"
                    style={{ pointerEvents: 'auto', cursor: 'pointer', zIndex: 1004, position: 'relative' }}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-3 rounded mb-4" style={{ marginTop: containerHeight && logoHeight ? `${24 + (logoHeight / 2) - (containerHeight / 16) + (containerHeight / 8)}px` : (containerHeight ? `${24 + (containerHeight / 8)}px` : undefined) }}>{error}</div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-12" style={{ marginTop: containerHeight && logoHeight ? `${24 + (logoHeight / 2) - (containerHeight / 16) + (containerHeight / 8)}px` : (containerHeight ? `${24 + (containerHeight / 8)}px` : undefined) }}>Loading menu items...</div>
        ) : showFullMenu ? (
          // Full Menu View - Show all categories with section titles
          <div className="recipes-list-container" style={{ marginTop: containerHeight && logoHeight ? `${24 + (logoHeight / 2) - (containerHeight / 16) + (containerHeight / 8)}px` : (containerHeight ? `${24 + (containerHeight / 8)}px` : undefined) }}>
            {Object.keys(cocktailsByCategory).length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                {searchQuery.trim()
                  ? `No items found matching "${searchQuery}"`
                  : 'No menu items found.'}
                        </div>
            ) : (
                  <div>
                {MENU_CATEGORIES.filter(category => !hiddenCategoriesList.includes(category.key)).map((category) => {
                  const categoryItems = cocktailsByCategory[category.key] || [];
                  if (categoryItems.length === 0) return null;
                  
                        return (
                    <div key={category.key} style={{ marginBottom: '3rem' }}>
                      <h2 className="text-2xl font-semibold text-gray-800 uppercase tracking-wide mb-4" style={{ 
                        borderBottom: '2px solid #e5e5e5', 
                        paddingBottom: '0.5rem' 
                      }}>
                        {category.label}
                      </h2>
                      <div className="recipes-grid">
                        {categoryItems.map((cocktail) => {
                          // Get backgroundColor from recipe for premix items
                          const isPremix = normalizeCategoryKey(cocktail.category) === 'premix';
                          const recipe = isPremix ? recipes.find(r => {
                            // Try matching by recipeId first, then by title/name
                            if (cocktail.recipeId && r._id === cocktail.recipeId) return true;
                            if (r.title && cocktail.name) {
                              return r.title.toUpperCase() === cocktail.name.toUpperCase();
                            }
                            return false;
                          }) : null;
                          const cardBackgroundColor = (isPremix && recipe?.backgroundColor) ? recipe.backgroundColor : '#fff';
                          
                          // Debug logging for premix items
                          if (isPremix) {
                            console.log('Premix item:', {
                              cocktailName: cocktail.name,
                              recipeFound: !!recipe,
                              recipeTitle: recipe?.title,
                              backgroundColor: recipe?.backgroundColor,
                              cardBackgroundColor
                            });
                          }
                          
                          // Check if this cocktail is selected - try multiple name variations
                          const isSelected = selectedCocktails?.some(selectedName => {
                            const cocktailName = cocktail.name || '';
                            const normalizedSelected = selectedName?.trim() || '';
                            const normalizedCocktail = cocktailName.trim();
                            return normalizedSelected === normalizedCocktail ||
                                   normalizedSelected.toLowerCase() === normalizedCocktail.toLowerCase();
                          }) || false;
                          
                          // Debug logging for Lavender G&T
                          if (cocktail.name && (cocktail.name.toLowerCase().includes('lavender') || cocktail.name.toLowerCase().includes('g&t'))) {
                            console.log('Lavender G&T check:', {
                              cocktailName: cocktail.name,
                              selectedCocktails: selectedCocktails,
                              isSelected: isSelected
                            });
                          }
                          
                          return (
                          <button
                            key={cocktail._id}
                            type="button"
                            className={`recipe-card ${isPremix && recipe?.backgroundColor ? 'recipe-card-premix' : ''}`}
                            style={{
                              backgroundColor: cardBackgroundColor, 
                              background: cardBackgroundColor,
                              border: '1px solid #e5e5e5',
                              aspectRatio: '1',
                              '--premix-bg-color': cardBackgroundColor,
                              position: 'relative'
                            }}
                            onClick={() => handleItemClick(cocktail)}
                          >
                            <div 
                              className="recipe-card-image" 
                              style={{ 
                                aspectRatio: '1', 
                                overflow: 'visible',
                                backgroundColor: isPremix && recipe?.backgroundColor ? recipe.backgroundColor : undefined,
                                background: isPremix && recipe?.backgroundColor ? recipe.backgroundColor : undefined,
                                position: 'relative'
                              }}
                            >
                              {(() => {
                                const videoSrc = cocktail.cloudinaryIconUrl || cocktail.cloudinaryVideoUrl || cocktail.videoUrl;
                                return isCloudinaryUrl(videoSrc) ? (
                                  <video
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    style={{ 
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      position: 'relative',
                                      zIndex: 1
                                    }}
                                  >
                                    <source src={videoSrc} type="video/mp4" />
                                  </video>
                                ) : null;
                              })()}
                              {(() => {
                                const videoSrc = cocktail.cloudinaryIconUrl || cocktail.cloudinaryVideoUrl || cocktail.videoUrl;
                                return !isCloudinaryUrl(videoSrc) ? (
                                  <div className="recipe-card-image-placeholder" style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    backgroundColor: isPremix && recipe?.backgroundColor ? recipe.backgroundColor : '#f5f5f5',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#999'
                                  }}>
                                    No Video
                                  </div>
                                ) : null;
                              })()}
                              {isSelected && (
                        <img
                          src="/assets/icons/cornercheck-01.svg"
                          alt="Selected"
                          style={{
                            position: 'absolute',
                            top: '0px',
                            right: '0px',
                            width: 'calc(100% / 6)',
                            height: 'calc(100% / 6)',
                            zIndex: 10000,
                            pointerEvents: 'none',
                            display: 'block',
                            opacity: 0.6,
                            filter: 'brightness(0) saturate(100%) invert(27%) sepia(94%) saturate(2476%) hue-rotate(88deg) brightness(96%) contrast(104%)',
                            objectFit: 'contain'
                          }}
                        />
                      )}
                    </div>
                      <div className="recipe-card-content">
                        <div className="recipe-card-title">{cocktail.name || 'Untitled'}</div>
                  </div>
                    </button>
                  );
                })}
                      </div>
                    </div>
                        );
                      })}
                    </div>
            )}
              </div>
            ) : (
          // Category View - Show items for selected category
          <div className="recipes-list-container" style={{ marginTop: containerHeight && logoHeight ? `${24 + (logoHeight / 2) - (containerHeight / 16) + (containerHeight / 8)}px` : (containerHeight ? `${24 + (containerHeight / 8)}px` : undefined) }}>
            {filteredCocktails.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                {searchQuery.trim()
                  ? `No items found matching "${searchQuery}"`
                  : `No ${activeCategory.label.toLowerCase()} items found.`}
              </div>
            ) : (
              <div className="recipes-grid">
                {filteredCocktails.map((cocktail) => {
                  // Get backgroundColor from recipe for premix items
                  const isPremix = normalizeCategoryKey(cocktail.category) === 'premix';
                  const recipe = isPremix ? recipes.find(r => {
                    // Try matching by recipeId first, then by title/name
                    if (cocktail.recipeId && r._id === cocktail.recipeId) return true;
                    if (r.title && cocktail.name) {
                      return r.title.toUpperCase() === cocktail.name.toUpperCase();
                    }
                    return false;
                  }) : null;
                  const cardBackgroundColor = (isPremix && recipe?.backgroundColor) ? recipe.backgroundColor : '#fff';
                  // Check if this cocktail is selected - try multiple name variations
                  const isSelected = selectedCocktails?.some(selectedName => {
                    const cocktailName = cocktail.name || '';
                    const normalizedSelected = selectedName?.trim() || '';
                    const normalizedCocktail = cocktailName.trim();
                    return normalizedSelected === normalizedCocktail ||
                           normalizedSelected.toLowerCase() === normalizedCocktail.toLowerCase();
                  }) || false;
                  
                  // Debug logging for Lavender G&T
                  if (cocktail.name && (cocktail.name.toLowerCase().includes('lavender') || cocktail.name.toLowerCase().includes('g&t'))) {
                    console.log('Lavender G&T check (category view):', {
                      cocktailName: cocktail.name,
                      selectedCocktails: selectedCocktails,
                      isSelected: isSelected
                    });
                  }
                  
                  return (
                    <button
                      key={cocktail._id}
                      type="button"
                      className={`recipe-card ${isPremix && recipe?.backgroundColor ? 'recipe-card-premix' : ''}`}
                      style={{ 
                        backgroundColor: cardBackgroundColor,
                        background: cardBackgroundColor,
                        border: '1px solid #e5e5e5',
                        aspectRatio: '1',
                        '--premix-bg-color': cardBackgroundColor,
                        position: 'relative'
                      }}
                      onClick={() => handleItemClick(cocktail)}
                    >
                    <div 
                      className="recipe-card-image" 
                      style={{ 
                        aspectRatio: '1', 
                        overflow: 'visible',
                        backgroundColor: isPremix && recipe?.backgroundColor ? recipe.backgroundColor : undefined,
                        background: isPremix && recipe?.backgroundColor ? recipe.backgroundColor : undefined,
                        position: 'relative'
                      }}
                    >
                      {(() => {
                        const videoSrc = cocktail.cloudinaryIconUrl || cocktail.cloudinaryVideoUrl || cocktail.videoUrl;
                        return isCloudinaryUrl(videoSrc) ? (
                          <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            style={{ 
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              position: 'relative',
                              zIndex: 1
                            }}
                          >
                            <source src={videoSrc} type="video/mp4" />
                          </video>
                        ) : (
                          <div className="recipe-card-image-placeholder" style={{ 
                            width: '100%', 
                            height: '100%', 
                            backgroundColor: isPremix && recipe?.backgroundColor ? recipe.backgroundColor : '#f5f5f5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999'
                          }}>
                            No Video
                          </div>
                        );
                      })()}
                      {isSelected && (
                        <img
                          src="/assets/icons/cornercheck-01.svg"
                          alt="Selected"
                          style={{
                            position: 'absolute',
                            top: '0px',
                            right: '0px',
                            width: 'calc(100% / 6)',
                            height: 'calc(100% / 6)',
                            zIndex: 10000,
                            pointerEvents: 'none',
                            display: 'block',
                            opacity: 0.6,
                            filter: 'brightness(0) saturate(100%) invert(27%) sepia(94%) saturate(2476%) hue-rotate(88deg) brightness(96%) contrast(104%)',
                            objectFit: 'contain'
                          }}
                        />
                      )}
                      </div>
                      <div className="recipe-card-content">
                        <div className="recipe-card-title">{cocktail.name || 'Untitled'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add Item / All Items buttons at bottom - only show when containerHeight is provided (POSUIPreview) */}
        {containerHeight && setSelectedCocktails && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '12px',
              padding: '20px 2rem',
              zIndex: 1001,
              pointerEvents: 'auto',
              background: 'transparent'
            }}
          >
            <button
              onClick={handleAddItem}
              disabled={!selectedItem}
              onMouseEnter={() => setHoveredButton('add-item')}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                background: 'transparent',
                border: `2px solid ${hoveredButton === 'add-item' ? '#000' : '#fff'}`,
                color: hoveredButton === 'add-item' ? '#000' : '#fff',
                padding: '10px 16px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: selectedItem ? 'pointer' : 'not-allowed',
                transition: 'border 0.2s ease, color 0.2s ease',
                fontSize: '1.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: selectedItem ? 1 : 0.5
              }}
            >
              {hasCheckmark ? 'REMOVE ITEM' : 'ADD ITEM'}
            </button>
            <button
              onClick={handleAllItems}
              onMouseEnter={() => setHoveredButton('all-items')}
              onMouseLeave={() => setHoveredButton(null)}
              style={{
                background: 'transparent',
                border: `2px solid ${hoveredButton === 'all-items' ? '#000' : '#fff'}`,
                color: hoveredButton === 'all-items' ? '#000' : '#fff',
                padding: '10px 16px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'border 0.2s ease, color 0.2s ease',
                fontSize: '1.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              All Items
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FullMenu;
