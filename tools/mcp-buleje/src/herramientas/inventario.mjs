// Grupo «inventario»: stock y kardex. Ajustar o mover stock pide OK.
import { z, negocio, dia, limpiar, lista, ficha, soles, numero, claveCantidad, claveMonto, claveNombre, fichaPorId, linea60, conMarca, antesDelPanel, verificado, NO_VERIFICADO } from "../util-herramientas.mjs";

/** Nombre y stock de hoy del producto, leídos del panel (nunca del modelo). */
const productoPorId = (id, leer) => fichaPorId(leer, `/api/products/${Number(id)}`, "product");
const stockDe = (p) => (p && Number.isFinite(Number(p.stock)) ? Number(p.stock) : undefined);
const unidades = (n) => `${numero(n, Number.isInteger(n) ? 0 : 2)} u`;
const MUESTRA_LOTE = 10;

// ── Carril C (29-10): ficha del producto (ver / crear / editar / borrar) ────────────────────────────
const num = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
const camposProducto = {
  category: z.string().min(1).max(100).describe("Categoría (ej. Abarrotes)"),
  price: z.number().positive().describe("Precio de venta en S/ (mayor que 0)"),
  unit: z.string().max(20).optional().describe("Unidad de venta (ej. und, kg)"),
  badge: z.string().max(50).optional().describe("Etiqueta corta (ej. Oferta)"),
  description: z.string().max(2000).optional(),
  stock: z.number().min(0).optional().describe("Unidades en stock"),
  stockMin: z.number().min(0).optional().describe("Aviso de stock bajo"),
  stockMax: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional().describe("Costo en S/"),
  barcode: z.string().max(100).optional().describe("Código de barras: lo tiene UN solo producto"),
  type: z.enum(["product", "service"]).optional(),
  brand: z.string().max(100).optional(),
  sku: z.string().max(60).optional(),
  taxType: z.enum(["gravado", "exonerado", "inafecto"]).optional(),
  notes: z.string().max(2000).optional(),
};

/** Una entrada por cambio pedido, con el «antes» leído del PANEL. `clave` solo en los de plata/stock (el primero manda). */
function cambiosProducto(a, p) {
  const ant = (v, f) => antesDelPanel(p, v, f);
  const txt = (v) => linea60(String(v));
  /** @type {{ etiqueta: string, valor: string, texto: string, clave?: any }[]} */
  const out = [];
  if (a.price !== undefined) { const v = `${ant(p?.price, (x) => soles(Number(x)))} → ${soles(a.price)}`; out.push({ etiqueta: "Precio", valor: v, texto: `precio ${v}`, clave: claveMonto(a.price, { etiqueta: "Precio nuevo" }) }); }
  if (a.costPrice !== undefined) { const v = `${ant(p?.costPrice, (x) => soles(Number(x)))} → ${a.costPrice === null ? "(quitar)" : soles(a.costPrice)}`; out.push({ etiqueta: "Costo", valor: v, texto: `costo ${v}`, clave: a.costPrice === null ? undefined : claveMonto(a.costPrice, { etiqueta: "Costo nuevo" }) }); }
  if (a.stock !== undefined) { const v = `${ant(stockDe(p), unidades)} → ${unidades(a.stock)}`; out.push({ etiqueta: "Stock", valor: v, texto: `stock ${v}${a.adjustReason ? ` (motivo: ${linea60(a.adjustReason, 80)})` : ""}`, clave: claveCantidad(a.stock, { etiqueta: "Stock nuevo", unidad: "u" }) }); }
  if (a.active !== undefined) out.push({ etiqueta: "En venta", valor: a.active ? "volver a ponerlo" : "sacarlo", texto: a.active ? "volver a ponerlo a la venta" : "sacarlo de la venta" });
  if (a.barcode !== undefined) { const v = `${ant(p?.barcode, txt)} → ${a.barcode ? txt(a.barcode) : "(quitar)"}`; out.push({ etiqueta: "Código de barras", valor: v, texto: `código de barras ${v}` }); }
  if (a.name !== undefined) { const v = `${ant(p?.name, txt)} → ${txt(a.name)}`; out.push({ etiqueta: "Nombre", valor: v, texto: `nombre ${v}` }); }
  if (a.unit !== undefined) { const v = `${ant(p?.unit, txt)} → ${txt(a.unit)}`; out.push({ etiqueta: "Unidad", valor: v, texto: `unidad ${v}` }); }
  return out;
}

/** @type {import("../tipos.mjs").DefHerramienta<any>[]} */
const herramientasProducto = [
  {
    nombre: "producto_ver",
    grupo: "inventario",
    tipo: "lectura",
    descripcion: "Ficha de un producto por id (GET /api/products/[id], admin o almacenero): nombre, categoría, precio y costo en S/, stock, código y si está activo. El id sale de stock_ver. Ej.: id=12.",
    entrada: { negocio, id: z.number().int().positive().describe("Id numérico del producto (stock_ver)") },
    pedido: (a) => ({ metodo: "GET", ruta: `/api/products/${a.id}` }),
    formatear: (d) => ficha(d, { titulo: "Producto", campos: [["Nombre", ["name"]], ["Categoría", ["category"]], ["Precio", ["price"], "s"], ["Costo", ["costPrice"], "s"], ["Stock", ["stock"], "n"], ["Stock mínimo", ["stockMin"], "n"], ["Unidad", ["unit"]], ["Código", ["barcode"]], ["Activo", ["active"]], ["Vence", ["expiryDate"]], ["Id", ["id"]]] }),
  },
  {
    nombre: "producto_crear",
    grupo: "inventario",
    tipo: "escritura",
    descripcion: "Crea un producto (POST /api/products, admin o almacenero): nombre, categoría y precio en S/ son obligatorios. Si trae stock inicial mayor que 0 pide OK de Brandon (suma inventario). Antes busca con stock_ver que no exista ya. Devuelve el producto con su id. Ej.: name=\"Arroz 1 kg\", category=\"Abarrotes\", price=4.5.",
    entrada: { negocio, name: z.string().min(1).max(150).describe("Nombre del producto"), ...camposProducto },
    pedido: (a) => ({ metodo: "POST", ruta: "/api/products", cuerpo: limpiar({ name: a.name, category: a.category, price: a.price, unit: a.unit, badge: a.badge, description: a.description, stock: a.stock, stockMin: a.stockMin, stockMax: a.stockMax, costPrice: a.costPrice, barcode: a.barcode, type: a.type, brand: a.brand, sku: a.sku, taxType: a.taxType, notes: a.notes }) }),
    confirmarSi: (a) => Number(a.stock ?? 0) > 0,
    resumen: (a) => `Crear el producto «${linea60(a.name)}» a ${soles(a.price)} con ${numero(Number(a.stock ?? 0), Number.isInteger(Number(a.stock)) ? 0 : 2)} u de stock inicial. Suma inventario.`,
    ventana: (a) => ({ clave: claveCantidad(Number(a.stock ?? 0), { etiqueta: "Stock inicial", unidad: "u" }), filas: [{ etiqueta: "Producto nuevo", valor: linea60(a.name) }, { etiqueta: "Precio", valor: soles(a.price) }] }),
  },
  {
    nombre: "producto_editar",
    grupo: "inventario",
    tipo: "escritura",
    descripcion: "Edita un producto (PATCH /api/products/[id], admin o almacenero): solo manda lo que cambia. Cambiar precio, costo, stock, activo/inactivo, nombre, código de barras o unidad pide OK de Brandon. Si cambias el stock a mano, adjustReason es obligatorio (≥3 letras). Montos en S/. Ej.: id=12, price=5.",
    entrada: {
      negocio,
      id: z.number().int().positive().describe("Id numérico del producto (stock_ver)"),
      name: z.string().min(1).max(150).optional(),
      ...Object.fromEntries(Object.entries(camposProducto).filter(([k]) => k !== "type").map(([k, v]) => [k, v.optional()])),
      costPrice: z.number().min(0).nullable().optional().describe("Costo en S/ (null lo quita)"),
      active: z.boolean().optional().describe("false = ocultarlo de la venta"),
      expiryDate: z.string().max(20).nullable().optional().describe("Vencimiento AAAA-MM-DD"),
      adjustReason: z.string().max(500).optional().describe("Por qué cambia el stock (≥3 letras)"),
      confirmarBajoPiso: z.boolean().optional().describe("true = guardar un precio por debajo del piso de rebajas"),
    },
    pedido: (a) => ({ metodo: "PATCH", ruta: `/api/products/${a.id}`, cuerpo: Object.fromEntries(Object.entries({ name: a.name, category: a.category, price: a.price, costPrice: a.costPrice, unit: a.unit, badge: a.badge, description: a.description, stock: a.stock, stockMin: a.stockMin, stockMax: a.stockMax, barcode: a.barcode, active: a.active, expiryDate: a.expiryDate, adjustReason: a.adjustReason, confirmarBajoPiso: a.confirmarBajoPiso, brand: a.brand, sku: a.sku, taxType: a.taxType, notes: a.notes }).filter(([, v]) => v !== undefined)) }),
    confirmarSi: (a) => a.price !== undefined || a.costPrice !== undefined || a.stock !== undefined || a.active !== undefined || a.barcode !== undefined || a.name !== undefined || a.unit !== undefined,
    previa: (a, leer) => productoPorId(a.id, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const cambios = cambiosProducto(a, p).map((c) => c.texto);
      const otros = ["category", "badge", "description", "stockMin", "stockMax", "expiryDate", "brand", "sku", "taxType", "notes"].filter((k) => a[k] !== undefined);
      return `Editar el producto «${verificado(p?.name)}»: ${cambios.length ? cambios.join("; ") : "sin cambios de plata ni stock"}.${otros.length ? ` También cambia: ${otros.join(", ")}.` : ""}`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      const cs = cambiosProducto(a, p);
      const principal = cs.find((c) => c.clave);
      const clave = principal ? principal.clave : p?.name ? claveNombre(p.name, [], { etiqueta: "Producto" }) : null;
      return { clave, filas: [{ etiqueta: "Producto (hoy)", valor: verificado(p?.name) }, ...cs.map((c) => ({ etiqueta: c.etiqueta, valor: c.valor }))] };
    },
  },
  {
    nombre: "producto_borrar",
    grupo: "inventario",
    tipo: "confirmar",
    descripcion: "Borra un producto del catálogo (DELETE /api/products/[id], admin o almacenero). Es definitivo para el panel. Pide OK de Brandon; el nombre y el stock del aviso los saca el panel.",
    entrada: { negocio, id: z.number().int().positive().describe("Id numérico del producto (stock_ver)") },
    pedido: (a) => ({ metodo: "DELETE", ruta: `/api/products/${a.id}` }),
    previa: (a, leer) => productoPorId(a.id, leer),
    resumen: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return `Borrar el producto «${verificado(p?.name)}»${stockDe(p) === undefined ? "" : ` (tiene ${unidades(stockDe(p))} en stock)`}. Sale del catálogo y de la venta.`;
    },
    ventana: (a, previa) => {
      const p = /** @type {any} */ (previa);
      return { clave: p?.name ? claveNombre(p.name, [], { etiqueta: "Producto", palabra: "nombre" }) : null, filas: [{ etiqueta: "Stock hoy", valor: stockDe(p) === undefined ? "no se pudo leer" : unidades(stockDe(p)) }, { etiqueta: "Precio", valor: num(p?.price) === undefined ? "no se pudo leer" : soles(num(p?.price)) }] };
    },
  },
];

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
      cols: [["Producto", ["name", "nombre", "productName"]], ["Stock", ["stock", "currentStock", "quantity"], "n"], ["Mínimo", ["minStock", "stockMinimo"], "n"], ["Precio", ["price", "precio"], "s"], ["Vence", ["expiryDate", "fechaVencimiento"], "f"], ["Movimiento", ["type", "tipo"]], ["Id", ["id"]]],
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
  ...herramientasProducto,
];
