// Grupo «lotes»: lotes de aserrío (ADR-441) del negocio forestal: armar con trozas del patio, consumir y registrar la jornada.
// Ruta única /api/admin/forestal/lotes-aserrio (spec ctp-libro). Volumen en m³. Lo que mueve trozas o madera pide OK de Brandon.
import { z, negocio, idRuta, dia, limpiar, lista, madera, linea60, claveCantidad, filasDe, leerSeguro, NO_VERIFICADO } from "../util-herramientas.mjs";

const R = "/api/admin/forestal/lotes-aserrio";
const PATIO = "/api/admin/forestal/trozas/patio";
/** Número > 0 o undefined (los Decimal llegan como texto). @param {unknown} v */
const num = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0 ? undefined : Number(v));
const r3 = (n) => Math.round(n * 1000) / 1000;
/** «40,0 %» con coma decimal. @param {number} n */
const pct = (n) => `${n.toFixed(1).replace(".", ",")} %`;
const idLote = idRuta.describe("Id del lote (sale en lotes_ver)");
const trozaIds = z.array(idRuta).min(1).max(500).describe("Ids de las trozas (salen en lotes_ver vista=patio o vista=historia)");
const COLS_TROZA = [["Código", ["codificacion"]], ["Planta", ["codigoPlanta"]], ["Especie", ["especieComun"]], ["Guía", ["gtfNumber"]], ["Permiso", ["permiso"]], ["id", ["id"]]];

/** El lote tal como lo tiene el panel (GET ?historia=) o null. @param {string} id @param {any} leer */
async function loteDelPanel(id, leer) {
  const r = await leerSeguro(leer, R, { historia: id }, { sinRecorte: true });
  const h = /** @type {any} */ (r.ok ? r.datos : null)?.historia;
  return h && typeof h === "object" && h.lote ? h : null;
}
/** Trozas del lote según el panel (armado). @param {any} h @returns {any[]} */
const trozasDe = (h) => (Array.isArray(h?.armado?.trozas) ? h.armado.trozas : []);
/** Suma de m³ de unas trozas. @param {any[]} t */
const m3De = (t) => r3(t.reduce((s, x) => s + (num(x.volumenM3) ?? 0), 0));
/** «lote L-12 · Shihuahuaco · abierto · 8 trozas, 12,4 m³» del panel. @param {any} h */
const queLote = (h) => h
  ? `lote ${linea60(h.lote.code ?? "sin código", 40)} · ${linea60(h.lote.speciesCommon ?? "?", 40)} · ${h.lote.status ?? "?"} · ${trozasDe(h).length} troza(s), ${madera({ m3: m3De(trozasDe(h)) || undefined })}`
  : `lote que ${NO_VERIFICADO} (no lo encontré en el panel)`;
/** @param {any} h */
const filaLote = (h) => ({ etiqueta: "Lote (del panel)", valor: h ? linea60(`${h.lote.code ?? "sin código"} · ${h.lote.speciesCommon ?? "?"} · ${h.lote.status ?? "?"}`) : NO_VERIFICADO });
/** Las trozas pedidas que el panel conoce + cuántas no encontró. @param {string[]} ids @param {any[]} fuente */
function elegidas(ids, fuente) {
  const porId = new Map(fuente.map((t) => [String(t.id), t]));
  const hay = ids.map((id) => porId.get(String(id))).filter(Boolean);
  return { hay, faltan: ids.length - hay.length };
}
const claveM3 = (m3, etiqueta) => (m3 > 0 ? claveCantidad(m3, { etiqueta, unidad: "m³" }) : null);
/** Trozas del lote que de verdad se consumen (las pedidas o todas), sin las ya consumidas. @param {any} a @param {any} h */
const aConsumir = (a, h) => {
  if (!h) return { sel: null, ya: 0 };
  const base = a.trozaIds ? elegidas(a.trozaIds, trozasDe(h)).hay : trozasDe(h);
  const sel = base.filter((t) => !t.consumidaEnId);
  return { sel, ya: a.trozaIds ? base.length - sel.length : 0 };
};
/** Texto del cliente cuando el JSON pasó de 20 KB. @param {any} d @param {string} consejo */
const recortado = (d, consejo) => {
  const codigos = [...String(d.texto ?? "").matchAll(/"code":"([^"]{1,60})"/g)].map((m) => m[1]);
  return `La respuesta pasó de 20 KB y llegó cortada. ${consejo}${codigos.length ? `\nCódigos que alcancé a ver: ${[...new Set(codigos)].slice(0, 30).join(", ")}` : ""}`;
};

/** Una acción del PATCH sobre un lote existente que lee el lote del panel. */
function accionLote({ nombre, descripcion, entrada = {}, cuerpo, frase, clave }) {
  return {
    nombre,
    grupo: "lotes",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion,
    entrada: { negocio, loteId: idLote, ...entrada },
    pedido: (a) => ({ metodo: "PATCH", ruta: R, cuerpo: cuerpo(a) }),
    previa: (a, leer) => loteDelPanel(a.loteId, leer),
    resumen: (a, previa) => frase(a, previa),
    ventana: (a, previa) => clave(a, previa),
  };
}

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "lotes_ver",
    grupo: "lotes",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Lotes de aserrío (GET /api/admin/forestal/lotes-aserrio). vista=aserrio (lista con estado, especie, trozas y m³), historia (un lote: armado, consumo, producción y rendimiento; pide loteId) o patio (trozas libres del patio para armar lotes; GET /api/admin/forestal/trozas/patio). Volumen en m³. Ej.: {vista:\"aserrio\", estado:\"abierto\"}.",
    entrada: {
      negocio,
      vista: z.enum(["aserrio", "historia", "patio"]).default("aserrio").describe("Qué mirar; por defecto la lista de lotes de aserrío"),
      estado: z.enum(["abierto", "consumido", "cerrado"]).optional().describe("aserrio: solo los lotes en ese estado"),
      especie: z.string().trim().max(120).optional().describe("aserrio: nombre común exacto (ej. Shihuahuaco)"),
      limite: z.number().int().min(1).max(50).optional().describe("aserrio: cuántos lotes (1-50, por defecto 5; cada lote trae sus trozas)"),
      loteId: idRuta.optional().describe("historia: el lote (obligatorio) · patio: solo las trozas de ese lote"),
      contratoId: idRuta.optional().describe("patio: solo trozas de ese permiso/contrato"),
    },
    pedido: (a) => {
      const v = a.vista ?? "aserrio";
      if (v === "historia" && a.loteId) return { metodo: "GET", ruta: R, query: { historia: a.loteId } };
      if (v === "patio") return { metodo: "GET", ruta: PATIO, query: limpiar({ loteId: a.loteId, contratoId: a.contratoId }) };
      return { metodo: "GET", ruta: R, query: limpiar({ status: a.estado, especie: a.especie, limite: a.limite ?? 5 }) };
    },
    formatear: (d, a) => {
      const v = a?.vista ?? "aserrio";
      const x = /** @type {any} */ (d);
      if (x?._recortadoA) return recortado(x, v === "patio" ? "Filtrá con loteId o contratoId." : "Pedí menos (limite) o un lote con vista=historia.");
      if (v === "historia") {
        const h = x?.historia;
        if (!h?.lote) return "No encontré ese lote.";
        const t = trozasDe(h);
        const p = h.produccion ?? {};
        return [
          `Lote ${h.lote.code ?? "sin código"} · ${h.lote.speciesCommon ?? "?"} · ${h.lote.status ?? "?"}${h.lote.tipoProductoConsumir ? ` · consume ${h.lote.tipoProductoConsumir}` : ""}${h.lote.fechaApertura ? ` · abierto el ${String(h.lote.fechaApertura).slice(0, 10)}` : ""}`,
          `Armado: ${t.length} troza(s), ${madera({ m3: m3De(t) || undefined })} · consumidas ${t.filter((x_) => x_.consumidaEnId).length}${Array.isArray(h.armado?.guias) ? ` · guías ${h.armado.guias.map((g) => g?.gtfNumber ?? g).slice(0, 8).join(", ")}` : ""}`,
          `Producción: ${Array.isArray(p.corridas) ? p.corridas.length : 0} corrida(s) · ${madera({ m3: num(p.total?.m3 ?? p.total), piezas: num(p.piezas) })}${num(p.rendimientoPct) ? ` · rendimiento ${pct(Number(p.rendimientoPct))}` : ""}`,
          lista(t, { titulo: "Trozas del lote", cols: [...COLS_TROZA, ["Consumida", ["consumidaEnId"]]], colMadera: { m3: ["volumenM3"] }, max: 40, vacio: "Sin trozas." }),
        ].join("\n");
      }
      if (v === "patio") {
        const txt = lista(x?.trozas ?? x, { titulo: a?.loteId ? "Trozas del lote" : "Trozas libres en el patio", cols: COLS_TROZA, colMadera: { m3: ["volumenM3"] }, vacio: a?.loteId ? "Ese lote no tiene trozas." : "No hay trozas libres en el patio." });
        return x?.total !== undefined ? `${txt}\nEn el patio: ${x.total} troza(s)${x.truncado ? ` (se devolvieron ${x.devueltas})` : ""}.` : txt;
      }
      const lotes = filasDe(x);
      if (!lotes.length) return `Sin lotes de aserrío${a?.estado ? ` en estado ${a.estado}` : ""}${a?.especie ? ` de ${a.especie}` : ""}.`;
      return lotes.map((l) => {
        const t = Array.isArray(l.trozas) ? l.trozas : [];
        return `- ${l.code ?? "sin código"} · ${l.speciesCommon ?? "?"} · ${l.status ?? "?"} · ${t.length} troza(s), ${madera({ m3: num(l.volumenM3) ?? (m3De(t) || undefined), piezas: num(l.piezas) })} · id ${l.id}`;
      }).join("\n") + (x?.total !== undefined ? `\nTotal: ${x.total} lote(s).` : "");
    },
  },
  {
    nombre: "lote_crear",
    grupo: "lotes",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Abre un lote de aserrío vacío (POST /api/admin/forestal/lotes-aserrio, modo=abierto) para después agregarle trozas. Con modo=inventario registra un lote ya aserrado con su volumen consumido y paquetes: eso mueve madera y pide OK de Brandon. Volumen en m³. Ej.: {especie:\"Shihuahuaco\", codigo:\"L-31\"}.",
    entrada: {
      negocio,
      modo: z.enum(["abierto", "inventario"]).default("abierto").describe("abierto = lote vacío · inventario = lote ya aserrado (pide OK)"),
      codigo: z.string().trim().min(1).max(60).optional().describe("Código del lote (vacío = el panel lo numera)"),
      especie: z.string().trim().min(1).max(120).describe("Nombre común"),
      especieCientifica: z.string().trim().max(160).optional().describe("Nombre científico"),
      notas: z.string().trim().max(500).optional().describe("Notas"),
      ordenProduccion: z.string().trim().max(80).optional().describe("abierto: orden de producción"),
      tipoProductoConsumir: z.string().trim().max(60).optional().describe("abierto: qué se va a consumir (ej. rolliza)"),
      permiso: z.string().trim().max(100).optional().describe("abierto: título habilitante que consume"),
      inicioProceso: dia.optional().describe("abierto: inicio AAAA-MM-DD"),
      finProceso: dia.optional().describe("Fin AAAA-MM-DD"),
      volumenConsumidoM3: z.number().positive().max(999999).optional().describe("inventario: m³ de troza consumidos"),
      fecha: dia.optional().describe("inventario: día AAAA-MM-DD"),
      paquetes: z.array(z.object({
        codigo: z.string().trim().min(1).max(60).describe("Código del paquete"),
        producto: z.string().trim().max(80).optional().describe("Tipo de producto"),
        presentacion: z.string().trim().max(80).optional().describe("Presentación (ej. 2x8x10)"),
        cantidad: z.number().int().nonnegative().max(99999).describe("Piezas del paquete"),
        volumenM3: z.number().positive().max(999999).describe("Volumen del paquete en m³"),
        espesorCm: z.number().positive().max(9999).optional().describe("Espesor en cm"),
        anchoCm: z.number().positive().max(9999).optional().describe("Ancho en cm"),
        largoM: z.number().positive().max(999).optional().describe("Largo en m"),
        observaciones: z.string().trim().max(300).optional().describe("Notas del paquete"),
      })).max(200).optional().describe("inventario: paquetes producidos"),
    },
    confirmarSi: (a) => (a.modo ?? "abierto") === "inventario",
    pedido: (a) => {
      const base = { code: a.codigo, speciesCommon: a.especie, speciesScientific: a.especieCientifica, notes: a.notas, finProceso: a.finProceso };
      if ((a.modo ?? "abierto") === "abierto") return { metodo: "POST", ruta: R, cuerpo: limpiar({ modo: "abierto", ...base, ordenProduccion: a.ordenProduccion, tipoProductoConsumir: a.tipoProductoConsumir, permiso: a.permiso, inicioProceso: a.inicioProceso }) };
      return {
        metodo: "POST",
        ruta: R,
        cuerpo: limpiar({
          modo: "inventario", ...base, volumenConsumidoM3: a.volumenConsumidoM3, fecha: a.fecha,
          paquetes: a.paquetes?.map((p) => limpiar({ codigo: p.codigo, productType: p.producto, presentacion: p.presentacion, cantidad: p.cantidad, volumenM3: p.volumenM3, espesorCm: p.espesorCm, anchoCm: p.anchoCm, largoM: p.largoM, observations: p.observaciones })),
        }),
      };
    },
    resumen: (a) => {
      const paq = a.paquetes ?? [];
      return (a.modo ?? "abierto") === "abierto"
        ? `Abrir el lote de aserrío ${a.codigo ?? "(código automático)"} de ${a.especie}, vacío.`
        : `Registrar el lote ya aserrado ${a.codigo ?? "(código automático)"} de ${a.especie}: consumió ${madera({ m3: a.volumenConsumidoM3 })} de troza${paq.length ? ` y dio ${paq.length} paquete(s), ${madera({ m3: r3(paq.reduce((s, p) => s + p.volumenM3, 0)) })}` : ""}. Mueve el saldo de madera.${a.volumenConsumidoM3 ? "" : " OJO: falta volumenConsumidoM3 y el panel lo rechaza."}`;
    },
    // Cantidades nuevas: el dato de los botones es el m³ consumido que se manda (atado al pedido).
    ventana: (a) => {
      const paq = a.paquetes ?? [];
      return {
        clave: claveM3(a.volumenConsumidoM3 ?? 0, "Troza consumida (m³)"),
        filas: [{ etiqueta: "Especie", valor: linea60(a.especie) }, { etiqueta: "Código", valor: linea60(a.codigo ?? "automático") }, { etiqueta: "Paquetes", valor: paq.length ? `${paq.length} · ${madera({ m3: r3(paq.reduce((s, p) => s + p.volumenM3, 0)) })}` : "ninguno" }],
      };
    },
    formatear: (d) => {
      const l = /** @type {any} */ (d)?.lote;
      return l ? `Lote creado: ${l.code ?? "sin código"} · ${l.speciesCommon ?? "?"} · ${l.status ?? "?"} · id ${l.id}.` : "Lote creado.";
    },
  },
  {
    nombre: "lote_trozas_agregar",
    grupo: "lotes",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Agrega trozas del patio a un lote de aserrío (PATCH /api/admin/forestal/lotes-aserrio, accion=agregar): salen del patio y quedan en el lote. Volumen en m³. Ej.: {loteId:\"cm…\", trozaIds:[\"cm1…\",\"cm2…\"]}.",
    entrada: { negocio, loteId: idLote, trozaIds },
    pedido: (a) => ({ metodo: "PATCH", ruta: R, cuerpo: { accion: "agregar", loteId: a.loteId, trozaIds: a.trozaIds } }),
    // Del panel: el lote (historia) y el m³ de cada troza según el patio (las que no están libres no suman).
    previa: async (a, leer) => {
      const [lote, patio] = await Promise.all([loteDelPanel(a.loteId, leer), leerSeguro(leer, PATIO, undefined, { sinRecorte: true })]);
      const libres = patio.ok ? filasDe(/** @type {any} */ (patio.datos)?.trozas ?? patio.datos) : null;
      return { lote, ...(libres ? elegidas(a.trozaIds, libres) : { hay: null, faltan: a.trozaIds.length }) };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const hay = p?.hay;
      const que = hay ? `${hay.length} troza(s) del patio (${madera({ m3: m3De(hay) || undefined })}: ${hay.slice(0, 6).map((t) => t.codificacion ?? t.codigoPlanta ?? "?").join(", ")}${hay.length > 6 ? "…" : ""})` : `${a.trozaIds.length} troza(s) que ${NO_VERIFICADO} (no pude leer el patio)`;
      return `Agregar ${que} al ${queLote(p?.lote)}.${hay && p.faltan ? ` OJO: ${p.faltan} de las pedidas no están libres en el patio y el panel las va a rechazar.` : ""}`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.hay ? claveM3(m3De(p.hay), "Trozas que entran (m³)") : null,
        filas: [filaLote(p?.lote), { etiqueta: "Trozas libres encontradas", valor: p?.hay ? `${p.hay.length}${p.faltan ? ` (faltan ${p.faltan})` : ""}` : NO_VERIFICADO }],
      };
    },
  },
  accionLote({
    nombre: "lote_consumir",
    descripcion: "Consume las trozas de un lote de aserrío (PATCH /api/admin/forestal/lotes-aserrio, accion=consumir): pasan a «consumidas» en el libro. Sin trozaIds consume todas las que faltan. Volumen en m³. Ej.: {loteId:\"cm…\", fecha:\"2026-10-29\"}.",
    entrada: {
      trozaIds: z.array(idRuta).min(1).max(500).optional().describe("Solo esas trozas del lote (vacío = todas las que faltan)"),
      fecha: dia.optional().describe("Día del consumo AAAA-MM-DD (vacío = hoy)"),
      observaciones: z.string().trim().max(500).optional().describe("Notas"),
    },
    cuerpo: (a) => limpiar({ accion: "consumir", loteId: a.loteId, trozaIds: a.trozaIds, fecha: a.fecha, observaciones: a.observaciones }),
    frase: (a, h) => {
      const { sel, ya } = aConsumir(a, h);
      return `Consumir ${sel ? `${sel.length} troza(s), ${madera({ m3: m3De(sel) || undefined })},` : `trozas que ${NO_VERIFICADO}`} del ${queLote(h)}${a.fecha ? ` con fecha ${a.fecha}` : ""}. Pasan a consumidas en el libro.${ya ? ` OJO: ${ya} de las pedidas ya estaban consumidas y no cuentan.` : ""}${sel && !sel.length ? " OJO: no hay ninguna troza pendiente de consumir en ese lote." : ""}`;
    },
    clave: (a, h) => {
      const { sel } = aConsumir(a, h);
      return { clave: sel ? claveM3(m3De(sel), "Troza consumida (m³)") : null, filas: [filaLote(h), { etiqueta: "Trozas a consumir", valor: sel ? String(sel.length) : NO_VERIFICADO }] };
    },
  }),
  accionLote({
    nombre: "lote_jornada_registrar",
    descripcion: "Registra la jornada de aserrío de un lote (PATCH /api/admin/forestal/lotes-aserrio, accion=registrar-jornada): consume esas trozas y anota la producción (m³ aserrados) en el libro CTP con su rendimiento. Solo admin/owner/manager. Ej.: {loteId:\"cm…\", trozaIds:[\"cm1…\"], produccionM3:0.62, piezas:48}.",
    entrada: {
      trozaIds,
      produccionM3: z.number().positive().max(9999999).describe("Madera aserrada producida en m³"),
      piezas: z.number().int().nonnegative().max(999999).optional().describe("Piezas producidas"),
      producto: z.string().trim().max(80).optional().describe("Tipo de producto (ej. tablas)"),
      presentacion: z.string().trim().max(80).optional().describe("Presentación (ej. 1x8x10)"),
      codigoProducto: z.string().trim().max(80).optional().describe("Código del producto"),
      lineaProduccion: z.string().trim().max(10).optional().describe("Línea de producción"),
      fecha: dia.optional().describe("Día de la jornada AAAA-MM-DD (vacío = hoy)"),
      exigirTodas: z.boolean().optional().describe("true = falla si alguna troza no se puede consumir"),
      observaciones: z.string().trim().max(500).optional().describe("Notas de la jornada"),
    },
    cuerpo: (a) => limpiar({
      accion: "registrar-jornada", loteId: a.loteId, trozaIds: a.trozaIds, fecha: a.fecha, observaciones: a.observaciones, exigirTodas: a.exigirTodas,
      produccion: limpiar({ quantity: a.produccionM3, unit: "m3", pieces: a.piezas, productType: a.producto, presentacion: a.presentacion, codigoProducto: a.codigoProducto, lineaProduccion: a.lineaProduccion }),
    }),
    frase: (a, h) => {
      const e = h ? elegidas(a.trozaIds, trozasDe(h)) : null;
      const m3 = e ? m3De(e.hay) : 0;
      const rend = m3 > 0 ? ` (rendimiento ${pct((a.produccionM3 / m3) * 100)})` : "";
      return `Jornada del ${queLote(h)}: consumir ${e ? `${e.hay.length} troza(s), ${madera({ m3: m3 || undefined })}` : `trozas que ${NO_VERIFICADO}`} y anotar ${madera({ m3: a.produccionM3, piezas: a.piezas })} producidos${rend}.${e?.faltan ? ` OJO: ${e.faltan} troza(s) pedidas no son de este lote.` : ""}`;
    },
    // El dato de los botones = m³ de troza que se consume según el panel; la producción va en una fila.
    clave: (a, h) => {
      const e = h ? elegidas(a.trozaIds, trozasDe(h)) : null;
      const m3 = e ? m3De(e.hay) : 0;
      return {
        clave: e ? claveM3(m3, "Troza consumida (m³)") : null,
        filas: [filaLote(h), { etiqueta: "Trozas del lote", valor: e ? `${e.hay.length}${e.faltan ? ` (no son del lote: ${e.faltan})` : ""}` : NO_VERIFICADO }, { etiqueta: "Producción", valor: `${madera({ m3: a.produccionM3, piezas: a.piezas })}${m3 > 0 ? ` · ${pct((a.produccionM3 / m3) * 100)}` : ""}` }],
      };
    },
  }),
  {
    nombre: "lote_editar",
    grupo: "lotes",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Corrige los datos de un lote de aserrío (PATCH /api/admin/forestal/lotes-aserrio, accion=editar): código, especie, orden, permiso, fechas y notas. No mueve trozas ni madera; cambiar el permiso o el contrato pide OK de Brandon. Ej.: {loteId:\"cm…\", notas:\"turno noche\"}.",
    entrada: {
      negocio,
      loteId: idLote,
      codigo: z.string().trim().min(1).max(60).optional().describe("Código nuevo del lote"),
      especie: z.string().trim().min(1).max(120).optional().describe("Nombre común"),
      especieCientifica: z.string().trim().max(160).optional().describe("Nombre científico"),
      ordenProduccion: z.string().trim().max(80).optional().describe("Orden de producción"),
      tipoProductoConsumir: z.string().trim().max(60).optional().describe("Qué consume (ej. rolliza)"),
      permiso: z.string().trim().max(100).optional().describe("Título habilitante (texto)"),
      contratoId: idRuta.optional().describe("Id del permiso elegido de la lista (fija código y enlace)"),
      inicioProceso: dia.optional().describe("Inicio AAAA-MM-DD"),
      finProceso: dia.optional().describe("Fin AAAA-MM-DD"),
      notas: z.string().trim().max(500).optional().describe("Notas"),
    },
    // El permiso/contrato decide a qué título se atribuye la madera del lote: pide OK (security 29-10).
    confirmarSi: (a) => a.permiso !== undefined || a.contratoId !== undefined,
    previa: (a, leer) => loteDelPanel(a.loteId, leer),
    resumen: (a, h) => {
      const l = /** @type {any} */ (h)?.lote;
      const cambios = [
        a.permiso !== undefined && `permiso ${l?.permiso ?? "—"} → ${a.permiso}`,
        a.contratoId !== undefined && `contrato ${l?.contratoId ?? "—"} → ${a.contratoId}`,
        a.codigo !== undefined && `código → ${a.codigo}`,
        a.especie !== undefined && `especie → ${a.especie}`,
      ].filter(Boolean);
      return `Corregir el ${queLote(h)}: ${cambios.join(", ") || "notas, orden o fechas"}.${a.permiso !== undefined || a.contratoId !== undefined ? " Cambia a qué permiso se atribuye su madera." : ""}`;
    },
    ventana: (a, h) => {
      const l = /** @type {any} */ (h)?.lote;
      const cambio = (etiqueta, antes, despues) => ({ etiqueta, valor: linea60(`${antes ?? "—"} → ${despues}`) });
      return {
        clave: h ? claveM3(m3De(trozasDe(h)), "Madera del lote (m³)") : null,
        filas: [filaLote(h), a.permiso !== undefined && cambio("Permiso (panel → nuevo)", l ? l.permiso : NO_VERIFICADO, a.permiso), a.contratoId !== undefined && cambio("Contrato (panel → nuevo)", l ? l.contratoId : NO_VERIFICADO, a.contratoId)].filter(Boolean),
      };
    },
    pedido: (a) => {
      const c = limpiar({ code: a.codigo, speciesCommon: a.especie, speciesScientific: a.especieCientifica, ordenProduccion: a.ordenProduccion, tipoProductoConsumir: a.tipoProductoConsumir, permiso: a.permiso, contratoId: a.contratoId, inicioProceso: a.inicioProceso, finProceso: a.finProceso, notes: a.notas });
      return { metodo: "PATCH", ruta: R, cuerpo: { accion: "editar", loteId: a.loteId, ...c } };
    },
    formatear: (d) => {
      const l = /** @type {any} */ (d)?.lote;
      return l ? `Lote corregido: ${l.code ?? "sin código"} · ${l.speciesCommon ?? "?"} · ${l.status ?? "?"}.` : "Lote corregido.";
    },
  },
  accionLote({
    nombre: "lote_troza_quitar",
    descripcion: "Saca una troza de un lote de aserrío (PATCH /api/admin/forestal/lotes-aserrio, accion=quitar): vuelve libre al patio. Volumen en m³. Ej.: {loteId:\"cm…\", trozaId:\"cm1…\"}.",
    entrada: { trozaId: idRuta.describe("Id de la troza (lotes_ver vista=historia)") },
    cuerpo: (a) => ({ accion: "quitar", loteId: a.loteId, trozaId: a.trozaId }),
    frase: (a, h) => {
      const t = h ? trozasDe(h).find((x) => String(x.id) === String(a.trozaId)) : null;
      return `Sacar del ${queLote(h)} la troza ${t ? `${linea60(t.codificacion ?? t.codigoPlanta ?? "?", 40)} (${madera({ m3: num(t.volumenM3) })})` : `que ${NO_VERIFICADO} (no está en ese lote)`}. Vuelve libre al patio.`;
    },
    clave: (a, h) => {
      const t = h ? trozasDe(h).find((x) => String(x.id) === String(a.trozaId)) : null;
      return { clave: t ? claveM3(num(t.volumenM3) ?? 0, "Volumen de la troza (m³)") : null, filas: [filaLote(h), { etiqueta: "Troza", valor: t ? linea60(t.codificacion ?? t.codigoPlanta ?? "?") : NO_VERIFICADO }] };
    },
  }),
  accionLote({
    nombre: "lote_cerrar",
    descripcion: "Cierra un lote de aserrío (PATCH /api/admin/forestal/lotes-aserrio, accion=cerrar): ya no recibe trozas ni jornadas; queda el motivo. Volumen en m³. Ej.: {loteId:\"cm…\", motivo:\"lote terminado\"}.",
    entrada: { motivo: z.string().trim().min(3).max(300).describe("Por qué se cierra (3-300 letras)") },
    cuerpo: (a) => ({ accion: "cerrar", loteId: a.loteId, motivo: a.motivo }),
    frase: (a, h) => `Cerrar el ${queLote(h)}. Motivo: ${a.motivo}. Ya no recibe trozas ni jornadas.${h?.lote.status === "cerrado" ? " OJO: ya está cerrado." : ""}`,
    clave: (_a, h) => ({ clave: h ? claveM3(m3De(trozasDe(h)), "Trozas del lote (m³)") : null, filas: [filaLote(h)] }),
  }),
  accionLote({
    nombre: "lote_reabrir",
    descripcion: "Reabre un lote de aserrío cerrado (PATCH /api/admin/forestal/lotes-aserrio, accion=reabrir): vuelve a recibir trozas y jornadas. Volumen en m³. Ej.: {loteId:\"cm…\"}.",
    cuerpo: (a) => ({ accion: "reabrir", loteId: a.loteId }),
    frase: (_a, h) => `Reabrir el ${queLote(h)}. Vuelve a recibir trozas y jornadas.${h && h.lote.status !== "cerrado" ? ` OJO: no está cerrado (está «${h.lote.status}»).` : ""}`,
    clave: (_a, h) => ({ clave: h ? claveM3(m3De(trozasDe(h)), "Trozas del lote (m³)") : null, filas: [filaLote(h)] }),
  }),
  {
    nombre: "lote_borrar",
    grupo: "lotes",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Borra un lote de aserrío (DELETE /api/admin/forestal/lotes-aserrio?id=): sus trozas vuelven al patio. Solo admin/owner. Ej.: {loteId:\"cm…\"}.",
    entrada: { negocio, loteId: idLote },
    pedido: (a) => ({ metodo: "DELETE", ruta: R, query: { id: a.loteId } }),
    previa: (a, leer) => loteDelPanel(a.loteId, leer),
    resumen: (_a, h) => `Borrar el ${queLote(h)}. Sus trozas vuelven libres al patio.`,
    ventana: (_a, h) => ({ clave: h ? claveM3(m3De(trozasDe(h)), "Trozas del lote (m³)") : null, filas: [filaLote(h)] }),
  },
];

// Sin loteId la vista historia cae a la lista de lotes para no tirar: se avisa arriba.
{
  const ver = herramientas.find((h) => h.nombre === "lotes_ver");
  const fmt = ver.formatear;
  ver.formatear = (d, a) => (a?.vista === "historia" && !a?.loteId ? `Para la historia pasá loteId (sale de esta lista).\n${fmt(d, { ...a, vista: "aserrio" })}` : fmt(d, a));
}
