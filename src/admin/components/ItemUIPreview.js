import React, { useRef, useState, useEffect, useMemo } from 'react';
import MenuGallery2 from '../../pages/menuGallery2';

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

export default function ItemUIPreview() {
  const [viewMode, setViewMode] = useState('web');
  const [orientation, setOrientation] = useState('horizontal'); // 'horizontal' (16:10) or 'vertical' (9:19)
  const [frameRef, frameSize] = useMeasuredSize();

  const frameReady = frameSize.width > 0 && frameSize.height > 0;

  // When showing vertical, center a 9:19 stage inside the 16:10 frame using height as 19 to compute width.
  const stageDims = useMemo(() => {
    if (!frameReady) return { width: 0, height: 0 };
    const { width: fw, height: fh } = frameSize;
    if (orientation === 'horizontal') return { width: fw, height: fh };
    // vertical: height is the limiting dimension; width = height * (9/19)
    const stageHeight = fh;
    const stageWidth = fh * (9 / 19);
    return { width: stageWidth, height: stageHeight };
  }, [frameReady, frameSize, orientation]);

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
          <span style={{ fontWeight: 600 }}>View Mode:</span>
          {['web', 'pos', 'menu'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                border: '1px solid #333',
                background: viewMode === mode ? '#333' : 'transparent',
                color: viewMode === mode ? '#fff' : '#333',
                padding: '6px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.85rem',
              }}
            >
              {mode}
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
              <MenuGallery2
                viewMode={viewMode}
                orientationOverride={orientation}
                outerWidth={stageDims.width}
                outerHeight={stageDims.height}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

