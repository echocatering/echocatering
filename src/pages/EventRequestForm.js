import React, { useState, useEffect } from 'react';
// EmailJS is used for sending emails without a backend
// To enable email functionality:
// 1. Install: npm install @emailjs/browser
// 2. Sign up at emailjs.com
// 3. Replace the placeholder values in handleSubmit function
// 4. Uncomment the EmailJS code

const initialState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  ext: '',
  company: '',
  provide: '',
  eventNature: '',
  eventDate: '',
  startTime: '',
  endTime: '',
  numPeople: '',
  additionalInfo: '',
  hearAbout: '',
};

const hearAboutOptions = [
  '',
  'EventUp',
  'Instagram',
  'Facebook',
  'Venues by Tripleseat',
  'Search Engine',
  'Email',
  'Other',
];

const provideOptions = [
  '',
  'Cocktails & Mocktails',
  'Mocktails',
  'Beer & Wine',
  'Full Menu'
];

const longTextMinHeight = '160px';
const mediumTextMinHeight = '80px';

const fieldContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'stretch',
};

export default function EventRequestForm() {
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const updateWidth = () => setWidth(window.innerWidth);
    updateWidth(); // initialize
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const gridColumns = width >= 1200 ? 3 : width >= 720 ? 2 : 1;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    
    // Basic validation
    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.eventNature || !form.eventDate || !form.startTime || !form.endTime || !form.numPeople) {
      setError('Please fill in all required fields.');
      setSubmitting(false);
      return;
    }

    // For now, just log the form data and show success
    // TODO: Configure EmailJS with your service ID, template ID, and public key
    console.log('Event Request Form Data:', form);
    
    // Simulate form submission
    setTimeout(() => {
      setSuccess(true);
      setForm(initialState);
      setSubmitting(false);
    }, 1000);
  };

  if (success) {
    return (
      <div style={{ 
        padding: '3rem', 
        textAlign: 'center',
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
      }}>
        <h2 style={{
          fontSize: '1.8rem',
          fontWeight: 600,
          color: '#222',
          marginBottom: '1rem',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
          Thank you!
        </h2>
        <p style={{
          fontSize: '1rem',
          color: '#333',
          marginBottom: '1rem',
          lineHeight: '1.5',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
          Your event request has been submitted successfully.
        </p>
        <p style={{ 
          fontSize: '0.9rem', 
          color: '#666', 
          marginTop: '1rem',
          lineHeight: '1.5',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
          For now, your form data has been logged to the console. To enable actual email functionality, 
          please configure EmailJS with your service credentials.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        maxWidth: '100%',
        width: '100%',
        margin: 0,
        padding: '3rem',
        paddingTop: width >= 1200 ? '64px' : '3rem',
        borderRadius: '8px',
        fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
      }}
    >
      <h2
        style={{
          fontSize: '1.2rem',
          fontWeight: 600,
          color: '#222',
          marginBottom: '1rem',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}
      >
        Your Contact Information
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumns === 3
            ? 'repeat(3, minmax(0, 1fr))'
            : gridColumns === 2
              ? 'repeat(2, minmax(0, 1fr))'
              : '1fr',
          gap: '1rem 1.25rem',
          marginBottom: '2rem',
          alignItems: 'start'
        }}
      >
        {/* Nature of this Event */}
        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            First Name*
          </label>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Last Name*
          </label>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Email Address*
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Phone Number*
          </label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Ext.
          </label>
          <input
            name="ext"
            value={form.ext}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        <div>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Company
          </label>
          <input
            name="company"
            value={form.company}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>
      </div>

      <h2
        style={{
          fontSize: '1.2rem',
          fontWeight: 600,
          color: '#222',
          marginTop: '1rem',
          marginBottom: '1rem',
          paddingTop: gridColumns === 2 ? '48px' : '0',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}
      >
        Your Event Details
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumns === 3
            ? 'repeat(3, minmax(0, 1fr))'
            : gridColumns === 2
              ? 'repeat(2, minmax(0, 1fr))'
              : '1fr',
          gap: '1rem 1.25rem',
          marginBottom: '2rem',
          alignItems: 'start'
        }}
      >
        {/* Event Date */}
        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Event Date*
          </label>
          <input
            type="date"
            name="eventDate"
            value={form.eventDate}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        {/* Start Time */}
        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Start Time*
          </label>
          <input
            type="time"
            name="startTime"
            value={form.startTime}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        {/* End Time */}
        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            End Time*
          </label>
          <input
            type="time"
            name="endTime"
            value={form.endTime}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        {/* Number of People */}
        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Number of People*
          </label>
          <input
            type="number"
            name="numPeople"
            value={form.numPeople}
            onChange={handleChange}
            required
            min={1}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        {/* What can we provide? */}
        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            What can we provide?
          </label>
          <select
            name="provide"
            value={form.provide}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          >
            <option value="">Select an option</option>
            {provideOptions.slice(1).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div style={fieldContainerStyle}>
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            How did you hear about us?*
          </label>
          <select
            name="hearAbout"
            value={form.hearAbout}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              transition: 'border-color 0.3s ease'
            }}
          >
            <option value="">Select an option</option>
            {hearAboutOptions.slice(1).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Nature of this Event (after how did you hear) */}
        <div
          style={{
            ...fieldContainerStyle,
            gridColumn: gridColumns === 3 ? '1 / span 3' : gridColumns === 2 ? '1 / span 2' : '1 / span 1'
          }}
        >
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Nature of this Event*
          </label>
          <textarea
            name="eventNature"
            value={form.eventNature}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              minHeight: longTextMinHeight,
              resize: 'vertical',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>

        {/* Additional Info - same height and full width as nature */}
        <div
          style={{
            ...fieldContainerStyle,
            gridColumn: gridColumns === 3 ? '1 / span 3' : gridColumns === 2 ? '1 / span 2' : '1 / span 1'
          }}
        >
          <label style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 500,
            color: '#333',
            marginBottom: '0.5rem',
            fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
          }}>
            Is there any additional information you would like to add?
          </label>
          <textarea
            name="additionalInfo"
            value={form.additionalInfo}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
              minHeight: mediumTextMinHeight,
              resize: 'vertical',
              transition: 'border-color 0.3s ease'
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          color: '#dc2626',
          marginBottom: '1rem',
          fontSize: '0.9rem',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="submit-request-button"
        style={{
          width: '100%',
          padding: '1rem 2rem',
          fontSize: '1rem',
          fontWeight: '600',
          background: 'linear-gradient(to bottom, #555, #ccc)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          border: '1px solid transparent',
          borderRadius: '0',
          cursor: 'pointer',
          transition: 'all 0.2s',
          fontFamily: 'Montserrat, "Helvetica Neue", Helvetica, Arial, sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '0.12em'
        }}
        onMouseEnter={(e) => {
          e.target.style.setProperty('border', '1px solid #222', 'important');
          e.target.style.setProperty('background', '#222', 'important');
          e.target.style.setProperty('-webkit-background-clip', 'text', 'important');
          e.target.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
          e.target.style.setProperty('background-clip', 'text', 'important');
        }}
        onMouseLeave={(e) => {
          e.target.style.setProperty('border', '1px solid transparent', 'important');
          e.target.style.setProperty('background', 'linear-gradient(to bottom, #555, #ccc)', 'important');
          e.target.style.setProperty('-webkit-background-clip', 'text', 'important');
          e.target.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
          e.target.style.setProperty('background-clip', 'text', 'important');
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Inquiry'}
      </button>
    </form>
  );
} 