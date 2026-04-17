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
  S: { label: 'S — Standard', desc: 'Echo buys all alcohol. Billed per guest by the hour.' },
  C: { label: 'C — Customer Pays', desc: 'Client supplies or pays for alcohol. Flat per-person service fee.' },
  H: { label: 'H — Hybrid / Cash Bar', desc: 'Mix of bar sales (cash/credit) and invoiced tab. Service charge fills any gap to minimum.' },
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
      first2Hr: 15,
      addHr: 10,
      perPerson: 25,
    };
  });

  const [model, setModel] = useState('S');
  const [patrons, setPatrons] = useState('');
  const [hours, setHours] = useState('');
  const [permit, setPermit] = useState('');
  const [insurance, setInsurance] = useState('');
  // H-model bar sales
  const [cashBar, setCashBar] = useState('');
  const [creditBar, setCreditBar] = useState('');
  const [invoiceTab, setInvoiceTab] = useState('');
  // Pricing vars edit mode
  const [editingVars, setEditingVars] = useState(false);
  const [draftVars, setDraftVars] = useState(pricingVars);

  const calc = useMemo(() => {
    const c = parseFloat(patrons) || 0;
    const i = parseFloat(hours) || 0;
    const d = parseFloat(permit) || 0;
    const f = parseFloat(insurance) || 0;
    const { minimum: M, overhead: e, first2Hr: l, addHr: k, perPerson: m } = pricingVars;

    if (model === 'S') {
      const first = Math.min(i, 2) * l * c;
      const extra = Math.max(i - 2, 0) * k * c;
      const svc = first + extra;
      const total = Math.max(svc, M);
      const minimumApplied = svc < M;
      return {
        lines: [
          { label: `First ${Math.min(i, 2).toFixed(1)} hr${Math.min(i,2)!==1?'s':''} × ${fmt(l)}/guest × ${c} guest${c!==1?'s':''}`, value: first },
          i > 2 ? { label: `Add'l ${(i - 2).toFixed(1)} hr${(i-2)!==1?'s':''} × ${fmt(k)}/guest × ${c} guest${c!==1?'s':''}`, value: extra } : null,
          { label: 'Service subtotal', value: svc, bold: true },
          minimumApplied ? { label: `Minimum applied`, value: M, note: `service ${fmt(svc)} < minimum ${fmt(M)}`, warn: true } : null,
        ].filter(Boolean),
        total,
        minimumApplied,
        ready: c > 0 && i > 0,
      };
    }

    if (model === 'C') {
      const base = m * c;
      const total = Math.max(base, M);
      const minimumApplied = base < M;
      return {
        lines: [
          { label: `${fmt(m)}/person × ${c} patron${c!==1?'s':''}`, value: base },
          minimumApplied ? { label: 'Minimum applied', value: M, note: `base ${fmt(base)} < minimum ${fmt(M)}`, warn: true } : null,
        ].filter(Boolean),
        total,
        minimumApplied,
        ready: c > 0,
      };
    }

    if (model === 'H') {
      const cash = parseFloat(cashBar) || 0;
      const credit = parseFloat(creditBar) || 0;
      const inv = parseFloat(invoiceTab) || 0;
      const tabTotal = inv * 1.08;
      const { minimum: M, overhead: e } = pricingVars;
      const serviceCharge = Math.max(0, M - cash - credit - tabTotal - e - d - f);
      const total = tabTotal + serviceCharge;
      const minimumMet = serviceCharge === 0;
      return {
        lines: [
          { label: `Invoice tab ${fmt(inv)} + 8% tax`, value: tabTotal },
          { label: 'Cash bar sales', value: cash },
          { label: 'Credit bar sales', value: credit },
          { label: `Overhead`, value: e },
          d > 0 ? { label: 'Permit', value: d } : null,
          f > 0 ? { label: 'Insurance', value: f } : null,
          {
            label: 'Service charge (gap to minimum)',
            value: serviceCharge,
            note: minimumMet ? 'minimum already met by bar sales' : `fills gap to ${fmt(M)} minimum`,
            warn: !minimumMet && serviceCharge > 0,
          },
        ].filter(Boolean),
        total,
        minimumMet,
        ready: true,
      };
    }

    return { lines: [], total: 0, ready: false };
  }, [model, patrons, hours, permit, insurance, cashBar, creditBar, invoiceTab, pricingVars]);

  const savePricingVars = () => {
    const cleaned = {
      minimum: parseFloat(draftVars.minimum) || 500,
      overhead: parseFloat(draftVars.overhead) || 150,
      first2Hr: parseFloat(draftVars.first2Hr) || 15,
      addHr: parseFloat(draftVars.addHr) || 10,
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

          {/* Payment Model */}
          <div>
            <div style={sectionHeadStyle}>Payment Model</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['S', 'C', 'H'].map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: '8px',
                    border: model === m ? '2px solid #111' : '1px solid #d1d5db',
                    background: model === m ? '#111' : '#fff',
                    color: model === m ? '#fff' : '#374151',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    letterSpacing: '0.05em',
                    transition: 'all 0.15s',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '8px', lineHeight: 1.5 }}>
              <strong>{MODEL_INFO[model].label}</strong> — {MODEL_INFO[model].desc}
            </p>
          </div>

          {/* Event Details */}
          <div>
            <div style={sectionHeadStyle}>Event Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
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
                <label style={labelStyle}>Duration (hrs)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 4"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
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

          {/* H-model bar sales */}
          {model === 'H' && (
            <div>
              <div style={sectionHeadStyle}>Bar Sales (Model H)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Cash Bar</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="$0"
                    value={cashBar}
                    onChange={(e) => setCashBar(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Credit Bar</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="$0"
                    value={creditBar}
                    onChange={(e) => setCreditBar(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Invoice Tab</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="$0"
                    value={invoiceTab}
                    onChange={(e) => setInvoiceTab(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}

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
                    { key: 'first2Hr', label: '$/guest first 2 hrs' },
                    { key: 'addHr', label: '$/guest add\'l hrs' },
                    { key: 'perPerson', label: '$/person (Model C)' },
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
                  { label: '$/guest (first 2 hrs)', value: fmt(pricingVars.first2Hr) },
                  { label: '$/guest (add\'l hrs)', value: fmt(pricingVars.addHr) },
                  { label: '$/person (Model C)', value: fmt(pricingVars.perPerson) },
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
              {model === 'S' && 'Enter patrons and hours to calculate.'}
              {model === 'C' && 'Enter patron count to calculate.'}
              {model === 'H' && 'Enter bar sales figures to calculate.'}
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
                {model === 'S' && `Overhead (${fmt(pricingVars.overhead)}), permit, and insurance are itemized on the receipt within this total.`}
                {model === 'C' && `Overhead (${fmt(pricingVars.overhead)}), permit, and insurance are itemized on the receipt within this total.`}
                {model === 'H' && `Invoice = tab total + service charge. Service charge is $0 if bar sales already cover the minimum.`}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default QuoteCalculator;
