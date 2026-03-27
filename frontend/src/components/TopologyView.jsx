import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import HomelabNode from './HomelabNode';

const nodeTypes = { homelabNode: HomelabNode };

export default function TopologyView({ graphData, onNodeClick, onScanNode }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(graphData.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphData.edges || []);

  // Sync when graphData changes
  React.useEffect(() => {
    setNodes(graphData.nodes || []);
    setEdges(graphData.edges || []);
  }, [graphData, setNodes, setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClickHandler = useCallback((event, node) => {
    onNodeClick?.(node.data);
  }, [onNodeClick]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClickHandler}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        style={{ background: 'var(--bg)' }}
      >
        <Background
          color="#1e2736"
          gap={24}
          size={1}
          variant="dots"
        />
        <Controls
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        />
        <MiniMap
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
          }}
          nodeColor={(node) => node.data?.color || '#6b7280'}
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 10,
        color: 'var(--text2)',
        zIndex: 10,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)', fontSize: 11 }}>Légende</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { color: 'var(--green)', label: 'En ligne' },
            { color: 'var(--red)', label: 'Hors ligne' },
            { color: 'var(--text3)', label: 'Inconnu' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
