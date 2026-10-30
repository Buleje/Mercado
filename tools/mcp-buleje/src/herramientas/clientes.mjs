// Grupo «clientes»: clientes y fiados (deudas). Cobrar un fiado mueve plata → pide OK.
import { z, negocio, idRuta, limpiar, lista, ficha, soles, claveMonto, claveNombre, fichaPorId, filaIdentidad, colaDe4, antesDelPanel, conMarca, linea60, verificado } from "../util-herramientas.mjs";

/** Ficha del cliente por teléfono (nombre, deuda y límite salen de acá, nunca del modelo). */
const clientePorTelefono = (telefono, leer) => (/^[\w-]{1,40}$/.test(telefono) ? fichaPorId(leer, `/api/customers/${telefono}`, "customer") : Promise.resolve(undefined));

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "clientes_ver",
    grupo: "clientes",
    tipo: "lectura",
    descripcion: "Lista clientes (GET /api/customers): nombre, teléfono y deuda en S/. Busca por texto q. Máx. 50 filas; pagina/cursor para seguir.",
    entrada: { negocio, q: z.string().max(100).optional(), pagina: z.number().int().min(1).optional(), limite: z.number().int().min(1).max(50).optional(), cursor: z.string().max(100).optional() },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/customers", query: limpiar({ q: a.q, page: a.pagina, limit: a.limite ?? 50, cursor: a.cursor }) }),
    formatear: (d) => lista(d, { titulo: "Clientes", cols: [["Nombre", ["name", "nombre"]], ["Teléfono", ["phone", "telefono"]], ["Debe", ["creditBalance", "deuda", "debt"], "s"], ["Categoría", ["categoria"]]] }),
  },
  {
    nombre: "cliente_ver",
    grupo: "clientes",
    tipo: "lectura",
    descripcion: "Ficha de un cliente por teléfono (GET /api/customers/[phone]): datos, crédito y deuda en S/.",
    entrada: { negocio, telefono: idRuta },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/customers/${a.telefono}` }),
    formatear: (d) => ficha(d, { titulo: "Cliente", campos: [["Nombre", ["name"]], ["Teléfono", ["phone"]], ["Debe", ["creditBalance"], "s"], ["Límite de crédito", ["creditLimit"], "s"], ["Dirección", ["direccion", "location"]], ["Notas", ["privateNotes"]]] }),
  },
  {
    nombre: "fiados_ver",
    grupo: "clientes",
    tipo: "lectura",
    descripcion: "Deudas de clientes. vista=fiados (lista; filtra por estado ACTIVO|PAGADO|VENCIDO|CANCELADO, cliente o texto) o por_cobrar (resumen de lo que falta cobrar, S/).",
    entrada: {
      negocio,
      vista: z.enum(["fiados", "por_cobrar"]).default("fiados"),
      estado: z.enum(["ACTIVO", "PAGADO", "VENCIDO", "CANCELADO"]).optional(),
      clienteId: z.string().max(100).optional(),
      buscar: z.string().max(200).optional(),
      detalle: z.boolean().optional().describe("Solo por_cobrar: con detalle por cliente"),
    },
    pedido: (a) => a.vista === "por_cobrar"
      ? { metodo: "GET", ruta: "/api/admin/por-cobrar", query: limpiar({ detalle: a.detalle ? "1" : undefined }) }
      : { metodo: "GET", ruta: "/api/fiados", query: limpiar({ status: a.estado, customerId: a.clienteId, search: a.buscar }) },
    formatear: (d) => lista(d, { titulo: "Fiados", cols: [["Cliente", ["customerName", "nombre", "name"]], ["Total", ["total"], "s"], ["Saldo", ["saldo", "balance", "pendiente"], "s"], ["Estado", ["status"]], ["Vence", ["fechaVence"], "f"]] }),
  },
  {
    nombre: "fiado_cobrar",
    grupo: "clientes",
    tipo: "confirmar",
    descripcion: "Cobra una deuda (fiado) a un cliente por teléfono (POST /api/fiados/cobrar): baja su deuda y, si aCaja es true, entra a la caja abierta. Monto en S/. Pide OK de Brandon.",
    entrada: {
      negocio,
      telefono: z.string().min(1).max(20).describe("Teléfono del cliente: el nombre del aviso lo saca el panel"),
      monto: z.number().positive().max(1000000).describe("S/"),
      metodo: z.enum(["efectivo", "yape", "plin", "tarjeta", "transferencia"]).optional(),
      aCaja: z.boolean().optional(),
      notas: z.string().max(500).optional(),
    },
    // El nombre de la etiqueta de la caja es el que leyó la previa (si no lo hay, la ruta lo busca en la base).
    pedido: (a, previa) => ({ metodo: "POST", ruta: "/api/fiados/cobrar", cuerpo: limpiar({ customerPhone: a.telefono, monto: a.monto, metodo: a.metodo, aCaja: a.aCaja, notas: a.notas, nombre: previa?.name ? linea60(previa.name, 80) : undefined }) }),
    previa: (a, leer) => clientePorTelefono(a.telefono, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const antes = p?.creditBalance !== undefined ? ` Debe ${soles(Number(p.creditBalance))} → quedaría en ${soles(Math.max(0, Number(p.creditBalance) - a.monto))}.` : "";
      return `Cobrar ${soles(a.monto)} a ${verificado(p?.name)} (tel. ${linea60(a.telefono, 20)}) en ${a.metodo ?? "efectivo"}${a.aCaja ? " (entra a la caja)" : ""}.${antes}`;
    },
    ventana: (a, previa) => ({
      clave: claveMonto(a.monto, { etiqueta: "Monto a cobrar" }),
      filas: [{ etiqueta: "Cliente", valor: verificado(/** @type {any} */ (previa)?.name) }, filaIdentidad(previa), { etiqueta: "Teléfono", valor: a.telefono }],
    }),
  },
  {
    nombre: "cliente_crear",
    grupo: "clientes",
    tipo: "escritura",
    descripcion: "Crea un cliente (POST /api/customers) con teléfono y nombre. Devuelve la ficha creada.",
    entrada: {
      negocio,
      telefono: z.string().min(6).max(20),
      nombre: z.string().min(1).max(100),
      direccion: z.string().max(500).optional(),
      referencia: z.string().max(300).optional(),
      email: z.string().max(200).optional(),
      documento: z.string().max(20).optional(),
      tipoDocumento: z.string().max(20).optional(),
      limiteCredito: z.number().min(0).optional().describe("S/"),
      observaciones: z.string().max(2000).optional(),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/customers", cuerpo: limpiar({ phone: a.telefono, name: a.nombre, location: a.direccion, reference: a.referencia, email: a.email, documento: a.documento, tipoDocumento: a.tipoDocumento, creditLimit: a.limiteCredito, observaciones: a.observaciones }) }),
    // Darle crédito es plata: con límite de crédito pide OK (hallazgo 6, 29-10).
    confirmarSi: (a) => a.limiteCredito !== undefined,
    resumen: (a) => `Crear el cliente ${linea60(a.nombre)} (tel. ${linea60(a.telefono, 20)}) con límite de crédito ${soles(Number(a.limiteCredito ?? 0))}: podrá llevar fiado hasta ese monto.`,
    ventana: (a) => ({
      clave: claveMonto(Number(a.limiteCredito ?? 0), { etiqueta: "Límite de crédito" }),
      filas: [{ etiqueta: "Cliente nuevo", valor: a.nombre }, { etiqueta: "Teléfono", valor: a.telefono }],
    }),
  },
  {
    nombre: "cliente_editar",
    grupo: "clientes",
    tipo: "escritura",
    descripcion: "Edita datos de un cliente por teléfono (PATCH /api/customers/[phone]): nombre, dirección, notas, correo, límite de crédito en S/. No toca su deuda.",
    entrada: {
      negocio,
      telefono: idRuta,
      nombre: z.string().min(1).max(100).optional(),
      direccion: z.string().max(500).optional(),
      email: z.string().max(200).optional(),
      documento: z.string().max(20).optional(),
      limiteCredito: z.number().min(0).optional().describe("S/"),
      notasPrivadas: z.string().max(2000).optional(),
      observaciones: z.string().max(2000).optional(),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/customers/${a.telefono}`, cuerpo: limpiar({ name: a.nombre, direccion: a.direccion, email: a.email, documento: a.documento, creditLimit: a.limiteCredito, privateNotes: a.notasPrivadas, observaciones: a.observaciones }) }),
    // Cambiar el límite de crédito es plata; cambiar nombre o documento es cambiar QUIÉN es (2.ª pasada 29-10: las
    // ventanas siguientes mostrarían el nombre nuevo como «leído del panel»). Los tres piden OK con antes → después.
    confirmarSi: (a) => a.limiteCredito !== undefined || a.nombre !== undefined || a.documento !== undefined,
    previa: (a, leer) => clientePorTelefono(a.telefono, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const cambios = [];
      if (a.nombre !== undefined) cambios.push(`nombre ${antesDelPanel(p, p?.name, (v) => `«${linea60(v)}»`)} → «${conMarca(a.nombre)}»`);
      if (a.documento !== undefined) cambios.push(`documento ${antesDelPanel(p, p?.documento, colaDe4)} → ${linea60(a.documento, 20) || "(vacío)"}`);
      if (a.limiteCredito !== undefined) cambios.push(`límite de crédito ${antesDelPanel(p, p?.creditLimit, (v) => soles(Number(v)))} → ${soles(Number(a.limiteCredito))}`);
      const otros = ["direccion", "email", "notasPrivadas", "observaciones"].filter((k) => a[k] !== undefined);
      return `Editar al cliente ${verificado(p?.name)} (tel. ${linea60(a.telefono, 20)}): ${cambios.length ? cambios.join("; ") : "sin cambios de nombre, documento ni crédito"}.${otros.length ? ` También cambia: ${otros.join(", ")}.` : ""}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const clave = a.limiteCredito !== undefined ? claveMonto(Number(a.limiteCredito), { etiqueta: "Límite de crédito nuevo" })
        : a.nombre !== undefined ? claveNombre(a.nombre, p?.name ? [p.name] : [], { etiqueta: "Nombre nuevo" })
        : null;
      return {
        clave,
        filas: [
          { etiqueta: "Cliente (hoy)", valor: verificado(p?.name) },
          filaIdentidad(p),
          ...(a.nombre !== undefined && a.limiteCredito !== undefined ? [{ etiqueta: "Nombre nuevo", valor: a.nombre }] : []),
          ...(a.documento !== undefined ? [{ etiqueta: "Documento nuevo", valor: a.documento || "(vacío)" }] : []),
        ],
      };
    },
  },
  {
    nombre: "cliente_borrar",
    grupo: "clientes",
    tipo: "confirmar",
    descripcion: "Borra un cliente por teléfono (DELETE /api/customers/[phone], solo admin; deja registro por la Ley 29733). Pide OK de Brandon; nombre, deuda y últimos dígitos del teléfono los saca el panel.",
    entrada: { negocio, telefono: idRuta.describe("Teléfono del cliente: el nombre del aviso lo saca el panel") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/customers/${a.telefono}` }),
    previa: (a, leer) => clientePorTelefono(a.telefono, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const deuda = p?.creditBalance !== undefined && Number(p.creditBalance) > 0 ? ` Debe ${soles(Number(p.creditBalance))}: esa deuda se pierde.` : "";
      return `Borrar al cliente ${verificado(p?.name)} (tel. ${colaDe4(a.telefono)}).${deuda} No se puede deshacer.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.name ? claveNombre(p.name, [], { etiqueta: "Cliente", palabra: "nombre" }) : null, filas: [filaIdentidad(p), { etiqueta: "Debe hoy", valor: p?.creditBalance === undefined ? "no se pudo leer" : soles(Number(p.creditBalance)) }] };
    },
  },
];
