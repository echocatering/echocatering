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
  const [overheadCollapsed, setOverheadCollapsed] = useState(true);
  const [paymentMethodsCollapsed, setPaymentMethodsCollapsed] = useState(true);
  const [paymentModelCollapsed, setPaymentModelCollapsed] = useState(false);
  
  // Pricing variables for invoice calculations - load from localStorage
  const [pricingVars, setPricingVars] = useState(() => {
    const saved = localStorage.getItem('eventSalesPricingVars');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved pricing vars:', e);
      }
    }
    return {
      minimum: 500,      // M = minimum event fee
      overhead: 150,     // O = flat overhead
      first2Hr: 15,      // F_first = per-guest rate for first 2 hours
      addHr: 10,         // F_add = per-guest rate for additional hours
      perPerson: 25,     // S = per-person service fee (for customer pays model)
    };
  });
  
  // Save pricing variables to localStorage when they change
  useEffect(() => {
    localStorage.setItem('eventSalesPricingVars', JSON.stringify(pricingVars));
  }, [pricingVars]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedEvents, setEditedEvents] = useState({});
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [graphEventId, setGraphEventId] = useState(null); // Event selected for graph view
  const [graphViewMode, setGraphViewMode] = useState('all'); // 'all', 'cocktails', 'mocktails', 'beer', 'wine', 'spirits'
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(false); // Side panel collapsed state

  // Fetch events from API
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall('/catering-events?limit=100');
      // Sort events by date with most recent first
      const sortedEvents = (data.events || []).sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA; // Most recent first
      });
      setEvents(sortedEvents);
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

  // Calculate invoice based on payment model
  const calculateInvoice = (event) => {
    const model = getCurrentValue(event, 'paymentModel') || 'S'; // Default to Standard
    const G = parseFloat(event.guestCount) || 0; // Number of guests
    const H = parseFloat(event.durationHours) || 0; // Total hours
    const { minimum: M, overhead: O, first2Hr: F_first, addHr: F_add, perPerson: S } = pricingVars;
    
    // Add specific overhead items to invoice: Permit, Insurance, Accommodation
    // Exclude: Transportation, Broken Glassware, Spillage, COGS, Labor (covered by flat OHD rate)
    const permitCost = parseFloat(event.permitCost) || 0;
    const insuranceCost = parseFloat(event.insuranceCost) || 0;
    const accommodationCost = parseFloat(event.accommodationCost) || 0;
    const additionalOverhead = permitCost + insuranceCost + accommodationCost;
    
    if (model === 'S') {
      // Model 1: Standard (I Buy Alcohol)
      const firstHours = Math.min(H, 2);
      const additionalHours = Math.max(H - 2, 0);
      const serviceFee = (firstHours * F_first * G) + (additionalHours * F_add * G);
      const totalFee = serviceFee + O + additionalOverhead;
      return Math.max(totalFee, M);
    } else if (model === 'C') {
      // Model 2: Customer Pays for Alcohol
      const serviceFee = G * S;
      const totalFee = serviceFee + O + additionalOverhead;
      return Math.max(totalFee, M);
    } else if (model === 'H') {
      // Model 3: Hybrid/Cash Bar
      const totalSales = parseFloat(event.totalSales) || 0;
      const totalWithOverhead = O + totalSales + additionalOverhead;
      if (totalWithOverhead < M) {
        return M - totalWithOverhead; // Customer pays the difference
      }
      return 0; // No additional invoice needed
    }
    return 0;
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
        { key: 'patrons', label: 'Patrons', width: '80px', editable: true, field: 'guestCount' },
        { key: 'startTime', label: 'Start Time', width: '80px', editable: true, field: 'startTime' },
        { key: 'endTime', label: 'End Time', width: '80px', editable: true, field: 'endTime' },
        { key: 'hours', label: 'Total Hours', width: '90px', editable: false, field: 'durationHours' },
      ]
    },
    {
      name: 'Overhead',
      collapsable: true,
      collapsed: overheadCollapsed,
      columns: [
        { key: 'accommodation', label: 'Accommodation', width: '110px', editable: true, field: 'accommodationCost' },
        { key: 'transportation', label: 'Transportation', width: '110px', editable: true, field: 'travelCost' },
        { key: 'permit', label: 'Permit', width: '80px', editable: true, field: 'permitCost' },
        { key: 'insurance', label: 'Insurance', width: '90px', editable: true, field: 'insuranceCost' },
        { key: 'labor', label: 'Labor', width: '80px', editable: true, field: 'laborCost' },
        { key: 'spillage', label: 'Spillage', width: '90px', editable: true, field: 'spillageCost' },
        { key: 'cogs', label: 'COGS', width: '80px', editable: true, field: 'cogsCost' },
      ]
    },
    {
      name: 'Payment Methods',
      collapsable: true,
      collapsed: paymentMethodsCollapsed,
      columns: [
        { key: 'cashTotal', label: 'Cash', width: '90px', editable: false, field: 'cashTotal' },
        { key: 'creditTotal', label: 'Credit', width: '90px', editable: false, field: 'creditTotal' },
        { key: 'invoiceTotal', label: 'Invoice', width: '90px', editable: false, field: 'invoiceMethodTotal' },
      ]
    },
    {
      name: 'Payment Model',
      collapsable: true,
      collapsed: paymentModelCollapsed,
      columns: [
        { key: 'paymentModel', label: 'Model', width: '120px', editable: false, field: 'paymentModel' },
        { key: 'calculatedInvoice', label: 'Invoice', width: '100px', editable: false },
        { key: 'amountReceived', label: 'Received', width: '100px', editable: true, field: 'amountReceived' },
      ]
    },
    {
      name: 'Revenue',
      collapsable: false,
      columns: [
        { key: 'sales', label: 'Sales', width: '90px', editable: false, field: 'totalSales' },
        { key: 'tips', label: 'Tips', width: '80px', editable: true, field: 'totalTips' },
        { key: 'profit', label: 'Profit', width: '100px', editable: false },
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
      case 'invoice':
        // Invoice total - sum of invoiced tabs (shown as negative since payment pending)
        const invoiceTotal = event.invoiceTotal || 0;
        return invoiceTotal > 0 ? (
          <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
            -${invoiceTotal.toFixed(2)}
          </span>
        ) : '-';
      case 'paid':
        // Y/N checkboxes for paid status
        const isPaid = getCurrentValue(event, 'isPaid');
        return (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPaid === true}
                onChange={(e) => {
                  e.stopPropagation();
                  handleFieldChange(event._id, 'isPaid', true);
                }}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', color: isPaid === true ? '#22c55e' : '#999' }}>Y</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPaid === false}
                onChange={(e) => {
                  e.stopPropagation();
                  handleFieldChange(event._id, 'isPaid', false);
                }}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', color: isPaid === false ? '#ef4444' : '#999' }}>N</span>
            </label>
          </div>
        );
      case 'sales':
        return formatCurrency(event.totalSales);
      case 'accommodation':
        return formatCurrency(event.accommodationCost);
      case 'cashTotal':
        // Cash payments - displayed as +$#.##
        const cashTotal = event.cashTotal || 0;
        return cashTotal > 0 ? (
          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
            +${cashTotal.toFixed(2)}
          </span>
        ) : '-';
      case 'creditTotal':
        // Credit payments - displayed as +$#.##
        const creditTotal = event.creditTotal || 0;
        return creditTotal > 0 ? (
          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
            +${creditTotal.toFixed(2)}
          </span>
        ) : '-';
      case 'invoiceTotal':
        // Invoice payments - displayed as $#.## (neutral, doesn't affect profit)
        const invoiceMethodTotal = event.invoiceMethodTotal || event.invoiceTotal || 0;
        return invoiceMethodTotal > 0 ? (
          <span style={{ color: '#666' }}>
            ${invoiceMethodTotal.toFixed(2)}
          </span>
        ) : '-';
      case 'profit':
        const profit = event.netIncome || 0;
        return (
          <span style={{ color: profit >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
            {formatCurrency(profit)}
          </span>
        );
      case 'paymentModel':
        // S/C/H checkboxes for payment model
        const currentModel = getCurrentValue(event, 'paymentModel') || 'S';
        return (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
            {[
              { key: 'S', label: 'S', title: 'Standard (I Buy Alcohol)' },
              { key: 'C', label: 'C', title: 'Customer Pays for Alcohol' },
              { key: 'H', label: 'H', title: 'Hybrid/Cash Bar' },
            ].map(({ key, label, title }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }} title={title}>
                <input
                  type="checkbox"
                  checked={currentModel === key}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleFieldChange(event._id, 'paymentModel', key);
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: currentModel === key ? 'bold' : 'normal',
                  color: currentModel === key ? '#800080' : '#999' 
                }}>{label}</span>
              </label>
            ))}
          </div>
        );
      case 'calculatedInvoice':
        // Calculated invoice based on payment model
        const invoiceAmount = calculateInvoice(event);
        return (
          <span style={{ color: '#800080', fontWeight: 'bold' }}>
            ${invoiceAmount.toFixed(2)}
          </span>
        );
      case 'amountReceived':
        // Always editable amount received field
        const received = getCurrentValue(event, 'amountReceived') || 0;
        const calcInvoice = calculateInvoice(event);
        const tipAdjustment = Math.max(0, parseFloat(received) - calcInvoice);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <input
              type="number"
              value={received}
              onChange={(e) => {
                e.stopPropagation();
                handleFieldChange(event._id, 'amountReceived', parseFloat(e.target.value) || 0);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '80px',
                padding: '4px 6px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'center',
                fontWeight: 'bold',
                color: parseFloat(received) >= calcInvoice ? '#22c55e' : '#f59e0b',
              }}
            />
            {tipAdjustment > 0 && (
              <span style={{ fontSize: '10px', color: '#22c55e' }}>
                +${tipAdjustment.toFixed(2)} tip
              </span>
            )}
          </div>
        );
      default:
        return '-';
    }
  };

  // Event detail side panel (renders inline, not as modal)
  const renderEventDetailPanel = () => {
    if (!selectedEvent || detailPanelCollapsed) return null;
    const event = events.find(e => e._id === selectedEvent);
    if (!event) return null;

    return (
      <div style={{
        width: '320px',
        flexShrink: 0,
        borderLeft: '1px solid #ddd',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #eee',
          background: '#f9f9f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>{event.name}</h3>
          <button
            onClick={() => setDetailPanelCollapsed(true)}
            style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>

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

          {/* Glassware (Rox, Tumbl) - only show if there's data with non-zero values */}
          {event.glassware && event.glassware.filter(g => g.sent > 0 || (g.returned || 0) > 0 || (g.returnedClean || 0) + (g.returnedDirty || 0) > 0).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Glassware</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Type</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Sent</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Returned</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {event.glassware.filter(g => g.sent > 0 || (g.returned || 0) > 0 || (g.returnedClean || 0) + (g.returnedDirty || 0) > 0).map((item, idx) => {
                    const returned = item.returned || (item.returnedClean || 0) + (item.returnedDirty || 0);
                    const lost = Math.max(0, (item.sent || 0) - returned);
                    return (
                      <tr key={idx}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.type}</td>
                        <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{item.sent}</td>
                        <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{returned}</td>
                        <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #eee', color: lost > 0 ? '#ef4444' : '#333', fontWeight: lost > 0 ? 'bold' : 'normal' }}>{lost}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Ice Blocks - only show if there's non-zero data */}
          {((event.iceBlocksBrought || 0) > 0 || (event.iceBlocksReturned || 0) > 0) && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Ice Blocks</h3>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Sent</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{event.iceBlocksBrought || 0}</div>
                </div>
                <div style={{ flex: 1, background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Returned</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{event.iceBlocksReturned || 0}</div>
                </div>
                <div style={{ flex: 1, background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Used</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#800080' }}>
                    {(event.iceBlocksBrought || 0) - (event.iceBlocksReturned || 0)}
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
      {/* Header Row with Title, Pricing Variables, and Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 
          className="text-3xl tracking-wide uppercase" 
          style={{ 
            margin: 0, 
            fontWeight: 400,
            letterSpacing: '0.05em',
          }}
        >
          EVENTS
        </h1>
        
        {/* Pricing Variables - Centered */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: '#f5f5f5', padding: '8px 16px', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>MIN</label>
            <input
              type="number"
              value={pricingVars.minimum}
              onChange={(e) => setPricingVars(prev => ({ ...prev, minimum: parseFloat(e.target.value) || 0 }))}
              style={{ width: '70px', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', textAlign: 'center' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>OHD</label>
            <input
              type="number"
              value={pricingVars.overhead}
              onChange={(e) => setPricingVars(prev => ({ ...prev, overhead: parseFloat(e.target.value) || 0 }))}
              style={{ width: '70px', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', textAlign: 'center' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>$2HR</label>
            <input
              type="number"
              value={pricingVars.first2Hr}
              onChange={(e) => setPricingVars(prev => ({ ...prev, first2Hr: parseFloat(e.target.value) || 0 }))}
              style={{ width: '60px', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', textAlign: 'center' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>$+HR</label>
            <input
              type="number"
              value={pricingVars.addHr}
              onChange={(e) => setPricingVars(prev => ({ ...prev, addHr: parseFloat(e.target.value) || 0 }))}
              style={{ width: '60px', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', textAlign: 'center' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>$/PP</label>
            <input
              type="number"
              value={pricingVars.perPerson}
              onChange={(e) => setPricingVars(prev => ({ ...prev, perPerson: parseFloat(e.target.value) || 0 }))}
              style={{ width: '60px', padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', textAlign: 'center' }}
            />
          </div>
        </div>
        
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => {
              if (overheadCollapsed) {
                // Opening Overhead - close others
                setOverheadCollapsed(false);
                setPaymentModelCollapsed(true);
                setPaymentMethodsCollapsed(true);
              } else {
                // Closing Overhead
                setOverheadCollapsed(true);
              }
            }}
            style={{
              padding: '8px 16px',
              background: overheadCollapsed ? '#999' : '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Overhead
          </button>
          <button
            onClick={() => {
              if (paymentModelCollapsed) {
                // Opening Payment Model - close others
                setPaymentModelCollapsed(false);
                setOverheadCollapsed(true);
                setPaymentMethodsCollapsed(true);
              } else {
                // Closing Payment Model
                setPaymentModelCollapsed(true);
              }
            }}
            style={{
              padding: '8px 16px',
              background: paymentModelCollapsed ? '#999' : '#800080',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Payment Model
          </button>
          <button
            onClick={() => {
              if (paymentMethodsCollapsed) {
                // Opening Payment Methods - close others
                setPaymentMethodsCollapsed(false);
                setOverheadCollapsed(true);
                setPaymentModelCollapsed(true);
              } else {
                // Closing Payment Methods
                setPaymentMethodsCollapsed(true);
              }
            }}
            style={{
              padding: '8px 16px',
              background: paymentMethodsCollapsed ? '#999' : '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Payment Methods
          </button>
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
        <>
          {/* Graph View - Top Half */}
          <div style={{ height: '45%', marginBottom: '16px', border: '1px solid #ddd', borderRadius: '8px', background: '#fff', overflow: 'hidden', display: 'flex' }}>
            {/* Graph Main Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Graph Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #eee', background: '#f9f9f9' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>View:</span>
                  {['all', 'cocktails', 'mocktails', 'beer', 'wine', 'spirits'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setGraphViewMode(mode)}
                      style={{
                        padding: '6px 12px',
                        background: graphViewMode === mode ? '#800080' : '#e5e5e5',
                        color: graphViewMode === mode ? '#fff' : '#333',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        textTransform: 'capitalize',
                      }}
                    >
                      {mode === 'all' ? 'All Categories' : mode}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>
                    {graphEventId ? events.find(e => e._id === graphEventId)?.name || 'Select an event' : 'Select an event from the table below'}
                  </span>
                  {selectedEvent && detailPanelCollapsed && (
                    <button
                      onClick={() => setDetailPanelCollapsed(false)}
                      style={{
                        padding: '4px 10px',
                        background: '#800080',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      Show Details
                    </button>
                  )}
                </div>
              </div>
            
            {/* Graph Content */}
            <div style={{ height: 'calc(100% - 50px)', padding: '16px', overflow: 'auto' }}>
              {graphEventId ? (() => {
                const graphEvent = events.find(e => e._id === graphEventId);
                if (!graphEvent || !graphEvent.timeline || graphEvent.timeline.length === 0) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                      No timeline data available for this event
                    </div>
                  );
                }
                
                // Process timeline data based on view mode
                const processedData = graphEvent.timeline.map(interval => {
                  const startTime = new Date(interval.intervalStart);
                  const timeLabel = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  
                  let itemCount = 0;
                  let revenue = 0;
                  
                  if (interval.items && interval.items.length > 0) {
                    interval.items.forEach(item => {
                      const category = (item.category || '').toLowerCase();
                      if (graphViewMode === 'all' || category === graphViewMode) {
                        itemCount += item.quantity || 1;
                        revenue += item.revenue || 0;
                      }
                    });
                  }
                  
                  return { timeLabel, itemCount, revenue };
                });
                
                const maxCount = Math.max(...processedData.map(d => d.itemCount), 1);
                
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100%', paddingBottom: '30px' }}>
                    {processedData.map((data, idx) => (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                          <div
                            style={{
                              width: '100%',
                              height: `${(data.itemCount / maxCount) * 100}%`,
                              minHeight: data.itemCount > 0 ? '4px' : '0',
                              background: graphViewMode === 'all' ? '#800080' : 
                                graphViewMode === 'cocktails' ? '#9333ea' :
                                graphViewMode === 'mocktails' ? '#22c55e' :
                                graphViewMode === 'beer' ? '#f59e0b' :
                                graphViewMode === 'wine' ? '#ef4444' : '#3b82f6',
                              borderRadius: '2px 2px 0 0',
                              transition: 'height 0.3s ease',
                            }}
                            title={`${data.itemCount} items - $${data.revenue.toFixed(2)}`}
                          />
                        </div>
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                          {data.timeLabel}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })() : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                  Click on an event row below to view its sales timeline
                </div>
              )}
            </div>
            </div>
            {/* Event Detail Side Panel */}
            {renderEventDetailPanel()}
          </div>
          
          {/* Spreadsheet - Bottom Half */}
          <div style={{ height: '50%', overflow: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
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
                      }}
                    >
                      {group.name}
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
                  onClick={() => { if (!isEditMode) { setSelectedEvent(event._id); setGraphEventId(event._id); setDetailPanelCollapsed(false); } }}
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
        </>
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

          </div>
  );
};

export default EventSales;
