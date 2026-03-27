import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, Scan, ExternalLink } from 'lucide-react';

const TYPE_LABELS = {
  router: 'Routeur', switch: 'Switch', server: 'Serveur', nas: 'NAS',
  vm: 'VM', container: 'Container', camera: 'Caméra', printer: 'Imprimante',
  game_console: 'Console', raspberry_pi: 'Raspberry Pi',
  workstation: 'Workstation', access_point: 'Point d\'accès', unknown: 'Inconnu',
};

function StatusDot({ status }) {
  return <span className={`status-dot ${status}`} />;
}

function UsageCell({ value, label }) {
  if (value == null) return <span style={{ color: 'var(--text3)' }}>–</span>;
  const pct = Math.min(100, Math.round(value));
  const color = pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--yellow)' : 'var(--green)';
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
        <span style={{ color: 'var(--text2)' }}>{label}</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

export default function TableView({ nodes, onNodeClick, onScanNode }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = nodes.filter(n => {
      const q = search.toLowerCase();
      const match = !q ||
        n.name?.toLowerCase().includes(q) ||
        n.ip?.toLowerCase().includes(q) ||
        n.type?.toLowerCase().includes(q) ||
        n.description?.toLowerCase().includes(q);
      const statusMatch = filter === 'all' || n.status === filter;
      return match && statusMatch;
    });

    list.sort((a, b) => {
      let va, vb;
      if (sortKey === 'name') { va = a.name; vb = b.name; }
      else if (sortKey === 'ip') { va = a.ip; vb = b.ip; }
      else if (sortKey === 'type') { va = a.type; vb = b.type; }
      else if (sortKey === 'status') { va = a.status; vb = b.status; }
      else if (sortKey === 'cpu') {
        va = a.hardware?.cpu_usage ?? -1;
        vb = b.hardware?.cpu_usage ?? -1;
      } else if (sortKey === 'ram') {
        va = a.hardware?.ram_percent ?? -1;
        vb = b.hardware?.ram_percent ?? -1;
      }
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [nodes, search, sortKey, sortDir, filter]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronUp size={10} style={{ opacity: 0.2 }} />;
    return sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />;
  }

  const COLS = [
    { key: 'status', label: '', width: 24 },
    { key: 'name', label: 'Nom' },
    { key: 'ip', label: 'IP' },
    { key: 'type', label: 'Type' },
    { key: 'os', label: 'OS' },
    { key: 'cpu', label: 'CPU' },
    { key: 'ram', label: 'RAM' },
    { key: 'containers', label: '🐳' },
    { key: 'vms', label: '⬜ VMs' },
    { key: 'last_scan', label: 'Dernier scan' },
    { key: 'actions', label: '' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: 10,
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={13} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text3)', pointerEvents: 'none',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={{
              width: '100%',
              background: 'var(--bg3)',
              border: '1px solid var(--border2)',
              borderRadius: 6,
              padding: '6px 10px 6px 28px',
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'var(--mono)',
              outline: 'none',
            }}
          />
        </div>
        {['all', 'online', 'offline', 'unknown'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border2)',
              background: filter === f ? 'rgba(56,189,248,0.1)' : 'var(--bg3)',
              color: filter === f ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'var(--mono)',
            }}
          >
            {f === 'all' ? 'Tous' : f === 'online' ? '🟢 En ligne' : f === 'offline' ? '🔴 Hors ligne' : '⚫ Inconnu'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 11 }}>
          {filtered.length} / {nodes.length} équipements
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', position: 'sticky', top: 0, zIndex: 1 }}>
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => ['name','ip','type','status','cpu','ram'].includes(col.key) && toggleSort(col.key)}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 10,
                    color: 'var(--text3)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    borderBottom: '1px solid var(--border)',
                    cursor: ['name','ip','type','status','cpu','ram'].includes(col.key) ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    width: col.width || undefined,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {col.label}
                    {['name','ip','type','status','cpu','ram'].includes(col.key) && <SortIcon col={col.key} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((node, i) => (
              <TableRow
                key={node.id}
                node={node}
                even={i % 2 === 0}
                onClick={() => onNodeClick(node)}
                onScan={() => onScanNode(node.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLS.length} style={{
                  textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: 13,
                }}>
                  Aucun équipement trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableRow({ node, even, onClick, onScan }) {
  const [hover, setHover] = useState(false);

  const lastScan = node.last_scan
    ? new Date(node.last_scan).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : '–';

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'var(--bg3)' : even ? 'var(--bg)' : 'rgba(16,19,26,0.5)',
        cursor: 'pointer',
        transition: 'background 0.1s',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <td style={{ padding: '8px 12px' }}>
        <StatusDot status={node.status} />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>{node.name}</div>
        {node.description && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{node.description}</div>
        )}
      </td>
      <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>
        {node.ip}
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span style={{
          fontSize: 10,
          padding: '2px 7px',
          borderRadius: 4,
          background: 'var(--bg3)',
          border: '1px solid var(--border2)',
          color: 'var(--text2)',
          whiteSpace: 'nowrap',
        }}>
          {TYPE_LABELS[node.type] || node.type}
        </span>
      </td>
      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text2)', maxWidth: 160 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.hardware?.os || '–'}
        </div>
      </td>
      <td style={{ padding: '8px 12px', minWidth: 90 }}>
        <UsageCell value={node.hardware?.cpu_usage} label="CPU" />
      </td>
      <td style={{ padding: '8px 12px', minWidth: 90 }}>
        <UsageCell value={node.hardware?.ram_percent} label="RAM" />
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
        {node.docker_containers?.length > 0
          ? <span style={{ color: '#06b6d4', fontWeight: 600 }}>{node.docker_containers.length}</span>
          : <span style={{ color: 'var(--text3)' }}>–</span>
        }
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
        {node.virtual_machines?.length > 0
          ? <span style={{ color: '#14b8a6', fontWeight: 600 }}>{node.virtual_machines.length}</span>
          : <span style={{ color: 'var(--text3)' }}>–</span>
        }
      </td>
      <td style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
        {lastScan}
      </td>
      <td style={{ padding: '8px 8px' }}>
        <button
          onClick={e => { e.stopPropagation(); onScan(); }}
          title="Scanner ce nœud"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid var(--border2)',
            background: hover ? 'var(--bg3)' : 'transparent',
            color: 'var(--text2)',
            cursor: 'pointer',
            transition: 'all 0.1s',
          }}
        >
          <Scan size={12} />
        </button>
      </td>
    </tr>
  );
}
