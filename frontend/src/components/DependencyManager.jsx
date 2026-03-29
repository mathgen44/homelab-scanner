import React, { useState, useEffect, useCallback } from 'react';
import { GitBranch, Zap, ChevronRight, Check, X, RefreshCw, Link, Unlink, Box } from 'lucide-react';
import toast from 'react-hot-toast';

const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}`;

const TYPE_ICONS = {
  router:'🌐', switch:'🔀', server:'🖥️', nas:'💾', vm:'⬜', lxc:'📦',
  container:'🐳', camera:'📷', printer:'🖨️', game_console:'🎮',
  raspberry_pi:'🍓', workstation:'💻', access_point:'📡', unknown:'❓',
};

export default function DependencyManager({ nodes, onApplied }) {
  const [suggestions, setSuggestions] = useState({});
  const [gatewayId, setGatewayId] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selected, setSelected] = useState({}); // node_id → true/false
  const [manualMode, setManualMode] = useState(null); // node_id en cours d'édition
  const [manualParent, setManualParent] = useState('');

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  // Nodes with docker containers (hosts)
  const dockerHosts = nodes.filter(n => n.docker_containers?.length > 0);
  // Existing container nodes
  const containerNodes = nodes.filter(n => n.type === 'container' || n.type === 'compose_group');

  async function promoteAllContainers() {
    setApplying(true);
    try {
      const res = await fetch(`${API}/api/containers/promote`, { method: 'POST' });
      const data = await res.json();
      toast.success(`${data.nodes_created} nœud(s) container créés !`, { icon: '🐳' });
      onApplied?.();
      fetchSuggestions();
    } catch (e) {
      toast.error('Erreur lors de la promotion');
    } finally {
      setApplying(false);
    }
  }

  async function promoteHostContainers(hostId, hostName) {
    try {
      const res = await fetch(`${API}/api/containers/promote/${hostId}`, { method: 'POST' });
      const data = await res.json();
      toast.success(`${data.nodes_created} nœud(s) créés pour ${hostName}`, { icon: '🐳' });
      onApplied?.();
    } catch (e) {
      toast.error('Erreur');
    }
  }

  async function removeContainerNodes(hostId, hostName) {
    try {
      await fetch(`${API}/api/containers/nodes/${hostId}`, { method: 'DELETE' });
      toast.success(`Nœuds containers supprimés pour ${hostName}`);
      onApplied?.();
    } catch (e) {
      toast.error('Erreur');
    }
  }

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/dependencies/suggest`);
      const data = await res.json();
      setSuggestions(data.suggestions || {});
      setGatewayId(data.gateway_id);
      setStats(data.stats);
      // Pré-sélectionner toutes les suggestions
      const sel = {};
      Object.keys(data.suggestions || {}).forEach(k => { sel[k] = true; });
      setSelected(sel);
    } catch (e) {
      toast.error('Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  async function applySelected() {
    const toApply = Object.fromEntries(
      Object.entries(suggestions).filter(([k]) => selected[k])
    );
    if (Object.keys(toApply).length === 0) {
      toast.error('Aucune suggestion sélectionnée');
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`${API}/api/dependencies/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toApply),
      });
      const data = await res.json();
      toast.success(`${data.applied} lien(s) appliqué(s) !`, { icon: '🔗' });
      onApplied?.();
      fetchSuggestions();
    } catch (e) {
      toast.error('Erreur lors de l\'application');
    } finally {
      setApplying(false);
    }
  }

  async function setManualParentFn(nodeId, parentId) {
    try {
      const url = parentId
        ? `${API}/api/dependencies/node/${nodeId}?parent_id=${parentId}`
        : `${API}/api/dependencies/node/${nodeId}`;
      await fetch(url, { method: 'PATCH' });
      toast.success('Lien mis à jour');
      setManualMode(null);
      onApplied?.();
      fetchSuggestions();
    } catch (e) {
      toast.error('Erreur');
    }
  }

  async function removeParent(nodeId) {
    await setManualParentFn(nodeId, null);
  }

  const suggestionEntries = Object.entries(suggestions);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  function NodeLabel({ id }) {
    const n = nodeMap[id];
    if (!n) return <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{id}</span>;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>{TYPE_ICONS[n.type] || '❓'}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{n.name}</div>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{n.ip}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={16} color="var(--accent)" />
            <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15 }}>Gestion des dépendances</span>
          </div>
          <button onClick={fetchSuggestions} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}>
            <RefreshCw size={12} className={loading ? 'spin' : ''} /> Analyser
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
            <span style={{ color: 'var(--text3)' }}>
              <span style={{ color: 'var(--text)' }}>{stats.total_nodes}</span> équipements
            </span>
            <span style={{ color: 'var(--text3)' }}>
              <span style={{ color: 'var(--green)' }}>{suggestionEntries.length}</span> liens suggérés
            </span>
            {gatewayId && nodeMap[gatewayId] && (
              <span style={{ color: 'var(--text3)' }}>
                Gateway : <span style={{ color: 'var(--accent)' }}>{nodeMap[gatewayId]?.name}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>

        {/* ── Docker Containers ── */}
        {dockerHosts.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Box size={13} color="#06b6d4" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                  Containers Docker détectés
                </span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                  {dockerHosts.reduce((a, n) => a + n.docker_containers.length, 0)} containers sur {dockerHosts.length} hôte(s)
                </span>
              </div>
              <button onClick={promoteAllContainers} disabled={applying}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
                  border: 'none', background: '#06b6d4', color: '#000', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', opacity: applying ? 0.6 : 1 }}>
                🐳 Tout promouvoir en nœuds
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dockerHosts.map(host => {
                // Grouper par compose project
                const byProject = {};
                host.docker_containers.forEach(c => {
                  const key = c.compose_project || '(standalone)';
                  if (!byProject[key]) byProject[key] = [];
                  byProject[key].push(c);
                });
                const alreadyPromoted = containerNodes.some(n =>
                  n.id.startsWith(`ctr_${host.id}_`) || n.id.startsWith(`compose_${host.id}_`)
                );

                return (
                  <div key={host.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {/* Host header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>🖥️</span>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{host.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--mono)', marginLeft: 8 }}>{host.ip}</span>
                        </div>
                        {alreadyPromoted && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(52,211,153,0.1)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.25)' }}>
                            ✓ Promu
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => promoteHostContainers(host.id, host.name)}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', background: '#06b6d4', color: '#000', cursor: 'pointer', fontWeight: 600 }}>
                          🐳 Promouvoir
                        </button>
                        {alreadyPromoted && (
                          <button onClick={() => removeContainerNodes(host.id, host.name)}
                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: 'var(--red)', cursor: 'pointer' }}>
                            Retirer
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Containers grouped by project */}
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(byProject).map(([project, containers]) => (
                        <div key={project}>
                          <div style={{ fontSize: 10, color: '#06b6d4', fontWeight: 600, marginBottom: 4 }}>
                            📦 {project}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12 }}>
                            {containers.map(c => {
                              const running = c.status?.toLowerCase().includes('up');
                              return (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: running ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} />
                                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.name}</span>
                                  <span style={{ color: 'var(--text3)', fontSize: 10, fontFamily: 'var(--mono)' }}>{c.image.split(':')[0]}</span>
                                  {c.ports?.length > 0 && (
                                    <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                                      {c.ports.slice(0, 2).join(', ')}{c.ports.length > 2 ? '...' : ''}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Suggestions auto ── */}
        {suggestionEntries.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={13} color="var(--yellow)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                  Liens détectés automatiquement
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setSelected(Object.fromEntries(suggestionEntries.map(([k]) => [k, true])))}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
                  Tout sélectionner
                </button>
                <button onClick={() => setSelected({})}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer' }}>
                  Tout désélectionner
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {suggestionEntries.map(([nodeId, parentId]) => {
                const isSelected = selected[nodeId] !== false;
                const isProxmoxLink = nodeMap[parentId]?.scanned_layers?.includes('proxmox');
                return (
                  <div key={nodeId} onClick={() => setSelected(s => ({ ...s, [nodeId]: !s[nodeId] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: isSelected ? 'rgba(56,189,248,0.06)' : 'var(--bg3)',
                      border: `1px solid ${isSelected ? 'rgba(56,189,248,0.25)' : 'var(--border)'}`,
                      transition: 'all 0.1s',
                    }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      background: isSelected ? 'var(--accent)' : 'var(--bg)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <Check size={11} color="#000" />}
                    </div>

                    <NodeLabel id={parentId} />

                    <ChevronRight size={14} color="var(--text3)" style={{ flexShrink: 0 }} />

                    <NodeLabel id={nodeId} />

                    {isProxmoxLink && (
                      <span style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3,
                        background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.25)' }}>
                        Proxmox VM
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={applySelected} disabled={applying || selectedCount === 0}
              style={{
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
                borderRadius: 8, border: 'none', cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                background: selectedCount === 0 ? 'var(--bg3)' : 'var(--accent)', color: selectedCount === 0 ? 'var(--text3)' : '#000',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)',
                opacity: applying ? 0.7 : 1,
              }}>
              <Link size={14} />
              {applying ? 'Application...' : `Appliquer ${selectedCount} lien(s) sélectionné(s)`}
            </button>
          </div>
        )}

        {suggestionEntries.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 12 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            Toutes les dépendances sont déjà configurées
          </div>
        )}

        {/* Liens existants */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Link size={13} color="var(--green)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
              Liens existants
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nodes.filter(n => n.parent_id).map(node => (
              <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <NodeLabel id={node.parent_id} />
                <ChevronRight size={12} color="var(--green)" style={{ flexShrink: 0 }} />
                <NodeLabel id={node.id} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                  <button onClick={() => { setManualMode(node.id); setManualParent(node.parent_id || ''); }}
                    style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text2)', cursor: 'pointer' }}>
                    Changer
                  </button>
                  <button onClick={() => removeParent(node.id)}
                    style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: 'var(--red)', cursor: 'pointer' }}>
                    <Unlink size={10} />
                  </button>
                </div>
              </div>
            ))}
            {nodes.filter(n => n.parent_id).length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>Aucun lien configuré</div>
            )}
          </div>
        </div>

        {/* Nœuds sans parent */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Unlink size={13} color="var(--text3)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
              Sans lien parent
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nodes.filter(n => !n.parent_id).map(node => (
              <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                borderRadius: 7, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <NodeLabel id={node.id} />
                <div style={{ marginLeft: 'auto' }}>
                  {manualMode === node.id ? (
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <select value={manualParent} onChange={e => setManualParent(e.target.value)}
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 5,
                          color: 'var(--text)', fontSize: 11, padding: '3px 6px', fontFamily: 'var(--mono)' }}>
                        <option value="">-- Aucun parent --</option>
                        {nodes.filter(n => n.id !== node.id).map(n => (
                          <option key={n.id} value={n.id}>{n.name} ({n.ip})</option>
                        ))}
                      </select>
                      <button onClick={() => setManualParentFn(node.id, manualParent || null)}
                        style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', fontSize: 11 }}>
                        <Check size={11} />
                      </button>
                      <button onClick={() => setManualMode(null)}
                        style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text3)', cursor: 'pointer' }}>
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setManualMode(node.id); setManualParent(''); }}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border2)',
                        background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Link size={10} /> Lier
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
