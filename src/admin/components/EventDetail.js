import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

/* ─── Formatters ─────────────────────────────────────────────── */
const fmt$ = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const PAYMENT_MODELS = [
  { value: 'consumption', label: 'Consumption-Based' },
  { value: 'flatfee',     label: 'Flat Fee' },
  { value: 'hybrid',      label: 'Hybrid' },
];
const STATUS_OPTIONS = ['draft', 'active', 'completed', 'cancelled'];
const CATEGORIES = ['cocktail', 'mocktail', 'beer', 'wine', 'spirit', 'other'];

const statusStyle = (s) => ({
  draft:     { background: '#f5f5f5', color: '#666' },
  active:    { background: '#e3f2fd', color: '#1565c0' },
  completed: { background: '#e8f5e9', color: '#2e7d32' },
  cancelled: { background: '#ffebee', color: '#c62828' },
}[s] || { background: '#f5f5f5', color: '#666' });

/* ─── Shared UI ──────────────────────────────────────────────── */
const Card = ({ title, children, style = {} }) => (
  <div style={{ background:'white', borderRadius:'12px', padding:'20px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginBottom:'16px', ...style }}>
    {title && <h3 style={{ margin:'0 0 16px', fontSize:'13px', fontWeight:'700', color:'#555', textTransform:'uppercase', letterSpacing:'0.5px' }}>{title}</h3>}
    {children}
  </div>
);

const StatCard = ({ label, value, color='#333' }) => (
  <div style={{ background:'white', borderRadius:'10px', padding:'16px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', flex:1, minWidth:'110px' }}>
    <div style={{ fontSize:'10px', color:'#aaa', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>{label}</div>
    <div style={{ fontSize:'20px', fontWeight:'700', color }}>{value}</div>
  </div>
);

const Field = ({ label, children, col }) => (
  <div style={{ marginBottom:'14px', gridColumn: col }}>
    <label style={{ display:'block', fontSize:'10px', fontWeight:'700', color:'#aaa', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:'5px' }}>{label}</label>
    {children}
  </div>
);

const iStyle = { width:'100%', padding:'8px 10px', border:'1px solid #ddd', borderRadius:'8px', fontSize:'13px', boxSizing:'border-box', background:'white' };
const NumInput = ({ value, onChange, min=0, step=1, style={} }) => (
  <input type="number" min={min} step={step} value={value ?? 0}
    onChange={e => onChange(parseFloat(e.target.value) || 0)}
    style={{ ...iStyle, ...style }} />
);

/* ─── Tab Bar ────────────────────────────────────────────────── */
const TABS = ['Info', 'Financials', 'Inventory', 'Drinks'];
const TabBar = ({ active, onChange }) => (
  <div style={{ display:'flex', borderBottom:'2px solid #eee', background:'white', paddingLeft:'20px', flexShrink:0 }}>
    {TABS.map(t => (
      <button key={t} onClick={() => onChange(t)} style={{
        padding:'12px 18px', border:'none', background:'none', cursor:'pointer', fontSize:'13px',
        fontWeight: active===t ? '700' : '500',
        color: active===t ? '#800080' : '#888',
        borderBottom: active===t ? '2px solid #800080' : '2px solid transparent',
        marginBottom:'-2px',
      }}>{t}</button>
    ))}
  </div>
);

/* ─── Glassware ──────────────────────────────────────────────── */
const GlasswareSection = ({ glassware=[], onChange }) => {
  const upd = (i, f, v) => onChange(glassware.map((g, j) => j===i ? {...g,[f]:v} : g));
  return (
    <Card title="Glassware">
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
        <thead><tr>
          {['Type','Sent','Returned Clean','Returned Dirty','Broken','Used'].map(h =>
            <th key={h} style={{ padding:'6px 8px', color:'#aaa', fontWeight:'600', fontSize:'11px', textAlign: h==='Type'?'left':'center' }}>{h}</th>
          )}
        </tr></thead>
        <tbody>
          {glassware.map((g, i) => {
            const used = (g.sent||0) - (g.returnedClean||0) - (g.returnedDirty||0) - (g.broken||0);
            return (
              <tr key={g.type} style={{ borderTop:'1px solid #f0f0f0' }}>
                <td style={{ padding:'8px', fontWeight:'700', color:'#444' }}>{g.type}</td>
                {['sent','returnedClean','returnedDirty','broken'].map(f =>
                  <td key={f} style={{ padding:'4px 6px' }}>
                    <NumInput value={g[f]} onChange={v=>upd(i,f,v)} style={{ width:'72px', textAlign:'center' }} />
                  </td>
                )}
                <td style={{ padding:'8px', textAlign:'center', fontWeight:'700', color: used<0?'#f44336':'#333' }}>{used}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
};

/* ─── Bottles ────────────────────────────────────────────────── */
const BottlesSection = ({ bottles=[], onChange }) => {
  const upd = (i, f, v) => onChange(bottles.map((b, j) => j===i ? {...b,[f]:v} : b));
  const add = () => onChange([...bottles, { name:'', unit:'bottle', quantityPrepped:0, quantityReturned:0, unitCost:0 }]);
  const del = (i) => onChange(bottles.filter((_,j) => j!==i));
  return (
    <Card title="Bottles / Inventory Prepped">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead><tr>
            {['Item','Unit','Prepped','Returned','Used','Unit Cost $','Total Cost',''].map(h =>
              <th key={h} style={{ padding:'6px 8px', color:'#aaa', fontWeight:'600', fontSize:'11px', textAlign: h==='Item'?'left':'center' }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {bottles.map((b, i) => {
              const used = (b.quantityPrepped||0) - (b.quantityReturned||0);
              const cost = used * (b.unitCost||0);
              return (
                <tr key={i} style={{ borderTop:'1px solid #f0f0f0' }}>
                  <td style={{ padding:'4px 6px' }}>
                    <input value={b.name} onChange={e=>upd(i,'name',e.target.value)} style={{ ...iStyle, width:'140px' }} placeholder="e.g. Tequila" />
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <select value={b.unit} onChange={e=>upd(i,'unit',e.target.value)} style={{ ...iStyle, width:'90px', cursor:'pointer' }}>
                      {['bottle','can','keg','unit','case'].map(u=><option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'4px 6px' }}><NumInput value={b.quantityPrepped} onChange={v=>upd(i,'quantityPrepped',v)} style={{ width:'68px', textAlign:'center' }} /></td>
                  <td style={{ padding:'4px 6px' }}><NumInput value={b.quantityReturned} onChange={v=>upd(i,'quantityReturned',v)} style={{ width:'68px', textAlign:'center' }} /></td>
                  <td style={{ padding:'8px', textAlign:'center', fontWeight:'700', color: used<0?'#f44336':'#333' }}>{used}</td>
                  <td style={{ padding:'4px 6px' }}><NumInput value={b.unitCost} onChange={v=>upd(i,'unitCost',v)} step={0.01} style={{ width:'78px', textAlign:'right' }} /></td>
                  <td style={{ padding:'8px', textAlign:'center', color:'#555' }}>{fmt$(cost)}</td>
                  <td style={{ padding:'4px', textAlign:'center' }}>
                    <button onClick={()=>del(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#f44336', fontSize:'18px', lineHeight:1 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={add} style={{ marginTop:'10px', padding:'7px 14px', background:'#f9f9f9', border:'1px dashed #ccc', borderRadius:'8px', cursor:'pointer', fontSize:'12px', color:'#666' }}>+ Add Item</button>
    </Card>
  );
};

/* ─── Drink Sales ────────────────────────────────────────────── */
const DrinkSalesSection = ({ drinks=[], onChange }) => {
  const upd = (i, f, v) => onChange(drinks.map((d, j) => j===i ? {...d,[f]:v} : d));
  const add = () => onChange([...drinks, { name:'', category:'cocktail', quantitySold:0, pricePerDrink:0 }]);
  const del = (i) => onChange(drinks.filter((_,j) => j!==i));
  const total = drinks.reduce((s,d) => s + (d.quantitySold||0)*(d.pricePerDrink||0), 0);
  return (
    <Card title="Drink Sales">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead><tr>
            {['Item','Category','Qty Sold','Price / Drink','Revenue',''].map(h =>
              <th key={h} style={{ padding:'6px 8px', color:'#aaa', fontWeight:'600', fontSize:'11px', textAlign: h==='Item'?'left':'center' }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {drinks.map((d, i) => {
              const rev = (d.quantitySold||0)*(d.pricePerDrink||0);
              return (
                <tr key={i} style={{ borderTop:'1px solid #f0f0f0' }}>
                  <td style={{ padding:'4px 6px' }}>
                    <input value={d.name} onChange={e=>upd(i,'name',e.target.value)} style={{ ...iStyle, width:'160px' }} placeholder="Drink name" />
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <select value={d.category} onChange={e=>upd(i,'category',e.target.value)} style={{ ...iStyle, width:'110px', cursor:'pointer' }}>
                      {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'4px 6px' }}><NumInput value={d.quantitySold} onChange={v=>upd(i,'quantitySold',v)} style={{ width:'68px', textAlign:'center' }} /></td>
                  <td style={{ padding:'4px 6px' }}><NumInput value={d.pricePerDrink} onChange={v=>upd(i,'pricePerDrink',v)} step={0.01} style={{ width:'78px', textAlign:'right' }} /></td>
                  <td style={{ padding:'8px', textAlign:'center', fontWeight:'600', color:'#2196F3' }}>{fmt$(rev)}</td>
                  <td style={{ padding:'4px', textAlign:'center' }}>
                    <button onClick={()=>del(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#f44336', fontSize:'18px', lineHeight:1 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {drinks.length > 0 && (
            <tfoot><tr style={{ borderTop:'2px solid #eee' }}>
              <td colSpan={4} style={{ padding:'8px', textAlign:'right', fontWeight:'700', color:'#555' }}>Total Revenue</td>
              <td style={{ padding:'8px', textAlign:'center', fontWeight:'700', color:'#2196F3' }}>{fmt$(total)}</td>
              <td />
            </tr></tfoot>
          )}
        </table>
      </div>
      <button onClick={add} style={{ marginTop:'10px', padding:'7px 14px', background:'#f9f9f9', border:'1px dashed #ccc', borderRadius:'8px', cursor:'pointer', fontSize:'12px', color:'#666' }}>+ Add Drink</button>
    </Card>
  );
};

/* ─── Info Tab ───────────────────────────────────────────────── */
const InfoTab = ({ form, setForm, posEvents }) => {
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const setFF = (f, v) => setForm(p => ({ ...p, flatFeeConfig: { ...p.flatFeeConfig, [f]: v } }));
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
      <Card title="Event Details" style={{ gridColumn:'1 / -1' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <Field label="Event Name" col="1 / -1"><input value={form.name} onChange={e=>set('name',e.target.value)} style={iStyle} placeholder="e.g. Smith Wedding" /></Field>
          <Field label="Client Name"><input value={form.clientName} onChange={e=>set('clientName',e.target.value)} style={iStyle} placeholder="Client" /></Field>
          <Field label="Venue"><input value={form.venue} onChange={e=>set('venue',e.target.value)} style={iStyle} placeholder="Venue" /></Field>
          <Field label="Date"><input type="date" value={form.date?form.date.slice(0,10):''} onChange={e=>set('date',e.target.value)} style={iStyle} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={e=>set('status',e.target.value)} style={{ ...iStyle, cursor:'pointer' }}>
              {STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Start Time"><input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)} style={iStyle} /></Field>
          <Field label="End Time"><input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)} style={iStyle} /></Field>
          <Field label="Guest Count"><NumInput value={form.guestCount} onChange={v=>set('guestCount',v)} /></Field>
          <Field label="Duration (hrs)"><NumInput value={form.durationHours} onChange={v=>set('durationHours',v)} step={0.5} /></Field>
          <Field label="Notes" col="1 / -1"><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={3} style={{ ...iStyle, resize:'vertical' }} placeholder="Notes…" /></Field>
        </div>
      </Card>

      <Card title="POS Event Link">
        <Field label="Link to POS Event">
          <select value={form.posEventId||''} onChange={e=>set('posEventId',e.target.value||null)} style={{ ...iStyle, cursor:'pointer' }}>
            <option value="">— None —</option>
            {posEvents.map(pe=>(
              <option key={pe._id} value={pe._id}>{pe.name} ({new Date(pe.date||pe.startedAt).toLocaleDateString()})</option>
            ))}
          </select>
        </Field>
        <p style={{ fontSize:'12px', color:'#aaa', margin:0 }}>Linking a POS event pulls live sales data into the Sales tab.</p>
      </Card>

      <Card title="Payment Model">
        <Field label="Model">
          <select value={form.paymentModel} onChange={e=>set('paymentModel',e.target.value)} style={{ ...iStyle, cursor:'pointer' }}>
            {PAYMENT_MODELS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        {(form.paymentModel==='flatfee'||form.paymentModel==='hybrid') && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop:'8px' }}>
            <Field label="Base Rate ($)"><NumInput value={form.flatFeeConfig?.baseRate} onChange={v=>setFF('baseRate',v)} step={0.01} /></Field>
            <Field label="Base Hours"><NumInput value={form.flatFeeConfig?.baseHours} onChange={v=>setFF('baseHours',v)} step={0.5} /></Field>
            <Field label="Drinks/Guest/Hr (base)"><NumInput value={form.flatFeeConfig?.drinksPerGuestPerHour} onChange={v=>setFF('drinksPerGuestPerHour',v)} step={0.5} /></Field>
            <Field label="Drinks/Guest/Hr (extra)"><NumInput value={form.flatFeeConfig?.additionalDrinksPerHour} onChange={v=>setFF('additionalDrinksPerHour',v)} step={0.5} /></Field>
            <Field label="Price / Extra Drink ($)" col="1 / -1"><NumInput value={form.flatFeeConfig?.pricePerExtraDrink} onChange={v=>setFF('pricePerExtraDrink',v)} step={0.01} /></Field>
          </div>
        )}
      </Card>
    </div>
  );
};

/* ─── Financials Tab ─────────────────────────────────────────── */
const FinancialsTab = ({ form, setForm }) => {
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const profit = (form.totalRevenue||0) - (form.totalCost||0) - (form.travelCost||0);
  return (
    <div>
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', marginBottom:'16px' }}>
        <StatCard label="Revenue"  value={fmt$(form.totalRevenue)} color="#2196F3" />
        <StatCard label="Sales"    value={fmt$(form.totalSales)}   color="#333" />
        <StatCard label="Tips"     value={fmt$(form.totalTips)}    color="#9C27B0" />
        <StatCard label="Cost"     value={fmt$(form.totalCost)}    color="#FF9800" />
        <StatCard label="Travel"   value={fmt$(form.travelCost)}   color="#FF9800" />
        <StatCard label="Profit"   value={fmt$(profit)} color={profit>=0?'#4CAF50':'#f44336'} />
      </div>
      <Card title="Manual Overrides">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <Field label="Total Sales ($)"><NumInput value={form.totalSales} onChange={v=>set('totalSales',v)} step={0.01} /></Field>
          <Field label="Total Tips ($)"><NumInput value={form.totalTips} onChange={v=>set('totalTips',v)} step={0.01} /></Field>
          <Field label="Total Revenue ($)"><NumInput value={form.totalRevenue} onChange={v=>set('totalRevenue',v)} step={0.01} /></Field>
          <Field label="Total Cost ($)"><NumInput value={form.totalCost} onChange={v=>set('totalCost',v)} step={0.01} /></Field>
          <Field label="Travel Cost ($)"><NumInput value={form.travelCost} onChange={v=>set('travelCost',v)} step={0.01} /></Field>
        </div>
        <p style={{ fontSize:'12px', color:'#aaa', margin:'10px 0 0' }}>These fields are auto-calculated on save. You can override them manually here.</p>
      </Card>
    </div>
  );
};

/* ─── Inventory Tab ──────────────────────────────────────────── */
const InventoryTab = ({ form, setForm }) => {
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  return (
    <div>
      <GlasswareSection glassware={form.glassware} onChange={v=>set('glassware',v)} />
      <BottlesSection bottles={form.bottlesPrepped} onChange={v=>set('bottlesPrepped',v)} />
      <Card title="Ice">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', maxWidth:'300px' }}>
          <Field label="Blocks Brought"><NumInput value={form.iceBlocksBrought} onChange={v=>set('iceBlocksBrought',v)} /></Field>
          <Field label="Blocks Returned"><NumInput value={form.iceBlocksReturned} onChange={v=>set('iceBlocksReturned',v)} /></Field>
        </div>
        <div style={{ marginTop:'8px', fontSize:'13px', color:'#555' }}>
          Used: <strong>{(form.iceBlocksBrought||0)-(form.iceBlocksReturned||0)}</strong> blocks
        </div>
      </Card>
    </div>
  );
};

/* ─── Drinks Tab ─────────────────────────────────────────────── */
const DrinksTab = ({ form, setForm }) => (
  <DrinkSalesSection drinks={form.drinkSales} onChange={v=>setForm(p=>({...p,drinkSales:v}))} />
);

/* ═══════════════════════════════════════════════════════════════
   MAIN EventDetail
═══════════════════════════════════════════════════════════════ */
const EventDetail = ({ event, posEvents, onSave, onDelete, onClose }) => {
  const { apiCall } = useAuth();
  const [form, setForm] = useState(event);
  const [tab, setTab] = useState('Info');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setForm(event); setDirty(false); }, [event._id]);

  const handleSetForm = useCallback((updater) => {
    setForm(updater);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); setDirty(false); }
    finally { setSaving(false); }
  };

  const handleRecalculate = async () => {
    setSaving(true);
    try {
      const res = await apiCall(`/catering-events/${form._id}/recalculate`, { method:'POST' });
      setForm(res.event); setDirty(false);
    } catch (err) { alert('Recalculate failed: ' + err.message); }
    finally { setSaving(false); }
  };

  const sSt = statusStyle(form.status);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Header */}
      <div style={{ background:'white', padding:'14px 20px', borderBottom:'1px solid #eee', display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'22px', color:'#aaa', lineHeight:1, padding:'0 2px' }}>‹</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:'700', fontSize:'16px', color:'#222', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{form.name||'Untitled Event'}</div>
          {form.clientName && <div style={{ fontSize:'12px', color:'#888' }}>{form.clientName}</div>}
        </div>
        <span style={{ padding:'3px 10px', borderRadius:'12px', fontSize:'11px', fontWeight:'700', textTransform:'uppercase', ...sSt }}>{form.status}</span>
        {dirty && <span style={{ fontSize:'11px', color:'#FF9800', fontWeight:'700' }}>Unsaved</span>}
        <button onClick={handleRecalculate} disabled={saving}
          style={{ padding:'7px 12px', background:'#f5f5f5', border:'1px solid #ddd', borderRadius:'8px', cursor:'pointer', fontSize:'12px', color:'#555', fontWeight:'600' }}>
          ↻ Recalc
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding:'7px 18px', background:'#800080', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'700', opacity:saving?0.7:1 }}>
          {saving?'Saving…':'Save'}
        </button>
        <button onClick={onDelete}
          style={{ padding:'7px 12px', background:'#fff0f0', border:'1px solid #ffcdd2', borderRadius:'8px', cursor:'pointer', fontSize:'12px', color:'#c62828', fontWeight:'600' }}>
          Delete
        </button>
      </div>

      {/* Tab Bar */}
      <TabBar active={tab} onChange={setTab} />

      {/* Tab Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
        {tab==='Info'       && <InfoTab       form={form} setForm={handleSetForm} posEvents={posEvents} />}
        {tab==='Financials' && <FinancialsTab form={form} setForm={handleSetForm} />}
        {tab==='Inventory'  && <InventoryTab  form={form} setForm={handleSetForm} />}
        {tab==='Drinks'     && <DrinksTab     form={form} setForm={handleSetForm} />}
      </div>
    </div>
  );
};

export default EventDetail;
