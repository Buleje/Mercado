/**
 * Formato 13.1 «Registro de Inventario Permanente Valorizado» — libro de trabajo del mes.
 *
 * Una tabla plana (producto + movimiento) en vez de un bloque por existencia: se filtra y
 * se ordena en Excel. La cabecera por existencia del formato (código, tipo, descripción,
 * unidad, método de valuación) va como columnas a la izquierda.
 *
 * Costo: el movimiento de inventario NO guarda costo. Se toma solo donde el sistema lo
 * anotó en otro lado: el costo de la línea de la venta del POS (`SaleItem.costPrice`, también
 * para su devolución), el del pedido online (`OrderItem.costPrice`) y el costo unitario de la
 * orden de compra (`PurchaseItem.unitCost`). El resto, y el costo del
 * saldo (necesita un método de valuación que el sistema no aplica), va VACÍO.
 */
import {
  AVISO_DE_TRABAJO,
  aCentimos,
  aSoles,
  fechaLima,
  sumarColumnas,
  textoSeguro,
  TITULO_FORMATO,
  type ColumnaLibro,
  type FilaLibro,
  type LibroContador,
} from "./comun";

export interface ProductoKardex {
  id: number;
  nombre: string;
  codigo: string | null;
  unidad: string;
}

export interface MovimientoKardex {
  id: string;
  productoId: number;
  /** compra, venta, venta_online, devolucion, ajuste_positivo, ajuste_negativo, merma */
  tipo: string;
  cantidad: number;
  stockAntes: number;
  stockDespues: number;
  referencia: string | null;
  fecha: Date;
  almacen: string | null;
  /** Costo unitario que el sistema anotó en la venta o en la compra; null = no hay. */
  costoUnitario: number | null;
  /** ¿Ese costo incluye IGV? Solo se sabe en las compras (`igvIncluded`). */
  costoConIgv: boolean | null;
}

export interface EntradaKardex {
  periodo: string;
  productos: ProductoKardex[];
  movimientos: MovimientoKardex[];
  /** Hubo más movimientos que el tope de lectura. */
  recortado: boolean;
}

/** Igual que `/api/inventory/kardex`: estos tipos suman stock; el resto lo resta. */
const ENTRADAS = new Set(["compra", "devolucion", "ajuste_positivo"]);

/** Tabla 12 (tipo de operación). Los ajustes y los conteos no tienen código propio: 99 «otros». */
const TABLA_12: Record<string, string> = {
  venta: "01",
  venta_online: "01",
  compra: "02",
  devolucion: "05",
  merma: "13",
  ajuste_positivo: "99",
  ajuste_negativo: "99",
};

const ROTULO_TIPO: Record<string, string> = {
  venta: "Venta POS",
  venta_online: "Venta online",
  compra: "Compra",
  devolucion: "Devolución de cliente",
  merma: "Merma",
  ajuste_positivo: "Ajuste (suma)",
  ajuste_negativo: "Ajuste (resta)",
};

/** Tabla 6 en su versión del anexo 2006; lo que no calza queda vacío. */
const TABLA_6: Array<[RegExp, string]> = [
  [/^(kg|kilo|kilos|kilogramos?)$/, "01"],
  [/^(g|gr|gramos?)$/, "06"],
  [/^(u|und|unid|unidad|unidades|uni|pza|pieza|piezas)$/, "07"],
  [/^(l|lt|lts|litros?)$/, "08"],
  [/^(gal|galon|galones|galón)$/, "09"],
  [/^(caja|cajas|cja)$/, "12"],
  [/^(m3|m³|metros? cubicos?|metros? cúbicos?)$/, "14"],
  [/^(m|metro|metros)$/, "15"],
];

export function unidadTabla6(unidad: string | null | undefined): string | null {
  const u = (unidad ?? "").trim().toLowerCase();
  for (const [re, cod] of TABLA_6) if (re.test(u)) return cod;
  return null;
}

const MONTOS = ["entCosto", "salCosto"] as const;

export const COLUMNAS_KARDEX: ColumnaLibro[] = [
  { clave: "codigo", rotulo: "Código de la existencia" },
  { clave: "tipoExistencia", rotulo: "Tipo de existencia (Tabla 5)" },
  { clave: "descripcion", rotulo: "Descripción de la existencia" },
  { clave: "unidad", rotulo: "Código de la unidad de medida (Tabla 6)" },
  { clave: "metodo", rotulo: "Método de valuación" },
  { clave: "fecha", rotulo: "Documento: fecha", numero: 1 },
  { clave: "docTipo", rotulo: "Documento: tipo (Tabla 10)", numero: 2 },
  { clave: "docSerie", rotulo: "Documento: serie", numero: 3 },
  { clave: "docNumero", rotulo: "Documento: número", numero: 4 },
  { clave: "operacion", rotulo: "Tipo de operación (Tabla 12)", numero: 5 },
  { clave: "entCant", rotulo: "Entradas: cantidad", numero: 6 },
  { clave: "entCu", rotulo: "Entradas: costo unitario", numero: 7, soles: true },
  { clave: "entCosto", rotulo: "Entradas: costo total", numero: 8, soles: true },
  { clave: "salCant", rotulo: "Salidas: cantidad", numero: 9 },
  { clave: "salCu", rotulo: "Salidas: costo unitario", numero: 10, soles: true },
  { clave: "salCosto", rotulo: "Salidas: costo total", numero: 11, soles: true },
  { clave: "saldoCant", rotulo: "Saldo final: cantidad", numero: 12 },
  { clave: "saldoCu", rotulo: "Saldo final: costo unitario", numero: 13, soles: true },
  { clave: "saldoCosto", rotulo: "Saldo final: costo total", numero: 14, soles: true },
  { clave: "movimiento", rotulo: "Movimiento en el sistema" },
  { clave: "unidadSistema", rotulo: "Unidad en el sistema" },
  { clave: "almacen", rotulo: "Almacén" },
  { clave: "costoConIgv", rotulo: "¿El costo incluye IGV?" },
];

function filaBase(p: ProductoKardex): FilaLibro {
  return {
    codigo: textoSeguro(p.codigo) ?? String(p.id),
    tipoExistencia: null,
    descripcion: textoSeguro(p.nombre),
    unidad: unidadTabla6(p.unidad),
    metodo: null,
    unidadSistema: p.unidad,
  };
}

export function armarKardexValorizado(e: EntradaKardex): LibroContador {
  const porProducto = new Map<number, MovimientoKardex[]>();
  for (const m of e.movimientos) {
    const lista = porProducto.get(m.productoId) ?? [];
    lista.push(m);
    porProducto.set(m.productoId, lista);
  }
  const productos = [...e.productos]
    .filter((p) => porProducto.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const filas: FilaLibro[] = [];
  let sinCosto = 0;
  let conCosto = 0;
  let sinEncadenar = 0;

  for (const p of productos) {
    const movs = (porProducto.get(p.id) ?? []).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const base = filaBase(p);
    const primero = movs[0];
    // Saldo inicial: el stock que había antes del primer movimiento del mes (dato guardado).
    filas.push({
      ...base,
      fecha: fechaLima(primero.fecha),
      operacion: "16",
      entCant: primero.stockAntes,
      saldoCant: primero.stockAntes,
      movimiento: "Saldo inicial",
    });
    let saldo = primero.stockAntes;
    for (const m of movs) {
      if (m.stockAntes !== saldo) sinEncadenar++;
      saldo = m.stockDespues;
      const entra = ENTRADAS.has(m.tipo);
      const cu = m.costoUnitario;
      const costo = cu === null ? null : aSoles(aCentimos(cu * m.cantidad));
      if (cu === null) sinCosto++;
      else conCosto++;
      filas.push({
        ...base,
        fecha: fechaLima(m.fecha),
        docNumero: textoSeguro(m.referencia),
        operacion: TABLA_12[m.tipo] ?? "99",
        entCant: entra ? m.cantidad : null,
        entCu: entra ? cu : null,
        entCosto: entra ? costo : null,
        salCant: entra ? null : m.cantidad,
        salCu: entra ? null : cu,
        salCosto: entra ? null : costo,
        saldoCant: m.stockDespues,
        movimiento: ROTULO_TIPO[m.tipo] ?? m.tipo,
        almacen: textoSeguro(m.almacen),
        costoConIgv: m.costoConIgv === null ? null : m.costoConIgv ? "sí" : "no",
      });
    }
  }

  const notas = [
    AVISO_DE_TRABAJO,
    "Tabla plana: cada fila repite el producto (la cabecera del formato) para poder filtrar en Excel. El formato impreso pone un bloque por producto.",
    `Costo unitario: el movimiento de inventario no guarda costo. Se tomó el costo anotado en la venta (POS u online) o en la orden de compra (${conCosto} movimientos); ${sinCosto} quedan sin costo (ajustes, mermas, conteos o líneas sin costo anotado).`,
    "Costo unitario y costo total del saldo final van vacíos: el sistema no aplica un método de valuación (promedio ponderado o PEPS). Tu contador lo define y lo completa.",
    "Tipo de existencia (Tabla 5) y método de valuación van vacíos: el sistema no los registra. Si todo es mercadería para revender, el tipo es 01.",
    "Unidad (Tabla 6): código del anexo de 2006 (07 unidades, 01 kilogramos…). La unidad tal como está en el sistema va al final.",
    "Tipo de documento, serie y número: va el código del sistema (venta, orden de compra, conteo); el comprobante del movimiento no se guarda junto al inventario.",
    "Tipo de operación: ajustes y conteos físicos van como 99 «otros»; devoluciones de clientes, 05 «devolución recibida».",
    "Solo salen los productos que se movieron en el mes. Un producto sin movimientos no aparece: su saldo es el mismo con que cerró el mes anterior.",
    "La fila TOTALES es una suma de control: junta costos de compra (con o sin IGV, ver «¿El costo incluye IGV?») con costos de venta. No es el valor del inventario.",
  ];
  if (sinEncadenar > 0)
    notas.push(
      `${sinEncadenar} movimientos empiezan con un stock distinto del saldo que dejó el anterior (otro almacén, un ajuste directo o dos operaciones a la vez). El saldo de cada fila es el que el sistema anotó en ese momento: revísalos antes de valorizar.`,
    );
  if (e.recortado) notas.push("Atención: el mes tiene más movimientos de los que se pueden bajar de una vez; el libro está incompleto.");

  const completas = filas.map((f): FilaLibro => Object.fromEntries(COLUMNAS_KARDEX.map((c) => [c.clave, f[c.clave] ?? null])));

  return {
    libro: "kardex",
    ...TITULO_FORMATO.kardex,
    periodo: e.periodo,
    columnas: COLUMNAS_KARDEX,
    filas: completas,
    totales: sumarColumnas(completas, MONTOS),
    notas,
  };
}
