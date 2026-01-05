import React from 'react';
import EventRequestForm from './EventRequestForm';

export default function Contact({ isMobile, mobileCurrentPage, setMobileCurrentPage }) {
  // Mobile Layout
  if (isMobile) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#fff',
        position: 'relative',
        marginTop: '20px' // Add top margin for mobile
      }}>
        {/* Mobile Contact Content */}
        <div style={{
          padding: '2rem 1rem',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
              <h2 style={{ color: '#333', marginBottom: '1rem' }}>Get In Touch</h2>
              <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                Our team will review your request and contact you to discuss your event details, 
                provide a customized quote, and answer any questions you may have.
              </p>
              
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Phone</h3>
                  <p style={{ color: '#666' }}>(555) 123-4567</p>
                </div>
                
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Email</h3>
                  <p style={{ color: '#666' }}>info@echocatering.com</p>
                </div>
                
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Hours</h3>
                  <p style={{ color: '#666', marginBottom: '0.5rem' }}>Monday - Friday: 9:00 AM - 6:00 PM</p>
                  <p style={{ color: '#666' }}>Saturday: 10:00 AM - 4:00 PM</p>
                </div>
              </div>
            </div>
            
            <div style={{ textAlign: 'left' }}>
              <h2 style={{ color: '#333', marginBottom: '1rem' }}>Request a Quote</h2>
              <EventRequestForm />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="contact-page" style={{ marginTop: '20px' }}> {/* Add top margin for desktop */}
      <div className="container">
        <div className="contact-content">
          <div className="contact-info">
            <h2>Get In Touch</h2>
            <p>
              Our team will review your request and contact you to discuss your event details, 
              provide a customized quote, and answer any questions you may have.
            </p>
            
            <div className="contact-details">
              <div className="contact-item">
                <h3>Phone</h3>
                <p>(555) 123-4567</p>
              </div>
              
              <div className="contact-item">
                <h3>Email</h3>
                <p>info@echocatering.com</p>
              </div>
              
              <div className="contact-item">
                <h3>Hours</h3>
                <p>Monday - Friday: 9:00 AM - 6:00 PM</p>
                <p>Saturday: 10:00 AM - 4:00 PM</p>
              </div>
            </div>
          </div>
          
          <div className="contact-form-section">
            <h2>Request a Quote</h2>
            <EventRequestForm />
          </div>
        </div>
      </div>
    </div>
  );
}
