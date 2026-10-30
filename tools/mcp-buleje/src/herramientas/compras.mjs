// Grupo «compras»: compras a proveedores. Registrar una compra mueve plata y stock → pide OK.
import { z, negocio, idRuta, limpiar, lista, ficha, soles, claveMonto, claveNombre, fichaPorId, filasCompletas, otrosNombres, filaIdentidad, colaDe4, antesDelPanel, conMarca, linea60, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

/** Subtotal estimado (el servidor recalcula): costo × cantidad − descuento + flete + otros. */
const subtotal = (a) => a.items.reduce((s, i) => s + i.costoUnitario * i.cantidad, 0) * (1 - (a.descuentoPct ?? 0) / 100) + (a.flete ?? 0) + (a.otrosCostos ?? 0);
/** Nombre del proveedor para el aviso: el del panel si hay id; sin id, el escrito, marcado como no verificado. */
function proveedorVisto(a, previa) {
  if (a.proveedorId) return verificado(/** @type {any} */ (previa)?.name);
  return a.proveedor ? `${NO_VERIFICADO} (proveedor sin id: «${linea60(a.proveedor, 40)}»)` : "sin proveedor";
}

// ── Carril C (29-10): ver, cancelar, recibir y borrar una compra; borrar un proveedor ───────────────
const numOrNull = (v) => (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
/** La orden de compra del panel (nombre del proveedor, total en S/ y estado salen de acá, nunca del modelo). */
const compraPorId = async (id, leer) => {
  const c = /** @type {any} */ (await fichaPorId(leer, `/api/purchases/${id}`, "purchase"));
  return c ? { ...c, proveedor: c.supplierName ?? c.supplier?.name, total: numOrNull(c.total), items: Array.isArray(c.items) ? c.items.length : undefined } : undefined;
};
const filasCompra = (p) => [{ etiqueta: "Proveedor", valor: verificado(p?.proveedor) }, { etiqueta: "Total", valor: p?.total === undefined ? "no se pudo leer" : soles(p.total) }, { etiqueta: "Estado hoy", valor: p?.status ? String(p.status) : "no se pudo leer" }, { etiqueta: "Productos", valor: p?.items === undefined ? "no se pudo leer" : String(p.items) }];
const claveCompra = (p, etiqueta) => (p?.total !== undefined ? claveMonto(p.total, { etiqueta }) : null);

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
const herramientasCompra = [
  {
    nombre: "compra_ver",
    grupo: "compras",
    tipo: "lectura",
    descripcion: "Una compra por id (GET /api/purchases/[id], admin o almacenero): proveedor, estado, productos, total y pagos en S/. El id sale de compras_listar. Ej.: id de una compra pendiente.",
    entrada: { negocio, id: idRuta.describe("Id de la compra (compras_listar)") },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/purchases/${a.id}` }),
    formatear: (d) => {
      const c = /** @type {any} */ (d);
      const base = ficha(c, { titulo: "Compra", campos: [["Proveedor", ["supplierName"]], ["Estado", ["status"]], ["Total", ["total"], "s"], ["Forma de pago", ["paymentMethod"]], ["Comprobante", ["invoiceNumber"]], ["Flete", ["flete"], "s"], ["Entrega", ["deliveryDate"], "f"], ["Notas", ["notes"]], ["Id", ["id"]]] });
      const items = Array.isArray(c?.items) ? c.items.slice(0, 30).map((i) => `- ${i.name ?? i.productName ?? `producto ${i.productId}`}: ${i.quantity} × ${soles(Number(i.unitCost ?? 0))}`) : [];
      return items.length ? `${base}\nProductos (${items.length}):\n${items.join("\n")}` : base;
    },
  },
  {
    nombre: "compra_cancelar",
    grupo: "compras",
    tipo: "confirmar",
    descripcion: "Cancela una compra (PATCH /api/purchases/[id], status=cancelado, admin o almacenero; si tiene deuda en Por pagar solo dueño, admin o encargado): cierra su deuda. Exige un motivo real. Pide OK de Brandon. Ej.: id=<id>, motivo=\"El proveedor no entregó\".",
    entrada: { negocio, id: idRuta.describe("Id de la compra: proveedor y total del aviso los saca el panel"), motivo: z.string().min(3).max(300).describe("Por qué se cancela (≥3 letras)") },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/purchases/${a.id}`, cuerpo: { status: "cancelado", cancelReason: a.motivo } }),
    previa: (a, leer) => compraPorId(a.id, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Cancelar la compra a ${verificado(p?.proveedor)} por ${p?.total === undefined ? NO_VERIFICADO : soles(p.total)} (hoy: ${p?.status ?? "no se pudo leer"}). Si tiene deuda en Por pagar, se cierra. Motivo: ${linea60(a.motivo, 100)}.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: claveCompra(p, "Total de la compra"), filas: filasCompra(p) };
    },
  },
  {
    nombre: "compra_recibir",
    grupo: "compras",
    tipo: "confirmar",
    descripcion: "Cambia el estado de una compra (PATCH /api/purchases/[id]): recibido = llegó entera (suma stock y costo), parcial = solo cambia el estado (NO suma stock). Pide OK de Brandon. Ej.: id=<id>, estado=\"recibido\".",
    entrada: { negocio, id: idRuta.describe("Id de la compra: proveedor y total del aviso los saca el panel"), estado: z.enum(["recibido", "parcial"]).describe("recibido o parcial") },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/purchases/${a.id}`, cuerpo: { status: a.estado } }),
    previa: (a, leer) => compraPorId(a.id, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const quien = `la compra a ${verificado(p?.proveedor)} por ${p?.total === undefined ? NO_VERIFICADO : soles(p.total)} (hoy: ${p?.status ?? "no se pudo leer"})`;
      return a.estado === "parcial"
        ? `Marcar como parcial ${quien}. Solo cambia el estado: NO suma stock ni actualiza el costo.`
        : `Marcar como recibido ${quien}. Suma stock de ${p?.items ?? "?"} producto(s) y actualiza su costo.`;
    },
    ventana: (a, previa) => ({ clave: claveCompra(/** @type {any} */ (previa), "Total de la compra"), filas: [...filasCompra(previa), { etiqueta: "Pasa a", valor: a.estado === "parcial" ? "parcial (sin sumar stock)" : "recibido (suma stock)" }] }),
  },
  {
    nombre: "compra_borrar",
    grupo: "compras",
    tipo: "confirmar",
    descripcion: "Borra una compra del panel (DELETE /api/purchases/[id], solo admin). No devuelve stock ni cierra deuda: para anular usa compra_cancelar. Pide OK de Brandon.",
    entrada: { negocio, id: idRuta.describe("Id de la compra: proveedor y total del aviso los saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/purchases/${a.id}` }),
    previa: (a, leer) => compraPorId(a.id, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const st = String(p?.status ?? "");
      const entro = st === "recibido" || st === "parcial";
      return `Borrar la compra a ${verificado(p?.proveedor)} por ${p?.total === undefined ? NO_VERIFICADO : soles(p.total)} (estado: ${p?.status ?? "no se pudo leer"}). El stock y la deuda NO se revierten. No se puede deshacer.${entro ? " OJO: ya está " + st + " (su stock ya entró): se recomienda cancelarla (compra_cancelar) en vez de borrarla." : ""}`;
    },
    ventana: (a, previa) => {
      const st = String(/** @type {any} */ (previa)?.status ?? "");
      return { clave: claveCompra(/** @type {any} */ (previa), "Total de la compra"), filas: [...filasCompra(previa), { etiqueta: "Ojo", valor: "borrar NO revierte stock ni deuda" + (st === "recibido" || st === "parcial" ? `; ya está ${st}: mejor cancelar` : "") }] };
    },
  },
  {
    nombre: "proveedor_borrar",
    grupo: "compras",
    tipo: "confirmar",
    descripcion: "Borra un proveedor (DELETE /api/suppliers/[id], solo admin). Pide OK de Brandon; nombre y RUC del aviso los saca el panel.",
    entrada: { negocio, id: idRuta.describe("Id del proveedor (compras_listar vista=proveedores)") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/suppliers/${a.id}` }),
    previa: async (a, leer) => {
      const f = /** @type {any} */ (await fichaPorId(leer, `/api/suppliers/${a.id}`, "supplier"));
      const lis = await filasCompletas(leer, "/api/suppliers");
      return f ? { ...f, otros: otrosNombres(lis, a.id, ["name"]) } : undefined;
    },
    resumen: (a, previa) => `Borrar al proveedor «${verificado(/** @type {any} */ (previa)?.name)}». No se puede deshacer.`,
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.name ? claveNombre(p.name, p.otros, { etiqueta: "Proveedor", palabra: "nombre" }) : null, filas: [filaIdentidad(p)] };
    },
  },
];

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
  ...herramientasCompra,
];
