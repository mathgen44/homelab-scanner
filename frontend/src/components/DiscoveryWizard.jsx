import React, { useState } from 'react';
import { X, Plus, Trash2, Search } from 'lucide-react';

export default function DiscoveryWizard({ onStart, onClose }) {
  const [ranges, setRanges] = useState(['']);
  const [manualIps, setManualIps] = useState(['']);
  const [mode, setMode] = useState('manual'); // 'range' | 'manual' | 'both'

  function addRange() { setRanges(r => [...r, '']); }
  function removeRange(i) { setRanges(r => r.filter((_, j) => j !== i)); }
  function updateRange(i, v) { setRanges(r => r.map((x, j) => j === i ? v : x)); }

  function addIp() { setManualIps(r => [...r, '']); }
  function removeIp(i) { setManualIps(r => r.filter((_, j) => j !== i)); }
  function updateIp(i, v) { setManualIps(r => r.map((x, j) => j === i ? v : x)); }

  function handleStart() {
    const validRanges = ranges.filter(r => r.trim() && (r.includes('/') || r.includes('-')));
    const validIps = manualIps.filter(ip => ip.trim().match(/^\d{1,3}(\.\d{1,3}){3}$/));
    onStart(validRanges, validIps);
  }

  const canStart =
    ranges.some(r => r.trim()) || manualIps.some(ip => ip.trim());

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Search size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15 }}>Découverte réseau</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Scan automatique ou saisie manuelle</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ padding: 16, display: 'flex', flex: 1, flexDirection: 'column', gap: 16, overflow: 'auto' }}>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', padding: 3, borderRadius: 8 }}>
            {[['manual', '📋 IPs manuelles'], ['range', '🌐 Plage réseau'], ['both', '⚡ Les deux']].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '5px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                background: mode === m ? 'var(--bg2)' : 'transparent',
                color: mode === m ? 'var(--accent)' : 'var(--text3)',
                fontSize: 11, fontFamily: 'var(--mono)',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
              }}>{l}</button>
            ))}
          </div>

          {/* Manual IPs */}
          {(mode === 'manual' || mode === 'both') && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8, fontWeight: 600 }}>
                Adresses IP
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {manualIps.map((ip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input className="field-input" value={ip}
                      onChange={e => updateIp(i, e.target.value)}
                      placeholder="192.168.1.50"
                      style={{ fontFamily: 'var(--mono)', flex: 1 }} />
                    {manualIps.length > 1 && (
                      <button className="btn-icon" onClick={() => removeIp(i)} style={{ color: 'var(--red)' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn-secondary" onClick={addIp} style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px' }}>
                  <Plus size={12} /> Ajouter une IP
                </button>
              </div>
            </div>
          )}

          {/* Ranges */}
          {(mode === 'range' || mode === 'both') && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8, fontWeight: 600 }}>
                Plages réseau (CIDR)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ranges.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input className="field-input" value={r}
                      onChange={e => updateRange(i, e.target.value)}
                      placeholder="192.168.1.0/24 ou 192.168.1.1-254"
                      style={{ fontFamily: 'var(--mono)', flex: 1 }} />
                    {ranges.length > 1 && (
                      <button className="btn-icon" onClick={() => removeRange(i)} style={{ color: 'var(--red)' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn-secondary" onClick={addRange} style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px' }}>
                  <Plus size={12} /> Ajouter une plage
                </button>
              </div>
              <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, fontSize: 10, color: 'var(--text3)', lineHeight: 1.6 }}>
                ⚠ Requiert <strong style={{ color: 'var(--text2)' }}>nmap</strong> installé dans le container.<br />
                Le scan réseau peut prendre 30–60s selon la taille du sous-réseau.
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <button className="btn-scan" style={{ flex: 1 }} onClick={handleStart} disabled={!canStart}>
            <Search size={13} /> Lancer la découverte
          </button>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
