import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import EventDetail from './EventDetail';

const fmt$ = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const statusColor = (s) => ({
  draft:     { bg: '#f5f5f5', color: '#666' },
  active:    { bg: '#e3f2fd', color: '#1565c0' },
  completed: { bg: '#e8f5e9', color: '#2e7d32' },
  cancelled: { bg: '#ffebee', color: '#c62828' }
}[s] || { bg: '#f5f5f5', color: '#666' });

const Badge = ({ status }) => {
  const { bg, color } = statusColor(status);
  return (
    <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', background: bg, color }}>
      {status}
    </span>
  );
};

const EMPTY_EVENT = {
  name: '', date: '', startTime: '', endTime: '', venue: '', clientName: '', notes: '',
  guestCount: 0, durationHours: 0, paymentModel: 'consumption',
  flatFeeConfig: { baseRate: 0, baseHours: 2, drinksPerGuestPerHour: 2.5, additionalDrinksPerHour: 1, pricePerExtraDrink: 0 },
  totalSales: 0, totalTips: 0, totalCost: 0, travelCost: 0, totalRevenue: 0, totalProfit: 0, totalLoss: 0,
  drinkSales: [],
  bottlesPrepped: [],
  glassware: [
    { type: 'ROX',  sent: 0, returnedClean: 0, returnedDirty: 0, broken: 0 },
    { type: 'TMBL', sent: 0, returnedClean: 0, returnedDirty: 0, broken: 0 }
  ],
  iceBlocksBrought: 0, iceBlocksReturned: 0, posEventId: null, status: 'draft'
};

const EventsManager = () => {
  const { apiCall } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [creating, setCreating] = useState(false);
  const [posEvents, setPosEvents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiCall(`/catering-events?${params}`);
      setEvents(res.events || []);
    } catch (err) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [apiCall, statusFilter]);

  const fetchPosEvents = useCallback(async () => {
    try {
      const res = await apiCall('/pos-events?limit=100&status=ended');
      setPosEvents(res.events || []);
    } catch {
      setPosEvents([]);
    }
  }, [apiCall]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { fetchPosEvents(); }, [fetchPosEvents]);

  const handleCreate = async () => {
    try {
      const res = await apiCall('/catering-events', { method: 'POST', body: JSON.stringify(EMPTY_EVENT) });
      setEvents(prev => [res.event, ...prev]);
      setSelectedEvent(res.event);
      setCreating(false);
    } catch (err) {
      alert('Failed to create event: ' + err.message);
    }
  };

  const handleSave = async (form) => {
    try {
      const res = await apiCall(`/catering-events/${form._id}`, { method: 'PUT', body: JSON.stringify(form) });
      setEvents(prev => prev.map(e => e._id === res.event._id ? res.event : e));
      setSelectedEvent(res.event);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    try {
      await apiCall(`/catering-events/${id}`, { method: 'DELETE' });
      setEvents(prev => prev.filter(e => e._id !== id));
      setSelectedEvent(null);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const filtered = events.filter(e =>
    !searchQuery || e.name?.toLowerCase().includes(searchQuery.toLowerCase()) || e.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: '#f4f4f6', overflow: 'hidden' }}>

      {/* ── LEFT: Event List ── */}
      <div style={{ width: selectedEvent ? '320px' : '100%', minWidth: '280px', borderRight: '1px solid #e0e0e0', background: 'white', display: 'flex', flexDirection: 'column', transition: 'width 0.2s' }}>

        {/* List Header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Events</h2>
            <button
              onClick={handleCreate}
              style={{ padding: '8px 16px', background: '#800080', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
            >
              + New
            </button>
          </div>
          <input
            placeholder="Search events…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            {['', 'draft', 'active', 'completed', 'cancelled'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '600',
                  background: statusFilter === s ? '#800080' : '#f0f0f0',
                  color: statusFilter === s ? 'white' : '#666'
                }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* List Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>Loading…</div>
          ) : error ? (
            <div style={{ padding: '20px', color: '#c62828', fontSize: '13px' }}>⚠️ {error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
              {events.length === 0 ? 'No events yet. Create your first one.' : 'No events match your search.'}
            </div>
          ) : (
            filtered.map(event => {
              const profit = event.totalRevenue - event.totalCost - event.travelCost;
              const isSelected = selectedEvent?._id === event._id;
              return (
                <div
                  key={event._id}
                  onClick={() => setSelectedEvent(isSelected ? null : event)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    background: isSelected ? '#fdf4ff' : 'white',
                    borderLeft: isSelected ? '3px solid #800080' : '3px solid transparent',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#222', flex: 1, marginRight: '8px' }}>{event.name || 'Untitled'}</div>
                    <Badge status={event.status} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>
                    {fmtDate(event.date)}{event.clientName ? ` · ${event.clientName}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                    <span style={{ color: '#2196F3' }}>{fmt$(event.totalRevenue)}</span>
                    <span style={{ color: profit >= 0 ? '#4CAF50' : '#f44336' }}>
                      {profit >= 0 ? '+' : ''}{fmt$(profit)}
                    </span>
                    {event.guestCount > 0 && <span style={{ color: '#888' }}>{event.guestCount} guests</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* List Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #eee', fontSize: '12px', color: '#aaa' }}>
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── RIGHT: Event Detail ── */}
      {selectedEvent && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#f4f4f6' }}>
          <EventDetail
            event={selectedEvent}
            posEvents={posEvents}
            onSave={handleSave}
            onDelete={() => handleDelete(selectedEvent._id)}
            onClose={() => setSelectedEvent(null)}
          />
        </div>
      )}
    </div>
  );
};

export default EventsManager;
