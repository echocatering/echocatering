import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isCloudinaryUrl } from '../../utils/cloudinaryUtils';

const ContentManager = () => {
  const { apiCall } = useAuth();
  const [sections, setSections] = useState([
    {
      id: 1,
      title: 'new taste. lasting impressions',
      content: '',
      image: '',
      imageVisibility: true
    }
  ]);
  const [uploading, setUploading] = useState({});
  const [message, setMessage] = useState('');

  // Load content on component mount
  useEffect(() => {
    fetchAboutContent();
  }, []);

  const fetchAboutContent = async () => {
    console.log('🔄 fetchAboutContent called');
    try {
      const response = await apiCall('/content/about');
      if (response) {
        console.log('📥 API response received in fetchAboutContent:', response);

        // Prefer dynamic sections from API
        if (Array.isArray(response.sections) && response.sections.length > 0) {
          const normalized = response.sections.map((sec, idx) => ({
            id: sec.id ?? sec.number ?? idx + 1,
            title: sec.title || '',
            content: sec.content || '',
            image: sec.image || '',
            imageVisibility: sec.imageVisibility !== false
          }));
          setSections(normalized);
          return;
        }

        // Fallback: convert legacy story/mission/team to sections array
        const legacySections = [];
        if (response.storyTitle || response.story || response.images?.story) {
          legacySections.push({
            id: 1,
            title: response.storyTitle || 'new taste. lasting impressions',
            content: response.story || '',
            image: response.images?.story || '',
            imageVisibility: response.imageVisibility?.story !== false
          });
        }
        if (response.missionTitle || response.mission || response.images?.mission) {
          legacySections.push({
            id: 2,
            title: response.missionTitle || '',
            content: response.mission || '',
            image: response.images?.mission || '',
            imageVisibility: response.imageVisibility?.mission !== false
          });
        }
        if (response.teamTitle || response.team || response.images?.team) {
          legacySections.push({
            id: 3,
            title: response.teamTitle || '',
            content: response.team || '',
            image: response.images?.team || '',
            imageVisibility: response.imageVisibility?.team !== false
          });
        }
        
        if (legacySections.length > 0) {
          setSections(legacySections);
        }
      }
    } catch (error) {
      console.error('Error fetching about content:', error);
    }
  };

  const handleTextChange = (sectionId, field, value) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, [field]: value }
        : section
    ));
  };

  const handleSaveText = async () => {
    console.log('🚀 Starting to save about content...');
    console.log('📝 Current sections:', sections);
    
    try {
      // Send full sections array
      const aboutContent = {
        sections: sections.map((s, idx) => ({
          id: s.id || idx + 1,
          title: s.title || '',
          content: s.content || '',
          image: s.image || '',
          imageVisibility: s.imageVisibility !== false
        }))
      };
      
      console.log('📤 Sending to API:', {
        sectionsCount: sections.length
      });
      
      const response = await apiCall('/content/about', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(aboutContent)
      });

      console.log('✅ API response received:', response);

      if (response) {
        setMessage('About content saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('❌ Error saving about content:', error);
      setMessage('Error saving content. Please try again.');
    }
  };

  const toggleImageVisibility = (sectionId) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, imageVisibility: !section.imageVisibility }
        : section
    ));
  };

  const handleImageUpload = async (sectionId, event) => {
    console.log(`🖼️ Starting image upload for section ${sectionId}`);
    const file = event.target.files[0];
    if (!file) {
      console.log('❌ No file selected');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage('File size must be less than 5MB');
      return;
    }

    setUploading(prev => ({ ...prev, [sectionId]: true }));
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('aboutImage', file);
      formData.append('sectionNumber', sectionId.toString());

      // Upload to about-image endpoint which will save to about folder and copy to section file
      const uploadResponse = await apiCall('/upload/about-image', {
        method: 'POST',
        body: formData
      });

      console.log('📥 Upload response received:', uploadResponse);

      if (uploadResponse.file) {
        // Prioritize Cloudinary URL if available (this is what we want to use)
        // Fallback to sectionPath, then path, then default path
        const imagePath = uploadResponse.file.cloudinaryUrl || 
                         uploadResponse.file.sectionPath || 
                         uploadResponse.file.path || 
                         `/uploads/about/section${sectionId}.jpg`;
        
        console.log(`✅ Updating section ${sectionId} with image:`, imagePath);
        
        // Update the existing section with matching ID (don't create new section)
        // Convert both to numbers for comparison to handle string/number mismatch
        const sectionIdNum = Number(sectionId);
        setSections(prev => {
          const updatedSections = prev.map(section => {
            const sectionIdToCompare = Number(section.id);
            // Match by ID (not by index) to ensure we update the correct section
            if (sectionIdToCompare === sectionIdNum) {
              console.log(`✅ Found matching section with id ${section.id}, updating image to:`, imagePath);
              return { ...section, image: imagePath };
            }
            return section; // Keep other sections unchanged
          });
          
          console.log(`📊 Sections before update:`, prev.map(s => ({ id: s.id, hasImage: !!s.image })));
          console.log(`📊 Sections after update:`, updatedSections.map(s => ({ id: s.id, hasImage: !!s.image })));
          
          return updatedSections;
        });
        
        setMessage(`Section ${sectionId} image updated successfully!`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        console.error('❌ Upload response missing file object:', uploadResponse);
        setMessage('Upload failed - invalid response from server');
      }
    } catch (error) {
      console.error('❌ Error uploading image:', error);
      setMessage('Error uploading image. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, [sectionId]: false }));
    }
  };

  const handleAddSection = () => {
    const newSectionId = Math.max(...sections.map(s => s.id), 0) + 1;
    setSections(prev => [...prev, {
      id: newSectionId,
      title: '',
      content: '',
      image: '',
      imageVisibility: true
    }]);
  };

  const handleDeleteSection = (sectionId) => {
    if (sections.length <= 1) {
      setMessage('Cannot delete the last section');
      setTimeout(() => setMessage(''), 3000);
      return;
    }
    setSections(prev => prev.filter(section => section.id !== sectionId));
  };
  
  return (
    <div className="content-manager bg-white min-h-screen w-full flex justify-center items-start pt-8">
      <div className="bg-white rounded-lg max-w-6xl w-full">
        {/* Blank Header */}
        <header className="mb-6 flex flex-col gap-4" style={{ position: 'relative', zIndex: 1001, pointerEvents: 'auto' }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 className="text-3xl font-light tracking-wide uppercase" style={{ visibility: 'hidden' }}>
              ABOUT
            </h1>
          </div>
        </header>
        
        {/* Dynamic Sections - show all sections, including empty/new ones */}
        {sections.map((section, index) => (
          <div key={section.id} className="flex justify-center mb-12">
          <div className="flex flex-row items-start gap-12">
            <div className="text-editor flex-shrink-0">
              <div className="bg-white rounded-lg p-8 border border-gray-200" style={{width: '700px', height: '400px'}}>
                <div className="w-full h-full flex flex-col relative" style={{paddingLeft: '120px'}}>
                  <input
                    type="text"
                      value={section.title}
                      onChange={(e) => handleTextChange(section.id, 'title', e.target.value)}
                    className="mb-6 bg-transparent border-none outline-none focus:ring-0 rounded px-0 py-0"
                    style={{ color: '#333', fontSize: '1.5rem', fontWeight: 'normal', border: 'none', boxShadow: 'none', fontFamily: 'Montserrat, sans-serif' }}
                    placeholder="Enter section title..."
                  />
                  <textarea
                      value={section.content}
                      onChange={(e) => handleTextChange(section.id, 'content', e.target.value)}
                    className="w-full flex-1 resize-none bg-transparent border-none outline-none focus:ring-0 rounded px-0 py-0"
                      placeholder="Enter the section content..."
                    style={{ minHeight: '280px', color: '#666', lineHeight: '1.6', border: 'none', boxShadow: 'none', fontFamily: 'Montserrat, sans-serif' }}
                  />
                </div>
              </div>
            </div>
            
            <div className="image-manager flex-shrink-0">
              <div className="bg-white rounded-lg p-8 border border-gray-200 flex flex-col items-center justify-center" style={{width: '500px', height: '400px'}}>
                  <div 
                    className="bg-white rounded-lg mb-4 overflow-hidden" 
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      aspectRatio: '16/10',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                      {section.image && isCloudinaryUrl(section.image) ? (
                      <img 
                          src={section.image}
                        alt=""
                        className="w-full h-full object-cover rounded-lg"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 rounded-lg">
                        No image uploaded
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                        onChange={(e) => handleImageUpload(section.id, e)}
                      style={{ 
                        position: 'absolute',
                        left: '-9999px',
                        opacity: 0,
                        pointerEvents: 'none'
                      }}
                        id={`section-${section.id}-upload`}
                        disabled={uploading[section.id]}
                    />
                    <label
                        htmlFor={`section-${section.id}-upload`}
                      style={{ 
                        display: 'inline-flex',
                        background: 'transparent',
                        border: '2px solid #888',
                        color: '#888',
                        padding: '10px 16px',
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: 500,
                        fontSize: '14px',
                        cursor: uploading[section.id] ? 'not-allowed' : 'pointer',
                        textTransform: 'uppercase',
                        transition: 'all 0.2s ease',
                        opacity: uploading[section.id] ? 0.5 : 1,
                        outline: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        appearance: 'none',
                        width: '200px',
                        height: '42px',
                        boxSizing: 'border-box',
                        textAlign: 'center',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => {
                        if (!uploading[section.id]) {
                          e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                          e.currentTarget.style.setProperty('color', '#000000', 'important');
                          e.currentTarget.style.borderColor = '#000000';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!uploading[section.id]) {
                          e.currentTarget.style.setProperty('background', 'transparent', 'important');
                          e.currentTarget.style.setProperty('color', '#888', 'important');
                          e.currentTarget.style.borderColor = '#888';
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!uploading[section.id]) {
                          e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                          e.currentTarget.style.setProperty('color', '#000000', 'important');
                          e.currentTarget.style.borderColor = '#000000';
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!uploading[section.id] && e.currentTarget.matches(':hover')) {
                          e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                          e.currentTarget.style.setProperty('color', '#000000', 'important');
                          e.currentTarget.style.borderColor = '#000000';
                        } else if (!uploading[section.id]) {
                          e.currentTarget.style.setProperty('background', 'transparent', 'important');
                          e.currentTarget.style.setProperty('color', '#888', 'important');
                          e.currentTarget.style.borderColor = '#888';
                        }
                      }}
                    >
                        {uploading[section.id] ? 'Uploading...' : 'Upload Image'}
                      </label>
                      {sections.length > 1 && (
                        <button
                          onClick={() => handleDeleteSection(section.id)}
                          style={{ 
                            background: 'transparent',
                            border: '2px solid #888',
                            color: '#888',
                            padding: '10px 16px',
                            fontFamily: 'Montserrat, sans-serif',
                            fontWeight: 500,
                            fontSize: '14px',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            transition: 'all 0.2s ease',
                            outline: 'none',
                            WebkitAppearance: 'none',
                            MozAppearance: 'none',
                            appearance: 'none',
                            width: '200px',
                            height: '42px',
                            boxSizing: 'border-box',
                            textAlign: 'center',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                          e.currentTarget.style.setProperty('color', '#000000', 'important');
                          e.currentTarget.style.borderColor = '#000000';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.setProperty('background', 'transparent', 'important');
                          e.currentTarget.style.setProperty('color', '#888', 'important');
                          e.currentTarget.style.borderColor = '#888';
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                          e.currentTarget.style.setProperty('color', '#000000', 'important');
                          e.currentTarget.style.borderColor = '#000000';
                        }}
                        onMouseUp={(e) => {
                          if (e.currentTarget.matches(':hover')) {
                            e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                            e.currentTarget.style.setProperty('color', '#000000', 'important');
                            e.currentTarget.style.borderColor = '#000000';
                          } else {
                            e.currentTarget.style.setProperty('background', 'transparent', 'important');
                            e.currentTarget.style.setProperty('color', '#888', 'important');
                            e.currentTarget.style.borderColor = '#888';
                          }
                        }}
                      >
                        Delete Section
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Action Buttons - Moved Lower */}
        <div className="flex justify-center gap-4 mb-8" style={{ marginTop: '4rem', paddingTop: '2rem' }}>
          <button
            onClick={handleAddSection}
            disabled={Object.values(uploading).some(Boolean)}
            style={{ 
              background: 'transparent',
              border: '2px solid #888',
              color: '#888',
              padding: '10px 16px',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              cursor: Object.values(uploading).some(Boolean) ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              transition: 'all 0.2s ease',
              opacity: Object.values(uploading).some(Boolean) ? 0.5 : 1,
              outline: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none',
            }}
            onMouseEnter={(e) => {
              if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                e.currentTarget.style.setProperty('color', '#000000', 'important');
                e.currentTarget.style.borderColor = '#000000';
              }
            }}
            onMouseLeave={(e) => {
              if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', 'transparent', 'important');
                e.currentTarget.style.setProperty('color', '#888', 'important');
                e.currentTarget.style.borderColor = '#888';
              }
            }}
            onMouseDown={(e) => {
              if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                e.currentTarget.style.setProperty('color', '#000000', 'important');
                e.currentTarget.style.borderColor = '#000000';
              }
            }}
            onMouseUp={(e) => {
              if (!Object.values(uploading).some(Boolean) && e.currentTarget.matches(':hover')) {
                e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                e.currentTarget.style.setProperty('color', '#000000', 'important');
                e.currentTarget.style.borderColor = '#000000';
              } else if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', 'transparent', 'important');
                e.currentTarget.style.setProperty('color', '#888', 'important');
                e.currentTarget.style.borderColor = '#888';
              }
            }}
          >
            Add Section
          </button>
          <button
            onClick={handleSaveText}
            disabled={Object.values(uploading).some(Boolean)}
            style={{ 
              background: 'transparent',
              border: '2px solid #888',
              color: '#888',
              padding: '10px 16px',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              cursor: Object.values(uploading).some(Boolean) ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              transition: 'all 0.2s ease',
              opacity: Object.values(uploading).some(Boolean) ? 0.5 : 1,
              outline: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none',
            }}
            onMouseEnter={(e) => {
              if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                e.currentTarget.style.setProperty('color', '#000000', 'important');
                e.currentTarget.style.borderColor = '#000000';
              }
            }}
            onMouseLeave={(e) => {
              if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', 'transparent', 'important');
                e.currentTarget.style.setProperty('color', '#888', 'important');
                e.currentTarget.style.borderColor = '#888';
              }
            }}
            onMouseDown={(e) => {
              if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                e.currentTarget.style.setProperty('color', '#000000', 'important');
                e.currentTarget.style.borderColor = '#000000';
              }
            }}
            onMouseUp={(e) => {
              if (!Object.values(uploading).some(Boolean) && e.currentTarget.matches(':hover')) {
                e.currentTarget.style.setProperty('background', '#ffffff', 'important');
                e.currentTarget.style.setProperty('color', '#000000', 'important');
                e.currentTarget.style.borderColor = '#000000';
              } else if (!Object.values(uploading).some(Boolean)) {
                e.currentTarget.style.setProperty('background', 'transparent', 'important');
                e.currentTarget.style.setProperty('color', '#888', 'important');
                e.currentTarget.style.borderColor = '#888';
              }
            }}
          >
            Save All Content
          </button>
        </div>

        {/* Status Messages */}
        <div className="border-t pt-6">
          {Object.values(uploading).some(Boolean) && (
            <div className="flex items-center gap-2 text-blue-600 justify-center">
              <div className="loading-spinner"></div>
              <span>Uploading image...</span>
            </div>
          )}

          {message && (
            <div className={`mt-4 p-3 rounded text-center ${
              message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentManager;
