#!/usr/bin/env node
/**
 * pedido-qa — un ciclo de pedido de prueba en `main` (dev local), en UNA llamada.
 *
 * Por qué (08-10): probar descuentos / stock / cancelación del pedido de
 * invitado costaba ~25 curls por agente (csrf, producto, cotizar, POST, 422,
 * stock x3, PATCH, DELETE). Memorias `pedido-de-prueba-en-main-deja-customer`
 * y `qa-invitado-vs-sesion-verificada-main`.
 *
 * Uso:
 *   node scripts/dev-helpers/pedido-qa.mjs [--producto <id|texto del nombre>] [--cantidad 1]
 *        [--telefono 9XXXXXXXX] [--pago efectivo|yape|fiado] [--cancelar] [--cancelar-doble]
 *        [--dejar] [--json]
 *
 * Pasos: csrf → producto+stock → cotizar → POST invitado (reintenta 1 vez con
 * `serverTotal` si 422) → stock → [PATCH cancelado] → stock → [DELETE] → tabla.
 *
 * Límites: SOLO tenant `main` en BSM_BASE (localhost:3000). El POST crea/pisa el
 * Customer del teléfono y NO se deshace con el DELETE. `cotizar` y el POST son
 * STRICT (10 cada 15 min por IP): cada corrida gasta 1 + 1 (+1 si hay 422).
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BSM_BASE || "http://localhost:3000";
const TENANT = "main";
const AQUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
// Sin esto `--help` corría un pedido de verdad (08-10).
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "node scripts/dev-helpers/pedido-qa.mjs [--producto <id|texto>] [--cantidad 1] [--telefono 9XXXXXXXX]\n" +
      "  [--pago efectivo|yape|fiado] [--cancelar] [--cancelar-doble] [--dejar] [--json]",
  );
  process.exit(0);
}
const flag = (n) => args.includes(n);
const valor = (n, def) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Solo contra el dev local (BSM_BASE=${BASE}).`);
  process.exit(2);
}

const json = flag("--json");
const cantidad = Math.max(1, Number(valor("--cantidad", "1")) || 1);
const pago = valor("--pago", "efectivo");
const cancelarDoble = flag("--cancelar-doble");
const cancelar = flag("--cancelar") || cancelarDoble;
const dejar = flag("--dejar");
let telefono = valor("--telefono");
const telefonoAleatorio = !telefono;
if (!telefono) telefono = "9" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

const filas = [];
const paso = (k, v) => filas.push([k, v]);

/** Cookie jar mínimo: nombre → valor. */
const jar = new Map();
const guardar = (res) => {
  const lista = res.headers.getSetCookie?.() ?? [];
  const nombres = [];
  for (const c of lista) {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    const n = par.slice(0, i);
    jar.set(n, par.slice(i + 1));
    nombres.push(n);
  }
  return nombres;
};
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(method, ruta, { cuerpo, headers = {}, cookie = true } = {}) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: {
      "x-tenant-id": TENANT,
      ...(cuerpo ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie: cookieHeader() } : {}),
      ...headers,
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const texto = await res.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto.slice(0, 200);
  }
  return { status: res.status, datos, res };
}

// 0. Sesión admin (en su propio proceso: no pisa /tmp/bsm-auth.env).
const admin = JSON.parse(execFileSync("node", [join(AQUI, "admin-auth.mjs"), "--json"], { encoding: "utf8" }));
const adminH = { cookie: admin.cookieHeader, "x-csrf-token": admin.csrf };
const adm = (m, r, cuerpo) => req(m, r, { cuerpo, headers: adminH, cookie: false });

// 1. csrf del invitado
const home = await req("GET", "/", { cookie: false });
guardar(home.res);
const csrf = jar.get("csrf-token");
paso("GET / (csrf)", `${home.status}${csrf ? "" : " SIN csrf-token"}`);
if (!csrf) throw new Error("GET / no dejó la cookie csrf-token");

// 2. producto con stock
const pedido = valor("--producto");
let prod;
if (pedido && /^\d+$/.test(pedido)) {
  prod = (await adm("GET", `/api/products/${pedido}`)).datos;
} else {
  const lista = (await adm("GET", "/api/products?limit=200")).datos;
  const arr = Array.isArray(lista) ? lista : (lista?.items ?? lista?.products ?? []);
  const ok = (p) => p.active !== false && p.stock >= cantidad + 5 && p.price > 0;
  prod = pedido
    ? arr.find((p) => ok(p) && p.name.toLowerCase().includes(pedido.toLowerCase()))
    : (arr.find((p) => p.id === 1252384 && ok(p)) ?? arr.find(ok));
}
if (!prod?.id) throw new Error(`Sin producto utilizable (${pedido ?? "auto"})`);
if (prod.tenantId && prod.tenantId !== TENANT) throw new Error(`Producto de otro tenant: ${prod.tenantId}`);
const leerStock = async () => (await adm("GET", `/api/products/${prod.id}`)).datos?.stock;
const stockAntes = await leerStock();
paso("producto", `${prod.id} · ${prod.name} · S/ ${prod.price}`);

// 3. cotizar + POST
const subtotal = Math.round(prod.price * cantidad * 100) / 100;
const cot = await req("GET", `/api/orders/cotizar?telefono=${telefono}&subtotal=${subtotal}&unidades=${cantidad}`);
const descCot = cot.datos?.descuentoAutomatico?.monto ?? 0;
paso("GET cotizar", `${cot.status}${cot.status === 200 ? ` · desc S/ ${descCot}` : ""}`);

const cuerpoPost = (total) => ({
  customer: { name: "QA pedido-qa", phone: telefono, location: "QA - borrar", reference: "pedido-qa.mjs" },
  items: [{ id: Number(prod.id), name: prod.name, price: prod.price, quantity: cantidad, unit: prod.unit, category: prod.category }],
  total,
  paymentMethod: pago,
  notes: "pedido-qa.mjs (prueba, se borra)",
});
const clave = `pedido-qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const post = (total) =>
  req("POST", "/api/orders", {
    cuerpo: cuerpoPost(total),
    headers: { "x-csrf-token": csrf, "x-idempotency-key": clave, "idempotency-key": clave },
  });

let r = await post(Math.max(0, Math.round((subtotal - descCot) * 100) / 100));
const codigos = [`POST ${r.status}`];
if (r.status === 422 && r.datos?.code === "TOTAL_MISMATCH") {
  r = await post(r.datos.serverTotal);
  codigos.push(`reintento con serverTotal ${r.datos?.serverTotal ?? ""} → ${r.status}`.trim());
}
const cookiesPost = guardar(r.res);
const pedidoCreado = r.status === 201 || r.status === 200 ? r.datos : null;
paso("POST /api/orders", codigos.join(" · "));
if (!pedidoCreado?.id) {
  paso("error", JSON.stringify(r.datos).slice(0, 200));
  imprimir();
  process.exit(1);
}
const id = pedidoCreado.id;
const total = pedidoCreado.total;
const desc = pedidoCreado.descuentoAplicado;
const stockCreado = await leerStock();

// 5. cancelar
let stockCancelado = null;
if (cancelar) {
  const n = cancelarDoble ? 2 : 1;
  const rs = await Promise.all(
    Array.from({ length: n }, () => adm("PATCH", `/api/orders/${id}`, { status: "cancelado" })),
  );
  paso(cancelarDoble ? "PATCH cancelado x2" : "PATCH cancelado", rs.map((x) => x.status).join(" + "));
  stockCancelado = await leerStock();
}

// 7. borrar
if (!dejar) {
  const d = await adm("DELETE", `/api/orders/${id}`);
  paso("DELETE", String(d.status));
  const g = await adm("GET", `/api/orders/${id}`);
  paso("GET tras borrar", String(g.status));
}

function imprimir() {
  const resumen = {
    id: id ?? null,
    telefono,
    total: total ?? null,
    descuentoAplicado: desc ?? null,
    stock: { antes: stockAntes, creado: stockCreado ?? null, cancelado: stockCancelado },
    setCookiePost: cookiesPost,
    pasos: Object.fromEntries(filas),
  };
  if (json) return console.log(JSON.stringify(resumen));
  console.table(filas.map(([paso, resultado]) => ({ paso, resultado })));
  console.table([
    {
      id: resumen.id,
      total: resumen.total,
      descuentoAplicado: JSON.stringify(resumen.descuentoAplicado),
      "stock antes": stockAntes,
      "stock creado": stockCreado,
      "stock cancelado": stockCancelado ?? "-",
      "Set-Cookie del POST": cookiesPost.length ? cookiesPost.join(", ") : "ninguna",
    },
  ]);
  if (telefonoAleatorio) console.log(`Aviso: el cliente ${telefono} ("QA pedido-qa") queda guardado en main (el DELETE no borra el Customer).`);
  if (dejar) console.log(`Pedido dejado: ${id} (borrar con DELETE /api/orders/${id}).`);
}
imprimir();
