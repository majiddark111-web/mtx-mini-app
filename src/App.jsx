
import React, { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'lumos.gameState.v1';
const DEFAULT_STATE = { score: 0, energy: 750, maxEnergy: 750, tapLevel: 0, energyLevel: 0, tapPower: 1, boostHistory: [] };

function loadGameState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_STATE;
    const number = (value, fallback, min = 0) => Number.isFinite(value) ? Math.max(min, value) : fallback;
    const maxEnergy = number(saved.maxEnergy, DEFAULT_STATE.maxEnergy, 1);
    return {
      score: number(saved.score, 0),
      energy: Math.min(maxEnergy, number(saved.energy, maxEnergy)),
      maxEnergy,
      tapLevel: number(saved.tapLevel, 0),
      energyLevel: number(saved.energyLevel, 0),
      tapPower: number(saved.tapPower, 1, 1),
      boostHistory: Array.isArray(saved.boostHistory) ? saved.boostHistory.slice(0, 20) : [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export default function App() {
  const [initialState] = useState(loadGameState);
  const [score, setScore] = useState(initialState.score);
  const [energy, setEnergy] = useState(initialState.energy);
  const [username, setUsername] = useState('user');
  const [avatar, setAvatar] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [showEarn, setShowEarn] = useState(false);
  const [boostHistory, setBoostHistory] = useState(initialState.boostHistory);
  const [tapLevel, setTapLevel] = useState(initialState.tapLevel);
  const [energyLevel, setEnergyLevel] = useState(initialState.energyLevel);
  const [tapPower, setTapPower] = useState(initialState.tapPower);
  const [popUps, setPopUps] = useState([]); // floating +MTX popups
  const [maxEnergy, setMaxEnergy] = useState(initialState.maxEnergy);
  const [rechargeTick, setRechargeTick] = useState(0); // for smooth bar animation
  const [showBoost, setShowBoost] = useState(false);


  const energyRef = useRef(initialState.energy);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (user) {
      setUsername(user.username || [user.first_name, user.last_name].filter(Boolean).join(' ') || 'user');
      setAvatar(user.photo_url || '');
      setTelegramId(String(user.id || ''));
    }
    tg?.ready?.();
    tg?.expand?.();
  }, []);

  const handleTap = () => {
    if (energyRef.current <= 0) return;
    energyRef.current -= 1;
    setScore(prev => prev + tapPower);
    setEnergy(energyRef.current);
  };

  useEffect(() => { energyRef.current = energy; }, [energy]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ score, energy, maxEnergy, tapLevel, energyLevel, tapPower, boostHistory }));
    } catch (error) {
      console.warn('Lumos state could not be saved', error);
    }
  }, [score, energy, maxEnergy, tapLevel, energyLevel, tapPower, boostHistory]);

  
  // Auto-recharge algorithm (tiered):
  // - Fast when low, slower near full. Scales with maxEnergy and energyLevel.
  //   <50%: ~1.2s/+1  | 50–80%: ~2.0s/+1 | >80%: ~3.2s/+1
  //   Each energyLevel reduces timings by 7% (stacking).
  useEffect(() => {
    const frac = energy / Math.max(1, maxEnergy);
    let baseMs;
    if (frac < 0.5) baseMs = 1200;
    else if (frac < 0.8) baseMs = 2000;
    else baseMs = 3200;
    const capScale = Math.min(1.25, Math.max(0.85, 750 / Math.max(750, maxEnergy)));
    const levelBonus = Math.pow(0.93, energyLevel); // -7% per level
    const intervalMs = Math.floor(baseMs * capScale * levelBonus);

    const t = setInterval(() => {
      setEnergy(prev => (prev < maxEnergy ? prev + 1 : prev));
      setRechargeTick(tk => tk + 1);
    }, intervalMs);
    return () => clearInterval(t);
  }, [energy, maxEnergy, energyLevel]);
const buttons = [
    { icon: '🏆', label: 'Leaderboard', onClick: () => alert("Leaderboard coming soon") },
    { icon: '👥', label: 'Frens', onClick: () => alert("Frens feature coming soon") },
    { icon: '⚡', label: 'Boost', onClick: () => setShowBoost(true) },
    { icon: '🎯', label: 'Earn', onClick: () => setShowEarn(true) },
    { icon: '🎁', label: 'Claim', onClick: () => alert("Claim feature coming soon") },
  ];
  // === Boost configuration ===
  const energyCosts = [750, 2500, 5000, 30000];
  const energyCaps  = [1500, 2500, 4000, 10000];
  const tapCosts = [1000, 5000, 25000];
  const tapPowers = [2, 3, 5];

  const nextEnergyCost = energyLevel < energyCosts.length ? energyCosts[energyLevel] : null;
  const nextEnergyCap  = energyLevel < energyCaps.length  ? energyCaps[energyLevel]  : maxEnergy;
  const nextTapCost = tapLevel < tapCosts.length ? tapCosts[tapLevel] : null;
  const nextTapPower = tapLevel < tapPowers.length ? tapPowers[tapLevel] : tapPower;

  const energyProgress = Math.min(100, Math.round((energyLevel / energyCaps.length) * 100));
  const tapProgress = Math.min(100, Math.round((tapLevel / tapPowers.length) * 100));

  const nowStr = () => { const d = new Date(); const pad = (n)=> String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const histIcon = { energy:'🔋', tap:'👆' };


  const energyPercentage = Math.min(100, Math.max(0, (energy / Math.max(1, maxEnergy)) * 100));

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100vh' }}>
      <div className="galaxy" />
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'space-between',
        height: '100vh', padding: '20px', color: 'white',
        position: 'relative', zIndex: 2
      }}>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {avatar && <img src={avatar} alt='avatar' style={{ width: 40, borderRadius: '50%' }} />}
            <span>@{username}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 20 }}>
          <div style={{ marginBottom: 10, fontSize: 22, color: 'yellow', fontWeight: 'bold' }}>
            {score} MTX
          </div>
          <div onClick={handleTap} className="coin-button" style={{
            width: 300, height: 300, borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <img src="/mtx.png" alt="mtx" style={{ width: '100%', height: '100%' }} />
          </div>
          <div style={{
            width: 300,
            height: 20,
            backgroundColor: '#333',
            borderRadius: 10,
            marginTop: 12,
            boxShadow: '0 0 10px gold',
            overflow: 'hidden',
          }}>
            <div className="energy-bar" style={{
              width: `${energyPercentage}%`,
              height: '100%',
              borderRadius: 10,
            }}></div>
          </div>
          <div style={{ marginTop: 10, color: 'white' }}>Energy: {energy} / {maxEnergy}</div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          width: '100%', padding: 10, backgroundColor: '#222', borderRadius: 20
        }}>
          {buttons.map((btn) => (
            <div key={btn.label} onClick={btn.onClick} style={{ textAlign: 'center', flex: 1 }} className="icon">
              <div style={{ fontSize: 20 }}>{btn.icon}</div>
              <div>{btn.label}</div>
            </div>
          ))}
        </div>
      </div>
    
      {showBoost && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowBoost(false)}>
          <div className='modal-card' style={{ width: '92%', maxWidth: 520, backgroundColor: '#111', border: '1px solid #333', borderRadius: 20, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
              <div style={{fontSize: 18, fontWeight: 700}}>⚡ Boost Upgrades</div>
              <button onClick={() => setShowBoost(false)} style={{ background:'transparent', border:'1px solid #444', color:'#ddd', borderRadius:12, padding:'4px 10px', cursor:'pointer' }}>Close</button>
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:12}}>
              {/* Extra Energy Card */}
              <div style={{background:'#181818', border:'1px solid #2a2a2a', borderRadius:16, padding:12}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:700, fontSize:16, color:'#fff'}}>🔋 Extra Energy</div>
                    <div style={{fontSize:12, color:'#aaa'}}>Current cap: {maxEnergy}</div>
                    {nextEnergyCost !== null ? (
                      <div style={{fontSize:12, color:'#FFD21E', marginTop:4}}>Next ➜ {nextEnergyCap} (Cost: {nextEnergyCost} MTX)</div>
                    ) : (
                      <div style={{fontSize:12, color:'#0f0', marginTop:4}}>Max level reached</div>
                    )}
                    <div style={{height:6, background:'#2a2a2a', borderRadius:6, overflow:'hidden', marginTop:8}}>
                      <div className='progress-anim' style={{width: `${energyProgress}%`, height:'100%'}} />
                    </div>
                  </div>
                  <button
                    disabled={nextEnergyCost === null}
                    style={{ background: nextEnergyCost===null?'#555':'#FFD21E', border:'none', color: nextEnergyCost===null?'#ccc':'#111', fontWeight:700, borderRadius:12, padding:'8px 12px', cursor: nextEnergyCost===null?'not-allowed':'pointer' }}
                    onClick={()=>{
                      if(nextEnergyCost === null) return;
                      if(score < nextEnergyCost){ alert('Not enough MTX'); return; }
                      setScore(prev=> prev - nextEnergyCost);
                      setMaxEnergy(nextEnergyCap);
                      setEnergy(nextEnergyCap);
                      setEnergyLevel(prev=> prev + 1);
                      setBoostHistory(prev => ([{type:'energy', text:`Energy upgraded to ${nextEnergyCap} (cost ${nextEnergyCost})`, time: nowStr()} , ...prev]).slice(0,20));
                    }}
                  >Upgrade</button>
                </div>
              </div>

              {/* Extra Tap Card */}
              <div style={{background:'#181818', border:'1px solid #2a2a2a', borderRadius:16, padding:12}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:700, fontSize:16, color:'#fff'}}>👆 Extra Tap</div>
                    <div style={{fontSize:12, color:'#aaa'}}>Current power: {tapPower} /tap</div>
                    {nextTapCost !== null ? (
                      <div style={{fontSize:12, color:'#FFD21E', marginTop:4}}>Next ➜ {nextTapPower}/tap (Cost: {nextTapCost} MTX)</div>
                    ) : (
                      <div style={{fontSize:12, color:'#0f0', marginTop:4}}>Max level reached</div>
                    )}
                    <div style={{height:6, background:'#2a2a2a', borderRadius:6, overflow:'hidden', marginTop:8}}>
                      <div className='progress-anim' style={{width: `${tapProgress}%`, height:'100%'}} />
                    </div>
                  </div>
                  <button
                    disabled={nextTapCost === null}
                    style={{ background: nextTapCost===null?'#555':'#FFD21E', border:'none', color: nextTapCost===null?'#ccc':'#111', fontWeight:700, borderRadius:12, padding:'8px 12px', cursor: nextTapCost===null?'not-allowed':'pointer' }}
                    onClick={()=>{
                      if(nextTapCost === null) return;
                      if(score < nextTapCost){ alert('Not enough MTX'); return; }
                      setScore(prev=> prev - nextTapCost);
                      setTapPower(nextTapPower);
                      setTapLevel(prev=> prev + 1);
                      setBoostHistory(prev => ([{type:'tap', text:`Tap power upgraded to ${nextTapPower} (cost ${nextTapCost})`, time: nowStr()} , ...prev]).slice(0,20));
                    }}
                  >Upgrade</button>
                </div>
              </div>

              {/* History */}
              <div style={{marginTop:14}}>
                <div style={{fontWeight:700, fontSize:14, color:'#fff', marginBottom:8}}>History</div>
                {boostHistory.length === 0 ? (
                  <div style={{fontSize:12, color:'#888'}}>No upgrades yet.</div>
                ) : (
                  <div className='history-scroll' style={{maxHeight:140, overflowY:'auto', border:'1px solid #2a2a2a', borderRadius:10}}>
                    {boostHistory.map((h, idx) => (
                      <div key={idx} style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#ccc', padding:'6px 10px', borderBottom:'1px solid #222'}}>
                        <span style={{fontSize:14}}>{(histIcon && histIcon[h.type]) || '⚡'}</span>
                        <span style={{opacity:0.8}}>{h.text}</span>
                        <span style={{marginLeft:'auto', color:'#999'}}>{h.time}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
{showEarn && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }} onClick={() => setShowEarn(false)}>
          <div style={{
            width: '92%', maxWidth: 520, backgroundColor: '#111', border: '1px solid #333',
            borderRadius: 20, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
              <div style={{fontSize: 18, fontWeight: 700}}>🎯 Earn Tasks</div>
              <button onClick={() => setShowEarn(false)} style={{
                background:'transparent', border:'1px solid #444', color:'#ddd', borderRadius:12, padding:'4px 10px', cursor:'pointer'
              }}>Close</button>
            </div>
            <div style={{fontSize:12, color:'#aaa', marginBottom:12}}>Choose a task to earn MTX.</div>
            <div style={{maxHeight:'70vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:12}}>
              {[
                {
                  id:1,
                  icon:'📢',
                  title:'Telegram',
                  subtitle:'Join our official channel',
                  reward:'+200 MTX',
                  cta:'Open',
                  url:'https://t.me/TOKXCOIN'
                },
                {
                  id:2,
                  icon:'▶️',
                  title:'YouTube',
                  subtitle:'Subscribe to our channel',
                  reward:'+200 MTX',
                  cta:'Open',
                  url:'https://youtube.com/@tokx.community'
                },
                {
                  id:3,
                  icon:'📸',
                  title:'Instagram',
                  subtitle:'Follow our page',
                  reward:'+200 MTX',
                  cta:'Open',
                  url:'https://www.instagram.com/tokx_org'
                },
                {
                  id:4,
                  icon:'🕊️',
                  title:'X (Twitter)',
                  subtitle:'Follow our community',
                  reward:'+200 MTX',
                  cta:'Open',
                  url:'https://x.com/Tokxcommunity'
                }
              ].map(item => (
                <div key={item.id} style={{background:'#181818', border:'1px solid #2a2a2a', borderRadius:16, padding:12}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <div style={{fontSize:28}}>{item.icon}</div>
                      <div>
                        <div style={{fontWeight:700, fontSize:16, color:'#fff'}}>{item.title}</div>
                        <div style={{fontSize:12, color:'#aaa'}}>{item.subtitle}</div>
                        <div style={{fontSize:12, color:'#FFD21E', marginTop:2}}>{item.reward}</div>
                      </div>
                    </div>
                    <button style={{ background:'#FFD21E', border:'none', color:'#111', fontWeight:700, borderRadius:12, padding:'8px 12px', cursor:'pointer' }}
                      onClick={()=>{
                        try { window.navigator.vibrate && window.navigator.vibrate(10) } catch(e){}
                        const tg = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
                        if (tg && typeof tg.openLink === 'function') {
                          tg.openLink(item.url);
                        } else {
                          window.open(item.url, '_blank', 'noopener,noreferrer');
                        }
                      }}
                    >{item.cta}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
