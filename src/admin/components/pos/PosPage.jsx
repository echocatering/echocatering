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
 * 
 * Future enhancements (not implemented):
 * - PWA/offline support
 * - Square POS integration
 * - Horizontal layout toggle
 * 
 * Route: /admin/pos
 */

import React from 'react';
import POSSalesUI from '../POSSalesUI';

/**
 * PosPage Component
 * 
 * A minimal wrapper that renders the POS UI in a full-viewport container.
 * No sidebar, no header - just the POS interface filling the screen.
 */
const PosPage = () => {
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
    </div>
  );
};

export default PosPage;
