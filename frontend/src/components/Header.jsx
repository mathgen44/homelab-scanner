import React from 'react';
import { Search, Wifi, WifiOff } from 'lucide-react';

export default function Header({ summary, wsConnected, scanning, scanProgress, onScan, onDiscover }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">🖥 Homelab<strong>Inventory</strong></div>
        {summary && (
          <div className="metrics">
            {[
              { l: 'Total', v: summary.total, c: '' },
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
      </div>
    </header>
  );
}
