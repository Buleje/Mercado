import fs from 'node:fs'; import path from 'node:path';
const base = process.env.HOME + '/.claude/projects/-home-usuario-proyectos-Mercado'; const desde=Date.now()-(+(process.argv[2]||7))*864e5;
const grupos={}; const ejemplos={};
const norm=(s)=>{ s=String(s).replace(/\s+/g,' ').slice(0,400);
  const reglas=[[/firecrawl|credits|Payment Required|402/i,'firecrawl sin créditos'],[/Exit code 137|Killed/i,'muerto por memoria (137)'],[/exceeds maximum allowed tokens|too large|File content \(/i,'archivo muy grande para leer'],[/File has not been read yet|must Read/i,'editar sin leer antes'],[/String to replace not found|old_string/i,'Edit no encontró el texto'],[/timed out|timeout|Timeout/i,'tiempo agotado'],[/403|Forbidden|blocked|denied|bloquead/i,'bloqueado / prohibido'],[/404|Not Found|ENOENT|No such file/i,'no existe (404/archivo)'],[/rate limit|429/i,'límite de pedidos (429)'],[/pre-tool-guard|hook|PreToolUse/i,'frenado por aviso automático'],[/error TS\d+|typecheck/i,'error de tipos'],[/FAIL|vitest|Test Files/i,'test rojo'],[/Exit code 1\b/i,'comando salió con 1'],[/Exit code \d+/i,'comando salió con otro código'],[/Sibling tool call errored/i,'cancelado por error vecino'],[/InputValidationError|Invalid tool|not available|No such tool/i,'herramienta mal llamada']];
  for (const [r,k] of reglas) if (r.test(s)) return k; return 'otro'; };
for (const ses of fs.readdirSync(base)) { const d=path.join(base,ses,'subagents'); if(!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) { if(!f.endsWith('.jsonl')) continue; const p=path.join(d,f); if(fs.statSync(p).mtimeMs<desde) continue;
    const ids={};
    for (const l of fs.readFileSync(p,'utf8').split('\n')) { if(!l) continue; let o; try{o=JSON.parse(l)}catch{continue}
      const cs=Array.isArray(o.message?.content)?o.message.content:[];
      for (const c of cs) { if(c.type==='tool_use') ids[c.id]=c.name;
        if(c.type==='tool_result'&&c.is_error){ const txt=Array.isArray(c.content)?c.content.map(x=>x.text||'').join(' '):c.content; const k=(ids[c.tool_use_id]||'?')+' · '+norm(txt); grupos[k]=(grupos[k]||0)+1; (ejemplos[k]??=[]).length<2&&ejemplos[k].push(String(txt).replace(/\s+/g,' ').slice(0,160)); } } } } }
for (const [k,v] of Object.entries(grupos).sort((a,b)=>b[1]-a[1]).slice(0,16)) { console.log(v, k); console.log('    ', ejemplos[k][0]); }
