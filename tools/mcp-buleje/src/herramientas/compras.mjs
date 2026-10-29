// Grupo «compras»: compras a proveedores. Registrar una compra mueve plata y stock → pide OK.
import { z, negocio, idRuta, limpiar, lista, soles, claveMonto, claveNombre, fichaPorId, filaIdentidad, colaDe4, antesDelPanel, conMarca, linea60, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

/** Subtotal estimado (el servidor recalcula): costo × cantidad − descuento + flete + otros. */
const subtotal = (a) => a.items.reduce((s, i) => s + i.costoUnitario * i.cantidad, 0) * (1 - (a.descuentoPct ?? 0) / 100) + (a.flete ?? 0) + (a.otrosCostos ?? 0);
/** Nombre del proveedor para el aviso: el del panel si hay id; sin id, el escrito, marcado como no verificado. */
function proveedorVisto(a, previa) {
  if (a.proveedorId) return verificado(/** @type {any} */ (previa)?.name);
  return a.proveedor ? `${NO_VERIFICADO} (proveedor sin id: «${linea60(a.proveedor, 40)}»)` : "sin proveedor";
}

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "compras_listar",
    grupo: "compras",
    tipo: "lectura",
    descripcion: "Consulta compras. vista=compras (lista; numero de comprobante o seguimiento), buscar (texto q; modo todo|recibir), calendario_pagos (cuentas por pagar del mes AAAA-MM) o proveedores. Montos en S/.",
    entrada: {
      negocio,
      vista: z.enum(["compras", "buscar", "calendario_pagos", "proveedores"]).default("compras"),
      numero: z.string().max(60).optional(),
      seguimiento: z.boolean().optional(),
      q: z.string().max(80).optional(),
      modo: z.enum(["todo", "recibir"]).optional(),
      mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("AAAA-MM"),
    },
    pedido: (a) => {
      const v = a.vista ?? "compras";
      if (v === "proveedores") return { metodo: "GET", ruta: "/api/suppliers" };
      if (v === "buscar") return { metodo: "GET", ruta: "/api/compras/buscar", query: limpiar({ q: a.q, modo: a.modo }) };
      if (v === "calendario_pagos") return { metodo: "GET", ruta: "/api/compras/cxp-calendar", query: limpiar({ month: a.mes }) };
      return { metodo: "GET", ruta: "/api/purchases", query: limpiar({ numero: a.numero, seguimiento: a.seguimiento ? "1" : undefined }) };
    },
    formatear: (d, a) => lista(d, { titulo: `Compras (${a?.vista ?? "compras"})`, cols: [["N.º", ["number", "numero", "id"]], ["Proveedor", ["supplierName", "name", "nombre"]], ["Total", ["total"], "s"], ["Estado", ["status", "estado"]], ["Pago", ["paymentMethod"]], ["Fecha", ["createdAt", "date", "dueDate"], "f"], ["Teléfono", ["phone"]]] }),
  },
  {
    nombre: "compra_registrar",
    grupo: "compras",
    tipo: "confirmar",
    descripcion: "Registra una compra a un proveedor (POST /api/purchases): suma stock y genera la deuda si es a crédito. Costos unitarios en S/. Pide OK de Brandon.",
    entrada: {
      negocio,
      proveedorId: z.string().max(60).default("").describe("Id del proveedor: el nombre del aviso lo saca el panel"),
      proveedor: z.string().max(200).optional().describe("Solo si el proveedor no está registrado (sin proveedorId): sale como NO verificado"),
      items: z.array(z.object({ productoId: z.number().int().positive(), cantidad: z.number().positive(), costoUnitario: z.number().nonnegative().describe("S/"), unidad: z.string().max(50).optional(), nombre: z.string().max(200).optional() })).min(1).max(200),
      pago: z.enum(["contado", "credito_7", "credito_15", "credito_30", "transferencia"]).default("contado"),
      descuentoPct: z.number().min(0).max(100).optional(),
      comprobanteNumero: z.string().max(60).optional(),
      comprobanteTipo: z.enum(["factura", "boleta", "guia", "ninguno"]).optional(),
      igvIncluido: z.boolean().optional(),
      flete: z.number().min(0).optional().describe("S/"),
      otrosCostos: z.number().min(0).optional().describe("S/"),
      notas: z.string().max(1000).optional(),
      fechaEntrega: z.string().max(20).optional(),
      claveUnica: z.string().min(1).max(100).optional(),
    },
    pedido: (a, previa) => ({
      metodo: "POST",
      ruta: "/api/purchases",
      cuerpo: limpiar({
        supplierId: a.proveedorId ?? "",
        supplierName: a.proveedorId ? /** @type {any} */ (previa)?.name : a.proveedor,
        items: a.items.map((i) => limpiar({ productId: i.productoId, quantity: i.cantidad, unitCost: i.costoUnitario, unit: i.unidad, name: i.nombre })),
        paymentMethod: a.pago ?? "contado",
        discount: a.descuentoPct,
        invoiceNumber: a.comprobanteNumero,
        invoiceType: a.comprobanteTipo,
        igvIncluded: a.igvIncluido,
        flete: a.flete,
        otrosCostos: a.otrosCostos,
        notes: a.notas,
        deliveryDate: a.fechaEntrega,
        idempotencyKey: a.claveUnica,
      }),
    }),
    previa: async (a, leer) => (a.proveedorId && /^[\w-]{1,40}$/.test(a.proveedorId) ? fichaPorId(leer, `/api/suppliers/${a.proveedorId}`, "supplier") : undefined),
    resumen: (a, previa) => {
      const pg = a.pago ?? "contado"; const forma = pg === "contado" ? "al contado" : pg === "transferencia" ? "por transferencia" : `a crédito (${String(pg).replace("credito_", "")} días)`;
      return `Registrar compra a ${proveedorVisto(a, previa)} de ${a.items.length} producto(s) por unos ${soles(subtotal(a))} (el servidor recalcula), ${forma}. Suma stock.`;
    },
    ventana: (a, previa) => ({
      clave: claveMonto(subtotal(a), { etiqueta: "Total de la compra (aprox.)" }),
      filas: [{ etiqueta: "Proveedor", valor: proveedorVisto(a, previa) }, ...(a.proveedorId ? [filaIdentidad(previa)] : []), { etiqueta: "Productos", valor: String(a.items.length) }],
    }),
  },
  {
    nombre: "proveedor_guardar",
    grupo: "compras",
    tipo: "escritura",
    descripcion: "Crea un proveedor (POST /api/suppliers) o, si pasas id, edita uno existente (PATCH /api/suppliers/[id]). Devuelve el proveedor guardado.",
    entrada: {
      negocio,
      id: idRuta.optional().describe("Sin id = crea; con id = edita"),
      nombre: z.string().min(1).max(200).optional(),
      ruc: z.string().max(20).optional(),
      telefono: z.string().max(30).optional(),
      email: z.string().max(200).optional(),
      direccion: z.string().max(500).optional(),
      contacto: z.string().max(100).optional(),
      condicionPago: z.string().max(30).optional(),
      diasCredito: z.number().int().min(0).optional(),
      notas: z.string().max(1000).optional(),
      confirmarDuplicado: z.boolean().optional(),
    },
    pedido: (a) => ({
      metodo: a.id ? "PATCH" : "POST",
      ruta: a.id ? `/api/suppliers/${a.id}` : "/api/suppliers",
      cuerpo: limpiar({ name: a.nombre, ruc: a.ruc, phone: a.telefono, email: a.email, address: a.direccion, personaContacto: a.contacto, condicionPago: a.condicionPago, diasCredito: a.diasCredito, notes: a.notas, confirmarDuplicado: a.confirmarDuplicado }),
    }),
    // Editar nombre, RUC o teléfono de un proveedor que ya existe es cambiar QUIÉN es (2.ª pasada 29-10): pide OK con
    // antes → después leído del panel. Crear uno nuevo no (no le cambia la identidad a nadie).
    confirmarSi: (a) => Boolean(a.id) && (a.nombre !== undefined || a.ruc !== undefined || a.telefono !== undefined),
    previa: (a, leer) => (a.id && /^[\w-]{1,40}$/.test(a.id) ? fichaPorId(leer, `/api/suppliers/${a.id}`, "supplier") : Promise.resolve(undefined)),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const cambios = [];
      if (a.nombre !== undefined) cambios.push(`nombre ${antesDelPanel(p, p?.name, (v) => `«${linea60(v)}»`)} → «${conMarca(a.nombre)}»`);
      if (a.ruc !== undefined) cambios.push(`RUC ${antesDelPanel(p, p?.ruc ?? p?.documento, colaDe4)} → ${linea60(a.ruc, 20) || "(vacío)"}`);
      if (a.telefono !== undefined) cambios.push(`teléfono ${antesDelPanel(p, p?.phone, colaDe4)} → ${linea60(a.telefono, 30) || "(vacío)"}`);
      const otros = ["email", "direccion", "contacto", "condicionPago", "diasCredito", "notas"].filter((k) => a[k] !== undefined);
      return `Editar al proveedor ${verificado(p?.name)}: ${cambios.length ? cambios.join("; ") : "sin cambios de nombre, RUC ni teléfono"}.${otros.length ? ` También cambia: ${otros.join(", ")}.` : ""}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: a.nombre !== undefined ? claveNombre(a.nombre, p?.name ? [p.name] : [], { etiqueta: "Nombre nuevo" }) : null,
        filas: [
          { etiqueta: "Proveedor (hoy)", valor: verificado(p?.name) },
          filaIdentidad(p),
          ...(a.ruc !== undefined ? [{ etiqueta: "RUC nuevo", valor: a.ruc || "(vacío)" }] : []),
          ...(a.telefono !== undefined ? [{ etiqueta: "Teléfono nuevo", valor: a.telefono || "(vacío)" }] : []),
        ],
      };
    },
  },
];
