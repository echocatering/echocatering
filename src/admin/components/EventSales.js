import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [basicInfoCollapsed, setBasicInfoCollapsed] = useState(false);
  const [overheadCollapsed, setOverheadCollapsed] = useState(true);
  const [paymentMethodsCollapsed, setPaymentMethodsCollapsed] = useState(true);
  const [paymentModelCollapsed, setPaymentModelCollapsed] = useState(false);
  const [showDataColumn, setShowDataColumn] = useState(false); // DATA column hidden by default
  const [invoiceDetailsEventId, setInvoiceDetailsEventId] = useState(null); // Event ID for invoice details popup
  const [dataPopupEvent, setDataPopupEvent] = useState(null); // Event object for DATA popup modal
  const [laborPopupEvent, setLaborPopupEvent] = useState(null); // Event object for Labor popup modal
  const [inventoryPopupEvent, setInventoryPopupEvent] = useState(null); // Event object for Inventory popup modal
  
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
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState(true); // Side panel collapsed by default
  const graphContainerRef = useRef(null);
  const [graphContainerWidth, setGraphContainerWidth] = useState(800);
  
  // ResizeObserver to rerender graph when container width changes
  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setGraphContainerWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Section lock states - per-row (per-event) controls whether fields in each section are editable
  // Structure: { [eventId]: { basicInfo: true/false, overhead: true/false, paymentModel: true/false } }
  const [rowLocks, setRowLocks] = useState({});
  
  // Helper to get lock state for a specific event and section
  const getRowLock = (eventId, lockGroup) => {
    // First check local state override
    if (rowLocks[eventId]?.[lockGroup] !== undefined) {
      return rowLocks[eventId][lockGroup];
    }
    // Then check event data from backend
    const event = events.find(e => e._id === eventId);
    if (event?.sectionLocks?.[lockGroup] !== undefined) {
      return event.sectionLocks[lockGroup];
    }
    // Default: basicInfo and overhead locked, paymentModel unlocked
    return lockGroup === 'paymentModel' ? false : true;
  };
  
  // Helper to set lock state for a specific event and section (saves to backend when locking)
  const setRowLock = async (eventId, lockGroup, locked) => {
    // Update local state immediately
    setRowLocks(prev => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        [lockGroup]: locked
      }
    }));
    
    // When locking, save all fields in the group and lock state to backend
    if (locked) {
      try {
        const event = events.find(e => e._id === eventId);
        const currentLocks = event?.sectionLocks || {};
        const editedChanges = editedEvents[eventId] || {};
        
        // Define which fields belong to each lock group
        const groupFields = {
          basicInfo: ['name', 'date', 'guestCount', 'startTime', 'endTime'],
          overhead: ['accommodationCost', 'travelCost', 'permitCost', 'insuranceCost', 'laborCost'],
          paymentModel: ['paymentModel', 'amountReceived', 'totalTips']
        };
        
        // Gather all current values for fields in this group
        const fieldsToSave = {};
        const fields = groupFields[lockGroup] || [];
        fields.forEach(field => {
          // Use edited value if exists, otherwise use current event value
          if (editedChanges[field] !== undefined) {
            fieldsToSave[field] = editedChanges[field];
          } else if (event[field] !== undefined) {
            fieldsToSave[field] = event[field];
          }
        });
        
        await apiCall(`/catering-events/${eventId}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...fieldsToSave,
            sectionLocks: {
              ...currentLocks,
              [lockGroup]: true
            }
          })
        });
        
        // Update local events state
        setEvents(prev => prev.map(e => {
          if (e._id === eventId) {
            return {
              ...e,
              ...fieldsToSave,
              sectionLocks: {
                ...e.sectionLocks,
                [lockGroup]: true
              }
            };
          }
          return e;
        }));
        
        // Clear edited state for this event's group fields
        setEditedEvents(prev => {
          const updated = { ...prev };
          if (updated[eventId]) {
            fields.forEach(field => delete updated[eventId][field]);
            if (Object.keys(updated[eventId]).length === 0) {
              delete updated[eventId];
            }
          }
          return updated;
        });
      } catch (err) {
        console.error('Error saving lock state:', err);
      }
    } else {
      // When unlocking, just save the unlock state to backend
      try {
        const event = events.find(e => e._id === eventId);
        const currentLocks = event?.sectionLocks || {};
        
        await apiCall(`/catering-events/${eventId}`, {
          method: 'PUT',
          body: JSON.stringify({
            sectionLocks: {
              ...currentLocks,
              [lockGroup]: false
            }
          })
        });
        
        // Update local events state
        setEvents(prev => prev.map(e => {
          if (e._id === eventId) {
            return {
              ...e,
              sectionLocks: {
                ...e.sectionLocks,
                [lockGroup]: false
              }
            };
          }
          return e;
        }));
      } catch (err) {
        console.error('Error saving unlock state:', err);
      }
    }
  };
  
  const [unlockConfirm, setUnlockConfirm] = useState(null); // { eventId, lockGroup } to confirm unlock
  const [showRatePanel, setShowRatePanel] = useState(false); // Rate panel visibility

  // Fetch events from API
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall('/catering-events?limit=100');
      // Sort events by date with most recent first, then by creation time for same-day events
      const sortedEvents = (data.events || []).sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        // Compare dates (day only)
        const dayDiff = dateB.setHours(0,0,0,0) - dateA.setHours(0,0,0,0);
        if (dayDiff !== 0) return dayDiff > 0 ? 1 : -1;
        // Same day - sort by createdAt or startTime (newest first)
        const timeA = new Date(a.createdAt || a.startTime || a.date || 0);
        const timeB = new Date(b.createdAt || b.startTime || b.date || 0);
        return timeB - timeA;
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

  // Auto-select the most recent event for the graph when events first load
  useEffect(() => {
    if (events.length > 0 && !graphEventId) {
      setGraphEventId(events[0]._id);
    }
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Parse itemData string and extract payment method totals, category breakdown, and individual items
  // Format: "itemName, category, timestamp, paymentMethod, cost" per line
  const parseItemData = (itemDataStr) => {
    if (!itemDataStr || typeof itemDataStr !== 'string') {
      return { paymentTotals: { CASH: 0, CREDIT: 0, INVOICE: 0 }, categoryBreakdown: {}, items: [] };
    }
    
    const paymentTotals = { CASH: 0, CREDIT: 0, INVOICE: 0 };
    const categoryBreakdown = {};
    const items = [];
    
    const lines = itemDataStr.split('\n').filter(line => line.trim());
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 5) {
        const [itemName, category, timestamp, paymentMethod, costStr] = parts;
        const cost = parseFloat(costStr) || 0;
        const method = (paymentMethod || '').toUpperCase();
        
        // Add to items array
        items.push({
          name: itemName,
          category: category,
          timestamp: timestamp,
          transactionType: method,
          cost: cost
        });
        
        // Add to payment totals
        if (method === 'CASH' || method === 'CREDIT' || method === 'INVOICE') {
          paymentTotals[method] += cost;
        }
        
        // Add to category breakdown
        const cat = (category || 'other').toLowerCase();
        if (!categoryBreakdown[cat]) {
          categoryBreakdown[cat] = { total: 0, items: {} };
        }
        categoryBreakdown[cat].total += cost;
        if (!categoryBreakdown[cat].items[itemName]) {
          categoryBreakdown[cat].items[itemName] = { count: 0, total: 0 };
        }
        categoryBreakdown[cat].items[itemName].count += 1;
        categoryBreakdown[cat].items[itemName].total += cost;
      }
    }
    
    return { paymentTotals, categoryBreakdown, items };
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
  // Variables: c=guests, e=OHD, i=hours, k=$+HR, l=$2HR, m=$PP, M=MIN
  // S: S = 2(l×c) + max(i-2,0)(k×c) + e  →  max(S, MIN)
  // C: N = (c×m)+d+e+f                   →  max(N, MIN)
  // H: o=cash+credit, p=MIN−o, q=invoice×1.08, R=q+p+d+e+f  →  max(R, MIN)
  const calculateInvoice = (event) => {
    const model = getCurrentValue(event, 'paymentModel') || 'S';
    const c = parseFloat(event.guestCount) || 0;       // Total Guests
    const i = parseFloat(event.durationHours) || 0;    // Total Hours
    const { minimum: M, overhead: e, first2Hr: l, addHr: k, perPerson: m } = pricingVars;
    const d = parseFloat(event.permitCost) || 0;       // Permit
    const f = parseFloat(event.insuranceCost) || 0;    // Insurance

    if (model === 'S') {
      // Total = MAX(svc, MIN); OHD/permit/insurance are itemized within that total
      const svc = (Math.min(i, 2) * l * c) + (Math.max(i - 2, 0) * k * c);
      return Math.max(svc, M);
    } else if (model === 'C') {
      // Total = MAX($/PP×patrons, MIN); extras are itemized within that total
      const chargeBase = m * c;
      return Math.max(chargeBase, M);
    } else if (model === 'H') {
      // tabTotal = invoiceTab × 1.08
      // serviceCharge = MAX(0, MIN − cash − credit − tabTotal − OHD − permit − insurance)
      // invoiceTotal = tabTotal + serviceCharge
      const parsed = parseItemData(event.itemData);
      const cash = parsed.paymentTotals.CASH > 0 ? parsed.paymentTotals.CASH : (event.cashTotal || 0);
      const credit = parsed.paymentTotals.CREDIT > 0 ? parsed.paymentTotals.CREDIT : (event.creditTotal || 0);
      const invoicePOS = parsed.paymentTotals.INVOICE > 0 ? parsed.paymentTotals.INVOICE : (event.invoiceTotal || 0);
      const tabTotal = invoicePOS * 1.08;
      const serviceCharge = Math.max(0, M - cash - credit - tabTotal - e - d - f);
      return tabTotal + serviceCharge;
    }
    return 0;
  };

  // Column definitions with groups
  const columnGroups = [
    {
      name: 'Basic Info',
      collapsable: true,
      collapsed: basicInfoCollapsed,
      columns: [
        { key: 'delete', label: '', width: '40px', editable: false, isDeleteHeader: true },
        { key: 'name', label: 'Event Name', width: '150px', editable: true, field: 'name', lockGroup: 'basicInfo' },
        { key: 'date', label: 'Event Date', width: '100px', editable: true, field: 'date', lockGroup: 'basicInfo' },
        { key: 'patrons', label: 'Patrons', width: '80px', editable: true, field: 'guestCount', lockGroup: 'basicInfo' },
        { key: 'startTime', label: 'Start Time', width: '80px', editable: true, field: 'startTime', lockGroup: 'basicInfo' },
        { key: 'endTime', label: 'End Time', width: '80px', editable: true, field: 'endTime', lockGroup: 'basicInfo' },
        { key: 'hours', label: 'Total Hours', width: '90px', editable: false, field: 'durationHours' },
        { key: 'lockBasicInfo', label: '', width: '40px', editable: false, isLock: true, lockGroup: 'basicInfo', isLockHeader: true },
      ]
    },
    {
      name: 'Expenses',
      collapsable: true,
      collapsed: overheadCollapsed,
      columns: [
        { key: 'accommodation', label: 'Accom.', width: '80px', editable: true, field: 'accommodationCost', lockGroup: 'overhead' },
        { key: 'transportation', label: 'Transp.', width: '80px', editable: true, field: 'travelCost', lockGroup: 'overhead' },
        { key: 'permit', label: 'Permit', width: '80px', editable: true, field: 'permitCost', lockGroup: 'overhead' },
        { key: 'insurance', label: 'Insurance', width: '90px', editable: true, field: 'insuranceCost', lockGroup: 'overhead' },
        { key: 'labor', label: 'Labor', width: '80px', editable: true, field: 'laborCost', lockGroup: 'overhead' },
        { key: 'spillage', label: 'Spillage', width: '90px', editable: false, field: 'spillageCost' },
        { key: 'cogs', label: 'COGS', width: '80px', editable: false, field: 'cogsCost' },
        { key: 'lockOverhead', label: '', width: '40px', editable: false, isLock: true, lockGroup: 'overhead', isLockHeader: true },
      ]
    },
    {
      name: 'Payment Methods',
      collapsable: true,
      collapsed: paymentMethodsCollapsed,
      columns: [
        { key: 'cashTotal', label: 'Cash', width: '90px', editable: false, field: 'cashTotal' },
        { key: 'creditTotal', label: 'Credit', width: '90px', editable: false, field: 'creditTotal' },
        { key: 'invoiceTotal', label: 'Invoice', width: '90px', editable: false, field: 'invoiceTotal' },
      ]
    },
    {
      name: 'Payment Model',
      collapsable: true,
      collapsed: paymentModelCollapsed,
      columns: [
        { key: 'invoiceDetails', label: '☰', width: '40px', editable: false, isInvoiceMenu: true },
        { key: 'paymentModel', label: 'Model', width: '120px', editable: true, field: 'paymentModel', lockGroup: 'paymentModel' },
        { key: 'calculatedInvoice', label: 'Invoice', width: '100px', editable: false },
        { key: 'amountReceived', label: 'Received', width: '100px', editable: true, field: 'amountReceived', lockGroup: 'paymentModel' },
        { key: 'lockPaymentModel', label: '', width: '40px', editable: false, isLock: true, lockGroup: 'paymentModel', isLockHeader: true },
      ]
    },
    {
      name: 'Revenue',
      collapsable: false,
      columns: [
        { key: 'sales', label: 'Sales', width: '90px', editable: false, field: 'totalSales' },
        { key: 'salesTax', label: 'Tax', width: '80px', editable: false },
        { key: 'tips', label: 'Tips', width: '80px', editable: true, field: 'totalTips' },
        { key: 'expensesTotal', label: 'Exp', width: '80px', editable: false },
        { key: 'profit', label: 'Profit', width: '100px', editable: false },
        { key: 'itemData', label: 'DATA', width: '60px', editable: false, field: 'itemData', hidden: !showDataColumn },
      ]
    }
  ];

  // Flatten columns for rendering (filter out hidden columns)
  const allColumns = columnGroups.flatMap(group => 
    group.collapsed ? [] : group.columns.filter(col => !col.hidden)
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
      case 'invoiceDetails':
        // Hamburger menu button to show invoice tab items
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setInvoiceDetailsEventId(invoiceDetailsEventId === event._id ? null : event._id);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '2px 6px',
              color: '#666',
            }}
            title="View Invoice Items"
          >
            ☰
          </button>
        );
      case 'lockBasicInfo':
      case 'lockOverhead':
      case 'lockPaymentModel':
        const lockGroup = column.lockGroup;
        const isLocked = getRowLock(event._id, lockGroup);
        return (
          <img
            src={isLocked ? '/assets/icons/LOCKED.png' : '/assets/icons/UNLOCKED.png'}
            alt={isLocked ? 'Locked' : 'Unlocked'}
            onClick={(e) => {
              e.stopPropagation();
              if (isLocked) {
                setUnlockConfirm({ eventId: event._id, lockGroup });
              } else {
                setRowLock(event._id, lockGroup, true);
              }
            }}
            style={{
              cursor: 'pointer',
              width: '16px',
              height: '16px',
              opacity: 0.6,
              filter: 'grayscale(100%)',
            }}
            title={isLocked ? 'Click to unlock editing' : 'Click to lock editing'}
          />
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
      case 'salesTax':
        // Model C = no alcohol sold, so no sales tax
        if ((getCurrentValue(event, 'paymentModel') || 'S') === 'C') return '-';
        // Tax - 8% of all payment methods (CASH + CREDIT + INVOICE)
        const parsedForTax = parseItemData(event.itemData);
        const cashForTax = parsedForTax.paymentTotals.CASH > 0 ? parsedForTax.paymentTotals.CASH : (event.cashTotal || 0);
        const creditForTax = parsedForTax.paymentTotals.CREDIT > 0 ? parsedForTax.paymentTotals.CREDIT : (event.creditTotal || 0);
        const invoiceForTax = parsedForTax.paymentTotals.INVOICE > 0 ? parsedForTax.paymentTotals.INVOICE : (event.invoiceTotal || 0);
        const totalForTax = cashForTax + creditForTax + invoiceForTax;
        const salesTaxAmount = totalForTax * 0.08;
        return salesTaxAmount > 0 ? (
          <span style={{ color: '#666' }}>
            ${salesTaxAmount.toFixed(2)}
          </span>
        ) : '-';
      case 'tips': {
        // Count bartenders from laborDetails array
        const laborDetails = event.laborDetails || [];
        const bartenderCount = laborDetails.filter(l => 
          l.title?.toLowerCase().includes('bartender') || 
          l.job?.toLowerCase().includes('bartender')
        ).length;
        const storedTips = parseFloat(event.totalTips) || 0;
        const tipsReceived = parseFloat(getCurrentValue(event, 'amountReceived')) || 0;
        const tipsInvoice = calculateInvoice(event);
        const overpaymentTip = Math.max(0, tipsReceived - tipsInvoice);
        const totalTips = storedTips + overpaymentTip;
        
        if (bartenderCount > 1 && totalTips > 0) {
          const tipsPerPerson = totalTips / bartenderCount;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span>{formatCurrency(tipsPerPerson)}</span>
              <span style={{ fontSize: '10px', color: '#666' }}>x{bartenderCount}</span>
            </div>
          );
        }
        return totalTips > 0 ? formatCurrency(totalTips) : '-';
      }
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
        // Cash payments - use parsed itemData if available, fallback to stored value
        const parsedCash = parseItemData(event.itemData);
        const cashTotal = parsedCash.paymentTotals.CASH > 0 ? parsedCash.paymentTotals.CASH : (event.cashTotal || 0);
        return cashTotal > 0 ? (
          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
            +${cashTotal.toFixed(2)}
          </span>
        ) : '-';
      case 'creditTotal':
        // Credit payments - use parsed itemData if available, fallback to stored value
        const parsedCredit = parseItemData(event.itemData);
        const creditTotal = parsedCredit.paymentTotals.CREDIT > 0 ? parsedCredit.paymentTotals.CREDIT : (event.creditTotal || 0);
        return creditTotal > 0 ? (
          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
            +${creditTotal.toFixed(2)}
          </span>
        ) : '-';
      case 'invoiceTotal': {
        // Show the raw invoice tab total: subtotal + 8% tax (no OHD/permit/insurance)
        // Tax omitted for Model C (no alcohol sold via invoice)
        const parsedInv = parseItemData(event.itemData);
        const invSubtotal = parsedInv.paymentTotals.INVOICE > 0 ? parsedInv.paymentTotals.INVOICE : (event.invoiceTotal || 0);
        const isInvModelC = (getCurrentValue(event, 'paymentModel') || 'S') === 'C';
        const invTax = isInvModelC ? 0 : invSubtotal * 0.08;
        const invDisplayTotal = invSubtotal + invTax;
        const rcvdInv = parseFloat(getCurrentValue(event, 'amountReceived')) || 0;
        return invDisplayTotal > 0 ? (
          <span style={{ color: rcvdInv >= invDisplayTotal ? '#22c55e' : '#666', fontWeight: 'bold' }}>
            ${invDisplayTotal.toFixed(2)}
          </span>
        ) : '-';
      }
      case 'itemData':
        // Show hamburger menu icon for item data
        const itemDataStr = event.itemData || '';
        const hasData = itemDataStr && itemDataStr.trim().length > 0;
        return (
          <span 
            style={{ fontSize: '16px', color: hasData ? '#666' : '#ccc', cursor: hasData ? 'pointer' : 'default' }}
            title={hasData ? 'Click to view item data' : 'No item data'}
            onClick={(e) => {
              if (hasData) {
                e.stopPropagation();
                setDataPopupEvent(event);
              }
            }}>
            ☰
          </span>
        );
      case 'expensesTotal':
        // Sum of all expenses (excluding tax - tax is now just a record in Revenue section)
        const expensesSum = 
          (parseFloat(getCurrentValue(event, 'accommodationCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'travelCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'permitCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'insuranceCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'laborCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'spillageCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'cogsCost')) || 0);
        return expensesSum > 0 ? (
          <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
            -${expensesSum.toFixed(2)}
          </span>
        ) : '-';
      case 'profit':
        // Profit = Received − Exp − Tax
        const profitReceived = parseFloat(getCurrentValue(event, 'amountReceived')) || 0;
        const profitExpenses =
          (parseFloat(getCurrentValue(event, 'accommodationCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'travelCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'permitCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'insuranceCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'laborCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'spillageCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'cogsCost')) || 0);
        const profitModel = getCurrentValue(event, 'paymentModel') || 'S';
        const profitParsed = parseItemData(event.itemData);
        const profitCash = profitParsed.paymentTotals.CASH > 0 ? profitParsed.paymentTotals.CASH : (event.cashTotal || 0);
        const profitCredit = profitParsed.paymentTotals.CREDIT > 0 ? profitParsed.paymentTotals.CREDIT : (event.creditTotal || 0);
        const profitTips = parseFloat(event.totalTips) || 0;
        let profit;
        if (profitModel === 'H') {
          // Profit = (Invoice + Sales + Tips) − (Tax + Exp)
          const hInvoice = calculateInvoice(event);
          const hSales = profitCash + profitCredit;
          const hTax = hSales * 0.08;
          profit = (hInvoice + hSales + profitTips) - (hTax + profitExpenses);
        } else if (profitModel === 'C') {
          // Profit = Received − Exp  (no tax for C)
          profit = profitReceived - profitExpenses;
        } else {
          // Model S: Profit = Received − Exp − Tax
          const sTax = (profitCash + profitCredit) * 0.08;
          profit = profitReceived - profitExpenses - sTax;
        }
        return (
          <span style={{ color: profit > 0 ? '#22c55e' : profit < 0 ? '#ef4444' : '#666', fontWeight: 'bold' }}>
            {formatCurrency(profit)}
          </span>
        );
      case 'paymentModel': {
        // S/C/H checkboxes for payment model
        const currentModel = getCurrentValue(event, 'paymentModel') || 'S';
        const isModelLocked = getRowLock(event._id, 'paymentModel');
        if (isModelLocked) {
          return (
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#800080' }}>
              {currentModel}
            </span>
          );
        }
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
      }
      case 'calculatedInvoice':
        // Calculated invoice based on payment model
        const invoiceAmount = calculateInvoice(event);
        return (
          <span style={{ color: '#666', fontWeight: 'bold' }}>
            ${invoiceAmount.toFixed(2)}
          </span>
        );
      case 'amountReceived':
        // Editable when paymentModel section is unlocked
        const received = getCurrentValue(event, 'amountReceived') || 0;
        const calcInvoice = calculateInvoice(event);
        const isPaymentModelLocked = getRowLock(event._id, 'paymentModel');
        
        // When locked, show read-only display (no +tip display - extra goes to Tips column)
        if (isPaymentModelLocked) {
          return (
            <span style={{
              fontWeight: 'bold',
              color: parseFloat(received) >= calcInvoice ? '#22c55e' : '#666',
            }}>
              {received > 0 ? `$${parseFloat(received).toFixed(2)}` : '-'}
            </span>
          );
        }
        
        // When unlocked, show editable input (extra amount goes to Tips column on blur)
        return (
          <input
            type="text"
            inputMode="decimal"
            value={editedEvents[event._id]?.amountReceived !== undefined 
              ? editedEvents[event._id].amountReceived 
              : (received === 0 ? '' : received)}
            onChange={(e) => {
              e.stopPropagation();
              const inputValue = e.target.value;
              // Allow decimal input - store raw string value while typing
              setEditedEvents(prev => ({
                ...prev,
                [event._id]: {
                  ...prev[event._id],
                  amountReceived: inputValue
                }
              }));
            }}
            onBlur={(e) => {
              // On blur, parse and save the final value
              // Overpayment tip is computed dynamically in the Tips column — no mutation needed
              const newReceived = parseFloat(e.target.value) || 0;
              handleFieldChange(event._id, 'amountReceived', newReceived);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            style={{
              width: '80px',
              padding: '4px 6px',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              textAlign: 'center',
              fontWeight: 'bold',
              color: parseFloat(received) >= calcInvoice ? '#22c55e' : '#666',
              background: 'transparent',
              outline: 'none',
            }}
          />
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
        height: '100%', // Fixed height to match chart container
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
        {showRatePanel && (
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
        )}
        
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => {
              // Check if P&L Report view is currently active (Basic Info hidden, all 3 P&L sections open)
              const isPLReportView = basicInfoCollapsed && !overheadCollapsed && !paymentModelCollapsed && !paymentMethodsCollapsed;
              if (isPLReportView) {
                // Switch to Summary view - show Basic Info, close P&L sections
                setBasicInfoCollapsed(false);
                setOverheadCollapsed(true);
                setPaymentModelCollapsed(true);
                setPaymentMethodsCollapsed(true);
              } else {
                // Switch to P&L Report view - hide Basic Info, open all P&L sections
                setBasicInfoCollapsed(true);
                setOverheadCollapsed(false);
                setPaymentModelCollapsed(false);
                setPaymentMethodsCollapsed(false);
              }
            }}
            style={{
              padding: '8px 16px',
              background: '#999',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {(basicInfoCollapsed && !overheadCollapsed && !paymentModelCollapsed && !paymentMethodsCollapsed) ? 'Summary' : 'P&L Report'}
          </button>
          <button
            onClick={() => setShowRatePanel(prev => !prev)}
            style={{
              padding: '8px 16px',
              background: showRatePanel ? '#666' : '#999',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Rate
          </button>
          <button
            onClick={() => setShowDataColumn(prev => !prev)}
            style={{
              padding: '8px 16px',
              background: showDataColumn ? '#666' : '#999',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Data
          </button>
          {Object.keys(editedEvents).length > 0 && (
            <button
              onClick={() => setShowSaveConfirm(true)}
              style={{
                padding: '8px 16px',
                background: '#4caf50',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              Save Changes
            </button>
          )}
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
          {/* Graph View - Fixed height container */}
          <div style={{ height: '480px', minHeight: '480px', maxHeight: '480px', marginBottom: '16px', border: '1px solid #ddd', borderRadius: '8px', background: '#fff', overflow: 'hidden', display: 'flex' }}>
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
                  {selectedEvent && (() => {
                    const selEvt = events.find(e => e._id === selectedEvent);
                    return selEvt ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setLaborPopupEvent(selEvt)}
                          style={{ padding: '4px 10px', background: '#800080', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          Labor
                        </button>
                        <button
                          onClick={() => setInventoryPopupEvent(selEvt)}
                          style={{ padding: '4px 10px', background: '#800080', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          Inventory
                        </button>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            
            {/* Graph Content */}
            <div ref={graphContainerRef} style={{ height: 'calc(100% - 50px)', padding: '16px', overflow: 'auto' }}>
              {graphEventId ? (() => { try {
                const graphEvent = events.find(e => e._id === graphEventId);
                if (!graphEvent) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                      Event not found
                    </div>
                  );
                }
                
                // Category colors
                const categoryColors = {
                  cocktails: '#9333ea',
                  mocktails: '#22c55e',
                  beer: '#f59e0b',
                  wine: '#ef4444',
                  spirits: '#3b82f6',
                  other: '#6b7280',
                };
                
                // Parse time string to minutes since midnight
                const parseTimeStr = (timeStr) => {
                  if (!timeStr) return null;
                  // Handle various formats: "1:00 PM", "13:00", "1:00PM", etc.
                  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
                  if (!match) return null;
                  let hours = parseInt(match[1]);
                  const minutes = parseInt(match[2]);
                  const ampm = match[3]?.toUpperCase();
                  if (ampm === 'PM' && hours !== 12) hours += 12;
                  if (ampm === 'AM' && hours === 12) hours = 0;
                  // If no AM/PM and hours < 12, assume PM for typical event times
                  if (!ampm && hours >= 1 && hours <= 11) hours += 12;
                  return hours * 60 + minutes;
                };
                
                // Get event start/end times first — use getCurrentValue to catch unsaved edits
                let eventStartMinutes = parseTimeStr(getCurrentValue(graphEvent, 'startTime') || graphEvent.startTime);
                let eventEndMinutes = parseTimeStr(getCurrentValue(graphEvent, 'endTime') || graphEvent.endTime);
                
                // Parse ALL itemData to collect sales (don't filter by category yet for time range)
                const allSaleTimes = [];
                const categories = new Set();
                const itemNames = new Set();
                const salesByInterval = {};
                
                if (graphEvent.itemData && graphEvent.itemData.length > 0) {
                  const lines = graphEvent.itemData.split('\n').filter(Boolean);
                  
                  lines.forEach(line => {
                    const parts = line.split(', ').map(p => p.trim());
                    if (parts.length >= 3) {
                      const itemName = parts[0];
                      const category = (parts[1] || 'other').toLowerCase();
                      const timeStr = parts[2];
                      const cost = parts.length >= 5 ? parseFloat(parts[4]) || 0 : 0;
                      
                      const timeParts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
                      if (timeParts) {
                        let hours = parseInt(timeParts[1]);
                        const minutes = parseInt(timeParts[2]);
                        const ampm = timeParts[3]?.toUpperCase();
                        
                        if (ampm === 'PM' && hours !== 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                        if (!ampm && hours >= 1 && hours <= 11) hours += 12;
                        
                        const totalMinutes = hours * 60 + minutes;
                        allSaleTimes.push(totalMinutes);
                        
                        const roundedMinutes = Math.floor(minutes / 15) * 15;
                        const intervalKey = `${hours.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`;
                        
                        if (!salesByInterval[intervalKey]) {
                          salesByInterval[intervalKey] = { categories: {}, items: {} };
                        }
                        
                        // Track categories (always, for legend)
                        categories.add(category);
                        
                        // Only add to data if matches current view mode
                        const matchesFilter = graphViewMode === 'all' || category === graphViewMode || category.includes(graphViewMode);
                        
                        if (matchesFilter) {
                          // Track categories for this interval
                          if (!salesByInterval[intervalKey].categories[category]) {
                            salesByInterval[intervalKey].categories[category] = { count: 0, revenue: 0 };
                          }
                          salesByInterval[intervalKey].categories[category].count += 1;
                          salesByInterval[intervalKey].categories[category].revenue += cost;
                          
                          // Track individual items
                          if (!salesByInterval[intervalKey].items[itemName]) {
                            salesByInterval[intervalKey].items[itemName] = { count: 0, revenue: 0, category };
                          }
                          salesByInterval[intervalKey].items[itemName].count += 1;
                          salesByInterval[intervalKey].items[itemName].revenue += cost;
                          itemNames.add(itemName);
                        }
                      }
                    }
                  });
                }
                
                // Last-resort default: 6 PM – 11 PM so the graph always renders something
                if ((eventStartMinutes === null || eventEndMinutes === null) && allSaleTimes.length === 0) {
                  if (eventStartMinutes === null) eventStartMinutes = 18 * 60;  // 6:00 PM
                  if (eventEndMinutes === null)   eventEndMinutes   = 23 * 60;  // 11:00 PM
                }
                // Fallback to sales data range if event times not available
                if ((eventStartMinutes === null || eventEndMinutes === null) && allSaleTimes.length > 0) {
                  eventStartMinutes = Math.min(...allSaleTimes);
                  eventEndMinutes = Math.max(...allSaleTimes);
                }
                
                // Generate all 15-minute intervals for the full range
                // Use exact start time + 15 min increments (no rounding)
                const timeIntervals = {};
                
                if (eventStartMinutes !== null && eventEndMinutes !== null) {
                  // Start from exact event start time, add 15 min intervals until end
                  for (let mins = eventStartMinutes; mins <= eventEndMinutes; mins += 15) {
                    const hours = Math.floor(mins / 60);
                    const minutes = mins % 60;
                    const intervalKey = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                    // Find sales that fall within this 15-min window
                    // Check all salesByInterval keys to find matches within this interval range
                    let intervalCategories = {};
                    let intervalItems = {};
                    
                    // Look for sales in the range [mins, mins+15)
                    Object.entries(salesByInterval).forEach(([saleKey, saleData]) => {
                      const [saleHour, saleMin] = saleKey.split(':').map(Number);
                      const saleMinutes = saleHour * 60 + saleMin;
                      if (saleMinutes >= mins && saleMinutes < mins + 15) {
                        // Merge this sale data into the interval
                        Object.entries(saleData.categories || {}).forEach(([cat, catData]) => {
                          if (!intervalCategories[cat]) intervalCategories[cat] = { count: 0, revenue: 0 };
                          intervalCategories[cat].count += catData.count;
                          intervalCategories[cat].revenue += catData.revenue;
                        });
                        Object.entries(saleData.items || {}).forEach(([item, itemData]) => {
                          if (!intervalItems[item]) intervalItems[item] = { count: 0, revenue: 0, category: itemData.category };
                          intervalItems[item].count += itemData.count;
                          intervalItems[item].revenue += itemData.revenue;
                        });
                      }
                    });
                    
                    timeIntervals[intervalKey] = { hours, minutes, categories: intervalCategories, items: intervalItems };
                  }
                }
                
                // Sort intervals by time
                const sortedIntervals = Object.entries(timeIntervals)
                  .sort((a, b) => {
                    const aTime = a[1].hours * 60 + a[1].minutes;
                    const bTime = b[1].hours * 60 + b[1].minutes;
                    return aTime - bTime;
                  });
                
                if (sortedIntervals.length === 0) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                      No event time data available
                    </div>
                  );
                }
                
                // Determine what to show: categories (all mode) or items (specific category)
                const isAllMode = graphViewMode === 'all';
                const seriesList = isAllMode ? Array.from(categories).sort() : Array.from(itemNames).sort();
                
                const timeLabels = sortedIntervals.map(([key, interval]) => {
                  const hours = interval.hours;
                  const minutes = interval.minutes;
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
                  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
                });
                
                // Get max count for scaling
                let maxCount = 1;
                sortedIntervals.forEach(([key, interval]) => {
                  const dataSource = isAllMode ? interval.categories : interval.items;
                  Object.values(dataSource).forEach(item => {
                    if (item.count > maxCount) maxCount = item.count;
                  });
                });
                
                // Generate colors for items (when in specific category mode)
                const itemColors = {};
                const colorPalette = ['#9333ea', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#d946ef'];
                seriesList.forEach((name, idx) => {
                  itemColors[name] = colorPalette[idx % colorPalette.length];
                });
                
                // SVG dimensions - use actual container pixel width (updated by ResizeObserver)
                const svgPadding = { top: 20, right: 20, bottom: 60, left: 40 };
                const width = Math.max(graphContainerWidth - 32, 300); // subtract container padding (16px each side)
                const height = 220;
                const padding = svgPadding;
                const graphWidth = width - padding.left - padding.right;
                const graphHeight = height - padding.top - padding.bottom;
                
                return (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                      {seriesList.length === 0 && (
                        <span style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>No sales data recorded — showing event time window</span>
                      )}
                      {seriesList.map(name => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '12px', height: '3px', background: isAllMode ? (categoryColors[name] || '#6b7280') : itemColors[name], borderRadius: '2px' }} />
                          <span style={{ fontSize: '12px', color: '#666', textTransform: isAllMode ? 'capitalize' : 'none' }}>{name}</span>
                        </div>
                      ))}
                    </div>
                    
                    {/* SVG Line Graph - full width */}
                    <svg width={width} height={height} style={{ display: 'block', flex: 1 }}>
                      {/* Y-axis */}
                      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#ddd" strokeWidth="1" />
                      {/* X-axis */}
                      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#ddd" strokeWidth="1" />
                      
                      {/* Y-axis labels */}
                      {[0, Math.ceil(maxCount / 2), maxCount].map((val, i) => (
                        <text key={i} x={padding.left - 8} y={height - padding.bottom - (val / maxCount) * graphHeight} fontSize="10" fill="#999" textAnchor="end" dominantBaseline="middle">
                          {val}
                        </text>
                      ))}
                      
                      {/* Grid lines */}
                      {[0.25, 0.5, 0.75, 1].map((pct, i) => (
                        <line key={i} x1={padding.left} y1={height - padding.bottom - pct * graphHeight} x2={width - padding.right} y2={height - padding.bottom - pct * graphHeight} stroke="#f0f0f0" strokeWidth="1" />
                      ))}
                      
                      {/* Lines for each series (categories in 'all' mode, items in specific category mode) */}
                      {seriesList.map(seriesName => {
                        // Calculate points for curved line
                        const pointsArray = sortedIntervals.map(([key, interval], idx) => {
                          const x = padding.left + (idx / (sortedIntervals.length - 1 || 1)) * graphWidth;
                          const dataSource = isAllMode ? interval.categories : interval.items;
                          const count = dataSource[seriesName]?.count || 0;
                          const y = height - padding.bottom - (count / maxCount) * graphHeight;
                          return { x, y };
                        });
                        
                        // Generate smooth curve path using cubic bezier
                        let pathD = '';
                        if (pointsArray.length > 0) {
                          pathD = `M ${pointsArray[0].x},${pointsArray[0].y}`;
                          for (let i = 1; i < pointsArray.length; i++) {
                            const prev = pointsArray[i - 1];
                            const curr = pointsArray[i];
                            // Control point offset (tension factor)
                            const tension = 0.3;
                            const dx = (curr.x - prev.x) * tension;
                            // Cubic bezier: C cp1x,cp1y cp2x,cp2y x,y
                            pathD += ` C ${prev.x + dx},${prev.y} ${curr.x - dx},${curr.y} ${curr.x},${curr.y}`;
                          }
                        }
                        
                        const lineColor = isAllMode ? (categoryColors[seriesName] || '#6b7280') : itemColors[seriesName];
                        
                        return (
                          <g key={seriesName}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={lineColor}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            {/* Data points */}
                            {sortedIntervals.map(([key, interval], idx) => {
                              const x = padding.left + (idx / (sortedIntervals.length - 1 || 1)) * graphWidth;
                              const dataSource = isAllMode ? interval.categories : interval.items;
                              const count = dataSource[seriesName]?.count || 0;
                              const y = height - padding.bottom - (count / maxCount) * graphHeight;
                              return count > 0 ? (
                                <circle key={idx} cx={x} cy={y} r="4" fill={lineColor}>
                                  <title>{`${seriesName}: ${count} items`}</title>
                                </circle>
                              ) : null;
                            })}
                          </g>
                        );
                      })}
                      
                      {/* X-axis labels */}
                      {timeLabels.map((label, idx) => (
                        <text
                          key={idx}
                          x={padding.left + (idx / (sortedIntervals.length - 1 || 1)) * graphWidth}
                          y={height - padding.bottom + 25}
                          fontSize="10"
                          fill="#666"
                          textAnchor="middle"
                          transform={`rotate(-45, ${padding.left + (idx / (sortedIntervals.length - 1 || 1)) * graphWidth}, ${height - padding.bottom + 25})`}
                        >
                          {label}
                        </text>
                      ))}
                    </svg>
                  </div>
                );
              } catch(graphErr) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', fontSize: '13px' }}>
                    Graph error: {graphErr.message}
                  </div>
                );
              }})() : (
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
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
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
                        padding: '0 8px',
                        height: '32px',
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
                        padding: '0 8px',
                        height: '44px',
                        textAlign: 'center',
                        borderBottom: '2px solid #ddd',
                        borderRight: isLastInGroup && groupIdx < columnGroups.length - 1 ? '2px solid #999' : '1px solid #e5e5e5',
                        fontSize: col.isDeleteHeader ? '20px' : '12px',
                        fontWeight: '600',
                        color: (col.key === 'delete' || col.isLockHeader) ? '#999' : '#333',
                        whiteSpace: 'nowrap',
                        width: col.width,
                      }}
                    >
                      {col.isLockHeader ? (
                        <img 
                          src="/assets/icons/LOCKED.png" 
                          alt="Lock" 
                          style={{ width: '16px', height: '16px', opacity: 0.6, filter: 'grayscale(100%)' }} 
                        />
                      ) : col.isDeleteHeader ? (
                        <span style={{ color: '#999' }}>×</span>
                      ) : col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {events.map((event, idx) => (
                <tr
                  key={event._id}
                  onClick={() => { setSelectedEvent(event._id); setGraphEventId(event._id); }}
                  style={{
                    background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                  onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'}
                >
                  {allColumns.map((col, colIdx) => {
                    const groupIdx = columnGroups.findIndex(g => !g.collapsed && g.columns.includes(col));
                    const isLastInGroup = columnGroups[groupIdx]?.columns[columnGroups[groupIdx].columns.length - 1] === col;
                    
                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: '0 8px',
                          height: '44px',
                          borderBottom: '1px solid #eee',
                          borderRight: isLastInGroup && groupIdx < columnGroups.length - 1 ? '2px solid #999' : '1px solid #e5e5e5',
                          fontSize: '13px',
                          color: '#333',
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                        }}
                      >
                        {col.editable && col.lockGroup && !getRowLock(event._id, col.lockGroup) && col.key !== 'paymentModel' ? (
                          <input
                            type="text"
                            value={getCurrentValue(event, col.field) ?? ''}
                            onChange={(e) => handleFieldChange(event._id, col.field, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '90%',
                              padding: '4px',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '13px',
                              textAlign: 'center',
                              background: 'transparent',
                              outline: 'none',
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

      {/* Unlock Confirmation Modal */}
      {unlockConfirm && (
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
                onClick={() => {
                  setRowLock(unlockConfirm.eventId, unlockConfirm.lockGroup, false);
                  setUnlockConfirm(null);
                }}
                style={{
                  padding: '10px 24px',
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Unlock
              </button>
              <button
                onClick={() => setUnlockConfirm(null)}
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

      {/* DATA Popup Modal */}
      {dataPopupEvent && (
        <div 
          style={{
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
          }}
          onClick={() => setDataPopupEvent(null)}
        >
          <div 
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                Event Data - {dataPopupEvent.name}
              </h3>
              <button
                onClick={() => setDataPopupEvent(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0 8px',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ 
              flex: 1, 
              overflow: 'auto', 
              background: '#f5f5f5', 
              borderRadius: '8px', 
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {dataPopupEvent.itemData || 'No data available'}
            </div>
          </div>
        </div>
      )}

      {/* Labor Popup Modal */}
      {laborPopupEvent && (() => {
        const laborList = laborPopupEvent.laborDetails || [];
        const totalHours = laborList.reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0);
        const storedTips = parseFloat(laborPopupEvent.totalTips) || 0;
        const received = parseFloat(laborPopupEvent.amountReceived) || 0;
        const invoice = calculateInvoice(laborPopupEvent);
        const totalTipsEff = storedTips + Math.max(0, received - invoice);
        const totalLabor = laborList.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => setLaborPopupEvent(null)}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '700px', width: '95%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Labor — {laborPopupEvent.name}</h3>
                <button onClick={() => setLaborPopupEvent(null)} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666', padding: '0 8px' }}>×</button>
              </div>
              {laborList.length === 0 ? (
                <div style={{ color: '#999', textAlign: 'center', padding: '24px' }}>No labor data recorded</div>
              ) : (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Position</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Hours</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Rate</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Earned</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Tip Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laborList.map((l, idx) => {
                        const hrs = parseFloat(l.hours) || 0;
                        const tipOut = totalHours > 0 ? (totalTipsEff / totalHours) * hrs : 0;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '10px 12px' }}>{l.title || '—'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>{hrs.toFixed(2)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>${(parseFloat(l.rate) || 0).toFixed(2)}/hr</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500 }}>${(parseFloat(l.total) || 0).toFixed(2)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#800080', fontWeight: 500 }}>${tipOut.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f9f9f9', borderTop: '2px solid #ddd', fontWeight: 'bold' }}>
                        <td style={{ padding: '10px 12px' }}>Total</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{totalHours.toFixed(2)}</td>
                        <td style={{ padding: '10px 12px' }}></td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>${totalLabor.toFixed(2)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#800080' }}>${totalTipsEff.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {totalHours > 0 && (
                    <div style={{ marginTop: '12px', fontSize: '12px', color: '#666', padding: '8px 12px', background: '#f9f9f9', borderRadius: '6px' }}>
                      Tip rate: ${(totalTipsEff / totalHours).toFixed(2)}/hr · Total tips: ${totalTipsEff.toFixed(2)} ÷ {totalHours.toFixed(2)} hrs
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Inventory Popup Modal */}
      {inventoryPopupEvent && (() => {
        const ev = inventoryPopupEvent;
        const glassware = (ev.glassware || []).filter(g => (g.sent || 0) > 0 || (g.returned || 0) > 0 || (g.returnedClean || 0) + (g.returnedDirty || 0) > 0);
        const hasIce = (ev.iceBlocksBrought || 0) > 0 || (ev.iceBlocksReturned || 0) > 0;
        const bottles = ev.bottlesPrepped || [];
        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => setInventoryPopupEvent(null)}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '620px', width: '95%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Inventory — {ev.name}</h3>
                <button onClick={() => setInventoryPopupEvent(null)} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666', padding: '0 8px' }}>×</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {/* Glassware */}
                {glassware.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: '600', color: '#333' }}>Glassware</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Type</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Sent</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Returned</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Lost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {glassware.map((g, idx) => {
                          const ret = g.returned || (g.returnedClean || 0) + (g.returnedDirty || 0);
                          const lost = Math.max(0, (g.sent || 0) - ret);
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '8px 12px' }}>{g.type}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>{g.sent || 0}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>{ret}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', color: lost > 0 ? '#ef4444' : '#333', fontWeight: lost > 0 ? 'bold' : 'normal' }}>{lost}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Ice Blocks */}
                {hasIce && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: '600', color: '#333' }}>Ice Blocks</h4>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {[
                        { label: 'Sent', value: ev.iceBlocksBrought || 0, color: '#333' },
                        { label: 'Returned', value: ev.iceBlocksReturned || 0, color: '#333' },
                        { label: 'Used', value: (ev.iceBlocksBrought || 0) - (ev.iceBlocksReturned || 0), color: '#800080' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ flex: 1, background: '#f5f5f5', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>{label}</div>
                          <div style={{ fontSize: '22px', fontWeight: 'bold', color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Bottles / Inventory */}
                {bottles.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: '600', color: '#333' }}>Bottles (Sent vs Returned)</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Item</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Sent</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Returned</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bottles.map((b, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 12px' }}>{b.name}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>{b.unitsPrepared}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>{b.unitsReturned}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold' }}>{b.unitsUsed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {glassware.length === 0 && !hasIce && bottles.length === 0 && (
                  <div style={{ color: '#999', textAlign: 'center', padding: '24px' }}>No inventory data recorded</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Invoice Receipt Popup Modal */}
      {invoiceDetailsEventId && (() => {
        const event = events.find(e => e._id === invoiceDetailsEventId);
        if (!event) return null;
        
        const receiptModel = getCurrentValue(event, 'paymentModel') || 'S';
        const isModelC = receiptModel === 'C';
        const isModelH = receiptModel === 'H';
        const parsed = parseItemData(event.itemData);

        // S/C: invoice tab items
        const invoiceItems = parsed.items.filter(item => item.transactionType === 'INVOICE');
        const invoiceSubtotal = invoiceItems.reduce((sum, item) => sum + item.cost, 0);
        const invoiceTax = isModelC ? 0 : invoiceSubtotal * 0.08;
        const invoiceTotal = invoiceSubtotal + invoiceTax;
        const groupedInvoiceItems = Object.values(
          invoiceItems.reduce((acc, item) => {
            if (!acc[item.name]) acc[item.name] = { name: item.name, count: 0, total: 0 };
            acc[item.name].count += 1;
            acc[item.name].total += item.cost;
            return acc;
          }, {})
        );

        // H: bar sales items (cash + credit tabs)
        const barItems = parsed.items.filter(item => item.transactionType === 'CASH' || item.transactionType === 'CREDIT');
        const groupedBarItems = Object.values(
          barItems.reduce((acc, item) => {
            if (!acc[item.name]) acc[item.name] = { name: item.name, count: 0, total: 0 };
            acc[item.name].count += 1;
            acc[item.name].total += item.cost;
            return acc;
          }, {})
        );
        const barSalesTotal = barItems.reduce((sum, item) => sum + item.cost, 0);

        // Additional charges
        const permitCost = parseFloat(event.permitCost) || 0;
        const insuranceCost = parseFloat(event.insuranceCost) || 0;
        const overheadCost = pricingVars.overhead || 0;

        // Model S formula components
        const sGuestCount = parseFloat(event.guestCount) || 0;
        const sDurationHrs = parseFloat(event.durationHours) || 0;
        const sServiceCost = (Math.min(sDurationHrs, 2) * pricingVars.first2Hr * sGuestCount)
          + (Math.max(sDurationHrs - 2, 0) * pricingVars.addHr * sGuestCount);
        const sFinalTotal = Math.max(sServiceCost, pricingVars.minimum);
        const sDisplayServiceCost = sFinalTotal - overheadCost - insuranceCost - permitCost;

        // Model C formula components
        const cChargeBase = pricingVars.perPerson * sGuestCount;
        const cFinalTotal = Math.max(cChargeBase, pricingVars.minimum);
        const cDisplayServiceCost = cFinalTotal - overheadCost - insuranceCost - permitCost;

        // H: receipt components
        const hInvoiceTax = isModelH ? invoiceSubtotal * 0.08 : 0;
        const hTabTotal = isModelH ? invoiceSubtotal + hInvoiceTax : 0;
        const hCashBar = isModelH ? barSalesTotal : 0;
        const hTotalSales = isModelH ? (barSalesTotal + invoiceSubtotal) : 0;
        const hServiceCharge = isModelH ? Math.max(0, pricingVars.minimum - hCashBar - hTabTotal - overheadCost - insuranceCost - permitCost) : 0;

        // Totals (model-aware)
        const hInvoiceTotal = isModelH ? calculateInvoice(event) : 0;
        const finalTotal = isModelH ? hInvoiceTotal : receiptModel === 'S' ? sFinalTotal : cFinalTotal;
        const showMinimumLine = false;
        
        const eventDate = event.date ? new Date(event.date).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric'
        }) : '';
        
        return (
          <div 
            style={{
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
            }}
            onClick={() => setInvoiceDetailsEventId(null)}
          >
            <div 
              style={{
                background: '#fff',
                borderRadius: '12px',
                maxWidth: '450px',
                width: '90%',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Receipt Content */}
              <div style={{ 
                flex: 1, 
                overflow: 'auto', 
                padding: '24px',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
              }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '20px', paddingBottom: '20px', borderBottom: '2px dashed #ddd' }}>
                  <img 
                    src="/assets/icons/LOGO_echo.png" 
                    alt="Echo Catering" 
                    style={{ maxWidth: '150px', height: 'auto', marginBottom: '10px' }}
                  />
                  <div style={{ color: '#666', fontSize: '14px' }}>{eventDate}</div>
                  <div style={{ color: '#333', fontSize: '16px', fontWeight: 'bold', marginTop: '8px' }}>{event.name}</div>
                </div>
                
                {isModelH ? (
                  <>
                    {/* Model H: Itemized invoice tab */}
                    <div style={{ marginBottom: '4px' }}>
                      {groupedInvoiceItems.length > 0 ? (
                        groupedInvoiceItems.map((item, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                            <span style={{ color: '#333' }}>{item.count > 1 ? `${item.count}x ${item.name}` : item.name}</span>
                            <span style={{ color: '#333', fontWeight: 500 }}>${item.total.toFixed(2)}</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ textAlign: 'center', color: '#999', padding: '12px 0' }}>No invoice tab items</div>
                      )}
                    </div>
                    <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '10px 0' }} />
                    <div style={{ marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                        <span style={{ color: '#333' }}>Subtotal</span>
                        <span style={{ color: '#333' }}>${invoiceSubtotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                        <span style={{ color: '#333' }}>Tax (8%)</span>
                        <span style={{ color: '#333' }}>${hInvoiceTax.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '2px solid #ddd', fontWeight: 'bold' }}>
                        <span>Tab Total</span>
                        <span>${hTabTotal.toFixed(2)}</span>
                      </div>
                    </div>
                    <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '10px 0' }} />
                    <div style={{ marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                        <span style={{ color: '#999' }}>Cash Bar</span>
                        <span style={{ color: '#999' }}>${hCashBar.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                        <span style={{ color: '#999' }}>Total Sales</span>
                        <span style={{ color: '#999' }}>${hTotalSales.toFixed(2)}</span>
                      </div>
                    </div>
                    <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '10px 0' }} />
                    <div style={{ marginBottom: '4px' }}>
                      {hServiceCharge > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Service Charge</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${hServiceCharge.toFixed(2)}</span>
                        </div>
                      )}
                      {overheadCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Overhead</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${overheadCost.toFixed(2)}</span>
                        </div>
                      )}
                      {insuranceCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Insurance</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${insuranceCost.toFixed(2)}</span>
                        </div>
                      )}
                      {permitCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Permit</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${permitCost.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 5px', fontSize: '20px', fontWeight: 'bold', borderTop: '2px dashed #ddd', marginTop: '8px' }}>
                        <span>Invoice Total</span>
                        <span>${hInvoiceTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                ) : receiptModel === 'S' ? (
                  <>
                    {/* Model S */}
                    <div style={{ marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                        <span style={{ color: '#333' }}>Service Cost</span>
                        <span style={{ color: '#333', fontWeight: 500 }}>${sDisplayServiceCost.toFixed(2)}</span>
                      </div>
                      {overheadCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Overhead</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${overheadCost.toFixed(2)}</span>
                        </div>
                      )}
                      {insuranceCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Insurance</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${insuranceCost.toFixed(2)}</span>
                        </div>
                      )}
                      {permitCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Permit</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${permitCost.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ borderTop: '2px dashed #ddd', paddingTop: '15px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 5px', fontSize: '20px', fontWeight: 'bold' }}>
                        <span>Total</span>
                        <span>${sFinalTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Model C */}
                    <div style={{ marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                        <span style={{ color: '#333' }}>Service Cost</span>
                        <span style={{ color: '#333', fontWeight: 500 }}>${cDisplayServiceCost.toFixed(2)}</span>
                      </div>
                      {overheadCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Overhead</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${overheadCost.toFixed(2)}</span>
                        </div>
                      )}
                      {insuranceCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Insurance</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${insuranceCost.toFixed(2)}</span>
                        </div>
                      )}
                      {permitCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                          <span style={{ color: '#333' }}>Permit</span>
                          <span style={{ color: '#333', fontWeight: 500 }}>${permitCost.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ borderTop: '2px dashed #ddd', paddingTop: '15px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 5px', fontSize: '20px', fontWeight: 'bold' }}>
                        <span>Total</span>
                        <span>${cFinalTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}
                
                {/* Payment Method */}
                <div style={{ textAlign: 'center', marginTop: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '8px', color: '#666' }}>
                  Payment method: Invoice
                </div>
                
                {/* Footer */}
                <div style={{ textAlign: 'center', marginTop: '20px', color: '#999', fontSize: '12px' }}>
                  Thank you for your business!<br />
                  echocatering.com
                </div>
              </div>
              
              {/* Action Buttons */}
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                padding: '16px 24px', 
                borderTop: '1px solid #eee',
                background: '#fafafa',
              }}>
                <button
                  onClick={() => {
                    // Print functionality
                    const printWindow = window.open('', '_blank');
                    const receiptHtml = `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <title>Invoice Receipt - ${event.name}</title>
                        <style>
                          body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px; }
                          .header { text-align: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 2px dashed #ddd; }
                          .logo img { max-width: 150px; height: auto; }
                          .date { color: #666; font-size: 14px; }
                          .event-name { color: #333; font-size: 16px; font-weight: bold; margin-top: 8px; }
                          .item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                          .totals { border-top: 2px dashed #ddd; padding-top: 15px; margin-top: 15px; }
                          .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
                          .total-row.final { font-size: 20px; font-weight: bold; padding-top: 10px; border-top: 1px solid #ddd; margin-top: 10px; }
                          .payment-method { text-align: center; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 8px; color: #666; }
                          .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
                          @media print { body { margin: 0; } }
                        </style>
                      </head>
                      <body>
                        <div class="header">
                          <div class="logo"><img src="/assets/icons/LOGO_echo.png" alt="Echo Catering" /></div>
                          <div class="date">${eventDate}</div>
                          <div class="event-name">${event.name}</div>
                        </div>
                        ${isModelH ? `
                        <div class="items">
                          ${groupedInvoiceItems.length > 0 ? groupedInvoiceItems.map(item => `<div class="item"><span>${item.count > 1 ? item.count + 'x ' + item.name : item.name}</span><span>&nbsp;— $${item.total.toFixed(2)}</span></div>`).join('') : '<div class="item" style="color:#999">No invoice tab items</div>'}
                        </div>
                        <hr style="border:none;border-top:1px solid #ddd;margin:8px 0">
                        <div class="items">
                          <div class="item"><span>Subtotal</span><span>&nbsp;— $${invoiceSubtotal.toFixed(2)}</span></div>
                          <div class="item"><span>Tax (8%)</span><span>&nbsp;— $${hInvoiceTax.toFixed(2)}</span></div>
                          <div class="item" style="font-weight:bold;border-top:2px solid #ddd;padding-top:4px"><span>Tab Total</span><span>&nbsp;— $${hTabTotal.toFixed(2)}</span></div>
                        </div>
                        <hr style="border:none;border-top:1px solid #ddd;margin:8px 0">
                        <div class="items">
                          <div class="item" style="color:#999"><span>Cash Bar</span><span>&nbsp;— $${hCashBar.toFixed(2)}</span></div>
                          <div class="item" style="color:#999"><span>Total Sales</span><span>&nbsp;— $${hTotalSales.toFixed(2)}</span></div>
                        </div>
                        <hr style="border:none;border-top:1px solid #ddd;margin:8px 0">
                        <div class="items">
                          ${hServiceCharge > 0 ? `<div class="item"><span>Service Charge</span><span>&nbsp;— $${hServiceCharge.toFixed(2)}</span></div>` : ''}
                          ${overheadCost > 0 ? `<div class="item"><span>Overhead</span><span>&nbsp;— $${overheadCost.toFixed(2)}</span></div>` : ''}
                          ${insuranceCost > 0 ? `<div class="item"><span>Insurance</span><span>&nbsp;— $${insuranceCost.toFixed(2)}</span></div>` : ''}
                          ${permitCost > 0 ? `<div class="item"><span>Permit</span><span>&nbsp;— $${permitCost.toFixed(2)}</span></div>` : ''}
                        </div>
                        <div class="totals">
                          <div class="total-row final"><span>Invoice Total</span><span>&nbsp;— $${hInvoiceTotal.toFixed(2)}</span></div>
                        </div>
                        ` : receiptModel === 'S' ? `
                        <div class="items">
                          <div class="item"><span>Service Cost</span><span>&nbsp;— $${sDisplayServiceCost.toFixed(2)}</span></div>
                          ${overheadCost > 0 ? `<div class="item"><span>Overhead</span><span>&nbsp;— $${overheadCost.toFixed(2)}</span></div>` : ''}
                          ${insuranceCost > 0 ? `<div class="item"><span>Insurance</span><span>&nbsp;— $${insuranceCost.toFixed(2)}</span></div>` : ''}
                          ${permitCost > 0 ? `<div class="item"><span>Permit</span><span>&nbsp;— $${permitCost.toFixed(2)}</span></div>` : ''}
                        </div>
                        <div class="totals">
                          <div class="total-row final"><span>Total</span><span>&nbsp;— $${sFinalTotal.toFixed(2)}</span></div>
                        </div>
                        ` : `
                        <div class="items">
                          <div class="item"><span>Service Cost</span><span>&nbsp;— $${cDisplayServiceCost.toFixed(2)}</span></div>
                          ${overheadCost > 0 ? `<div class="item"><span>Overhead</span><span>&nbsp;— $${overheadCost.toFixed(2)}</span></div>` : ''}
                          ${insuranceCost > 0 ? `<div class="item"><span>Insurance</span><span>&nbsp;— $${insuranceCost.toFixed(2)}</span></div>` : ''}
                          ${permitCost > 0 ? `<div class="item"><span>Permit</span><span>&nbsp;— $${permitCost.toFixed(2)}</span></div>` : ''}
                        </div>
                        <div class="totals">
                          <div class="total-row final"><span>Total</span><span>&nbsp;— $${cFinalTotal.toFixed(2)}</span></div>
                        </div>
                        `}
                        <div class="payment-method">Payment method: Invoice</div>
                        <div class="footer">Thank you for your business!<br>echocatering.com</div>
                      </body>
                      </html>
                    `;
                    printWindow.document.write(receiptHtml);
                    printWindow.document.close();
                    printWindow.print();
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  🖨️ Print
                </button>
                <button
                  onClick={async () => {
                    // Share functionality - include additional charges
                    const additionalCharges = [
                      permitCost > 0 ? `Permit: $${permitCost.toFixed(2)}` : null,
                      insuranceCost > 0 ? `Insurance: $${insuranceCost.toFixed(2)}` : null,
                      overheadCost > 0 ? `Overhead: $${overheadCost.toFixed(2)}` : null,
                    ].filter(Boolean).join('\n');
                    const shareText = `Invoice Receipt - ${event.name}\n${eventDate}\n\n${invoiceItems.map(item => `${item.name}: $${item.cost.toFixed(2)}`).join('\n')}\n\nSubtotal: $${invoiceSubtotal.toFixed(2)}\nTax (8%): $${invoiceTax.toFixed(2)}${additionalCharges ? '\n' + additionalCharges : ''}\nTotal: $${finalTotal.toFixed(2)}\n\nPayment method: Invoice`;
                    
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: `Invoice Receipt - ${event.name}`,
                          text: shareText,
                        });
                      } catch (err) {
                        console.log('Share cancelled or failed');
                      }
                    } else {
                      // Fallback: copy to clipboard
                      navigator.clipboard.writeText(shareText);
                      alert('Receipt copied to clipboard!');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#22c55e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  📤 Share
                </button>
                <button
                  onClick={() => setInvoiceDetailsEventId(null)}
                  style={{
                    padding: '12px 20px',
                    background: '#e5e5e5',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default EventSales;
