// Grupo «pedidos»: pedidos de la tienda online. Cambiar el estado mueve stock y pago → pide OK.
import { z, negocio, idRuta, dia, limpiar, lista, ficha, soles, claveMonto, filaIdentidad, verificado, linea60, NO_VERIFICADO } from "../util-herramientas.mjs";

const ESTADOS = ["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"];

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "pedidos_listar",
    grupo: "pedidos",
    tipo: "lectura",
    descripcion: "Lista pedidos de la tienda (GET /api/orders): estado, cliente, total en S/. Filtros: estado, teléfono, desde. Máx. 50 filas; cursor/pagina para seguir.",
    entrada: {
      negocio,
      estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS)).optional(),
      telefono: z.string().max(20).optional(),
      desde: dia.optional(),
      limite: z.number().int().min(1).max(50).optional(),
      pagina: z.number().int().min(1).optional(),
      cursor: z.string().max(100).optional(),
    },
    pedido: (a) => ({ metodo: "GET", ruta: "/api/orders", query: limpiar({ status: a.estado, phone: a.telefono, since: a.desde, limit: a.limite ?? 50, page: a.pagina, cursor: a.cursor }) }),
    formatear: (d) => lista(d, { titulo: "Pedidos", cols: [["N.º", ["id", "number"]], ["Estado", ["status"]], ["Cliente", ["customerName", "customer.name", "name"]], ["Total", ["total"], "s"], ["Fecha", ["createdAt"], "f"]] }),
  },
  {
    nombre: "pedido_ver",
    grupo: "pedidos",
    tipo: "lectura",
    descripcion: "Detalle de un pedido por id (GET /api/orders/[id]): productos, estado, pago y total en S/.",
    entrada: { negocio, id: idRuta },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/orders/${a.id}` }),
    formatear: (d) => ficha(d, { titulo: "Pedido", campos: [["N.º", ["id"]], ["Estado", ["status"]], ["Total", ["total"], "s"], ["Pago", ["paymentMethod"]], ["Repartidor", ["riderName"]], ["Notas", ["notes"]]] }),
  },
  {
    nombre: "pedido_estado",
    grupo: "pedidos",
    tipo: "confirmar",
    descripcion: "Cambia el estado de un pedido (PATCH /api/orders/[id]) según la máquina de estados del panel. Puede mover stock y pago (por ejemplo cancelar repone stock). Pide OK de Brandon.",
    entrada: {
      negocio,
      id: idRuta,
      estado: z.enum(/** @type {[string, ...string[]]} */ (ESTADOS)),
      motivoCancelacion: z.string().max(500).optional(),
      repartidor: z.string().max(80).optional(),
      nota: z.string().max(1000).optional(),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/orders/${a.id}`, cuerpo: limpiar({ status: a.estado, cancelReason: a.motivoCancelacion, riderName: a.repartidor, adminNote: a.nota }) }),
    previa: async (a, leer) => {
      const r = await leer({ metodo: "GET", ruta: `/api/orders/${a.id}` });
      return r.ok ? r.datos : null;
    },
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const antes = p?.status ? `de «${p.status}» ` : "";
      const total = p?.total !== undefined ? ` (${soles(Number(p.total))})` : "";
      const cli = p?.customerName ?? p?.customer?.name;
      const quien = cli ? ` de ${linea60(cli)}` : p ? "" : ` (${NO_VERIFICADO}: no pude leer el pedido)`;
      return `Pasar el pedido ${a.id}${quien}${total} ${antes}a «${a.estado}»${a.estado === "cancelado" ? " (repone el stock)" : ""}.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return {
        clave: p?.total !== undefined ? claveMonto(Number(p.total), { etiqueta: "Total del pedido" }) : null,
        filas: [{ etiqueta: "Cliente", valor: verificado(p?.customerName ?? p?.customer?.name) }, filaIdentidad(p ? p.customer ?? { phone: p.customerPhone } : undefined), { etiqueta: "Estado nuevo", valor: a.estado }],
      };
    },
  },
];
