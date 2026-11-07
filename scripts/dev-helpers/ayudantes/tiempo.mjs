import fs from 'node:fs'; import path from 'node:path';
const base = process.env.HOME + '/.claude/projects/-home-usuario-proyectos-Mercado'; const desde=Date.now()-(+(process.argv[2]||7))*864e5;
const cat=(n,i)=>{ if(n!=='Bash') return n; const c=String(i?.command||'');
  const k=[[/qa-capturas/,'qa-capturas'],[/typecheck|tsc7|\btsc\b/,'typecheck'],[/vitest|probar\.sh/,'tests'],[/git commit|commit-carril/,'guardar (commit)'],[/playwright|chromium/,'navegador'],[/curl/,'curl'],[/sql-lectura|psql|prisma/,'base de datos'],[/python3?|uv run/,'python'],[/node /,'node'],[/sleep|until |while /,'esperar'],[/grep|rg |sed -n|cat |head|tail|ls /,'leer/buscar']];
  for(const [r,v] of k) if(r.test(c)) return 'Bash:'+v; return 'Bash:otro'; };
const tot={}; let pensar=0, herr=0;
for (const ses of fs.readdirSync(base)) { const d=path.join(base,ses,'subagents'); if(!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) { if(!f.endsWith('.jsonl')) continue; const p=path.join(d,f); if(fs.statSync(p).mtimeMs<desde) continue;
    const pend={}; let ultimo=null;
    for (const l of fs.readFileSync(p,'utf8').split('\n')) { if(!l) continue; let o; try{o=JSON.parse(l)}catch{continue}
      const ts=Date.parse(o.timestamp||''); if(!ts) continue; const cs=Array.isArray(o.message?.content)?o.message.content:[];
      if(o.type==='assistant'){ if(ultimo&&ts-ultimo<20*6e4) pensar+=ts-ultimo; for(const c of cs) if(c.type==='tool_use') pend[c.id]={t:ts,k:cat(c.name,c.input)}; }
      if(o.type==='user'){ for(const c of cs) if(c.type==='tool_result'&&pend[c.tool_use_id]){ const dt=ts-pend[c.tool_use_id].t; if(dt<60*6e4){ tot[pend[c.tool_use_id].k]=(tot[pend[c.tool_use_id].k]||{ms:0,n:0}); tot[pend[c.tool_use_id].k].ms+=dt; tot[pend[c.tool_use_id].k].n++; herr+=dt; } } ultimo=ts; }
    } } }
console.log(`modelo pensando: ${(pensar/36e5).toFixed(1)} h · herramientas: ${(herr/36e5).toFixed(1)} h`);
for (const [k,v] of Object.entries(tot).sort((a,b)=>b[1].ms-a[1].ms).slice(0,14)) console.log(k.padEnd(24), (v.ms/36e5).toFixed(1)+' h', v.n+' veces', (v.ms/v.n/1000).toFixed(0)+' s c/u');
