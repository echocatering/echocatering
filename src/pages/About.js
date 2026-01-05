import React, { useState, useEffect } from 'react';

export default function About({ isMobile, mobileCurrentPage, setMobileCurrentPage }) {
  const [aboutContent, setAboutContent] = useState({
    storyTitle: '',
    story: '',
    missionTitle: '',
    mission: '',
    teamTitle: '',
    team: '',
    images: {
      story: '',
      mission: '',
      team: ''
    },
    imageVisibility: {
      story: false,
      mission: false,
      team: false
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAboutContent();
  }, []);

  const fetchAboutContent = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🔄 Fetching about content...');
      
      const response = await fetch('/api/content/about');
      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📥 About content received:', data);
        console.log('👁️ Image visibility:', data.imageVisibility);
        setAboutContent(data);
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to fetch about content:', response.status, errorText);
        setError(`Failed to fetch content: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error fetching about content:', error);
      setError(`Network error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  // Build sections array with their data (used for both mobile and desktop)
  const buildSections = () => {
    // Prefer dynamic sections from API
    const apiSections = Array.isArray(aboutContent.sections) ? aboutContent.sections : [];
    const normalized = apiSections.map((sec, idx) => ({
      number: sec.id ?? sec.number ?? idx + 1,
      title: sec.title || '',
      content: sec.content || '',
      image: sec.image || '',
      imageVisibility: sec.imageVisibility !== false
    }));
    const visible = normalized.filter(sec => sec.imageVisibility);
    if (visible.length > 0) return visible;

    // Fallback to legacy story/mission/team if no sections present
    const legacySections = [];
    
    if (aboutContent.imageVisibility?.story && aboutContent.storyTitle && aboutContent.story) {
      legacySections.push({
        number: 1,
        title: aboutContent.storyTitle,
        content: aboutContent.story,
        image: aboutContent.images.story || ''
      });
    }
    
    if (aboutContent.imageVisibility?.mission && aboutContent.missionTitle && aboutContent.mission) {
      legacySections.push({
        number: 2,
        title: aboutContent.missionTitle,
        content: aboutContent.mission,
        image: aboutContent.images.mission || ''
      });
    }
    
    if (aboutContent.imageVisibility?.team && aboutContent.teamTitle && aboutContent.team) {
      legacySections.push({
        number: 3,
        title: aboutContent.teamTitle,
        content: aboutContent.team,
        image: aboutContent.images.team || ''
      });
    }

    return legacySections;
  };

  const sections = buildSections();

  // Mobile Layout
  if (isMobile) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#fff',
        position: 'relative',
        marginTop: '20px'
      }}>
        {/* Mobile About Content */}
        <div style={{
          padding: '2rem 1rem'
        }}>
          {sections.length > 0 ? (
            sections.map((section) => (
              <div 
                key={section.number}
                style={{
                  marginBottom: '3rem',
                  textAlign: 'center'
                }}
              >
                <img 
                  src={section.image} 
                  alt={section.title} 
                  style={{
                    width: '100%',
                    maxWidth: '500px',
                    height: 'auto',
            borderRadius: '0px',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                    marginBottom: '2rem',
                    margin: '0 auto 2rem auto'
                  }}
                />
                
                <div style={{ textAlign: 'left', maxWidth: '500px', margin: '0 auto' }}>
                  <h2 style={{ 
                    color: '#333', 
                    marginBottom: '1rem',
                    fontSize: '1.5rem',
                    fontWeight: '600'
                  }}>
                    {section.title}
                  </h2>
                  <p style={{ 
                    color: '#666', 
                    marginBottom: '1.5rem', 
                    lineHeight: '1.8',
                    fontSize: '1rem'
                  }}>
                    {section.content}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <p style={{ color: '#666', fontSize: '1.2rem' }}>
                No content available at this time.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop Layout
  console.log('🎨 Rendering About page with content:', aboutContent);
  
  // Render a section with alternating layout
  const renderSection = (section, idx, total) => {
    const isOdd = section.number % 2 === 1;
    const isTop = idx === 0;
    return (
      <div 
        key={section.number}
        className="about-section" 
        style={{
          position: 'relative',
          width: '100vw',
          left: '50%',
          right: '50%',
          marginLeft: '-50vw',
          marginRight: '-50vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          marginBottom: '6.25vh', // 1/16 of viewport height gap
          marginTop: 0,
          backgroundColor: section.number === 2 ? '#333333' : '#000000'
        }}
      >
        {isTop && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '45px',
              backgroundColor: '#ffffff',
              zIndex: 50,
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              pointerEvents: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginRight: '4%' }}>
              <div
                style={{
                  height: '45px',
                  width: '300px',
                  backgroundColor: 'transparent',
                  border: '1px solid #000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                  fontSize: '1rem',
                  fontWeight: 400,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: '#000'
                }}
              >
                ABOUT
              </div>
              <div
                style={{
                  width: '45px',
                  height: '45px',
                  backgroundColor: 'transparent',
                  clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
                  borderTop: '1px solid #000',
                  borderRight: '1px solid #000',
                  borderBottom: '1px solid #000',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        )}
        {isTop && (
          <div
            style={{
              position: 'absolute',
              top: '4%',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              zIndex: 50,
              pointerEvents: 'none'
            }}
          >
            <div
              style={{
                height: '45px',
                width: '300px',
                backgroundColor: '#ffffff',
                border: '1px solid #000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
                fontSize: '1rem',
                fontWeight: 400,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#000'
              }}
            >
              ABOUT
            </div>
            <div
              style={{
                width: '45px',
                height: '45px',
                backgroundColor: '#ffffff',
                clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
                borderTop: '1px solid #000',
                borderRight: '1px solid #000',
                borderBottom: '1px solid #000',
                boxSizing: 'border-box'
              }}
            />
          </div>
        )}
        <div 
          className="about-image" 
          style={{ 
            position: 'relative',
            width: '100%',
            aspectRatio: '19 / 9',
            overflow: 'hidden',
            backgroundColor: '#000'
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isOdd
                ? 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 50%)'
                : 'linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 50%)',
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
              zIndex: 1
            }}
          />
          <img 
            src={section.image} 
            alt={section.title} 
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              WebkitMaskImage: isTop
                ? 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)'
                : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)',
              maskImage: isTop
                ? 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)'
                : 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat'
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: isOdd ? '5%' : '55%',
              right: 'auto',
              background: 'rgba(255,255,255,0.9)',
              padding: '1.5rem 2rem',
            width: '40%',
            height: '50%',
              boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
              borderRadius: '8px',
              color: '#222',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              zIndex: 2,
            justifyContent: 'center'
            }}
          >
            {section.title && (
              <h2 style={{ 
                color: '#222', 
                margin: 0,
                fontSize: '1.8rem',
                fontWeight: '600',
                lineHeight: 1.2
              }}>
                {section.title}
              </h2>
            )}
            {section.content && (
              <p style={{ 
                color: '#444', 
                margin: 0, 
                lineHeight: 1.6,
                fontSize: '1rem'
              }}>
                {section.content}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="about-page" style={{ marginTop: 0, width: '100%', backgroundColor: '#000000', position: 'relative' }}>
      <div className="about-content" style={{ padding: '0 0 2rem 0', width: '100%', backgroundColor: '#000000' }}>
        {sections.length > 0 ? (
          sections.map((section, idx) => renderSection(section, idx, sections.length))
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <p style={{ color: '#666', fontSize: '1.2rem' }}>
              No content available at this time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
