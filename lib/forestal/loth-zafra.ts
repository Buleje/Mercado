/**
 * loth-zafra — el CRONOGRAMA del aprovechamiento: la vigencia del plan es una
 * ventana con fecha de cierre, y la pregunta que nadie tenía contestada era
 * "¿llego con los tiempos?".
 *
 * Cruza tres cosas que ya existen — el volumen autorizado del POA, lo movilizado
 * hasta hoy y la vigencia del plan — y devuelve el ritmo real, el ritmo que haría
 * falta y la proyección al cierre. Sin eso, un titular descubre en el último mes
 * que le sobran 300 m³ que ya no puede sacar (el saldo se pierde: la autorización
 * vence, no se acumula).
 *
 * PURO y client-safe. `hoy` SIEMPRE entra por parámetro: sin `Date.now` adentro,
 * para que el cálculo sea testeable y determinístico.
 */

export type ZafraEstado = "sin_vigencia" | "no_iniciada" | "adelantado" | "en_ritmo" | "atrasado" | "vencida";

export interface ZafraInput {
  vigenciaDesde: string | Date | null;
  vigenciaHasta: string | Date | null;
  /** Volumen autorizado por el plan (m³). */
  autorizadoM3: number;
  /** Volumen ya movilizado (m³) — sale del balance de extracción. */
  movilizadoM3: number;
  /** Fecha de referencia (hoy). Entra por parámetro a propósito. */
  hoy: Date;
}

export interface ZafraMes {
  /** "2026-03". */
  periodo: string;
  label: string;
  /** Meta acumulada al cierre de ese mes, con reparto lineal (m³). */
  metaAcumuladaM3: number;
  /** Meta del mes solo (m³). */
  metaMesM3: number;
  /** El mes ya pasó respecto de `hoy`. */
  transcurrido: boolean;
  /** El mes en curso. */
  actual: boolean;
}

export interface ZafraAnalisis {
  estado: ZafraEstado;
  diasTotales: number;
  diasTranscurridos: number;
  diasRestantes: number;
  /** % del tiempo de la zafra ya consumido. */
  avanceTiempoPct: number;
  /** % del volumen autorizado ya movilizado. */
  avanceVolumenPct: number;
  /** Diferencia (volumen − tiempo): positivo = adelantado. */
  desfasePct: number;
  saldoM3: number;
  /** Ritmo logrado hasta hoy (m³/día). */
  ritmoActualM3Dia: number;
  /** Ritmo necesario para movilizar el saldo antes del cierre (m³/día). */
  ritmoRequeridoM3Dia: number;
  /** Proyección al cierre si se mantiene el ritmo actual (m³). */
  proyeccionCierreM3: number;
  /** m³ que quedarían sin movilizar al vencer (la autorización no se acumula). */
  riesgoNoMovilizadoM3: number;
  meses: ZafraMes[];
  mensaje: string;
}

const DIA_MS = 86_400_000;

const aFecha = (v: string | Date | null): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const round = (n: number, d = 2): number => Number(n.toFixed(d));
const clampPct = (n: number): number => Math.max(0, Math.min(999, round(n, 1)));

/** Días calendario entre dos fechas (mínimo 1: una zafra de un día es un día). */
const dias = (a: Date, b: Date): number => Math.max(1, Math.round((b.getTime() - a.getTime()) / DIA_MS));

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Reparto lineal de la meta por mes dentro de la vigencia. */
function construirMeses(desde: Date, hasta: Date, autorizadoM3: number, hoy: Date): ZafraMes[] {
  const meses: ZafraMes[] = [];
  const total = dias(desde, hasta);
  const cursor = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1));
  const hoyMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));

  let acumDias = 0;
  while (cursor <= fin && meses.length < 60) {
    const inicioMes = new Date(Math.max(cursor.getTime(), desde.getTime()));
    const finMesReal = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59));
    const finMes = new Date(Math.min(finMesReal.getTime(), hasta.getTime()));
    const diasMes = Math.max(0, Math.round((finMes.getTime() - inicioMes.getTime()) / DIA_MS) + (meses.length === 0 ? 1 : 0));
    acumDias += diasMes;

    const metaAcumuladaM3 = round((autorizadoM3 * Math.min(acumDias, total)) / total, 3);
    const previa = meses.length > 0 ? meses[meses.length - 1].metaAcumuladaM3 : 0;
    meses.push({
      periodo: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
      label: `${MESES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      metaAcumuladaM3,
      metaMesM3: round(metaAcumuladaM3 - previa, 3),
      transcurrido: cursor < hoyMes,
      actual: cursor.getTime() === hoyMes.getTime(),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return meses;
}

/**
 * Estado de la zafra. Los umbrales: ±10 puntos porcentuales entre el avance de
 * volumen y el del tiempo — debajo de eso el aprovechamiento va "en ritmo".
 */
export function analizarZafra(input: ZafraInput): ZafraAnalisis {
  const desde = aFecha(input.vigenciaDesde);
  const hasta = aFecha(input.vigenciaHasta);
  const autorizadoM3 = Math.max(0, Number(input.autorizadoM3) || 0);
  const movilizadoM3 = Math.max(0, Number(input.movilizadoM3) || 0);
  const saldoM3 = round(Math.max(0, autorizadoM3 - movilizadoM3), 4);
  const avanceVolumenPct = autorizadoM3 > 0 ? clampPct((movilizadoM3 / autorizadoM3) * 100) : 0;

  const vacio: ZafraAnalisis = {
    estado: "sin_vigencia",
    diasTotales: 0,
    diasTranscurridos: 0,
    diasRestantes: 0,
    avanceTiempoPct: 0,
    avanceVolumenPct,
    desfasePct: 0,
    saldoM3,
    ritmoActualM3Dia: 0,
    ritmoRequeridoM3Dia: 0,
    proyeccionCierreM3: movilizadoM3,
    riesgoNoMovilizadoM3: saldoM3,
    meses: [],
    mensaje: "Cargá la vigencia del plan (desde / hasta) para planificar la zafra.",
  };
  if (!desde || !hasta || hasta <= desde) return vacio;

  const diasTotales = dias(desde, hasta);
  const hoy = input.hoy;

  if (hoy < desde) {
    return {
      ...vacio,
      estado: "no_iniciada",
      diasTotales,
      diasRestantes: diasTotales,
      ritmoRequeridoM3Dia: round(saldoM3 / diasTotales, 4),
      meses: construirMeses(desde, hasta, autorizadoM3, hoy),
      mensaje: `La zafra arranca el ${desde.toISOString().slice(0, 10)}: ${diasTotales} días para movilizar ${autorizadoM3.toFixed(2)} m³.`,
    };
  }

  const vencida = hoy > hasta;
  const diasTranscurridos = Math.min(diasTotales, dias(desde, hoy));
  const diasRestantes = Math.max(0, diasTotales - diasTranscurridos);
  const avanceTiempoPct = clampPct((diasTranscurridos / diasTotales) * 100);
  const ritmoActualM3Dia = round(movilizadoM3 / diasTranscurridos, 4);
  const ritmoRequeridoM3Dia = diasRestantes > 0 ? round(saldoM3 / diasRestantes, 4) : 0;
  const proyeccionCierreM3 = round(Math.min(autorizadoM3, movilizadoM3 + ritmoActualM3Dia * diasRestantes), 3);
  const riesgoNoMovilizadoM3 = round(Math.max(0, autorizadoM3 - proyeccionCierreM3), 3);
  const desfasePct = round(avanceVolumenPct - avanceTiempoPct, 1);

  const estado: ZafraEstado = vencida ? "vencida" : desfasePct >= 10 ? "adelantado" : desfasePct <= -10 ? "atrasado" : "en_ritmo";

  const mensaje = vencida
    ? saldoM3 > 0
      ? `La vigencia venció y quedaron ${saldoM3.toFixed(2)} m³ sin movilizar: la autorización no se acumula al período siguiente.`
      : "Zafra cerrada: se movilizó todo lo autorizado dentro de la vigencia."
    : estado === "atrasado"
      ? `Vas ${Math.abs(desfasePct).toFixed(1)} puntos por debajo del tiempo consumido. Para no perder saldo hacen falta ${ritmoRequeridoM3Dia.toFixed(3)} m³/día en los ${diasRestantes} días que quedan (venís a ${ritmoActualM3Dia.toFixed(3)}).`
      : estado === "adelantado"
        ? `Vas ${desfasePct.toFixed(1)} puntos por encima del tiempo consumido: a este ritmo cerrás antes de que venza la vigencia.`
        : `En ritmo: ${avanceVolumenPct.toFixed(1)}% del volumen con ${avanceTiempoPct.toFixed(1)}% del tiempo consumido.`;

  return {
    estado,
    diasTotales,
    diasTranscurridos,
    diasRestantes,
    avanceTiempoPct,
    avanceVolumenPct,
    desfasePct,
    saldoM3,
    ritmoActualM3Dia,
    ritmoRequeridoM3Dia,
    proyeccionCierreM3,
    riesgoNoMovilizadoM3,
    meses: construirMeses(desde, hasta, autorizadoM3, hoy),
    mensaje,
  };
}

export const ZAFRA_ESTADO_LABEL: Record<ZafraEstado, string> = {
  sin_vigencia: "Sin vigencia cargada",
  no_iniciada: "Aún no arranca",
  adelantado: "Adelantado",
  en_ritmo: "En ritmo",
  atrasado: "Atrasado",
  vencida: "Vigencia vencida",
};

export const ZAFRA_ESTADO_TONE: Record<ZafraEstado, "success" | "warning" | "error" | "info"> = {
  sin_vigencia: "info",
  no_iniciada: "info",
  adelantado: "success",
  en_ritmo: "success",
  atrasado: "warning",
  vencida: "error",
};
