// Grupo «gtf»: guías de transporte forestal y Anexo 04 (negocio forestal).
import { z, negocio, idRuta, limpiar, lista, ficha, madera, pick, claveCantidad, leerSeguro, linea60, NO_VERIFICADO } from "../util-herramientas.mjs";

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
];
