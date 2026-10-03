#!/usr/bin/env node
/**
 * qa-sembrar-libro — vuelve a poblar el Libro CTP del tenant `main` (QA).
 *
 * SOLO PARA `main` en localhost. Escribe únicamente por las rutas API reales del
 * servidor dev (login `qaadmin`), nunca SQL ni Prisma. Aborta si `/api/auth/me`
 * no responde tenant `main`. No llama a `ctp-purga` ni toca otro tenant.
 *
 * Qué siembra (todo con prefijo `QA-SEM-`):
 *   · 3 ingresos con GTF: QA-SEM-001 Tornillo (set-2026), QA-SEM-002 Cumala
 *     (fin de set-2026), QA-SEM-003 Tornillo (oct-2026). 8 trozas cada uno,
 *     recepcionados.
 *   · 4 lotes de aserrío:
 *       QA-SEM-L1  Tornillo  consumido · corrida en m³ CON paquetes
 *       QA-SEM-L2  Tornillo  consumido · corrida en m³ SIN paquetes
 *       QA-SEM-L3  Tornillo  abierto   · trozas apartadas, sin corrida
 *       QA-SEM-L4  Cumala    consumido · corrida en m³ CON paquetes
 *   · el resto de las trozas queda suelto en el patio (sin lote).
 *   · 1 despacho con guía (QA-SEM-GS-001) de un paquete de la corrida de L1.
 *
 * Idempotente: si la GTF / el lote / la guía ya existen, avisa y no duplica.
 * Fechas: setiembre y octubre de 2026 (mayo-2026 está cerrado en `main`).
 *
 * Cómo correrlo (dev server en :3000):   node scripts/qa-sembrar-libro.mjs
 * El JWT dura ~10 min: si una ruta responde 401 el script vuelve a loguearse.
 */

const BASE = process.env.BSM_BASE || "http://localhost:3000";
const T = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const PRODUCTO = "Madera aserrada";
const DESTINO_QA = "Cliente QA Pucallpa";

if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) {
  console.error(`Abortado: ${BASE} no es localhost. Este script es solo para el tenant main de QA.`);
  process.exit(1);
}

// ─── Sesión ──────────────────────────────────────────────────────────────────

let H = {};
async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tenant-id": T },
    body: JSON.stringify({ username: USER, password: PASS, tenantSlug: T }),
  });
  if (!r.ok) throw new Error(`login ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const ck = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const csrf = /csrf-token=([^;]+)/.exec(ck)?.[1];
  H = {
    cookie: ck,
    "content-type": "application/json",
    "x-tenant-id": T,
    ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
  };
}

/** Llamada a la API; si el JWT venció (401) se re-loguea y reintenta una vez. */
async function c(method, url, body) {
  const go = async () => {
    const r = await fetch(BASE + url, {
      method,
      headers: H,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
  };
  let res = await go();
  if (res.status === 401) {
    await login();
    res = await go();
  }
  return res;
}

/** Como `c`, pero corta el script mostrando el cuerpo si la ruta no respondió 2xx. */
async function ok(paso, method, url, body) {
  const res = await c(method, url, body);
  if (!res.ok) {
    console.error(`\nFALLÓ «${paso}» → ${method} ${url} → HTTP ${res.status}`);
    console.error(JSON.stringify(res.j, null, 2).slice(0, 1500));
    process.exit(1);
  }
  return res.j;
}

// ─── Datos a sembrar ─────────────────────────────────────────────────────────

const ESPECIES = {
  Tornillo: "Cedrelinga cateniformis",
  Cumala: "Virola sebifera",
};

/** [diámetro cm, largo m] de cada una de las 8 trozas. */
const INGRESOS = [
  {
    gtf: "QA-SEM-001",
    especie: "Tornillo",
    fecha: "2026-09-14",
    recepcion: "2026-09-15",
    trozas: [[64, 6.22], [60, 5.8], [68, 6.0], [62, 5.5], [66, 6.2], [58, 5.0], [70, 6.4], [55, 4.8]],
  },
  {
    gtf: "QA-SEM-002",
    especie: "Cumala",
    fecha: "2026-09-29",
    recepcion: "2026-09-30",
    trozas: [[52, 5.2], [56, 5.6], [60, 6.0], [48, 4.8], [54, 5.4], [50, 5.0], [58, 5.8], [46, 4.6]],
  },
  {
    gtf: "QA-SEM-003",
    especie: "Tornillo",
    fecha: "2026-10-01",
    recepcion: "2026-10-01",
    trozas: [[62, 6.0], [66, 6.2], [60, 5.6], [64, 6.1], [58, 5.4], [68, 6.3], [56, 5.2], [60, 5.8]],
  },
];

/** `ing` = índice en INGRESOS · `trozas` = qué trozas (0-based) entran al lote. */
const LOTES = [
  {
    code: "QA-SEM-L1", ing: 0, trozas: [0, 1, 2, 3], fecha: "2026-09-16",
    // medidas en cm / m · `peso` = parte del volumen producido que lleva cada paquete.
    paquetes: [
      { codigo: "QA-SEM-L1-P1", e: 5.08, a: 15.24, l: 3.05, peso: 0.4 },
      { codigo: "QA-SEM-L1-P2", e: 5.08, a: 20.32, l: 3.66, peso: 0.35 },
      { codigo: "QA-SEM-L1-P3", e: 7.62, a: 20.32, l: 3.05, peso: 0.25 },
    ],
    rendimiento: 0.5,
  },
  { code: "QA-SEM-L2", ing: 0, trozas: [4, 5], fecha: "2026-09-18", paquetes: null, rendimiento: 0.5 },
  { code: "QA-SEM-L3", ing: 2, trozas: [0, 1, 2, 3], fecha: null, paquetes: null, rendimiento: null },
  {
    code: "QA-SEM-L4", ing: 1, trozas: [0, 1, 2, 3, 4], fecha: "2026-10-01",
    paquetes: [
      { codigo: "QA-SEM-L4-P1", e: 5.08, a: 15.24, l: 3.05, peso: 0.45 },
      { codigo: "QA-SEM-L4-P2", e: 5.08, a: 25.4, l: 3.66, peso: 0.3 },
      { codigo: "QA-SEM-L4-P3", e: 2.54, a: 20.32, l: 3.05, peso: 0.25 },
    ],
    rendimiento: 0.48,
  },
];

const GUIA_SALIDA = "QA-SEM-GS-001";
const FECHA_DESPACHO = "2026-10-02";

const r3 = (n) => Math.round(n * 1000) / 1000;
const r4 = (n) => Math.round(n * 10000) / 10000;
const volTroza = (d, l) => r3((Math.PI / 4) * (d / 100) ** 2 * l);
const isoMediodia = (dia) => `${dia}T12:00:00.000Z`;

/** Paquetes con `cantidad` entera y volumen exacto de sus medidas (que sumen lo declarado). */
function armarPaquetes(spec, volumenProducido) {
  return spec.map((p) => {
    const porPieza = (p.e * p.a * p.l) / 10000;
    const cantidad = Math.max(1, Math.round((volumenProducido * p.peso) / porPieza));
    return {
      codigo: p.codigo,
      productType: PRODUCTO,
      presentacion: "Paquete",
      cantidad,
      volumenM3: r4(cantidad * porPieza),
      espesorCm: p.e,
      anchoCm: p.a,
      largoM: p.l,
    };
  });
}

// ─── Pasos ───────────────────────────────────────────────────────────────────

const log = (...a) => console.log(...a);

async function asegurarIngreso(spec) {
  const lista = (await ok(`buscar ${spec.gtf}`, "GET", `/api/admin/forestal/wood-entries?gtf=${encodeURIComponent(spec.gtf)}&limit=10`)).entries ?? [];
  const previo = lista.find((e) => e.gtfNumber === spec.gtf);
  if (previo) {
    log(`= ingreso ${spec.gtf} ya existe (${spec.especie}) · no se duplica`);
    return previo.id;
  }
  const trozas = spec.trozas.map(([d, l], i) => ({
    orden: i + 1,
    codificacion: `${spec.gtf}/${i + 1}`,
    especieComun: spec.especie,
    especieCientifica: ESPECIES[spec.especie],
    dimensiones: `${d} X ${d} X ${l}`,
    largoM: l,
    diametroCm: d,
    d1Cm: d,
    d2Cm: d,
    cantidad: 1,
    volumenM3: volTroza(d, l),
  }));
  const total = r3(trozas.reduce((s, t) => s + t.volumenM3, 0));
  const nuevo = await ok(`crear ingreso ${spec.gtf}`, "POST", "/api/admin/forestal/wood-entries", {
    gtfNumber: spec.gtf,
    providerName: "Maderera QA Sembrado SAC",
    speciesCommonName: spec.especie,
    speciesScientificName: ESPECIES[spec.especie],
    productType: "rolliza",
    volumeM3: total,
    pieces: trozas.length,
    entryDate: isoMediodia(spec.fecha),
    gtfDate: isoMediodia(spec.fecha),
    trozas,
  });
  const id = nuevo.entry.id;
  await ok(`recepcionar ${spec.gtf}`, "PATCH", `/api/admin/forestal/wood-entries/${id}`, {
    action: "recepcionar",
    fecha: spec.recepcion,
  });
  log(`+ ingreso ${spec.gtf} · ${spec.especie} · ${trozas.length} trozas · ${total} m³ · recepcionado ${spec.recepcion}`);
  return id;
}

const trozasDe = async (entryId) =>
  (await ok("leer trozas", "GET", `/api/admin/forestal/trozas?woodEntryId=${entryId}`)).trozas ?? [];

async function asegurarLote(spec, entryId, lotesExistentes) {
  const previo = lotesExistentes.find((l) => l.code === spec.code);
  if (previo) {
    log(`= lote ${spec.code} ya existe (${previo.status}) · no se duplica`);
    return;
  }
  const ing = INGRESOS[spec.ing];
  const pz = await trozasDe(entryId);
  const porCodigo = new Map(pz.map((t) => [t.codificacion, t]));
  const elegidas = spec.trozas.map((i) => porCodigo.get(`${ing.gtf}/${i + 1}`)).filter(Boolean);
  if (elegidas.length !== spec.trozas.length) {
    console.error(`FALLÓ ${spec.code}: faltan trozas del ingreso ${ing.gtf} (${elegidas.length}/${spec.trozas.length})`);
    process.exit(1);
  }
  const lote = (await ok(`crear lote ${spec.code}`, "POST", "/api/admin/forestal/lotes-aserrio", {
    modo: "abierto",
    code: spec.code,
    speciesCommon: ing.especie,
    speciesScientific: ESPECIES[ing.especie],
  })).lote;
  await ok(`apartar trozas en ${spec.code}`, "PATCH", "/api/admin/forestal/lotes-aserrio", {
    accion: "agregar",
    loteId: lote.id,
    trozaIds: elegidas.map((t) => t.id),
  });
  const m3 = r3(elegidas.reduce((s, t) => s + Number(t.volumenM3 ?? 0), 0));
  if (!spec.fecha) {
    log(`+ lote ${lote.code} · ${ing.especie} · abierto, ${elegidas.length} trozas apartadas · ${m3} m³ · sin corrida`);
    return;
  }
  const cons = await ok(`consumir ${spec.code}`, "PATCH", "/api/admin/forestal/lotes-aserrio", {
    accion: "consumir",
    loteId: lote.id,
    trozaIds: elegidas.map((t) => t.id),
    fecha: spec.fecha,
  });
  const corridaId = cons.corrida.id;
  const insumo = Number(cons.volumenM3 ?? m3);
  const producido = r4(insumo * spec.rendimiento);
  if (spec.paquetes) {
    const paquetes = armarPaquetes(spec.paquetes, producido);
    const quantity = r4(paquetes.reduce((s, p) => s + p.volumenM3, 0));
    await ok(`declarar producción de ${spec.code}`, "PATCH", "/api/admin/forestal/ctp", {
      id: corridaId,
      action: "declarar_produccion",
      quantity,
      unit: "m3",
      productType: PRODUCTO,
      paquetes,
    });
    log(`+ lote ${lote.code} · ${ing.especie} · consumido ${spec.fecha} · ${insumo} m³ → ${quantity} m³ en ${paquetes.length} paquetes (${spec.paquetes.map((p) => p.codigo).join(", ")})`);
  } else {
    await ok(`declarar producción de ${spec.code}`, "PATCH", "/api/admin/forestal/ctp", {
      id: corridaId,
      action: "declarar_produccion",
      quantity: producido,
      unit: "m3",
      productType: PRODUCTO,
    });
    log(`+ lote ${lote.code} · ${ing.especie} · consumido ${spec.fecha} · ${insumo} m³ → ${producido} m³ sin paquetes`);
  }
}

async function asegurarDespacho() {
  const lotes = (await ok("leer lotes", "GET", "/api/admin/forestal/lotes-aserrio")).lotes ?? [];
  const l1 = lotes.find((l) => l.code === "QA-SEM-L1");
  const corrida = l1?.corridas?.find((x) => x.viva && (x.paquetes ?? []).length > 0);
  if (!corrida) {
    log("- despacho: omitido (L1 no tiene corrida con paquetes)");
    return;
  }
  const despachos = (await ok("leer despachos", "GET", "/api/admin/forestal/ctp?section=despacho")).entries ?? [];
  const previo = despachos.find((d) => d.gtfNumber === GUIA_SALIDA && d.status !== "anulado");
  if (previo) {
    log(`= despacho ${GUIA_SALIDA} ya existe · no se duplica`);
    return;
  }
  const paq = corrida.paquetes[0];
  const nuevo = await ok("registrar despacho", "POST", "/api/admin/forestal/ctp", {
    section: "despacho",
    entryDate: isoMediodia(FECHA_DESPACHO),
    speciesCommon: corrida.speciesCommon ?? "Tornillo",
    productType: paq.productType ?? PRODUCTO,
    presentacion: paq.presentacion ?? "Paquete",
    codigoProducto: paq.codigo,
    quantity: paq.volumenM3,
    unit: "m3",
    pieces: paq.cantidad,
    docType: "GTF",
    gtfNumber: GUIA_SALIDA,
    destino: DESTINO_QA,
    origenes: [{ produccionEntryId: corrida.id, quantity: paq.volumenM3 }],
  });
  const aviso = nuevo.gtfDatosError ? ` (aviso guía: ${nuevo.gtfDatosError})` : "";
  log(`+ despacho ${GUIA_SALIDA} · paquete ${paq.codigo} (${paq.volumenM3} m³ de ${corrida.quantity} m³ de la corrida #${corrida.lineNo}) → ${DESTINO_QA}${aviso}`);
}

// ─── Resumen leído por API ───────────────────────────────────────────────────

async function resumen() {
  log("\n══ Resumen (leído por API) ══");
  const ing = (await ok("resumen ingresos", "GET", "/api/admin/forestal/wood-entries?limit=100")).entries ?? [];
  const nuestros = ing.filter((e) => String(e.gtfNumber).startsWith("QA-SEM-"));
  log(`Ingresos: ${ing.length} en el libro · ${nuestros.length} sembrados (${nuestros.map((e) => `${e.gtfNumber} ${e.speciesCommonName} ${Number(e.volumeM3)} m³`).join(" | ")})`);

  const lotes = (await ok("resumen lotes", "GET", "/api/admin/forestal/lotes-aserrio")).lotes ?? [];
  const porEstado = {};
  for (const l of lotes) porEstado[l.status] = (porEstado[l.status] ?? 0) + 1;
  log(`Lotes de aserrío: ${lotes.length} · por estado ${JSON.stringify(porEstado)}`);
  for (const l of lotes) {
    const cs = (l.corridas ?? []).map((x) => `#${x.lineNo} ${x.quantity} m³ (${(x.paquetes ?? []).length} paq.)`).join(", ");
    log(`  ${l.code} · ${l.speciesCommon} · ${l.status} · ${(l.trozas ?? []).length} trozas · corridas: ${cs || "—"}`);
  }

  const prod = (await ok("resumen corridas", "GET", "/api/admin/forestal/ctp?section=produccion")).entries ?? [];
  const vivas = prod.filter((e) => e.status !== "anulado");
  log(`Corridas de producción: ${vivas.length} vivas · ${r4(vivas.reduce((s, e) => s + Number(e.quantity ?? 0), 0))} m³`);

  const des = (await ok("resumen despachos", "GET", "/api/admin/forestal/ctp?section=despacho")).entries ?? [];
  log(`Despachos: ${des.filter((e) => e.status !== "anulado").length} vivos`);

  const patio = (await ok("resumen trozas", "GET", "/api/admin/forestal/trozas?listado=1&limite=500")).trozas ?? [];
  const sembradas = patio.filter((t) => String(t.codificacion).startsWith("QA-SEM-"));
  log(`Trozas sembradas: ${sembradas.length} (de ${patio.length} en el libro)`);

  const disp = await ok("resumen disponibles", "GET", "/api/admin/forestal/ctp?disponibles=1");
  log(`Productos disponibles: ${JSON.stringify(disp.totales ?? Object.keys(disp)).slice(0, 400)}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

await login();
const me = await ok("verificar sesión", "GET", "/api/auth/me");
if (me.tenantId !== T) {
  console.error(`Abortado: la sesión es del tenant «${me.tenantId}», no de «${T}». No se escribe nada.`);
  process.exit(1);
}
log(`Sesión: ${me.username} · tenant ${me.tenantId} (QA). Sembrando…\n`);

const entryIds = [];
for (const spec of INGRESOS) entryIds.push(await asegurarIngreso(spec));

const lotesExistentes = (await ok("leer lotes", "GET", "/api/admin/forestal/lotes-aserrio")).lotes ?? [];
for (const spec of LOTES) await asegurarLote(spec, entryIds[spec.ing], lotesExistentes);

await asegurarDespacho();
await resumen();
