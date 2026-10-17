import { chromium } from "playwright";
const BASE="http://localhost:3000", SLUG="main";
const b=await chromium.launch({headless:true});
let prodId,despId,cerrado=false;
const ctx=await b.newContext({viewport:{width:1600,height:1100},extraHTTPHeaders:{"x-tenant-id":SLUG},acceptDownloads:true});
const p=await ctx.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
await p.request.post(`${BASE}/api/auth/login`,{headers:{"content-type":"application/json","x-tenant-id":SLUG},data:{username:"qaadmin",password:"Qa-admin-1234",tenantSlug:SLUG}});
const cookies=(await ctx.cookies()).map(c=>`${c.name}=${c.value}`).join("; ");
const csrf=(await ctx.cookies()).find(c=>c.name.includes("csrf"))?.value;
const H={"content-type":"application/json","x-tenant-id":SLUG,cookie:cookies,...(csrf?{"x-csrf-token":csrf}:{})};
const api=(path,method,data)=>p.request.fetch(`${BASE}${path}`,{method,headers:H,...(data?{data}:{})});
const hoy=new Date(); const periodKey=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}`;
try{
// Un despacho sin GTF → observación (no impide cerrar)
const prod=await (await api("/api/admin/forestal/ctp","POST",{section:"produccion",productType:"Madera aserrada",speciesCommon:"Tornillo",quantity:400,unit:"pt",pieces:20,observations:"QA cierre asistido"})).json();
prodId=prod?.entry?.id;
const desp=await (await api("/api/admin/forestal/ctp","POST",{section:"despacho",productType:"Madera aserrada",speciesCommon:"Tornillo",quantity:100,unit:"pt",pieces:8,destino:"QA cierre asistido"})).json();
despId=desp?.entry?.id;
await p.addInitScript(()=>{try{localStorage.setItem("active-tenant-slug","main");localStorage.setItem("onboarding-completed-main","1");}catch{}});
await p.goto(`${BASE}/t/${SLUG}/admin?tab=ctp-libro-operaciones`,{waitUntil:"domcontentloaded",timeout:90000});
await p.waitForTimeout(13000);
await p.getByRole("button",{name:/^Cierre$/}).first().click({timeout:60000});
await p.waitForTimeout(4000);
const panel=p.locator("main section").filter({hasText:/paso a paso/}).first();
console.log("veredicto:", (await panel.locator("p").first().innerText()).replace(/\s+/g," "));
console.log("detalle:", (await panel.locator("ul li").allInnerTexts()).map(t=>t.replace(/\s+/g," ")).join("\n   · "));
console.log("atajos:", (await panel.getByRole("button",{name:/^Resolver:/}).allInnerTexts()).join(" | "));
console.log("botón cerrar:", await panel.getByRole("button",{name:/^Cerrar /}).innerText(), "· habilitado:", await panel.getByRole("button",{name:/^Cerrar /}).isEnabled());
console.log("paquete:", (await panel.getByRole("button",{name:/Libro oficial|Informe ARFFS|Anexos N/}).allInnerTexts()).join(" | "));
await p.screenshot({path:"reports/cierre-asistido.png",fullPage:true});

// Cerrar de verdad y ver el resultado
await panel.getByRole("button",{name:/^Cerrar /}).click();
await p.waitForTimeout(6000);
cerrado=true;
const msg=await panel.locator("span").filter({hasText:/cerrado|No se pudo/}).first().innerText().catch(()=>"(sin mensaje)");
console.log("tras cerrar:", msg.replace(/\s+/g," "));
console.log(errs.length?`ERRORES: ${errs.slice(0,3).join(" | ")}`:"sin errores JS");
}finally{
if(cerrado) await api("/api/admin/forestal/ctp/cierre","POST",{action:"reabrir",periodKey,motivo:"QA cierre asistido"});
for(const id of [despId,prodId]) if(id) await api("/api/admin/forestal/ctp","PATCH",{id,action:"annul",reason:"QA cierre asistido"});
console.log("limpieza lista"); await b.close();
}
