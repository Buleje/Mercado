// Grupo «ventas»: ventas del POS. Registrar y devolver mueven plata y stock → piden OK.
import { z, negocio, idRuta, dia, limpiar, lista, ficha, soles, quien, claveMonto, claveCantidad } from "../util-herramientas.mjs";

/** Total estimado de la venta (el servidor recalcula). */
const netoVenta = (a) => Math.max(0, a.items.reduce((s, i) => s + i.precio * i.cantidad * (1 - (i.descuentoPct ?? 0) / 100), 0) - (a.descuentoMonto ?? 0));

const COLS_VENTA = [
  ["N.º", ["number", "numero", "id"]],
  ["Fecha", ["createdAt", "date", "fecha"], "f"],
  ["Cliente", ["customerName", "cliente"]],
  ["Total", ["total"], "s"],
  ["Pago", ["payment", "paymentMethod"]],
  ["Comprobante", ["comprobanteNumero"]],
];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "ventas_listar",
    grupo: "ventas",
    tipo: "lectura",
    descripcion: "Lista ventas del POS (GET /api/sales): total en S/, cliente, forma de pago. Filtros: hoy, rango de fechas, cajero. Máx. 50 filas; pide la página siguiente con pagina.",
    entrada: {
      negocio,
      hoy: z.boolean().optional(),
      desde: dia.optional(),
      hasta: dia.optional(),
      cajeroId: z.string().max(60).optional(),
      pagina: z.number().int().min(1).optional(),
      limite: z.number().int().min(1).max(50).optional(),
    },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/sales", query: limpiar({ today: a.hoy ? "1" : undefined, from: a.desde, to: a.hasta, cashierId: a.cajeroId, page: a.pagina, limit: a.limite ?? 50 }) }),
    formatear: (d) => lista(d, { titulo: "Ventas", cols: COLS_VENTA }),
  },
  {
    nombre: "venta_ver",
    grupo: "ventas",
    tipo: "lectura",
    descripcion: "Detalle de una venta por id (GET /api/sales/[id]): productos, total en S/, pago y cliente.",
    entrada: { negocio, id: idRuta },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/sales/${a.id}` }),
    formatear: (d) => ficha(d, { titulo: "Venta", campos: [["N.º", ["number", "numero", "id"]], ["Fecha", ["createdAt", "date"], "f"], ["Cliente", ["customerName"]], ["Total", ["total"], "s"], ["Pago", ["payment", "paymentMethod"]], ["Comprobante", ["comprobanteTipo"]], ["N.º SUNAT", ["comprobanteNumero"]]] }),
  },
  {
    nombre: "ventas_resumen_hoy",
    grupo: "ventas",
    tipo: "lectura",
    descripcion: "Resumen de las ventas de hoy (GET /api/sales/resumen-hoy): total en S/ y cantidad de ventas.",
    entrada: { negocio },
    pedido: () => ({ metodo: "GET", ruta: "/api/sales/resumen-hoy" }),
    formatear: (d) => ficha(d, { titulo: "Ventas de hoy", campos: [["Total", ["total", "totalHoy", "monto"], "s"], ["Ventas", ["count", "cantidad", "ventas"], "n"]] }),
  },
  {
    nombre: "venta_anotar_comprobante",
    grupo: "ventas",
    tipo: "escritura",
    descripcion: "Anota en la venta el comprobante que SUNAT emitió en SOL (PATCH /api/sales/[id]): tipo factura o boleta, N.º (E001-318, F001-12, EB01-12, B001-5) y RUC (factura, 11 dígitos) o DNI (boleta, opcional). No mueve plata ni stock. Si la venta ya tiene OTRO número responde 409: manda reemplazar:true. quitar:true deshace la anotación (vuelve a ticket).",
    entrada: {
      negocio,
      venta: idRuta.describe("Id de la venta (ventas_listar)"),
      tipo: z.enum(["factura", "boleta"]).optional().describe("factura o boleta (obligatorio salvo quitar)"),
      numero: z.string().trim().max(24).optional().describe("N.º emitido, ej. E001-318 o EB01-00000012"),
      ruc: z.string().trim().max(15).optional().describe("RUC del cliente (factura) o DNI (boleta)"),
      reemplazar: z.boolean().optional().describe("Pisar otro N.º ya anotado"),
      quitar: z.boolean().optional().describe("Deshacer la anotación"),
    },
    pedido: (a) => ({
      metodo: "PATCH",
      ruta: `/api/sales/${a.venta}`,
      cuerpo: a.quitar ? { quitar: true } : limpiar({ tipo: a.tipo, numero: a.numero, ruc: a.ruc, reemplazar: a.reemplazar }),
    }),
    formatear: (d) => {
      const v = /** @type {any} */ (d)?.venta ?? {};
      if (!v.comprobanteNumero) return `Venta ${v.id ?? ""}: sin comprobante (ticket).`.replace("  ", " ");
      const tipo = v.comprobanteTipo === "factura" ? "Factura" : "Boleta";
      const ya = /** @type {any} */ (d)?.cambio === false ? " (ya estaba anotada)" : "";
      return `Venta ${v.id}: ${tipo} ${v.comprobanteNumero}${v.comprobanteRuc ? `, doc. ${v.comprobanteRuc}` : ""}${ya}.`;
    },
  },
  {
    nombre: "venta_registrar",
    grupo: "ventas",
    tipo: "confirmar",
    descripcion: "Registra una venta del POS (POST /api/sales): descuenta stock y mueve la caja. Pide OK de Brandon. Cada producto lleva productId, nombre, precio unitario en S/ y cantidad. El total lo calcula el servidor.",
    entrada: {
      negocio,
      items: z.array(z.object({
        productId: z.number().int().positive(),
        nombre: z.string().min(1).max(200),
        precio: z.number().nonnegative().describe("Precio unitario en S/"),
        cantidad: z.number().positive(),
        unidad: z.string().max(50).optional(),
        descuentoPct: z.number().min(0).max(100).optional(),
      })).min(1).max(100),
      pago: z.enum(["efectivo", "yape", "plin", "tarjeta", "MIXTO", "fiado"]).default("efectivo"),
      montoPagado: z.number().nonnegative().optional().describe("Lo que entregó el cliente, en S/"),
      clienteTelefono: z.string().max(20).optional(),
      clienteNombre: z.string().max(80).optional(),
      comprobante: z.enum(["ticket", "boleta", "factura", "cotizacion", "proforma"]).optional(),
      ruc: z.string().max(11).optional(),
      descuentoMonto: z.number().nonnegative().optional().describe("Descuento total en S/"),
      descuentoPorcentaje: z.number().nonnegative().optional(),
      claveUnica: z.string().max(100).optional().describe("Clave de idempotencia; la pone el MCP al proponer"),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/sales",
      cuerpo: limpiar({
        items: a.items.map((i) => limpiar({ productId: i.productId, name: i.nombre, price: i.precio, quantity: i.cantidad, unit: i.unidad, discount: i.descuentoPct })),
        payment: a.pago ?? "efectivo",
        amountPaid: a.montoPagado,
        customerPhone: a.clienteTelefono,
        customerName: a.clienteNombre,
        comprobanteTipo: a.comprobante,
        comprobanteRuc: a.ruc,
        descuentoMonto: a.descuentoMonto,
        descuentoPorcentaje: a.descuentoPorcentaje,
        idempotencyKey: a.claveUnica,
      }),
    }),
    resumen: (a) => {
      const neto = netoVenta(a);
      const lista = a.items.slice(0, 5).map((i) => `${i.cantidad} ${i.unidad ?? ""} ${i.nombre}`.replace(/\s+/g, " ").trim()).join(", ");
      const mas = a.items.length > 5 ? ` y ${a.items.length - 5} más` : "";
      const cli = a.clienteNombre || a.clienteTelefono ? ` a ${quien(a.clienteNombre, a.clienteTelefono)}` : "";
      return `Registrar venta${cli} de ${lista}${mas} por unos ${soles(neto)} (el servidor recalcula), pago ${a.pago ?? "efectivo"}. Descuenta stock y entra a la caja.`;
    },
    ventana: (a) => ({
      clave: claveMonto(netoVenta(a), { etiqueta: "Total de la venta (aprox.)" }),
      filas: [{ etiqueta: "Productos", valor: String(a.items.length) }, { etiqueta: "Pago", valor: a.pago ?? "efectivo" }],
    }),
    formatear: (d) => ficha(d, { titulo: "Venta registrada", campos: [["N.º", ["number", "numero", "id"]], ["Total", ["total"], "s"]] }),
  },
  {
    nombre: "venta_devolver",
    grupo: "ventas",
    tipo: "confirmar",
    descripcion: "Devuelve productos de una venta (POST /api/sales/devolucion): repone stock y devuelve la plata en efectivo o como crédito del cliente. Pide OK de Brandon.",
    entrada: {
      negocio,
      ventaId: z.string().min(1).max(60),
      items: z.array(z.object({ productId: z.number().int().positive(), cantidad: z.number().int().positive(), motivo: z.string().max(200).optional() })).min(1).max(50),
      reembolso: z.enum(["efectivo", "credito"]),
      claveUnica: z.string().min(8).max(80).optional(),
    },
    pedido: (a) => ({
      metodo: "POST",
      ruta: "/api/sales/devolucion",
      cuerpo: limpiar({ saleId: a.ventaId, items: a.items.map((i) => limpiar({ productId: i.productId, qty: i.cantidad, motivo: i.motivo })), refundType: a.reembolso, idempotencyKey: a.claveUnica }),
    }),
    previa: async (a, leer) => {
      if (!/^[\w-]{1,60}$/.test(a.ventaId)) return null;
      const r = await leer({ metodo: "GET", ruta: `/api/sales/${a.ventaId}` });
      return r.ok ? r.datos : null;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const venta = p?.total !== undefined ? ` (venta de ${soles(Number(p.total))}${p.customerName ? ` a ${p.customerName}` : ""})` : "";
      const n = a.items.reduce((s, i) => s + i.cantidad, 0);
      return `Devolver ${n} unidad(es) de la venta ${a.ventaId}${venta}. Reembolso en ${a.reembolso === "efectivo" ? "efectivo (sale de la caja)" : "crédito para el cliente"}. Repone el stock.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: claveCantidad(a.items.reduce((s, i) => s + i.cantidad, 0), { etiqueta: "Unidades que se devuelven", unidad: "u" }),
        filas: [{ etiqueta: "Venta", valor: p?.total !== undefined ? `${soles(Number(p.total))}${p.customerName ? ` a ${p.customerName}` : ""}` : "no se pudo leer" }, { etiqueta: "Reembolso", valor: a.reembolso === "efectivo" ? "efectivo (sale de la caja)" : "crédito del cliente" }],
      };
    },
  },
];
