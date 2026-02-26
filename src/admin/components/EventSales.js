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
  const [overheadCollapsed, setOverheadCollapsed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedEvents, setEditedEvents] = useState({});
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

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

  // Handle entering edit mode
  const handleEnterEditMode = () => {
    setIsEditMode(true);
    setEditedEvents({});
  };

  // Handle field change in edit mode
  const handleFieldChange = (eventId, field, value) => {
    setEditedEvents(prev => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        [field]: value
      }
    }));
  };

  // Handle save all changes
  const handleSaveAll = async () => {
    try {
      // Update each modified event
      for (const [eventId, changes] of Object.entries(editedEvents)) {
        if (Object.keys(changes).length > 0) {
          await apiCall(`/catering-events/${eventId}`, {
            method: 'PUT',
            body: JSON.stringify(changes)
          });
        }
      }
      
      // Update local state
      setEvents(prev => prev.map(e => {
        if (editedEvents[e._id]) {
          return { ...e, ...editedEvents[e._id] };
        }
        return e;
      }));
      
      setShowSaveConfirm(false);
      setIsEditMode(false);
      setEditedEvents({});
    } catch (err) {
      console.error('Error saving events:', err);
      alert('Failed to save changes: ' + err.message);
    }
  };

  // Get current value (edited or original)
  const getCurrentValue = (event, field) => {
    if (editedEvents[event._id] && editedEvents[event._id][field] !== undefined) {
      return editedEvents[event._id][field];
    }
    return event[field];
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

  // Column definitions with groups
  const columnGroups = [
    {
      name: 'Basic Info',
      collapsable: false,
      columns: [
        { key: 'delete', label: '×', width: '40px', editable: false },
        { key: 'name', label: 'Event Name', width: '150px', editable: true, field: 'name' },
        { key: 'date', label: 'Event Date', width: '100px', editable: true, field: 'date' },
        { key: 'patrons', label: '# Patrons', width: '80px', editable: true, field: 'guestCount' },
        { key: 'startTime', label: 'Start Time', width: '80px', editable: true, field: 'startTime' },
        { key: 'endTime', label: 'End Time', width: '80px', editable: true, field: 'endTime' },
        { key: 'hours', label: 'Total Hours', width: '90px', editable: true, field: 'durationHours' },
      ]
    },
    {
      name: 'Overhead',
      collapsable: true,
      collapsed: overheadCollapsed,
      columns: [
        { key: 'accommodation', label: '$ Accommodation', width: '110px', editable: true, field: 'accommodationCost' },
        { key: 'transportation', label: '$ Transportation', width: '110px', editable: true, field: 'travelCost' },
        { key: 'permit', label: '$ Permit', width: '80px', editable: true, field: 'permitCost' },
        { key: 'insurance', label: '$ Insurance', width: '90px', editable: true, field: 'insuranceCost' },
        { key: 'labor', label: '$ Labor', width: '80px', editable: true, field: 'laborCost' },
        { key: 'spillage', label: '$ Spillage', width: '90px', editable: true, field: 'spillageCost' },
        { key: 'cogs', label: '$ COGS', width: '80px', editable: true, field: 'cogsCost' },
        { key: 'sales', label: '$ Sales', width: '90px', editable: true, field: 'totalSales' },
      ]
    },
    {
      name: 'Revenue',
      collapsable: false,
      columns: [
        { key: 'tips', label: '$ Tips', width: '80px', editable: true, field: 'totalTips' },
        { key: 'profit', label: '$ Profit', width: '100px', editable: false },
      ]
    }
  ];

  // Flatten columns for rendering
  const allColumns = columnGroups.flatMap(group => 
    group.collapsed ? [] : group.columns
  );

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
              color: '#999',
              fontSize: '20px',
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
      case 'accommodation':
        return formatCurrency(event.accommodationCost);
      case 'profit':
        const profit = event.netIncome || 0;
        return (
          <span style={{ color: profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
            {formatCurrency(profit)}
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

          {/* Glassware (Rox, Tumbl) */}
          {event.glassware && event.glassware.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Glassware</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Type</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Sent</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Returned Clean</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Returned Dirty</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Broken</th>
                  </tr>
                </thead>
                <tbody>
                  {event.glassware.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.type}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.sent}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.returnedClean}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.returnedDirty}</td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee', color: item.broken > 0 ? '#ef4444' : '#333', fontWeight: item.broken > 0 ? 'bold' : 'normal' }}>{item.broken}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ice Blocks */}
          {(event.iceBlocksSent || event.iceBlocksReturned) && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Ice Blocks</h3>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Sent</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{event.iceBlocksSent || 0}</div>
                </div>
                <div style={{ flex: 1, background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Returned</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{event.iceBlocksReturned || 0}</div>
                </div>
                <div style={{ flex: 1, background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Used</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#800080' }}>
                    {(event.iceBlocksSent || 0) - (event.iceBlocksReturned || 0)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Timeline (15-min intervals) */}
          {event.timeline && event.timeline.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Sales Timeline</h3>
              <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
                {event.timeline.map((interval, idx) => {
                  const startTime = new Date(interval.intervalStart);
                  const endTime = new Date(interval.intervalEnd);
                  return (
                    <div key={idx} style={{ padding: '12px', borderBottom: idx < event.timeline.length - 1 ? '1px solid #eee' : 'none' }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#800080' }}>
                        {startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - {endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {interval.items && interval.items.length > 0 ? (
                        <div style={{ paddingLeft: '12px' }}>
                          {interval.items.map((item, itemIdx) => (
                            <div key={itemIdx} style={{ fontSize: '13px', color: '#333', marginBottom: '4px' }}>
                              {item.name} - {item.quantity}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#999', fontStyle: 'italic', paddingLeft: '12px' }}>No sales</div>
                      )}
                    </div>
                  );
                })}
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
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={isEditMode ? () => setShowSaveConfirm(true) : handleEnterEditMode}
            style={{
              padding: '8px 16px',
              background: isEditMode ? '#22c55e' : '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {isEditMode ? 'Save' : 'Edit'}
          </button>
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
              {/* Group headers */}
              <tr style={{ background: '#e5e5e5', position: 'sticky', top: 0, zIndex: 11 }}>
                {columnGroups.map((group, groupIdx) => {
                  const colSpan = group.collapsed ? 0 : group.columns.length;
                  if (colSpan === 0) return null;
                  return (
                    <th
                      key={groupIdx}
                      colSpan={colSpan}
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        borderBottom: '1px solid #ccc',
                        borderRight: groupIdx < columnGroups.length - 1 ? '2px solid #999' : 'none',
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#555',
                        textTransform: 'uppercase',
                        cursor: group.collapsable ? 'pointer' : 'default',
                      }}
                      onClick={() => group.collapsable && setOverheadCollapsed(!overheadCollapsed)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {group.collapsable && group.collapsed && (
                          <span style={{ color: '#800080', fontSize: '14px' }}>▶</span>
                        )}
                        {group.name}
                        {group.collapsable && !group.collapsed && (
                          <span style={{ color: '#800080', fontSize: '14px' }}>▼</span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
              {/* Column headers */}
              <tr style={{ background: '#f5f5f5', position: 'sticky', top: '33px', zIndex: 10 }}>
                {allColumns.map((col, colIdx) => {
                  const groupIdx = columnGroups.findIndex(g => !g.collapsed && g.columns.includes(col));
                  const isLastInGroup = columnGroups[groupIdx]?.columns[columnGroups[groupIdx].columns.length - 1] === col;
                  return (
                    <th
                      key={col.key}
                      style={{
                        padding: '12px 8px',
                        textAlign: 'center',
                        borderBottom: '2px solid #ddd',
                        borderRight: isLastInGroup && groupIdx < columnGroups.length - 1 ? '2px solid #999' : '1px solid #e5e5e5',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: col.key === 'delete' ? '#999' : '#333',
                        whiteSpace: 'nowrap',
                        width: col.width,
                      }}
                    >
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {events.map((event, idx) => (
                <tr
                  key={event._id}
                  onClick={() => !isEditMode && setSelectedEvent(event._id)}
                  style={{
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: isEditMode ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => !isEditMode && (e.currentTarget.style.background = '#f0f0f0')}
                  onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'}
                >
                  {allColumns.map((col, colIdx) => {
                    const groupIdx = columnGroups.findIndex(g => !g.collapsed && g.columns.includes(col));
                    const isLastInGroup = columnGroups[groupIdx]?.columns[columnGroups[groupIdx].columns.length - 1] === col;
                    
                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: '10px 8px',
                          borderBottom: '1px solid #eee',
                          borderRight: isLastInGroup && groupIdx < columnGroups.length - 1 ? '2px solid #999' : '1px solid #e5e5e5',
                          fontSize: '13px',
                          color: '#333',
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                        }}
                      >
                        {isEditMode && col.editable ? (
                          <input
                            type="text"
                            value={getCurrentValue(event, col.field) ?? ''}
                            onChange={(e) => handleFieldChange(event._id, col.field, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '90%',
                              padding: '4px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '13px',
                              textAlign: 'center',
                            }}
                          />
                        ) : (
                          renderCell(event, col)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save Confirmation Modal */}
      {showSaveConfirm && (
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
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>This action can't be undone…</p>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '24px' }}>Are you sure?</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={handleSaveAll}
                style={{
                  padding: '10px 24px',
                  background: '#800080',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  setShowSaveConfirm(false);
                }}
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
            </div>
          </div>
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
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>This action can't be undone…</p>
            <p style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '24px' }}>Are you sure?</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
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
                Confirm
              </button>
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
