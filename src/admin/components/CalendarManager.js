import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MODEL_COLORS = { S: '#6366f1', C: '#10b981', H: '#f59e0b' };

const lbl = {
  fontFamily: 'Montserrat, sans-serif', fontSize: '0.65rem', fontWeight: 600,
  letterSpacing: '0.08em', color: '#9ca3af', textTransform: 'uppercase',
  marginBottom: '5px', display: 'block',
};
const inp = {
  fontFamily: 'Montserrat, sans-serif', fontSize: '0.85rem',
  border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 10px',
  width: '100%', outline: 'none', background: '#fff', color: '#111', boxSizing: 'border-box',
};

const loadPricingVars = () => {
  try {
    const s = localStorage.getItem('eventSalesPricingVars');
    if (s) return JSON.parse(s);
  } catch (e) {}
  return { minimum: 500, overhead: 150, first2Hr: 15, addHr: 10, perPerson: 25 };
};

const calcEstimate = (model, patrons, hours, pricingVars) => {
  const c = parseFloat(patrons) || 0;
  const i = parseFloat(hours) || 0;
  const { minimum: M, first2Hr: l, addHr: k, perPerson: m } = pricingVars;
  if (model === 'S') return Math.max((Math.min(i, 2) * l * c) + (Math.max(i - 2, 0) * k * c), M);
  if (model === 'C') return Math.max(m * c, M);
  return null;
};

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

const normalizeModel = (raw) => {
  if (raw === 'consumption') return 'S';
  if (raw === 'flat_fee') return 'C';
  if (raw === 'hybrid') return 'H';
  return raw || 'S';
};

const CalendarManager = () => {
  const { apiCall } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [upcomingIndex, setUpcomingIndex] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pricingVars] = useState(loadPricingVars);

  const emptyForm = {
    name: '', date: '', guestCount: '', startTime: '', endTime: '',
    paymentModel: 'S', permitCost: '', insuranceCost: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall('/catering-events?limit=200');
      const sorted = (data.events || []).sort((a, b) => new Date(a.date) - new Date(b.date));
      setEvents(sorted);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const upcoming = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return events.filter(e => new Date(e.date) >= today);
  }, [events]);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(e => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [events]);

  const durationHours = useMemo(() => {
    if (!form.startTime || !form.endTime) return '';
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? (diff / 60).toFixed(1) : '';
  }, [form.startTime, form.endTime]);

  const estimate = useMemo(() => {
    if (form.paymentModel === 'H' || !form.guestCount) return null;
    return calcEstimate(form.paymentModel, form.guestCount, durationHours, pricingVars);
  }, [form.paymentModel, form.guestCount, durationHours, pricingVars]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.date) return;
    setSaving(true);
    try {
      await apiCall('/catering-events', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          date: form.date,
          guestCount: parseInt(form.guestCount) || 0,
          startTime: form.startTime,
          endTime: form.endTime,
          durationHours: parseFloat(durationHours) || 0,
          paymentModel: form.paymentModel,
          permitCost: parseFloat(form.permitCost) || 0,
          insuranceCost: parseFloat(form.insuranceCost) || 0,
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      await fetchEvents();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

  const renderMonth = (monthIdx) => {
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const firstDay = new Date(year, monthIdx, 1).getDay();
    const today = new Date();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div key={monthIdx} style={{ background: '#fff', borderRadius: '10px', padding: '14px 12px', border: '1px solid #e5e7eb' }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#111', marginBottom: '10px', textAlign: 'center' }}>
          {MONTHS[monthIdx]}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
          {DAYS_SHORT.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '0.55rem', fontWeight: 600, color: '#d1d5db', fontFamily: 'Montserrat, sans-serif', paddingBottom: '4px' }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />;
            const key = `${year}-${monthIdx}-${day}`;
            const dayEvs = eventsByDate[key] || [];
            const isToday = today.getFullYear() === year && today.getMonth() === monthIdx && today.getDate() === day;
            return (
              <div key={i} style={{ textAlign: 'center', paddingBottom: '3px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '20px', height: '20px', borderRadius: '50%',
                  fontSize: '0.6rem', fontFamily: 'Montserrat, sans-serif',
                  fontWeight: isToday ? 700 : 400,
                  background: isToday ? '#111' : 'transparent',
                  color: isToday ? '#fff' : '#374151',
                }}>
                  {day}
                </span>
                {dayEvs.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: '1px' }}>
                    {dayEvs.slice(0, 3).map((ev, ei) => (
                      <span key={ei} style={{ width: '4px', height: '4px', borderRadius: '50%', background: MODEL_COLORS[normalizeModel(ev.paymentModel)] || '#6366f1', display: 'inline-block' }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const upcomingEvent = upcoming[upcomingIndex] || null;

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', minHeight: '100vh', background: '#f9fafb', padding: '40px 48px' }}>

      <h1 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#111', marginBottom: '28px' }}>
        Calendar
      </h1>

      {/* ── Upcoming Events Strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '14px 20px', marginBottom: '20px', gap: '12px' }}>
        <button
          onClick={() => setUpcomingIndex(i => Math.max(0, i - 1))}
          disabled={upcomingIndex === 0 || upcoming.length === 0}
          style={{ border: 'none', background: 'none', fontSize: '1rem', cursor: upcomingIndex === 0 ? 'default' : 'pointer', color: upcomingIndex === 0 ? '#e5e7eb' : '#374151', padding: '2px 8px', flexShrink: 0 }}
        >←</button>

        <div style={{ flex: 1, textAlign: 'center', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '14px' }}>
          {loading ? (
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Loading…</span>
          ) : upcoming.length === 0 ? (
            <span style={{ fontSize: '0.72rem', color: '#9ca3af', letterSpacing: '0.06em' }}>NO UPCOMING EVENTS</span>
          ) : upcomingEvent ? (
            <>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Next Event</span>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111' }}>{upcomingEvent.name}</span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {new Date(upcomingEvent.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {(upcomingEvent.startTime || upcomingEvent.endTime) && (
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {upcomingEvent.startTime}{upcomingEvent.endTime ? ` – ${upcomingEvent.endTime}` : ''}
                </span>
              )}
              {upcomingEvent.guestCount > 0 && (
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{upcomingEvent.guestCount} guests</span>
              )}
              {upcomingEvent.paymentModel && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 9px', borderRadius: '99px', background: MODEL_COLORS[normalizeModel(upcomingEvent.paymentModel)] || '#6366f1', color: '#fff' }}>
                  {normalizeModel(upcomingEvent.paymentModel)}
                </span>
              )}
              <span style={{ fontSize: '0.62rem', color: '#d1d5db' }}>{upcomingIndex + 1} / {upcoming.length}</span>
            </>
          ) : null}
        </div>

        <button
          onClick={() => setUpcomingIndex(i => Math.min(upcoming.length - 1, i + 1))}
          disabled={upcomingIndex >= upcoming.length - 1 || upcoming.length === 0}
          style={{ border: 'none', background: 'none', fontSize: '1rem', cursor: upcomingIndex >= upcoming.length - 1 ? 'default' : 'pointer', color: upcomingIndex >= upcoming.length - 1 ? '#e5e7eb' : '#374151', padding: '2px 8px', flexShrink: 0 }}
        >→</button>
      </div>

      {/* ── Add Event Toggle ── */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', background: showForm ? '#111' : '#fff', color: showForm ? '#fff' : '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 20px', cursor: 'pointer' }}
        >
          {showForm ? '✕ Cancel' : '+ Add Event'}
        </button>
      </div>

      {/* ── Create Event Form ── */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '24px 28px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: '18px', paddingBottom: '8px', borderBottom: '1px solid #f3f4f6' }}>
            New Event
          </div>

          {/* Row 1: name, date, patrons, start, end */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 0.8fr 0.8fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={lbl}>Event Name *</label>
              <input required value={form.name} onChange={setField('name')} placeholder="e.g. Smith Wedding" style={inp} />
            </div>
            <div>
              <label style={lbl}>Date *</label>
              <input required type="date" value={form.date} onChange={setField('date')} style={inp} />
            </div>
            <div>
              <label style={lbl}>Patrons</label>
              <input type="number" min="0" value={form.guestCount} onChange={setField('guestCount')} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Start Time</label>
              <input type="time" value={form.startTime} onChange={setField('startTime')} style={inp} />
            </div>
            <div>
              <label style={lbl}>End Time</label>
              <input type="time" value={form.endTime} onChange={setField('endTime')} style={inp} />
            </div>
          </div>

          {/* Row 2: model, permit, insurance, summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '14px', alignItems: 'end', marginBottom: '20px' }}>
            <div>
              <label style={lbl}>Model</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['S', 'C', 'H'].map(m => (
                  <button key={m} type="button" onClick={() => setForm(p => ({ ...p, paymentModel: m }))}
                    style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.85rem', width: '38px', height: '38px', borderRadius: '7px', border: form.paymentModel === m ? `2px solid ${MODEL_COLORS[m]}` : '1px solid #d1d5db', background: form.paymentModel === m ? MODEL_COLORS[m] : '#fff', color: form.paymentModel === m ? '#fff' : '#374151', cursor: 'pointer', transition: 'all 0.12s' }}
                  >{m}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Permit Cost</label>
              <input type="number" min="0" value={form.permitCost} onChange={setField('permitCost')} placeholder="$0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Insurance</label>
              <input type="number" min="0" value={form.insuranceCost} onChange={setField('insuranceCost')} placeholder="$0" style={inp} />
            </div>
            <div style={{ paddingBottom: '2px' }}>
              {durationHours && (
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '4px' }}>Duration: {durationHours} hrs</div>
              )}
              {estimate !== null ? (
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111' }}>Estimate: {fmt(estimate)}</div>
              ) : form.paymentModel === 'H' ? (
                <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>H model — use Quote Calculator for estimate</div>
              ) : null}
            </div>
          </div>

          <button type="submit" disabled={saving} style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 26px', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Event'}
          </button>
        </form>
      )}

      {/* ── Year Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
        <button onClick={() => setYear(y => y - 1)} style={{ border: 'none', background: 'none', fontSize: '1rem', cursor: 'pointer', color: '#374151', padding: '4px 8px' }}>←</button>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.08em', color: '#111' }}>{year}</span>
        <button onClick={() => setYear(y => y + 1)} style={{ border: 'none', background: 'none', fontSize: '1rem', cursor: 'pointer', color: '#374151', padding: '4px 8px' }}>→</button>
      </div>

      {/* ── Full Year Calendar: 3 × 4 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: '18px', marginTop: '16px' }}>
        {Object.entries(MODEL_COLORS).map(([m, c]) => (
          <div key={m} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.65rem', color: '#6b7280', fontFamily: 'Montserrat, sans-serif' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c, display: 'inline-block' }} />
            Model {m}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.65rem', color: '#6b7280', fontFamily: 'Montserrat, sans-serif' }}>
          <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#111', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: '#fff', fontWeight: 700 }}>•</span>
          Today
        </div>
      </div>
    </div>
  );
};

export default CalendarManager;
