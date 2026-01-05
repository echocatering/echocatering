import React, { useState, useEffect, forwardRef, useCallback } from 'react';
import { fetchLogo } from '../utils/logoUtils';

const DynamicLogo = forwardRef(({ logoCanvasRef, onClick, className, altText, style }, ref) => {
  const [logoPath, setLogoPath] = useState('');
  const [logoAlt, setLogoAlt] = useState('ECHO Catering Logo');
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Always refresh cache buster on mount to force reload
    const timestamp = Date.now();
    setCacheBuster(timestamp);
    setIsLoaded(false);
    
    const loadLogo = async () => {
      try {
        const logoData = await fetchLogo();
        if (logoData && logoData.content) {
          setLogoPath(logoData.content);
          setLogoAlt(logoData.altText || 'ECHO Catering Logo');
        }
      } catch (error) {
        console.error('Error loading logo:', error);
        // Fallback to default logo
        setLogoPath('');
        setLogoAlt('ECHO Catering Logo');
      }
    };

    loadLogo();
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    console.log('Logo image loaded successfully');
  }, []);

  const handleError = useCallback((error) => {
    console.error('Error loading logo image:', error);
    setIsLoaded(true); // Still mark as loaded to prevent infinite retries
  }, []);

  return (
    <img
      ref={ref}
      src={`${logoPath}?v=${cacheBuster}`}
      alt={logoAlt}
      className={className}
      onClick={onClick}
      style={style}
      crossOrigin="anonymous"
      onLoad={handleLoad}
      onError={handleError}
    />
  );
});

DynamicLogo.displayName = 'DynamicLogo';

export default DynamicLogo;
