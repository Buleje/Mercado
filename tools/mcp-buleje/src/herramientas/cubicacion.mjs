// Grupo «cubicacion»: cubicaciones de madera (Herramientas forestales). Guardar toca el saldo de la cuenta (plata).
import { z, negocio, idRuta, dia, limpiar, lista, ficha, soles, madera, pick, claveCantidad, claveMonto, claveNombre, filasCompletas, otrosNombres, linea60, verificado, leerSeguro, filasDe, NO_VERIFICADO, numero } from "../util-herramientas.mjs";

const COL_MADERA = { pt: ["pt", "totalPt", "pies"], m3: ["m3", "totalM3"], piezas: ["piezas", "totalPiezas"] };
const U = z.enum(["pulg", "cm", "pies", "m"]);

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "cubicaciones_ver",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Cubicaciones de la tabla VIEJA (GET /api/admin/forestal/cubicaciones; Blas y la bodega usan cubicaciones_trozas_ver). Cubicaciones guardadas: nombre, cliente, especie, PT, m³ y piezas, precio por PT en S/. Con despachoId trae las de un despacho; enLibro=true solo las ya pasadas al libro.",
    entrada: { negocio, despachoId: z.string().max(60).optional(), enLibro: z.boolean().optional() },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/forestal/cubicaciones", query: limpiar({ despachoId: a.despachoId, enLibro: a.enLibro ? "1" : undefined }) }),
    formatear: (d) => lista(d, { titulo: "Cubicaciones", cols: [["Nombre", ["nombre"]], ["Fecha", ["fecha"], "f"], ["Cliente", ["cliente"]], ["Especie", ["especie"]], ["Precio PT", ["precioPt"], "s"], ["GTF", ["gtfNumber"]]], colMadera: COL_MADERA }),
  },
  {
    nombre: "cubicacion_guardar",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Guarda una cubicación en la tabla VIEJA (POST /api/admin/forestal/cubicaciones; las de trozas van con cubicacion_trozas_guardar): piezas con espesor, ancho y largo, precio por PT en S/ y datos del viaje (adelanto en S/). Con id edita una existente. Desde ADR-522 el guardado toca el saldo de la cuenta del cliente: pide OK de Brandon.",
    entrada: {
      negocio,
      id: z.string().max(60).optional().describe("Con id edita; sin id crea"),
      nombre: z.string().min(1).max(120),
      fecha: dia.optional(),
      cliente: z.string().max(120).optional(),
      especie: z.string().max(60).optional(),
      notas: z.string().max(600).optional(),
      precioPt: z.number().nonnegative().max(999999).optional().describe("S/ por PT"),
      guia: z.string().max(60).optional().describe("N.º de guía"),
      ctpEntryId: z.string().max(60).optional(),
      actualizadoEn: z.string().max(40).optional().describe("updatedAt de la versión que se edita"),
      ficha: z.object({
        comunidad: z.string().max(200).optional(),
        tituloHabilitante: z.string().max(200).optional(),
        placa: z.string().max(200).optional(),
        chofer: z.string().max(200).optional(),
        transportista: z.string().max(200).optional(),
        destino: z.string().max(200).optional(),
        lugar: z.string().max(200).optional(),
        cubicadoPor: z.string().max(200).optional(),
        condicionPago: z.string().max(200).optional(),
        adelanto: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "El adelanto va en soles con punto decimal (ej. 1500.00)").optional().describe("S/"),
        fechaPago: dia.optional(),
        fechaEntrega: dia.optional(),
      }).optional(),
      piezas: z.array(z.object({
        cantidad: z.number().positive().max(99999),
        espesor: z.number().positive().max(999),
        ancho: z.number().positive().max(999),
        largo: z.number().positive().max(999),
        uEspesor: U.optional(),
        uAncho: U.optional(),
        uLargo: U.optional(),
        especie: z.string().max(60).optional(),
        dueno: z.string().max(120).optional(),
        precio: z.number().nonnegative().max(999999).optional().describe("S/ por PT de esta fila"),
        observacion: z.string().max(300).optional(),
      })).min(1).max(1000),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/admin/forestal/cubicaciones",
      cuerpo: limpiar({ id: a.id, nombre: a.nombre, fecha: a.fecha, cliente: a.cliente, especie: a.especie, notas: a.notas, precioPt: a.precioPt, gtfNumber: a.guia, ctpEntryId: a.ctpEntryId, updatedAt: a.actualizadoEn, ficha: a.ficha, piezas: a.piezas.map((p) => limpiar(p)) }),
    }),
    previa: async (a, leer) => {
      if (!a.id) return null;
      const r = await leer({ metodo: "GET", ruta: "/api/admin/forestal/cubicaciones" });
      return r.ok ? r.datos : null;
    },
    resumen: (a) => {
      const piezas = a.piezas.reduce((s, p) => s + p.cantidad, 0);
      const adel = a.ficha?.adelanto ? ` Adelanto de ${soles(Number(a.ficha.adelanto))}.` : "";
      const precio = a.precioPt ? ` a ${soles(a.precioPt)} por PT` : "";
      return `${a.id ? "Actualizar" : "Guardar"} la cubicación «${a.nombre}»${a.cliente ? ` de ${a.cliente}` : ""}: ${piezas} piezas${precio}.${adel} Toca el saldo de la cuenta del cliente.`;
    },
    ventana: (a) => ({
      clave: a.ficha?.adelanto ? claveMonto(Number(a.ficha.adelanto), { etiqueta: "Adelanto del viaje" }) : claveCantidad(a.piezas.reduce((s, p) => s + p.cantidad, 0), { etiqueta: "Piezas", unidad: "pzas" }),
      filas: [{ etiqueta: "Cubicación", valor: a.nombre }, ...(a.cliente ? [{ etiqueta: "Cliente (como lo escribiste)", valor: a.cliente }] : [])],
    }),
  },
  {
    nombre: "cubicacion_borrar",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Borra una cubicación de la tabla VIEJA (DELETE /api/admin/forestal/cubicaciones?id=; las de trozas van con cubicacion_trozas_borrar): si estaba cargada a la cuenta del cliente, se revierte. Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id de la cubicación: el nombre del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: "/api/admin/forestal/cubicaciones", query: { id: a.id } }),
    previa: async (a, leer) => {
      const filas = await filasCompletas(leer, "/api/admin/forestal/cubicaciones");
      const f = /** @type {any} */ (filas?.find((x) => x && String(x.id) === String(a.id)));
      return { nombre: f?.nombre, cliente: f?.cliente, otros: otrosNombres(filas, a.id, ["nombre"]) };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Borrar la cubicación «${verificado(p?.nombre)}»${p?.cliente ? ` de ${linea60(p.cliente)}` : ""}. Si estaba cargada a la cuenta del cliente, se revierte. No se puede deshacer.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.nombre ? claveNombre(p.nombre, p.otros, { etiqueta: "Cubicación", palabra: "nombre" }) : null, filas: p?.cliente ? [{ etiqueta: "Cliente", valor: p.cliente }] : [] };
    },
  },

  // ── Cubicaciones de trozas (tabla NUEVA, ADR-478/483/522): las que usan Blas y la bodega ──
  {
    nombre: "cubicaciones_trozas_ver",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Cubicaciones de trozas (GET /api/admin/forestal/cubicaciones-trozas): código, fecha, persona, compra/venta, trozas, volumen (PT o m³ según la fórmula), monto en S/ y estado (borrador, aplicada, anulada). Con id trae UNA con sus trozas, la versión y los adelantos abiertos. Filtros: estado, material, origen. Ej.: estado=borrador.",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Con id trae el detalle de esa cubicación"),
      estado: z.enum(["borrador", "aplicada", "anulada"]).optional().describe("Solo las que están en ese estado"),
      material: z.enum(["troza", "aserrada", "todas"]).optional().describe("Sin esto, solo trozas"),
      origen: z.enum(["libre", "ctp", "loth", "despacho"]).optional(),
      beneficiarioId: idRuta.optional().describe("Solo las de esa cuenta de adelantos"),
      parteId: idRuta.optional().describe("Solo las de esa parte del directorio"),
    },
    pedido: (a) => a.id
      ? { metodo: "GET", ruta: `/api/admin/forestal/cubicaciones-trozas/${a.id}` }
      : { metodo: "GET", ruta: "/api/admin/forestal/cubicaciones-trozas", query: limpiar({ estado: a.estado, material: a.material, origen: a.origen, beneficiario: a.beneficiarioId, parte: a.parteId }) },
    formatear: (d, a) => {
      if (a?.id) {
        const c = /** @type {any} */ (d)?.cubicacion;
        if (!c) return "Sin datos.";
        const unidad = c.unidad === "m³" ? "m³" : "PT";
        const cabecera = ficha({ ...c, fecha: String(c.fecha ?? "").slice(0, 10) }, { titulo: `Cubicación ${c.codigo ?? ""}`, campos: [["Persona", ["personaNombre"]], ["Fecha", ["fecha"]], ["Estado", ["estado"]], ["Sentido", ["sentido"]], ["Guía", ["gtfNumber"]], ["Versión", ["version"]], ["Monto S/", ["monto"], "s"], ["Placa", ["placa"]], ["Chofer", ["chofer"]]] });
        const esp = (c.porEspecie ?? []).map((l) => `- ${l.nombre}: ${l.n} trozas, ${numero(l.volumen, 2)} ${unidad}${l.precio != null ? ` a ${soles(l.precio)}` : ""}`).join("\n");
        const ad = (/** @type {any} */ (d)?.adelantosAbiertos ?? []).slice(0, 10).map((x) => `- adelanto ${x.codigoOperacion ?? x.id}: saldo ${soles(x.saldo)}`).join("\n");
        return [cabecera, `Volumen total: ${numero(c.volumen ?? 0, 2)} ${unidad} en ${c.nTrozas ?? (c.trozas ?? []).length} trozas`, esp, ad && `Adelantos abiertos:\n${ad}`].filter(Boolean).join("\n");
      }
      // La fecha viene como medianoche UTC: se muestra el día tal cual (con fechaLima salía el día anterior).
      const conDia = filasDe(d).map((c) => ({ ...c, fecha: String(c?.fecha ?? "").slice(0, 10) }));
      return lista(conDia, { titulo: "Cubicaciones de trozas", cols: [["Código", ["codigo"]], ["Fecha", ["fecha"]], ["Persona", ["personaNombre"]], ["Sentido", ["sentido"]], ["Trozas", ["nTrozas"], "n"], ["Volumen", ["volumen"], "n"], ["Unidad", ["unidad"]], ["Monto", ["monto"], "s"], ["Estado", ["estado"]], ["Guía", ["gtfNumber"]], ["Id", ["id"]]] });
    },
  },
  {
    nombre: "cubicacion_trozas_guardar",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Guarda una cubicación de trozas en BORRADOR (POST /api/admin/forestal/cubicaciones-trozas): el servidor calcula el volumen con la fórmula (smalian: Ø en cm y largo en m → m³; oxapampina: Ø en pulgadas y largo en pies → PT). No mueve plata: el saldo se toca recién al aplicarla (cubicacion_trozas_aplicar). Obligatorio: fecha, fórmula, 1 o 2 diámetros, trozas, y la persona (beneficiarioId o parteId). compra = el proveedor trae madera; venta = el negocio entrega. Ej.: formula=smalian, diametros=1, trozas=[{especie:\"Cedro\", d1:45, largo:4}].",
    entrada: {
      negocio,
      fecha: dia.describe("AAAA-MM-DD, no puede ser de mañana"),
      formula: z.enum(["smalian", "oxapampina"]),
      diametros: z.union([z.literal(1), z.literal(2)]).describe("1 = troza pareja (d1); 2 = punta gruesa y fina (d1, d2)"),
      beneficiarioId: idRuta.optional().describe("Cuenta de adelantos de la persona (uno de beneficiarioId o parteId)"),
      parteId: idRuta.optional().describe("Parte del directorio (uno de beneficiarioId o parteId)"),
      sentido: z.enum(["compra", "venta"]).default("compra"),
      gtfNumber: z.string().max(80).optional().describe("N.º de la guía"),
      contratoId: idRuta.optional().describe("Permiso del que sale"),
      trozas: z.array(z.object({
        codigo: z.string().max(40).optional().describe("Código de la troza"),
        especie: z.string().min(1).max(80).describe("Especie, ej. Cedro"),
        d1: z.number().positive().max(400).describe("Diámetro en cm (smalian) o pulgadas (oxapampina)"),
        d2: z.number().positive().max(400).optional().describe("Segundo diámetro, solo con diametros=2"),
        largo: z.number().positive().max(100).describe("Largo en m (smalian) o pies (oxapampina)"),
        descuento: z.object({
          hueco: z.number().positive().max(400).optional().describe("Hueco en cm"),
          menosLargo: z.number().positive().max(100).optional().describe("Largo que no sirve"),
          pct: z.number().min(0).max(100).optional().describe("Castigo en %"),
        }).optional(),
      })).min(1).max(2000),
      notas: z.string().max(500).optional(),
      placa: z.string().max(20).optional().describe("Ej. W2D-853"),
      chofer: z.string().max(120).optional(),
      origen: z.enum(["libre", "ctp", "loth"]).optional().describe("De dónde salen las trozas; loth exige origenId"),
      origenId: z.string().max(40).optional().describe("Guía del Libro TH, con origen=loth"),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/admin/forestal/cubicaciones-trozas",
      cuerpo: limpiar({
        fecha: a.fecha, formula: a.formula, diametros: a.diametros, beneficiarioId: a.beneficiarioId, parteId: a.parteId, sentido: a.sentido ?? "compra",
        gtfNumber: a.gtfNumber, contratoId: a.contratoId, notas: a.notas, placa: a.placa, chofer: a.chofer, origen: a.origen, origenId: a.origenId,
        trozas: a.trozas.map((t) => limpiar({ codigo: t.codigo, especie: t.especie, d1: t.d1, d2: t.d2, largo: t.largo, descuento: t.descuento ? limpiar(t.descuento) : undefined })),
      }),
    }),
    formatear: (d) => {
      const c = /** @type {any} */ (d)?.cubicacion;
      return c ? `Cubicación ${c.codigo ?? c.id} guardada en borrador: ${numero(c.volumen ?? 0, 2)} ${c.unidad ?? ""} en ${c.nTrozas ?? "?"} trozas (id ${c.id}, versión ${c.version}).` : "Guardada.";
    },
  },
  {
    nombre: "cubicacion_trozas_editar",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "escritura",
    descripcion: "Corrige una cubicación de trozas en BORRADOR (PATCH /api/admin/forestal/cubicaciones-trozas/[id]): se manda ENTERA otra vez (el servidor re-cubica) con la versión que leíste en cubicaciones_trozas_ver; si ya es otra, da 409. No sirve en una aplicada o anulada. No mueve plata.",
    entrada: {
      negocio,
      id: idRuta,
      version: z.number().int().positive().describe("version que devolvió cubicaciones_trozas_ver"),
      fecha: dia,
      formula: z.enum(["smalian", "oxapampina"]),
      diametros: z.union([z.literal(1), z.literal(2)]),
      beneficiarioId: idRuta.optional(),
      parteId: idRuta.optional(),
      sentido: z.enum(["compra", "venta"]).default("compra"),
      gtfNumber: z.string().max(80).optional(),
      contratoId: idRuta.optional(),
      trozas: z.array(z.object({
        codigo: z.string().max(40).optional(),
        especie: z.string().min(1).max(80),
        d1: z.number().positive().max(400),
        d2: z.number().positive().max(400).optional(),
        largo: z.number().positive().max(100),
      })).min(1).max(2000),
      notas: z.string().max(500).optional(),
      placa: z.string().max(20).optional(),
      chofer: z.string().max(120).optional(),
    },
    pedido: (a) => ({
      metodo: "PATCH",
      ruta: `/api/admin/forestal/cubicaciones-trozas/${a.id}`,
      cuerpo: limpiar({
        version: a.version, fecha: a.fecha, formula: a.formula, diametros: a.diametros, beneficiarioId: a.beneficiarioId, parteId: a.parteId, sentido: a.sentido ?? "compra",
        gtfNumber: a.gtfNumber, contratoId: a.contratoId, notas: a.notas, placa: a.placa, chofer: a.chofer,
        trozas: a.trozas.map((t) => limpiar(t)),
      }),
    }),
  },
  {
    nombre: "cubicacion_trozas_aplicar",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Aplica una cubicación de trozas (POST /api/admin/forestal/cubicaciones-trozas/[id]/aplicar): la valoriza con los precios por especie (S/ por PT o m³) y MUEVE PLATA: descuenta de los adelantos abiertos de la persona y el resto va a su cuenta (compra: le debes; venta: te debe). Solo admin/dueño. El monto lo calcula el panel con los precios que das (no se escribe a mano). Pide OK de Brandon. Ej.: precios=[{clave:\"cedro\", precio:4.5}] o precioGeneral=4.5.",
    entrada: {
      negocio,
      id: idRuta.describe("Id de la cubicación en borrador: el código y la persona los saca el panel"),
      precios: z.array(z.object({ clave: z.string().min(1).max(80).describe("Especie, ej. cedro"), precio: z.number().positive().max(100000).describe("S/ por PT o m³") })).max(60).default([]).describe("Precio de cada especie"),
      precioGeneral: z.number().positive().max(100000).optional().describe("S/ para las especies sin precio propio"),
      especiesConVariosPrecios: z.array(z.object({ clave: z.string().min(1).max(80).describe("Especie, ej. cedro"), cuantos: z.number().int().min(2).max(999).describe("Cuántos precios distintos tiene en el lote") })).max(60).optional().describe("Especies con más de un precio en el lote: el precio general NO las cubre, cada una necesita el suyo en precios (igual que la pantalla)"),
    },
    pedido: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const monto = montoDe(p, a);
      return {
        metodo: "POST",
        ruta: `/api/admin/forestal/cubicaciones-trozas/${a.id}/aplicar`,
        // montoVisto SALE DEL PANEL (volumen real × tus precios): sin él se manda 0.01 y el servidor responde 409 sin tocar nada.
        cuerpo: limpiar({ precios: a.precios ?? [], precioGeneral: generalSeguro(p, a), especiesConVariosPrecios: a.especiesConVariosPrecios?.length ? a.especiesConVariosPrecios : undefined, montoVisto: monto ?? 0.01, version: Number(p?.version) || 1, idempotencyKey: `mcp-aplicar-${a.id}-${Number(p?.version) || 1}` }),
      };
    },
    previa: previaCubicacion,
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const monto = montoDe(p, a);
      return `Aplicar la cubicación ${verificado(p?.codigo)} de ${verificado(p?.personaNombre)} (${p?.sentido === "venta" ? "venta" : "compra"}, ${p?.volumen != null ? `${numero(Number(p.volumen), 2)} ${p?.unidad ?? ""}` : "volumen NO VERIFICADO"}): ${monto != null ? soles(monto) : "monto NO VERIFICADO"}${desgloseTexto(p, a)}. Descuenta de sus adelantos abiertos y el resto va a su cuenta. Estado hoy: ${p?.estado ?? NO_VERIFICADO}.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const monto = montoDe(p, a);
      return { clave: monto != null ? claveMonto(monto, { etiqueta: "Monto a cargar a la cuenta" }) : null, filas: [{ etiqueta: "Cubicación", valor: verificado(p?.codigo) }, { etiqueta: "Persona", valor: verificado(p?.personaNombre) }, ...desgloseFilas(p, a)] };
    },
  },
  {
    nombre: "cubicacion_trozas_anular",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Anula una cubicación de trozas ya aplicada (POST /api/admin/forestal/cubicaciones-trozas/[id]/anular): da de baja sus entregas y devuelve los saldos de adelantos y de la cuenta de la persona. Solo admin/dueño. Pide OK de Brandon. Ej.: motivo=\"Se cubicó con la fórmula equivocada\".",
    entrada: { negocio, id: idRuta.describe("Id de la cubicación: código, persona y monto los saca el panel"), motivo: z.string().min(3).max(300) },
    pedido: (a) => ({ metodo: "POST", ruta: `/api/admin/forestal/cubicaciones-trozas/${a.id}/anular`, cuerpo: { motivo: a.motivo } }),
    previa: previaCubicacion,
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Anular la cubicación ${verificado(p?.codigo)} de ${verificado(p?.personaNombre)}: ${p?.monto != null ? soles(Number(p.monto)) : `monto NO VERIFICADO`} vuelven a sus saldos. Estado hoy: ${p?.estado ?? NO_VERIFICADO}. Motivo: ${linea60(a.motivo, 120)}.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      const m = Number(p?.monto);
      return { clave: Number.isFinite(m) && m > 0 ? claveMonto(m, { etiqueta: "Monto que se revierte" }) : null, filas: [{ etiqueta: "Cubicación", valor: verificado(p?.codigo) }, { etiqueta: "Persona", valor: verificado(p?.personaNombre) }, { etiqueta: "Estado hoy", valor: p?.estado ?? NO_VERIFICADO }] };
    },
  },
  {
    nombre: "cubicacion_trozas_borrar",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Borra una cubicación de trozas en BORRADOR (DELETE /api/admin/forestal/cubicaciones-trozas/[id]): una aplicada no se borra (primero se anula). Solo admin/dueño. No se puede deshacer. Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id de la cubicación: el código y la persona los saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/admin/forestal/cubicaciones-trozas/${a.id}` }),
    previa: async (a, leer) => {
      const p = await previaCubicacion(a, leer);
      const filas = await filasCompletas(leer, "/api/admin/forestal/cubicaciones-trozas", { estado: "borrador" });
      return p ? { ...p, otros: otrosNombres(filas, a.id, ["codigo"]) } : null;
    },
    resumen: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Borrar la cubicación ${verificado(p?.codigo)} de ${verificado(p?.personaNombre)} (${p?.volumen != null ? `${numero(Number(p.volumen), 2)} ${p?.unidad ?? ""}` : NO_VERIFICADO}, estado ${p?.estado ?? NO_VERIFICADO}). No se puede deshacer.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.codigo ? claveNombre(p.codigo, p.otros, { etiqueta: "Cubicación", palabra: "código" }) : null, filas: [{ etiqueta: "Persona", valor: verificado(p?.personaNombre) }, { etiqueta: "Estado hoy", valor: p?.estado ?? NO_VERIFICADO }] };
    },
  },
];

/** La cubicación de trozas como la ve el panel (GET [id]); null si no se pudo leer. */
async function previaCubicacion(a, leer) {
  const r = await leerSeguro(leer, `/api/admin/forestal/cubicaciones-trozas/${a.id}`);
  const c = /** @type {any} */ (r.datos)?.cubicacion;
  return r.ok && c && typeof c === "object" ? c : null;
}

const claveEsp = (s) => String(s ?? "").replace(/\([^)]*\)/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Volumen por especie que muestra el PANEL: `porEspecie` (aplicadas) o las trozas congeladas (borrador, donde porEspecie es null). */
function lineasDe(p) {
  if (Array.isArray(p?.porEspecie) && p.porEspecie.length) return p.porEspecie.map((l) => ({ clave: claveEsp(l.clave ?? l.nombre), volumen: Number(l.volumen) }));
  if (!Array.isArray(p?.trozas) || !p.trozas.length) return null;
  /** @type {Map<string, number>} */ const m = new Map();
  for (const t of p.trozas) m.set(claveEsp(t.especie), (m.get(claveEsp(t.especie)) ?? 0) + Number(t.volumen));
  return [...m].map(([clave, volumen]) => ({ clave, volumen }));
}

/**
 * Monto = suma por especie de volumen del PANEL × precio (propio o general), en céntimos como el servidor.
 * null si falta un precio o si hay descuentos del lote (el servidor los aplica al aplicar y el monto cambiaría).
 */
function montoDe(p, a) {
  const lineas = lineasDe(p);
  if (!lineas || p?.descuentos) return null;
  const propio = new Map((a.precios ?? []).map((x) => [claveEsp(x.clave), x.precio]));
  const marcadas = new Set((a.especiesConVariosPrecios ?? []).map((m) => claveEsp(m.clave)));
  let cent = 0;
  for (const l of lineas) {
    if (!(l.volumen > 0)) continue;
    const precio = propio.get(l.clave) ?? (marcadas.has(l.clave) ? undefined : a.precioGeneral);
    if (!(precio > 0)) return null;
    cent += Math.round(Number((l.volumen * precio * 100).toFixed(6)));
  }
  return cent > 0 ? cent / 100 : null;
}

/** Precio general solo si no cubriría una especie marcada con varios precios (como `preciosParaAplicar` de la pantalla). */
function generalSeguro(p, a) {
  const marcadas = new Set((a.especiesConVariosPrecios ?? []).map((m) => claveEsp(m.clave)));
  if (!marcadas.size) return a.precioGeneral;
  const propio = new Set((a.precios ?? []).filter((x) => x.precio > 0).map((x) => claveEsp(x.clave)));
  const cubre = (lineasDe(p) ?? []).some((l) => l.volumen > 0 && !propio.has(l.clave) && marcadas.has(l.clave));
  return cubre ? undefined : a.precioGeneral;
}

/** Especie × volumen × precio con los volúmenes del PANEL; precio faltante = «precio NO VERIFICADO». */
function desgloseDe(p, a) {
  const propio = new Map((a.precios ?? []).map((x) => [claveEsp(x.clave), x.precio]));
  const marcadas = new Set((a.especiesConVariosPrecios ?? []).map((m) => claveEsp(m.clave)));
  return (lineasDe(p) ?? []).filter((l) => l.volumen > 0).map((l) => {
    const precio = propio.get(l.clave) ?? (marcadas.has(l.clave) ? undefined : a.precioGeneral);
    return `${l.clave} ${numero(l.volumen, 2)} × ${precio > 0 ? soles(precio) : "precio NO VERIFICADO"}`;
  });
}
const desgloseTexto = (p, a) => { const d = desgloseDe(p, a); return d.length ? ` [${d.join("; ")}]` : " [desglose NO VERIFICADO]"; };
/** Máx. 2 filas de desglose para la ventana (4 en total); el resto queda en el resumen. */
function desgloseFilas(p, a) {
  const d = desgloseDe(p, a);
  if (!d.length) return [{ etiqueta: "Desglose", valor: "NO VERIFICADO" }];
  if (d.length <= 2) return d.map((v) => ({ etiqueta: "Especie", valor: linea60(v, 60) }));
  return [{ etiqueta: "Especie", valor: linea60(d[0], 60) }, { etiqueta: "Otras", valor: `+${d.length - 1} más, ver el resumen` }];
}
