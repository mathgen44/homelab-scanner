import React, { useState } from 'react';
import { Search, Wifi, WifiOff, Trash2, AlertTriangle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}`;

export default function Header({ summary, wsConnected, scanning, scanProgress, onScan, onDiscover, onReset }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function doReset() {
    setResetting(true);
    try {
      await fetch(`${API}/api/inventory/reset`, { method: 'DELETE' });
      onReset?.();
      setShowConfirm(false);
    } catch (e) {
      alert('Erreur lors de la réinitialisation');
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo">🖥 Homelab<strong>Inventory</strong></div>
          {summary && (
            <div className="metrics">
              {[
                { l: 'Équipements', v: summary.total, c: '' },
                { l: 'En ligne', v: summary.online, c: 'g' },
                { l: 'Hors ligne', v: summary.offline, c: summary.offline > 0 ? 'r' : '' },
                { l: 'Containers', v: summary.containers, c: 'b' },
                { l: 'VMs', v: summary.vms, c: 'b' },
              ].map(({ l, v, c }) => (
                <div key={l} className="met">
                  <span className="met-l">{l}</span>
                  <span className={`met-v ${c}`}>{v ?? '–'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="header-right">
          {scanning && scanProgress.total > 0 && (
            <div className="scan-prog">
              <div className="scan-prog-bar">
                <div className="scan-prog-fill" style={{ width: `${Math.round((scanProgress.current / scanProgress.total) * 100)}%` }} />
              </div>
              <span className="scan-prog-label">{scanProgress.node || 'Scan...'}</span>
            </div>
          )}

          <div className={`ws-badge ${wsConnected ? 'on' : 'off'}`}>
            {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {wsConnected ? 'Live' : 'Déconnecté'}
          </div>

          <button className="btn-discover" onClick={onDiscover} disabled={scanning}>
            <Search size={13} /> Découvrir
          </button>

          <button className="btn-scan" onClick={onScan} disabled={scanning}>
            {scanning
              ? <><span className="spin-icon">⟳</span> En cours...</>
              : <>⟳ Scanner tout</>
            }
          </button>

          <button
            onClick={() => setShowConfirm(true)}
            title="Réinitialiser l'inventaire"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 6,
              border: '1px solid rgba(248,113,113,0.3)',
              background: 'rgba(248,113,113,0.08)',
              color: 'var(--red)', cursor: 'pointer', transition: 'all .15s',
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>

      {/* Reset confirmation modal */}
      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 300, backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'var(--bg2)', border: '1px solid rgba(248,113,113,0.4)',
            borderRadius: 12, padding: 24, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <AlertTriangle size={20} color="var(--red)" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                  Réinitialiser l'inventaire
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Cette action est irréversible
                </div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 18 }}>
              Tous les équipements, dépendances et credentials chiffrés seront supprimés.
              Un snapshot de sauvegarde sera conservé dans l'historique.
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={doReset} disabled={resetting}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                  background: 'var(--red)', color: '#fff', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)',
                  opacity: resetting ? 0.6 : 1,
                }}
              >
                {resetting ? '⟳ Réinitialisation...' : '🗑 Oui, tout effacer'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8,
                  border: '1px solid var(--border2)', background: 'var(--bg3)',
                  color: 'var(--text2)', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'var(--mono)',
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
