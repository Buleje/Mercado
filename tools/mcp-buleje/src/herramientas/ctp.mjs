// Grupo «ctp»: libro CTP y madera en el negocio forestal (Blas). Madera siempre en PT primero, después m³ y piezas.
import { z, negocio, idRuta, dia, limpiar, lista, madera, pick, soles, claveCantidad, leerSeguro, linea60, NO_VERIFICADO } from "../util-herramientas.mjs";

const COL_MADERA = { pt: ["pt", "pies", "ptTotal", "totalPt", "piesTablares"], m3: ["m3", "volumeM3", "volumenM3", "volumeInputM3", "totalM3"], piezas: ["piezas", "pieces", "totalPiezas"] };
const COLS_CTP = [["Fecha", ["entryDate", "fecha"], "f"], ["Sección", ["section"]], ["Especie", ["speciesCommon", "especie", "speciesCommonName"]], ["Producto", ["productType", "producto"]], ["Guía", ["gtfNumber", "gtf"]], ["Destino", ["destino"]]];

/** Número o undefined (los Decimal de Prisma llegan como texto). @param {unknown} v */
const num = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0 ? undefined : Number(v));
/**
 * Dato clave de un asiento CTP = su VOLUMEN (2.ª pasada 29-10): PT primero, después m³; si no trae volumen, la cantidad
 * en su unidad o las piezas; recién sin nada de eso, el código de 3 cifras (null).
 * @param {{ cantidad?: unknown, unidad?: unknown, m3?: unknown, piezas?: unknown }} m
 */
function claveVolumen(m) {
  const cantidad = num(m.cantidad), unidad = String(m.unidad ?? "").toLowerCase();
  if (cantidad && unidad === "pt") return claveCantidad(cantidad, { etiqueta: "Volumen (PT)", unidad: "PT" });
  const m3 = num(m.m3) ?? (unidad === "m3" ? cantidad : undefined);
  if (m3) return claveCantidad(m3, { etiqueta: "Volumen (m³)", unidad: "m³" });
  if (cantidad) return claveCantidad(cantidad, { etiqueta: "Cantidad", unidad: linea60(unidad, 10) });
  const piezas = num(m.piezas);
  return piezas ? claveCantidad(piezas, { etiqueta: "Piezas", unidad: "pzas" }) : null;
}

/** El asiento CTP tal como lo tiene el panel (GET ?entryId=) o null. @param {string} id @param {any} leer */
async function asientoDelPanel(id, leer) {
  const r = await leerSeguro(leer, "/api/admin/forestal/ctp", { entryId: id }, { sinRecorte: true });
  const e = /** @type {any} */ (r.datos)?.entry;
  return r.ok && e && typeof e === "object" ? e : null;
}
/** Lo que salió de una corrida (PT, m³, kg o unidad) o null si no declaró. @param {any} e */
const producto = (e) => {
  const c = num(e.quantity), u = String(e.unit ?? "").toLowerCase();
  if (!c) return null;
  return u === "pt" ? madera({ pt: c, piezas: num(e.pieces) }) : u === "m3" ? madera({ m3: c, piezas: num(e.pieces) }) : `${c} ${linea60(u, 10)}`;
};
/** «corrida N.º 12 de producción · Shihuahuaco · tablas · salió 850 PT de 3,2 m³ de troza · registrado» del panel. @param {any} e */
const queAsiento = (e) => {
  if (!e) return `línea del libro CTP que ${NO_VERIFICADO} (no la pude leer del panel)`;
  const prod = e.section === "produccion";
  const vol = prod
    ? `${producto(e) ? `salió ${producto(e)}` : "sin declarar"}${num(e.volumeInputM3) ? ` de ${madera({ m3: num(e.volumeInputM3) })} de troza` : ""}`
    : madera({ pt: String(e.unit).toLowerCase() === "pt" ? num(e.quantity) : undefined, m3: num(e.volumeInputM3) ?? (String(e.unit).toLowerCase() === "m3" ? num(e.quantity) : undefined), piezas: num(e.pieces) });
  return `${prod ? "corrida" : "línea"} N.º ${e.lineNo ?? "?"} de ${prod ? "producción" : linea60(e.section ?? "?", 20)} · ${linea60(e.speciesCommon ?? "?", 40)}${e.productType ? ` · ${linea60(e.productType, 30)}` : ""} · ${vol} · ${e.status ?? "?"}${e.usadoAt ? " · ya marcada como usada" : ""}`;
};
/** Botones = volumen del asiento según el panel (en una corrida, lo que salió; si no declaró, lo que entró). @param {any} e */
const ventanaAsiento = (e) => ({
  clave: !e ? null : e.section === "produccion" && num(e.quantity)
    ? claveVolumen({ cantidad: e.quantity, unidad: e.unit, piezas: e.pieces })
    : claveVolumen({ cantidad: e.quantity, unidad: e.unit, m3: e.volumeInputM3, piezas: e.pieces }),
  filas: e
    ? [{ etiqueta: "Asiento", valor: linea60(`${e.section ?? "?"} N.º ${e.lineNo ?? "?"}`) }, { etiqueta: "Especie / producto", valor: linea60(`${e.speciesCommon ?? "?"} · ${e.productType ?? "?"}`) }, { etiqueta: "Fecha / estado", valor: `${String(e.entryDate ?? "").slice(0, 10) || "?"} · ${e.status ?? "?"}` }]
    : [{ etiqueta: "Asiento", valor: NO_VERIFICADO }],
});

const VISTAS_CTP = ["lista", "saldos", "disponibles", "conciliacion", "saldo_permisos", "kardex", "historial", "sin_origen", "resumen_jornadas"];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "ctp_ver",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Libro CTP (GET /api/admin/forestal/ctp). vista=lista (asientos de produccion|despacho, con desde/hasta), saldos o disponibles o conciliacion (por especie), saldo_permisos, kardex (especie), historial (entryId), sin_origen. Madera en PT primero, luego m³ y piezas.",
    entrada: {
      negocio,
      vista: z.enum(/** @type {[string, ...string[]]} */ (VISTAS_CTP)).default("lista"),
      seccion: z.enum(["produccion", "despacho"]).optional().describe("Solo vista=lista"),
      especie: z.string().max(120).optional(),
      producto: z.string().max(120).optional().describe("Solo vista=disponibles"),
      entryId: z.string().max(60).optional().describe("Obligatorio en vista=historial"),
      desde: z.string().max(40).optional().describe("Instante ISO, solo vista=lista"),
      hasta: z.string().max(40).optional().describe("Instante ISO, solo vista=lista"),
    },
    pedido: (a) => {
      const v = a.vista ?? "lista";
      const q = {
        saldos: limpiar({ saldos: "1", especie: a.especie }),
        disponibles: limpiar({ disponibles: "1", especie: a.especie, producto: a.producto }),
        conciliacion: limpiar({ conciliacion: "1", especie: a.especie }),
        saldo_permisos: { saldoPermisos: "1" },
        kardex: limpiar({ kardex: a.especie }),
        historial: limpiar({ historial: a.entryId }),
        sin_origen: { sinOrigen: "1" },
        resumen_jornadas: { resumenJornadas: "1" },
        lista: limpiar({ section: a.seccion, from: a.desde, to: a.hasta }),
      }[v];
      return { metodo: "GET", ruta: "/api/admin/forestal/ctp", query: q };
    },
    formatear: (d, a) => (a?.vista ?? "lista") === "lista"
      ? lista(d, { titulo: "Libro CTP", cols: COLS_CTP, colMadera: COL_MADERA })
      : lista(d, { titulo: `CTP (${a?.vista})`, cols: [["Especie", ["especie", "speciesCommon", "speciesCommonName"]], ["Producto", ["productType", "producto"]], ["Permiso", ["permiso", "originCode"]]], colMadera: COL_MADERA, vacio: "Sin filas (puede que la respuesta no sea una lista)." }),
  },
  {
    nombre: "madera_ingresos_ver",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Ingresos de madera al centro (GET /api/admin/forestal/wood-entries): proveedor, guía, especie y volumen (PT primero, luego m³ y piezas). Filtros: texto, guía, especie, fechas. Máx. 50 filas; offset para seguir.",
    entrada: {
      negocio,
      buscar: z.string().max(120).optional(),
      guia: z.string().max(60).optional(),
      especie: z.string().max(120).optional(),
      proveedor: z.string().max(200).optional(),
      desde: dia.optional(),
      hasta: dia.optional(),
      limite: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/forestal/wood-entries", query: limpiar({ search: a.buscar, gtf: a.guia, species: a.especie, provider: a.proveedor, from: a.desde, to: a.hasta, limit: a.limite ?? 50, offset: a.offset }) }),
    formatear: (d) => lista(d, { titulo: "Ingresos de madera", cols: [["Fecha", ["entryDate"], "f"], ["Guía", ["gtfNumber"]], ["Proveedor", ["providerName"]], ["Especie", ["speciesCommonName"]], ["Estado", ["status"]]], colMadera: COL_MADERA }),
  },
  {
    nombre: "madera_ingresos_total",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Totales de los ingresos de madera (GET /api/admin/forestal/wood-entries/aggregate): PT, m³ y piezas, por los mismos filtros.",
    entrada: { negocio, buscar: z.string().max(120).optional(), especie: z.string().max(120).optional(), desde: dia.optional(), hasta: dia.optional() },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/forestal/wood-entries/aggregate", query: limpiar({ search: a.buscar, species: a.especie, from: a.desde, to: a.hasta }) }),
    formatear: (d) => (d && typeof d === "object" ? `Totales de ingresos: ${madera({ pt: pick(d, COL_MADERA.pt), m3: pick(d, COL_MADERA.m3), piezas: pick(d, COL_MADERA.piezas) })}\n${JSON.stringify(d).slice(0, 1500)}` : "Sin datos."),
  },
  {
    nombre: "ctp_registrar",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Registra un asiento en el libro CTP (POST /api/admin/forestal/ctp): producción o despacho de madera. Cambia el saldo de madera (stock). Solo admin/owner. Pide OK de Brandon.",
    entrada: {
      negocio,
      seccion: z.enum(["produccion", "despacho"]),
      fecha: z.string().max(40).optional().describe("AAAA-MM-DD"),
      especie: z.string().min(1).max(120),
      producto: z.string().max(80).optional(),
      cantidad: z.number().nonnegative().max(9999999).optional(),
      unidad: z.enum(["m3", "kg", "unidad", "pt"]).optional(),
      volumenM3: z.number().nonnegative().max(99999).optional(),
      piezas: z.number().int().nonnegative().max(999999).optional(),
      guia: z.string().max(60).optional().describe("N.º de guía"),
      destino: z.string().max(200).optional(),
      titular: z.string().max(160).optional(),
      dueno: z.enum(["propia", "tercero"]).optional(),
      valorVenta: z.number().min(0).optional().describe("S/"),
      observaciones: z.string().max(1000).optional(),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/admin/forestal/ctp",
      cuerpo: limpiar({ section: a.seccion, entryDate: a.fecha, speciesCommon: a.especie, productType: a.producto, quantity: a.cantidad, unit: a.unidad, volumeInputM3: a.volumenM3, pieces: a.piezas, gtfNumber: a.guia, destino: a.destino, titularNombre: a.titular, duenoMadera: a.dueno, valorVenta: a.valorVenta, observations: a.observaciones }),
    }),
    resumen: (a) => `Anotar en el libro CTP (${a.seccion}) ${a.especie}${a.producto ? ` · ${a.producto}` : ""}: ${madera({ pt: a.unidad === "pt" ? a.cantidad : undefined, m3: a.volumenM3 ?? (a.unidad === "m3" ? a.cantidad : undefined), piezas: a.piezas })}${a.guia ? ` · guía ${a.guia}` : ""}${a.destino ? ` → ${a.destino}` : ""}. Cambia el saldo de madera.`,
    ventana: (a) => ({
      clave: claveVolumen({ cantidad: a.cantidad, unidad: a.unidad, m3: a.volumenM3, piezas: a.piezas }),
      filas: [{ etiqueta: "Sección", valor: a.seccion }, { etiqueta: "Especie", valor: a.especie }, ...(a.guia ? [{ etiqueta: "Guía", valor: a.guia }] : [])],
    }),
  },
  {
    nombre: "ctp_anular",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Anula un asiento del libro CTP (PATCH /api/admin/forestal/ctp, action=annul). El saldo de madera vuelve a lo de antes. Pide OK de Brandon.",
    entrada: { negocio, id: z.string().min(1).max(60), motivo: z.string().min(3).max(500) },
    pedido: (a) => ({ metodo: "PATCH", ruta: "/api/admin/forestal/ctp", cuerpo: { id: a.id, action: "annul", reason: a.motivo } }),
    // El asiento se lee del panel por id (GET ?entryId=): su volumen es el dato de los botones (2.ª pasada 29-10).
    previa: async (a, leer) => {
      const r = await leerSeguro(leer, "/api/admin/forestal/ctp", { entryId: a.id });
      const e = /** @type {any} */ (r.datos)?.entry;
      return r.ok && e && typeof e === "object" ? e : null;
    },
    resumen: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const que = e
        ? ` (${linea60(e.section ?? "?", 20)} · ${linea60(e.speciesCommon ?? "?", 40)} · ${madera({ pt: String(e.unit).toLowerCase() === "pt" ? num(e.quantity) : undefined, m3: num(e.volumeInputM3) ?? (String(e.unit).toLowerCase() === "m3" ? num(e.quantity) : undefined), piezas: num(e.pieces) })})`
        : " (no se pudo leer el asiento del panel)";
      return `Anular el asiento CTP ${a.id}${que}. Motivo: ${a.motivo}. El saldo de madera se recalcula.`;
    },
    ventana: (_a, previa) => {
      const e = /** @type {any} */ (previa);
      return {
        clave: e ? claveVolumen({ cantidad: e.quantity, unidad: e.unit, m3: e.volumeInputM3, piezas: e.pieces }) : null,
        filas: e
          ? [{ etiqueta: "Sección", valor: String(e.section ?? "?") }, { etiqueta: "Especie", valor: String(e.speciesCommon ?? "?") }, { etiqueta: "Fecha", valor: String(e.entryDate ?? "").slice(0, 10) || "?" }]
          : [{ etiqueta: "Asiento", valor: "no se pudo leer del panel" }],
      };
    },
  },
  {
    nombre: "madera_ingreso_registrar",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Registra un ingreso de madera al centro con su guía (POST /api/admin/forestal/wood-entries): suma al stock de madera. Volumen en m³. Pide OK de Brandon.",
    entrada: {
      negocio,
      guia: z.string().min(1).max(50),
      fechaGuia: z.string().max(40).optional(),
      proveedor: z.string().min(1).max(200),
      proveedorDocumento: z.string().max(20).optional(),
      especie: z.string().min(1).max(120),
      volumenM3: z.number().positive().max(99999),
      piezas: z.number().int().nonnegative().optional(),
      unidad: z.string().max(20).optional(),
      producto: z.string().max(60).optional(),
      permiso: z.string().max(100).optional().describe("Código de origen / permiso"),
      costoTotal: z.number().min(0).max(99999999.99).optional().describe("S/"),
      fechaIngreso: z.string().max(40).optional(),
      notas: z.string().max(1000).optional(),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/admin/forestal/wood-entries",
      cuerpo: limpiar({ gtfNumber: a.guia, gtfDate: a.fechaGuia, providerName: a.proveedor, providerDocument: a.proveedorDocumento, speciesCommonName: a.especie, volumeM3: a.volumenM3, pieces: a.piezas, unit: a.unidad, productType: a.producto, originCode: a.permiso, costoTotal: a.costoTotal, entryDate: a.fechaIngreso, notes: a.notas }),
    }),
    resumen: (a) => `Ingresar madera de ${a.proveedor}: ${a.especie}, ${madera({ m3: a.volumenM3, piezas: a.piezas })}, guía ${a.guia}${a.costoTotal ? `, costo ${soles(a.costoTotal)}` : ""}. Suma al stock de madera.`,
    ventana: (a) => ({
      clave: claveCantidad(a.volumenM3, { etiqueta: "Volumen", unidad: "m³" }),
      filas: [{ etiqueta: "Proveedor (como lo escribiste)", valor: a.proveedor }, { etiqueta: "Guía", valor: a.guia }, { etiqueta: "Especie", valor: a.especie }],
    }),
  },
  {
    nombre: "ctp_marcar_usado",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Marca (o desmarca) una corrida de producción del libro CTP como «ya se usó» (PATCH /api/admin/forestal/ctp, action=marcar_usado): sale de Productos disponibles sin despacharse; reversible con usado=false. Marcar pide motivo. Solo admin/owner. Volumen en PT o m³. Ej.: {id:\"cm…\", usado:true, motivo:\"se usó en la casa\"}.",
    entrada: {
      negocio,
      id: idRuta.describe("Id de la corrida de producción (ctp_ver vista=lista, sección produccion)"),
      usado: z.boolean().describe("true = ya se usó · false = vuelve a disponibles"),
      motivo: z.string().trim().max(500).optional().describe("Para qué se usó (obligatorio si usado=true)"),
    },
    pedido: (a) => {
      return { metodo: "PATCH", ruta: "/api/admin/forestal/ctp", cuerpo: limpiar({ id: a.id, action: "marcar_usado", usado: a.usado, motivo: a.motivo }) };
    },
    previa: (a, leer) => asientoDelPanel(a.id, leer),
    resumen: (a, previa) => `${a.usado ? "Marcar como ya usada" : "Volver a disponibles"} la ${queAsiento(previa)}.${a.usado ? ` Motivo: ${a.motivo ?? "?"}. Sale de Productos disponibles.` : ""}${a.usado && !(a.motivo && a.motivo.length >= 3) ? " OJO: sin motivo (3+ letras) el panel lo rechaza." : ""}${previa && previa.section !== "produccion" ? " OJO: no es una corrida de producción y el panel la va a rechazar." : ""}`,
    ventana: (_a, previa) => ventanaAsiento(previa),
  },
  {
    nombre: "ctp_declarar_produccion",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Declara lo que produjo una corrida abierta del libro CTP (PATCH /api/admin/forestal/ctp, action=declarar_produccion): producto, cantidad y unidad (PT, m³, kg o unidad). Si la madera es de un tercero, el cobro de aserrío se recalcula. Solo admin/owner. Ej.: {id:\"cm…\", cantidad:850, unidad:\"pt\", producto:\"tablas\", piezas:48}.",
    entrada: {
      negocio,
      id: idRuta.describe("Id de la corrida (ctp_ver vista=lista, sección produccion)"),
      cantidad: z.number().positive().max(9999999).describe("Cuánto salió, en la unidad"),
      unidad: z.enum(["pt", "m3", "kg", "unidad"]).describe("Unidad de la cantidad"),
      producto: z.string().trim().max(80).optional().describe("Tipo de producto (ej. tablas)"),
      presentacion: z.string().trim().max(80).optional().describe("Presentación (ej. 1x8x10)"),
      piezas: z.number().int().nonnegative().max(999999).optional().describe("Piezas producidas"),
      codigoProducto: z.string().trim().max(80).optional().describe("Código del producto"),
      lineaProduccion: z.string().trim().max(10).optional().describe("Línea de producción"),
      observaciones: z.string().trim().max(1000).optional().describe("Notas"),
    },
    pedido: (a) => ({
      metodo: "PATCH",
      ruta: "/api/admin/forestal/ctp",
      cuerpo: limpiar({ id: a.id, action: "declarar_produccion", quantity: a.cantidad, unit: a.unidad, productType: a.producto, presentacion: a.presentacion, pieces: a.piezas, codigoProducto: a.codigoProducto, lineaProduccion: a.lineaProduccion, observations: a.observaciones }),
    }),
    previa: (a, leer) => asientoDelPanel(a.id, leer),
    resumen: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const tercero = e && (e.duenoMadera === "tercero" || e.duenoParteId) ? ` La madera es de un tercero${e.titularNombre ? ` (${linea60(e.titularNombre, 60)})` : ""}: el cobro de aserrío se recalcula.` : "";
      return `Declarar en la ${queAsiento(e)} lo producido: ${madera({ pt: a.unidad === "pt" ? a.cantidad : undefined, m3: a.unidad === "m3" ? a.cantidad : undefined, piezas: a.piezas })}${a.unidad === "kg" || a.unidad === "unidad" ? ` ${a.cantidad} ${a.unidad}` : ""}${a.producto ? ` de ${a.producto}` : ""}. Cambia el saldo de producto.${tercero}`;
    },
    // Cantidad NUEVA: el dato de los botones es lo que se declara (atado al pedido); la corrida y su entrada, del panel.
    ventana: (a, previa) => {
      const e = /** @type {any} */ (previa);
      return {
        clave: claveVolumen({ cantidad: a.cantidad, unidad: a.unidad, piezas: a.piezas }),
        filas: [...ventanaAsiento(e).filas.slice(0, 3), { etiqueta: "Entró a la corrida", valor: e ? madera({ m3: num(e.volumeInputM3) }) : "no se pudo leer" }],
      };
    },
  },
  {
    nombre: "ctp_corregir_linea",
    grupo: "ctp",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Corrige campos de un asiento del libro CTP (PATCH /api/admin/forestal/ctp, action=corregir_linea) sin anularlo: observaciones, presentación, especie, producto, origen, dueño, unidad, cantidad o volumen de entrada. Tocar cantidad, volumen, unidad, especie, producto, origen (permiso) o dueño pide OK de Brandon. Solo admin/owner. Ej.: {id:\"cm…\", observaciones:\"corrida del turno tarde\"}.",
    entrada: {
      negocio,
      id: idRuta.describe("Id del asiento (ctp_ver vista=lista)"),
      observaciones: z.string().trim().max(2000).optional().describe("Observaciones"),
      presentacion: z.string().trim().max(120).optional().describe("Presentación"),
      materiaPrima: z.string().trim().max(200).optional().describe("Referencia de la materia prima"),
      especie: z.string().trim().max(120).optional().describe("Nombre común"),
      especieCientifica: z.string().trim().max(160).optional().describe("Nombre científico"),
      producto: z.string().trim().max(120).optional().describe("Tipo de producto"),
      origen: z.string().trim().max(120).optional().describe("Código de origen"),
      dueno: z.enum(["propia", "tercero"]).optional().describe("De quién es la madera"),
      titular: z.string().trim().max(160).optional().describe("Titular (si es de un tercero)"),
      unidad: z.string().trim().max(20).optional().describe("Unidad (pt, m3, kg, unidad)"),
      cantidad: z.number().nonnegative().max(9999999999).optional().describe("Cantidad corregida (hasta 4 decimales)"),
      volumenEntradaM3: z.number().nonnegative().max(99999999).optional().describe("Volumen de entrada corregido en m³ (hasta 4 decimales)"),
    },
    confirmarSi: (a) => ["cantidad", "volumenEntradaM3", "unidad", "especie", "producto", "dueno", "titular", "origen"].some((k) => a[k] !== undefined),
    pedido: (a) => {
      const decimal = (n) => (n === undefined ? undefined : String(Math.round(n * 10000) / 10000));
      const campos = limpiar({
        observations: a.observaciones, presentacion: a.presentacion, materiaPrimaRef: a.materiaPrima, speciesCommon: a.especie, speciesScientific: a.especieCientifica,
        productType: a.producto, originCode: a.origen, duenoMadera: a.dueno, titularNombre: a.titular, unit: a.unidad, quantity: decimal(a.cantidad), volumeInputM3: decimal(a.volumenEntradaM3),
      });
      return { metodo: "PATCH", ruta: "/api/admin/forestal/ctp", cuerpo: { id: a.id, action: "corregir_linea", campos } };
    },
    previa: (a, leer) => asientoDelPanel(a.id, leer),
    resumen: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const cambios = [
        a.cantidad !== undefined && `cantidad ${e?.quantity ?? "?"} → ${a.cantidad}`,
        a.volumenEntradaM3 !== undefined && `volumen de entrada ${e ? madera({ m3: num(e.volumeInputM3) }) : "?"} → ${madera({ m3: a.volumenEntradaM3 })}`,
        a.unidad !== undefined && `unidad ${e?.unit ?? "?"} → ${a.unidad}`,
        a.especie !== undefined && `especie ${e?.speciesCommon ?? "?"} → ${a.especie}`,
        a.producto !== undefined && `producto ${e?.productType ?? "?"} → ${a.producto}`,
        a.dueno !== undefined && `dueño ${e?.duenoMadera ?? "?"} → ${a.dueno}`,
        a.titular !== undefined && `titular → ${linea60(a.titular, 60)}`,
        a.origen !== undefined && `origen ${e?.originCode ?? "—"} → ${a.origen}`,
      ].filter(Boolean);
      // ctp/route.ts corregir_linea: cantidad, especie o producto recotizan el aserrío que se le cobra al tercero.
      const tocaPrecio = a.cantidad !== undefined || a.especie !== undefined || a.producto !== undefined;
      const tercero = e && (e.duenoMadera === "tercero" || e.duenoParteId);
      return `Corregir la ${queAsiento(e)}: ${cambios.join(", ") || "notas y datos de texto"}.${tercero && tocaPrecio ? ` OJO: la madera es de un tercero (${linea60(e.titularNombre ?? "sin titular", 40)}): el cobro de aserrío se recalcula.` : ""}`;
    },
    // La clave = lo que va a QUEDAR (cantidad o volumen nuevo, atado al pedido); lo de antes va en una fila.
    ventana: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const unidad = a.unidad ?? e?.unit;
      const clave = a.cantidad !== undefined ? claveVolumen({ cantidad: a.cantidad, unidad })
        : a.volumenEntradaM3 !== undefined ? claveVolumen({ m3: a.volumenEntradaM3 })
        : ventanaAsiento(e ? { ...e, unit: unidad } : null).clave;
      const cambio = (etiqueta, antes, despues) => ({ etiqueta, valor: linea60(`${antes ?? "—"} → ${despues}`) });
      const filas = [
        e ? { etiqueta: "Antes (panel)", valor: linea60(`${e.quantity ?? "?"} ${e.unit ?? ""} · entrada ${madera({ m3: num(e.volumeInputM3) })}`) } : { etiqueta: "Asiento", valor: NO_VERIFICADO },
        e && { etiqueta: "Asiento", valor: linea60(`${e.section ?? "?"} N.º ${e.lineNo ?? "?"} · ${e.speciesCommon ?? "?"}`) },
        a.origen !== undefined && cambio("Origen (panel → nuevo)", e?.originCode, a.origen),
        a.dueno !== undefined && cambio("Dueño (panel → nuevo)", e?.duenoMadera, a.dueno),
        a.especie !== undefined && cambio("Especie (panel → nueva)", e?.speciesCommon, a.especie),
        a.producto !== undefined && cambio("Producto (panel → nuevo)", e?.productType, a.producto),
      ].filter(Boolean);
      return { clave, filas: filas.slice(0, 4) };
    },
    formatear: () => "Asiento corregido.",
  },
];
