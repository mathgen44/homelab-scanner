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

const API = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

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

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15000);
    return () => clearInterval(t);
  }, [fetchData]);

  const handleWsEvent = useCallback((event) => {
    const { type, node_id, data, message, ts } = event;
    if (message) addLog({ type, node_id, message, ts: ts || new Date().toISOString() });

    switch (type) {
      case 'discovery_start': setDiscovering(true); break;
      case 'host_found':
        toast.success(`Hôte : ${data.ip}${data.hostname ? ` (${data.hostname})` : ''}`, { duration: 2000 });
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
        if (node_id) setScanProgress(p => ({ ...p, node: data.name || node_id }));
        break;
      case 'needs_creds':
        setCredRequest({ node_id, ip: data.ip, name: data.name });
        toast.error(`Identifiants requis : ${data.name}`, { icon: '🔑', duration: 0 });
        break;
      case 'scan_node_done':
        setScanProgress(p => ({ ...p, current: p.current + 1 }));
        fetchData();
        if (selectedNode?.id === node_id && data.node) setSelectedNode(data.node);
        break;
      case 'scan_done':
        setScanning(false);
        toast.success('Scan terminé !', { icon: '✅' });
        fetchData();
        break;
      case 'error':
        setScanning(false); setDiscovering(false);
        toast.error(message || 'Erreur');
        break;
    }
  }, [addLog, fetchData, selectedNode]);

  const { connected: wsConn, send: wsSend } = useWebSocket(handleWsEvent);
  useEffect(() => { setWsConnected(wsConn); }, [wsConn]);

  const startScan = useCallback(async () => {
    setScanLogs([]);
    await fetch(`${API}/api/scan/all`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
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

  const TABS = [
    { id: 'topology', label: 'Topologie', emoji: '⬡' },
    { id: 'table', label: 'Inventaire', emoji: '☰' },
    { id: 'terminal', label: 'Scan Live', emoji: '⌨', badge: scanLogs.length },
  ];

  return (
    <div className="app">
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', fontSize: 12, fontFamily: 'var(--mono)' } }} />
      <Header summary={summary} wsConnected={wsConnected} scanning={scanning || discovering}
        scanProgress={scanProgress} onScan={startScan} onDiscover={() => setShowDiscovery(true)} />
      <nav className="tabs">
        {TABS.map(({ id, label, emoji, badge }) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <span>{emoji}</span> {label}
            {badge > 0 && <span className="tab-badge">{badge > 99 ? '99+' : badge}</span>}
          </button>
        ))}
      </nav>
      <main className="main">
        {tab === 'topology' && <TopologyView graphData={graphData} onNodeClick={setSelectedNode} onScanNode={scanNode} />}
        {tab === 'table' && <TableView nodes={nodes} onNodeClick={setSelectedNode} onScanNode={scanNode} />}
        {tab === 'terminal' && <ScanTerminal logs={scanLogs} scanning={scanning || discovering} onClear={() => setScanLogs([])} />}
      </main>
      {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} onScan={() => scanNode(selectedNode.id)} />}
      {showDiscovery && <DiscoveryWizard onStart={startDiscovery} onClose={() => setShowDiscovery(false)} />}
      {credRequest && <CredentialModal nodeId={credRequest.node_id} ip={credRequest.ip} name={credRequest.name}
        onSubmit={(u, p, port) => submitCredentials(credRequest.node_id, u, p, port)} onSkip={() => setCredRequest(null)} />}
    </div>
  );
}
