// Grupo «ingresos»: un ingreso de madera (guía de entrada, WoodEntry) del negocio forestal y sus piezas. Volumen en m³.
// Validar, recepcionar, rechazar, anular, borrar, cargar piezas y cuadrar mueven el saldo de madera: piden OK de Brandon.
import { z, negocio, idRuta, dia, limpiar, lista, madera, soles, linea60, claveCantidad, claveMonto, leerSeguro, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

const R = (id) => `/api/admin/forestal/wood-entries/${id}`;
/** Número > 0 o undefined (los Decimal llegan como texto). @param {unknown} v */
const num = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0 ? undefined : Number(v));
const idIngreso = idRuta.describe("Id del ingreso (sale en madera_ingresos_ver)");
const PRODUCTOS = ["rolliza", "aserrada", "tablones", "listones", "durmientes", "pulgada", "carbon", "lena", "otro"];
const ORIGENES = ["concesion", "predio_privado", "comunidad_nativa", "reforestacion", "retroaserradero", "otro"];

/** El ingreso tal como lo tiene el panel (GET /wood-entries/[id]) o null. @param {string} id @param {any} leer */
async function ingresoDelPanel(id, leer) {
  const r = await leerSeguro(leer, R(id), undefined, { sinRecorte: true });
  const e = /** @type {any} */ (r.ok ? r.datos : null)?.entry;
  return e && typeof e === "object" ? e : null;
}
/** «guía 001-123 · Proveedor · Especie · 12,5 m³ · estado» con el proveedor verificado. @param {any} e */
const queIngreso = (e) => e
  ? `ingreso${e.libroNro ? ` N.º ${e.libroNro}` : ""} de la guía ${linea60(e.gtfNumber ?? "?", 40)} · ${verificado(e.providerName)} · ${linea60(e.speciesCommonName ?? "?", 40)} · ${madera({ m3: num(e.volumeM3), piezas: num(e.pieces) })} · estado ${e.status ?? "?"}`
  : `ingreso que ${NO_VERIFICADO} (no lo pude leer del panel)`;
/** Volumen del ingreso según el panel (el dato de los botones). @param {any} e */
const claveIngreso = (e) => {
  if (!e) return null;
  const m3 = num(e.volumeM3);
  if (m3) return claveCantidad(m3, { etiqueta: "Volumen del ingreso (m³)", unidad: "m³" });
  const p = num(e.pieces);
  return p ? claveCantidad(p, { etiqueta: "Piezas del ingreso", unidad: "pzas" }) : null;
};
/** @param {any} e */
const filasIngreso = (e) => e
  ? [{ etiqueta: "Guía", valor: linea60(e.gtfNumber ?? "?") }, { etiqueta: "Proveedor (del panel)", valor: verificado(e.providerName) }, { etiqueta: "Especie / estado", valor: linea60(`${e.speciesCommonName ?? "?"} · ${e.status ?? "?"}`) }]
  : [{ etiqueta: "Ingreso", valor: NO_VERIFICADO }];
const ventanaIngreso = (_a, previa) => ({ clave: claveIngreso(previa), filas: filasIngreso(previa) });
/** Como `limpiar` pero conserva `null` (que en el panel significa «quitar»). @param {Record<string, any>} obj */
const limpiarConNull = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""));
/** Fila «etiqueta: antes (panel) → después». @param {string} etiqueta @param {unknown} antes @param {unknown} despues */
const cambio = (etiqueta, antes, despues) => ({ etiqueta, valor: linea60(`${antes ?? "—"} → ${despues}`) });
/** Campos de un ingreso que deciden a qué permiso/guía se atribuye la madera: [arg, campo del panel, etiqueta]. */
const ATRIBUCION = [["permiso", "originCode", "Permiso"], ["tipoOrigen", "originType", "Tipo de origen"], ["registroSerfor", "serforNumeroRegistro", "Registro SERFOR"], ["serieGuia", "gtfSeries", "Serie de guía"], ["tipoDoc", "docType", "Tipo de doc."], ["guia", "gtfNumber", "Guía"], ["especie", "speciesCommonName", "Especie"], ["especieCientifica", "speciesScientificName", "Especie científica"], ["producto", "productType", "Producto"], ["unidad", "unit", "Unidad"], ["proveedor", "providerName", "Proveedor"], ["proveedorDocumento", "providerDocument", "Doc. proveedor"]];

/** Aviso si el estado del panel no deja hacer la acción (solo pendientes / ya anulado). @param {any} e @param {string[]} [soloEn] */
const avisoEstado = (e, soloEn) => {
  if (!e || !soloEn) return "";
  return soloEn.includes(e.status) ? "" : ` OJO: está «${e.status ?? "?"}»; el panel solo lo hace con ${soloEn.join(" o ")}.`;
};
/** Una acción simple sobre un ingreso existente (validar, rechazar, anular, borrar, recepcionar). */
function accion({ nombre, descripcion, entrada = {}, cuerpo, frase, soloEn }) {
  return {
    nombre,
    grupo: "ingresos",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion,
    entrada: { negocio, id: idIngreso, ...entrada },
    pedido: (a) => ({ metodo: "PATCH", ruta: R(a.id), cuerpo: cuerpo(a) }),
    previa: (a, leer) => ingresoDelPanel(a.id, leer),
    resumen: (a, previa) => frase(a, queIngreso(previa)) + avisoEstado(previa, soloEn),
    ventana: ventanaIngreso,
  };
}

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "ingreso_ver",
    grupo: "ingresos",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Ficha de un ingreso de madera (GET /api/admin/forestal/wood-entries/[id]): guía, proveedor, especie, volumen en m³, piezas, costo y estado; con piezas=true también la lista de trozas/piezas cargadas (GET /api/admin/forestal/trozas?woodEntryId=). Ej.: {id:\"cmvfkx8bh001ctovz2jwmqny4\", piezas:true}.",
    entrada: {
      negocio,
      id: idIngreso,
      piezas: z.boolean().optional().describe("true = también la lista de piezas/trozas del ingreso"),
    },
    pedido: (a) => (a.piezas
      ? [{ metodo: "GET", ruta: R(a.id) }, { metodo: "GET", ruta: "/api/admin/forestal/trozas", query: { woodEntryId: a.id } }]
      : { metodo: "GET", ruta: R(a.id) }),
    formatear: (d, a) => {
      const [ficha, piezas] = a?.piezas && Array.isArray(d) ? d : [d, undefined];
      const e = /** @type {any} */ (ficha)?.entry;
      if (!e) return "No encontré ese ingreso.";
      const txt = [
        `Ingreso${e.libroNro ? ` N.º ${e.libroNro}` : ""} · ${e.docType ?? "GTF"} ${e.gtfSeries ? `${e.gtfSeries}-` : ""}${e.gtfNumber ?? "?"}${e.gtfDate ? ` del ${String(e.gtfDate).slice(0, 10)}` : ""} · estado ${e.status ?? "?"}${e.rejectionReason ? ` (${e.rejectionReason})` : ""}`,
        `Proveedor: ${e.providerName ?? "?"}${e.providerDocumentType ? ` · ${e.providerDocumentType}` : ""}`,
        `Especie: ${e.speciesCommonName ?? "?"}${e.productType ? ` · ${e.productType}` : ""} · ${madera({ m3: num(e.volumeM3), piezas: num(e.pieces) })} (${e.unit ?? "m3"})`,
        `Origen: ${e.originType ?? "?"}${e.originCode ? ` · ${e.originCode}` : ""} · ingreso ${String(e.entryDate ?? "").slice(0, 10) || "?"}${e.fechaRecepcion ? ` · recepcionado ${String(e.fechaRecepcion).slice(0, 10)}` : " · sin recepcionar"}`,
        `Costo: ${num(e.costoTotal) ? (e.moneda === "USD" ? `US$ ${Number(e.costoTotal).toFixed(2)}` : soles(Number(e.costoTotal))) : "sin costo"}${Array.isArray(e.photos) ? ` · ${e.photos.length} foto(s)` : ""}`,
        e.notes ? `Notas: ${linea60(e.notes, 200)}` : "",
      ].filter(Boolean).join("\n");
      if (!a?.piezas) return txt;
      return `${txt}\n\n${lista(piezas, { titulo: "Piezas del ingreso", cols: [["N.º", ["orden"]], ["Código", ["codificacion", "codigoPlanta"]], ["Especie", ["especieComun"]], ["Largo m", ["largoM"], "n"], ["D1 cm", ["d1Cm", "diametroCm"], "n"], ["Estado", ["estado", "status"]], ["id", ["id"]]], colMadera: { m3: ["volumenM3"], piezas: ["cantidad"] }, vacio: "Sin piezas cargadas." })}`;
    },
  },
  {
    nombre: "ingreso_trozas_cargar",
    grupo: "ingresos",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Carga piezas/trozas a un ingreso de madera (PATCH /api/admin/forestal/wood-entries/[id], action=trozas): hasta 500; las que ya estaban cargadas se saltan. Suma al saldo de trozas del patio. Volumen en m³. Ej.: {id:\"cmvf…\", trozas:[{codigo:\"T-01\", especie:\"Shihuahuaco\", largoM:4.2, d1Cm:62, d2Cm:58, volumenM3:1.19}]}.",
    entrada: {
      negocio,
      id: idIngreso,
      trozas: z.array(z.object({
        codigo: z.string().trim().max(60).optional().describe("Codificación de la troza (ej. T-01)"),
        especie: z.string().trim().max(120).optional().describe("Nombre común"),
        especieCientifica: z.string().trim().max(160).optional().describe("Nombre científico"),
        dimensiones: z.string().trim().max(80).optional().describe("Dimensiones como texto (madera aserrada)"),
        largoM: z.number().nonnegative().max(200).optional().describe("Largo en metros"),
        diametroCm: z.number().nonnegative().max(999).optional().describe("Diámetro promedio en cm"),
        d1Cm: z.number().nonnegative().max(999).optional().describe("Diámetro 1 en cm"),
        d2Cm: z.number().nonnegative().max(999).optional().describe("Diámetro 2 en cm"),
        cantidad: z.number().int().min(0).max(9999).optional().describe("Piezas en esta fila (aserrada)"),
        volumenM3: z.number().positive().max(9999).optional().describe("Volumen en m³"),
      })).min(1).max(500).describe("Piezas a cargar (1-500)"),
    },
    // El panel exige cada clave (null si falta): se mandan todas.
    pedido: (a) => ({
      metodo: "PATCH",
      ruta: R(a.id),
      cuerpo: {
        action: "trozas",
        trozas: a.trozas.map((t) => ({
          codificacion: t.codigo ?? null, especieComun: t.especie ?? null, especieCientifica: t.especieCientifica ?? null, dimensiones: t.dimensiones ?? null,
          largoM: t.largoM ?? null, diametroCm: t.diametroCm ?? null, d1Cm: t.d1Cm ?? null, d2Cm: t.d2Cm ?? null, cantidad: t.cantidad ?? null, volumenM3: t.volumenM3 ?? null,
        })),
      },
    }),
    previa: (a, leer) => ingresoDelPanel(a.id, leer),
    resumen: (a, previa) => {
      const m3 = a.trozas.reduce((s, t) => s + (t.volumenM3 ?? 0), 0);
      return `Cargar ${a.trozas.length} pieza(s) (${madera({ m3: m3 || undefined })}) al ${queIngreso(previa)}. Las ya cargadas se saltan; suma al patio.`;
    },
    // Las piezas son cantidades NUEVAS: el dato de los botones es lo que se manda (atado al pedido); el ingreso, del panel.
    ventana: (a, previa) => {
      const m3 = Math.round(a.trozas.reduce((s, t) => s + (t.volumenM3 ?? 0), 0) * 1000) / 1000;
      return {
        clave: m3 > 0 ? claveCantidad(m3, { etiqueta: "Volumen a cargar (m³)", unidad: "m³" }) : claveCantidad(a.trozas.length, { etiqueta: "Piezas a cargar", unidad: "pzas" }),
        filas: [...filasIngreso(previa), { etiqueta: "Ingreso según el panel", valor: previa ? madera({ m3: num(previa.volumeM3), piezas: num(previa.pieces) }) : NO_VERIFICADO }].slice(0, 4),
      };
    },
  },
  accion({
    nombre: "ingreso_validar",
    descripcion: "Valida un ingreso de madera pendiente (PATCH /api/admin/forestal/wood-entries/[id], action=validate): entra al libro y al saldo de madera. Solo admin/owner. Volumen en m³. Ej.: {id:\"cmvfkx8bh001ctovz2jwmqny4\"}.",
    soloEn: ["pendiente"],
    cuerpo: () => ({ action: "validate" }),
    frase: (_a, que) => `Validar el ${que}. Entra al libro y suma al saldo de madera.`,
  }),
  accion({
    nombre: "ingreso_recepcionar",
    descripcion: "Marca la recepción física de un ingreso de madera (PATCH /api/admin/forestal/wood-entries/[id], action=recepcionar): la madera queda en el patio con esa fecha. Si la guía venció, pide aceptarla con motivo. Ej.: {id:\"cmvf…\", fecha:\"2026-10-29\"}.",
    entrada: {
      fecha: dia.optional().describe("Día de la recepción AAAA-MM-DD (vacío = hoy)"),
      aceptaVencida: z.boolean().optional().describe("true = recibir aunque la guía esté vencida"),
      motivoVencida: z.string().trim().max(300).optional().describe("Por qué se recibe con la guía vencida"),
    },
    cuerpo: (a) => limpiar({ action: "recepcionar", fecha: a.fecha, aceptaVencida: a.aceptaVencida, motivoVencida: a.motivoVencida }),
    frase: (a, que) => `Recepcionar${a.fecha ? ` el ${a.fecha}` : " hoy"} el ${que}.${a.aceptaVencida ? ` Con la guía vencida: ${a.motivoVencida ?? "sin motivo"}.` : ""} La madera queda en el patio.`,
  }),
  accion({
    nombre: "ingreso_rechazar",
    descripcion: "Rechaza un ingreso de madera pendiente (PATCH /api/admin/forestal/wood-entries/[id], action=reject): no entra al saldo. Solo admin/owner. Ej.: {id:\"cmvf…\", motivo:\"guía con otra especie\"}.",
    entrada: { motivo: z.string().trim().min(3).max(500).describe("Por qué se rechaza (3-500 letras)") },
    soloEn: ["pendiente"],
    cuerpo: (a) => ({ action: "reject", reason: a.motivo }),
    frase: (a, que) => `Rechazar el ${que}. Motivo: ${a.motivo}. No entra al saldo de madera.`,
  }),
  accion({
    nombre: "ingreso_anular",
    descripcion: "Anula un ingreso de madera (PATCH /api/admin/forestal/wood-entries/[id], action=annul): sale del saldo; si ya tiene trozas consumidas el panel lo rechaza. Solo admin/owner. Ej.: {id:\"cmvf…\", motivo:\"guía duplicada\"}.",
    entrada: { motivo: z.string().trim().min(3).max(500).describe("Por qué se anula (3-500 letras)") },
    soloEn: ["pendiente", "validado", "procesado", "rechazado"],
    cuerpo: (a) => ({ action: "annul", reason: a.motivo }),
    frase: (a, que) => `Anular el ${que}. Motivo: ${a.motivo}. Su volumen sale del saldo de madera.`,
  }),
  accion({
    nombre: "ingreso_borrar",
    descripcion: "Borra un ingreso de madera (PATCH /api/admin/forestal/wood-entries/[id], action=delete): solo errores de captura; lo que ya entró al libro se anula (ingreso_anular). Solo admin/owner. Ej.: {id:\"cmvf…\"}.",
    cuerpo: () => ({ action: "delete" }),
    frase: (_a, que) => `Borrar el ${que}. Desaparece de la lista de ingresos.`,
  }),
  {
    nombre: "ingreso_editar",
    grupo: "ingresos",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Corrige un ingreso de madera PENDIENTE (PATCH /api/admin/forestal/wood-entries/[id], action=update). Cambiar volumen, piezas, unidad, especie, proveedor, la guía (número, serie, tipo, registro SERFOR) o el permiso de origen pide OK de Brandon; notas, fechas, región y humedad no. Volumen en m³. Ej.: {id:\"cmvf…\", notas:\"llegó con lluvia\"}.",
    entrada: {
      negocio,
      id: idIngreso,
      fechaIngreso: dia.optional().describe("Día del ingreso AAAA-MM-DD"),
      tipoDoc: z.enum(["GTF", "GRR", "Otros"]).optional().describe("Tipo de documento"),
      guia: z.string().trim().min(1).max(50).optional().describe("N.º de guía"),
      fechaGuia: dia.optional().describe("Día de la guía AAAA-MM-DD"),
      serieGuia: z.string().trim().max(20).optional().describe("Serie de la guía"),
      registroSerfor: z.string().trim().max(60).optional().describe("N.º de registro SERFOR"),
      proveedor: z.string().trim().min(1).max(200).optional().describe("Nombre del proveedor"),
      proveedorDocumento: z.string().trim().max(20).optional().describe("RUC/DNI del proveedor"),
      proveedorTipoDoc: z.enum(["RUC", "DNI", "CE", "PASAPORTE"]).optional().describe("Tipo de documento del proveedor"),
      tipoOrigen: z.enum(/** @type {[string, ...string[]]} */ (ORIGENES)).optional().describe("Origen de la madera"),
      permiso: z.string().trim().max(100).optional().describe("Código de origen / permiso"),
      region: z.string().trim().max(80).optional().describe("Región de origen"),
      distrito: z.string().trim().max(80).optional().describe("Distrito de origen"),
      especie: z.string().trim().min(1).max(120).optional().describe("Nombre común"),
      especieCientifica: z.string().trim().max(150).optional().describe("Nombre científico"),
      producto: z.enum(/** @type {[string, ...string[]]} */ (PRODUCTOS)).optional().describe("Tipo de producto"),
      unidad: z.enum(["m3", "unidad", "kg", "tonelada"]).optional().describe("Unidad"),
      volumenM3: z.number().positive().max(99999).optional().describe("Volumen en m³"),
      piezas: z.number().int().nonnegative().max(999999).optional().describe("N.º de piezas"),
      humedadPct: z.number().min(0).max(100).optional().describe("Humedad en %"),
      defectos: z.string().trim().max(500).optional().describe("Defectos observados"),
      notas: z.string().trim().max(1000).optional().describe("Notas"),
    },
    confirmarSi: (a) => ["volumenM3", "piezas", ...ATRIBUCION.map(([k]) => k)].some((k) => a[k] !== undefined),
    pedido: (a) => {
      const fields = limpiar({
        entryDate: a.fechaIngreso, docType: a.tipoDoc, gtfNumber: a.guia, gtfDate: a.fechaGuia, gtfSeries: a.serieGuia, serforNumeroRegistro: a.registroSerfor,
        providerName: a.proveedor, providerDocument: a.proveedorDocumento, providerDocumentType: a.proveedorTipoDoc, originType: a.tipoOrigen, originCode: a.permiso,
        originRegion: a.region, originDistrict: a.distrito, speciesCommonName: a.especie, speciesScientificName: a.especieCientifica, productType: a.producto,
        unit: a.unidad, volumeM3: a.volumenM3, pieces: a.piezas, humidityPct: a.humedadPct, defectsNotes: a.defectos, notes: a.notas,
      });
      return { metodo: "PATCH", ruta: R(a.id), cuerpo: { action: "update", fields } };
    },
    previa: (a, leer) => ingresoDelPanel(a.id, leer),
    resumen: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const cambios = [
        a.volumenM3 !== undefined && `volumen ${e ? madera({ m3: num(e.volumeM3) }) : "?"} → ${madera({ m3: a.volumenM3 })}`,
        a.piezas !== undefined && `piezas ${e?.pieces ?? "?"} → ${a.piezas}`,
        ...ATRIBUCION.filter(([k]) => a[k] !== undefined).map(([k, campo, et]) => `${et.toLowerCase()} ${linea60(String(e?.[campo] ?? "—"), 40)} → ${linea60(String(a[k]), 40)}`),
      ].filter(Boolean);
      return `Corregir el ${queIngreso(e)}: ${cambios.join(", ") || "otros datos"}.${avisoEstado(e, ["pendiente"]) || " Solo se puede si sigue pendiente."}`;
    },
    // La clave = el volumen que va a QUEDAR (el nuevo si se cambia, si no el del panel); antes → después en las filas.
    ventana: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const m3 = a.volumenM3 ?? num(e?.volumeM3), pz = a.piezas ?? num(e?.pieces);
      const clave = m3 ? claveCantidad(m3, { etiqueta: "Volumen que queda (m³)", unidad: "m³" }) : pz ? claveCantidad(pz, { etiqueta: "Piezas que quedan", unidad: "pzas" }) : null;
      const cambios = [
        a.volumenM3 !== undefined && cambio("Volumen (panel → nuevo)", e ? madera({ m3: num(e.volumeM3) }) : NO_VERIFICADO, madera({ m3: a.volumenM3 })),
        a.piezas !== undefined && cambio("Piezas (panel → nuevas)", e ? e.pieces : NO_VERIFICADO, a.piezas),
        ...ATRIBUCION.filter(([k]) => a[k] !== undefined).map(([k, campo, et]) => cambio(`${et} (panel → nuevo)`, e ? e[campo] : NO_VERIFICADO, a[k])),
      ].filter(Boolean);
      return { clave, filas: [filasIngreso(e)[0], ...(cambios.length ? cambios : filasIngreso(e).slice(1))].slice(0, 4) };
    },
    formatear: (d) => {
      const e = /** @type {any} */ (d)?.entry ?? d;
      return e && typeof e === "object" && e.id ? `Ingreso corregido: guía ${e.gtfNumber ?? "?"} · ${e.speciesCommonName ?? "?"} · ${madera({ m3: num(e.volumeM3), piezas: num(e.pieces) })}.` : "Ingreso corregido.";
    },
  },
  {
    nombre: "ingreso_costo",
    grupo: "ingresos",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Pone o quita el costo total de un ingreso de madera (PATCH /api/admin/forestal/wood-entries/[id], action=set_costo): en soles o dólares; null lo borra. Solo admin/owner. Ej.: {id:\"cmvf…\", costoTotal:4500, moneda:\"PEN\"}.",
    entrada: {
      negocio,
      id: idIngreso,
      costoTotal: z.number().min(0).max(99999999.99).nullable().describe("Costo total del ingreso (null = quitarlo)"),
      moneda: z.enum(["PEN", "USD"]).optional().describe("PEN = soles (por defecto), USD = dólares"),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: R(a.id), cuerpo: limpiarConNull({ action: "set_costo", costoTotal: a.costoTotal, moneda: a.moneda }) }),
    previa: (a, leer) => ingresoDelPanel(a.id, leer),
    resumen: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const antes = e ? (num(e.costoTotal) ? (e.moneda === "USD" ? `US$ ${Number(e.costoTotal).toFixed(2)}` : soles(Number(e.costoTotal))) : "sin costo") : "?";
      const nuevo = a.costoTotal === null ? "sin costo" : a.moneda === "USD" ? `US$ ${a.costoTotal.toFixed(2)}` : soles(a.costoTotal);
      return `Costo del ${queIngreso(e)}: ${antes} → ${nuevo}.`;
    },
    // Un monto nuevo: el dato de los botones es ese monto (atado al pedido); sin monto, el volumen del panel.
    ventana: (a, previa) => ({
      clave: a.costoTotal === null || a.costoTotal === 0
        ? claveIngreso(previa)
        : a.moneda === "USD" ? claveCantidad(a.costoTotal, { etiqueta: "Costo (US$)", unidad: "US$" }) : claveMonto(a.costoTotal, { etiqueta: "Costo (S/)" }),
      filas: filasIngreso(previa),
    }),
  },
  {
    nombre: "ingreso_cuadrar",
    grupo: "ingresos",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Cuadra un ingreso cuyas piezas no suman lo de la guía (PATCH /api/admin/forestal/wood-entries/[id], action=cuadrar): lado=lista acepta la suma de las piezas como volumen; lado=cabecera corrige UNA pieza (cantidad y m³). Queda el motivo. Ej.: {id:\"cmvf…\", lado:\"lista\", motivo:\"guía mal sumada\"}.",
    entrada: {
      negocio,
      id: idIngreso,
      lado: z.enum(["lista", "cabecera"]).describe("lista = vale la suma de piezas · cabecera = corregir una pieza"),
      motivo: z.string().trim().min(3).max(500).describe("Por qué se cuadra (3-500 letras)"),
      trozaId: idRuta.optional().describe("cabecera: id de la pieza a corregir (ingreso_ver piezas=true)"),
      cantidad: z.number().int().min(1).max(9999).optional().describe("cabecera: piezas de esa fila"),
      volumenM3: z.number().nonnegative().max(9999).optional().describe("cabecera: volumen nuevo de esa pieza en m³"),
    },
    pedido: (a) => {
      return { metodo: "PATCH", ruta: R(a.id), cuerpo: limpiar({ action: "cuadrar", lado: a.lado, motivo: a.motivo, trozaId: a.trozaId, cantidad: a.cantidad, volumenM3: a.volumenM3 }) };
    },
    // lado=lista: el panel (WoodEntriesDB.cuadrarIngreso) suma el volumenM3 de TODAS las filas de la guía, pedazos de
    // retrozo incluidos (comparten woodEntryId): la previa suma igual para que la clave sea lo que va a quedar.
    previa: async (a, leer) => {
      const e = await ingresoDelPanel(a.id, leer);
      if (!e || a.lado !== "lista") return e;
      const r = await leerSeguro(leer, "/api/admin/forestal/trozas", { woodEntryId: a.id }, { sinRecorte: true });
      const trozas = /** @type {any} */ (r.ok ? r.datos : null)?.trozas;
      if (!Array.isArray(trozas)) return { ...e, _suma: null };
      const filas = trozas.flatMap((t) => [t, ...(Array.isArray(t.retrozos) ? t.retrozos : [])]);
      return { ...e, _suma: Math.round(filas.reduce((s, p) => s + (Number(p.volumenM3) || 0), 0) * 10000) / 10000, _filas: filas.length, _retrozos: filas.length - trozas.length };
    },
    resumen: (a, previa) => a.lado === "lista"
      ? `Cuadrar el ${queIngreso(previa)} por la lista: su volumen pasa a ${previa?._suma ? `${madera({ m3: previa._suma })} (suma de ${previa._filas} pieza(s))` : `la suma de sus piezas, que ${NO_VERIFICADO}`}. Motivo: ${a.motivo}.${previa?._retrozos ? ` OJO: esa suma del panel incluye ${previa._retrozos} pedazo(s) de retrozo además de sus madres.` : ""}${previa && previa._suma === 0 ? " OJO: las piezas no declaran volumen y el panel lo rechaza." : ""}`
      : `Cuadrar el ${queIngreso(previa)} corrigiendo la pieza ${a.trozaId ?? "?"}: ${a.cantidad ?? "?"} pza(s), ${madera({ m3: a.volumenM3 })}. Motivo: ${a.motivo}.${!a.trozaId || a.cantidad === undefined || a.volumenM3 === undefined ? " OJO: falta trozaId, cantidad o volumenM3 y el panel lo rechaza." : ""}`,
    ventana: (a, previa) => a.lado === "lista"
      ? {
        clave: previa?._suma > 0 ? claveCantidad(previa._suma, { etiqueta: "Volumen que queda (m³)", unidad: "m³" }) : null,
        filas: [...filasIngreso(previa).slice(0, 3), previa ? cambio("Volumen (panel → queda)", madera({ m3: num(previa.volumeM3) }), previa._suma ? madera({ m3: previa._suma }) : NO_VERIFICADO) : null].filter(Boolean),
      }
      : {
        clave: a.volumenM3 !== undefined ? claveCantidad(a.volumenM3, { etiqueta: "Volumen nuevo de la pieza (m³)", unidad: "m³" }) : claveIngreso(previa),
        filas: [...filasIngreso(previa), { etiqueta: "Lado", valor: "corregir una pieza" }].slice(0, 4),
      },
  },
];
