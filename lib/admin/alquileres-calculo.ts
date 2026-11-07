/**
 * alquileres-calculo — periodos, vencimientos y deuda de un alquiler (ADR-524).
 *
 * Puro y con test (`__tests__/alquileres-calculo.test.ts`). Lo usa el BACKEND
 * para armar `AlquilerResumen`; el cliente solo lo muestra. La plata se suma en
 * céntimos enteros: 0,1 + 0,2 no es 0,3 en float, y una deuda de 12 meses no
 * puede salir con un céntimo bailando.
 *
 * Modelo del plazo:
 *  - El periodo k empieza en `inicioEl + k meses` (con el día recortado al
 *    último del mes: un contrato del 31 de enero sigue el 28/29 de febrero).
 *  - Su etiqueta es «AAAA-MM» del mes de inicio + k.
 *  - El plazo tiene los periodos que empiezan ANTES de `finEl`: del 01-11-2026
 *    al 31-10-2027 son 12, y del 15-11-2026 al 14-11-2027 también 12.
 *  - Vence el día `diaPago` del mes del periodo (31 en febrero = último día);
 *    sin `diaPago`, el día del inicio. Nunca antes del inicio del contrato.
 */
import type {
  AlquilerResumen,
  Dia,
  EstadoAlquiler,
  Moneda,
  Monto,
  TipoAlertaAlquiler,
} from "@/lib/admin/fichas-tramites-alquileres";

export interface AlquilerParaCalculo {
  rentaMensual: Monto;
  moneda: Moneda;
  diaPago: number | null;
  inicioEl: Dia;
  finEl: Dia | null;
  estado: EstadoAlquiler;
  renovacionAutomatica: boolean;
  avisoNoRenovarDias: number | null;
  garantiaMonto: Monto | null;
  garantiaPagada: boolean | null;
  garantiaDevueltaEl: Dia | null;
}

export interface PagoParaCalculo {
  periodo: string;
  monto: Monto;
}

/** Días antes del fin desde los que se avisa «el contrato vence». */
export const DIAS_AVISO_FIN = 60;
/** Días antes de la fecha límite para avisar «no renovar». */
export const DIAS_AVISO_NO_RENOVAR = 30;
/** Sin fecha de fin, se acepta registrar hasta 12 meses por adelantado. */
export const MESES_ADELANTO_SIN_FIN = 12;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

// ── Plata ──────────────────────────────────────────────────────────────────

/** Monto con 2 decimales → céntimos enteros. */
export function aCentimos(monto: Monto): number {
  return Math.round(Number((monto * 100).toFixed(4)));
}

export function deCentimos(centimos: number): Monto {
  return centimos / 100;
}

/** «S/ 1,500.00» o «US$ 1,500.00» (miles con coma, como en el recibo). */
export function formatoMonto(centimos: number, moneda: Moneda): string {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(centimos);
  const entero = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const dec = String(abs % 100).padStart(2, "0");
  return `${signo}${moneda === "USD" ? "US$" : "S/"} ${entero}.${dec}`;
}

// ── Fechas (todo en UTC: son días de calendario, no instantes) ────────────

function partesDia(d: Dia): [number, number, number] {
  const m = DIA.exec(d);
  if (!m) throw new Error(`Día inválido: ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function partesPeriodo(p: string): [number, number] {
  const m = PERIODO.exec(p);
  if (!m) throw new Error(`Periodo inválido: ${p}`);
  return [Number(m[1]), Number(m[2])];
}

export function esPeriodo(p: string): boolean {
  return PERIODO.test(p);
}

export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function dia(anio: number, mes: number, d: number): Dia {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function periodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export function periodoDe(d: Dia): string {
  return d.slice(0, 7);
}

/** Corre un periodo «AAAA-MM» k meses (k puede ser negativo). */
export function sumarMeses(p: string, k: number): string {
  const [a, m] = partesPeriodo(p);
  const total = a * 12 + (m - 1) + k;
  return periodo(Math.floor(total / 12), (total % 12) + 1);
}

/** Meses de `desde` a `hasta` (0 si son el mismo; negativo si `hasta` es antes). */
export function mesesEntre(desde: string, hasta: string): number {
  const [a1, m1] = partesPeriodo(desde);
  const [a2, m2] = partesPeriodo(hasta);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** Periodos de `desde` a `hasta`, ambos incluidos («2026-11», «2026-12», «2027-01»). */
export function periodosEntre(desde: string, hasta: string): string[] {
  const n = mesesEntre(desde, hasta);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, k) => sumarMeses(desde, k));
}

/** Día en que vence un periodo: `diaPago` recortado al último día del mes (31 en febrero → 28/29). */
export function diaDeVencimiento(p: string, diaPago: number): Dia {
  const [a, m] = partesPeriodo(p);
  return dia(a, m, Math.min(Math.max(1, Math.trunc(diaPago)), ultimoDiaDelMes(a, m)));
}

function sumarMesesADia(d: Dia, k: number): Dia {
  const [a, m, dd] = partesDia(d);
  const [a2, m2] = partesPeriodo(sumarMeses(periodo(a, m), k));
  return dia(a2, m2, Math.min(dd, ultimoDiaDelMes(a2, m2)));
}

export function sumarDias(d: Dia, n: number): Dia {
  const [a, m, dd] = partesDia(d);
  return new Date(Date.UTC(a, m - 1, dd) + n * MS_DIA).toISOString().slice(0, 10);
}

/** Días de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diasEntre(desde: Dia, hasta: Dia): number {
  const [a1, m1, d1] = partesDia(desde);
  const [a2, m2, d2] = partesDia(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_DIA);
}

/** «octubre 2026». */
export function nombrePeriodo(p: string): string {
  const [a, m] = partesPeriodo(p);
  return `${MESES[m - 1]} ${a}`;
}

/** «31/10/2027». */
export function formatoDia(d: Dia): string {
  const [a, m, dd] = partesDia(d);
  return `${String(dd).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}

// ── Plazo ──────────────────────────────────────────────────────────────────

/**
 * Cantidad de periodos del plazo, o `null` si el contrato no tiene fin.
 * Mínimo 1: un contrato que empieza y termina el mismo día igual se paga.
 */
export function cantidadDePeriodos(inicioEl: Dia, finEl: Dia | null): number | null {
  if (!finEl) return null;
  if (finEl <= inicioEl) return 1;
  let k = 0;
  while (sumarMesesADia(inicioEl, k) < finEl) k++;
  return Math.max(1, k);
}

/** Último periodo del plazo, o `null` si no tiene fin. */
export function ultimoPeriodo(a: Pick<AlquilerParaCalculo, "inicioEl" | "finEl">): string | null {
  const n = cantidadDePeriodos(a.inicioEl, a.finEl);
  return n === null ? null : sumarMeses(periodoDe(a.inicioEl), n - 1);
}

/** Cuándo vence el pago de un periodo de ESTE alquiler (nunca antes del inicio). */
export function vencimientoDelPeriodo(a: Pick<AlquilerParaCalculo, "inicioEl" | "diaPago">, p: string): Dia {
  const venc = diaDeVencimiento(p, a.diaPago ?? partesDia(a.inicioEl)[2]);
  return venc < a.inicioEl ? a.inicioEl : venc;
}

/**
 * ¿Se puede registrar un pago para este periodo? Desde el mes del inicio hasta
 * el último del plazo; sin fin, hasta 12 meses por delante de hoy. Fuera de eso
 * es un error de tipeo (422 `periodo_fuera_de_plazo`).
 */
export function periodoEnPlazo(a: Pick<AlquilerParaCalculo, "inicioEl" | "finEl">, p: string, hoy: Dia): boolean {
  if (!esPeriodo(p)) return false;
  if (p < periodoDe(a.inicioEl)) return false;
  const tope = ultimoPeriodo(a) ?? sumarMeses(periodoDe(hoy), MESES_ADELANTO_SIN_FIN);
  return p <= tope;
}

// ── Resumen ────────────────────────────────────────────────────────────────

/**
 * Periodos que ya vencieron y no están pagados COMPLETOS (sin pago o con un
 * pago menor a la renta: R2). Solo cuentan los alquileres vigentes o
 * terminados (en negociación nadie debe nada); un terminado sin fecha de fin
 * solo cuenta los huecos hasta su último pago.
 */
function periodosAtrasados(
  a: AlquilerParaCalculo,
  completos: ReadonlySet<string>,
  conPago: ReadonlySet<string>,
  hoy: Dia,
): string[] {
  if (a.estado === "negociacion") return [];
  const primero = periodoDe(a.inicioEl);
  let ultimo = ultimoPeriodo(a);
  if (ultimo === null) {
    if (a.estado === "terminado") {
      const ordenados = [...conPago].sort();
      ultimo = ordenados.length ? (ordenados[ordenados.length - 1] ?? null) : null;
      if (ultimo === null) return [];
    } else {
      ultimo = periodoDe(hoy);
    }
  }
  const hasta = ultimo < periodoDe(hoy) ? ultimo : periodoDe(hoy);
  return periodosEntre(primero, hasta).filter((p) => !completos.has(p) && vencimientoDelPeriodo(a, p) < hoy);
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** «setiembre 2026, octubre 2026» o «setiembre 2026, octubre 2026 y 3 más». */
function listaDeMeses(periodos: readonly string[]): string {
  const meses = periodos.map(nombrePeriodo);
  return meses.length <= 3 ? meses.join(", ") : `${meses.slice(0, 2).join(", ")} y ${meses.length - 2} más`;
}

/** Céntimos pagados por mes (el único `(alquilerId, periodo)` deja uno, pero se suma igual). */
export function pagadoPorPeriodo(pagos: readonly PagoParaCalculo[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pagos) m.set(p.periodo, (m.get(p.periodo) ?? 0) + aCentimos(p.monto));
  return m;
}

/**
 * Aviso al registrar o corregir un pago cuyo monto no es la renta (R2): menos
 * = el mes queda «pagado en parte»; más = se avisa el exceso. null si es justo.
 */
export function avisoMontoDelPago(rentaMensual: Monto, monto: Monto, moneda: Moneda, periodo: string): string | null {
  const rentaC = aCentimos(rentaMensual);
  const montoC = aCentimos(monto);
  if (rentaC <= 0 || montoC === rentaC) return null;
  const mes = nombrePeriodo(periodo);
  if (montoC < rentaC) {
    return `El pago (${formatoMonto(montoC, moneda)}) es menor que la renta (${formatoMonto(rentaC, moneda)}): ${mes} queda pagado en parte y falta ${formatoMonto(rentaC - montoC, moneda)}. Si fue un error, corrige el monto.`;
  }
  return `El pago (${formatoMonto(montoC, moneda)}) es mayor que la renta (${formatoMonto(rentaC, moneda)}) por ${formatoMonto(montoC - rentaC, moneda)}. Revisa si era de otro mes.`;
}

function proximoSinPagar(a: AlquilerParaCalculo, pagados: ReadonlySet<string>, hoy: Dia): string | null {
  if (a.estado !== "vigente") return null;
  const ultimo = ultimoPeriodo(a);
  const desde = periodoDe(a.inicioEl) > periodoDe(hoy) ? periodoDe(a.inicioEl) : sumarMeses(periodoDe(hoy), -1);
  for (let k = 0; k <= 24; k++) {
    const p = sumarMeses(desde, k);
    if (ultimo !== null && p > ultimo) return null;
    if (!pagados.has(p) && vencimientoDelPeriodo(a, p) >= hoy) return p;
  }
  return null;
}

/**
 * Todo lo que la pantalla y la agenda necesitan saber de un alquiler. Lo arma
 * el backend en cada lectura (no se guarda): cambia con `hoy`.
 */
export function resumenAlquiler(a: AlquilerParaCalculo, pagos: readonly PagoParaCalculo[], hoy: Dia): AlquilerResumen {
  const rentaC = aCentimos(a.rentaMensual);
  const pagadoC = pagadoPorPeriodo(pagos);
  // Con algún pago (el mes no se vuelve a registrar: se corrige el que está).
  const conPago = new Set(pagadoC.keys());
  // Pagado COMPLETO = lo pagado del mes cubre la renta de hoy (R2/R3).
  const completos = new Set([...pagadoC].filter(([, c]) => c >= rentaC).map(([p]) => p));
  const totalPagadoC = pagos.reduce((s, p) => s + aCentimos(p.monto), 0);

  const atrasados = periodosAtrasados(a, completos, conPago, hoy);
  // Deuda = Σ (renta − lo pagado del mes), a la renta ACTUAL (R3: la UI lo dice).
  const deudaC = atrasados.reduce((s, p) => s + Math.max(0, rentaC - (pagadoC.get(p) ?? 0)), 0);
  const parciales = [...pagadoC]
    .filter(([, c]) => c > 0 && c < rentaC)
    .map(([periodo, c]) => ({ periodo, pagadoC: c, faltaC: rentaC - c }))
    .sort((x, y) => (x.periodo < y.periodo ? -1 : 1));
  const proximo = proximoSinPagar(a, conPago, hoy);
  const diasParaFin = a.finEl ? diasEntre(hoy, a.finEl) : null;
  const avisoNoRenovarEl =
    a.finEl && a.avisoNoRenovarDias !== null && a.avisoNoRenovarDias >= 0
      ? sumarDias(a.finEl, -a.avisoNoRenovarDias)
      : null;

  const alertas: AlquilerResumen["alertas"] = [];
  const alerta = (tipo: TipoAlertaAlquiler, texto: string, fecha: Dia) => alertas.push({ tipo, texto, fecha });

  // Meses vencidos SIN ningún pago (los pagados en parte van en su propia alerta).
  const sinPago = atrasados.filter((p) => !conPago.has(p));
  if (sinPago.length > 0) {
    alerta(
      "pago_atrasado",
      `Falta pagar ${sinPago.length === 1 ? "1 mes" : `${sinPago.length} meses`} (${listaDeMeses(sinPago)}): ${formatoMonto(sinPago.length * rentaC, a.moneda)}`,
      vencimientoDelPeriodo(a, sinPago[0] ?? periodoDe(hoy)),
    );
  }
  if (parciales.length > 0 && a.estado !== "negociacion") {
    const faltaC = parciales.reduce((s, x) => s + x.faltaC, 0);
    const primero = parciales[0];
    alerta(
      "pago_incompleto",
      parciales.length === 1 && primero
        ? `${mayuscula(nombrePeriodo(primero.periodo))} pagado en parte: falta ${formatoMonto(faltaC, a.moneda)}`
        : `${parciales.length} meses pagados en parte (${listaDeMeses(parciales.map((x) => x.periodo))}): falta ${formatoMonto(faltaC, a.moneda)}`,
      vencimientoDelPeriodo(a, primero?.periodo ?? periodoDe(hoy)),
    );
  }
  if (a.estado === "vigente" && a.finEl && diasParaFin !== null && diasParaFin <= DIAS_AVISO_FIN) {
    const renueva = a.renovacionAutomatica ? " (se renueva solo)" : "";
    alerta(
      "fin_cerca",
      diasParaFin >= 0
        ? `El contrato vence en ${diasParaFin === 1 ? "1 día" : `${diasParaFin} días`}, el ${formatoDia(a.finEl)}${renueva}`
        : `El contrato venció el ${formatoDia(a.finEl)} y sigue como vigente${renueva}`,
      a.finEl,
    );
  }
  if (a.estado === "vigente" && avisoNoRenovarEl) {
    const faltan = diasEntre(hoy, avisoNoRenovarEl);
    if (faltan >= 0 && faltan <= DIAS_AVISO_NO_RENOVAR) {
      alerta(
        "aviso_no_renovar",
        `Si no van a renovar, hay que avisar antes del ${formatoDia(avisoNoRenovarEl)}`,
        avisoNoRenovarEl,
      );
    }
  }
  const garantiaC = a.garantiaMonto !== null ? aCentimos(a.garantiaMonto) : 0;
  if (garantiaC > 0 && a.estado === "vigente" && a.garantiaPagada !== true) {
    alerta("garantia_pendiente", `Falta pagar la garantía: ${formatoMonto(garantiaC, a.moneda)}`, a.inicioEl);
  }
  if (garantiaC > 0 && a.estado === "terminado" && a.garantiaPagada === true && !a.garantiaDevueltaEl) {
    alerta(
      "garantia_pendiente",
      `Falta que devuelvan la garantía: ${formatoMonto(garantiaC, a.moneda)}`,
      a.finEl ?? hoy,
    );
  }
  alertas.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));

  return {
    periodosDelPlazo: cantidadDePeriodos(a.inicioEl, a.finEl),
    periodosPagados: completos.size,
    totalPagado: deCentimos(totalPagadoC),
    periodosAtrasados: atrasados,
    periodosParciales: parciales.map((x) => ({ periodo: x.periodo, pagado: deCentimos(x.pagadoC), falta: deCentimos(x.faltaC) })),
    deudaAtrasada: deCentimos(deudaC),
    proximoPeriodo: proximo,
    proximoVenceEl: proximo ? vencimientoDelPeriodo(a, proximo) : null,
    diasParaFin,
    avisoNoRenovarEl,
    alertas,
  };
}
