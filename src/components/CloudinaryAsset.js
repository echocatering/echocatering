import React from 'react';

/**
 * Validates a Cloudinary URL
 * Must be an absolute URL starting with https://res.cloudinary.com/
 */
export function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.trim().startsWith('https://res.cloudinary.com/');
}

/**
 * CloudinaryAsset component
 * Automatically renders either an <img> or <video> depending on the URL
 *
 * Usage:
 * <CloudinaryAsset src="https://res.cloudinary.com/your-cloud/video/upload/my-video.mp4" />
 * <CloudinaryAsset src="https://res.cloudinary.com/your-cloud/image/upload/my-image.jpg" />
 */
export default function CloudinaryAsset({ src, style = {}, alt = '' }) {
  if (!isCloudinaryUrl(src)) return null;

  const trimmedSrc = src.trim();

  // Detect if it's a video by checking /video/upload/ in the URL
  const isVideo = trimmedSrc.includes('/video/upload/');

  if (isVideo) {
    return (
      <video
        autoPlay
        muted
        loop
        playsInline
        style={style}
      >
        <source src={trimmedSrc} type="video/mp4" />
      </video>
    );
  }

  // Otherwise, assume image
  return <img src={trimmedSrc} alt={alt} style={style} />;
}
