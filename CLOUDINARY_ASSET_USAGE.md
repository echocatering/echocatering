# CloudinaryAsset Component - Usage Guide

## Import

```javascript
import CloudinaryAsset from '../components/CloudinaryAsset';
// or
import CloudinaryAsset from './components/CloudinaryAsset';
```

## Basic Examples

### Image
```javascript
<CloudinaryAsset
  src="https://res.cloudinary.com/demo/image/upload/sample.jpg"
  style={{ width: 300, height: 200 }}
  alt="Sample Image"
/>
```

### Video
```javascript
<CloudinaryAsset
  src="https://res.cloudinary.com/demo/video/upload/dog.mp4"
  style={{ width: 400, height: 300 }}
/>
```

## Real-World Examples from Your Codebase

### Example 1: Replace VideoBackground in menuGallery2.js

**Before:**
```javascript
function VideoBackground({ videoSrc }) {
  if (!isCloudinaryUrl(videoSrc)) {
    return null;
  }
  return (
    <video
      key={videoSrc}
      autoPlay
      muted
      loop
      playsInline
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    >
      <source src={videoSrc} type="video/mp4" />
    </video>
  );
}
```

**After (using CloudinaryAsset):**
```javascript
import CloudinaryAsset from '../components/CloudinaryAsset';

function VideoBackground({ videoSrc }) {
  return (
    <CloudinaryAsset
      src={videoSrc}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'center',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
```

### Example 2: Replace Image in event_gallery.js

**Before:**
```javascript
{isCloudinaryUrl(item.imageSrc) && (
  <img
    src={`${item.imageSrc}?w=1200&auto=format`}
    srcSet={`${item.imageSrc}?w=800&auto=format 800w, ${item.imageSrc}?w=1200&auto=format 1200w`}
    sizes="(max-width: 1200px) 50vw, 33vw"
    loading="lazy"
    alt={`Gallery ${item.sequenceIndex}-${item.itemIndex}`}
    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
  />
)}
```

**After (using CloudinaryAsset):**
```javascript
import CloudinaryAsset from '../components/CloudinaryAsset';

<CloudinaryAsset
  src={item.imageSrc ? `${item.imageSrc}?w=1200&auto=format` : ''}
  alt={`Gallery ${item.sequenceIndex}-${item.itemIndex}`}
  style={{ 
    width: '100%', 
    height: '100%', 
    objectFit: 'cover' 
  }}
/>
```

### Example 3: In FullMenu.js for cocktail videos

**Before:**
```javascript
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
      }}
    >
      <source src={videoSrc} type="video/mp4" />
    </video>
  ) : null;
})()}
```

**After (using CloudinaryAsset):**
```javascript
import CloudinaryAsset from '../../components/CloudinaryAsset';

const videoSrc = cocktail.cloudinaryIconUrl || cocktail.cloudinaryVideoUrl || cocktail.videoUrl;
<CloudinaryAsset
  src={videoSrc}
  style={{ 
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  }}
/>
```

## Key Features

1. **Auto-detection**: Automatically detects if URL is video (`/video/upload/`) or image
2. **Validation**: Only renders if URL starts with `https://res.cloudinary.com/`
3. **Video defaults**: Videos automatically have `autoPlay`, `muted`, `loop`, `playsInline`
4. **Returns null**: If URL is invalid, returns `null` (nothing renders)

## Props

- `src` (string, required): Cloudinary URL
- `style` (object, optional): CSS styles object
- `alt` (string, optional): Alt text for images

## Notes

- Component returns `null` if URL is not a valid Cloudinary URL
- Videos always use `<source>` with `type="video/mp4"`
- Images render as standard `<img>` tags
- URL is automatically trimmed of whitespace

