import React, { useState, useEffect } from 'react';

/**
 * Simple test page to see what URLs are being used
 * Add this route to see: /cloudinary-test
 */
export default function CloudinaryTest() {
  const [galleryImages, setGalleryImages] = useState([]);
  const [menuData, setMenuData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch gallery images (Cloudinary is source of truth)
        const galleryRes = await fetch('/api/media/gallery');
        if (!galleryRes.ok) {
          throw new Error(`Gallery fetch failed: ${galleryRes.status}`);
        }
        const galleryData = await galleryRes.json();
        setGalleryImages(galleryData);

        // Fetch menu gallery data
        const menuRes = await fetch('/api/menu-items/menu-gallery');
        if (!menuRes.ok) {
          throw new Error(`Menu fetch failed: ${menuRes.status}`);
        }
        const menuData = await menuRes.json();
        setMenuData(menuData);

        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
      <h1>Cloudinary URL Test</h1>
      
      <h2>Gallery Images ({galleryImages.length} total)</h2>
      <table border="1" cellPadding="5" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Filename</th>
            <th>cloudinaryUrl</th>
            <th>imagePath</th>
            <th>Using Cloudinary?</th>
          </tr>
        </thead>
        <tbody>
          {galleryImages.slice(0, 10).map((img, idx) => {
            const hasCloudinary = img.cloudinaryUrl && 
                                 img.cloudinaryUrl.startsWith('http');
            const usingCloudinary = hasCloudinary || 
                                   (img.imagePath && img.imagePath.startsWith('http'));
            
            return (
              <tr key={idx} style={{ backgroundColor: usingCloudinary ? '#d4edda' : '#f8d7da' }}>
                <td>{img.filename}</td>
                <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {img.cloudinaryUrl || '(empty)'}
                </td>
                <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {img.imagePath || '(empty)'}
                </td>
                <td>{usingCloudinary ? '✅ YES' : '❌ NO (using local)'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Menu Items - Cocktails</h2>
      {menuData?.cocktails && (
        <div>
          <h3>Cocktail Videos ({Object.keys(menuData.cocktails.cocktailInfo || {}).length} total)</h3>
          <table border="1" cellPadding="5" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Item Number</th>
                <th>Name</th>
                <th>cloudinaryVideoUrl</th>
                <th>videoUrl</th>
                <th>Using Cloudinary?</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(menuData.cocktails.cocktailInfo || {}).slice(0, 10).map(([key, info]) => {
                const hasCloudinary = info.cloudinaryVideoUrl && 
                                     typeof info.cloudinaryVideoUrl === 'string' &&
                                     info.cloudinaryVideoUrl.trim() !== '' &&
                                     info.cloudinaryVideoUrl.startsWith('http');
                const usingCloudinary = hasCloudinary || 
                                       (info.videoUrl && 
                                        typeof info.videoUrl === 'string' &&
                                        info.videoUrl.startsWith('http'));
                
                return (
                  <tr key={key} style={{ backgroundColor: usingCloudinary ? '#d4edda' : '#f8d7da' }}>
                    <td>{info.itemNumber}</td>
                    <td>{info.name}</td>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '10px' }}>
                      {info.cloudinaryVideoUrl ? (
                        <span title={info.cloudinaryVideoUrl}>
                          {info.cloudinaryVideoUrl.substring(0, 50)}...
                        </span>
                      ) : (
                        <span style={{ color: 'red' }}>(empty)</span>
                      )}
                    </td>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '10px' }}>
                      {info.videoUrl ? (
                        <span title={info.videoUrl}>
                          {info.videoUrl.substring(0, 50)}...
                        </span>
                      ) : (
                        <span style={{ color: 'red' }}>(empty)</span>
                      )}
                    </td>
                    <td>
                      {usingCloudinary ? '✅ YES' : '❌ NO (using local)'}
                      <br />
                      <small style={{ fontSize: '9px', color: '#666' }}>
                        Type: {typeof info.cloudinaryVideoUrl}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#fff3cd', border: '1px solid #ffc107' }}>
        <h3>Summary:</h3>
        <ul>
          <li>
            <strong>Green rows</strong> = Using Cloudinary URLs ✅
          </li>
          <li>
            <strong>Red rows</strong> = Falling back to local files ❌
          </li>
          <li>
            If you see red rows, those items need Cloudinary URLs in the database
          </li>
          <li>
            If ALL rows are red but database has URLs, the API isn't returning them correctly
          </li>
        </ul>
      </div>
    </div>
  );
}

