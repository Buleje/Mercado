// Borra el árbol "Prueba importador QA" que deja la verificación del importador
// si una corrida se corta a mitad. Va despacio a propósito: los endpoints del
// drive tienen rate limit MODERATE y a 11 requests seguidos devuelven 429.
const BASE = "http://localhost:3000";
const SLUG = "main";
const RAIZ = process.argv[2] ?? "Prueba importador QA";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

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
  if (!raiz) { console.log("no hay nada que limpiar"); return; }

  const bajo = [raiz];
  for (let i = 0; i < bajo.length; i++) bajo.push(...folders.filter((f) => f.parentId === bajo[i].id));

  const docs = [];
  for (const f of bajo) {
    const r = await fetch(`${BASE}/api/admin/documents?folderId=${f.id}&limit=500`, { headers: h });
    if (r.ok) docs.push(...((await r.json()).documents ?? []));
    await dormir(300);
  }

  for (const d of docs) {
    const r = await fetch(`${BASE}/api/admin/documents/${d.id}?purge=1`, { method: "DELETE", headers: h });
    console.log(`doc ${d.name}: ${r.status}${r.ok ? "" : " " + (await r.text()).slice(0, 200)}`);
    await dormir(1200);
  }
  for (const f of [...bajo].reverse()) {
    const r = await fetch(`${BASE}/api/admin/documents/folders/${f.id}`, { method: "DELETE", headers: h });
    console.log(`carpeta ${f.name}: ${r.status}${r.ok ? "" : " " + (await r.text()).slice(0, 200)}`);
    await dormir(1200);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
