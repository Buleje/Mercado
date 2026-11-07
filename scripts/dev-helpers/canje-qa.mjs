#!/usr/bin/env node
/**
 * canje-qa — el canje de puntos de punta a punta en `main` (dev local), en UNA
 * llamada, y lo deshace todo.
 *
 * Por qué (2026-10-08): probar «canjear puntos de verdad» pide ~20 requests
 * (csrf, cliente, puntos, sesión verificada, cotizar, POST, saldo, carrera,
 * cancelar ×2, borrar). Reviewer y security lo vuelven a correr con esto.
 *
 * Uso:  node scripts/dev-helpers/canje-qa.mjs [--puntos 500] [--json]
 *
 * Pasos: cliente nuevo (teléfono al azar) con 1000 pts → sesión VERIFICADA
 * (test-session, solo dev) → invitado con canje = 401 → canje = 201 y saldo
 * baja → misma clave = 200 sin canjear otra vez → dos pedidos A LA VEZ con el
 * mismo saldo = uno 201 y otro 409 → sesión de GOOGLE (ficha de ese teléfono
 * por el vínculo por correo de antes, o `google_<id>` que termina en el
 * teléfono) no canjea, no ve el historial ni los puntos → cancelar ×2 a la vez
 * devuelve una vez → BORRAR sin cancelar devuelve el saldo → borrar pedidos,
 * puntos a 0 y borrar el cliente.
 *
 * Límites: SOLO tenant `main` en localhost. Gasta 6 POST /api/orders y 2
 * cotizar del límite STRICT (10 cada 15 min por IP).
 */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BSM_BASE || "http://localhost:3000";
const TENANT = "main";
const AQUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("node scripts/dev-helpers/canje-qa.mjs [--puntos 500] [--json]");
  process.exit(0);
}
const valor = (n, def) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const json = args.includes("--json");
const PUNTOS = Math.max(100, Math.floor(Number(valor("--puntos", "500")) / 100) * 100);
const CREDITO = 2 * PUNTOS;

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Solo contra el dev local (BSM_BASE=${BASE}).`);
  process.exit(2);
}

const telefono = "9" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
const filas = [];
const paso = (k, v) => filas.push({ paso: k, resultado: v });
const r2 = (n) => Math.round(n * 100) / 100;

const jar = new Map();
const guardar = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    jar.set(par.slice(0, i), par.slice(i + 1));
  }
};
const cookieHeader = (sinSesion = false) =>
  [...jar].filter(([k]) => !(sinSesion && k === "buleje-customer-sess")).map(([k, v]) => `${k}=${v}`).join("; ");

/** Token de cliente firmado como lo firma `createCustomerToken` (AUTH_SECRET de .env.local). */
const SECRETO = (readFileSync(join(AQUI, "../../.env.local"), "utf8").match(/^AUTH_SECRET="?([^"\n]+)"?/m) ?? [])[1];
const tokenCliente = (payload) => {
  const enc = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 3_600_000 }), "utf8").toString("base64");
  return `${enc}.${createHmac("sha256", `${SECRETO}-customer`).update(enc).digest("base64")}`;
};

async function req(method, ruta, { cuerpo, headers = {}, cookie = "cliente" } = {}) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: {
      "x-tenant-id": TENANT,
      ...(cuerpo ? { "content-type": "application/json" } : {}),
      ...(cookie === "cliente" ? { cookie: cookieHeader() } : {}),
      ...(cookie === "invitado" ? { cookie: cookieHeader(true) } : {}),
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

const admin = JSON.parse(execFileSync("node", [join(AQUI, "admin-auth.mjs"), "--json"], { encoding: "utf8" }));
const adm = (m, r, cuerpo) =>
  req(m, r, { cuerpo, headers: { cookie: admin.cookieHeader, "x-csrf-token": admin.csrf }, cookie: "ninguna" });

const creados = [];
let clienteCreado = false;
const leerSaldo = async () => (await req("GET", `/api/loyalty/${telefono}`)).datos?.loyaltyPoints;
try {
  // 1. csrf + cliente con puntos
  guardar((await req("GET", "/", { cookie: "ninguna" })).res);
  const csrf = jar.get("csrf-token");
  if (!csrf) throw new Error("GET / no dejó csrf-token");
  const alta = await adm("POST", "/api/customers", { phone: telefono, name: "QA canje-qa", location: "QA - borrar" });
  clienteCreado = alta.status < 300;
  const credito = await adm("PATCH", `/api/loyalty/${telefono}`, { points: CREDITO, reason: "canje-qa" });
  paso("cliente + puntos", `${telefono} · alta ${alta.status} · crédito ${credito.status} → ${credito.datos?.loyaltyPoints ?? "?"} pts`);

  // 2. sesión VERIFICADA (provider e2e, solo dev)
  const ses = await req("POST", "/api/auth/customer/test-session", {
    cuerpo: { phone: telefono, name: "QA canje-qa", tenantId: TENANT },
    headers: { "x-csrf-token": csrf },
  });
  guardar(ses.res);
  const saldo0 = await leerSaldo();
  paso("sesión verificada", `test-session ${ses.status} · saldo ${saldo0}`);

  // 3. producto y total con la MISMA fórmula (subtotal − descuento − puntos)
  const lista = (await adm("GET", "/api/products?limit=200")).datos;
  const arr = Array.isArray(lista) ? lista : (lista?.items ?? lista?.products ?? []);
  const prod = arr.find((p) => p.id === 1252384 && p.stock >= 20) ?? arr.find((p) => p.active !== false && p.stock >= 20 && p.price >= 5);
  if (!prod) throw new Error("sin producto con stock");
  const cantidad = Math.max(2, Math.ceil((PUNTOS / 100) * 2 / prod.price) + 1);
  const subtotal = r2(prod.price * cantidad);
  // El descuento automático cambia tras el primer pedido (primera compra):
  // se cotiza de nuevo antes de la carrera.
  let totalConPuntos = 0;
  const cotizar = async (rotulo) => {
    const cot = await req("GET", `/api/orders/cotizar?telefono=${telefono}&subtotal=${subtotal}&unidades=${cantidad}`);
    const desc = cot.datos?.descuentoAutomatico?.monto ?? 0;
    totalConPuntos = r2(r2(subtotal - desc) - PUNTOS / 100);
    paso(rotulo, `${prod.name} ×${cantidad} = S/ ${subtotal} · desc S/ ${desc} (${cot.status}) · con ${PUNTOS} pts = S/ ${totalConPuntos}`);
  };
  await cotizar("producto y cotizar");

  const cuerpo = (puntos, total) => ({
    customer: { name: "QA canje-qa", phone: telefono, location: "QA - borrar", reference: "canje-qa.mjs" },
    items: [{ id: Number(prod.id), name: prod.name, price: prod.price, quantity: cantidad, unit: prod.unit }],
    total,
    paymentMethod: "efectivo",
    notes: "canje-qa.mjs (prueba, se borra)",
    puntosACanjear: puntos,
  });
  const post = (puntos, clave, cookie = "cliente") =>
    req("POST", "/api/orders", {
      cuerpo: cuerpo(puntos, totalConPuntos),
      headers: { "x-csrf-token": csrf, "x-idempotency-key": clave },
      cookie,
    });
  const anotar = (r) => {
    if ((r.status === 201 || r.status === 200) && r.datos?.id && !creados.includes(r.datos.id)) creados.push(r.datos.id);
  };

  // 4. invitado con canje → 401, saldo intacto
  const inv = await post(PUNTOS, `canje-qa-inv-${Date.now()}`, "invitado");
  anotar(inv);
  paso("invitado con canje", `${inv.status} ${inv.datos?.code ?? ""} · saldo ${await leerSaldo()}`);

  // 5. canje válido → 201, saldo baja
  const clave = `canje-qa-${Date.now()}`;
  const ok = await post(PUNTOS, clave);
  anotar(ok);
  const saldo1 = await leerSaldo();
  paso("POST con canje", `${ok.status} · total S/ ${ok.datos?.total} · puntos ${JSON.stringify(ok.datos?.puntosCanjeados)} · saldo ${saldo0} → ${saldo1}`);
  if (ok.status !== 201) paso("error", JSON.stringify(ok.datos).slice(0, 300));

  // 6. misma clave → 200 mismo pedido, saldo igual
  const rep = await post(PUNTOS, clave);
  anotar(rep);
  paso("misma clave", `${rep.status} · mismo id ${rep.datos?.id === ok.datos?.id} · saldo ${await leerSaldo()}`);

  // 7. dos pedidos A LA VEZ con el mismo saldo restante (= PUNTOS)
  await cotizar("cotizar de nuevo");
  const [a, b] = await Promise.all([post(saldo1, `canje-qa-a-${Date.now()}`), post(saldo1, `canje-qa-b-${Date.now()}`)]);
  anotar(a);
  anotar(b);
  // total de esos dos: con `saldo1` puntos
  paso("2 a la vez con saldo " + saldo1, `${a.status} ${a.datos?.code ?? ""} + ${b.status} ${b.datos?.code ?? ""} · saldo ${await leerSaldo()}`);

  // 7b. sesión de GOOGLE: no prueba el teléfono (security 08-10)
  const control = await req("GET", `/api/orders?phone=${telefono}`);
  paso("control sesión de teléfono", `historial ${Array.isArray(control.datos) ? control.datos.length : control.status} pedidos · puntos ${(await req("GET", `/api/loyalty/${telefono}`)).status}`);
  const sinSes = await req("GET", `/api/loyalty/${telefono}`, { cookie: "ninguna" });
  paso("puntos sin sesión", `${sinSes.status} · datos ${JSON.stringify(sinSes.datos).slice(0, 60)}`);
  if (SECRETO) {
    const google = {
      "Google con la ficha del teléfono (vínculo por correo de antes)": telefono,
      "Google google_<id> que termina en el teléfono": `google_1177${String(Date.now()).slice(-6)}${telefono}`,
    };
    for (const [rotulo, customerId] of Object.entries(google)) {
      const tok = tokenCliente({ customerId, email: "atacante@gmail.com", name: "Atacante", tenantId: TENANT, provider: "google" });
      const conG = { headers: { cookie: `buleje-customer-sess=${tok}; csrf-token=${csrf}` }, cookie: "ninguna" };
      const hist = await req("GET", `/api/orders?phone=${telefono}`, conG);
      const pts = await req("GET", `/api/loyalty/${telefono}`, conG);
      const hst = await req("GET", `/api/loyalty/${telefono}/history`, conG);
      let canjeG = "-";
      if (customerId === telefono) {
        const r = await req("POST", "/api/orders", {
          cuerpo: cuerpo(100, r2(totalConPuntos + (PUNTOS - 100) / 100)),
          headers: { ...conG.headers, "x-csrf-token": csrf, "x-idempotency-key": `canje-qa-g-${Date.now()}` },
          cookie: "ninguna",
        });
        anotar(r);
        canjeG = `${r.status} ${r.datos?.code ?? ""}`;
      }
      paso(rotulo, `historial ${Array.isArray(hist.datos) ? hist.datos.length : hist.status} · puntos ${pts.status} · movimientos ${hst.status} · canje ${canjeG} · saldo ${await leerSaldo()}`);
    }
  } else paso("Google", "sin AUTH_SECRET en .env.local: no se probó");

  // 8. cancelar el primero dos veces a la vez; los demás se BORRAN sin
  //    cancelar (el «Rechazar Yape» del panel): el canje vuelve igual.
  for (const [i, id] of [...creados.entries()]) {
    if (i === 0) {
      const rs = await Promise.all([1, 2].map(() => adm("PATCH", `/api/orders/${id}`, { status: "cancelado" })));
      paso(`cancelar ${id} ×2`, `${rs.map((x) => x.status).join(" + ")} · saldo ${await leerSaldo()}`);
    } else {
      const antes = await leerSaldo();
      const del = await adm("DELETE", `/api/orders/${id}`);
      paso(`borrar sin cancelar ${id}`, `${del.status} · saldo ${antes} → ${await leerSaldo()}`);
    }
  }
} finally {
  // 9. deshacer: pedidos, puntos y cliente
  for (const id of creados) await adm("DELETE", `/api/orders/${id}`);
  const quedan = await leerSaldo();
  if (typeof quedan === "number" && quedan > 0) await adm("PATCH", `/api/loyalty/${telefono}`, { points: -quedan });
  const borrado = clienteCreado ? (await adm("DELETE", `/api/customers/${telefono}`)).status : "-";
  paso("deshacer", `pedidos borrados ${creados.length} · cliente ${borrado}`);
  if (json) console.log(JSON.stringify({ telefono, filas }));
  else console.table(filas);
}
