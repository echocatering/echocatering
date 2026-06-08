import React, { useState, useMemo } from 'react';

const fmt = (n) => `$${Number(n).toFixed(2)}`;

const inputStyle = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '1rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  padding: '8px 12px',
  width: '100%',
  outline: 'none',
  background: '#fff',
  color: '#111',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#6b7280',
  textTransform: 'uppercase',
  marginBottom: '5px',
  display: 'block',
};

const sectionHeadStyle = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '0.65rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#9ca3af',
  marginBottom: '14px',
  paddingBottom: '6px',
  borderBottom: '1px solid #e5e7eb',
};

const MODEL_INFO = {
  label: 'Service Charge', desc: 'Minimum + ($/person × patrons). Overhead, permit, and insurance are itemized within the total.',
};

const QuoteCalculator = () => {
  // Shared pricing vars from localStorage (same source as EventSales)
  const [pricingVars, setPricingVars] = useState(() => {
    const saved = localStorage.getItem('eventSalesPricingVars');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      minimum: 500,
      overhead: 150,
      perPerson: 25,
    };
  });

  const [patrons, setPatrons] = useState('');
  const [permit, setPermit] = useState('');
  const [insurance, setInsurance] = useState('');
  // Pricing vars edit mode
  const [editingVars, setEditingVars] = useState(false);
  const [draftVars, setDraftVars] = useState(pricingVars);

  const calc = useMemo(() => {
    const c = parseFloat(patrons) || 0;
    const d = parseFloat(permit) || 0;
    const f = parseFloat(insurance) || 0;
    const { minimum: M, overhead: e, perPerson: m } = pricingVars;
    const servicePP = m * c;
    const total = M + servicePP;
    return {
      lines: [
        { label: `Minimum`, value: M },
        { label: `${fmt(m)}/person × ${c} patron${c!==1?'s':''}`, value: servicePP },
        e > 0 ? { label: 'Overhead', value: e } : null,
        d > 0 ? { label: 'Permit', value: d } : null,
        f > 0 ? { label: 'Insurance', value: f } : null,
      ].filter(Boolean),
      total,
      ready: c > 0,
    };
  }, [patrons, permit, insurance, pricingVars]);

  const savePricingVars = () => {
    const cleaned = {
      minimum: parseFloat(draftVars.minimum) || 500,
      overhead: parseFloat(draftVars.overhead) || 150,
      perPerson: parseFloat(draftVars.perPerson) || 25,
    };
    setPricingVars(cleaned);
    localStorage.setItem('eventSalesPricingVars', JSON.stringify(cleaned));
    setEditingVars(false);
  };

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', minHeight: '100vh', background: '#f9fafb', padding: '40px 48px' }}>
      <h1 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#111', marginBottom: '4px' }}>
        Quote Calculator
      </h1>
      <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '36px', letterSpacing: '0.02em' }}>
        Estimate an event invoice before creating an event record
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', maxWidth: '860px' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Service Charge */}
          <div>
            <div style={sectionHeadStyle}>Service Charge</div>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '0', lineHeight: 1.5 }}>
              <strong>{MODEL_INFO.label}</strong> — {MODEL_INFO.desc}
            </p>
          </div>

          {/* Event Details */}
          <div>
            <div style={sectionHeadStyle}>Event Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Patrons</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 80"
                  value={patrons}
                  onChange={(e) => setPatrons(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Permit Cost</label>
                <input
                  type="number"
                  min="0"
                  placeholder="$0"
                  value={permit}
                  onChange={(e) => setPermit(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Insurance</label>
                <input
                  type="number"
                  min="0"
                  placeholder="$0"
                  value={insurance}
                  onChange={(e) => setInsurance(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Pricing Variables */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '6px', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ ...sectionHeadStyle, margin: 0, padding: 0, border: 'none' }}>Pricing Variables</span>
              <button
                onClick={() => { setDraftVars(pricingVars); setEditingVars(!editingVars); }}
                style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0 }}
              >
                {editingVars ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingVars ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  {[
                    { key: 'minimum', label: 'Minimum ($)' },
                    { key: 'overhead', label: 'Overhead ($)' },
                    { key: 'perPerson', label: '$/person' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label style={labelStyle}>{label}</label>
                      <input
                        type="number"
                        min="0"
                        value={draftVars[key]}
                        onChange={(e) => setDraftVars(prev => ({ ...prev, [key]: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={savePricingVars}
                  style={{ fontFamily: 'Montserrat, sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: '#111', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: 'pointer' }}
                >
                  Save Variables
                </button>
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '8px' }}>
                  These are shared with the Events table
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                {[
                  { label: 'Minimum', value: fmt(pricingVars.minimum) },
                  { label: 'Overhead', value: fmt(pricingVars.overhead) },
                  { label: '$/person', value: fmt(pricingVars.perPerson) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#374151', padding: '3px 0', borderBottom: '1px dotted #e5e7eb' }}>
                    <span style={{ color: '#9ca3af' }}>{label}</span>
                    <span style={{ fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN — Result ── */}
        <div>
          <div style={sectionHeadStyle}>Estimate</div>
          {!calc.ready ? (
            <div style={{ color: '#9ca3af', fontSize: '0.8rem', paddingTop: '12px' }}>
              Enter patron count to calculate.
            </div>
          ) : (
            <div>
              {/* Line items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '16px' }}>
                {calc.lines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '7px 0',
                      borderBottom: '1px dotted #e5e7eb',
                      fontSize: line.bold ? '0.82rem' : '0.78rem',
                      fontWeight: line.bold ? 700 : 400,
                      color: line.warn ? '#b45309' : '#374151',
                    }}
                  >
                    <span style={{ flex: 1, paddingRight: '12px' }}>
                      {line.label}
                      {line.note && (
                        <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginLeft: '6px' }}>
                          ({line.note})
                        </span>
                      )}
                    </span>
                    <span style={{ whiteSpace: 'nowrap' }}>{fmt(line.value)}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: '10px',
                background: '#111',
                color: '#fff',
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Estimated Invoice
                </span>
                <span style={{ fontWeight: 700, fontSize: '1.5rem' }}>
                  {fmt(calc.total)}
                </span>
              </div>

              {/* Context note */}
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '12px', lineHeight: 1.6 }}>
                Overhead ({fmt(pricingVars.overhead)}), permit, and insurance are itemized on the receipt within this total.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default QuoteCalculator;
