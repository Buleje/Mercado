// Grupo «cubicacion»: cubicaciones de madera (Herramientas forestales). Guardar toca el saldo de la cuenta (plata).
import { z, negocio, idRuta, dia, limpiar, lista, soles, madera, pick, claveCantidad, claveMonto, claveNombre, filasCompletas, otrosNombres, linea60, verificado } from "../util-herramientas.mjs";

const COL_MADERA = { pt: ["pt", "totalPt", "pies"], m3: ["m3", "totalM3"], piezas: ["piezas", "totalPiezas"] };
const U = z.enum(["pulg", "cm", "pies", "m"]);

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "cubicaciones_ver",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "lectura",
    descripcion: "Cubicaciones guardadas (GET /api/admin/forestal/cubicaciones): nombre, cliente, especie, PT, m³ y piezas, precio por PT en S/. Con despachoId trae las de un despacho; enLibro=true solo las ya pasadas al libro.",
    entrada: { negocio, despachoId: z.string().max(60).optional(), enLibro: z.boolean().optional() },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/admin/forestal/cubicaciones", query: limpiar({ despachoId: a.despachoId, enLibro: a.enLibro ? "1" : undefined }) }),
    formatear: (d) => lista(d, { titulo: "Cubicaciones", cols: [["Nombre", ["nombre"]], ["Fecha", ["fecha"], "f"], ["Cliente", ["cliente"]], ["Especie", ["especie"]], ["Precio PT", ["precioPt"], "s"], ["GTF", ["gtfNumber"]]], colMadera: COL_MADERA }),
  },
  {
    nombre: "cubicacion_guardar",
    grupo: "cubicacion",
    soloEn: ["forestal"],
    tipo: "confirmar",
    descripcion: "Guarda una cubicación (POST /api/admin/forestal/cubicaciones): piezas con espesor, ancho y largo, precio por PT en S/ y datos del viaje (adelanto en S/). Con id edita una existente. Desde ADR-522 el guardado toca el saldo de la cuenta del cliente: pide OK de Brandon.",
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
    descripcion: "Borra una cubicación (DELETE /api/admin/forestal/cubicaciones?id=): si estaba cargada a la cuenta del cliente, se revierte. Pide OK de Brandon.",
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
];
