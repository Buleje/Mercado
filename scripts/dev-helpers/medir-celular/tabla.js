const fs=require("fs");
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) { console.log("falta", f); continue; }
  const r=JSON.parse(fs.readFileSync(f,"utf8"));
  const nombres=r.capturas.map(c=>(c.archivo||c).split("/").pop().replace(/^\d+-/,"").replace(/-400\.png$/,""));
  console.log("== "+r.tenant.slice(0,12)+" pageerrors:", (r.pageerrors||[]).length);
  r.evals.forEach((e,i)=>{ const v=e.valor; if(!v||typeof v!=="object"||!("W" in v)) return;
    console.log([ (nombres.shift()||i).padEnd(16), "y1="+v.primerContenidoY, "filas="+v.filasDeControlesAntes, "pant="+v.pantallas, "desb="+v.desborde, "sale="+v.seSalen, "<44="+v.menos44+"/"+v.tocables, "<14="+v.letraMenos14, "| "+(v.primerContenido||"").slice(0,22), "| "+v.ejMenos44.slice(0,3).join("; "), "| "+v.ejLetra.slice(0,3).join("; ")].join(" "));
  });
}
