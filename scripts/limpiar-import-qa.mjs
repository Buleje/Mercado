// Borra el árbol "Prueba importador QA" que deja la verificación del importador
// si una corrida se corta a mitad. Va despacio a propósito: los endpoints del
// drive tienen rate limit MODERATE y a 11 requests seguidos devuelven 429.
const BASE = "http://localhost:3000";
const SLUG = "main";
const RAIZ = process.argv[2] ?? "Prueba importador QA";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * DELETE respetando el 429: `documents:delete` permite 20 cada 5 min y este
 * script borra de a decenas — el rate limit está bien, el que abusa es el QA.
 */
async function borrar(url, h) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { method: "DELETE", headers: h });
    if (r.status !== 429) return r.status;
    const { retryAfter = 10 } = await r.json().catch(() => ({}));
    await dormir(Math.min(60, retryAfter + 2) * 1000);
  }
  return 429;
}


async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    body: JSON.stringify({ username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG }),
  });
  if (!login.ok) { console.error("login fail", login.status); process.exit(1); }
  const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const csrf = decodeURIComponent(cookies.match(/csrf-token=([^;]+)/)?.[1] ?? "");
  const h = { cookie: cookies, "x-tenant-id": SLUG, "content-type": "application/json", "x-csrf-token": csrf };

  // Las carpetas viven en SU endpoint; la lista de documentos no las trae.
  const { folders = [] } = await (await fetch(`${BASE}/api/admin/documents/folders`, { headers: h })).json();
  const raiz = folders.find((f) => f.name === RAIZ && !f.parentId);
  if (!raiz) { console.log("no queda carpeta de prueba"); await barrerHuerfanos(h); return; }

  const bajo = [raiz];
  for (let i = 0; i < bajo.length; i++) bajo.push(...folders.filter((f) => f.parentId === bajo[i].id));

  const docs = [];
  for (const f of bajo) {
    const r = await fetch(`${BASE}/api/admin/documents?folderId=${f.id}&limit=500`, { headers: h });
    if (r.ok) docs.push(...((await r.json()).documents ?? []));
    await dormir(300);
  }

  for (const d of docs) {
    console.log(`doc ${d.name}: ${await borrar(`${BASE}/api/admin/documents/${d.id}?purge=1`, h)}`);
    await dormir(400);
  }
  for (const f of [...bajo].reverse()) {
    console.log(`carpeta ${f.name}: ${await borrar(`${BASE}/api/admin/documents/folders/${f.id}`, h)}`);
    await dormir(400);
  }
  await barrerHuerfanos(h);
}

/**
 * Borrar una carpeta manda sus documentos a la RAÍZ (onDelete SetNull), así que
 * una corrida cortada a la mitad deja los archivos de prueba sueltos. Se barren
 * sólo los que son inconfundiblemente del QA: nombre EXACTO de los fixtures y
 * peso EXACTO de los sintéticos. Nada que haya subido una persona matchea eso.
 */
const NOMBRES_QA = new Set([
  "alquiler-local.pdf", "proveedor-abarrotes.pdf", "servicio-internet.pdf",
  "mantenimiento-equipos.pdf", "proveedor-gaseosas.pdf", "nuevo-de-hoy.pdf",
  "b-0001.pdf", "b-0002.pdf", "b-0003.pdf", "b-0004.pdf", "b-0005.pdf",
  "b-0006.pdf", "b-0007.pdf", "b-0008.pdf", "leeme.txt",
  "f-1.pdf", "f-2.pdf", "f-3.pdf", "a1.pdf", "a2.pdf", "raiz.pdf",
]);
const PESOS_QA = new Set([2048, 4096, 307200]);

async function barrerHuerfanos(h) {
  const { documents = [] } = await (await fetch(`${BASE}/api/admin/documents?limit=500`, { headers: h })).json();
  const sueltos = documents.filter((d) => NOMBRES_QA.has(d.name) && PESOS_QA.has(d.size));
  if (sueltos.length === 0) return;
  console.log(`\nhuérfanos de QA en la raíz: ${sueltos.length}`);
  for (const d of sueltos) {
    console.log(`  ${d.name} (${d.size}): ${await borrar(`${BASE}/api/admin/documents/${d.id}?purge=1`, h)}`);
    await dormir(400);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
