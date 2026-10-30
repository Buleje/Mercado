// Grupo «loth»: Libro de Operaciones del Título Habilitante (LO-TH, ADR-126) del negocio forestal. Volumen en m³.
// Anotar, anular y borrar mueven el saldo del permiso (y el estado del árbol en el censo): piden OK de Brandon.
import { z, negocio, idRuta, dia, limpiar, lista, madera, linea60, claveCantidad, filasDe, leerSeguro, NO_VERIFICADO } from "../util-herramientas.mjs";

const SECCIONES = ["tala", "trozado", "despacho_troza", "consumo_troza", "producto_terminado", "despacho_producto"];
const NOMBRE = { tala: "tala", trozado: "trozado", despacho_troza: "despacho de trozas", consumo_troza: "consumo de trozas", producto_terminado: "producto terminado", despacho_producto: "despacho de producto" };
const seccion = z.enum(/** @type {[string, ...string[]]} */ (SECCIONES));
const COL_M3 = { m3: ["volumeM3", "totalVolumeM3"], piezas: ["pieces"] };
const COLS = [["Línea", ["lineNo"]], ["Sección", ["section"]], ["Fecha", ["entryDate"], "f"], ["Árbol", ["treeCode"]], ["Troza", ["trozaCode"]], ["Especie", ["speciesCommon"]], ["Producto", ["productType"]], ["Guía", ["gtfNumber"]], ["Estado", ["status"]], ["id", ["id"]]];

/** Número > 0 o undefined (los Decimal llegan como texto). @param {unknown} v */
const num = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0 ? undefined : Number(v));
/** «sección N.º línea (árbol / troza)» de una línea del panel. @param {any} e */
const nombreLinea = (e) => `${NOMBRE[e.section] ?? linea60(e.section ?? "?", 20)} N.º ${e.lineNo ?? "?"}${e.treeCode || e.trozaCode ? ` (${linea60([e.treeCode, e.trozaCode].filter(Boolean).join(" / "), 40)})` : ""}`;
/** Volumen de una línea para la ventana: m³ primero, si no la cantidad en su unidad. @param {{ m3?: unknown, cantidad?: unknown, unidad?: unknown, piezas?: unknown }} v */
function claveLinea(v) {
  const m3 = num(v.m3);
  if (m3) return claveCantidad(m3, { etiqueta: "Volumen (m³)", unidad: "m³" });
  const c = num(v.cantidad);
  if (c) return claveCantidad(c, { etiqueta: "Cantidad", unidad: linea60(v.unidad ?? "", 10) });
  const p = num(v.piezas);
  return p ? claveCantidad(p, { etiqueta: "Piezas", unidad: "pzas" }) : null;
}

/**
 * Previa de anular/borrar: el GET por id no existe, así que se busca la línea por su código en la lista
 * (`search` mira árbol, troza, especie y guía; con anuladas) y se elige la del id. null = no se encontró.
 * @param {{ id: string, codigo: string }} a @param {any} leer
 */
async function lineaDelPanel(a, leer) {
  for (let offset = 0; offset < 2000; offset += 500) {
    const r = await leerSeguro(leer, "/api/admin/forestal/loth", { search: a.codigo, includeAnnulled: "1", limit: 500, offset: offset || undefined }, { sinRecorte: true });
    if (!r.ok) return null;
    const filas = filasDe(r.datos);
    const e = filas.find((x) => x && String(x.id) === String(a.id));
    if (e) return e;
    if (filas.length < 500) return null;
  }
  return null;
}
const filasLinea = (e) => e
  ? [{ etiqueta: "Línea", valor: linea60(nombreLinea(e)) }, { etiqueta: "Especie", valor: linea60(e.speciesCommon ?? "?") }, { etiqueta: "Fecha / estado", valor: `${String(e.entryDate ?? "").slice(0, 10) || "?"} · ${e.status ?? "?"}` }]
  : [{ etiqueta: "Línea", valor: NO_VERIFICADO }];
const queLinea = (e) => e
  ? `línea de ${nombreLinea(e)} · ${linea60(e.speciesCommon ?? "?", 40)} · ${madera({ m3: num(e.volumeM3), piezas: num(e.pieces) })}${e.status === "anulado" ? " · OJO: YA ESTÁ ANULADA" : ""}`
  : `línea que ${NO_VERIFICADO} (no la encontré en el libro buscando por ese código)`;

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "loth_ver",
    grupo: "loth",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Libro de Operaciones del Título Habilitante (LO-TH, GET /api/admin/forestal/loth). vista=lista (líneas por sección, permiso y texto; con id para anular), resumen (líneas y m³ por sección), traza (cadena de un árbol o troza por su código), disponibles (lo que puede entrar a una sección) o despachables. Volumen en m³. Ej.: {vista:\"lista\", seccion:\"tala\", buscar:\"85\"}.",
    entrada: {
      negocio,
      vista: z.enum(["lista", "resumen", "traza", "disponibles", "despachables"]).default("lista").describe("Qué mirar; por defecto la lista de líneas"),
      seccion: seccion.optional().describe("lista: solo esa sección · disponibles: la sección destino (obligatoria)"),
      planId: z.string().max(60).optional().describe("Id del permiso/plan (o «sin-plan»): solo sus líneas"),
      soloDelPermiso: z.boolean().optional().describe("Con planId: sin las líneas que aún no tienen permiso"),
      caratulaId: z.string().max(60).optional().describe("Id de la carátula del libro"),
      buscar: z.string().max(120).optional().describe("lista: texto en árbol, troza, especie o guía"),
      codigo: z.string().max(60).optional().describe("traza: código del árbol o la troza (ej. 85-A)"),
      conAnuladas: z.boolean().optional().describe("lista: incluir las líneas anuladas"),
      limite: z.number().int().min(1).max(15).optional().describe("lista: filas por página (1-15, por defecto 10; las líneas son largas)"),
      offset: z.number().int().min(0).max(100000).optional().describe("lista: desde qué fila seguir"),
    },
    pedido: (a) => {
      const v = a.vista ?? "lista";
      const R = "/api/admin/forestal/loth";
      const permiso = limpiar({ planId: a.planId, solo: a.planId && a.soloDelPermiso ? "1" : undefined });
      if (v === "resumen") return { metodo: "GET", ruta: R, query: { stats: "1", ...permiso, ...limpiar({ caratulaId: a.caratulaId }) } };
      // Sin el dato que pide la vista cae a la lista (formatear lo avisa): pedido() nunca tira.
      if (v === "traza" && a.codigo) return { metodo: "GET", ruta: R, query: { trace: a.codigo } };
      if (v === "disponibles" && a.seccion) return { metodo: "GET", ruta: R, query: limpiar({ available: a.seccion, planId: a.planId }) };
      if (v === "despachables") return { metodo: "GET", ruta: R, query: { despachables: "1" } };
      return { metodo: "GET", ruta: R, query: limpiar({ section: a.seccion, ...permiso, caratulaId: a.caratulaId, search: a.buscar, includeAnnulled: a.conAnuladas ? "1" : undefined, limit: a.limite ?? 10, offset: a.offset }) };
    },
    formatear: (d, a) => {
      const v = a?.vista ?? "lista";
      const x = /** @type {any} */ (d);
      if (v === "resumen") {
        const filas = Array.isArray(x?.stats) ? x.stats : [];
        if (!filas.length) return "LO-TH: sin líneas registradas.";
        return ["LO-TH por sección:", ...filas.map((s) => `- ${NOMBRE[s.section] ?? s.section}: ${s.count} línea(s) · ${madera({ m3: s.totalVolumeM3 })}${num(s.totalQuantity) ? ` · cantidad ${s.totalQuantity}` : ""}`), x?.lineasSinPlan ? `Líneas sin permiso asignado: ${x.lineasSinPlan}` : ""].filter(Boolean).join("\n");
      }
      if (v === "traza") {
        const t = x?.trace;
        if (!t) return `Sin cadena para «${a?.codigo}»: ese código no tiene líneas registradas en el libro.`;
        const plan = t.plan ? ` · permiso ${t.plan.tituloHabilitante ?? t.plan.planNumber ?? "?"}${t.plan.titularName ? ` (${t.plan.titularName})` : ""}` : " · sin permiso";
        return [`Cadena de ${t.code} (árbol ${t.treeCode}) · ${t.species ?? "?"}${plan}${t.gtfs?.length ? ` · guías ${t.gtfs.join(", ")}` : ""}:`, ...(t.chain ?? []).map((c) => `- ${String(c.entryDate).slice(0, 10)} · ${NOMBRE[c.section] ?? c.section} N.º ${c.lineNo} · ${[c.treeCode, c.trozaCode, c.despachoCode].filter(Boolean).join(" / ")} · ${madera({ m3: c.volumeM3 })}${c.gtfNumber ? ` · guía ${c.gtfNumber}` : ""}`)].join("\n");
      }
      if (v === "disponibles" || v === "despachables") return lista(d, { titulo: v === "disponibles" ? `Disponible para ${NOMBRE[a?.seccion] ?? a?.seccion}` : "Despachables", cols: [["Árbol", ["treeCode"]], ["Troza", ["trozaCode", "code", "codigo"]], ["Especie", ["speciesCommon", "especie"]], ["Línea", ["lineNo"]], ["Permiso", ["planId"]]], colMadera: COL_M3 });
      const txt = lista(d, { titulo: "LO-TH", cols: COLS, colMadera: COL_M3 });
      return x?.total !== undefined ? `${txt}\nTotal con estos filtros: ${x.total} línea(s). Seguir con offset.` : txt;
    },
  },
  {
    nombre: "loth_linea_anotar",
    grupo: "loth",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Anota una línea en el LO-TH (POST /api/admin/forestal/loth): tala, trozado, despacho o consumo de trozas, producto terminado o despacho de producto. Mueve el saldo del permiso y, en una tala, pasa el árbol del censo a «talado». Volumen en m³. Ej.: {seccion:\"tala\", arbol:\"85\", especie:\"Shihuahuaco\", volumenM3:4.2, planId:\"…\"}.",
    entrada: {
      negocio,
      seccion: seccion.describe("Sección del libro"),
      fecha: dia.optional().describe("AAAA-MM-DD (vacío = hoy)"),
      planId: z.string().max(60).optional().describe("Id del permiso/plan al que va la línea (sale en loth_ver)"),
      caratulaId: z.string().max(60).optional().describe("Id de la carátula, si el libro tiene varias"),
      arbol: z.string().max(60).optional().describe("Código del árbol del censo (tala, trozado)"),
      troza: z.string().max(60).optional().describe("Código de la troza (trozado, despacho, consumo)"),
      despacho: z.string().max(60).optional().describe("Código del despacho"),
      esRama: z.boolean().optional().describe("true si la troza es de rama"),
      especie: z.string().max(120).optional().describe("Nombre común (ej. Shihuahuaco)"),
      especieCientifica: z.string().max(150).optional().describe("Nombre científico"),
      cites: z.boolean().optional().describe("Especie CITES"),
      diamMayorM: z.number().positive().max(99).optional().describe("Diámetro mayor en metros"),
      diamMenorM: z.number().positive().max(99).optional().describe("Diámetro menor en metros"),
      largoM: z.number().positive().max(999).optional().describe("Largo en metros"),
      volumenM3: z.number().nonnegative().max(99999).optional().describe("Volumen en m³"),
      producto: z.string().max(80).optional().describe("Tipo de producto (producto terminado/despacho)"),
      cantidad: z.number().nonnegative().max(9999999).optional().describe("Cantidad en la unidad"),
      unidad: z.enum(["m3", "kg", "unidad"]).optional().describe("Unidad de la cantidad"),
      piezas: z.number().int().nonnegative().max(999999).optional().describe("N.º de piezas"),
      guia: z.string().max(60).optional().describe("N.º de GTF del despacho"),
      descartada: z.boolean().optional().describe("Troza descartada"),
      consumoInterno: z.boolean().optional().describe("Consumo interno (no sale con guía)"),
      marcadoFuste: z.boolean().optional().describe("Fuste marcado"),
      marcadoTocon: z.boolean().optional().describe("Tocón marcado"),
      motosierrista: z.string().max(120).optional().describe("Nombre del motosierrista (tala)"),
      horaTala: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM").optional().describe("Hora de la tala, HH:MM"),
      justificacionDmc: z.string().max(500).optional().describe("Por qué se tala bajo el diámetro mínimo (T8)"),
      motivoSobreCupo: z.string().max(500).optional().describe("Por qué se pasa lo autorizado de la especie (T9, solo admin/owner)"),
      corrigeLinea: z.number().int().positive().optional().describe("N.º de la línea que esta corrige"),
      notaCorreccion: z.string().max(500).optional().describe("Qué corrige"),
      observaciones: z.string().max(1000).optional().describe("Observaciones de la línea"),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/admin/forestal/loth",
      cuerpo: limpiar({
        section: a.seccion, entryDate: a.fecha, planId: a.planId, caratulaId: a.caratulaId, treeCode: a.arbol, trozaCode: a.troza, despachoCode: a.despacho,
        isRama: a.esRama, speciesCommon: a.especie, speciesScientific: a.especieCientifica, cites: a.cites, diamMayorM: a.diamMayorM, diamMenorM: a.diamMenorM,
        lengthM: a.largoM, volumeM3: a.volumenM3, productType: a.producto, quantity: a.cantidad, unit: a.unidad, pieces: a.piezas, gtfNumber: a.guia,
        discarded: a.descartada, consumoInterno: a.consumoInterno, marcadoFuste: a.marcadoFuste, marcadoTocon: a.marcadoTocon, motosierrista: a.motosierrista,
        horaTala: a.horaTala, justificacionDmc: a.justificacionDmc, motivoSobreCupo: a.motivoSobreCupo, correctsLineNo: a.corrigeLinea, correctionNote: a.notaCorreccion,
        observations: a.observaciones,
      }),
    }),
    // Del panel: el permiso (por su id) y lo que el libro ya tiene de ese árbol/troza (una tala repetida se ve antes del OK).
    previa: async (a, leer) => {
      const codigo = a.troza || a.arbol;
      const [plan, traza] = await Promise.all([
        a.planId ? leerSeguro(leer, "/api/admin/forestal/plan", { planId: a.planId }, { sinRecorte: true }) : Promise.resolve(null),
        codigo ? leerSeguro(leer, "/api/admin/forestal/loth", { trace: codigo }, { sinRecorte: true }) : Promise.resolve(null),
      ]);
      const p = /** @type {any} */ (plan?.ok ? plan.datos : null)?.plan;
      const t = /** @type {any} */ (traza?.ok ? traza.datos : null)?.trace;
      return {
        permiso: a.planId ? (p ? linea60(`${p.tituloHabilitante ?? p.planNumber ?? "?"}${p.titularName ? ` · ${p.titularName}` : ""}`) : null) : "",
        cadena: Array.isArray(t?.chain) ? t.chain : traza?.ok ? [] : null,
      };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const permiso = !a.planId ? " sin permiso asignado" : p?.permiso ? ` al permiso ${p.permiso}` : ` al permiso ${a.planId} (${NO_VERIFICADO}: no lo encontré en el panel)`;
      const codigo = [a.arbol && `árbol ${a.arbol}`, a.troza && `troza ${a.troza}`].filter(Boolean).join(", ");
      const cadena = Array.isArray(p?.cadena) && p.cadena.length ? ` OJO: ese código ya tiene ${p.cadena.length} línea(s) en el libro (${p.cadena.map((c) => `${NOMBRE[c.section] ?? c.section} N.º ${c.lineNo}`).slice(0, 4).join(", ")}).` : "";
      const vol = madera({ m3: a.volumenM3, piezas: a.piezas });
      return `Anotar en el LO-TH (${NOMBRE[a.seccion] ?? a.seccion})${permiso}: ${codigo || "sin código"}${a.especie ? ` · ${a.especie}` : ""} · ${vol !== "—" ? vol : a.cantidad ? `${a.cantidad} ${a.unidad ?? ""}`.trim() : "sin volumen"}${a.guia ? ` · guía ${a.guia}` : ""}.${a.seccion === "tala" && a.arbol ? " El árbol pasa a «talado» en el censo." : ""} Mueve el saldo del permiso.${cadena}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: claveLinea({ m3: a.volumenM3, cantidad: a.cantidad, unidad: a.unidad, piezas: a.piezas }),
        filas: [
          { etiqueta: "Sección", valor: NOMBRE[a.seccion] ?? a.seccion },
          { etiqueta: "Permiso (del panel)", valor: !a.planId ? "sin permiso" : p?.permiso || NO_VERIFICADO },
          { etiqueta: "Árbol / troza", valor: linea60([a.arbol, a.troza].filter(Boolean).join(" / ") || "—") },
          { etiqueta: "Ya en el libro", valor: Array.isArray(p?.cadena) ? (p.cadena.length ? `${p.cadena.length} línea(s) de ese código` : "nada de ese código") : "no se pudo leer" },
        ],
      };
    },
  },
  {
    nombre: "loth_linea_anular",
    grupo: "loth",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Anula una línea del LO-TH (PATCH /api/admin/forestal/loth/[id], action=annul): queda visible como anulada (subsanación SERFOR) y su volumen sale del saldo del permiso. Solo admin/owner. Pide el código del árbol/troza/guía para encontrarla. Ej.: {id:\"c328…\", codigo:\"DEMO-022-A\", motivo:\"medida mal tipeada\"}.",
    entrada: {
      negocio,
      id: idRuta.describe("Id de la línea (sale en loth_ver vista=lista)"),
      codigo: z.string().min(1).max(60).describe("Árbol, troza, especie o guía de esa línea: con eso la busco en el panel"),
      motivo: z.string().trim().min(3).max(500).describe("Por qué se anula (3-500 letras)"),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/admin/forestal/loth/${a.id}`, cuerpo: { action: "annul", reason: a.motivo } }),
    previa: (a, leer) => lineaDelPanel(a, leer),
    resumen: (a, previa) => `Anular en el LO-TH la ${queLinea(previa)}. Motivo: ${a.motivo}. Queda visible como anulada y el saldo del permiso se recalcula.`,
    ventana: (_a, previa) => {
      const e = /** @type {any} */ (previa);
      return { clave: e ? claveLinea({ m3: e.volumeM3, cantidad: e.quantity, unidad: e.unit, piezas: e.pieces }) : null, filas: filasLinea(e) };
    },
  },
  {
    nombre: "loth_linea_borrar",
    grupo: "loth",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Borra una línea del LO-TH (DELETE /api/admin/forestal/loth/[id], baja lógica): solo para errores de captura del sistema; lo que ya se presentó a SERFOR se ANULA (loth_linea_anular). Solo admin/owner. Ej.: {id:\"c328…\", codigo:\"DEMO-022-A\"}.",
    entrada: {
      negocio,
      id: idRuta.describe("Id de la línea (sale en loth_ver vista=lista)"),
      codigo: z.string().min(1).max(60).describe("Árbol, troza, especie o guía de esa línea: con eso la busco en el panel"),
    },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/admin/forestal/loth/${a.id}` }),
    previa: (a, leer) => lineaDelPanel(a, leer),
    resumen: (_a, previa) => `Borrar del LO-TH la ${queLinea(previa)}. Desaparece del libro (no queda como anulada) y el saldo del permiso se recalcula.`,
    ventana: (_a, previa) => {
      const e = /** @type {any} */ (previa);
      return { clave: e ? claveLinea({ m3: e.volumeM3, cantidad: e.quantity, unidad: e.unit, piezas: e.pieces }) : null, filas: filasLinea(e) };
    },
  },
];

// Sin codigo (traza) o sin seccion (disponibles) el pedido cae a la lista para no tirar: se avisa arriba.
{
  const ver = herramientas.find((h) => h.nombre === "loth_ver");
  const fmt = ver.formatear;
  ver.formatear = (d, a) => {
    const v = a?.vista ?? "lista";
    const falta = v === "traza" && !a?.codigo ? "Para la traza pasá codigo (árbol o troza)" : v === "disponibles" && !a?.seccion ? "Para disponibles pasá seccion (la sección destino)" : "";
    return falta ? `${falta}; te muestro la lista.\n${fmt(d, { ...a, vista: "lista" })}` : fmt(d, a);
  };
}
