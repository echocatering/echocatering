import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { clearLogoCache } from '../../utils/logoUtils';

const Sidebar = () => {
  const location = useLocation();
  const { apiCall } = useAuth();
  const logoFileInputRef = useRef(null);
  const [currentLogo, setCurrentLogo] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    echoInterface: true,
    inventory: true,
    sales: false,
    calendar: false
  });

  const echoInterfaceNavItems = [
    { path: '/admin/menu', text: 'CREATE' },
    { path: '/admin/menu-ui/item', text: 'ITEMS' },
    { path: '/admin/inventory/recipes/cocktails', text: 'MENU' },
    { path: '/admin/gallery', text: 'PHOTOS' },
    { path: '/admin/pos/ui', text: 'EVENTS' },
    { path: '/admin/content', text: 'ABOUT' }
  ];

  const inventoryNavItems = [
    { path: '/admin/inventory/cocktails', text: 'COCKTAILS' },
    { path: '/admin/inventory/mocktails', text: 'MOCKTAILS' },
    { path: '/admin/inventory/wine', text: 'WINE' },
    { path: '/admin/inventory/beer', text: 'BEER' },
    { path: '/admin/inventory/spirits', text: 'SPIRITS' },
    { path: '/admin/inventory/preMix', text: 'PRE-MIX' },
    { path: '/admin/inventory/dryStock', text: 'DRY STOCK' }
  ];

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Logo management functions
  const fetchCurrentLogo = async () => {
    try {
      const response = await apiCall('/media/logo');
      
      // ONLY use Cloudinary URL - no fallbacks
      if (response && response.content && response.content.startsWith('https://res.cloudinary.com/')) {
        console.log('✅ Logo fetched (Cloudinary only):', response.content);
        setCurrentLogo(response.content);
        return;
      }
      
      // No Cloudinary URL found - show nothing
      console.log('⚠️  No Cloudinary logo found - displaying empty');
      setCurrentLogo(null);
    } catch (error) {
      console.error('Error fetching logo:', error);
      // No fallback - show nothing if error
      setCurrentLogo(null);
    }
  };

  const handleLogoFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileName = file.name.toLowerCase();
      const hasSvgExtension = fileName.endsWith('.svg');
      const hasPngExtension = fileName.endsWith('.png');
      
      // Log file info for debugging
      console.log('🔍 Logo file selected:', {
        name: file.name,
        type: file.type,
        size: file.size,
        hasSvgExtension,
        hasPngExtension
      });
      
      // Accept SVG files by extension or MIME type (preferred format)
      // SVG files can have various MIME types depending on the source
      const isSvgByMime = file.type && (
        file.type === 'image/svg+xml' ||
        file.type === 'image/svg' ||
        file.type === 'application/svg+xml' ||
        file.type === 'application/xml' ||
        (file.type.startsWith('text/') && hasSvgExtension)
      );
      
      if (hasSvgExtension || isSvgByMime) {
        console.log('✅ SVG file accepted, uploading...');
        handleLogoUpload(file);
        return;
      }
      
      // Accept PNG files by extension or MIME type
      if (hasPngExtension || file.type === 'image/png') {
        console.log('✅ PNG file accepted, uploading...');
        handleLogoUpload(file);
        return;
      }
      
      // Reject if neither condition is met
      console.log('❌ File rejected:', { fileName, fileType: file.type });
      alert(`Please select an SVG or PNG file. SVG files are preferred.\n\nReceived: ${file.name} (${file.type || 'unknown type'})`);
    }
  };

  const handleLogoUpload = async (file) => {
    try {
      console.log('📤 Starting logo upload:', {
        name: file.name,
        type: file.type,
        size: file.size
      });
      
      const formData = new FormData();
      formData.append('logo', file);
      
      console.log('📤 Calling /upload/logo endpoint...');
      const uploadResponse = await apiCall('/upload/logo', {
        method: 'POST',
        body: formData
      });

      console.log('📥 Upload response:', uploadResponse);

      const cloudinaryUrl = uploadResponse?.file?.cloudinaryUrl || uploadResponse?.file?.url || '';
      if (uploadResponse?.success && cloudinaryUrl.startsWith('https://res.cloudinary.com/')) {
        console.log('✅ Logo uploaded successfully:', cloudinaryUrl);
        setCurrentLogo(cloudinaryUrl);
        // Clear the logo cache so frontend immediately shows new logo
        clearLogoCache();
        // Clear the file input
        if (logoFileInputRef.current) {
          logoFileInputRef.current.value = '';
        }
      } else {
        console.error('❌ Upload response missing file info:', uploadResponse);
        alert('Upload failed: No Cloudinary URL returned from server');
      }
    } catch (error) {
      console.error('❌ Error uploading logo:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      alert(`Error uploading logo: ${errorMessage}\n\nFile: ${file.name}\nType: ${file.type || 'unknown'}`);
    }
  };

  // Fetch current logo on mount
  useEffect(() => {
    fetchCurrentLogo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div 
          className="sidebar-title"
          style={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center',
            cursor: 'pointer',
            gap: '0.5rem'
          }}
          onClick={() => logoFileInputRef.current?.click()}
        >
          <input
            type="file"
            accept=".svg,.png,image/svg+xml,image/svg,application/svg+xml,image/png"
            ref={logoFileInputRef}
            onChange={handleLogoFileSelect}
            style={{ display: 'none' }}
          />
          {currentLogo && currentLogo.startsWith('https://res.cloudinary.com/') ? (
            <img
              src={currentLogo}
              alt="Logo"
              style={{
                width: '172.8px',
                height: 'auto',
                objectFit: 'contain'
              }}
              onError={(e) => {
                console.error('Logo image failed to load:', currentLogo);
                e.target.style.display = 'none';
              }}
            />
          ) : (
            <div style={{
              width: '172.8px',
              height: '172.8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              fontSize: '0.8rem',
              border: '1px dashed #ccc',
              borderRadius: '4px'
            }}>
              No logo
            </div>
          )}
          <div style={{
            color: '#999',
            fontSize: '0.7rem',
            fontFamily: 'Montserrat, sans-serif',
            textAlign: 'center',
            fontWeight: 'normal'
          }}>
            click to replace logo
          </div>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        <div className="nav-section-header">
          ECHO INTERFACE
          <button 
            onClick={() => toggleSection('echoInterface')}
            className="expand-btn"
          >
            {expandedSections.echoInterface ? '−' : '+'}
          </button>
        </div>
        {expandedSections.echoInterface && echoInterfaceNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span className="nav-text">{item.text}</span>
          </NavLink>
        ))}
        
        <div className="nav-section-header">
          INVENTORY
          <button 
            onClick={() => toggleSection('inventory')}
            className="expand-btn"
          >
            {expandedSections.inventory ? '−' : '+'}
          </button>
        </div>
        {expandedSections.inventory && inventoryNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span className="nav-text">{item.text}</span>
          </NavLink>
        ))}
        
        <div className="nav-section-header">
          SALES
          <button 
            onClick={() => toggleSection('sales')}
            className="expand-btn"
          >
            {expandedSections.sales ? '−' : '+'}
          </button>
        </div>
        {expandedSections.sales && (
          <NavLink
            to="/admin/sales"
            className={`nav-item ${location.pathname === '/admin/sales' ? 'active' : ''}`}
          >
            <span className="nav-text">SALES</span>
          </NavLink>
        )}
        
        <div className="nav-section-header">
          CALENDAR
          <button 
            onClick={() => toggleSection('calendar')}
            className="expand-btn"
          >
            {expandedSections.calendar ? '−' : '+'}
          </button>
        </div>
        {expandedSections.calendar && (
          <NavLink
            to="/admin/calendar"
            className={`nav-item ${location.pathname === '/admin/calendar' ? 'active' : ''}`}
          >
            <span className="nav-text">CALENDAR</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
};

export default Sidebar;


