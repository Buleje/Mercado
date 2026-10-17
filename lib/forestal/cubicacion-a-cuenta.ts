/**
 * cubicacion-a-cuenta — lo que el adelanto no cubre va a la CUENTA de la
 * persona, y la venta llena el valor de venta del despacho vacío (ADR-484).
 *
 * PURO y client-safe: el servidor lo usa dentro de la transacción de «aplicar»;
 * la pantalla, para la vista previa y la etiqueta de cada persona.
 *
 *   - La cuenta (`ForestCuentaMov`) guarda MOVIMIENTOS. Una cubicación que el
 *     adelanto cubre a medias deja DOS patas, como la venta de una guía
 *     (`ForestCuentaDB.anotarVentaDeGuia`): la madera entera y el cruce con lo
 *     adelantado. Su saldo cambia sólo en el resto; el resultado del negocio
 *     (ADR-451) lee la venta entera una vez por guía.
 *   - El valor de venta del despacho se llena sólo si TODAS sus líneas están
 *     vacías, repartido al céntimo; si ya tenía, no se pisa: se muestra la
 *     diferencia.
 */
import { formatCurrency } from "@/lib/currency";
import { claveEspecie } from "./loth-constants";
import type { ImputacionGuardada, LineaEspecie, SentidoCubicacion } from "./cubicacion-cuenta";

// ── Lo que se guarda en `imputacion` además de los adelantos ────────────────

/** Las patas de la cuenta forestal que dejó una cubicación aplicada. */
export interface CuentaDeCubicacion {
  tipo: "cuenta";
  parteId: string;
  parteNombre: string;
  /** Lo que el adelanto NO cubrió: lo único que mueve el saldo de su cuenta. */
  monto: number;
  volumen: number;
  /** venta → te debe (cargo) · compra → le debes (abono). */
  sentido: SentidoCubicacion;
  /** Los movimientos escritos (1 o 2): con estos ids se dan de baja al anular. */
  movIds: string[];
}

/** `sin_guia`: el despacho aún no tiene guía y la venta quedó en su cuenta; llenarlo la contaría dos veces en el resultado del negocio. */
export type EstadoValorVenta = "puesto" | "ya_tenia" | "incompleto" | "sin_reparto" | "mes_cerrado" | "otra_moneda" | "sin_guia";

/** Qué pasó con el valor de venta del despacho al aplicar una venta. */
export interface ValorVentaDeCubicacion {
  tipo: "valorVenta";
  estado: EstadoValorVenta;
  /** Las líneas que llenó, con cuánto (sólo `puesto`): al anular se vacían sólo si siguen así. */
  lineas: { despachoId: string; valor: number }[];
  /** Lo que el libro ya tenía (suma de las líneas con valor), o null. */
  previo: number | null;
  /** Total de la cubicación − lo que el libro ya tenía (sólo `ya_tenia`). */
  diferencia: number | null;
}

/** `imputacion` guardada → los adelantos (lo de siempre), la cuenta y el valor de venta. */
export function separarImputacion(v: unknown): {
  adelantos: ImputacionGuardada[] | null;
  cuenta: CuentaDeCubicacion | null;
  valorVenta: ValorVentaDeCubicacion | null;
} {
  if (!Array.isArray(v)) return { adelantos: null, cuenta: null, valorVenta: null };
  const adelantos: ImputacionGuardada[] = [];
  let cuenta: CuentaDeCubicacion | null = null;
  let valorVenta: ValorVentaDeCubicacion | null = null;
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const tipo = (x as { tipo?: unknown }).tipo;
    if (tipo === "cuenta") cuenta = x as CuentaDeCubicacion;
    else if (tipo === "valorVenta") valorVenta = x as ValorVentaDeCubicacion;
    else adelantos.push(x as ImputacionGuardada);
  }
  return { adelantos, cuenta, valorVenta };
}

// ── Las patas de la cuenta ──────────────────────────────────────────────────

export interface PataCuenta {
  tipo: "cargo" | "abono";
  concepto: "venta" | "madera" | "compensacion";
  monto: number;
  notas: string;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Las patas de una cubicación con resto a la cuenta.
 *   venta  → cargo `venta` por el total; si un adelanto RECIBIDO cubrió una parte, abono `compensacion` por esa parte.
 *   compra → abono `madera` por el total; si un adelanto DADO cubrió una parte, cargo `compensacion` por esa parte.
 * cargo − abono = el resto con su signo (venta: te debe; compra: le debes).
 */
export function patasDeCuenta(c: {
  sentido: SentidoCubicacion;
  total: number;
  resto: number;
  codigo: string;
  detalle: string;
  /** Códigos de los adelantos que cubrieron una parte. */
  adelantos: readonly string[];
}): PataCuenta[] {
  const cubierto = r2(c.total - c.resto);
  /* `detalle` ya nombra la cubicación («Madera · CUB-2026-0003 · 34 trozas · 2 140 PT»): el «CUB-» de la nota es lo que mira el freno de la cuenta. */
  const base = c.detalle.includes(c.codigo) ? c.detalle : `${c.codigo} · ${c.detalle}`;
  const cruce = `Cruce con ${c.adelantos.join(", ") || "su adelanto"} · ${c.codigo}`;
  if (c.sentido === "venta") {
    return [
      { tipo: "cargo", concepto: "venta", monto: r2(c.total), notas: base },
      ...(cubierto >= 0.01 ? [{ tipo: "abono" as const, concepto: "compensacion" as const, monto: cubierto, notas: `${cruce} (lo que te adelantó)` }] : []),
    ];
  }
  return [
    { tipo: "abono", concepto: "madera", monto: r2(c.total), notas: base },
    ...(cubierto >= 0.01 ? [{ tipo: "cargo" as const, concepto: "compensacion" as const, monto: cubierto, notas: `${cruce} (lo que le adelantaste)` }] : []),
  ];
}

/** «te debe S/ 400» (venta) · «le debes S/ 400» (compra): cómo queda el resto en su cuenta. */
export const restoEnPalabras = (sentido: SentidoCubicacion, monto: number): string =>
  `${sentido === "venta" ? "te debe" : "le debes"} ${formatCurrency(monto)}`;

/** Por qué no se puede dejar el resto en la cuenta: no tiene ficha en el directorio (o la cuenta forestal está apagada). */
export function mensajeSinCuenta(nombre: string | null, resto: number, motivo: "sin_parte" | "apagada"): string {
  const quien = nombre?.trim() || "Esta persona";
  return motivo === "apagada"
    ? `Lo que el adelanto no cubre (${formatCurrency(resto)}) va a la cuenta forestal, y no está habilitada en este negocio: no hay dónde dejarlo.`
    : `${quien} no tiene ficha en el Directorio forestal: lo que el adelanto no cubre (${formatCurrency(resto)}) no tiene cuenta donde quedar. Créale la ficha (o vincúlala en Cuenta por persona) y vuelve a aplicar.`;
}

// ── El valor de venta del despacho ──────────────────────────────────────────

export interface LineaDespachoValor {
  id: string;
  especie: string | null;
  cantidad: number | null;
  unidad: string | null;
  valorVenta: number | null;
  moneda: string | null;
}

const aCentimos = (n: number) => Math.round(Number((n * 100).toFixed(6)));

/** Parte `total` céntimos según `pesos`, por el mayor resto: la suma cierra exacta. */
export function partirCentimos(total: number, pesos: readonly number[]): number[] {
  const suma = pesos.reduce((t, p) => t + p, 0);
  if (pesos.length === 0) return [];
  if (!(suma > 0)) return partirCentimos(total, pesos.map(() => 1));
  const exactos = pesos.map((p) => (total * p) / suma);
  const base = exactos.map((x) => Math.floor(x + 1e-9));
  let resto = total - base.reduce((t, b) => t + b, 0);
  const orden = exactos.map((x, i) => [i, x - base[i]] as const).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (let k = 0; resto > 0; k++, resto--) base[orden[k % orden.length][0]] += 1;
  return base;
}

/**
 * Qué hacer con el valor de venta de las líneas del despacho al aplicar una
 * VENTA por `monto` (ADR-484):
 *   - todas vacías → se llenan: 1 línea = el total; varias = por especie si
 *     calzan una a una con la cubicación (y dentro de la especie por cantidad),
 *     si no por cantidad en la misma unidad; si no hay cómo, `sin_reparto`;
 *   - todas con valor → `ya_tenia` (no se pisa) con la diferencia;
 *   - algunas sí y otras no → `incompleto` (no se mezcla lo tuyo con lo calculado);
 *   - una línea en otra moneda → `otra_moneda`.
 */
export function repartirValorVenta(
  monto: number,
  lineas: readonly LineaDespachoValor[],
  porEspecie: readonly LineaEspecie[],
): Omit<ValorVentaDeCubicacion, "tipo"> {
  const nada = { lineas: [], previo: null, diferencia: null };
  if (lineas.length === 0 || !(monto > 0)) return { estado: "sin_reparto", ...nada };
  if (lineas.some((l) => (l.moneda ?? "PEN").toUpperCase() !== "PEN")) return { estado: "otra_moneda", ...nada };
  const conValor = lineas.filter((l) => l.valorVenta != null);
  if (conValor.length > 0) {
    const previo = r2(conValor.reduce((t, l) => t + Number(l.valorVenta), 0));
    return conValor.length === lineas.length
      ? { estado: "ya_tenia", lineas: [], previo, diferencia: r2(monto - previo) }
      : { estado: "incompleto", lineas: [], previo, diferencia: null };
  }
  const total = aCentimos(monto);
  const poner = (centimos: number[]) => ({
    estado: "puesto" as const,
    lineas: lineas.map((l, i) => ({ despachoId: l.id, valor: centimos[i] / 100 })),
    previo: null,
    diferencia: null,
  });
  if (lineas.length === 1) return poner([total]);

  const mismaUnidad = new Set(lineas.map((l) => (l.unidad ?? "").toLowerCase())).size === 1;
  const conCantidad = mismaUnidad && lineas.every((l) => l.cantidad != null && l.cantidad > 0);
  const pesoDe = (ls: readonly LineaDespachoValor[]) => (conCantidad ? ls.map((l) => Number(l.cantidad)) : ls.map(() => 1));

  /* Por especie: cada línea con una especie de la cubicación, y cada especie con al menos una línea. */
  const montoDe = new Map(porEspecie.filter((l) => l.monto != null && l.monto > 0).map((l) => [l.clave, aCentimos(Number(l.monto))]));
  const claves = lineas.map((l) => claveEspecie(l.especie ?? ""));
  const calza = claves.every((k) => k && montoDe.has(k)) && [...montoDe.keys()].every((k) => claves.includes(k));
  if (calza && [...montoDe.values()].reduce((t, c) => t + c, 0) === total) {
    const out = new Array<number>(lineas.length).fill(0);
    for (const [clave, centimos] of montoDe) {
      const idx = claves.flatMap((k, i) => (k === clave ? [i] : []));
      partirCentimos(centimos, pesoDe(idx.map((i) => lineas[i]))).forEach((c, j) => { out[idx[j]] = c; });
    }
    return poner(out);
  }
  if (conCantidad) return poner(partirCentimos(total, pesoDe(lineas)));
  return { estado: "sin_reparto", ...nada };
}

/** La línea de la pantalla para el valor de venta (null = no hay nada que decir). */
export function textoValorVenta(v: ValorVentaDeCubicacion | null, codigo: string): string | null {
  if (!v) return null;
  const total = r2(v.lineas.reduce((t, l) => t + l.valor, 0));
  switch (v.estado) {
    case "puesto":
      return `El valor de venta del despacho quedó en ${formatCurrency(total)}: salió de ${codigo}.`;
    case "ya_tenia":
      return v.diferencia != null && Math.abs(v.diferencia) >= 0.005
        ? `El despacho ya tenía su valor de venta (${formatCurrency(v.previo ?? 0)}): no se tocó. La cubicación da ${formatCurrency(Math.abs(v.diferencia))} ${v.diferencia > 0 ? "más" : "menos"}.`
        : `El despacho ya tenía su valor de venta (${formatCurrency(v.previo ?? 0)}), igual al de la cubicación.`;
    case "incompleto":
      return "Algunas líneas del despacho ya tenían valor de venta y otras no: no se llenó ninguna. Ponlo a mano en el despacho.";
    case "sin_reparto":
      return "No se pudo repartir el total entre las líneas del despacho: pon el valor de venta a mano.";
    case "mes_cerrado":
      return "El mes del despacho está cerrado: el valor de venta no se cambió.";
    case "otra_moneda":
      return "El despacho no está en soles: el valor de venta no se cambió.";
    case "sin_guia":
      return "El despacho todavía no tiene guía y la venta ya quedó en su cuenta: el valor de venta del despacho no se llenó, así no se cuenta dos veces.";
  }
}

// ── La persona en el selector ───────────────────────────────────────────────

export interface PersonaParaEtiqueta {
  nombre: string;
  beneficiarioId: string | null;
  /** `undefined` = tu rol no ve la plata: sólo el nombre. */
  adelantos?: { teDebe: number; abiertos: number; recibidoPendiente: number; recibidosAbiertos: number } | null;
  /** Saldo de su cuenta forestal (+ te debe, − le debes); `null` = sin ficha en el directorio. */
  cuenta?: number | null;
}

/**
 * «Wasaco · 2 adelantos · te debe S/ 1 200» en una compra; en una VENTA sólo
 * cuenta lo que ÉL te adelantó (RECIBIDO): lo que tú le diste no se descuenta
 * con madera que le vendes. Después, cómo está su cuenta forestal.
 */
export function etiquetaPersonaCubicacion(p: PersonaParaEtiqueta, sentido: SentidoCubicacion): string {
  if (p.adelantos === undefined) return p.nombre;
  const a = p.beneficiarioId ? p.adelantos : null;
  const lado =
    sentido === "venta"
      ? a && a.recibidosAbiertos > 0 && a.recibidoPendiente > 0 ? `te adelantó ${formatCurrency(a.recibidoPendiente)}` : null
      : a && a.abiertos > 0 && a.teDebe > 0 ? `${a.abiertos} ${a.abiertos === 1 ? "adelanto" : "adelantos"} · te debe ${formatCurrency(a.teDebe)}` : null;
  const cuenta =
    p.cuenta === undefined ? null
    : p.cuenta === null ? (lado ? null : "sin cuenta en el directorio")
    : Math.abs(p.cuenta) < 0.005 ? null
    : p.cuenta > 0 ? `en su cuenta te debe ${formatCurrency(p.cuenta)}`
    : `en su cuenta le debes ${formatCurrency(-p.cuenta)}`;
  return [p.nombre, lado ?? "sin adelanto", cuenta].filter(Boolean).join(" · ");
}
