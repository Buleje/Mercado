#!/usr/bin/env node
/**
 * qa-sembrar-arbol-ctp — lleva las trozas de UN árbol del Libro TH de `main`
 * hasta el aserradero por el camino de la app, y lo deshace.
 *
 * Por qué (08-10, L13): para ver «Por árbol → Del bosque al aserradero» hace
 * falta una troza del CTP que guarde su línea de Trozado (ADR-450), y eso sólo
 * lo escribe «Recibir» la guía del TH en el CTP. Hacerlo a mano son 6-8
 * llamadas; ADR-450 y L13 lo armaron cada uno de cero.
 *
 * SOLO `main` en localhost, sólo por las rutas API reales (login `qaadmin`).
 *
 *   node scripts/qa-sembrar-arbol-ctp.mjs [--arbol 85-TOR] [--gtf 019-001-0000066] [--aserrar 1]
 *     1. despacha con guía las trozas del árbol que siguen en patio (POST
 *        loth/despacho-guia; la guía pasa sola a la bandeja del CTP);
 *     2. la recibe contando todas (GET + POST guias/guardadas/<id>/recibir);
 *     3. con `--aserrar N`, arma un lote con N de esas piezas, lo consume y
 *        declara la producción (lotes-aserrio + ctp);
 *     4. guarda los ids en el archivo de estado.
 *   node scripts/qa-sembrar-arbol-ctp.mjs --deshacer
 *     borra la corrida, el lote y el ingreso, y anula la guía del TH con sus
 *     despachos (el talonario guarda el N° como anulado, igual que en la app).
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BSM_BASE || "http://localhost:3000";
const T = "main";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) {
  console.error(`Abortado: ${BASE} no es localhost.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const ARBOL = arg("arbol", "85-TOR");
const GTF = arg("gtf", "019-001-0000066");
const ASERRAR = Number(arg("aserrar", "0")) || 0;
const ESTADO = arg("estado", join(tmpdir(), "qa-sembrar-arbol-ctp.json"));
const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // día de Lima

let H = {};
async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-id": T },
    body: JSON.stringify({ username: "qaadmin", password: "Qa-admin-1234", tenantSlug: T }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  const ck = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const csrf = /csrf-token=([^;]+)/.exec(ck)?.[1];
  H = { cookie: ck, "content-type": "application/json", "x-tenant-id": T, ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}) };
}
async function c(method, url, body) {
  const go = async () => {
    const r = await fetch(BASE + url, { method, headers: H, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
  };
  let res = await go();
  if (res.status === 401) {
    await login();
    res = await go();
  }
  return res;
}
async function ok(paso, method, url, body) {
  const res = await c(method, url, body);
  if (!res.ok) {
    console.error(`FALLÓ «${paso}» → ${method} ${url} → HTTP ${res.status}\n${JSON.stringify(res.j).slice(0, 1200)}`);
    process.exit(1);
  }
  return res.j;
}

/** El cuerpo de una GTF del plan «PO 12» de main (concesión, Pasco → planta propia). */
function gtfDatos(destino) {
  return {
    guia: {
      distrito: "Constitución", autoridad: "GERFOR Ucayali", provincia: "Oxapampa", resolucion: "RDF N° 001-2026-GOREU-GERFOR",
      departamento: "Pasco", gtfOrigenNro: "", origenRecurso: "concesion", listaTrozasNro: "10", planManejoTipo: "Plan Operativo (PO)",
      guiaRemisionNro: "", representanteLegal: "",
    },
    titulos: ["17-CPO/C-J-001-02"],
    traslado: {
      ruta: `PC 12, Constitución, Oxapampa, Pasco → ${destino.direccion}, ${destino.distrito}, ${destino.provincia}, ${destino.departamento}`,
      llegada: { distrito: destino.distrito, direccion: destino.direccion, provincia: destino.provincia, departamento: destino.departamento },
      partida: { distrito: "Constitución", direccion: "PC 12", provincia: "Oxapampa", departamento: "Pasco" },
      fechaInicio: hoy,
      fechaFin: hoy,
      puntoLlegada: `${destino.direccion}, ${destino.distrito}, ${destino.provincia}, ${destino.departamento}`,
      puntoPartida: "PC 12, Constitución, Oxapampa, Pasco",
    },
    vehiculo: { modo: "terrestre", tipo: "", marca: "", placa: "ABC-123", licencia: "Q44120987", conductor: "JULIO PAREDES", embarcacion: "", conductorDni: "44120987", placaRemolque: "", tipoTransporte: "privado" },
    comprobante: { tipo: "ninguno", numero: "" },
    propietario: { zona: "", nombre: destino.nombre, docTipo: "RUC", esElCtp: true, distrito: "", direccion: "", docNumero: "", provincia: "", departamento: destino.departamento },
    citesPermiso: "",
    destinatario: { zona: "", nombre: destino.nombre, docTipo: "RUC", distrito: destino.distrito, direccion: destino.direccion, docNumero: destino.ruc, provincia: destino.provincia, departamento: destino.departamento },
    observaciones: "QA L13 — se deshace con --deshacer",
    transportista: { zona: "", nombre: destino.nombre, docTipo: "RUC", distrito: "", direccion: destino.direccion, docNumero: destino.ruc, provincia: "", registroMtc: "", departamento: "" },
  };
}

async function sembrar() {
  if (existsSync(ESTADO)) {
    console.error(`Ya hay una siembra sin deshacer (${ESTADO}). Corre --deshacer primero.`);
    process.exit(1);
  }
  const g = await ok("leer despacho-guia", "GET", "/api/admin/forestal/loth/despacho-guia");
  const trozas = (g.trozas ?? []).filter((t) => t.arbol === ARBOL);
  if (trozas.length === 0) throw new Error(`El árbol ${ARBOL} no tiene trozas en patio en el Libro TH`);
  if (!g.ctpPropio) throw new Error("main no tiene RUC propio para recibir en el CTP");
  const estado = { arbol: ARBOL, gtfNumber: GTF };
  const save = () => writeFileSync(ESTADO, JSON.stringify(estado, null, 2));

  const d = await ok("despachar con guía", "POST", "/api/admin/forestal/loth/despacho-guia", {
    gtfNumber: GTF, gtfDate: hoy, trozas: trozas.map((t) => t.codigo), titularName: null,
    gtfDatos: gtfDatos(g.ctpPropio), confirmarSalto: true, confirmarSerie: true,
  });
  estado.gtfId = d.gtf.id;
  estado.guardadaId = d.ctp?.guardadaId ?? null;
  save();
  console.log(`+ GTF ${GTF} del TH con ${d.lineas} trozas (${trozas.map((t) => t.codigo).join(", ")}) · pase al CTP: ${d.ctp?.estado}`);
  if (!estado.guardadaId) throw new Error(`La guía no pasó a la bandeja del CTP: ${JSON.stringify(d.ctp)}`);

  const { preparado } = await ok("preparar recibir", "GET", `/api/admin/forestal/guias/guardadas/${estado.guardadaId}/recibir`);
  const conteo = preparado.lineas.flatMap((l) => l.trozas.map((t) => ({ orden: t.orden, llego: true, como: "a_mano" })));
  const { recibida } = await ok("recibir contando", "POST", `/api/admin/forestal/guias/guardadas/${estado.guardadaId}/recibir`, {
    fechaLlegada: hoy, huella: preparado.huella, conteo,
  });
  estado.ingresos = recibida.ingresos.map((i) => i.id);
  save();
  console.log(`+ recibida en el CTP: ingresos ${recibida.ingresos.map((i) => `N° ${i.libroNro}`).join(", ")} · ${recibida.llegaron} trozas llegaron · recepción ${recibida.recibida ? "ok" : recibida.motivoSinRecibir}`);

  if (ASERRAR > 0) {
    const pz = (await ok("leer trozas", "GET", `/api/admin/forestal/trozas?woodEntryId=${estado.ingresos[0]}`)).trozas ?? [];
    const elegidas = pz.slice(0, ASERRAR);
    const ing = recibida.ingresos[0];
    const lote = (await ok("crear lote", "POST", "/api/admin/forestal/lotes-aserrio", {
      modo: "abierto", code: `QA-L13-${Date.now().toString(36).slice(-4).toUpperCase()}`, speciesCommon: ing.especie,
    })).lote;
    estado.loteId = lote.id;
    save();
    await ok("apartar", "PATCH", "/api/admin/forestal/lotes-aserrio", { accion: "agregar", loteId: lote.id, trozaIds: elegidas.map((t) => t.id) });
    const cons = await ok("consumir", "PATCH", "/api/admin/forestal/lotes-aserrio", {
      accion: "consumir", loteId: lote.id, trozaIds: elegidas.map((t) => t.id), fecha: hoy,
    });
    estado.corridaId = cons.corrida.id;
    save();
    const m3 = Number(cons.volumenM3 ?? 0);
    await ok("declarar producción", "PATCH", "/api/admin/forestal/ctp", {
      id: estado.corridaId, action: "declarar_produccion", quantity: Math.round(m3 * 0.45 * 1e4) / 1e4, unit: "m3", productType: "Madera aserrada",
    });
    console.log(`+ lote ${lote.code} consumido en la corrida ${cons.corrida.lineNo ?? cons.corrida.id} (${elegidas.map((t) => t.codificacion).join(", ")} · ${m3} m³)`);
  }
  console.log(`Estado en ${ESTADO}. Deshacer: node scripts/qa-sembrar-arbol-ctp.mjs --deshacer`);
}

async function deshacer() {
  if (!existsSync(ESTADO)) {
    console.log(`Nada que deshacer (${ESTADO} no existe).`);
    return;
  }
  const e = JSON.parse(readFileSync(ESTADO, "utf8"));
  const paso = async (nombre, method, url, body) => {
    const r = await c(method, url, body);
    console.log(`${r.ok ? "-" : "!"} ${nombre}: HTTP ${r.status}${r.ok ? "" : ` ${JSON.stringify(r.j).slice(0, 300)}`}`);
    return r.ok;
  };
  if (e.corridaId) {
    await paso("anular corrida", "PATCH", "/api/admin/forestal/ctp", { id: e.corridaId, action: "annul", reason: "QA L13 deshacer siembra" });
    await paso("borrar corrida", "DELETE", `/api/admin/forestal/ctp?id=${e.corridaId}`);
  }
  if (e.loteId) await paso("borrar lote", "DELETE", `/api/admin/forestal/lotes-aserrio?id=${e.loteId}`);
  for (const id of e.ingresos ?? []) {
    if (!(await paso(`borrar ingreso ${id}`, "PATCH", `/api/admin/forestal/wood-entries/${id}`, { action: "delete" }))) {
      await paso(`anular ingreso ${id}`, "PATCH", `/api/admin/forestal/wood-entries/${id}`, { action: "annul", reason: "QA L13 deshacer siembra" });
      await paso(`borrar ingreso ${id}`, "PATCH", `/api/admin/forestal/wood-entries/${id}`, { action: "delete" });
    }
  }
  if (e.gtfId) {
    await paso("anular la guía del TH y sus despachos", "PATCH", "/api/admin/forestal/loth/despacho-guia", {
      id: e.gtfId, action: "anular", reason: "QA L13 deshacer siembra", conDespachos: true,
    });
  }
  /* Anular la guía del TH ya la saca de la bandeja del CTP (`alAnular`): un 404 acá es lo esperado. */
  if (e.guardadaId) {
    const r = await c("DELETE", `/api/admin/forestal/guias/guardadas/${e.guardadaId}`);
    console.log(`- guía guardada: ${r.status === 404 ? "ya la quitó la anulación" : `HTTP ${r.status}`}`);
  }
  rmSync(ESTADO);
}

await login();
const me = await ok("sesión", "GET", "/api/auth/me");
// `/api/auth/me` devuelve el payload del JWT: `tenantId` ("main" en main), sin slug. Sin él no se sigue.
const tenantDeLaSesion = me.user?.tenantId ?? me.tenantId;
if (tenantDeLaSesion !== T) {
  console.error(`Abortado: la sesión es del tenant ${tenantDeLaSesion ?? "(no informado)"}, no de main.`);
  process.exit(1);
}
await (args.includes("--deshacer") ? deshacer() : sembrar());
