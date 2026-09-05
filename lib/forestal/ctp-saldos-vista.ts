/**
 * Qué mostrar en la pantalla de Saldos.
 *
 * El endpoint devuelve el saldo por especie y por producto, pero en crudo: 40
 * especies en una tabla no responden la pregunta que el dueño del aserradero
 * trae cuando abre la pantalla — «¿cuánta madera tengo y de qué?».
 *
 * Acá se calcula lo que sí la responde: cuánto hay de cada lado, qué especies
 * concentran el volumen, cuáles están por agotarse y cuáles quedaron en
 * negativo. Todo derivado de los mismos números; nada que se guarde aparte.
 *
 * PURO: recibe lo que ya trae el endpoint y devuelve lo que dibuja la pantalla.
 */

export type SaldoEspecie = {
  especie: string;
  scientific?: string | null;
  cites?: boolean;
  ingresoM3: number;
  consumidoM3: number;
  saldoM3: number;
  pendienteM3?: number;
  ingresosCount?: number;
  /** Trozas de esta especie que hoy se pueden mandar a la sierra. */
  piezasDisponibles?: number;
};

export type SaldoProducto = {
  producto: string;
  producido: number;
  despachado: number;
  stock: number;
  /** Piezas producidas menos despachadas, mismo criterio que `stock`. */
  piezasDisponibles?: number;
};

/** Una fila lista para la tabla y el gráfico, con su peso en el total. */
export type FilaDeSaldo = {
  nombre: string;
  detalle: string | null;
  disponible: number;
  /** Cuánto entró/se produjo: el denominador del consumo. */
  total: number;
  /** Qué porcentaje del disponible TOTAL representa esta fila. */
  pesoPct: number;
  /** Cuánto de lo que entró ya se usó. 100 = agotada. */
  usadoPct: number;
  cites: boolean;
  negativo: boolean;
  /**
   * Cuántas guías respaldan esta especie.
   *
   * Un volumen sin conteo no se puede planificar: 30 m³ en dos guías se mueven
   * distinto que 30 m³ repartidos en quince. Es la diferencia entre «traigo el
   * camión» y «hay que juntarlo primero».
   */
  guias: number;
  /** m³ promedio por guía. Da la escala de cada partida de un vistazo. */
  promedioPorGuia: number;
  /** Piezas disponibles hoy (trozas en rolliza, piezas de paquete en aserrada). */
  piezas: number;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

/**
 * Convierte el saldo por especie en filas para la vista de TROZAS.
 *
 * Ordena por disponible descendente: la pregunta «¿de qué tengo más?» se
 * responde mirando arriba, sin buscar.
 */
export function filasDeTrozas(especies: readonly SaldoEspecie[]): FilaDeSaldo[] {
  /* El total sólo cuenta lo positivo: si una especie está en −5 y otra en +10,
     el disponible real es 10, no 5. Un negativo es un error a corregir, no
     madera que descuente de otra especie. */
  const totalDisponible = especies.reduce((s, e) => s + Math.max(0, e.saldoM3), 0);
  return especies
    .map((e) => ({
      nombre: e.especie,
      detalle: e.scientific ?? null,
      disponible: r3(e.saldoM3),
      total: r3(e.ingresoM3),
      pesoPct: pct(Math.max(0, e.saldoM3), totalDisponible),
      usadoPct: e.ingresoM3 > 0 ? Math.min(100, Math.round((e.consumidoM3 / e.ingresoM3) * 1000) / 10) : 0,
      cites: Boolean(e.cites),
      negativo: e.saldoM3 < 0,
      guias: e.ingresosCount ?? 0,
      promedioPorGuia: e.ingresosCount ? r3(e.ingresoM3 / e.ingresosCount) : 0,
      piezas: e.piezasDisponibles ?? 0,
    }))
    .sort((a, b) => b.disponible - a.disponible);
}

/** Lo mismo para el depósito de ASERRADA. */
export function filasDeAserrada(productos: readonly SaldoProducto[]): FilaDeSaldo[] {
  const totalDisponible = productos.reduce((s, p) => s + Math.max(0, p.stock), 0);
  return productos
    .map((p) => ({
      nombre: p.producto,
      detalle: null,
      disponible: r3(p.stock),
      total: r3(p.producido),
      pesoPct: pct(Math.max(0, p.stock), totalDisponible),
      usadoPct: p.producido > 0 ? Math.min(100, Math.round((p.despachado / p.producido) * 1000) / 10) : 0,
      cites: false,
      negativo: p.stock < 0,
      /* El endpoint no dice de cuántas corridas salió cada producto: se deja en
         0 y la pantalla no lo muestra, en vez de inventar un conteo. */
      guias: 0,
      promedioPorGuia: 0,
      piezas: p.piezasDisponibles ?? 0,
    }))
    .sort((a, b) => b.disponible - a.disponible);
}

export type ResumenDeSaldo = {
  disponibleM3: number;
  /** Cuántas filas tienen algo. Las que están en cero no son inventario. */
  conStock: number;
  totalFilas: number;
  /** Las que quedaron debajo de cero: hay que corregirlas, no son stock. */
  enNegativo: number;
  /** Qué parte del total está en las 3 primeras. Alto = poca variedad. */
  concentracionTop3Pct: number;
  /** La que más pesa, para nombrarla sin buscar en la tabla. */
  principal: { nombre: string; disponible: number; pesoPct: number } | null;
  /** Con más del 90% usado: si se van a seguir vendiendo, hay que reponer. */
  porAgotarse: string[];
  /** Guías que respaldan todo lo disponible. 0 = el dato no vino. */
  guias: number;
  /** Piezas disponibles de todo lo que suma este resumen. */
  piezas: number;
};

export function resumir(filas: readonly FilaDeSaldo[]): ResumenDeSaldo {
  const positivas = filas.filter((f) => f.disponible > 0);
  const disponibleM3 = r3(positivas.reduce((s, f) => s + f.disponible, 0));
  const top3 = positivas.slice(0, 3).reduce((s, f) => s + f.disponible, 0);

  return {
    disponibleM3,
    conStock: positivas.length,
    totalFilas: filas.length,
    enNegativo: filas.filter((f) => f.negativo).length,
    concentracionTop3Pct: pct(top3, disponibleM3),
    principal: positivas[0]
      ? { nombre: positivas[0].nombre, disponible: positivas[0].disponible, pesoPct: positivas[0].pesoPct }
      : null,
    /* Con stock pero casi agotada: la que ya no tiene nada no es una alerta,
       es una especie que no se trabaja más. */
    porAgotarse: filas.filter((f) => f.disponible > 0 && f.usadoPct >= 90).map((f) => f.nombre),
    guias: positivas.reduce((s, f) => s + f.guias, 0),
    piezas: positivas.reduce((s, f) => s + f.piezas, 0),
  };
}

/**
 * Las filas del gráfico: las N más grandes y el resto agrupado.
 *
 * Sin agrupar, cuarenta especies dan cuarenta barras ilegibles; sin el «otras»,
 * el gráfico miente sobre cuánto queda afuera.
 */
export function paraGrafico(filas: readonly FilaDeSaldo[], tope = 8): { nombre: string; valor: number; pct: number }[] {
  const positivas = filas.filter((f) => f.disponible > 0);
  const total = positivas.reduce((s, f) => s + f.disponible, 0);
  if (positivas.length <= tope) {
    return positivas.map((f) => ({ nombre: f.nombre, valor: f.disponible, pct: f.pesoPct }));
  }
  const cabeza = positivas.slice(0, tope - 1);
  const resto = positivas.slice(tope - 1);
  const restoM3 = r3(resto.reduce((s, f) => s + f.disponible, 0));
  return [
    ...cabeza.map((f) => ({ nombre: f.nombre, valor: f.disponible, pct: f.pesoPct })),
    { nombre: `Otras ${resto.length}`, valor: restoM3, pct: pct(restoM3, total) },
  ];
}
