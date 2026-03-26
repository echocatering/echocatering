import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  new:       { bg: '#e8f5e9', text: '#2e7d32', label: 'New' },
  contacted: { bg: '#fff8e1', text: '#f57f17', label: 'Contacted' },
  booked:    { bg: '#e3f2fd', text: '#1565c0', label: 'Booked' },
  declined:  { bg: '#fce4ec', text: '#c62828', label: 'Declined' },
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export default function EventRequestsManager() {
  const { apiCall } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall('/event-requests');
      setRequests(data.requests || []);
    } catch (err) {
      setError('Failed to load requests: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const updateStatus = async (id, status) => {
    setUpdatingId(id);
    try {
      await apiCall(`/event-requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setRequests(prev => prev.map(r => r._id === id ? { ...r, status } : r));
      if (selected?._id === id) setSelected(prev => ({ ...prev, status }));
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = filterStatus === 'all'
    ? requests
    : requests.filter(r => r.status === filterStatus);

  const newCount = requests.filter(r => r.status === 'new').length;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, fontFamily: 'system-ui, sans-serif' }}>

      {/* List Panel */}
      <div style={{
        width: selected ? '420px' : '100%',
        minWidth: '320px',
        borderRight: selected ? '1px solid #e0e0e0' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e0e0e0', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#222' }}>
              Event Requests
            </h2>
            {newCount > 0 && (
              <span style={{
                background: '#800080', color: '#fff',
                borderRadius: '12px', padding: '2px 10px',
                fontSize: '12px', fontWeight: 700,
              }}>
                {newCount} new
              </span>
            )}
            <button
              onClick={fetchRequests}
              style={{ marginLeft: 'auto', background: 'none', border: '1px solid #ddd', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '13px', color: '#555' }}
            >
              Refresh
            </button>
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'new', 'contacted', 'booked', 'declined'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  border: filterStatus === s ? '2px solid #800080' : '1px solid #ddd',
                  background: filterStatus === s ? '#f3e5f5' : '#fff',
                  color: filterStatus === s ? '#800080' : '#555',
                  fontWeight: filterStatus === s ? 700 : 400,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {s === 'all' ? `All (${requests.length})` : `${STATUS_COLORS[s]?.label} (${requests.filter(r => r.status === s).length})`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: '20px', color: '#c62828', fontSize: '14px' }}>{error}</div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
              No requests found.
            </div>
          )}
          {filtered.map(r => {
            const sc = STATUS_COLORS[r.status] || STATUS_COLORS.new;
            const isActive = selected?._id === r._id;
            return (
              <div
                key={r._id}
                onClick={() => setSelected(isActive ? null : r)}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                  background: isActive ? '#f9f0ff' : '#fff',
                  borderLeft: isActive ? '3px solid #800080' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: '#222' }}>
                      {r.firstName} {r.lastName}
                    </div>
                    <div style={{ fontSize: '12px', color: '#777', marginTop: '2px' }}>
                      {r.email} · {r.phone}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                    background: sc.bg, color: sc.text, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {sc.label}
                  </span>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px', color: '#555' }}>
                  <span>📅 {r.eventDate}</span>
                  <span>👥 {r.numPeople} guests</span>
                  {r.provide && <span>🍹 {r.provide}</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>
                  Received {formatDate(r.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <div style={{ flex: 1, overflowY: 'auto', background: '#fafafa', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#222' }}>
              {selected.firstName} {selected.lastName}
            </h3>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Status selector */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Status
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(STATUS_COLORS).map(([key, sc]) => (
                <button
                  key={key}
                  disabled={updatingId === selected._id}
                  onClick={() => updateStatus(selected._id, key)}
                  style={{
                    padding: '6px 14px', borderRadius: '16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    border: selected.status === key ? `2px solid ${sc.text}` : '1px solid #ddd',
                    background: selected.status === key ? sc.bg : '#fff',
                    color: selected.status === key ? sc.text : '#777',
                    opacity: updatingId === selected._id ? 0.6 : 1,
                  }}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact info */}
          <Section title="Contact Information">
            <Row label="Name" value={`${selected.firstName} ${selected.lastName}`} />
            <Row label="Email" value={<a href={`mailto:${selected.email}`} style={{ color: '#800080' }}>{selected.email}</a>} />
            <Row label="Phone" value={selected.phone + (selected.ext ? ` ext. ${selected.ext}` : '')} />
            {selected.company && <Row label="Company" value={selected.company} />}
            {selected.hearAbout && <Row label="Heard via" value={selected.hearAbout} />}
            <Row label="Submitted" value={formatDate(selected.createdAt)} />
          </Section>

          {/* Event details */}
          <Section title="Event Details">
            <Row label="Date" value={selected.eventDate} />
            <Row label="Time" value={`${formatTime(selected.startTime)} – ${formatTime(selected.endTime)}`} />
            <Row label="Guests" value={selected.numPeople} />
            {selected.provide && <Row label="Service" value={selected.provide} />}
            <Row label="Nature of Event" value={selected.eventNature} multiline />
            {selected.additionalInfo && <Row label="Additional Info" value={selected.additionalInfo} multiline />}
          </Section>

          {/* Quick reply link */}
          <a
            href={`mailto:${selected.email}?subject=Re:%20Your%20Echo%20Catering%20Inquiry&body=Hi%20${encodeURIComponent(selected.firstName)}%2C%0A%0AThank%20you%20for%20reaching%20out!%20We%20would%20love%20to%20discuss%20your%20event%20on%20${encodeURIComponent(selected.eventDate)}.%0A%0ABest%2C%0AEcho%20Catering`}
            style={{
              display: 'inline-block', marginTop: '8px',
              padding: '10px 20px', background: '#800080', color: '#fff',
              borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 600,
            }}
          >
            ✉️ Reply to {selected.firstName}
          </a>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #e8e8e8', paddingBottom: '6px' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, multiline }) {
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', alignItems: multiline ? 'flex-start' : 'center' }}>
      <div style={{ width: '130px', flexShrink: 0, fontSize: '13px', color: '#888' }}>{label}</div>
      <div style={{ fontSize: '14px', color: '#222', lineHeight: multiline ? '1.5' : 'normal', flex: 1 }}>{value}</div>
    </div>
  );
}
