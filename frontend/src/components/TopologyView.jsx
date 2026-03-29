import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import HomelabNode from './HomelabNode';

const nodeTypes = { homelabNode: HomelabNode };

function getSubtreeIds(nodeId, allNodes) {
  const childMap = {};
  allNodes.forEach(n => {
    const pid = n.data?.parent_id;
    if (pid) {
      if (!childMap[pid]) childMap[pid] = [];
      childMap[pid].push(n.id);
    }
  });
  const result = new Set([nodeId]);
  const queue = [nodeId];
  while (queue.length) {
    const cur = queue.shift();
    (childMap[cur] || []).forEach(c => {
      if (!result.has(c)) { result.add(c); queue.push(c); }
    });
  }
  return result;
}

function getAncestorIds(nodeId, allNodes) {
  const parentMap = {};
  allNodes.forEach(n => { if (n.data?.parent_id) parentMap[n.id] = n.data.parent_id; });
  const result = new Set();
  let cur = parentMap[nodeId];
  while (cur) { result.add(cur); cur = parentMap[cur]; }
  return result;
}

function TopologyInner({ graphData, onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const { fitView, zoomTo, getViewport } = useReactFlow();
  const rawRef = useRef({ nodes: [], edges: [] });
  const prevCountRef = useRef(0);

  useEffect(() => {
    const raw = graphData.nodes || [];
    const rawE = graphData.edges || [];
    rawRef.current = { nodes: raw, edges: rawE };

    if (selectedId) {
      applyHighlight(raw, rawE, selectedId);
    } else {
      setNodes(raw.map(n => ({ ...n, style: {} })));
      setEdges(rawE.map(e => ({
        ...e,
        animated: e.animated ?? false,
        style: { ...e.style, opacity: 0.7 },
      })));
    }

    // fitView whenever node count changes (new nodes added during scan)
    if (raw.length !== prevCountRef.current) {
      prevCountRef.current = raw.length;
      setTimeout(() => fitView({ padding: 0.12, duration: 500 }), 100);
    }
  }, [graphData]);

  function applyHighlight(rawNodes, rawEdges, selId) {
    const subtree = getSubtreeIds(selId, rawNodes);
    const ancestors = getAncestorIds(selId, rawNodes);
    const highlighted = new Set([...subtree, ...ancestors]);

    setNodes(rawNodes.map(n => ({
      ...n,
      style: {
        opacity: highlighted.has(n.id) ? 1 : 0.12,
        transition: 'opacity 0.25s ease',
        filter: highlighted.has(n.id) ? 'none' : 'grayscale(80%)',
      },
    })));

    setEdges(rawEdges.map(e => {
      const inSubtree = subtree.has(e.source) && subtree.has(e.target);
      const inPath = highlighted.has(e.source) && highlighted.has(e.target);
      return {
        ...e,
        animated: inSubtree,
        style: {
          ...e.style,
          stroke: inSubtree ? e.style?.stroke : '#1e2736',
          strokeWidth: inSubtree ? 3 : 1,
          opacity: inPath ? 1 : 0.06,
        },
      };
    }));
  }

  function clearHighlight() {
    const { nodes: rawN, edges: rawE } = rawRef.current;
    setSelectedId(null);
    setNodes(rawN.map(n => ({ ...n, style: {} })));
    setEdges(rawE.map(e => ({
      ...e,
      animated: false,
      style: { ...e.style, opacity: 0.7, strokeWidth: 2 },
    })));
  }

  const handleNodeClick = useCallback((_, node) => {
    if (selectedId === node.id) {
      clearHighlight();
      onNodeClick?.(null);
      return;
    }
    setSelectedId(node.id);
    applyHighlight(rawRef.current.nodes, rawRef.current.edges, node.id);
    onNodeClick?.(node.data);
  }, [selectedId]);

  const handlePaneClick = useCallback(() => {
    clearHighlight();
    onNodeClick?.(null);
  }, []);

  // Click on minimap → reset zoom to fit all
  const handleMinimapClick = useCallback(() => {
    fitView({ padding: 0.12, duration: 600 });
  }, [fitView]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick} onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.12 }}
        minZoom={0.04} maxZoom={2.5}
        style={{ background: 'var(--bg)' }}
        nodesConnectable={false}
      >
        <Background color="#1e2736" gap={24} size={1} variant="dots" />
        <Controls
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}
        />
        <MiniMap
          onClick={handleMinimapClick}
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
          nodeColor={n => n.data?.color || '#6b7280'}
          maskColor="rgba(0,0,0,0.65)"
        />
      </ReactFlow>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 10,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px', fontSize: 10, color: 'var(--text2)',
        pointerEvents: 'none',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--text)', fontSize: 11 }}>Légende</div>
        {[
          ['var(--green)', 'En ligne'],
          ['var(--red)', 'Hors ligne'],
          ['var(--yellow)', 'Scan en cours'],
          ['var(--text3)', 'Inconnu'],
        ].map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
        {selectedId && (
          <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)', color: 'var(--accent)' }}>
            Clic espace vide pour désélectionner
          </div>
        )}
        <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)', color: 'var(--text3)' }}>
          Clic minimap → zoom global
        </div>
      </div>
    </div>
  );
}

export default function TopologyView(props) {
  return (
    <ReactFlowProvider>
      <TopologyInner {...props} />
    </ReactFlowProvider>
  );
}
