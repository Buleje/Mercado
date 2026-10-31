// Grupo «hoy»: resúmenes del día y búsqueda (solo lectura).
import { z, negocio, dia, limpiar, ficha, lista } from "../util-herramientas.mjs";

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "hoy_resumen",
    grupo: "hoy",
    tipo: "lectura",
    descripcion: "Resumen de hoy de la bodega: ventas del día en S/, pedidos, caja y alertas (GET /api/admin/today-summary). Para Blas usa hoy_forestal.",
    entrada: { negocio },
    pedido: () => ({ metodo: "GET", ruta: "/api/admin/today-summary" }),
    // Forma real (29-10): {ventas:{total,ventasMostrador,ventasOnline,cantidadVentas,cambioVsAyer}, pedidos:{hoy,pendientes}, alertas:{stockBajo,sinStock,porVencer,totalAlertas}, topProducto}
    formatear: (d) => {
      const v = d?.ventas ?? {}, p = d?.pedidos ?? {}, al = d?.alertas ?? {};
      return ficha({ ...v, pedidosHoy: p.hoy, pedidosPendientes: p.pendientes, stockBajo: al.stockBajo, sinStock: al.sinStock, porVencer: al.porVencer, top: d?.topProducto?.name ?? d?.topProducto?.nombre },
        { titulo: "Hoy en la bodega", campos: [["Ventas", ["total"], "s"], ["Mostrador", ["ventasMostrador"], "s"], ["En línea", ["ventasOnline"], "s"], ["N.º de ventas", ["cantidadVentas"], "n"], ["% vs ayer", ["cambioVsAyer"], "n"],
          ["Pedidos de hoy", ["pedidosHoy"], "n"], ["Pedidos pendientes", ["pedidosPendientes"], "n"], ["Stock bajo", ["stockBajo"], "n"], ["Sin stock", ["sinStock"], "n"], ["Por vencer", ["porVencer"], "n"], ["Lo más vendido", ["top"]]] });
    },
  },
  {
    nombre: "hoy_forestal",
    grupo: "hoy",
    tipo: "lectura",
    soloEn: ["forestal"],
    descripcion: "Inicio del negocio forestal (Blas): saldos de madera (PT, m³ y piezas), guías y pendientes del día (GET /api/admin/inicio/forestal). desde/hasta AAAA-MM-DD (por defecto hoy, hora de Lima).",
    entrada: { negocio, desde: dia.optional(), hasta: dia.optional() },
    // La ruta exige from/to (instantes ISO, como el selector del Inicio): el día entero en hora de Lima (UTC-5).
    pedido: (a) => {
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
      const desde = a.desde ?? hoy, hasta = a.hasta ?? desde;
      return { metodo: "GET", ruta: "/api/admin/inicio/forestal", query: {
        from: new Date(`${desde}T00:00:00-05:00`).toISOString(),
        to: new Date(`${hasta}T23:59:59.999-05:00`).toISOString(),
        adelantos: "1",
      } };
    },
    formatear: (d) => (d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3000) : "Sin datos."),
  },
  {
    nombre: "tablero",
    grupo: "hoy",
    tipo: "lectura",
    descripcion: "Tableros de ventas. vista=dashboard (resumen general), overview (por período: diario|semanal|mensual|anual|personalizado con desde/hasta) o ventas (3 canales; rango hoy|7d|30d). Montos en S/.",
    entrada: {
      negocio,
      vista: z.enum(["dashboard", "overview", "ventas"]).default("overview"),
      periodo: z.enum(["diario", "semanal", "mensual", "anual", "personalizado"]).optional().describe("Solo vista=overview"),
      desde: dia.optional().describe("Solo overview personalizado, AAAA-MM-DD"),
      hasta: dia.optional().describe("Solo overview personalizado, AAAA-MM-DD"),
      rango: z.enum(["hoy", "7d", "30d"]).optional().describe("Solo vista=ventas"),
    },
    pedido: (a) => {
      const vista = a.vista ?? "overview";
      if (vista === "dashboard") return { metodo: "GET", ruta: "/api/admin/dashboard" };
      if (vista === "ventas") return { metodo: "GET", ruta: "/api/admin/ventas-overview", query: limpiar({ range: a.rango }) };
      return { metodo: "GET", ruta: "/api/admin/overview", query: limpiar({ preset: a.periodo, from: a.desde, to: a.hasta }) };
    },
    formatear: (d) => (d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3500) : "Sin datos."),
  },
  {
    nombre: "reporte_diario",
    grupo: "hoy",
    tipo: "lectura",
    descripcion: "Reporte del día (GET /api/daily-report) o la vista previa del cierre diario sin cerrar nada (GET /api/cierre-diario/preview). Montos en S/.",
    entrada: { negocio, vista: z.enum(["reporte", "cierre_preview"]).default("reporte") },
    pedido: (a) => ({ metodo: "GET", ruta: a.vista === "cierre_preview" ? "/api/cierre-diario/preview" : "/api/daily-report" }),
    formatear: (d) => (d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3500) : "Sin datos."),
  },
  {
    nombre: "buscar",
    grupo: "hoy",
    tipo: "lectura",
    descripcion: "Búsqueda global del panel (productos, clientes, pedidos…) por texto (GET /api/search?q=).",
    entrada: { negocio, q: z.string().min(1).max(200) },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/search", query: { q: a.q } }),
    formatear: (d) => (d && typeof d === "object" ? JSON.stringify(d, null, 1).slice(0, 3000) : "Sin resultados."),
  },
];
