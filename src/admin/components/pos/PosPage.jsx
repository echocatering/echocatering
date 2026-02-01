/**
 * PosPage.jsx
 * 
 * Standalone POS sandbox page for echocatering.com
 * 
 * This page renders the POS UI in a full-viewport layout without the admin
 * sidebar or header. It's designed for touch-friendly tablet/kiosk use.
 * 
 * Features:
 * - Full viewport layout (no admin chrome)
 * - Vertical-only layout (9:19 aspect ratio)
 * - Auth protected
 * - Touch-friendly
 * - PWA installable on Android
 * - Offline support for existing tabs and modifiers
 * 
 * PWA Features:
 * - Standalone mode (no browser chrome)
 * - Offline capability for local state
 * - Prices always fetched from database when online
 * - Local tabs/modifiers persist across app restarts
 * 
 * Route: /admin/pos
 */

import React, { useEffect } from 'react';
import POSSalesUI from '../POSSalesUI';

/**
 * Register the POS service worker for PWA functionality
 */
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/pos-sw.js', {
        scope: '/'
      });
      
      console.log('[POS PWA] Service worker registered:', registration.scope);
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[POS PWA] New service worker available');
            }
          });
        }
      });
    } catch (error) {
      console.error('[POS PWA] Service worker registration failed:', error);
    }
  }
};

/**
 * Update the manifest link to use the POS-specific manifest
 */
const updateManifest = () => {
  // Find existing manifest link
  let manifestLink = document.querySelector('link[rel="manifest"]');
  
  if (manifestLink) {
    // Update to POS manifest
    manifestLink.href = '/pos-manifest.json';
  } else {
    // Create new manifest link
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/pos-manifest.json';
    document.head.appendChild(manifestLink);
  }
  
  // Update theme color for POS
  let themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = '#800080';
  }
  
  // Add apple-mobile-web-app meta tags for iOS
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const appleMeta = document.createElement('meta');
    appleMeta.name = 'apple-mobile-web-app-capable';
    appleMeta.content = 'yes';
    document.head.appendChild(appleMeta);
  }
  
  if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
    const appleStatusBar = document.createElement('meta');
    appleStatusBar.name = 'apple-mobile-web-app-status-bar-style';
    appleStatusBar.content = 'black-translucent';
    document.head.appendChild(appleStatusBar);
  }
};

/**
 * PosPage Component
 * 
 * A minimal wrapper that renders the POS UI in a full-viewport container.
 * No sidebar, no header - just the POS interface filling the screen.
 * Includes PWA support for Android installation.
 */
const PosPage = () => {
  const [deferredPrompt, setDeferredPrompt] = React.useState(null);
  const [installable, setInstallable] = React.useState(false);

  // Register service worker and update manifest on mount
  useEffect(() => {
    updateManifest();
    registerServiceWorker();
    
    // Update document title for PWA
    document.title = 'ECHO POS';
    
    // Handle PWA install prompt
    const handleBeforeInstallPrompt = (e) => {
      console.log('[POS PWA] Install prompt detected');
      e.preventDefault();
      setDeferredPrompt(e);
      setInstallable(true);
      
      // Show install button
      const btn = document.getElementById('pwa-install-btn');
      if (btn) {
        btn.style.display = 'block';
      }
      
      console.log('[POS PWA] App is installable - prompt ready');
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Check PWA install eligibility
    const checkInstallEligibility = () => {
      console.log('[POS PWA] Checking install eligibility...');
      console.log('[POS PWA] - HTTPS:', window.location.protocol === 'https:' || window.location.hostname === 'localhost');
      console.log('[POS PWA] - Service Worker:', 'serviceWorker' in navigator);
      console.log('[POS PWA] - Manifest:', document.querySelector('link[rel="manifest"]')?.href);
      
      // Check if manifest is valid
      if (document.querySelector('link[rel="manifest"]')) {
        fetch('/pos-manifest.json')
          .then(response => {
            if (response.ok) {
              return response.json();
            }
            throw new Error('Manifest not found');
          })
          .then(manifest => {
            console.log('[POS PWA] Manifest loaded:', manifest);
            console.log('[POS PWA] - Start URL:', manifest.start_url);
            console.log('[POS PWA] - Display:', manifest.display);
            console.log('[POS PWA] - Icons:', manifest.icons?.length || 0);
          })
          .catch(err => {
            console.error('[POS PWA] Manifest error:', err);
          });
      }
    };
    
    // Check eligibility after a short delay
    setTimeout(checkInstallEligibility, 2000);
    
    return () => {
      // Restore original manifest on unmount (if navigating away)
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        manifestLink.href = '/manifest.json';
      }
      document.title = 'ECHO Catering - Rochester, NY | Craft Cocktails & Events';
      
      // Clean up event listener
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  return (
    <div
      style={{
        // Fill the entire viewport
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        // Prevent any overflow/scrolling at the page level
        overflow: 'hidden',
        // Clean background
        background: '#f5f5f5',
        // Ensure touch events work properly
        touchAction: 'manipulation',
        // Prevent text selection on touch
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* 
        POSSalesUI with layoutMode="vertical" 
        - Forces 9:19 vertical layout
        - Hides orientation toggle
        - Ignores device rotation
      */}
      <POSSalesUI layoutMode="vertical" />
      
      {/* PWA Install Button */}
      <div
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 9999,
          background: '#800080',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          display: installable ? 'block' : 'none',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
        onClick={async () => {
          console.log('[POS PWA] Install button clicked');
          
          if (!deferredPrompt) {
            console.log('[POS PWA] No deferred prompt available');
            alert('Install not available. Try using Chrome menu > "Add to Home screen"');
            return;
          }
          
          try {
            // Show the install prompt
            console.log('[POS PWA] Showing install prompt...');
            deferredPrompt.prompt();
            
            // Wait for the user's response
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[POS PWA] User response: ${outcome}`);
            
            if (outcome === 'accepted') {
              console.log('[POS PWA] User accepted the install');
            } else {
              console.log('[POS PWA] User dismissed the install');
            }
            
            // Clear the deferred prompt
            setDeferredPrompt(null);
            setInstallable(false);
          } catch (error) {
            console.error('[POS PWA] Install error:', error);
            alert('Installation failed. Try using Chrome menu > "Add to Home screen"');
          }
        }}
        id="pwa-install-btn"
      >
        📱 Install App
      </div>
    </div>
  );
};

export default PosPage;
