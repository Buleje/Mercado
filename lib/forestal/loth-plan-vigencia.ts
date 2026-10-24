/**
 * Vigencia del plan de manejo — cuánto le queda, no sólo entre qué fechas va.
 *
 * La cabecera mostraba «Vigencia 20 mar. 2026 → 20 mar. 2028» y «Estado
 * vigente» como dos datos sueltos. Los dos son ciertos y ninguno contesta lo
 * que importa: **cuánto falta para que venza**. Un PO que vence en tres semanas
 * y uno que vence en dos años se veían igual, y la diferencia es si hay que
 * empezar el trámite de renovación ahora o no.
 *
 * El estado declarado en la base manda sobre el cálculo: si alguien marcó el
 * plan como `cerrado` o `suspendido`, eso no se discute con una resta de
 * fechas. La cuenta sólo agrega información cuando el plan dice estar vigente.
 *
 * Fechas date-only: se comparan en UTC a propósito. A las 20:00 de Pucallpa el
 * UTC ya es del día siguiente, y un plan no vence doce horas antes por vivir en
 * la selva (ver regla `forestal-serfor`).
 */

export type NivelVigencia = "vigente" | "por_vencer" | "vencido" | "cerrado" | "suspendido" | "sin_fecha";

export interface EstadoVigencia {
  nivel: NivelVigencia;
  /** Días que faltan para el fin. Negativo si ya pasó. `null` sin fecha. */
  diasRestantes: number | null;
  /** Una línea para la pantalla, ya redactada. */
  texto: string;
  /** Para pintar: cómo de urgente es. */
  tono: "ok" | "warn" | "danger" | "neutral";
}

/** Un plan con menos de esto por delante ya necesita que alguien se ocupe. */
export const DIAS_AVISO_VENCIMIENTO = 90;

const DIA = 86_400_000;

/** Días enteros entre dos fechas, contando sólo el día calendario (UTC). */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((b - a) / DIA);
}

function plural(n: number, singular: string, prural: string): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? singular : prural}`;
}

/**
 * Traduce fechas + estado declarado a algo que se pueda leer de un vistazo.
 *
 * `estadoDeclarado` gana cuando dice algo distinto de «vigente»: cerrado y
 * suspendido son decisiones administrativas, no consecuencias del calendario.
 */
export function estadoVigencia(
  vigenciaHasta: string | Date | null | undefined,
  estadoDeclarado: string | null | undefined,
  hoy: Date = new Date(),
): EstadoVigencia {
  const declarado = (estadoDeclarado ?? "").trim().toLowerCase();

  if (declarado === "cerrado") {
    return { nivel: "cerrado", diasRestantes: null, texto: "Cerrado", tono: "neutral" };
  }
  if (declarado === "suspendido") {
    return { nivel: "suspendido", diasRestantes: null, texto: "Suspendido", tono: "danger" };
  }

  if (!vigenciaHasta) {
    // Sin fecha de fin no se puede decir «vigente» sin inventar: se dice que falta.
    return {
      nivel: "sin_fecha",
      diasRestantes: null,
      texto: declarado === "vencido" ? "Vencido" : "Sin fecha de vencimiento cargada",
      tono: declarado === "vencido" ? "danger" : "warn",
    };
  }

  const fin = new Date(vigenciaHasta);
  if (Number.isNaN(fin.getTime())) {
    return { nivel: "sin_fecha", diasRestantes: null, texto: "Fecha de vencimiento ilegible", tono: "warn" };
  }

  const dias = diasEntre(hoy, fin);

  if (dias < 0) {
    return {
      nivel: "vencido",
      diasRestantes: dias,
      texto: `Vencido hace ${plural(Math.abs(dias), "día", "días")}`,
      tono: "danger",
    };
  }
  if (dias === 0) {
    return { nivel: "por_vencer", diasRestantes: 0, texto: "Vence hoy", tono: "danger" };
  }
  if (dias <= DIAS_AVISO_VENCIMIENTO) {
    return {
      nivel: "por_vencer",
      diasRestantes: dias,
      texto: `Vence en ${plural(dias, "día", "días")}`,
      tono: "warn",
    };
  }

  // En DÍAS a propósito: el panel de Zafra de la misma pantalla ya dice
  // «quedan 546». Si acá dijera «1 año por delante», dos cifras contiguas
  // estarían contando lo mismo con distinta precisión, y el lector tendría que
  // decidir a cuál creerle.
  return {
    nivel: "vigente",
    diasRestantes: dias,
    texto: `Vigente · quedan ${plural(dias, "día", "días")}`,
    tono: "ok",
  };
}

/** Qué porcentaje del período ya transcurrió (para una barra). `null` si no se puede. */
export function avanceDelPeriodo(
  desde: string | Date | null | undefined,
  hasta: string | Date | null | undefined,
  hoy: Date = new Date(),
): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(desde);
  const b = new Date(hasta);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const total = diasEntre(a, b);
  if (total <= 0) return null;
  const corrido = diasEntre(a, hoy);
  return Math.min(100, Math.max(0, Math.round((corrido / total) * 100)));
}
