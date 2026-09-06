/**
 * scripts/seed-forestal-ctp.mjs
 *
 * Siembra un CTP con la cadena de custodia COMPLETA: guías → trozas → recepción
 * en patio → corridas de producción → despacho.
 *
 * Por qué existe: el tenant de QA tenía 0 trozas y 0 consumos, así que las
 * pantallas del Libro de Operaciones sólo se podían verificar inyectando
 * fixtures con `page.route`. Un stub prueba que el componente DIBUJA; no prueba
 * que el endpoint, la invariante y el componente digan lo mismo.
 *
 * Por qué por HTTP y no con Prisma directo: las DB classes importan
 * `server-only` y arrastran extensiones (audit, query-monitor) que fuera de Next
 * se cuelgan. Sembrar por los endpoints reales además EJERCITA lo que importa
 * —Zod, RBAC, CSRF y las invariantes I1-I6/T1—, así que si el seed pasa, la
 * cadena que deja es una que la app acepta de verdad.
 *
 * Uso (el dev server tiene que estar arriba):
 *   node scripts/dev-helpers/admin-auth.mjs   # deja la sesión en /tmp/bsm-auth.env
 *   node scripts/seed-forestal-ctp.mjs
 *
 * Es IDEMPOTENTE por N° de guía: si ya están, no duplica y sale.
 */

import fs from "node:fs";

const AUTH = "/tmp/bsm-auth.env";
if (!fs.existsSync(AUTH)) {
  console.error(`\n❌ Falta ${AUTH}. Corré primero:\n   node scripts/dev-helpers/admin-auth.mjs\n`);
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(AUTH, "utf8").split("\n").filter((l) => l.startsWith("export ")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(7, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
  }),
);
const BASE = env.BSM_BASE ?? "http://localhost:3000";

async function api(metodo, ruta, body) {
  const init = {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      Cookie: env.BSM_COOKIE,
      "x-csrf-token": env.BSM_CSRF,
    },
  };
  // El body se agrega sólo si hay: pasarlo en `undefined` sobre un GET es una
  // combinación inválida de fetch (y el linter la marca, con razón).
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${ruta}`, init);
  const txt = await r.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { raw: txt.slice(0, 300) }; }
  if (!r.ok) {
    const detalle = json.issues
      ? json.issues.map((i) => `${i.path}: ${i.message}`).join(" · ")
      : (json.message ?? json.error ?? JSON.stringify(json).slice(0, 300));
    throw new Error(`${metodo} ${ruta} → ${r.status} · ${detalle}`);
  }
  return json;
}

/** Julio 2026: dentro del trimestre que el libro abre por defecto. */
const d = (dia) => new Date(Date.UTC(2026, 6, dia)).toISOString();

/** Huber sobre el diámetro medio, que es como cubica SERFOR la troza. */
const vol = (largo, d1, d2) => {
  const dm = (d1 + d2) / 2 / 100;
  return Math.round((Math.PI / 4) * dm * dm * largo * 10000) / 10000;
};
const r4 = (n) => Math.round(n * 10000) / 10000;

const GUIAS = [
  {
    gtf: "001-0000201", fecha: d(6),
    proveedor: "Maderera El Aguajal SAC", ruc: "20601234567",
    comun: "Tornillo", cientifico: "Cedrelinga cateniformis", cites: false,
    region: "Ucayali", distrito: "Coronel Portillo", origenCodigo: "CON-25-UCA-0142",
    trozas: [
      { cod: "13/A (0000041)", largo: 5.6, d1: 62, d2: 58, planta: "118", parcela: "PC-03" },
      { cod: "13/A (0000042)", largo: 5.4, d1: 55, d2: 53, planta: "119", parcela: "PC-03" },
      { cod: "13/A (0000043)", largo: 6.1, d1: 71, d2: 68, planta: "120", parcela: "PC-03" },
      { cod: "13/A (0000044)", largo: 5.2, d1: 48, d2: 46, planta: "121", parcela: "PC-04" },
      // Figura en la guía y nunca bajó del camión: se MARCA, no se borra (ADR-325).
      { cod: "13/A (0000045)", largo: 5.0, d1: 44, d2: 43, planta: null, parcela: null, noLlego: true },
    ],
  },
  {
    gtf: "001-0000202", fecha: d(11),
    proveedor: "Forestal Río Pachitea EIRL", ruc: "20487654321",
    comun: "Shihuahuaco", cientifico: "Dipteryx micrantha",
    // CITES Apéndice II: es legal CON permiso, así que NO resta score de
    // cumplimiento — sólo tiene que estar declarada (ver ctp-compliance.ts).
    cites: true,
    region: "Ucayali", distrito: "Padre Abad", origenCodigo: "CON-25-UCA-0207",
    trozas: [
      { cod: "07/B (0000112)", largo: 4.8, d1: 78, d2: 74, planta: "204", parcela: "PC-01" },
      { cod: "07/B (0000113)", largo: 5.1, d1: 82, d2: 79, planta: "205", parcela: "PC-01" },
      { cod: "07/B (0000114)", largo: 4.6, d1: 69, d2: 66, planta: "206", parcela: "PC-02" },
      // Sin código de planta: dispara el aviso "en el patio se busca por ese número".
      { cod: "07/B (0000115)", largo: 4.9, d1: 73, d2: 70, planta: null, parcela: "PC-02" },
    ],
  },
  {
    gtf: "001-0000203", fecha: d(19),
    proveedor: "Maderera El Aguajal SAC", ruc: "20601234567",
    comun: "Capirona", cientifico: "Calycophyllum spruceanum", cites: false,
    region: "Pasco", distrito: "Puerto Bermúdez", origenCodigo: "CON-25-PAS-0033",
    trozas: [
      { cod: "22/C (0000301)", largo: 5.5, d1: 51, d2: 49, planta: "310", parcela: "PC-07" },
      { cod: "22/C (0000302)", largo: 5.3, d1: 47, d2: 45, planta: "311", parcela: "PC-07" },
      { cod: "22/C (0000303)", largo: 5.8, d1: 58, d2: 56, planta: "312", parcela: "PC-08" },
      { cod: "22/C (0000304)", largo: 5.1, d1: 44, d2: 42, planta: "313", parcela: "PC-08" },
      { cod: "22/C (0000305)", largo: 4.7, d1: 41, d2: 40, planta: "314", parcela: "PC-08" },
    ],
  },
];

async function main() {
  console.log(`\n🌳 Seed forestal CTP · ${BASE} · tenant "${env.BSM_TENANT}"\n`);

  const previo = await api("GET", "/api/admin/forestal/wood-entries?limit=500");
  const existentes = new Map(
    (previo.entries ?? [])
      .filter((e) => GUIAS.some((g) => g.gtf === e.gtfNumber))
      .map((e) => [e.gtfNumber, e]),
  );

  // ── 1. Las guías con su lista de piezas ─────────────────────────────────
  // Reanudable paso por paso en vez de abortar: una corrida a medias —por un
  // timeout, un 429 o un Ctrl-C— dejaba el tenant con guías sin consumo y sin
  // forma de completarlo salvo borrando a mano.
  const ingresos = [];
  for (const g of GUIAS) {
    const ya = existentes.get(g.gtf);
    if (ya) {
      ingresos.push({ id: ya.id, def: g, volumen: Number(ya.volumeM3) });
      console.log(`  ↻ GTF ${g.gtf} ya estaba · ${ya.volumeM3} m³`);
      continue;
    }
    const trozas = g.trozas.map((t, i) => ({
      orden: i + 1,
      codificacion: t.cod,
      especieComun: g.comun,
      especieCientifica: g.cientifico,
      dimensiones: `${t.largo} m × ${t.d1}/${t.d2} cm`,
      largoM: t.largo,
      diametroCm: (t.d1 + t.d2) / 2,
      d1Cm: t.d1,
      d2Cm: t.d2,
      cantidad: 1,
      volumenM3: vol(t.largo, t.d1, t.d2),
    }));
    // El volumen del ingreso es el de la GUÍA (todas las piezas declaradas), no
    // el recibido: bajarlo por una troza faltante movería el piso de I2.
    const volumen = r4(trozas.reduce((a, t) => a + t.volumenM3, 0));

    const res = await api("POST", "/api/admin/forestal/wood-entries", {
      gtfNumber: g.gtf, gtfDate: g.fecha, entryDate: g.fecha, docType: "GTF",
      providerName: g.proveedor, providerDocument: g.ruc, providerDocumentType: "RUC",
      speciesCommonName: g.comun, speciesScientificName: g.cientifico, speciesCites: g.cites,
      productType: "rolliza", unit: "m3", volumeM3: volumen, pieces: trozas.length,
      originType: "concesion", originCode: g.origenCodigo,
      originRegion: g.region, originDistrict: g.distrito,
      trozas,
    });
    const id = res.entry?.id ?? res.id;
    if (!id) throw new Error(`El alta de ${g.gtf} no devolvió id: ${JSON.stringify(res).slice(0, 200)}`);
    ingresos.push({ id, def: g, volumen });
    console.log(`  ✓ GTF ${g.gtf} · ${g.comun} · ${volumen} m³ · ${trozas.length} trozas`);
  }

  // ── 2. La recepción en patio ────────────────────────────────────────────
  let faltantes = 0;
  for (const { id, def } of ingresos) {
    const { trozas: filas = [] } = await api("GET", `/api/admin/forestal/trozas?woodEntryId=${id}`);
    const cambios = filas.map((f) => {
      const t = def.trozas.find((x) => x.cod === f.codificacion);
      if (t?.noLlego) faltantes++;
      return {
        id: f.id,
        codigoPlanta: t?.planta ?? null,
        parcela: t?.parcela ?? null,
        noRecepcionada: Boolean(t?.noLlego),
        recepcionObs: t?.noLlego ? "No bajó del camión; el transportista la reportó en origen." : null,
      };
    });
    await api("PATCH", "/api/admin/forestal/trozas", { woodEntryId: id, cambios });
  }
  console.log(`  ✓ Recepción cerrada · ${faltantes} troza(s) marcada(s) como no llegada(s)`);

  // ── 3. Dos corridas de producción ───────────────────────────────────────
  // El consumo se declara en m³ por guía (I1/I2) y ADEMÁS se dice qué piezas
  // fueron (T1): son las dos caras del mismo hecho y tienen que coincidir.
  const [tornillo, shihuahuaco, capirona] = ingresos;
  const corridas = [];

  for (const plan of [
    { etiqueta: "Tornillo", fecha: d(14), origen: tornillo, rinde: 0.58, codigo: "PRO-2607-001",
      piezas: ["13/A (0000041)", "13/A (0000042)", "13/A (0000043)"] },
    { etiqueta: "Shihuahuaco", fecha: d(23), origen: shihuahuaco, rinde: 0.52, codigo: "PRO-2607-002",
      piezas: ["07/B (0000112)", "07/B (0000113)"] },
  ]) {
    const previas = await api("GET", "/api/admin/forestal/ctp?section=produccion&limit=200");
    const yaCorrida = (previas.entries ?? []).find((e) => e.codigoProducto === plan.codigo);
    if (yaCorrida) {
      corridas.push({ id: yaCorrida.id, etiqueta: plan.etiqueta, producido: Number(yaCorrida.quantity) });
      console.log(`  ↻ Corrida ${plan.etiqueta} ya estaba · ${yaCorrida.quantity} m³`);
      continue;
    }
    const { trozas: todas = [] } = await api("GET", `/api/admin/forestal/trozas?woodEntryId=${plan.origen.id}`);
    const elegidas = todas.filter((t) => plan.piezas.includes(t.codificacion));
    const consumido = r4(elegidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
    const producido = r4(consumido * plan.rinde);

    const res = await api("POST", "/api/admin/forestal/ctp", {
      section: "produccion", entryDate: plan.fecha,
      gtfIngreso: plan.origen.def.gtf,
      speciesCommon: plan.origen.def.comun, speciesScientific: plan.origen.def.cientifico,
      cites: plan.origen.def.cites,
      productType: "Madera aserrada", codigoProducto: plan.codigo,
      presentacion: "Pieza", lineaProduccion: "LP",
      volumeInputM3: consumido, quantity: producido, unit: "m3",
      pieces: Math.round(producido * 12),
      costoProceso: Math.round(consumido * 95), moneda: "PEN",
      consumos: [{ woodEntryId: plan.origen.id, volumeM3: consumido }],
    });
    const corridaId = res.entry?.id ?? res.id;
    if (!corridaId) throw new Error(`La corrida de ${plan.etiqueta} no devolvió id`);

    // Y qué PIEZAS concretas entraron a la sierra (ADR-326).
    await api("POST", "/api/admin/forestal/trozas/patio", {
      ctpEntryId: corridaId,
      trozaIds: elegidas.map((t) => t.id),
      fecha: plan.fecha,
    });

    corridas.push({ id: corridaId, etiqueta: plan.etiqueta, producido });
    console.log(`  ✓ Corrida ${plan.etiqueta} · ${consumido} m³ (${elegidas.length} pzas) → ${producido} m³`);
  }

  // ── 4. Un despacho que sale de la primera corrida ───────────────────────
  const yaDespachos = await api("GET", "/api/admin/forestal/ctp?section=despacho&limit=200");
  const despachoHecho = (yaDespachos.entries ?? []).some((e) => e.gtfNumber === "001-0000988");
  const salida = r4(corridas[0].producido * 0.6);
  // `if` y no `return`: cortar acá salteaba el paso 5 (los lotes), así que un
  // seed reanudado nunca llegaba a crearlos.
  if (despachoHecho) {
    console.log("  ↻ El despacho 001-0000988 ya estaba");
  } else {
  await api("POST", "/api/admin/forestal/ctp", {
    section: "despacho", entryDate: d(27),
    speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis",
    productType: "Madera aserrada", presentacion: "Pieza",
    quantity: salida, unit: "m3", pieces: Math.round(salida * 12),
    docType: "GTF", gtfNumber: "001-0000988",
    destino: "Distribuidora Maderas del Centro SAC",
    // I4/I5: un despacho no puede sacar más de lo que la corrida produjo.
    origenes: [{ produccionEntryId: corridas[0].id, quantity: salida }],
  });
  console.log(`  ✓ Despacho GTF 001-0000988 · ${salida} m³ desde ${corridas[0].etiqueta}`);
  }

  // ── 5. Dos lotes comerciales sobre las corridas (ADR-136) ───────────────
  // Uno con despacho encima y otro intacto: sin los dos, la barra de avance del
  // módulo de Lotes se ve siempre igual y no se puede verificar que distinga
  // "sin armar" de "armado y sin salir".
  const yaLotes = await api("GET", "/api/admin/forestal/lotes");
  const codigosPrevios = new Set((yaLotes.lotes ?? []).map((l) => l.destino));
  for (const plan of [
    { corrida: corridas[0], destino: "Distribuidora Maderas del Centro SAC", grado: "Primera", fin: 20 },
    { corrida: corridas[1], destino: "Exportadora Amazonía Viva SAC", grado: "Selecta", fin: 30 },
  ]) {
    if (codigosPrevios.has(plan.destino)) {
      console.log(`  ↻ Lote para ${plan.destino} ya estaba`);
      continue;
    }
    const r = await api("POST", "/api/admin/forestal/lotes", {
      productType: "Madera aserrada",
      speciesCommon: plan.corrida.etiqueta,
      unit: "m3",
      grade: plan.grado,
      destino: plan.destino,
      fechaInicio: "2026-07-14",
      fechaFin: `2026-07-${plan.fin}`,
      titularNombre: "Maderera El Aguajal SAC",
      miembros: [{ produccionEntryId: plan.corrida.id, quantity: plan.corrida.producido }],
    });
    const code = r.lote?.loteCode ?? r.loteCode ?? "(sin código)";
    console.log(`  ✓ Lote ${code} · ${plan.corrida.etiqueta} · ${plan.corrida.producido} m³ → ${plan.destino}`);
  }

  // Capirona queda ENTERA sin consumir a propósito: así el picker de trozas
  // tiene piezas libres que elegir y Saldos tiene stock que mostrar.
  console.log(`  · ${capirona.def.comun} queda sin consumir (stock para el picker)\n`);
  console.log("✅ Listo. Abrí el Libro de Operaciones CTP: Ingresos / Consumos / Producción / Despacho.\n");
}

main().catch((e) => {
  console.error(`\n❌ El seed falló: ${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
});
