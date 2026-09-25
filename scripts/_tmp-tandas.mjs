/** El flujo de Brandon: lote de 6 trozas → elijo 3 → produzco menos del tope →
 *  al día siguiente amplío la MISMA corrida sin volver a elegir trozas. */
const BASE="http://localhost:3000",T="main",s=`QA-TANDA-${Math.floor(Math.random()*1e6)}`,HOY=new Date().toISOString().slice(0,10);
const l=await fetch(`${BASE}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json","x-tenant-id":T},body:JSON.stringify({username:"qaadmin",password:"Qa-admin-1234",tenantSlug:T})});
const ck=(l.headers.getSetCookie?.()??[]).map(c=>c.split(";")[0]).join("; ");
const csrf=/csrf-token=([^;]+)/.exec(ck)?.[1];
const H={cookie:ck,"content-type":"application/json","x-tenant-id":T,...(csrf?{"x-csrf-token":decodeURIComponent(csrf)}:{})};
const c=async(m,u,b)=>{const r=await fetch(BASE+u,{method:m,headers:H,...(b?{body:JSON.stringify(b)}:{})});return{ok:r.ok,status:r.status,j:await r.json().catch(()=>({}))}};
const lim=[];
const paq=(cod,v)=>({codigo:cod,productType:"Madera aserrada",presentacion:"Paquete",cantidad:10,volumenM3:v});
try{
  // 6 trozas de 2 m³ = 12 m³
  const ing=await c("POST","/api/admin/forestal/wood-entries",{gtfNumber:s,providerName:"QA Tanda SAC",speciesCommonName:"Tornillo",productType:"rolliza",volumeM3:12,pieces:6,entryDate:`${HOY}T00:00:00.000Z`,
    trozas:[1,2,3,4,5,6].map(i=>({orden:i,codificacion:`${s}/${i}`,especieComun:"Tornillo",especieCientifica:null,dimensiones:"64 X 64 X 6.22",largoM:6.22,diametroCm:64,d1Cm:64,d2Cm:64,cantidad:1,volumenM3:2}))});
  lim.push(["w",ing.j.entry.id]);
  await c("PATCH",`/api/admin/forestal/wood-entries/${ing.j.entry.id}`,{action:"recepcionar",fecha:HOY});
  const pz=(await c("GET",`/api/admin/forestal/trozas?woodEntryId=${ing.j.entry.id}`)).j.trozas;
  const lo=await c("POST","/api/admin/forestal/lotes-aserrio",{speciesCommon:"Tornillo"}); lim.push(["l",lo.j.lote.id]);
  await c("PATCH","/api/admin/forestal/lotes-aserrio",{accion:"agregar",loteId:lo.j.lote.id,trozaIds:pz.map(p=>p.id)});
  console.log(`Lote ${lo.j.lote.code}: 6 trozas · 12 m³`);

  // Elijo 3 → 6 m³ → tope 56% = 3.36
  const cons=await c("PATCH","/api/admin/forestal/lotes-aserrio",{accion:"consumir",loteId:lo.j.lote.id,trozaIds:pz.slice(0,3).map(p=>p.id),fecha:HOY});
  const corrida=cons.j.corrida.id;
  console.log(`1 · Elijo 3 trozas → ${cons.j.volumenM3} m³ · tope 56% = 3.3600 m³`);
  console.log(`    el lote sigue abierto con las otras 3: ${(await c("GET","/api/admin/forestal/lotes-aserrio")).j.lotes.find(x=>x.id===lo.j.lote.id).status}`);

  // Primera tanda: 2 m³ (33%) — me sobran 1.36 para llegar al tope
  const t1=await c("PATCH","/api/admin/forestal/ctp",{action:"declarar_produccion",id:corrida,quantity:2,unit:"m3",productType:"Madera aserrada",paquetes:[paq(`${s}-A`,2)]});
  console.log(`2 · Tanda 1: 2 m³ (33%) → HTTP ${t1.status} ${t1.ok?"✅":JSON.stringify(t1.j).slice(0,120)}`);

  // Segunda tanda SIN volver a elegir trozas: +1.3 m³ → total 3.3 (55%)
  const t2=await c("PATCH","/api/admin/forestal/ctp",{action:"ampliar_produccion",id:corrida,paquetes:[paq(`${s}-B`,1.3)]});
  console.log(`3 · Tanda 2 (sin elegir trozas): +1.3 → HTTP ${t2.status} ${t2.ok?`✅ total ${t2.j.entry.quantity} · rend ${t2.j.entry.rendimientoPct}%`:JSON.stringify(t2.j).slice(0,140)}`);

  // Tercera que PASA el tope acumulado
  const t3=await c("PATCH","/api/admin/forestal/ctp",{action:"ampliar_produccion",id:corrida,paquetes:[paq(`${s}-C`,1)]});
  console.log(`4 · Tanda 3: +1 (pasaría a 4.3 = 71%) → HTTP ${t3.status} ${t3.ok?"❌ PASÓ":"✅ "+t3.j.error}`);
  if(!t3.ok) console.log(`    → "${String(t3.j.message??"").slice(0,150)}"`);

  // Código repetido
  const t4=await c("PATCH","/api/admin/forestal/ctp",{action:"ampliar_produccion",id:corrida,paquetes:[paq(`${s}-A`,0.05)]});
  console.log(`5 · Código repetido → HTTP ${t4.status} ${t4.ok?"❌ PASÓ":"✅ "+t4.j.error}`);

  const fin=(await c("GET","/api/admin/forestal/ctp?section=produccion")).j.entries.find(e=>e.id===corrida);
  console.log(`\nCorrida final: ${fin.quantity} m³ de ${fin.volumeInputM3} = ${fin.rendimientoPct}% · paquetes en el libro: ${(fin.paquetes??[]).length||"—"}`);
  lim.push(["c",corrida]);
}catch(e){console.error("💥",e.message)}
finally{ for(const [t,id] of lim.reverse()){ if(t==="w")await c("PATCH",`/api/admin/forestal/wood-entries/${id}`,{action:"delete"}); if(t==="c")await c("DELETE",`/api/admin/forestal/ctp?id=${id}`); if(t==="l")await c("DELETE",`/api/admin/forestal/lotes-aserrio?id=${id}`);} console.log(`\n${lim.length} objeto(s) de QA borrados.`); }
