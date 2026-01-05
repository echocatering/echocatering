import React, { useRef, useEffect } from 'react';

const VideoEdgeTest = () => {
  const frontVideoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const frontVideo = frontVideoRef.current;
    const canvas = canvasRef.current;

    if (!frontVideo || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    const LOOP_TIME = 15.54; // Video loops at 15.54 seconds

    // Handle front video time update - loop at 15.58 seconds
    const handleFrontTimeUpdate = () => {
      if (!frontVideo.duration) return;
      
      const currentTime = frontVideo.currentTime;
      
      // Loop video at 15.58 seconds
      if (currentTime >= LOOP_TIME) {
        frontVideo.currentTime = 0;
      }
    };

    // Start video when ready
    const startVideo = () => {
      if (frontVideo.readyState >= 2) {
        frontVideo.play().catch(() => {});
      }
    };

    frontVideo.addEventListener('loadeddata', startVideo);
    frontVideo.addEventListener('timeupdate', handleFrontTimeUpdate);
    startVideo(); // Try to start if video is already loaded

    // Render loop
    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw front video
      if (frontVideo.readyState >= 2 && frontVideo.videoWidth > 0) {
        try {
          const scale = Math.max(
            canvas.width / frontVideo.videoWidth,
            canvas.height / frontVideo.videoHeight
          );
          const w = frontVideo.videoWidth * scale;
          const h = frontVideo.videoHeight * scale;
          const x = (canvas.width - w) / 2;
          const y = (canvas.height - h) / 2;
          
          // Draw video at full opacity
          ctx.save();
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(frontVideo, x, y, w, h);
          ctx.restore();
        } catch (e) {
          // Silent error handling
        }
      }

      requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', updateSize);
      frontVideo.removeEventListener('loadeddata', startVideo);
      frontVideo.removeEventListener('timeupdate', handleFrontTimeUpdate);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        overflow: 'hidden'
      }}
    >
      {/* Hidden video */}
      <video
        ref={frontVideoRef}
        src={`/uploads/test/background_fbf.mp4?${Date.now()}`}
        loop
        muted
        playsInline
        preload="auto"
        style={{ display: 'none' }}
      />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
};

export default VideoEdgeTest;
