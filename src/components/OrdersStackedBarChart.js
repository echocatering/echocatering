/**
 * OrdersChart.js
 * 
 * A Nivo line chart component with multiple views:
 * - Chart 1: Total Items + Total Cost
 * - Chart 2: Total per Category + Cost per Category
 * - Chart 3: Individual Items + Cost per Item
 * 
 * Usage:
 *   import OrdersStackedBarChart from './components/OrdersStackedBarChart';
 *   <OrdersStackedBarChart />
 * 
 * Requirements:
 *   npm install @nivo/line @nivo/core
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_ENDPOINT = '/api/square/orders-aggregated';

// Chart view options
const CHART_VIEWS = {
  TOTALS: 'totals',
  CATEGORIES: 'categories',
  ITEMS: 'items',
};

// Color schemes for different series
const COLORS = { scheme: 'category10' };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatTime = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

// ============================================================================
// BUTTON STYLES
// ============================================================================

const buttonStyle = (isActive) => ({
  padding: '10px 20px',
  margin: '0 8px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: isActive ? 'bold' : 'normal',
  backgroundColor: isActive ? '#2563eb' : '#e5e7eb',
  color: isActive ? 'white' : '#374151',
  transition: 'all 0.2s ease',
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const OrdersStackedBarChart = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartView, setChartView] = useState(CHART_VIEWS.TOTALS);

  // Fetch data from the backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(API_ENDPOINT);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const json = await response.json();
        setData(json);
      } catch (err) {
        console.error('Failed to fetch orders data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ============================================================================
  // CHART 1: Total Items (quantity only, tooltip shows cost)
  // ============================================================================
  const totalsChartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const quantityPoints = data.map(interval => ({
      x: formatTime(interval.intervalStart),
      y: interval.totalQuantity || 0,
      cost: interval.totalCost || 0,
      intervalStart: interval.intervalStart,
    }));

    return [
      { id: 'Total Items', data: quantityPoints },
    ];
  }, [data]);

  // ============================================================================
  // CHART 2: Total per Category (quantity only, tooltip shows cost)
  // ============================================================================
  const categoriesChartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Collect all unique categories
    const allCategories = new Set();
    data.forEach(interval => {
      Object.keys(interval.categories || {}).forEach(cat => allCategories.add(cat));
    });

    const series = [];
    
    // Create quantity series for each category (Y = quantity, tooltip shows cost)
    allCategories.forEach(category => {
      const points = data.map(interval => ({
        x: formatTime(interval.intervalStart),
        y: interval.categories?.[category]?.quantity || 0,
        cost: interval.categories?.[category]?.cost || 0,
        category,
        intervalStart: interval.intervalStart,
      }));
      series.push({ id: category, data: points });
    });

    return series;
  }, [data]);

  // ============================================================================
  // CHART 3: Individual Items (quantity only, tooltip shows cost)
  // ============================================================================
  const itemsChartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Collect all unique items and their total quantities
    const itemTotals = new Map();
    data.forEach(interval => {
      Object.entries(interval.items || {}).forEach(([name, itemData]) => {
        const qty = typeof itemData === 'object' ? itemData.quantity : itemData;
        itemTotals.set(name, (itemTotals.get(name) || 0) + qty);
      });
    });

    // Sort by total quantity and take top 10
    const topItems = Array.from(itemTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    const series = [];

    // Create quantity series for top items (Y = quantity, tooltip shows cost)
    topItems.forEach(itemName => {
      const points = data.map(interval => {
        const itemData = interval.items?.[itemName];
        const qty = typeof itemData === 'object' ? itemData.quantity : (itemData || 0);
        const cost = typeof itemData === 'object' ? itemData.cost : 0;
        // Calculate price per item (cost / quantity)
        const pricePerItem = qty > 0 ? cost / qty : 0;
        return {
          x: formatTime(interval.intervalStart),
          y: qty,
          cost,
          pricePerItem,
          itemName,
          intervalStart: interval.intervalStart,
        };
      });
      series.push({ id: itemName, data: points });
    });

    return series;
  }, [data]);

  // Select chart data based on current view
  const chartData = useMemo(() => {
    switch (chartView) {
      case CHART_VIEWS.CATEGORIES:
        return categoriesChartData;
      case CHART_VIEWS.ITEMS:
        return itemsChartData;
      case CHART_VIEWS.TOTALS:
      default:
        return totalsChartData;
    }
  }, [chartView, totalsChartData, categoriesChartData, itemsChartData]);

  // Chart titles
  const chartTitle = useMemo(() => {
    switch (chartView) {
      case CHART_VIEWS.CATEGORIES:
        return 'Sales by Category';
      case CHART_VIEWS.ITEMS:
        return 'Sales by Item (Top 10)';
      case CHART_VIEWS.TOTALS:
      default:
        return 'Total Sales Overview';
    }
  }, [chartView]);

  // Loading state
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: '#666' }}>
        Loading orders data...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: '#dc3545' }}>
        Error loading data: {error}
      </div>
    );
  }

  // Empty state
  if (!chartData || chartData.length === 0 || chartData[0]?.data?.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: '#666' }}>
        No order data available
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '20px' }}>
      {/* Chart View Toggle Buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <button
          style={buttonStyle(chartView === CHART_VIEWS.TOTALS)}
          onClick={() => setChartView(CHART_VIEWS.TOTALS)}
        >
          📊 Totals
        </button>
        <button
          style={buttonStyle(chartView === CHART_VIEWS.CATEGORIES)}
          onClick={() => setChartView(CHART_VIEWS.CATEGORIES)}
        >
          📁 By Category
        </button>
        <button
          style={buttonStyle(chartView === CHART_VIEWS.ITEMS)}
          onClick={() => setChartView(CHART_VIEWS.ITEMS)}
        >
          🍹 By Item
        </button>
      </div>

      {/* Chart Title */}
      <h2 style={{ textAlign: 'center', marginBottom: '16px' }}>
        {chartTitle}
      </h2>

      {/* Chart Container */}
      <div style={{ height: '500px' }}>
        <ResponsiveLine
          data={chartData}
          margin={{ top: 50, right: 160, bottom: 80, left: 60 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
          curve="monotoneX"
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: -45,
            legend: 'Time',
            legendOffset: 60,
            legendPosition: 'middle',
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: 'Quantity',
            legendOffset: -50,
            legendPosition: 'middle',
          }}
          enablePoints={true}
          pointSize={10}
          pointColor={{ from: 'color' }}
          pointBorderWidth={2}
          pointBorderColor={{ from: 'color', modifiers: [['darker', 0.5]] }}
          pointLabelYOffset={-12}
          enableArea={chartView === CHART_VIEWS.TOTALS}
          areaOpacity={0.1}
          lineWidth={3}
          colors={COLORS}
          enableCrosshair={true}
          crosshairType="bottom-left"
          useMesh={true}
          tooltip={({ point }) => {
            if (!point || !point.data) return null;
            const d = point.data;
            // Get title from series - point.serieId is the clean series name
            // Fallback to itemName or category from data, or extract from point.id
            let title = point.serieId || d.itemName || d.category;
            if (!title && point.id) {
              // point.id format is "serieId.pointIndex" - remove the .# suffix
              title = point.id.replace(/\.\d+$/, '');
            }
            // Final cleanup - remove any remaining .# suffix
            title = (title || 'Unknown').replace(/\.\d+$/, '');
            
            // Simplified tooltip for all views: Title, Quantity, Cost
            const tooltipStyle = {
              background: 'white',
              padding: '12px 16px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              minWidth: '140px',
            };
            
            // For Totals view
            if (chartView === CHART_VIEWS.TOTALS) {
              return (
                <div style={tooltipStyle}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: point.serieColor || point.color || '#333' }}>
                    {title}
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Quantity:</strong> {d.y}
                  </div>
                  <div>
                    <strong>Cost:</strong> {formatCurrency(d.cost || 0)}
                  </div>
                </div>
              );
            }
            
            // For Categories view
            if (chartView === CHART_VIEWS.CATEGORIES) {
              return (
                <div style={tooltipStyle}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: point.serieColor || point.color || '#333' }}>
                    {title}
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Quantity:</strong> {d.y}
                  </div>
                  <div>
                    <strong>Cost:</strong> {formatCurrency(d.cost || 0)}
                  </div>
                </div>
              );
            }
            
            // For Items view
            if (chartView === CHART_VIEWS.ITEMS) {
              return (
                <div style={tooltipStyle}>
                  <div style={{ fontWeight: 'bold', marginBottom: '8px', color: point.serieColor || point.color || '#333' }}>
                    {title}
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Quantity:</strong> {d.y}
                  </div>
                  <div>
                    <strong>Cost:</strong> {formatCurrency(d.cost || 0)}
                  </div>
                </div>
              );
            }
            
            return null;
          }}
          legends={[
            {
              anchor: 'bottom-right',
              direction: 'column',
              justify: false,
              translateX: 140,
              translateY: 0,
              itemsSpacing: 2,
              itemDirection: 'left-to-right',
              itemWidth: 120,
              itemHeight: 18,
              itemOpacity: 0.75,
              symbolSize: 10,
              symbolShape: 'circle',
              symbolBorderColor: 'rgba(0, 0, 0, .5)',
              effects: [{ on: 'hover', style: { itemBackground: 'rgba(0, 0, 0, .03)', itemOpacity: 1 } }],
            },
          ]}
          animate={true}
          motionConfig="gentle"
        />
      </div>
    </div>
  );
};

export default OrdersStackedBarChart;
