import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

const STORAGE_KEY = "nd-tracker-entries-v3";
const LOC_KEY     = "nd-tracker-location";

// ── Static Data ───────────────────────────────────────────────
const TRIGGER_TAGS = [
  "Tierhaare","Hausstaub","Schwitzen","Stress",
  "Synthetik-Kleidung","Wollkontakt","Wasser (Chlor)","Heizungsluft",
  "Infekt/Erkältung","Zahnen","Wenig Schlaf"
];
const FOOD_GROUPS = [
  { label:"🥛 Tierisches Eiweiß",    items:["Kuhmilch","Joghurt / Quark","Käse","Hühnerei","Fisch","Meeresfrüchte","Schweinefleisch"] },
  { label:"🌾 Getreide & Hülsenfrüchte", items:["Weizen","Roggen / Dinkel","Soja","Erdnüsse"] },
  { label:"🍓 Obst & Gemüse",         items:["Erdbeeren","Tomaten","Zitrusfrüchte","Kiwi","Spinat / Aubergine","Sellerie"] },
  { label:"🍫 Sonstiges",             items:["Schokolade / Kakao","Nüsse (Baum)","Hefe / Fermentiertes","Künstliche Farbstoffe","Konservierungsstoffe","Fertiggerichte"] },
];
const MEDICATIONS     = ["Sana Cutan Salbe","Linola Fett","Elidel","Kortisoncreme","Cetirizin","Feuchte Wickel"];
const SEVERITY_LABELS = ["","Sehr gut 🌿","Gut 😊","Mittel 😐","Schlecht 😟","Sehr schlecht 😣"];
const SLEEP_LABELS    = ["","Super (7h+)","Gut (6–7h)","Unterbrochen","Schlecht (<5h)"];
const POLLEN_LABELS   = ["Keine","Gering","Mäßig","Hoch","Sehr hoch"];
const POLLEN_COLORS   = ["#c8e6c9","#a5d6a7","#fff176","#ffb74d","#e57373"];
const POLLEN_TYPES    = [{key:"birch",label:"Birke"},{key:"alder",label:"Erle"},{key:"grass",label:"Gräser"},{key:"mugwort",label:"Beifuß"}];

// ── Helpers ───────────────────────────────────────────────────
const todayStr  = () => new Date().toISOString().split("T")[0];
const formatDate = d => new Date(d).toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"});
const sevColor   = s => ["","#6dbf82","#a8d48a","#f0c96a","#e8956a","#d95f5f"][s] || "#ccc";

function pollenLevel(val, type) {
  if (val == null || val < 0) return null;
  if (type==="grass")               { if(val<1)return 0;if(val<6)return 1;if(val<31)return 2;if(val<100)return 3;return 4; }
  if (type==="birch"||type==="alder"){ if(val<1)return 0;if(val<11)return 1;if(val<91)return 2;if(val<500)return 3;return 4; }
  if(val<1)return 0;if(val<11)return 1;if(val<51)return 2;if(val<200)return 3;return 4;
}
const maxHourly = arr => { if(!arr?.length)return null; const v=arr.filter(x=>x!=null); return v.length?Math.max(...v):null; };

async function fetchEnv(lat, lon, date) {
  const [wRes, pRes] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,relative_humidity_2m_mean&timezone=auto&start_date=${date}&end_date=${date}`),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=birch_pollen,alder_pollen,grass_pollen,mugwort_pollen&timezone=auto&start_date=${date}&end_date=${date}`)
  ]);
  const w = await wRes.json(), p = await pRes.json();
  const d = w.daily, h = p.hourly;
  return {
    temp_max:d?.temperature_2m_max?.[0], temp_min:d?.temperature_2m_min?.[0],
    humidity:d?.relative_humidity_2m_mean?.[0], precipitation:d?.precipitation_sum?.[0],
    uv:d?.uv_index_max?.[0],
    pollen:{
      birch:  pollenLevel(maxHourly(h?.birch_pollen),  "birch"),
      alder:  pollenLevel(maxHourly(h?.alder_pollen),  "alder"),
      grass:  pollenLevel(maxHourly(h?.grass_pollen),  "grass"),
      mugwort:pollenLevel(maxHourly(h?.mugwort_pollen),"mugwort"),
    }
  };
}

// ── localStorage helpers ──────────────────────────────────────
function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) { console.error("localStorage write failed:", e); }
}

const emptyForm = () => ({
  date:todayStr(), severity:0, sleep:0,
  triggers:[], medications:[], foodTriggers:[],
  notes:"", env:null
});

// ── Shared UI ─────────────────────────────────────────────────
const ST   = ({children, style}) => <div style={{fontFamily:"Lato,sans-serif",fontSize:11,letterSpacing:"1.5px",textTransform:"uppercase",color:"#9a8478",marginBottom:10,...style}}>{children}</div>;
const Card = ({children, style}) => <div style={{background:"white",borderRadius:16,padding:18,marginBottom:14,boxShadow:"0 1px 6px rgba(100,60,30,0.07)",...style}}>{children}</div>;
const chip = {padding:"5px 10px",borderRadius:20,background:"#f0ebe4",color:"#5a4a40",fontFamily:"Lato,sans-serif",fontSize:12};

// ── Weather Card ──────────────────────────────────────────────
function WeatherCard({env, loading, onRetry}) {
  if (loading) return <Card><div style={{textAlign:"center",color:"#9a8478",fontSize:13,padding:"10px 0",fontFamily:"Lato,sans-serif"}}>⏳ Lade Wetter & Pollenflug…</div></Card>;
  if (!env)    return <Card><div style={{fontSize:13,color:"#9a8478",fontFamily:"Lato,sans-serif",marginBottom:8}}>⚠️ Wetter/Pollen nicht verfügbar.</div><button onClick={onRetry} style={{padding:"6px 14px",borderRadius:8,border:"1.5px solid #d4b8a0",background:"white",fontSize:12,cursor:"pointer"}}>Erneut versuchen</button></Card>;
  const highPollen = Object.entries(env.pollen).filter(([,v])=>v!=null&&v>=2).sort(([,a],[,b])=>b-a);
  return (
    <Card>
      <ST>Umwelt heute (automatisch)</ST>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {env.temp_max!=null&&<span style={chip}>🌡️ {Math.round(env.temp_min)}–{Math.round(env.temp_max)} °C</span>}
        {env.humidity!=null&&<span style={chip}>💧 {Math.round(env.humidity)} % Luftf.</span>}
        {env.precipitation!=null&&<span style={chip}>🌧️ {env.precipitation.toFixed(1)} mm</span>}
        {env.uv!=null&&<span style={chip}>☀️ UV {env.uv.toFixed(1)}</span>}
      </div>
      <ST>Pollenflug</ST>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {POLLEN_TYPES.map(({key,label})=>{
          const lv=env.pollen[key]; if(lv==null)return null;
          return <span key={key} style={{padding:"5px 10px",borderRadius:20,fontSize:12,background:POLLEN_COLORS[lv],fontFamily:"Lato,sans-serif",fontWeight:lv>=3?700:400}}>{label}: {POLLEN_LABELS[lv]}</span>;
        })}
      </div>
      {highPollen.length>0&&<div style={{marginTop:10,fontSize:12,color:"#8a5a3a",background:"#fff3e0",borderRadius:8,padding:"6px 10px",fontFamily:"Lato,sans-serif"}}>⚠️ Erhöhter Pollenflug: {highPollen.map(([k])=>({birch:"Birke",alder:"Erle",grass:"Gräser",mugwort:"Beifuß"}[k])).join(", ")}</div>}
    </Card>
  );
}

// ── Food Trigger Card ─────────────────────────────────────────
function FoodTriggerCard({selected, onToggle}) {
  return (
    <Card>
      <ST>Mögliche Ernährungs-Trigger heute</ST>
      <div style={{fontFamily:"Lato,sans-serif",fontSize:12,color:"#9a8478",marginBottom:14}}>
        Was wurde heute gegessen, das als schubfördernd gilt?
        {selected.length>0&&<span style={{color:"#c8785a",fontWeight:700}}> ({selected.length} ausgewählt)</span>}
      </div>
      {FOOD_GROUPS.map(group=>(
        <div key={group.label} style={{marginBottom:16}}>
          <div style={{fontFamily:"Lato,sans-serif",fontSize:11,fontWeight:700,color:"#7a6a60",marginBottom:7}}>{group.label}</div>
          <div>{group.items.map(item=>{
            const active=selected.includes(item);
            return <button key={item} onClick={()=>onToggle(item)} style={{display:"inline-block",margin:"3px",padding:"6px 12px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"Lato,sans-serif",border:active?"1.5px solid #c8785a":"1.5px solid #e0d0c4",background:active?"#c8785a":"white",color:active?"white":"#5a4a40"}}>{item}</button>;
          })}</div>
        </div>
      ))}
      {selected.length>0&&<div style={{marginTop:4,padding:"8px 12px",background:"#fdf0e8",borderRadius:10,fontFamily:"Lato,sans-serif",fontSize:12,color:"#8a5a3a",lineHeight:1.5}}><strong>Ausgewählt:</strong> {selected.join(", ")}</div>}
    </Card>
  );
}

// ── Insight Bar ───────────────────────────────────────────────
function InsightBar({label, count, avg}) {
  return (
    <div style={{marginBottom:13}}>
      <div style={{display:"flex",justifyContent:"space-between",fontFamily:"Lato,sans-serif",fontSize:13}}>
        <span>{label}</span>
        <span style={{color:"#9a8478",fontSize:12}}>{count}× · Ø {avg.toFixed(1)}</span>
      </div>
      <div style={{background:"#f0e8e0",borderRadius:4,height:8,marginTop:4}}>
        <div style={{height:8,borderRadius:4,width:`${(avg/5)*100}%`,background:sevColor(Math.round(avg)),transition:"width .4s"}} />
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────
function App() {
  const [entries,    setEntries]    = useState([]);
  const [view,       setView]       = useState("log");
  const [form,       setForm]       = useState(emptyForm());
  const [envLoading, setEnvLoading] = useState(false);
  const [location,   setLocation]   = useState(null);
  const [locError,   setLocError]   = useState(null);
  const [saved,      setSaved]      = useState(false);

  useEffect(() => {
    const stored  = lsGet(STORAGE_KEY);
    const storedL = lsGet(LOC_KEY);
    if (stored)  setEntries(stored);
    if (storedL) setLocation(storedL);
  }, []);

  const loadEnv = useCallback(async (lat, lon, date) => {
    setEnvLoading(true);
    try   { const env = await fetchEnv(lat, lon, date); setForm(f=>({...f,env})); }
    catch { setForm(f=>({...f,env:null})); }
    setEnvLoading(false);
  }, []);

  useEffect(() => {
    if (location) loadEnv(location.lat, location.lon, form.date);
  }, [location, form.date, loadEnv]);

  function requestLocation() {
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat:pos.coords.latitude, lon:pos.coords.longitude };
        setLocation(loc);
        lsSet(LOC_KEY, loc);
      },
      () => setLocError("Standortzugriff verweigert – bitte in den Browser-Einstellungen erlauben."),
      { timeout:10000 }
    );
  }

  function toggle(field, item) {
    setForm(f=>({...f,[field]:f[field].includes(item)?f[field].filter(x=>x!==item):[...f[field],item]}));
  }

  function submitEntry() {
    if (!form.severity) return;
    const updated = [form, ...entries.filter(e=>e.date!==form.date)].sort((a,b)=>b.date.localeCompare(a.date));
    lsSet(STORAGE_KEY, updated);
    setEntries(updated);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  }

  function loadEntry(e) { setForm({...e}); setView("log"); }

  // ── Insights ──────────────────────────────────────────────
  const insights = (() => {
    if (entries.length < 3) return null;
    const triggerMap={}, foodMap={}, pollenCorr={birch:[],alder:[],grass:[],mugwort:[]};
    entries.forEach(e=>{
      e.triggers?.forEach(t=>{ if(!triggerMap[t])triggerMap[t]=[]; triggerMap[t].push(e.severity); });
      e.foodTriggers?.forEach(f=>{ if(!foodMap[f])foodMap[f]=[]; foodMap[f].push(e.severity); });
      if(e.env?.pollen) Object.keys(pollenCorr).forEach(p=>{
        if(e.env.pollen[p]!=null&&e.severity) pollenCorr[p].push({pollen:e.env.pollen[p],sev:e.severity});
      });
    });
    const rank = map => Object.entries(map)
      .map(([k,sevs])=>({label:k,count:sevs.length,avg:sevs.reduce((a,b)=>a+b,0)/sevs.length}))
      .filter(x=>x.count>=2).sort((a,b)=>b.avg-a.avg);
    const pollenInsights = Object.entries(pollenCorr).map(([p,data])=>{
      if(data.length<3)return null;
      const hi=data.filter(d=>d.pollen>=2),lo=data.filter(d=>d.pollen<2);
      if(!hi.length||!lo.length)return null;
      const avgHi=hi.reduce((s,d)=>s+d.sev,0)/hi.length,avgLo=lo.reduce((s,d)=>s+d.sev,0)/lo.length;
      return {pollen:p,avgHigh:avgHi,avgLow:avgLo,diff:avgHi-avgLo};
    }).filter(Boolean).sort((a,b)=>b.diff-a.diff);
    return {triggers:rank(triggerMap),food:rank(foodMap),pollenInsights,total:entries.length,avgSev:entries.reduce((s,e)=>s+(e.severity||0),0)/entries.length};
  })();

  const pNames = {birch:"Birke",alder:"Erle",grass:"Gräser",mugwort:"Beifuß"};

  return (
    <div style={{fontFamily:"'Georgia',serif",background:"#fdf7f0",minHeight:"100vh",color:"#3a2e28"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        button,textarea,input{font-family:'Lato',sans-serif;}
        .nb{flex:1;padding:10px 4px;background:none;border:none;font-size:11px;letter-spacing:.5px;color:#9a8478;text-transform:uppercase;border-bottom:2px solid transparent;cursor:pointer;}
        .nb.on{color:#c8785a;border-bottom-color:#c8785a;font-weight:700;}
        .sb{width:50px;height:50px;border-radius:12px;border:2px solid #e8dcd4;background:white;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;}
        .sb.on{border-width:2.5px;transform:scale(1.1);}
        .slb{padding:7px 12px;border-radius:10px;border:1.5px solid #d4b8a0;background:white;font-size:12px;color:#5a4a40;cursor:pointer;margin:3px;}
        .slb.on{background:#7aacb8;border-color:#7aacb8;color:white;}
        .tg{display:inline-block;padding:5px 10px;border-radius:20px;font-size:12px;border:1.5px solid #d4b8a0;background:white;color:#5a4a40;cursor:pointer;margin:3px;}
        .tg.on{background:#c8785a;border-color:#c8785a;color:white;}
        .tg.med.on{background:#7aacb8;border-color:#7aacb8;color:white;}
        .er{padding:12px 0;border-bottom:1px solid #f0e8e0;display:flex;align-items:center;gap:12px;cursor:pointer;}
        .er:last-child{border-bottom:none;}
        .sub{width:100%;padding:14px;background:#c8785a;color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;}
        .sub:hover{background:#b56548;}
        .sub:disabled{background:#d4b8a0;cursor:default;}
      `}</style>

      {/* Header */}
      <div style={{background:"#3a2e28",padding:"20px 18px 14px",color:"white"}}>
        <div style={{fontSize:22,fontWeight:300}}>Haut<span style={{fontStyle:"italic",color:"#f0c096"}}>tagebuch</span></div>
        <div style={{fontSize:12,color:"#a09080",marginTop:3,fontFamily:"Lato,sans-serif"}}>Neurodermitis Tracker · Wetter, Pollen & Ernährung</div>
      </div>

      {/* Nav */}
      <div style={{display:"flex",background:"white",borderBottom:"1px solid #f0e8e0"}}>
        {[["log","Eintrag"],["history","Verlauf"],["insights","Muster"]].map(([k,l])=>(
          <button key={k} className={`nb ${view===k?"on":""}`} onClick={()=>setView(k)}>{l}</button>
        ))}
      </div>

      <div style={{padding:"16px 14px",maxWidth:520,margin:"0 auto"}}>

        {/* ── LOG ── */}
        {view==="log" && (<>

          {!location && !locError && (
            <Card style={{textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>📍</div>
              <div style={{fontFamily:"Lato,sans-serif",fontSize:14,color:"#5a4a40",marginBottom:4}}>Wetter & Pollenflug automatisch laden?</div>
              <div style={{fontFamily:"Lato,sans-serif",fontSize:12,color:"#9a8478",marginBottom:12}}>Standort wird nur lokal im Browser gespeichert.</div>
              <button onClick={requestLocation} style={{padding:"10px 20px",background:"#3a2e28",color:"white",border:"none",borderRadius:10,fontSize:14,cursor:"pointer"}}>Standort freigeben</button>
            </Card>
          )}
          {locError&&<Card><div style={{fontSize:13,color:"#c8785a",fontFamily:"Lato,sans-serif"}}>{locError}</div></Card>}

          <Card>
            <ST>Datum</ST>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
              style={{border:"1.5px solid #e8dcd4",borderRadius:10,padding:"8px 12px",width:"100%",fontSize:15,color:"#3a2e28"}} />
          </Card>

          {location&&<WeatherCard env={form.env} loading={envLoading} onRetry={()=>loadEnv(location.lat,location.lon,form.date)} />}

          <Card>
            <ST>Hautzustand heute</ST>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[1,2,3,4,5].map(s=>(
                <button key={s} className={`sb ${form.severity===s?"on":""}`}
                  style={form.severity===s?{borderColor:sevColor(s),backgroundColor:sevColor(s)+"22"}:{}}
                  onClick={()=>setForm(f=>({...f,severity:s}))}>
                  {["🌿","😊","😐","😟","😣"][s-1]}
                </button>
              ))}
            </div>
            {form.severity>0&&<div style={{marginTop:8,fontSize:13,color:"#7a6a60",fontFamily:"Lato,sans-serif"}}>{SEVERITY_LABELS[form.severity]}</div>}
          </Card>

          <Card>
            <ST>Schlaf letzte Nacht</ST>
            <div style={{display:"flex",flexWrap:"wrap"}}>
              {SLEEP_LABELS.slice(1).map((l,i)=>(
                <button key={i} className={`slb ${form.sleep===i+1?"on":""}`}
                  onClick={()=>setForm(f=>({...f,sleep:f.sleep===i+1?0:i+1}))}>{l}</button>
              ))}
            </div>
          </Card>

          <FoodTriggerCard selected={form.foodTriggers} onToggle={item=>toggle("foodTriggers",item)} />

          <Card>
            <ST>Weitere Auslöser (Umwelt / Sonstiges)</ST>
            <div>{TRIGGER_TAGS.map(t=>(
              <button key={t} className={`tg ${form.triggers.includes(t)?"on":""}`} onClick={()=>toggle("triggers",t)}>{t}</button>
            ))}</div>
          </Card>

          <Card>
            <ST>Angewendete Pflege / Medikamente</ST>
            <div>{MEDICATIONS.map(m=>(
              <button key={m} className={`tg med ${form.medications.includes(m)?"on":""}`} onClick={()=>toggle("medications",m)}>{m}</button>
            ))}</div>
          </Card>

          <Card>
            <ST>Sonstige Notizen</ST>
            <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
              placeholder="z.B. Zahnarztbesuch, sehr aufgeregt, Poolbesuch…"
              rows={3} style={{width:"100%",border:"1.5px solid #e8dcd4",borderRadius:10,padding:"8px 12px",fontSize:14,color:"#3a2e28",resize:"none"}} />
          </Card>

          <button className="sub" disabled={!form.severity} onClick={submitEntry}>
            {saved?"✓ Gespeichert!":"Eintrag speichern"}
          </button>
          <div style={{height:30}} />
        </>)}

        {/* ── HISTORY ── */}
        {view==="history" && (
          <Card>
            <ST>Alle Einträge ({entries.length})</ST>
            {entries.length===0&&<div style={{color:"#9a8478",fontSize:14,fontFamily:"Lato,sans-serif",padding:"10px 0"}}>Noch keine Einträge.</div>}
            {entries.map(e=>{
              const hp=e.env?.pollen?Object.entries(e.env.pollen).filter(([,v])=>v>=3).map(([k])=>pNames[k]):[];
              return (
                <div key={e.date} className="er" onClick={()=>loadEntry(e)}>
                  <div style={{width:12,height:12,borderRadius:"50%",background:sevColor(e.severity),flexShrink:0}} />
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"Lato,sans-serif",fontWeight:700,fontSize:14}}>
                      {formatDate(e.date)}
                      {e.env?.temp_max!=null&&<span style={{fontWeight:300,color:"#9a8478",marginLeft:8}}>🌡️ {Math.round(e.env.temp_max)}°C</span>}
                    </div>
                    <div style={{fontSize:12,color:"#9a8478",marginTop:2,fontFamily:"Lato,sans-serif"}}>
                      {SEVERITY_LABELS[e.severity]}
                      {hp.length>0&&<span style={{color:"#c8785a"}}> · 🌿 {hp.join(", ")}</span>}
                      {e.foodTriggers?.length>0&&<span style={{color:"#7a6a60"}}> · 🍽️ {e.foodTriggers.slice(0,2).join(", ")}{e.foodTriggers.length>2?" …":""}</span>}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"#c8b8a8",fontFamily:"Lato,sans-serif"}}>→</div>
                </div>
              );
            })}
          </Card>
        )}

        {/* ── INSIGHTS ── */}
        {view==="insights" && (<>
          {!insights&&(
            <Card style={{textAlign:"center",padding:30}}>
              <div style={{fontSize:32,marginBottom:10}}>📊</div>
              <div style={{fontFamily:"Lato,sans-serif",color:"#9a8478",fontSize:14}}>Noch zu wenig Daten.<br/>Mindestens 3 Einträge nötig.</div>
            </Card>
          )}
          {insights&&(<>
            <Card>
              <ST>Überblick</ST>
              <div style={{display:"flex",gap:12}}>
                <div style={{flex:1,textAlign:"center",padding:"10px 0"}}>
                  <div style={{fontSize:28,fontWeight:300}}>{insights.total}</div>
                  <div style={{fontSize:11,color:"#9a8478",fontFamily:"Lato,sans-serif"}}>Einträge</div>
                </div>
                <div style={{flex:1,textAlign:"center",padding:"10px 0"}}>
                  <div style={{fontSize:28,color:sevColor(Math.round(insights.avgSev))}}>
                    {["🌿","😊","😐","😟","😣"][Math.round(insights.avgSev)-1]}
                  </div>
                  <div style={{fontSize:11,color:"#9a8478",fontFamily:"Lato,sans-serif"}}>Ø Hautzustand</div>
                </div>
              </div>
            </Card>

            <Card>
              <ST>Verlauf (letzte 14 Einträge)</ST>
              <div style={{display:"flex",alignItems:"flex-end",gap:4,height:72,paddingTop:8}}>
                {entries.slice(0,14).reverse().map((e,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <div style={{width:"100%",height:e.severity*12,background:sevColor(e.severity),borderRadius:"4px 4px 0 0",minHeight:4}} />
                    <div style={{fontSize:8,color:"#c8b8a8",transform:"rotate(-45deg)",whiteSpace:"nowrap",fontFamily:"Lato,sans-serif"}}>{formatDate(e.date).split(",")[0]}</div>
                  </div>
                ))}
              </div>
            </Card>

            {insights.food.length>0&&(
              <Card>
                <ST>🍽️ Ernährungs-Trigger</ST>
                <div style={{fontFamily:"Lato,sans-serif",fontSize:12,color:"#7a6a60",marginBottom:12}}>An schlechten Tagen häufig gegessen (Ø Hautzustand)</div>
                {insights.food.map(x=><InsightBar key={x.label} {...x} />)}
                <div style={{fontSize:12,color:"#b0a098",fontFamily:"Lato,sans-serif",fontStyle:"italic",marginTop:4}}>Nur Einträge mit ≥2 Vorkommen. Kein Kausalitätsbeweis – aber gute Hinweise für den Arzt.</div>
              </Card>
            )}

            {insights.pollenInsights.length>0&&(
              <Card>
                <ST>🌿 Pollen & Hautzustand</ST>
                <div style={{fontFamily:"Lato,sans-serif",fontSize:12,color:"#7a6a60",marginBottom:12}}>Ø bei hohem vs. niedrigem Pollenflug</div>
                {insights.pollenInsights.map(({pollen,avgHigh,avgLow,diff})=>(
                  <div key={pollen} style={{marginBottom:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:"Lato,sans-serif",fontSize:13}}>
                      <span>{pNames[pollen]}</span>
                      <span style={{fontSize:12,color:diff>0.3?"#c8785a":"#9a8478"}}>{diff>0.3?"⚠️ ":""} hoch: {avgHigh.toFixed(1)} · niedrig: {avgLow.toFixed(1)}</span>
                    </div>
                    <div style={{background:"#f0e8e0",borderRadius:4,height:8,marginTop:4}}>
                      <div style={{height:8,borderRadius:4,width:`${(avgHigh/5)*100}%`,background:sevColor(Math.round(avgHigh)),transition:"width .4s"}} />
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {insights.triggers.length>0&&(
              <Card>
                <ST>🌬️ Umwelt-Trigger</ST>
                {insights.triggers.map(x=><InsightBar key={x.label} {...x} />)}
              </Card>
            )}
          </>)}
        </>)}

      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
