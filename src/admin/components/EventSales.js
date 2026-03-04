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
  const [basicInfoCollapsed, setBasicInfoCollapsed] = useState(false);
  const [overheadCollapsed, setOverheadCollapsed] = useState(true);
  const [paymentMethodsCollapsed, setPaymentMethodsCollapsed] = useState(true);
  const [paymentModelCollapsed, setPaymentModelCollapsed] = useState(false);
  const [showDataColumn, setShowDataColumn] = useState(false); // DATA column hidden by default
  
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
  
  // Section lock states - controls whether fields in each section are editable
  const [sectionLocks, setSectionLocks] = useState({
    basicInfo: true,      // Initially locked
    overhead: true,       // Initially locked
    paymentModel: false,  // Initially unlocked
  });
  const [unlockConfirm, setUnlockConfirm] = useState(null); // Section name to confirm unlock
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

  // Parse itemData string and extract payment method totals and category breakdown
  // Format: "itemName, category, timestamp, paymentMethod, cost" per line
  const parseItemData = (itemDataStr) => {
    if (!itemDataStr || typeof itemDataStr !== 'string') {
      return { paymentTotals: { CASH: 0, CREDIT: 0, INVOICE: 0 }, categoryBreakdown: {} };
    }
    
    const paymentTotals = { CASH: 0, CREDIT: 0, INVOICE: 0 };
    const categoryBreakdown = {};
    
    const lines = itemDataStr.split('\n').filter(line => line.trim());
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 5) {
        const [itemName, category, timestamp, paymentMethod, costStr] = parts;
        const cost = parseFloat(costStr) || 0;
        const method = (paymentMethod || '').toUpperCase();
        
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
    
    return { paymentTotals, categoryBreakdown };
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
        { key: 'salesTax', label: 'Tax', width: '80px', editable: false },
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
      case 'lockBasicInfo':
      case 'lockOverhead':
      case 'lockPaymentModel':
        const lockGroup = column.lockGroup;
        const isLocked = sectionLocks[lockGroup];
        return (
          <img
            src={isLocked ? '/assets/icons/LOCKED.png' : '/assets/icons/UNLOCKED.png'}
            alt={isLocked ? 'Locked' : 'Unlocked'}
            onClick={(e) => {
              e.stopPropagation();
              if (isLocked) {
                setUnlockConfirm(lockGroup);
              } else {
                setSectionLocks(prev => ({ ...prev, [lockGroup]: true }));
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
      case 'invoiceTotal':
        // Invoice payments - use parsed itemData if available, fallback to stored value
        // Include 8% tax in the displayed amount
        const parsedInvoice = parseItemData(event.itemData);
        const invoiceSubtotal = parsedInvoice.paymentTotals.INVOICE > 0 ? parsedInvoice.paymentTotals.INVOICE : (event.invoiceTotal || 0);
        const invoiceTotalWithTax = invoiceSubtotal * 1.08;
        return invoiceSubtotal > 0 ? (
          <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
            ${invoiceTotalWithTax.toFixed(2)}
          </span>
        ) : '-';
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
                alert(itemDataStr);
              }
            }}>
            ☰
          </span>
        );
      case 'expensesTotal':
        // Sum of all expenses including tax, displayed as negative (loss)
        const parsedExpTax = parseItemData(event.itemData);
        const cashExpTax = parsedExpTax.paymentTotals.CASH > 0 ? parsedExpTax.paymentTotals.CASH : (event.cashTotal || 0);
        const creditExpTax = parsedExpTax.paymentTotals.CREDIT > 0 ? parsedExpTax.paymentTotals.CREDIT : (event.creditTotal || 0);
        const invoiceExpTax = parsedExpTax.paymentTotals.INVOICE > 0 ? parsedExpTax.paymentTotals.INVOICE : (event.invoiceTotal || 0);
        const totalExpTax = (cashExpTax + creditExpTax + invoiceExpTax) * 0.08;
        const expensesSum = 
          (parseFloat(getCurrentValue(event, 'accommodationCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'travelCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'permitCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'insuranceCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'laborCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'spillageCost')) || 0) +
          (parseFloat(getCurrentValue(event, 'cogsCost')) || 0) +
          totalExpTax;
        return expensesSum > 0 ? (
          <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
            -${expensesSum.toFixed(2)}
          </span>
        ) : '-';
      case 'profit':
        // Profit = Invoice Received + netIncome (if negative, it subtracts)
        const invoiceReceived = getCurrentValue(event, 'amountReceived') || 0;
        const netIncome = event.netIncome || 0;
        const profit = invoiceReceived + netIncome;
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
              type="text"
              inputMode="decimal"
              value={received === 0 ? '' : received}
              onChange={(e) => {
                e.stopPropagation();
                const newReceived = parseFloat(e.target.value) || 0;
                handleFieldChange(event._id, 'amountReceived', newReceived);
                // If received > invoice, add extra to tips
                const extraTip = Math.max(0, newReceived - calcInvoice);
                const baseTips = event.totalTips || 0;
                // Only update tips if there's extra from received amount
                if (extraTip > 0) {
                  handleFieldChange(event._id, 'totalTips', baseTips + extraTip);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Clear 0 on click
                if (parseFloat(e.target.value) === 0 || e.target.value === '') {
                  e.target.value = '';
                }
              }}
              onFocus={(e) => {
                // Clear 0 on focus
                if (parseFloat(e.target.value) === 0 || e.target.value === '0') {
                  e.target.value = '';
                }
              }}
              style={{
                width: '80px',
                padding: '4px 6px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'center',
                fontWeight: 'bold',
                color: parseFloat(received) >= calcInvoice ? '#22c55e' : '#f59e0b',
                background: 'transparent',
                outline: 'none',
                MozAppearance: 'textfield',
                WebkitAppearance: 'none',
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
                      Inventory
                    </button>
                  )}
                </div>
              </div>
            
            {/* Graph Content */}
            <div style={{ height: 'calc(100% - 50px)', padding: '16px', overflow: 'auto' }}>
              {graphEventId ? (() => {
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
                
                // Parse event start and end times to generate all 15-minute intervals
                const parseTimeStr = (timeStr) => {
                  if (!timeStr) return null;
                  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
                  if (!match) return null;
                  let hours = parseInt(match[1]);
                  const minutes = parseInt(match[2]);
                  const ampm = match[3]?.toUpperCase();
                  if (ampm === 'PM' && hours !== 12) hours += 12;
                  if (ampm === 'AM' && hours === 12) hours = 0;
                  return hours * 60 + minutes;
                };
                
                const eventStartMinutes = parseTimeStr(graphEvent.startTime);
                const eventEndMinutes = parseTimeStr(graphEvent.endTime);
                
                // Generate all 15-minute intervals for the event duration
                const timeIntervals = {};
                const categories = new Set();
                const itemNames = new Set();
                
                if (eventStartMinutes !== null && eventEndMinutes !== null) {
                  // Round start down to nearest 15 min, end up to nearest 15 min
                  const startInterval = Math.floor(eventStartMinutes / 15) * 15;
                  const endInterval = Math.ceil(eventEndMinutes / 15) * 15;
                  
                  for (let mins = startInterval; mins <= endInterval; mins += 15) {
                    const hours = Math.floor(mins / 60);
                    const minutes = mins % 60;
                    const intervalKey = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                    timeIntervals[intervalKey] = { hours, minutes, categories: {}, items: {} };
                  }
                }
                
                // Parse itemData and populate intervals
                if (graphEvent.itemData && graphEvent.itemData.length > 0) {
                  const lines = graphEvent.itemData.split('\n').filter(Boolean);
                  
                  lines.forEach(line => {
                    const parts = line.split(', ').map(p => p.trim());
                    if (parts.length >= 3) {
                      const itemName = parts[0];
                      const category = (parts[1] || 'other').toLowerCase();
                      const timeStr = parts[2];
                      const cost = parts.length >= 5 ? parseFloat(parts[4]) || 0 : 0;
                      
                      // Skip if not in selected category (when not 'all')
                      if (graphViewMode !== 'all' && category !== graphViewMode && !category.includes(graphViewMode)) {
                        return;
                      }
                      
                      const timeParts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
                      if (timeParts) {
                        let hours = parseInt(timeParts[1]);
                        const minutes = parseInt(timeParts[2]);
                        const ampm = timeParts[3].toUpperCase();
                        
                        if (ampm === 'PM' && hours !== 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                        
                        const roundedMinutes = Math.floor(minutes / 15) * 15;
                        const intervalKey = `${hours.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`;
                        
                        // Create interval if it doesn't exist (for sales outside event time range)
                        if (!timeIntervals[intervalKey]) {
                          timeIntervals[intervalKey] = { hours, minutes: roundedMinutes, categories: {}, items: {} };
                        }
                        
                        // Always track categories
                        if (!timeIntervals[intervalKey].categories[category]) {
                          timeIntervals[intervalKey].categories[category] = { count: 0, revenue: 0 };
                        }
                        timeIntervals[intervalKey].categories[category].count += 1;
                        timeIntervals[intervalKey].categories[category].revenue += cost;
                        categories.add(category);
                        
                        // Track individual items for specific category view
                        if (!timeIntervals[intervalKey].items[itemName]) {
                          timeIntervals[intervalKey].items[itemName] = { count: 0, revenue: 0, category };
                        }
                        timeIntervals[intervalKey].items[itemName].count += 1;
                        timeIntervals[intervalKey].items[itemName].revenue += cost;
                        itemNames.add(itemName);
                      }
                    }
                  });
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
                
                // SVG dimensions - use full container width
                const width = Math.max(sortedIntervals.length * 50, 400);
                const height = 220;
                const padding = { top: 20, right: 20, bottom: 50, left: 40 };
                const graphWidth = width - padding.left - padding.right;
                const graphHeight = height - padding.top - padding.bottom;
                
                return (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                      {seriesList.map(name => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '12px', height: '3px', background: isAllMode ? (categoryColors[name] || '#6b7280') : itemColors[name], borderRadius: '2px' }} />
                          <span style={{ fontSize: '12px', color: '#666', textTransform: isAllMode ? 'capitalize' : 'none' }}>{name}</span>
                        </div>
                      ))}
                    </div>
                    
                    {/* SVG Line Graph - full width */}
                    <svg width="100%" height={height} viewBox={`0 0 ${Math.max(sortedIntervals.length * 50, 400)} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', flex: 1 }}>
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
                        const points = sortedIntervals.map(([key, interval], idx) => {
                          const x = padding.left + (idx / (sortedIntervals.length - 1 || 1)) * graphWidth;
                          const dataSource = isAllMode ? interval.categories : interval.items;
                          const count = dataSource[seriesName]?.count || 0;
                          const y = height - padding.bottom - (count / maxCount) * graphHeight;
                          return `${x},${y}`;
                        }).join(' ');
                        
                        const lineColor = isAllMode ? (categoryColors[seriesName] || '#6b7280') : itemColors[seriesName];
                        
                        return (
                          <g key={seriesName}>
                            <polyline
                              points={points}
                              fill="none"
                              stroke={lineColor}
                              strokeWidth="2"
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
                          y={height - padding.bottom + 15}
                          fontSize="10"
                          fill="#666"
                          textAnchor="middle"
                          transform={`rotate(-45, ${padding.left + (idx / (sortedIntervals.length - 1 || 1)) * graphWidth}, ${height - padding.bottom + 15})`}
                        >
                          {label}
                        </text>
                      ))}
                    </svg>
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
                          padding: '10px 8px',
                          borderBottom: '1px solid #eee',
                          borderRight: isLastInGroup && groupIdx < columnGroups.length - 1 ? '2px solid #999' : '1px solid #e5e5e5',
                          fontSize: '13px',
                          color: '#333',
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                        }}
                      >
                        {col.editable && col.lockGroup && !sectionLocks[col.lockGroup] && col.key !== 'paymentModel' ? (
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
                  setSectionLocks(prev => ({ ...prev, [unlockConfirm]: false }));
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
    </div>
  );
};

export default EventSales;
