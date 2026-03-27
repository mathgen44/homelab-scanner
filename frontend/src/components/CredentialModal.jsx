import React, { useState, useEffect, useRef } from 'react';
import { Shield, X, Eye, EyeOff } from 'lucide-react';

export default function CredentialModal({ nodeId, ip, name, onSubmit, onSkip }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [port, setPort] = useState(22);
  const [showPw, setShowPw] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) return;
    onSubmit(username, password, port);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'rgba(251,191,36,0.15)',
              border: '1px solid rgba(251,191,36,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={18} color="#fbbf24" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15 }}>
                Identifiants SSH requis
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                {name} · <span style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{ip}</span>
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onSkip}><X size={14} /></button>
        </div>

        <div style={{
          padding: '10px 16px 12px',
          fontSize: 11, color: 'var(--text3)',
          background: 'rgba(251,191,36,0.05)',
          borderBottom: '1px solid var(--border)',
        }}>
          🔐 Les identifiants seront chiffrés AES-256 et stockés localement. Jamais transmis en clair.
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label className="field-label">Utilisateur SSH</label>
            <input ref={inputRef} className="field-input" value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="root, admin, pi, ubuntu..." autoComplete="username" />
          </div>

          <div className="field">
            <label className="field-label">Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input className="field-input" type={showPw ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                style={{ paddingRight: 36 }} />
              <button type="button" onClick={() => setShowPw(s => !s)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field-label">Port SSH</label>
            <input className="field-input" type="number" value={port}
              onChange={e => setPort(parseInt(e.target.value) || 22)}
              style={{ width: 100 }} min={1} max={65535} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn-scan" style={{ flex: 1 }} disabled={!username || !password}>
              <Shield size={13} /> Valider et continuer le scan
            </button>
            <button type="button" className="btn-secondary" onClick={onSkip}>
              Ignorer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
