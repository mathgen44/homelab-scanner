import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { useWebSocket } from './hooks/useWebSocket';
import TopologyView from './components/TopologyView';
import TableView from './components/TableView';
import NodeDetail from './components/NodeDetail';
import ScanTerminal from './components/ScanTerminal';
import DiscoveryWizard from './components/DiscoveryWizard';
import CredentialModal from './components/CredentialModal';
import Header from './components/Header';
import DependencyManager from './components/DependencyManager';

const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}`;

export default function App() {
  const [tab, setTab] = useState('topology');
  const [nodes, setNodes] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [summary, setSummary] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [credRequest, setCredRequest] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, node: '' });

  const addLog = useCallback((entry) => {
    setScanLogs(prev => [...prev.slice(-500), entry]);
  }, []);

  // Full refresh (graph + summary + nodes list)
  const fetchData = useCallback(async () => {
    try {
      const [g, s, n] = await Promise.all([
        fetch(`${API}/api/topology/graph`).then(r => r.json()),
        fetch(`${API}/api/topology/summary`).then(r => r.json()),
        fetch(`${API}/api/inventory/nodes`).then(r => r.json()),
      ]);
      setGraphData(g);
      setSummary(s);
      setNodes(n);
    } catch {}
  }, []);

  // Partial refresh: update a single node in state without full refetch
  const refreshNode = useCallback(async (nodeId) => {
    try {
      const [nodeRes, gRes, sRes] = await Promise.all([
        fetch(`${API}/api/inventory/nodes/${nodeId}`).then(r => r.json()),
        fetch(`${API}/api/topology/graph`).then(r => r.json()),
        fetch(`${API}/api/topology/summary`).then(r => r.json()),
      ]);
      setNodes(prev => prev.map(n => n.id === nodeId ? nodeRes : n)
        .concat(prev.find(n => n.id === nodeId) ? [] : [nodeRes]));
      setGraphData(gRes);
      setSummary(sRes);
      // Update selected node if it's the one that changed
      setSelectedNode(sel => sel?.id === nodeId ? nodeRes : sel);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  const handleWsEvent = useCallback((event) => {
    const { type, node_id, data, message, ts } = event;
    if (message) addLog({ type, node_id, message, ts: ts || new Date().toISOString() });

    switch (type) {
      case 'discovery_start':
        setDiscovering(true);
        break;

      case 'host_found':
        // Refresh immediately when a new host is found
        fetchData();
        break;

      case 'discovery_done':
        setDiscovering(false);
        toast.success(`${data.total} hôte(s) découvert(s)`, { icon: '🔍' });
        fetchData();
        break;

      case 'scan_start':
        setScanning(true);
        if (data.total) setScanProgress(p => ({ ...p, total: data.total, current: 0 }));
        break;

      case 'scan_log':
        // Update progress label with current node being scanned
        if (node_id) setScanProgress(p => ({ ...p, node: data?.name || node_id }));
        break;

      case 'needs_creds':
        setCredRequest({
          node_id,
          ip: data.ip,
          name: data.name,
          hostname: data.hostname,
          vendor: data.vendor,
        });
        toast.error(`Identifiants requis : ${data.name}`, { icon: '🔑', duration: 0 });
        break;

      case 'scan_node_done':
        setScanProgress(p => ({ ...p, current: p.current + 1, node: '' }));
        // Refresh just this node for speed, not the whole inventory
        if (node_id) refreshNode(node_id);
        break;

      case 'scan_done':
        setScanning(false);
        setScanProgress({ current: 0, total: 0, node: '' });
        toast.success('Scan terminé !', { icon: '✅' });
        fetchData();
        break;

      case 'error':
        setScanning(false);
        setDiscovering(false);
        toast.error(message || 'Erreur');
        break;
    }
  }, [addLog, fetchData, refreshNode]);

  const { connected: wsConn, send: wsSend } = useWebSocket(handleWsEvent);
  useEffect(() => { setWsConnected(wsConn); }, [wsConn]);

  const startScan = useCallback(async () => {
    setScanLogs([]);
    setScanProgress({ current: 0, total: 0, node: '' });
    await fetch(`${API}/api/scan/all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    });
  }, []);

  const scanNode = useCallback(async (nodeId) => {
    await fetch(`${API}/api/scan/node/${nodeId}`, { method: 'POST' });
  }, []);

  const submitCredentials = useCallback(async (nodeId, username, password, port) => {
    await fetch(`${API}/api/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: nodeId, username, password, port }),
    });
    toast.success('Identifiants chiffrés (AES-256)', { icon: '🔐' });
    setCredRequest(null);
  }, []);

  const startDiscovery = useCallback(async (ranges, manual_ips) => {
    setScanLogs([]);
    setShowDiscovery(false);
    await fetch(`${API}/api/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranges, manual_ips }),
    });
  }, []);

  // Export inventory
  const exportInventory = useCallback(async (format) => {
    try {
      if (format === 'json') {
        const res = await fetch(`${API}/api/inventory/`);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `homelab-inventory-${dateStr()}.json`);
      } else {
        // Build CSV from nodes
        const res = await fetch(`${API}/api/inventory/nodes`);
        const nodeList = await res.json();
        const headers = ['name', 'ip', 'type', 'status', 'vendor', 'os', 'cpu_cores', 'ram_total_gb', 'disk_total_gb', 'uptime', 'last_scan'];
        const rows = nodeList.map(n => [
          n.name, n.ip, n.type, n.status, n.vendor || '',
          n.hardware?.os || '', n.hardware?.cpu_cores || '',
          n.hardware?.ram_total_gb || '', n.hardware?.disk_total_gb || '',
          n.hardware?.uptime || '', n.last_scan || '',
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        downloadBlob(blob, `homelab-inventory-${dateStr()}.csv`);
      }
      toast.success(`Export ${format.toUpperCase()} téléchargé`, { icon: '📥' });
    } catch {
      toast.error('Erreur lors de l\'export');
    }
  }, [nodes]);

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function dateStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // Update a node (name, type, description) and refresh
  const updateNode = useCallback(async (nodeId, patch) => {
    try {
      const current = nodes.find(n => n.id === nodeId);
      if (!current) return;
      const updated = { ...current, ...patch };
      await fetch(`${API}/api/inventory/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      toast.success('Nœud mis à jour', { icon: '✏️' });
      refreshNode(nodeId);
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  }, [nodes, refreshNode]);

  const TABS = [
    { id: 'topology', label: 'Topologie', emoji: '⬡' },
    { id: 'table', label: 'Inventaire', emoji: '☰' },
    { id: 'dependencies', label: 'Dépendances', emoji: '🔗' },
    { id: 'terminal', label: 'Scan Live', emoji: '⌨', badge: scanLogs.length },
  ];

  return (
    <div className="app">
      <Toaster position="top-right" toastOptions={{
        style: { background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', fontSize: 12, fontFamily: 'var(--mono)' }
      }} />

      <Header
        summary={summary}
        wsConnected={wsConnected}
        scanning={scanning || discovering}
        scanProgress={scanProgress}
        onScan={startScan}
        onDiscover={() => setShowDiscovery(true)}
        onReset={() => { fetchData(); setScanLogs([]); }}
        onExport={exportInventory}
      />

      <nav className="tabs">
        {TABS.map(({ id, label, emoji, badge }) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <span>{emoji}</span> {label}
            {badge > 0 && <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'topology' && (
          <TopologyView
            graphData={graphData}
            onNodeClick={(nd) => {
              if (!nd) { setSelectedNode(null); return; }
              const full = nodes.find(n => n.id === nd.id);
              setSelectedNode(full || nd);
            }}
            onScanNode={scanNode}
          />
        )}
        {tab === 'table' && (
          <TableView nodes={nodes} onNodeClick={setSelectedNode} onScanNode={scanNode} />
        )}
        {tab === 'dependencies' && (
          <DependencyManager nodes={nodes} onApplied={fetchData} />
        )}
        {tab === 'terminal' && (
          <ScanTerminal logs={scanLogs} scanning={scanning || discovering} onClear={() => setScanLogs([])} />
        )}
      </main>

      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onScan={() => scanNode(selectedNode.id)}
          allNodes={nodes}
          onChildClick={(child) => setSelectedNode(child)}
          onUpdate={(patch) => updateNode(selectedNode.id, patch)}
        />
      )}

      {showDiscovery && (
        <DiscoveryWizard onStart={startDiscovery} onClose={() => setShowDiscovery(false)} />
      )}

      {credRequest && (
        <CredentialModal
          nodeId={credRequest.node_id}
          ip={credRequest.ip}
          name={credRequest.name}
          hostname={credRequest.hostname}
          vendor={credRequest.vendor}
          onSubmit={(u, p, port) => submitCredentials(credRequest.node_id, u, p, port)}
          onSkip={() => setCredRequest(null)}
        />
      )}
    </div>
  );
}
