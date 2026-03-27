import React, { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

const TYPE_COLORS = {
  host_found: '#34d399',
  needs_creds: '#fbbf24',
  scan_node_done: '#38bdf8',
  discovery_done: '#a78bfa',
  scan_done: '#34d399',
  error: '#f87171',
  scan_log: '#8899aa',
  scan_start: '#38bdf8',
  discovery_start: '#a78bfa',
};

const TYPE_PREFIX = {
  host_found: '[FOUND]',
  needs_creds: '[AUTH] ',
  scan_node_done: '[DONE] ',
  discovery_done: '[DONE] ',
  scan_done: '[DONE] ',
  error: '[ERR]  ',
  scan_log: '[LOG]  ',
  scan_start: '[START]',
  discovery_start: '[START]',
};

function formatTs(ts) {
  try {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
}

export default function ScanTerminal({ logs, scanning, onClear }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 14 }}>Scan Live</span>
          {scanning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />
              En cours...
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{logs.length} entrée(s)</span>
        </div>
        <button className="btn-icon" onClick={onClear} title="Vider le terminal">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Terminal */}
      <div style={{
        flex: 1, overflow: 'auto',
        background: '#080a0f',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        padding: '12px 16px',
        lineHeight: 1.7,
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#2d3748', textAlign: 'center', marginTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⌨</div>
            <div>En attente d'un scan...</div>
            <div style={{ fontSize: 10, marginTop: 6 }}>Lancez une découverte ou un scan depuis le header</div>
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ color: '#2d3748', flexShrink: 0, fontSize: 10, paddingTop: 2 }}>
                {formatTs(log.ts)}
              </span>
              <span style={{ color: TYPE_COLORS[log.type] || '#8899aa', flexShrink: 0, fontSize: 10, paddingTop: 2, minWidth: 52 }}>
                {TYPE_PREFIX[log.type] || '[INFO] '}
              </span>
              {log.node_id && (
                <span style={{ color: '#38bdf8', flexShrink: 0, fontSize: 10, paddingTop: 2, opacity: 0.6 }}>
                  {log.node_id.replace('node_', '').replace(/_/g, '.')}
                </span>
              )}
              <span style={{ color: TYPE_COLORS[log.type] || '#e2e8f0', wordBreak: 'break-word' }}>
                {log.message}
              </span>
            </div>
          ))
        )}
        {scanning && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--accent)', marginTop: 4 }}>
            <span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  );
}
