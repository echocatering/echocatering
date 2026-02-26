import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * EventSales Component
 * Spreadsheet-style table displaying all catering events with financial data
 */
const EventSales = () => {
  const { apiCall } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Fetch events from API
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall('/catering-events?limit=100');
      setEvents(data.events || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Delete event
  const handleDelete = async (eventId) => {
    try {
      await apiCall(`/catering-events/${eventId}`, { method: 'DELETE' });
      setEvents(prev => prev.filter(e => e._id !== eventId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting event:', err);
      alert('Failed to delete event: ' + err.message);
    }
  };

  // Format currency
  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return num < 0 ? `-$${Math.abs(num).toFixed(2)}` : `$${num.toFixed(2)}`;
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Format time
  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    return timeStr;
  };

  // Format hours
  const formatHours = (hours) => {
    const num = parseFloat(hours) || 0;
    return num.toFixed(2);
  };

  // Column definitions
  const columns = [
    { key: 'delete', label: '', width: '40px' },
    { key: 'name', label: 'Event Name', width: '150px' },
    { key: 'date', label: 'Event Date', width: '100px' },
    { key: 'patrons', label: '# Patrons', width: '80px' },
    { key: 'startTime', label: 'Start Time', width: '80px' },
    { key: 'endTime', label: 'End Time', width: '80px' },
    { key: 'hours', label: 'Total Hours', width: '90px' },
    { key: 'transportation', label: '$ Transportation', width: '110px' },
    { key: 'permit', label: '$ Permit', width: '80px' },
    { key: 'insurance', label: '$ Insurance', width: '90px' },
    { key: 'labor', label: '$ Labor', width: '80px' },
    { key: 'spillage', label: '$ Spillage', width: '90px' },
    { key: 'taxes', label: '$ Taxes', width: '80px' },
    { key: 'cogs', label: '$ COGS', width: '80px' },
    { key: 'tips', label: '$ Tips', width: '80px' },
    { key: 'sales', label: '$ Sales', width: '90px' },
    { key: 'income', label: '$ Income', width: '100px' },
  ];

  // Render cell value
  const renderCell = (event, column) => {
    switch (column.key) {
      case 'delete':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(event._id); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
            title="Delete event"
          >
            ×
          </button>
        );
      case 'name':
        return event.name || '-';
      case 'date':
        return formatDate(event.date);
      case 'patrons':
        return event.guestCount || 0;
      case 'startTime':
        return formatTime(event.startTime);
      case 'endTime':
        return formatTime(event.endTime);
      case 'hours':
        return formatHours(event.durationHours);
      case 'transportation':
        return formatCurrency(event.travelCost);
      case 'permit':
        return formatCurrency(event.permitCost);
      case 'insurance':
        return formatCurrency(event.insuranceCost);
      case 'labor':
        return formatCurrency(event.laborCost);
      case 'spillage':
        return formatCurrency(event.spillageCost);
      case 'taxes':
        return formatCurrency(event.taxesCost);
      case 'cogs':
        return formatCurrency(event.cogsCost);
      case 'tips':
        return formatCurrency(event.totalTips);
      case 'sales':
        return formatCurrency(event.totalSales);
      case 'income':
        const income = event.netIncome || 0;
        return (
          <span style={{ color: income >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
            {formatCurrency(income)}
          </span>
        );
      default:
        return '-';
    }
  };

  // Event detail modal
  const renderEventDetail = () => {
    if (!selectedEvent) return null;
    const event = events.find(e => e._id === selectedEvent);
    if (!event) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '800px',
          maxHeight: '80vh',
          overflow: 'auto',
          width: '90%',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>{event.name}</h2>
            <button
              onClick={() => setSelectedEvent(null)}
              style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>

          {/* Items Sold */}
          {event.drinkSales && event.drinkSales.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Items Sold</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Item</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Category</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Qty</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {event.drinkSales.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.name}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.category}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.quantity}</td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #eee' }}>{formatCurrency(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Timeline (15-min intervals) */}
          {event.timeline && event.timeline.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Sales Timeline (15-min intervals)</h3>
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Time</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.timeline.map((interval, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
                          {new Date(interval.intervalStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
                          {interval.items?.map(i => `${i.name} (${i.quantity})`).join(', ') || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inventory Difference */}
          {event.bottlesPrepped && event.bottlesPrepped.length > 0 && (
            <div>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Inventory (Sent vs Returned)</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Item</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Sent</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Returned</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Used</th>
                  </tr>
                </thead>
                <tbody>
                  {event.bottlesPrepped.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.name}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.unitsPrepared}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.unitsReturned}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{item.unitsUsed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#ef4444' }}>Error: {error}</p>
        <button onClick={fetchEvents} style={{ padding: '8px 16px', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Event Sales</h1>
        <button
          onClick={fetchEvents}
          style={{
            padding: '8px 16px',
            background: '#800080',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Refresh
        </button>
      </div>

      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>No events yet</p>
          <p style={{ fontSize: '14px' }}>Events will appear here after being saved from the POS system.</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1400px' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', position: 'sticky', top: 0, zIndex: 10 }}>
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={{
                      padding: '12px 8px',
                      textAlign: col.key === 'delete' ? 'center' : 'left',
                      borderBottom: '2px solid #ddd',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#333',
                      whiteSpace: 'nowrap',
                      width: col.width,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event, idx) => (
                <tr
                  key={event._id}
                  onClick={() => setSelectedEvent(event._id)}
                  style={{
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      style={{
                        padding: '10px 8px',
                        borderBottom: '1px solid #eee',
                        fontSize: '13px',
                        color: '#333',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {renderCell(event, col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            textAlign: 'center',
          }}>
            <h3 style={{ marginBottom: '16px' }}>Delete Event?</h3>
            <p style={{ color: '#666', marginBottom: '24px' }}>
              Are you sure you want to delete this event? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '10px 24px',
                  background: '#e5e5e5',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: '10px 24px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {renderEventDetail()}
    </div>
  );
};

export default EventSales;
