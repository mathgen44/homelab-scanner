import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const TYPE_LABELS = {
  router:'Routeur',switch:'Switch',server:'Serveur',nas:'NAS',
  vm:'VM',lxc:'LXC',container:'Container',camera:'Caméra',
  printer:'Imprimante',game_console:'Console',raspberry_pi:'Raspberry Pi',
  workstation:'Station',access_point:'AP',unknown:'Inconnu',
};
const STATUS_COLOR = {online:'#34d399',offline:'#f87171',scanning:'#fbbf24',needs_creds:'#f59e0b',unknown:'#4a5568'};

function MiniBar({ label, value }) {
  if (value == null) return null;
  const pct = Math.min(100, Math.round(value));
  const color = pct > 85 ? '#f87171' : pct > 60 ? '#fbbf24' : '#34d399';
  return (
    <div style={{marginTop:2}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a5568',marginBottom:1}}>
        <span>{label}</span><span style={{color}}>{pct}%</span>
      </div>
      <div style={{height:3,background:'#1e2736',borderRadius:2,overflow:'hidden'}}>
        <div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:2}}/>
      </div>
    </div>
  );
}

const HomelabNode = memo(({ data, selected }) => {
  const { label,ip,type,status,icon,color,hardware,containers_count,vms_count,
    services_count,has_credentials,scan_error,scanned_layers=[] } = data;
  const statusColor = STATUS_COLOR[status]||'#4a5568';
  const isScanning = status==='scanning', needsCreds = status==='needs_creds';

  return (
    <div style={{background:'#10131a',border:`1.5px solid ${selected?color:needsCreds?'#f59e0b':'#1e2736'}`,
      borderRadius:10,padding:'9px 11px',minWidth:158,maxWidth:195,
      boxShadow:selected?`0 0 0 2px ${color}33,0 4px 20px rgba(0,0,0,0.5)`:'0 2px 12px rgba(0,0,0,0.4)',
      cursor:'pointer',transition:'all 0.15s',position:'relative',opacity:status==='offline'?0.65:1}}>
      <Handle type="target" position={Position.Top} style={{background:color,border:'none',width:7,height:7}}/>
      <div style={{position:'absolute',top:8,right:8,width:7,height:7,borderRadius:'50%',background:statusColor,
        boxShadow:status==='online'?`0 0 5px ${statusColor}`:'none',
        animation:isScanning?'pulse 0.8s infinite':'none'}}/>
      <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:5}}>
        <div style={{width:27,height:27,borderRadius:6,flexShrink:0,background:`${color}20`,
          border:`1px solid ${color}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>
          {icon}
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontWeight:700,fontSize:11,color:'#e2e8f0',fontFamily:'Syne,sans-serif',
            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</div>
          <div style={{fontSize:10,color,fontFamily:'JetBrains Mono,monospace'}}>{ip}</div>
        </div>
      </div>
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:5}}>
        <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:`${color}18`,color,
          border:`1px solid ${color}30`,textTransform:'uppercase',letterSpacing:0.4}}>
          {TYPE_LABELS[type]||type}
        </span>
        {needsCreds&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(245,158,11,0.15)',
          color:'#f59e0b',border:'1px solid rgba(245,158,11,0.3)',animation:'pulse 1s infinite'}}>🔑 Auth</span>}
        {isScanning&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(251,191,36,0.15)',
          color:'#fbbf24',border:'1px solid rgba(251,191,36,0.3)'}}>⟳ Scan</span>}
      </div>
      {hardware&&<div>
        <MiniBar label="CPU" value={hardware.cpu_usage}/>
        <MiniBar label="RAM" value={hardware.ram_percent}/>
        {hardware.temperature!=null&&<div style={{fontSize:9,color:'#4a5568',marginTop:2}}>🌡 {hardware.temperature}°C</div>}
      </div>}
      {(containers_count>0||vms_count>0||services_count>0)&&(
        <div style={{display:'flex',gap:3,marginTop:6,flexWrap:'wrap'}}>
          {containers_count>0&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(6,182,212,0.12)',color:'#06b6d4',border:'1px solid rgba(6,182,212,0.25)'}}>🐳 {containers_count}</span>}
          {vms_count>0&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(20,184,166,0.12)',color:'#14b8a6',border:'1px solid rgba(20,184,166,0.25)'}}>⬜ {vms_count}</span>}
          {services_count>0&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(167,139,250,0.12)',color:'#a78bfa',border:'1px solid rgba(167,139,250,0.25)'}}>⚡ {services_count}</span>}
        </div>
      )}
      {scanned_layers.length>0&&(
        <div style={{display:'flex',gap:2,marginTop:4,flexWrap:'wrap'}}>
          {scanned_layers.map(l=><span key={l} style={{fontSize:8,padding:'0 4px',borderRadius:2,background:'#161b25',color:'#4a5568',border:'1px solid #1e2736'}}>{l}</span>)}
        </div>
      )}
      {scan_error&&<div style={{marginTop:4,fontSize:9,color:'#f87171',background:'rgba(248,113,113,0.08)',padding:'2px 5px',borderRadius:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>⚠ {scan_error}</div>}
      {!has_credentials&&status!=='offline'&&<div style={{marginTop:4,fontSize:9,color:'#4a5568'}}>🔒 Sans credentials</div>}
      <Handle type="source" position={Position.Bottom} style={{background:color,border:'none',width:7,height:7}}/>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
});

HomelabNode.displayName='HomelabNode';
export default HomelabNode;
