/**
 * lib/caja/saldo-esperado.ts — cuánto efectivo DEBERÍA haber en una caja.
 *
 *   esperado = apertura + (ventas + ingresos − egresos) EN EFECTIVO
 *
 * Es LA cuenta del arqueo: `CashRegistersDB.close()` la usa al cerrar y el
 * Resumen de Mi Plata la usa con la caja todavía ABIERTA — una sola función,
 * para que las dos pantallas no puedan dar números distintos.
 *
 * SÓLO EFECTIVO (F4, 3ª pasada de seguridad de ADR-448). El arqueo cuenta lo que
 * hay en el cajón. Antes se restaba como efectivo cualquier egreso: un adelanto
 * pagado por Yape «sacaba» plata del cajón que nunca salió de ahí, y el cierre
 * daba faltante por el monto exacto. Las ventas ya se contaban sólo en efectivo;
 * ahora ingresos y egresos siguen la misma regla. Lo que pasó por otro medio
 * (Yape, Plin, tarjeta, transferencia, fiado) no se pierde: `otrosMediosDeCaja`
 * lo desglosa para mostrarlo aparte (función separada a propósito: la forma de
 * `SaldoEsperado` es la que ya devuelve `/api/finanzas/caja-abierta`).
 *
 * Medido 2026-09-29 (tarde) en la base: de 49 ingresos/egresos, 4 son por Yape y
 * los 4 son de las cajas de PRUEBA de `main` (alta + anulación, neto 0); los 7
 * de Blas y los 6 de los demás negocios son en efectivo. Ningún cierre real
 * cambia de número con esta regla.
 *
 * Los movimientos `apertura`, `cierre` y `arqueo` no mueven plata: la apertura
 * ya está en `openingAmount` y el arqueo es un conteo, no una entrada.
 *
 * El medio se compara sin mayúsculas ni espacios; vacío = efectivo (el default
 * de la columna `CashMovement.method`).
 *
 * Medido 2026-09-28 en el negocio real: caja abierta desde el 11/06 con
 * 100 + 120 + 1 230 − 7 874 = −6 424. Tres adelantos pagados desde la caja
 * (3 642 + 3 217 + 1 000) sacaron más de lo que la caja tenía registrado: una
 * caja física no puede tener menos seis mil soles, así que el veredicto es
 * «imposible» (`veredictoArqueo`).
 *
 * PURO y client-safe.
 */

/**
 * Los medios con los que se anota un movimiento a mano en la caja (la ruta
 * `PATCH /api/cash-registers/[id]` los valida con esto): los mismos del alta
 * de un adelanto (`MetodoPago`). Las ventas traen además los del POS (fiado…).
 */
export const METODOS_DE_CAJA = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;

export interface MovimientoDeCaja {
  type: string;
  /** Vacío o ausente = efectivo (default de la columna). */
  method?: string | null;
  amount: number;
}

export interface MontosDeUnMedio {
  ventas: number;
  ingresos: number;
  egresos: number;
}

/** Lo que pasó por la caja en un medio que NO es el cajón. */
export interface OtrosMedios extends MontosDeUnMedio {
  /** El mismo desglose por medio (`yape`, `transferencia`, `fiado`…), para mostrarlo aparte. */
  porMetodo: Record<string, MontosDeUnMedio>;
}

export interface SaldoEsperado {
  apertura: number;
  ventasEfectivo: number;
  /** Ingresos EN EFECTIVO. */
  ingresos: number;
  /** Egresos EN EFECTIVO. */
  egresos: number;
  /** apertura + ventasEfectivo + ingresos − egresos: lo que se cuenta al cerrar. */
  esperado: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** El medio normalizado: `"Efectivo "` = `"efectivo"`; vacío = efectivo (default de la columna). */
export function medioDeMovimiento(method: string | null | undefined): string {
  const m = String(method ?? "").trim().toLowerCase();
  return m || "efectivo";
}

/** Qué suma cada tipo; `apertura`/`cierre`/`arqueo` y cualquier otro, nada. */
function campoDe(type: string): keyof MontosDeUnMedio | null {
  if (type === "venta") return "ventas";
  if (type === "ingreso") return "ingresos";
  if (type === "egreso") return "egresos";
  return null;
}

const cero = (): MontosDeUnMedio => ({ ventas: 0, ingresos: 0, egresos: 0 });

/**
 * Suma los movimientos que mueven plata, separando el efectivo del resto. El
 * desglose por medio va en un `Map`: el medio es texto libre del cuerpo de la
 * ruta de caja, y un `method: "__proto__"` en un objeto plano tocaría el
 * prototipo compartido del proceso.
 */
function sumarPorMedio(movimientos: ReadonlyArray<MovimientoDeCaja>) {
  const efectivo = cero();
  const otros = cero();
  const porMetodo = new Map<string, MontosDeUnMedio>();
  for (const m of movimientos) {
    const campo = campoDe(m.type);
    if (!campo) continue;
    const monto = num(m.amount);
    const medio = medioDeMovimiento(m.method);
    if (medio === "efectivo") {
      efectivo[campo] += monto;
      continue;
    }
    otros[campo] += monto;
    let fila = porMetodo.get(medio);
    if (!fila) porMetodo.set(medio, (fila = cero()));
    fila[campo] += monto;
  }
  return { efectivo, otros, porMetodo };
}

const redondear = (x: MontosDeUnMedio): MontosDeUnMedio => ({ ventas: r2(x.ventas), ingresos: r2(x.ingresos), egresos: r2(x.egresos) });

export function saldoEsperadoDeCaja(apertura: number, movimientos: ReadonlyArray<MovimientoDeCaja>): SaldoEsperado {
  const { efectivo } = sumarPorMedio(movimientos);
  const a = num(apertura);
  return {
    apertura: r2(a),
    ventasEfectivo: r2(efectivo.ventas),
    ingresos: r2(efectivo.ingresos),
    egresos: r2(efectivo.egresos),
    esperado: r2(a + efectivo.ventas + efectivo.ingresos - efectivo.egresos),
  };
}

/**
 * Lo que pasó por la caja en otro medio (Yape, transferencia, tarjeta, fiado…):
 * NO está en el cajón y no entra al esperado, pero se muestra aparte para que
 * el arqueo no «pierda» un adelanto pagado por Yape.
 */
export function otrosMediosDeCaja(movimientos: ReadonlyArray<MovimientoDeCaja>): OtrosMedios {
  const { otros, porMetodo } = sumarPorMedio(movimientos);
  return {
    ...redondear(otros),
    porMetodo: Object.fromEntries([...porMetodo].map(([k, v]) => [k, redondear(v)])),
  };
}

const NOMBRE_DEL_MEDIO = new Map<string, string>([
  ["yape", "Yape"],
  ["plin", "Plin"],
  ["tarjeta", "tarjeta"],
  ["transferencia", "transferencia"],
  ["fiado", "fiado"],
]);

/**
 * La línea aparte de la pantalla de caja y del correo de cierre:
 * «Por Yape/transferencia: entraron S/ 50.00 · salieron S/ 80.00 — no está en el cajón».
 *
 * Sólo ingresos y egresos: las ventas por otro medio ya tienen su renglón
 * («Ventas digital»). `null` si no hubo ninguno — no se muestra una línea en cero.
 * `formato` es el formateador de moneda de quien la muestra (pantalla y correo
 * usan el suyo; el número es el mismo).
 */
export function lineaFueraDelCajon(otros: OtrosMedios, formato: (n: number) => string): string | null {
  const medios = [...Object.entries(otros.porMetodo)]
    .filter(([, v]) => v.ingresos > 0 || v.egresos > 0)
    .map(([k]) => NOMBRE_DEL_MEDIO.get(k) ?? k);
  if (medios.length === 0) return null;
  const partes = [
    otros.ingresos > 0 ? `entraron ${formato(otros.ingresos)}` : null,
    otros.egresos > 0 ? `salieron ${formato(otros.egresos)}` : null,
  ].filter((x): x is string => x !== null);
  return `Por ${medios.join("/")}: ${partes.join(" · ")} — no está en el cajón`;
}
