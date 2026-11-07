import fs from 'node:fs'; import path from 'node:path';
const base = process.env.HOME + '/.claude/projects/-home-usuario-proyectos-Mercado'; const desde=Date.now()-(+(process.argv[2]||7))*864e5;
const b={}; const add=(k,ms,out)=>{b[k]??={ms:0,n:0,out:0}; b[k].ms+=ms; b[k].n++; b[k].out+=out;};
for (const ses of fs.readdirSync(base)) { const d=path.join(base,ses,'subagents'); if(!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) { if(!f.endsWith('.jsonl')) continue; const p=path.join(d,f); if(fs.statSync(p).mtimeMs<desde) continue;
    let ultimo=null; const vistos=new Set();
    for (const l of fs.readFileSync(p,'utf8').split('\n')) { if(!l) continue; let o; try{o=JSON.parse(l)}catch{continue}
      const ts=Date.parse(o.timestamp||''); if(!ts) continue;
      if(o.type==='user') ultimo=ts;
      if(o.type==='assistant' && ultimo && !vistos.has(o.message?.id)){ vistos.add(o.message?.id); const u=o.message?.usage||{}; const ctx=(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0);
        const m=(o.message?.model||'').replace('claude-','').replace('-5-5',''); const cb=ctx<40e3?'<40k':ctx<80e3?'40-80k':ctx<120e3?'80-120k':'>120k';
        const dt=ts-ultimo; if(dt>0&&dt<10*6e4) add(m+' '+cb, dt, u.output_tokens||0); ultimo=null; }
    } } }
console.log('modelo ctx       pasos  s/paso  salida/paso');
for (const [k,v] of Object.entries(b).sort()) if(v.n>50) console.log(k.padEnd(18), String(v.n).padStart(6), (v.ms/v.n/1000).toFixed(1).padStart(6), String(Math.round(v.out/v.n)).padStart(8));
