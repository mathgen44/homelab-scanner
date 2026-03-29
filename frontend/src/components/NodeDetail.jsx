import React, { useState } from 'react';
import { X, Scan, ChevronDown, ChevronRight, Shield, Trash2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}`;
const STATUS_COLORS = { online:'#34d399',offline:'#f87171',scanning:'#fbbf24',needs_creds:'#f59e0b',unknown:'#4a5568' };
const STATUS_LABELS = { online:'En ligne',offline:'Hors ligne',scanning:'Scan en cours',needs_creds:'Auth requise',unknown:'Inconnu' };
const TYPE_ICONS = { router:'🌐',switch:'🔀',server:'🖥️',nas:'💾',vm:'⬜',lxc:'📦',container:'🐳',compose_group:'📦',camera:'📷',printer:'🖨️',game_console:'🎮',raspberry_pi:'🍓',workstation:'💻',access_point:'📡',unknown:'❓' };
const LAYER_LABELS = { network:'Réseau',ssh:'SSH',docker:'Docker',proxmox:'Proxmox',synology:'Synology',services:'Services' };

function Section({ title, icon, count, children, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{borderBottom:'1px solid #1e2736'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:'9px 14px',background:'none',border:'none',cursor:'pointer',color:'#4a5568',fontSize:10,fontFamily:'JetBrains Mono,monospace',fontWeight:700,textTransform:'uppercase',letterSpacing:.5}}>
        {open?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
        {icon} {title}
        {count!=null&&<span style={{marginLeft:'auto',background:'#161b25',border:'1px solid #1e2736',borderRadius:10,padding:'0 6px',fontSize:9,color:'#8899aa'}}>{count}</span>}
      </button>
      {open&&<div style={{padding:'0 14px 12px'}}>{children}</div>}
    </div>
  );
}
function KV({label,value,mono}){
  if(!value&&value!==0)return null;
  return(<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,marginBottom:4}}><span style={{color:'#4a5568',fontSize:11,flexShrink:0}}>{label}</span><span style={{color:'#e2e8f0',fontSize:11,fontFamily:mono?'JetBrains Mono,monospace':undefined,textAlign:'right',wordBreak:'break-all'}}>{value}</span></div>);
}
function UBar({label,value}){
  if(value==null)return null;
  const pct=Math.min(100,Math.round(value));
  const color=pct>85?'#f87171':pct>60?'#fbbf24':'#34d399';
  return(<div style={{marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:11,color:'#8899aa'}}>{label}</span><span style={{fontSize:11,color,fontWeight:600}}>{pct}%</span></div><div style={{height:4,background:'#1e2736',borderRadius:2,overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:2,transition:'width .3s'}}/></div></div>);
}

function DockerSection({ containers }) {
  // Group by compose project
  const groups = {};
  containers.forEach(c => {
    const key = c.compose_project || '__standalone__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  const runningTotal = containers.filter(c => c.status?.toLowerCase().includes('up')).length;

  return (
    <div>
      {/* Summary bar */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,padding:'6px 8px',borderRadius:6,background:'rgba(6,182,212,0.06)',border:'1px solid rgba(6,182,212,0.15)'}}>
        <span style={{fontSize:11,color:'#06b6d4'}}>
          <span style={{fontWeight:700}}>{runningTotal}</span>
          <span style={{color:'#4a5568'}}> / {containers.length} actifs</span>
        </span>
        <div style={{flex:1,height:3,background:'#1e2736',borderRadius:2,overflow:'hidden'}}>
          <div style={{width:`${Math.round((runningTotal/containers.length)*100)}%`,height:'100%',background:'#06b6d4',borderRadius:2}}/>
        </div>
      </div>

      {/* Groups */}
      {Object.entries(groups).map(([project, ctrs]) => (
        <div key={project} style={{marginBottom:8}}>
          {/* Project header */}
          {project !== '__standalone__' && (
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,padding:'4px 8px',borderRadius:5,background:'rgba(56,189,248,0.06)',border:'1px solid rgba(56,189,248,0.15)'}}>
              <span style={{fontSize:12}}>📦</span>
              <span style={{fontSize:11,fontWeight:700,color:'#38bdf8',fontFamily:'var(--sans)'}}>{project}</span>
              <span style={{marginLeft:'auto',fontSize:9,color:'#4a5568'}}>{ctrs.length} service{ctrs.length>1?'s':''}</span>
            </div>
          )}
          {project === '__standalone__' && ctrs.length > 0 && (
            <div style={{fontSize:10,color:'#4a5568',marginBottom:5,paddingLeft:4}}>Containers standalone</div>
          )}

          {/* Container cards */}
          <div style={{display:'flex',flexDirection:'column',gap:4,paddingLeft: project!=='__standalone__'?8:0}}>
            {ctrs.map(c => {
              const run = c.status?.toLowerCase().includes('up');
              const [imgName, imgTag] = (c.image||'').split(':');
              return (
                <div key={c.id} style={{
                  borderRadius:6,background:'#0d1117',
                  border:`1px solid ${run?'rgba(52,211,153,0.2)':'rgba(248,113,113,0.15)'}`,
                  overflow:'hidden',
                }}>
                  {/* Container header */}
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 9px',borderBottom:'1px solid #1e2736'}}>
                    <div style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                      background:run?'#34d399':'#f87171',
                      boxShadow:run?'0 0 5px #34d399':'none'}}/>
                    <span style={{fontWeight:700,fontSize:12,color:'#e2e8f0',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {c.name}
                    </span>
                    <span style={{fontSize:9,padding:'1px 6px',borderRadius:3,fontWeight:600,flexShrink:0,
                      background:run?'rgba(52,211,153,0.08)':'rgba(248,113,113,0.08)',
                      color:run?'#34d399':'#f87171',
                      border:`1px solid ${run?'rgba(52,211,153,0.2)':'rgba(248,113,113,0.2)'}`}}>
                      {c.status?.split(' ')[0]?.toUpperCase()}
                    </span>
                  </div>

                  {/* Container details */}
                  <div style={{padding:'5px 9px 6px'}}>
                    {/* Image */}
                    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom: c.ports?.length>0?5:0}}>
                      <span style={{fontSize:9,color:'#4a5568'}}>image</span>
                      <span style={{fontSize:10,color:'#8899aa',fontFamily:'JetBrains Mono,monospace',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {imgName}
                      </span>
                      {imgTag && imgTag !== 'latest' && (
                        <span style={{fontSize:9,padding:'0 5px',borderRadius:3,background:'#161b25',color:'#4a5568',border:'1px solid #1e2736',flexShrink:0}}>
                          {imgTag}
                        </span>
                      )}
                    </div>

                    {/* Ports */}
                    {c.ports?.length>0&&(
                      <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                        {c.ports.map((p,i)=>(
                          <span key={i} style={{
                            fontSize:9,padding:'1px 6px',borderRadius:3,
                            background:'rgba(56,189,248,0.08)',
                            color:'#38bdf8',
                            border:'1px solid rgba(56,189,248,0.18)',
                            fontFamily:'JetBrains Mono,monospace',
                          }}>
                            {p.replace('0.0.0.0:', '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NodeDetail({ node, onClose, onScan, allNodes = [], onChildClick }) {
  const [showCredForm, setShowCredForm] = useState(false);
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');
  const [credPort, setCredPort] = useState(22);
  if(!node)return null;
  const status=node.status||'unknown';
  const hw=node.hardware||{};
  const statusColor=STATUS_COLORS[status]||'#4a5568';

  async function saveCreds(){
    await fetch(`${API}/api/credentials`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({node_id:node.id,username:credUser,password:credPass,port:credPort})});
    setShowCredForm(false);setCredPass('');
  }
  async function deleteCreds(){
    await fetch(`${API}/api/credentials/${node.id}`,{method:'DELETE'});
  }

  return(
    <div style={{position:'fixed',top:0,right:0,bottom:0,width:340,background:'#10131a',borderLeft:'1px solid #1e2736',zIndex:100,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'-8px 0 32px rgba(0,0,0,0.5)',animation:'slideIn .2s ease'}}>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      <div style={{padding:'12px 14px',borderBottom:'1px solid #1e2736',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:9}}>
            <span style={{fontSize:20}}>{TYPE_ICONS[node.type]||'❓'}</span>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,color:'#e2e8f0'}}>{node.name}</div>
              <div style={{fontSize:11,fontFamily:'JetBrains Mono,monospace',color:'#38bdf8'}}>{node.ip}</div>
            </div>
          </div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:6,border:'1px solid #1e2736',background:'#161b25',color:'#4a5568',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={13}/></button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:20,background:`${statusColor}15`,border:`1px solid ${statusColor}35`,fontSize:11,color:statusColor}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:statusColor,flexShrink:0}}/>
            {STATUS_LABELS[status]}
          </div>
          <button onClick={onScan} style={{display:'flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:6,border:'1px solid #263044',background:'#161b25',color:'#8899aa',cursor:'pointer',fontSize:11,fontFamily:'JetBrains Mono,monospace'}}>
            <Scan size={11}/> Scanner
          </button>
        </div>
        {node.vendor&&<div style={{marginTop:6,fontSize:10,color:'#4a5568'}}>📡 {node.vendor}</div>}
        {node.scan_error&&<div style={{marginTop:6,fontSize:10,color:'#f87171',padding:'4px 7px',background:'rgba(248,113,113,0.08)',borderRadius:5,border:'1px solid rgba(248,113,113,0.2)'}}>⚠ {node.scan_error}</div>}
      </div>

      <div style={{flex:1,overflow:'auto'}}>
        <Section title="Accès SSH" icon="🔐" defaultOpen={!node.has_credentials}>
          {node.has_credentials?(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#34d399'}}><Shield size={12}/> Credentials AES-256 stockés</div>
              <div style={{display:'flex',gap:5}}>
                <button onClick={()=>setShowCredForm(s=>!s)} style={{fontSize:10,padding:'2px 8px',borderRadius:5,border:'1px solid #263044',background:'#161b25',color:'#8899aa',cursor:'pointer'}}>Modifier</button>
                <button onClick={deleteCreds} style={{fontSize:10,padding:'2px 8px',borderRadius:5,border:'1px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.08)',color:'#f87171',cursor:'pointer'}}><Trash2 size={10}/></button>
              </div>
            </div>
          ):(
            <div style={{fontSize:11,color:'#4a5568',marginBottom:8}}>🔒 Aucun credentials stocké</div>
          )}
          {(!node.has_credentials||showCredForm)&&(
            <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:8}}>
              <input className="field-input" value={credUser} onChange={e=>setCredUser(e.target.value)} placeholder="Utilisateur (admin, pi, ubuntu...)"/>
              <input className="field-input" type="password" value={credPass} onChange={e=>setCredPass(e.target.value)} placeholder="Mot de passe"/>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{fontSize:10,color:'#4a5568'}}>Port:</span>
                <input className="field-input" type="number" value={credPort} onChange={e=>setCredPort(parseInt(e.target.value)||22)} style={{width:70}}/>
              </div>
              <button onClick={saveCreds} disabled={!credUser||!credPass} style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:6,border:'none',background:'#38bdf8',color:'#000',cursor:'pointer',fontSize:11,fontFamily:'JetBrains Mono,monospace',fontWeight:600,opacity:(!credUser||!credPass)?0.5:1}}>
                <Shield size={12}/> Enregistrer (chiffré AES-256)
              </button>
            </div>
          )}
        </Section>

        {Object.keys(hw).some(k=>hw[k]!=null)&&(
          <Section title="Hardware" icon="⚙">
            {hw.cpu_model&&<div style={{fontSize:10,color:'#8899aa',marginBottom:8,lineHeight:1.4}}>{hw.cpu_model}</div>}
            <UBar label={`CPU${hw.cpu_cores?` (${hw.cpu_cores} cœurs)`:''}`} value={hw.cpu_usage}/>
            <UBar label={`RAM${hw.ram_total_gb?` (${hw.ram_total_gb} GB)`:''}`} value={hw.ram_percent}/>
            <UBar label={`Disque${hw.disk_total_gb?` (${hw.disk_total_gb} GB)`:''}`} value={hw.disk_percent}/>
            {hw.temperature&&<KV label="Température" value={`${hw.temperature}°C`}/>}
            <KV label="OS" value={hw.os}/><KV label="Kernel" value={hw.kernel} mono/><KV label="Arch" value={hw.arch}/><KV label="Uptime" value={hw.uptime}/>
          </Section>
        )}

        {node.network_interfaces?.length>0&&(
          <Section title="Réseau" icon="🌐" count={node.network_interfaces.length}>
            {node.network_interfaces.map((iface,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 7px',borderRadius:5,background:'#161b25',border:'1px solid #1e2736',marginBottom:4,fontSize:11}}>
                <span style={{color:'#8899aa',fontWeight:600}}>{iface.name}</span>
                <div style={{textAlign:'right'}}>
                  {iface.ip&&<div style={{color:'#38bdf8',fontFamily:'JetBrains Mono,monospace'}}>{iface.ip}</div>}
                  {iface.mac&&<div style={{color:'#4a5568',fontSize:10}}>{iface.mac}</div>}
                </div>
              </div>
            ))}
          </Section>
        )}

        {node.services?.length>0&&(
          <Section title="Services" icon="⚡" count={node.services.length}>
            {node.services.map((s,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 8px',borderRadius:5,background:'#161b25',border:'1px solid #1e2736',marginBottom:4}}>
                <span style={{fontWeight:600,fontSize:11,color:'#e2e8f0'}}>{s.name||`Port ${s.port}`}</span>
                <span style={{fontSize:10,padding:'1px 6px',borderRadius:3,background:'rgba(167,139,250,0.12)',color:'#a78bfa',border:'1px solid rgba(167,139,250,0.25)',fontFamily:'JetBrains Mono,monospace'}}>:{s.port}/{s.protocol}</span>
              </div>
            ))}
          </Section>
        )}

        {node.docker_containers?.length>0&&(
          <Section title="Docker" icon="🐳" count={node.docker_containers.length} defaultOpen={true}>
            <DockerSection containers={node.docker_containers} />
          </Section>
        )}

        {node.virtual_machines?.length>0&&(
          <Section title="VMs / LXC" icon="⬜" count={node.virtual_machines.length}>
            {node.virtual_machines.map(vm=>{
              const run=['running','online'].includes(vm.status?.toLowerCase());
              return(<div key={vm.id} style={{padding:'7px 9px',borderRadius:6,background:'#161b25',border:'1px solid #1e2736',marginBottom:5}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                  <span style={{fontWeight:700,fontSize:11,color:'#e2e8f0'}}>{vm.name}</span>
                  <div style={{display:'flex',gap:4}}>
                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:vm.type==='lxc'?'rgba(167,139,250,0.12)':'rgba(20,184,166,0.12)',color:vm.type==='lxc'?'#a78bfa':'#14b8a6',border:`1px solid ${vm.type==='lxc'?'rgba(167,139,250,0.25)':'rgba(20,184,166,0.25)'}`}}>{vm.type?.toUpperCase()}</span>
                    <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:run?'rgba(52,211,153,0.1)':'rgba(248,113,113,0.08)',color:run?'#34d399':'#f87171',border:`1px solid ${run?'rgba(52,211,153,0.25)':'rgba(248,113,113,0.2)'}`}}>{vm.status}</span>
                  </div>
                </div>
                {vm.ip&&<div style={{fontSize:10,color:'#38bdf8',fontFamily:'JetBrains Mono,monospace'}}>{vm.ip}</div>}
                {(vm.cpu||vm.ram_mb)&&<div style={{fontSize:10,color:'#4a5568',marginTop:2}}>{vm.cpu&&`${vm.cpu} vCPU`}{vm.cpu&&vm.ram_mb&&' · '}{vm.ram_mb&&`${Math.round(vm.ram_mb/1024)} GB`}</div>}
              </div>);
            })}
          </Section>
        )}

        {node.scanned_layers?.length>0&&(
          <Section title="Couches scannées" icon="📋" defaultOpen={false}>
            <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
              {node.scanned_layers.map(l=><span key={l} style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:'rgba(52,211,153,0.08)',color:'#34d399',border:'1px solid rgba(52,211,153,0.2)'}}>✓ {LAYER_LABELS[l]||l}</span>)}
            </div>
          </Section>
        )}

        {/* Children nodes in inventory */}
        {node.child_ids?.length>0&&(
          <Section title="Dépendances directes" icon="🔗" count={node.child_ids.length}>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {node.child_ids.map(cid=>{
                const child = allNodes?.find(n=>n.id===cid);
                if(!child) return null;
                const running = child.status==='online';
                const childIcon = TYPE_ICONS[child.type]||'❓';
                return(
                  <div key={cid} onClick={()=>onChildClick?.(child)}
                    style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',
                      borderRadius:6,background:'#161b25',border:'1px solid #1e2736',
                      cursor:'pointer',transition:'border-color .1s'}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='#263044'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='#1e2736'}
                  >
                    <span style={{fontSize:14}}>{childIcon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:600,color:'#e2e8f0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{child.name}</div>
                      <div style={{fontSize:10,color:'#38bdf8',fontFamily:'JetBrains Mono,monospace'}}>{child.ip}</div>
                    </div>
                    <div style={{width:7,height:7,borderRadius:'50%',background:running?'#34d399':'#f87171',flexShrink:0,
                      boxShadow:running?'0 0 5px #34d399':'none'}}/>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section title="Informations" icon="ℹ" defaultOpen={false}>
          <KV label="ID" value={node.id} mono/>
          <KV label="Hostname" value={node.hostname}/>
          <KV label="MAC" value={node.mac} mono/>
          <KV label="Fabricant" value={node.vendor}/>
          <KV label="Dernier scan" value={node.last_scan?new Date(node.last_scan).toLocaleString('fr-FR'):'–'}/>
        </Section>
      </div>
    </div>
  );
}
