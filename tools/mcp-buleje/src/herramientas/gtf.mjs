// Grupo «gtf»: guías de transporte forestal y Anexo 04 (negocio forestal).
import { z, negocio, idRuta, dia, limpiar, lista, ficha, madera, pick, claveCantidad, claveNombre, leerSeguro, filasCompletas, otrosNombres, verificado, linea60, numero, NO_VERIFICADO } from "../util-herramientas.mjs";

const COL_MADERA = { pt: ["pt", "pies", "ptTotal"], m3: ["volumeM3", "m3", "volumenM3", "totalM3"], piezas: ["pieces", "piezas", "totalPiezas"] };

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "gtf_ver",
    grupo: "gtf",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Guías de transporte forestal (GET /api/admin/forestal/gtf). vista=lista (filtra por titular, permiso o dadas de baja), sin_ingresar, ficha y volumen (por guia), resumen_interno (id) o serfor (numeroRegistro). Madera en PT, m³ y piezas.",
    entrada: {
      negocio,
      vista: z.enum(["lista", "sin_ingresar", "ficha", "volumen", "bajas", "resumen_interno", "serfor"]).default("lista"),
      guia: z.string().max(60).optional().describe("N.º de guía, para ficha/volumen"),
      id: idRuta.optional().describe("Para resumen_interno o una guía por id"),
      titular: z.string().max(200).optional(),
      permiso: z.string().max(120).optional(),
      numeroRegistro: z.string().max(30).optional().describe("Para vista=serfor"),
    },
    pedido: (a) => {
      const v = a.vista ?? "lista";
      if (v === "resumen_interno") return { metodo: "GET", ruta: "/api/admin/forestal/gtf/resumen-interno", query: limpiar({ id: a.id }) };
      if (v === "serfor") return { metodo: "GET", ruta: "/api/admin/forestal/gtf/serfor", query: limpiar({ numeroRegistro: a.numeroRegistro }) };
      if (v === "sin_ingresar") return { metodo: "GET", ruta: "/api/admin/forestal/gtf", query: { sinIngresar: "1" } };
      if (v === "bajas") return { metodo: "GET", ruta: "/api/admin/forestal/gtf", query: { estado: "bajas" } };
      if (v === "ficha") return { metodo: "GET", ruta: "/api/admin/forestal/gtf", query: limpiar({ gtfNumber: a.guia, ficha: "1" }) };
      if (v === "volumen") return { metodo: "GET", ruta: "/api/admin/forestal/gtf", query: limpiar({ gtfNumber: a.guia, volumen: "1" }) };
      return { metodo: "GET", ruta: "/api/admin/forestal/gtf", query: limpiar({ id: a.id, titular: a.titular, permiso: a.permiso }) };
    },
    formatear: (d, a) => (a?.vista === "lista" || a?.vista === "sin_ingresar" || a?.vista === "bajas" || !a?.vista)
      ? lista(d, { titulo: "Guías (GTF)", cols: [["Guía", ["gtfNumber", "numero"]], ["Fecha", ["gtfDate", "fecha"], "f"], ["Titular", ["titularName", "titular"]], ["Destino", ["destino"]], ["Estado", ["status", "estado"]]], colMadera: COL_MADERA })
      : (d && typeof d === "object" ? `${madera({ pt: pick(d, COL_MADERA.pt), m3: pick(d, COL_MADERA.m3), piezas: pick(d, COL_MADERA.piezas) })}\n${JSON.stringify(d, null, 1).slice(0, 3000)}` : "Sin datos."),
  },
  {
    nombre: "anexos_ver",
    grupo: "gtf",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Anexo 04 (GET /api/admin/forestal/anexos): lista, o uno solo con id.",
    entrada: { negocio, id: idRuta.optional() },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/forestal/anexos", query: limpiar({ id: a.id }) }),
    formatear: (d) => lista(d, { titulo: "Anexos 04", cols: [["N.º", ["numero", "number", "id"]], ["Fecha", ["fecha", "createdAt"], "f"], ["Destino", ["destino"]], ["Estado", ["status", "estado"]]], colMadera: COL_MADERA }),
  },
  {
    nombre: "gtf_anular",
    grupo: "gtf",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Anula una guía de transporte forestal (PATCH /api/admin/forestal/gtf, action=annul): la madera que movía vuelve a su saldo. Solo admin/owner. Pide OK de Brandon.",
    entrada: { negocio, id: z.string().min(1).max(60).describe("Id de la guía: el N.º del aviso lo saca el panel"), motivo: z.string().min(3).max(500) },
    pedido: (a) => ({ metodo: "PATCH", ruta: "/api/admin/forestal/gtf", cuerpo: { id: a.id, action: "annul", reason: a.motivo } }),
    // GET ?id= responde { guia }: el N.º y el volumen salen de ahí (antes se leía p.gtfNumber del envoltorio y siempre faltaba).
    previa: async (a, leer) => {
      const r = await leerSeguro(leer, "/api/admin/forestal/gtf", { id: a.id });
      const d = /** @type {any} */ (r.datos);
      return r.ok && d && typeof d === "object" ? (d.guia && typeof d.guia === "object" ? d.guia : d) : null;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const vol = p && typeof p === "object" ? madera({ pt: pick(p, COL_MADERA.pt), m3: pick(p, COL_MADERA.m3), piezas: pick(p, COL_MADERA.piezas) }) : "—";
      return `Anular la guía ${p?.gtfNumber ? linea60(p.gtfNumber, 40) : `${NO_VERIFICADO} (guía)`}${vol !== "—" ? ` (${vol})` : ""}. Motivo: ${a.motivo}.`;
    },
    ventana: (_a, previa) => {
      const p = /** @type {any} */ (previa);
      const pt = Number(pick(p, COL_MADERA.pt));
      return {
        clave: Number.isFinite(pt) && pt > 0 ? claveCantidad(pt, { etiqueta: "Madera que vuelve al saldo", unidad: "PT" }) : null,
        filas: [{ etiqueta: "Guía N.º", valor: p?.gtfNumber ? String(p.gtfNumber) : NO_VERIFICADO }],
      };
    },
  },
  {
    nombre: "anexo04_emitir",
    grupo: "gtf",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Emite (o corrige con id) un Anexo 04 oficial (POST /api/admin/forestal/anexos): documento legal de SERFOR con N.º, guía, firmante y piezas (cantidad, espesor, ancho, largo en pulgadas y pies por omisión). El servidor recalcula PT y m³ de las medidas; con ctpEntryId descuenta del asiento del Libro CTP. Pide OK de Brandon. Ej.: numero=\"0012\", gtf=\"001-0456\", piezas=[{cantidad:10, espesor:2, ancho:8, largo:10, especie:\"Cedro\"}].",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Con id corrige un anexo ya emitido; sin id emite uno nuevo"),
      numero: z.string().max(60).describe("N.º del Anexo 04"),
      gtf: z.string().max(60).describe("N.º de la guía de transporte"),
      fecha: dia.optional(),
      empresa: z.string().max(160).optional(),
      firmante: z.string().max(120).optional(),
      documento: z.string().max(30).optional().describe("DNI/RUC del firmante"),
      cargo: z.string().max(120).optional(),
      observaciones: z.string().max(600).optional(),
      unidadV: z.enum(["pt", "m3"]).default("pt").describe("Unidad del volumen: pt o m3"),
      modo: z.enum(["oficial", "compacto"]).default("oficial"),
      especieGlobal: z.string().max(60).optional().describe("Una especie para todo el anexo"),
      ctpEntryId: z.string().max(60).optional().describe("Asiento del Libro CTP del que sale; el panel dice cuál es y cuánto tiene"),
      permiso: z.string().max(120).optional().describe("Código del permiso del que salió"),
      totalManualM3: z.number().nonnegative().max(999999).optional().describe("Total en m³ escrito a mano en el papel (no reemplaza al calculado)"),
      piezas: z.array(z.object({
        cantidad: z.number().int().positive().max(99999),
        espesor: z.number().positive().max(999),
        ancho: z.number().positive().max(999),
        largo: z.number().positive().max(999),
        uEspesor: z.enum(["pulg", "cm", "pies", "m"]).optional(),
        uAncho: z.enum(["pulg", "cm", "pies", "m"]).optional(),
        uLargo: z.enum(["pulg", "cm", "pies", "m"]).optional(),
        especie: z.string().max(60).optional(),
      })).min(1).max(1000),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/admin/forestal/anexos",
      cuerpo: limpiar({
        id: a.id, numero: a.numero, gtf: a.gtf, fecha: a.fecha, empresa: a.empresa, firmante: a.firmante, documento: a.documento, cargo: a.cargo, observaciones: a.observaciones,
        unidadV: a.unidadV ?? "pt", modo: a.modo ?? "oficial", especieGlobal: a.especieGlobal, ctpEntryId: a.ctpEntryId, permiso: a.permiso, totalManualM3: a.totalManualM3,
        piezas: a.piezas.map((x) => limpiar(x)),
      }),
    }),
    // El volumen que cuenta es el del asiento del Libro CTP que el anexo descuenta (lo lee el panel), no lo que escribió el modelo.
    previa: async (a, leer) => {
      if (!a.ctpEntryId) return null;
      const r = await leerSeguro(leer, "/api/admin/forestal/ctp", { entryId: a.ctpEntryId });
      const e = /** @type {any} */ (r.datos)?.entry;
      return r.ok && e && typeof e === "object" ? e : null;
    },
    resumen: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const piezas = a.piezas.reduce((s, x) => s + x.cantidad, 0);
      const asiento = a.ctpEntryId ? (e ? ` Sale del asiento CTP de ${linea60(e.speciesCommon ?? "?", 40)} (${numero(Number(e.quantity ?? 0), 2)} ${linea60(e.unit ?? "", 6)}).` : ` Asiento CTP ${NO_VERIFICADO}.`) : " Sin asiento CTP.";
      return `${a.id ? "Corregir" : "Emitir"} el Anexo 04 N.º ${linea60(a.numero, 30)} de la guía ${linea60(a.gtf, 30)}: ${piezas} piezas (${a.piezas.length} filas), firma ${linea60(a.firmante || "(sin firmante)", 40)}.${asiento} Documento oficial: el panel recalcula PT y m³ de las medidas.`;
    },
    ventana: (a, previa) => {
      const e = /** @type {any} */ (previa);
      const q = Number(e?.quantity);
      const u = String(e?.unit ?? "").toLowerCase();
      return {
        clave: e && Number.isFinite(q) && q > 0 ? claveCantidad(q, { etiqueta: `Existencia del asiento CTP (${u || "?"})`, unidad: u === "m3" ? "m³" : u.toUpperCase() }) : null,
        filas: [{ etiqueta: "Anexo N.º (como lo escribiste)", valor: a.numero }, { etiqueta: "Guía (como la escribiste)", valor: a.gtf }, { etiqueta: "Asiento CTP", valor: e ? `${e.section ?? "?"} · ${e.speciesCommon ?? "?"}` : a.ctpEntryId ? NO_VERIFICADO : "ninguno" }],
      };
    },
  },
  {
    nombre: "gtf_crear",
    grupo: "gtf",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Registra una guía de transporte forestal (POST /api/admin/forestal/gtf) en el Libro TH: N.º de guía, transportista, conductor, placa y las líneas de madera (especie, volumen en m³, piezas). Solo admin/dueño. Con planId el panel controla que las especies estén en el permiso. Pide OK de Brandon. Ej.: gtfNumber=\"001-0456\", placaVehiculo=\"W2D-853\", items=[{species:\"Cedro\", volumeM3:12.5, pieces:20}].",
    entrada: {
      negocio,
      gtfNumber: z.string().min(1).max(60).describe("N.º de la guía"),
      gtfDate: dia.optional().describe("Fecha de la guía"),
      tipo: z.enum(["trozas", "producto"]).optional(),
      planId: idRuta.optional().describe("Permiso/plan del que sale (el panel dice cuál es)"),
      titularName: z.string().max(200).optional().describe("Titular del permiso"),
      tituloHabilitante: z.string().max(120).optional(),
      parcelaCorta: z.string().max(120).optional(),
      transportista: z.string().min(1).max(200),
      transportistaDoc: z.string().max(20).optional().describe("RUC del transportista"),
      conductor: z.string().min(1).max(200),
      conductorLicencia: z.string().max(40).optional(),
      placaVehiculo: z.string().min(1).max(20).describe("Ej. W2D-853"),
      origen: z.string().max(200).optional(),
      destino: z.string().max(200).optional(),
      observations: z.string().max(1000).optional(),
      items: z.array(z.object({
        code: z.string().max(60).optional().describe("Código único de la troza/pieza"),
        codigoGuia: z.string().max(60).optional().describe("Código impreso en la guía si difiere"),
        species: z.string().max(120).optional().describe("Especie, ej. Cedro"),
        diamMayorM: z.number().nonnegative().optional().describe("m"),
        diamMenorM: z.number().nonnegative().optional().describe("m"),
        lengthM: z.number().nonnegative().optional().describe("m"),
        volumeM3: z.number().nonnegative().optional().describe("m³"),
        productType: z.string().max(80).optional(),
        pieces: z.number().int().nonnegative().optional(),
        quantity: z.number().nonnegative().optional(),
        unit: z.string().max(10).optional(),
      })).min(1).max(500),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/admin/forestal/gtf",
      cuerpo: limpiar({
        gtfNumber: a.gtfNumber, gtfDate: a.gtfDate, tipo: a.tipo, planId: a.planId, titularName: a.titularName, tituloHabilitante: a.tituloHabilitante, parcelaCorta: a.parcelaCorta,
        transportista: a.transportista, transportistaDoc: a.transportistaDoc, conductor: a.conductor, conductorLicencia: a.conductorLicencia, placaVehiculo: a.placaVehiculo,
        origen: a.origen, destino: a.destino, observations: a.observations, items: a.items.map((x) => limpiar(x)),
      }),
    }),
    // El permiso lo nombra el panel (GET plan?planId=), no el modelo; y se avisa si el N.º ya está registrado.
    previa: async (a, leer) => {
      const plan = a.planId ? await leerSeguro(leer, "/api/admin/forestal/plan", { planId: a.planId }) : { ok: false, datos: undefined };
      const planes = a.planId ? await filasCompletas(leer, "/api/admin/forestal/plan") : null;
      const dup = await leerSeguro(leer, "/api/admin/forestal/gtf", { gtfNumber: a.gtfNumber, ficha: "1" });
      const p = /** @type {any} */ (plan.datos)?.plan;
      const nombre = p ? pick(p, ["planNumber", "titularName", "name", "nombre"]) : undefined;
      const nombres = (planes ?? []).map((x) => pick(x, ["planNumber", "titularName", "name", "nombre"])).filter((n) => n && n !== nombre);
      const d = /** @type {any} */ (dup.datos);
      return { plan: nombre, otros: nombres.slice(0, 40), yaRegistrada: Boolean(dup.ok && d && typeof d === "object" && (d.gtfNumber || d.id || d.guia)) };
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const m3 = a.items.reduce((s, x) => s + (x.volumeM3 ?? 0), 0);
      return `Registrar la guía ${linea60(a.gtfNumber, 30)}${a.planId ? ` del permiso ${p?.plan ? linea60(p.plan, 60) : NO_VERIFICADO}` : " (sin permiso)"}: ${a.items.length} líneas, ${numero(m3, 2)} m³ (suma de lo que escribiste). Transporta ${linea60(a.transportista, 40)}, conductor ${linea60(a.conductor, 40)}, placa ${linea60(a.placaVehiculo, 12)}.${p?.yaRegistrada ? " OJO: el panel ya tiene una guía con ese N.º." : ""}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.plan ? claveNombre(p.plan, p.otros, { etiqueta: "Permiso", palabra: "nombre" }) : null,
        filas: [{ etiqueta: "Guía N.º (como la escribiste)", valor: a.gtfNumber }, { etiqueta: "Placa", valor: a.placaVehiculo }, { etiqueta: "Transportista", valor: a.transportista }, { etiqueta: "¿Ya existe ese N.º?", valor: p?.yaRegistrada ? "SÍ, el panel ya lo tiene" : "no" }],
      };
    },
  },
];
