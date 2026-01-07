import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { clearLogoCache, fetchLogo } from '../../utils/logoUtils';
import GalleryManager from './GalleryManager';
import ContentManager from './ContentManager';

const WebsiteManager = () => {
  const { apiCall } = useAuth();
  const [currentLogo, setCurrentLogo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [logoTitle, setLogoTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchCurrentLogo();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCurrentLogo = async () => {
    try {
      // Use the same fetchLogo utility that the frontend uses
      const logoData = await fetchLogo();
      
      // ONLY use Cloudinary URL - no fallbacks
      if (logoData && logoData.content && logoData.content.startsWith('https://res.cloudinary.com/')) {
        console.log('✅ Logo fetched (Cloudinary only):', logoData.content);
        setCurrentLogo(logoData);
        setLogoTitle(logoData.title || 'ECHO Catering Logo');
        return;
      }
      
      // No Cloudinary URL found - show nothing
      console.log('⚠️  No Cloudinary logo found - displaying empty');
      setCurrentLogo(null);
      setLogoTitle('ECHO Catering Logo');
    } catch (error) {
      console.error('Error fetching logo:', error);
      // No fallback - show nothing if error
      setCurrentLogo(null);
      setLogoTitle('ECHO Catering Logo');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setMessage(''); // Clear any previous messages
    }
  };

  const handleUploadAndSave = async () => {
    if (!selectedFile) {
      setMessage('Please select a file first');
      return;
    }

    console.log('=== LOGO UPLOAD DEBUG START ===');
    console.log('Selected file:', {
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
      lastModified: selectedFile.lastModified
    });

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setMessage('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (max 5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setMessage('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      console.log('Creating FormData...');
      const formData = new FormData();
      formData.append('logo', selectedFile);
      
      // Debug FormData contents
      console.log('FormData entries:');
      for (let [key, value] of formData.entries()) {
        console.log(`${key}:`, value);
      }

      console.log('FormData instanceof FormData:', formData instanceof FormData);
      console.log('FormData constructor:', formData.constructor.name);

      console.log('Making upload API call to /api/upload/logo...');
      const uploadResponse = await apiCall('/upload/logo', {
        method: 'POST',
        body: formData
      });

      console.log('=== UPLOAD RESPONSE ===');
      console.log('Full upload response:', uploadResponse);

      if (uploadResponse && uploadResponse.success) {
        console.log('✅ Logo uploaded successfully to Cloudinary');
        console.log('Cloudinary URL:', uploadResponse.file?.cloudinaryUrl);
        
        // The backend already updated the Content record with Cloudinary URL
        // Just refresh the logo display by fetching it again
        await fetchCurrentLogo();
        
        setMessage('Logo uploaded and saved successfully!');
        // Clear the logo cache so frontend immediately shows new logo
        clearLogoCache();
        // Reset file input and selected file
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setSelectedFile(null);
        console.log('✅ Logo upload completed successfully!');
      } else {
        console.error('❌ Upload response missing success or file property');
        console.error('Upload response:', uploadResponse);
        setMessage('Error: Upload response missing file information');
      }
    } catch (error) {
      console.error('=== UPLOAD ERROR ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Error response:', error.response);
      console.error('Full error object:', error);
      
      if (error.response) {
        setMessage(`Upload error: ${error.response.message || error.message}`);
      } else {
        setMessage(`Error uploading logo: ${error.message}`);
      }
    } finally {
      setUploading(false);
      console.log('=== LOGO UPLOAD DEBUG END ===');
    }
  };

  return (
    <div className="website-manager bg-white min-h-screen w-full">
      {/* Logo Section */}
      <div className="flex justify-center items-start pt-8 pb-20">
        <div className="bg-white rounded-lg max-w-6xl w-full">
          <h2 className="text-2xl font-bold mb-6 text-center">LOGO</h2>
          {currentLogo && currentLogo.content && currentLogo.content.startsWith('https://res.cloudinary.com/') ? (
            <div className="flex justify-center">
              <div className="flex flex-row items-start gap-12">
                <div className="logo-preview flex-shrink-0">
                  <div className="bg-white rounded-lg p-8 border border-gray-200" style={{width: '700px', height: '700px'}}>
                    <div className="flex justify-center items-center h-full">
                      <img 
                        src={currentLogo.content} 
                        alt="Current Logo"
                        style={{width: '600px', height: '600px'}}
                        className="object-contain"
                        onError={(e) => {
                          console.error('Logo image failed to load:', currentLogo.content);
                          e.target.style.display = 'none';
                        }}
                        onLoad={() => console.log('Logo loaded successfully:', currentLogo.content)}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="logo-info flex-shrink-0">
                  <div className="bg-white rounded-lg p-8 border border-gray-200 flex items-center justify-center" style={{width: '500px', height: '700px'}}>
                    <div className="w-full">
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Logo Title
                        </label>
                        <input
                          type="text"
                          value={logoTitle}
                          onChange={(e) => setLogoTitle(e.target.value)}
                          className="form-input w-full text-left"
                          placeholder="Enter logo title"
                        />
                      </div>
                      
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Select Logo Image
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="form-input w-full"
                          disabled={uploading}
                          ref={fileInputRef}
                        />
                        {selectedFile && (
                          <p className="text-sm text-green-600 mt-2">
                            Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                          </p>
                        )}
                        <p className="text-sm text-gray-500 mt-2">
                          Supported formats: JPEG, PNG, GIF, WebP. Maximum size: 5MB
                        </p>
                      </div>

                      <div className="mb-6">
                        <button
                          onClick={handleUploadAndSave}
                          className="btn btn-primary w-full"
                          disabled={uploading || !selectedFile}
                        >
                          {uploading ? 'Uploading...' : 'Upload and Save Logo'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-gray-500 mb-6">No logo currently set</p>
              {currentLogo && (
                <div className="bg-gray-100 p-4 rounded">
                  <p className="text-sm text-gray-600">Debug info:</p>
                  <p className="text-xs text-gray-500">Content: {currentLogo.content || 'undefined'}</p>
                  <p className="text-xs text-gray-500">Title: {currentLogo.title || 'undefined'}</p>
                </div>
              )}
            </div>
          )}

          <div className="border-t pt-6 mt-8">
            {uploading && (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="loading-spinner"></div>
                <span>Uploading logo...</span>
              </div>
            )}

            {message && (
              <div className={`mt-4 p-3 rounded ${
                message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {message}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gallery Section */}
      <div className="border-t pt-20 pb-20">
        <h2 className="text-2xl font-bold mb-6 text-center">GALLERY</h2>
        <GalleryManager />
      </div>

      {/* About Section */}
      <div className="border-t pt-20 pb-20">
        <h2 className="text-2xl font-bold mb-6 text-center">ABOUT</h2>
        <ContentManager />
      </div>
    </div>
  );
};

export default WebsiteManager;

