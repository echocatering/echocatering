import React from 'react';

export default function PlaceholderPage({ title }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', fontSize: '2rem', color: '#333' }}>
      {title}
    </div>
  );
} 