import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const SalesManager = () => {
  const { apiCall } = useAuth();
  
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30d'); // 7d, 30d, 90d, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(null);
  
  // Data
  const [summary, setSummary] = useState(null);
  const [dailySales, setDailySales] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [eventBreakdown, setEventBreakdown] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  
  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    let start;
    
    switch (dateRange) {
      case '7d':
        start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        start = customStartDate ? new Date(customStartDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return {
          startDate: start.toISOString(),
          endDate: customEndDate ? new Date(customEndDate).toISOString() : end.toISOString()
        };
      default:
        start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
  }, [dateRange, customStartDate, customEndDate]);
  
  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(selectedEventId && { eventId: selectedEventId })
      });
      
      const [summaryRes, dailyRes, topItemsRes, categoryRes, eventsRes, salesRes] = await Promise.all([
        apiCall(`/sales/summary?${params}`),
        apiCall(`/sales/daily?${params}`),
        apiCall(`/sales/top-items?${params}&limit=10`),
        apiCall(`/sales/by-category?${params}`),
        apiCall(`/sales/events?startDate=${startDate}&endDate=${endDate}`),
        apiCall(`/sales?${params}&limit=20&sortBy=createdAt&sortOrder=desc`)
      ]);
      
      setSummary(summaryRes);
      setDailySales(dailyRes.daily || []);
      setTopItems(topItemsRes.items || []);
      setCategoryBreakdown(categoryRes.categories || []);
      setEventBreakdown(eventsRes.events || []);
      setRecentSales(salesRes.sales || []);
    } catch (err) {
      console.error('[Sales] Error fetching data:', err);
      setError(err.message || 'Failed to load sales data');
    } finally {
      setLoading(false);
    }
  }, [apiCall, startDate, endDate, selectedEventId]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };
  
  // Format date
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };
  
  // Calculate max for chart scaling
  const maxDailySales = useMemo(() => {
    return Math.max(...dailySales.map(d => d.sales), 1);
  }, [dailySales]);
  
  const maxCategoryRevenue = useMemo(() => {
    return Math.max(...categoryBreakdown.map(c => c.revenue), 1);
  }, [categoryBreakdown]);

  if (loading && !summary) {
    return (
      <div className="sales-manager" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ 
              width: '48px', 
              height: '48px', 
              border: '4px solid #e0e0e0',
              borderTop: '4px solid #800080',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: '#666' }}>Loading sales data...</p>
          </div>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="sales-manager" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold' }}>📊 Sales Dashboard</h1>
        
        {/* Date Range Selector */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {['7d', '30d', '90d'].map(range => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              style={{
                padding: '8px 16px',
                border: dateRange === range ? '2px solid #800080' : '1px solid #ddd',
                borderRadius: '8px',
                background: dateRange === range ? '#800080' : 'white',
                color: dateRange === range ? 'white' : '#333',
                cursor: 'pointer',
                fontWeight: dateRange === range ? 'bold' : 'normal'
              }}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
          <button
            onClick={() => setDateRange('custom')}
            style={{
              padding: '8px 16px',
              border: dateRange === 'custom' ? '2px solid #800080' : '1px solid #ddd',
              borderRadius: '8px',
              background: dateRange === 'custom' ? '#800080' : 'white',
              color: dateRange === 'custom' ? 'white' : '#333',
              cursor: 'pointer'
            }}
          >
            Custom
          </button>
          
          {dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '8px' }}
              />
              <span>to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '8px' }}
              />
            </>
          )}
          
          <button
            onClick={fetchData}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              background: '#4CAF50',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>
      
      {error && (
        <div style={{ 
          padding: '16px', 
          background: '#ffebee', 
          border: '1px solid #f44336', 
          borderRadius: '8px', 
          marginBottom: '24px',
          color: '#c62828'
        }}>
          ⚠️ {error}
        </div>
      )}
      
      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '16px', 
        marginBottom: '24px' 
      }}>
        <SummaryCard
          title="Total Sales"
          value={formatCurrency(summary?.totalSales)}
          icon="💰"
          color="#4CAF50"
        />
        <SummaryCard
          title="Total Tips"
          value={formatCurrency(summary?.totalTips)}
          icon="💵"
          color="#2196F3"
        />
        <SummaryCard
          title="Transactions"
          value={summary?.transactionCount || 0}
          icon="🧾"
          color="#FF9800"
        />
        <SummaryCard
          title="Items Sold"
          value={summary?.itemsSold || 0}
          icon="🍹"
          color="#9C27B0"
        />
        <SummaryCard
          title="Avg Transaction"
          value={formatCurrency(summary?.transactionCount ? summary.totalSales / summary.transactionCount : 0)}
          icon="📈"
          color="#00BCD4"
        />
      </div>
      
      {/* Event Filter */}
      {eventBreakdown.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontWeight: 'bold', marginRight: '12px' }}>Filter by Event:</label>
          <select
            value={selectedEventId || ''}
            onChange={(e) => setSelectedEventId(e.target.value || null)}
            style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '8px', minWidth: '200px' }}
          >
            <option value="">All Events</option>
            {eventBreakdown.map(event => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventName} ({formatCurrency(event.sales)})
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Daily Sales Chart */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>📅 Daily Sales</h3>
          <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingBottom: '24px', position: 'relative' }}>
            {dailySales.length === 0 ? (
              <p style={{ color: '#999', margin: 'auto' }}>No sales data for this period</p>
            ) : (
              dailySales.map((day, i) => (
                <div
                  key={day.date}
                  style={{
                    flex: 1,
                    minWidth: '8px',
                    maxWidth: '40px',
                    background: `linear-gradient(to top, #800080, #b366b3)`,
                    height: `${(day.sales / maxDailySales) * 100}%`,
                    minHeight: day.sales > 0 ? '4px' : '0',
                    borderRadius: '4px 4px 0 0',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                  title={`${formatDate(day.date)}: ${formatCurrency(day.sales)} (${day.transactions} transactions)`}
                />
              ))
            )}
          </div>
          {dailySales.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
              <span>{formatDate(dailySales[0]?.date)}</span>
              <span>{formatDate(dailySales[dailySales.length - 1]?.date)}</span>
            </div>
          )}
        </div>
        
        {/* Category Breakdown */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>🏷️ Sales by Category</h3>
          {categoryBreakdown.length === 0 ? (
            <p style={{ color: '#999' }}>No category data</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categoryBreakdown.map((cat, i) => (
                <div key={cat.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>{cat.category}</span>
                    <span style={{ color: '#666' }}>{formatCurrency(cat.revenue)} ({cat.quantity} items)</span>
                  </div>
                  <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(cat.revenue / maxCategoryRevenue) * 100}%`,
                        background: getCategoryColor(cat.category),
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        {/* Top Items */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>🏆 Top Selling Items</h3>
          {topItems.length === 0 ? (
            <p style={{ color: '#999' }}>No items sold</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#666' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#666' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: '#666' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', color: '#666' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, i) => (
                  <tr key={item.name} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px 0', fontWeight: 'bold', color: i < 3 ? '#800080' : '#666' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '12px 0' }}>
                      <div>{item.name}</div>
                      <div style={{ fontSize: '12px', color: '#999', textTransform: 'capitalize' }}>{item.category}</div>
                    </td>
                    <td style={{ padding: '12px 0', textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '500' }}>{formatCurrency(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Recent Transactions */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>🕐 Recent Transactions</h3>
          {recentSales.length === 0 ? (
            <p style={{ color: '#999' }}>No recent transactions</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              {recentSales.map(sale => (
                <div
                  key={sale._id}
                  style={{
                    padding: '12px',
                    background: '#f9f9f9',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '500' }}>
                      {formatCurrency(sale.totalCents / 100)}
                      {sale.tipCents > 0 && (
                        <span style={{ color: '#4CAF50', fontSize: '12px', marginLeft: '8px' }}>
                          +{formatCurrency(sale.tipCents / 100)} tip
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {sale.items?.length || 0} items • {sale.tabName || 'No tab'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: sale.status === 'succeeded' ? '#e8f5e9' : '#ffebee',
                      color: sale.status === 'succeeded' ? '#2e7d32' : '#c62828'
                    }}>
                      {sale.status}
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                      {new Date(sale.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Events Summary */}
      {eventBreakdown.length > 0 && !selectedEventId && (
        <div style={{ marginTop: '24px', background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>🎉 Events Summary</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', color: '#666' }}>Event</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: '#666' }}>Sales</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: '#666' }}>Tips</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: '#666' }}>Transactions</th>
                <th style={{ textAlign: 'right', padding: '12px 8px', color: '#666' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {eventBreakdown.map(event => (
                <tr key={event.eventId} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '12px 8px', fontWeight: '500' }}>{event.eventName}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{formatCurrency(event.sales)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#4CAF50' }}>{formatCurrency(event.tips)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>{event.transactions}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#666' }}>
                    {new Date(event.firstSale).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Summary Card Component
const SummaryCard = ({ title, value, icon, color }) => (
  <div style={{
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    borderLeft: `4px solid ${color}`
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ fontSize: '32px' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>{value}</div>
      </div>
    </div>
  </div>
);

// Category color helper
const getCategoryColor = (category) => {
  const colors = {
    cocktails: '#800080',
    spirits: '#C0392B',
    beer: '#F39C12',
    wine: '#8E44AD',
    nonalcoholic: '#27AE60',
    'non-alcoholic': '#27AE60'
  };
  return colors[category?.toLowerCase()] || '#607D8B';
};

export default SalesManager;
