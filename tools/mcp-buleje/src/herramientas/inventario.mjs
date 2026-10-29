// Grupo «inventario»: stock y kardex. Ajustar o mover stock pide OK.
import { z, negocio, dia, limpiar, lista, numero, claveCantidad, fichaPorId, linea60, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

/** Nombre y stock de hoy del producto, leídos del panel (nunca del modelo). */
const productoPorId = (id, leer) => fichaPorId(leer, `/api/products/${Number(id)}`, "product");
const stockDe = (p) => (p && Number.isFinite(Number(p.stock)) ? Number(p.stock) : undefined);
const unidades = (n) => `${numero(n, Number.isInteger(n) ? 0 : 2)} u`;
const MUESTRA_LOTE = 10;

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
export const herramientas = [
  {
    nombre: "stock_ver",
    grupo: "inventario",
    tipo: "lectura",
    descripcion: "Consulta inventario. vista=productos (lista y stock; buscar/categoria), alertas (stock bajo), kardex (movimientos de un producto: productoId, desde, hasta) o vencimientos. Cantidades en unidades; precios en S/.",
    entrada: {
      negocio,
      vista: z.enum(["productos", "alertas", "kardex", "vencimientos"]).default("productos"),
      productoId: z.number().int().positive().optional().describe("Obligatorio en vista=kardex"),
      buscar: z.string().max(100).optional(),
      categoria: z.string().max(100).optional(),
      desde: dia.optional(),
      hasta: dia.optional(),
      pagina: z.number().int().min(1).optional(),
      limite: z.number().int().min(1).max(50).optional(),
    },
    pedido: (a) => {
      const v = a.vista ?? "productos";
      if (v === "alertas") return { metodo: "GET", ruta: "/api/inventory/stock-alerts" };
      if (v === "vencimientos") return { metodo: "GET", ruta: "/api/inventory/expiry" };
      if (v === "kardex") return { metodo: "GET", ruta: "/api/inventory/kardex", query: limpiar({ productId: a.productoId, from: a.desde, to: a.hasta }) };
      return { metodo: "GET", ruta: "/api/products", query: limpiar({ q: a.buscar, category: a.categoria, page: a.pagina, limit: a.limite ?? 50 }) };
    },
    formatear: (d, a) => lista(d, {
      titulo: `Inventario (${a?.vista ?? "productos"})`,
      cols: [["Producto", ["name", "nombre", "productName"]], ["Stock", ["stock", "currentStock", "quantity"], "n"], ["Mínimo", ["minStock", "stockMinimo"], "n"], ["Precio", ["price", "precio"], "s"], ["Vence", ["expiryDate", "fechaVencimiento"], "f"], ["Movimiento", ["type", "tipo"]]],
    }),
  },
  {
    nombre: "stock_ajustar",
    grupo: "inventario",
    tipo: "confirmar",
    descripcion: "Fija el stock real de un producto (POST /api/inventory-movements, action=adjust). Cambia el inventario: pide OK de Brandon. El motivo es obligatorio (conteo físico, merma, etc.).",
    entrada: {
      negocio,
      productoId: z.number().int().positive().describe("Id del producto: el nombre del aviso lo saca el panel"),
      stockNuevo: z.number().min(0),
      motivo: z.string().min(3).max(300),
      almacenId: z.string().max(60).optional(),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/inventory-movements", cuerpo: limpiar({ action: "adjust", productId: a.productoId, newStock: a.stockNuevo, warehouseId: a.almacenId, notes: a.motivo }) }),
    previa: (a, leer) => productoPorId(a.productoId, leer),
    resumen: (a, previa) => {
      const antes = stockDe(previa);
      return `Dejar el stock de ${verificado(/** @type {any} */ (previa)?.name)} en ${unidades(a.stockNuevo)}${antes === undefined ? "" : ` (hoy: ${unidades(antes)})`}. Motivo: ${a.motivo}.`;
    },
    ventana: (a, previa) => {
      const antes = stockDe(previa);
      return {
        clave: claveCantidad(a.stockNuevo, { etiqueta: "Stock nuevo", unidad: "u" }),
        filas: [{ etiqueta: "Producto", valor: verificado(/** @type {any} */ (previa)?.name) }, { etiqueta: "Stock de hoy", valor: antes === undefined ? "no se pudo leer" : unidades(antes) }],
      };
    },
  },
  {
    nombre: "stock_ajustar_lote",
    grupo: "inventario",
    tipo: "confirmar",
    descripcion: "Ajusta el stock de varios productos de una vez (POST /api/inventory-movements, action=bulk-adjust), por ejemplo tras un conteo físico. Máx. 200 filas. Pide OK de Brandon.",
    entrada: {
      negocio,
      motivo: z.string().min(3).max(300).describe("Motivo de todo el lote, ej. «Conteo físico 2026-10-29»"),
      items: z.array(z.object({ productoId: z.number().int().positive(), stockNuevo: z.number().min(0), nota: z.string().max(300).optional() })).min(1).max(200),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/inventory-movements", cuerpo: { action: "bulk-adjust", motivo: a.motivo, items: a.items.map((i) => limpiar({ productId: i.productoId, newStock: i.stockNuevo, notes: i.nota })) } }),
    // Los 10 primeros se leen del panel (nombre y stock de hoy) para mostrar «producto: antes → después».
    previa: (a, leer) => Promise.all(a.items.slice(0, MUESTRA_LOTE).map((i) => productoPorId(i.productoId, leer))),
    resumen: (a, previa) => {
      const fichas = Array.isArray(previa) ? previa : [];
      const lineas = a.items.slice(0, MUESTRA_LOTE).map((i, k) => {
        const p = /** @type {any} */ (fichas[k]);
        const antes = stockDe(p);
        return `- ${p?.name ? linea60(p.name) : `${NO_VERIFICADO} (producto ${i.productoId})`}: ${antes === undefined ? "?" : unidades(antes)} → ${unidades(i.stockNuevo)}`;
      });
      const mas = a.items.length > MUESTRA_LOTE ? `\n… y ${a.items.length - MUESTRA_LOTE} más.` : "";
      return `Ajustar el stock de ${a.items.length} producto(s). Motivo: ${a.motivo}.\n${lineas.join("\n")}${mas}`;
    },
    ventana: (a) => ({ clave: claveCantidad(a.items.length, { etiqueta: "Productos a ajustar" }), filas: [{ etiqueta: "Motivo", valor: a.motivo }] }),
  },
  {
    nombre: "stock_movimiento",
    grupo: "inventario",
    tipo: "confirmar",
    descripcion: "Registra un movimiento de stock (entrada, salida, merma…) de un producto (POST /api/inventory-movements). La cantidad es un entero positivo en unidades. Pide OK de Brandon.",
    entrada: {
      negocio,
      productoId: z.number().int().positive().describe("Id del producto: el nombre del aviso lo saca el panel"),
      tipo: z.string().min(1).max(50).describe("Tipo de movimiento del panel (ej. entrada, salida, merma, ajuste_positivo, ajuste_negativo)"),
      cantidad: z.number().int().positive(),
      motivo: z.string().max(300).optional().describe("Obligatorio en ajuste_positivo / ajuste_negativo"),
      referencia: z.string().max(100).optional(),
      almacenId: z.string().max(60).optional(),
    },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/inventory-movements", cuerpo: limpiar({ productId: a.productoId, type: a.tipo, quantity: a.cantidad, notes: a.motivo, reference: a.referencia, warehouseId: a.almacenId }) }),
    previa: (a, leer) => productoPorId(a.productoId, leer),
    resumen: (a, previa) => {
      const antes = stockDe(previa);
      return `Movimiento de stock «${linea60(a.tipo, 50)}» de ${unidades(a.cantidad)} de ${verificado(/** @type {any} */ (previa)?.name)}${antes === undefined ? "" : ` (hoy tiene ${unidades(antes)})`}${a.motivo ? `. Motivo: ${a.motivo}` : ""}.`;
    },
    ventana: (a, previa) => ({
      clave: claveCantidad(a.cantidad, { etiqueta: "Cantidad", unidad: "u" }),
      filas: [{ etiqueta: "Producto", valor: verificado(/** @type {any} */ (previa)?.name) }, { etiqueta: "Movimiento", valor: a.tipo }],
    }),
  },
  {
    nombre: "conteo_iniciar",
    grupo: "inventario",
    tipo: "confirmar",
    descripcion: "Inicia un conteo físico de inventario (POST /api/inventory/conteo): bloquea los movimientos de stock mientras dura. Pide OK de Brandon.",
    entrada: { negocio, tipo: z.enum(["completo", "categoria", "ubicacion"]).default("completo"), categoria: z.string().max(100).optional() },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/inventory/conteo", cuerpo: limpiar({ tipo: a.tipo ?? "completo", categoria: a.categoria }) }),
    resumen: (a) => `Iniciar un conteo físico ${a.tipo === "categoria" ? `de la categoría ${a.categoria ?? "(sin indicar)"}` : a.tipo === "ubicacion" ? "por ubicación" : "completo"}. Mientras dure se bloquean los movimientos de stock.`,
  },
];
