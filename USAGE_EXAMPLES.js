// ============================================
// CloudinaryAsset Usage Examples
// ============================================

import CloudinaryAsset from './components/CloudinaryAsset';

// ============================================
// Example 1: Simple Image
// ============================================
function SimpleImageExample() {
  const imageUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
  
  return (
    <CloudinaryAsset
      src={imageUrl}
      alt="Sample Image"
      style={{ width: 300, border: '2px solid red' }}
    />
  );
}

// ============================================
// Example 2: Simple Video
// ============================================
function SimpleVideoExample() {
  const videoUrl = "https://res.cloudinary.com/demo/video/upload/dog.mp4";
  
  return (
    <CloudinaryAsset
      src={videoUrl}
      style={{ width: 400, height: 300, border: '2px solid blue' }}
    />
  );
}

// ============================================
// Example 3: With Dynamic Data (like from API)
// ============================================
function DynamicExample({ cocktail }) {
  // Use Cloudinary URL from your data
  const videoSrc = cocktail.cloudinaryVideoUrl || cocktail.videoUrl;
  
  return (
    <div>
      {videoSrc ? (
        <CloudinaryAsset
          src={videoSrc}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      ) : (
        <div>No video available</div>
      )}
    </div>
  );
}

// ============================================
// Example 4: In a Loop (Gallery)
// ============================================
function GalleryExample({ images }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
      {images.map((image, index) => (
        <CloudinaryAsset
          key={index}
          src={image.cloudinaryUrl || image.src}
          alt={image.title || `Image ${index}`}
          style={{
            width: '100%',
            height: 200,
            objectFit: 'cover'
          }}
        />
      ))}
    </div>
  );
}

// ============================================
// Example 5: Background Video
// ============================================
function BackgroundVideoExample({ videoUrl }) {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <CloudinaryAsset
        src={videoUrl}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, color: 'white' }}>
        Content on top of video
      </div>
    </div>
  );
}

// ============================================
// Example 6: Replacing existing code
// ============================================
// BEFORE:
// {isCloudinaryUrl(videoSrc) && (
//   <video autoPlay muted loop playsInline>
//     <source src={videoSrc} type="video/mp4" />
//   </video>
// )}

// AFTER:
// <CloudinaryAsset src={videoSrc} />

