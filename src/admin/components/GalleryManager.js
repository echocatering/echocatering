import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const GalleryManager = () => {
  const { apiCall, token } = useAuth();
  
  // Modal state for alerts and confirmations
  const [modal, setModal] = useState({
    show: false,
    type: 'alert', // 'alert' or 'confirm'
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    confirmText: 'OK',
    cancelText: 'Cancel'
  });

  // Helper function to show alert modal
  const showAlert = (message, title = '') => {
    return new Promise((resolve) => {
      setModal({
        show: true,
        type: 'alert',
        title: title,
        message: message,
        onConfirm: () => {
          setModal(prev => ({ ...prev, show: false }));
          resolve();
        },
        onCancel: null,
        confirmText: 'OK',
        cancelText: 'Cancel'
      });
    });
  };

  // Helper function to show confirm modal
  const showConfirm = (message, title = '') => {
    return new Promise((resolve) => {
      setModal({
        show: true,
        type: 'confirm',
        title: title,
        message: message,
        onConfirm: () => {
          setModal(prev => ({ ...prev, show: false }));
          resolve(true);
        },
        onCancel: () => {
          setModal(prev => ({ ...prev, show: false }));
          resolve(false);
        },
        confirmText: 'Confirm',
        cancelText: 'Cancel'
      });
    });
  };
  const [images, setImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch gallery images on component mount
  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching gallery images...');
      
      // Cloudinary is the source of truth for gallery media.
      // Use nocache to ensure admin sees uploads/deletes immediately.
      const response = await apiCall('/media/gallery?nocache=1');
      console.log('📡 Gallery API response:', response);
      
      if (Array.isArray(response)) {
        // Admin UI currently renders <img>; keep it image-only for now.
        const onlyImages = response.filter((r) => r?.resourceType === 'image' && r?.url);
        console.log(`✅ Found ${onlyImages.length} Cloudinary images in gallery`);

        const normalized = onlyImages.map((r) => ({
          _id: r.publicId, // use publicId as stable identifier
          filename: String(r.publicId || '').split('/').pop() || r.publicId,
          title: r.publicId,
          isActive: true,
          cloudinaryUrl: r.url,
          thumbnailUrl: r.url,
          resourceType: r.resourceType,
          createdAt: r.createdAt,
        }));

        setImages(normalized);
      } else {
        console.error('❌ Gallery response is not an array:', response);
        setImages([]);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('❌ Error fetching images:', error);
      setError('Failed to fetch gallery images');
      setLoading(false);
    }
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      setSelectedFiles(files);
      // Upload files one at a time (single-file endpoint)
      await handleUpload(files);
    }
  };

  const handleUpload = async (filesToUpload = null) => {
    const files = filesToUpload || selectedFiles;
    if (files.length === 0) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setError('');
      setSuccess('');

      // Check if user is authenticated
      if (!token) {
        setError('❌ You must be logged in to upload images. Please log in to the admin panel first.');
        setUploading(false);
        return;
      }

      console.log('🔐 Authentication token found, proceeding with upload...');
      console.log(`📤 Uploading ${files.length} file(s) one at a time...`);

      // Upload files one at a time (single-file endpoint)
      // Backend creates DB records automatically - no need to call createGalleryEntry
      let successCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`   Uploading ${i + 1}/${files.length}: ${file.name}`);
        
        const formData = new FormData();
        formData.append('gallery', file);

        try {
          const response = await apiCall('/upload/gallery', {
            method: 'POST',
            body: formData
          });

          console.log(`   ✅ Upload ${i + 1} successful:`, response);
          successCount++;
          
          // Update progress
          setUploadProgress(Math.floor(((i + 1) / files.length) * 100));
        } catch (uploadError) {
          console.error(`   ❌ Upload ${i + 1} failed:`, uploadError);
          setError(`⚠️ Failed to upload ${file.name}: ${uploadError.message}`);
          // Continue with next file
        }
      }

      if (successCount > 0) {
        setSuccess(`🎉 Successfully uploaded ${successCount} of ${files.length} image(s)!`);
      }
      
      setSelectedFiles([]);
      setUploadProgress(0);
      
      // Refresh the images list
      console.log('🔄 Refreshing gallery...');
      await fetchImages();
      
      // Trigger hero refresh event for main site
      console.log('🔄 Triggering hero refresh event...');
      window.dispatchEvent(new CustomEvent('hero-refresh'));
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    } catch (error) {
      console.error('💥 Upload error:', error);
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        setError('❌ Network error. Please check your internet connection and try again.');
      } else if (error.message.includes('Authentication expired')) {
        setError('❌ Your session has expired. Please log in again.');
      } else {
        setError(`❌ Upload failed: ${error.message || 'Unknown error occurred'}`);
      }
    } finally {
      setUploading(false);
    }
  };

  // No longer needed - upload endpoint creates DB record automatically
  // const createGalleryEntry = async (fileInfo) => { ... };

  const handleDelete = async (imageId) => {
    const confirmed = await showConfirm('Are you sure you want to delete this image? This action cannot be undone.', 'This action can\'t be undone…');
    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      setError('');

      // Cloudinary-truth delete: delete the asset by publicId.
      await apiCall('/media/gallery', {
        method: 'DELETE',
        body: { publicId: imageId, resourceType: 'image' },
      });

      setSuccess('Image deleted successfully!');
      
      // Refresh the images list
      await fetchImages();
      
      // Adjust current index if needed
      if (currentImageIndex >= images.length - 1) {
        setCurrentImageIndex(Math.max(0, images.length - 2));
      }
      
      // Trigger hero refresh event for main site
      console.log('🔄 Triggering hero refresh event after deletion...');
      window.dispatchEvent(new CustomEvent('hero-refresh'));
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Delete error:', error);
      setError(error.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const previousImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToImage = (index) => {
    setCurrentImageIndex(index);
  };

  if (loading) {
    return (
      <div className="gallery-manager">
        <div className="flex justify-center items-center h-64">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Modal for alerts and confirmations */}
      {modal.show && (
        <div className="delete-modal">
          <div className="delete-modal-content">
            {modal.title && <p className="delete-warning">{modal.title}</p>}
            <p className={modal.title ? "delete-question" : "delete-warning"}>{modal.message}</p>
            <div className="delete-modal-actions">
              {modal.type === 'confirm' && (
                <button
                  type="button"
                  onClick={modal.onCancel}
                  style={{ background: '#f3f4f6', color: '#374151' }}
                >
                  {modal.cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={modal.onConfirm}
                className={modal.type === 'confirm' ? 'primary' : ''}
                style={modal.type === 'alert' ? { background: '#3b82f6', color: 'white' } : {}}
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="gallery-manager">
      {/* Hidden file input for direct upload */}
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        id="file-upload-input"
        disabled={uploading}
      />




      {/* Success/Error Messages */}
      {success && (
        <div className="alert alert-success mb-4">
          {success}
        </div>
      )}
      {error && (
        <div className="alert alert-error mb-4">
          {error}
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-700 font-medium">📤 Uploading Images...</span>
            <span className="text-blue-600 text-sm">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-xs text-blue-600 mt-1">
            Please wait while your images are being processed...
          </p>
        </div>
      )}

      {/* Gallery Display */}
      {images.length > 0 ? (
        <div className="mb-6">
          <div>
            {/* Main Image Display */}
            <div className="flex justify-center mb-4">
              <div className="text-center" style={{ width: '100%' }}>
                {/* Full-width image container */}
                <div className="mb-4 flex items-center justify-center" style={{width: '100%', height: '770px', minHeight: '770px'}}>
                  {images[currentImageIndex]?.cloudinaryUrl && images[currentImageIndex].cloudinaryUrl.startsWith('https://res.cloudinary.com/') ? (
                    <img
                      src={images[currentImageIndex].cloudinaryUrl}
                      alt={images[currentImageIndex]?.title || 'Gallery image'}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        console.error('Gallery image failed to load:', images[currentImageIndex].cloudinaryUrl);
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">No image available</p>
                    </div>
                  )}
                </div>
                
                {/* Navigation Arrows Below Image */}
                <div className="flex justify-center items-center gap-8">
                  <button
                    onClick={previousImage}
                    className="w-12 h-12 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={images.length <= 1}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15 18L9 12L15 6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={nextImage}
                    className="w-12 h-12 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={images.length <= 1}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 18L15 12L9 6" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>



            {/* Action Buttons */}
            <div className="flex justify-center gap-4 mb-4">
              <button
                onClick={() => document.getElementById('file-upload-input').click()}
                disabled={uploading}
                style={{ 
                  background: 'transparent',
                  border: '2px solid #ffffff',
                  color: '#ffffff',
                  padding: '10px 16px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                  transition: 'all 0.2s ease',
                  opacity: uploading ? 0.5 : 1,
                  outline: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  appearance: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                    e.currentTarget.style.setProperty('color', '#000000', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', 'transparent', 'important');
                    e.currentTarget.style.setProperty('color', '#ffffff', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
                onMouseDown={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                    e.currentTarget.style.setProperty('color', '#000000', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
                onMouseUp={(e) => {
                  if (!e.currentTarget.disabled && e.currentTarget.matches(':hover')) {
                    e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                    e.currentTarget.style.setProperty('color', '#000000', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  } else if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', 'transparent', 'important');
                    e.currentTarget.style.setProperty('color', '#ffffff', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
              >
                Upload Images
              </button>

              <button
                onClick={() => handleDelete(images[currentImageIndex]._id)}
                disabled={deleting}
                style={{ 
                  background: 'transparent',
                  border: '2px solid #ffffff',
                  color: '#ffffff',
                  padding: '10px 16px',
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                  transition: 'all 0.2s ease',
                  opacity: deleting ? 0.5 : 1,
                  outline: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  appearance: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                    e.currentTarget.style.setProperty('color', '#000000', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', 'transparent', 'important');
                    e.currentTarget.style.setProperty('color', '#ffffff', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
                onMouseDown={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                    e.currentTarget.style.setProperty('color', '#000000', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
                onMouseUp={(e) => {
                  if (!e.currentTarget.disabled && e.currentTarget.matches(':hover')) {
                    e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                    e.currentTarget.style.setProperty('color', '#000000', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  } else if (!e.currentTarget.disabled) {
                    e.currentTarget.style.setProperty('background', 'transparent', 'important');
                    e.currentTarget.style.setProperty('color', '#ffffff', 'important');
                    e.currentTarget.style.borderColor = '#ffffff';
                  }
                }}
              >
                {deleting ? 'Deleting...' : 'Delete Image'}
              </button>
            </div>

            {/* Thumbnail Navigation */}
            <div className="flex flex-wrap justify-center gap-2 max-w-full overflow-x-auto pb-2">
              {images.map((image, index) => {
                // Use Cloudinary URLs only - no local paths
                const thumbnailSrc = image.thumbnailUrl && image.thumbnailUrl.startsWith('https://res.cloudinary.com/')
                  ? image.thumbnailUrl
                  : (image.cloudinaryUrl && image.cloudinaryUrl.startsWith('https://res.cloudinary.com/')
                    ? image.cloudinaryUrl
                    : null);
                const imageSrc = image.cloudinaryUrl && image.cloudinaryUrl.startsWith('https://res.cloudinary.com/')
                  ? image.cloudinaryUrl
                  : null;
                
                return (
                <button
                  key={image._id}
                  onClick={() => goToImage(index)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                    index === currentImageIndex 
                      ? 'border-blue-500 scale-110' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  disabled={!imageSrc}
                >
                  {imageSrc ? (
                    <img
                      src={thumbnailSrc || imageSrc}
                      alt={image.title || 'Thumbnail'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error('Thumbnail failed to load, trying full image:', thumbnailSrc || imageSrc);
                        if (thumbnailSrc && imageSrc && e.target.src !== imageSrc) {
                          e.target.src = imageSrc;
                        } else {
                          e.target.style.display = 'none';
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400 text-xs">
                      No image
                    </div>
                  )}
                </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-center py-12">
            <p className="text-lg mb-4" style={{ color: '#ffffff' }}>
              No images in the gallery yet.
            </p>
            <button 
              onClick={() => document.getElementById('file-upload-input').click()}
              disabled={uploading}
              style={{ 
                background: 'transparent',
                border: '2px solid #ffffff',
                color: '#ffffff',
                padding: '10px 16px',
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 500,
                fontSize: '14px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                transition: 'all 0.2s ease',
                opacity: uploading ? 0.5 : 1,
                outline: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                  e.currentTarget.style.setProperty('color', '#000000', 'important');
                  e.currentTarget.style.borderColor = '#ffffff';
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.setProperty('background', 'transparent', 'important');
                  e.currentTarget.style.setProperty('color', '#ffffff', 'important');
                  e.currentTarget.style.borderColor = '#ffffff';
                }
              }}
              onMouseDown={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                  e.currentTarget.style.setProperty('color', '#000000', 'important');
                  e.currentTarget.style.borderColor = '#ffffff';
                }
              }}
              onMouseUp={(e) => {
                if (!e.currentTarget.disabled && e.currentTarget.matches(':hover')) {
                  e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                  e.currentTarget.style.setProperty('color', '#000000', 'important');
                  e.currentTarget.style.borderColor = '#ffffff';
                } else if (!e.currentTarget.disabled) {
                  e.currentTarget.style.setProperty('background', 'transparent', 'important');
                  e.currentTarget.style.setProperty('color', '#ffffff', 'important');
                  e.currentTarget.style.borderColor = '#ffffff';
                }
              }}
            >
              Upload Your First Image
            </button>
          </div>
        </div>
      )}


    </div>
    </>
  );
};

export default GalleryManager;


