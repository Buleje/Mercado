import fs from 'node:fs'; import path from 'node:path';
const base = process.env.HOME + '/.claude/projects/-home-usuario-proyectos-Mercado';
const dias = +(process.argv[2]||7); const desde = Date.now() - dias*864e5;
const filas = [];
for (const ses of fs.readdirSync(base)) {
  const d = path.join(base, ses, 'subagents'); if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) { if (!f.endsWith('.meta.json')) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(d,f),'utf8'));
    const j = path.join(d, f.replace('.meta.json','.jsonl')); if (!fs.existsSync(j)) continue;
    if (fs.statSync(j).mtimeMs < desde) continue;
    const lines = fs.readFileSync(j,'utf8').split('\n').filter(Boolean);
    let t0, t1, tools=0, turns=0, inTok=0, cacheRead=0, outTok=0, model='', errs=0, toolNames={}, maxCtx=0;
    for (const l of lines) { let o; try { o = JSON.parse(l) } catch { continue }
      const ts = o.timestamp && Date.parse(o.timestamp); if (ts) { t0 ??= ts; t1 = ts; }
      if (o.type==='assistant') { turns++; const u=o.message?.usage||{}; model=o.message?.model||model;
        inTok+=u.input_tokens||0; cacheRead+=u.cache_read_input_tokens||0; outTok+=u.output_tokens||0;
        maxCtx=Math.max(maxCtx,(u.input_tokens||0)+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0));
        for (const c of o.message?.content||[]) if (c.type==='tool_use') { tools++; toolNames[c.name]=(toolNames[c.name]||0)+1; } }
      if (o.type==='user') for (const c of (Array.isArray(o.message?.content)?o.message.content:[])) if (c.type==='tool_result' && c.is_error) errs++;
    }
    filas.push({ses:ses.slice(0,8), tipo:meta.agentType, desc:meta.description, modelo:model.replace('claude-',''), pedido:meta.model, min:+((t1-t0)/6e4).toFixed(1), turns, tools, errs, maxCtxK:Math.round(maxCtx/1000), leidoM:+((cacheRead+inTok)/1e6).toFixed(2), toolNames});
  }
}
filas.sort((a,b)=>b.min-a.min);
const tot = filas.length; const sum=(k)=>filas.reduce((s,f)=>s+f[k],0);
console.log(`ayudantes ${dias}d: ${tot} · min total ${sum('min').toFixed(0)} · pasos prom ${(sum('tools')/tot).toFixed(0)} · errores ${sum('errs')} · leído ${sum('leidoM').toFixed(0)} M`);
const por = {}; for (const f of filas) { const k=f.tipo+'|'+f.modelo; por[k] ??= {n:0,min:0,tools:0,errs:0,leido:0}; const p=por[k]; p.n++; p.min+=f.min; p.tools+=f.tools; p.errs+=f.errs; p.leido+=f.leidoM; }
console.log('\ntipo|modelo  n  min_prom  pasos_prom  err  leídoM');
for (const [k,p] of Object.entries(por).sort((a,b)=>b[1].min-a[1].min)) console.log(k.padEnd(32), p.n, (p.min/p.n).toFixed(1), (p.tools/p.n).toFixed(0), p.errs, p.leido.toFixed(1));
console.log('\nTop 12 más largos:'); for (const f of filas.slice(0,12)) console.log(f.min+'m', f.tools+'p', f.errs+'e', f.maxCtxK+'k', f.tipo, f.modelo, '·', f.desc);
const tn={}; for (const f of filas) for (const [k,v] of Object.entries(f.toolNames)) tn[k]=(tn[k]||0)+v;
console.log('\nHerramientas:', Object.entries(tn).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>k+' '+v).join(' · '));

