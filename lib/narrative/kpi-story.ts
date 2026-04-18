/**
 * KPI Story Generator — ADR-067 Ola Q
 *
 * Convierte números fríos en narrativa accionable con jerga peruana.
 * Cada KPI + contexto genera UN hook emocional, UNA causa probable
 * y UN next action — personalizado por momento del día y día de semana.
 *
 * Research aplicado:
 *   - "Numbers need stories" — Executive Dashboard Design 2026
 *   - Jerga Pucallpa real — testimonials bodegueros 2026
 */

export interface KPIContext {
  value: number;
  previousValue?: number;
  /** Promedio histórico (últimas 4 semanas) */
  avgValue?: number;
  /** Mejor valor histórico */
  bestValue?: number;
  /** Unidad: "ventas", "pedidos", "clientes", "margen" */
  unit: string;
  /** Prefijo — ej "S/ " */
  prefix?: string;
  /** Nombre del dueño para personalización */
  ownerName?: string;
}

export interface KPIStory {
  /** Hook emocional corto (< 60 chars) */
  headline: string;
  /** Causa probable — qué está pasando */
  cause?: string;
  /** Next action contextual */
  nextAction?: string;
  /** Tono: "celebrate", "motivate", "alert", "neutral" */
  tone: "celebrate" | "motivate" | "alert" | "neutral";
}

const DAYS_OF_WEEK = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * Genera story para un KPI de VENTAS.
 */
export function ventasStory(ctx: KPIContext): KPIStory {
  const { value, previousValue, avgValue, bestValue } = ctx;
  const today = new Date();
  const dayName = DAYS_OF_WEEK[today.getDay()];
  const hour = today.getHours();

  // 1. Mejor día de la semana de siempre
  if (bestValue && value >= bestValue * 0.95 && value >= bestValue * 1) {
    return {
      headline: `Tu mejor ${dayName} del año 🎯`,
      cause: previousValue ? `+${((value - previousValue) / previousValue * 100).toFixed(0)}% vs ayer` : undefined,
      nextAction: "Anotá qué hiciste diferente — repetí el próximo.",
      tone: "celebrate",
    };
  }

  // 2. Subió fuerte vs ayer
  if (previousValue && value > previousValue * 1.2) {
    const delta = value - previousValue;
    return {
      headline: `Subiste ${ctx.prefix ?? ""}${delta.toLocaleString("es-PE", { maximumFractionDigits: 0 })} vs ayer`,
      cause: "Más clientes o tickets más altos.",
      nextAction: "Seguí con el mismo mix de productos en stock.",
      tone: "celebrate",
    };
  }

  // 3. Sobre promedio consistente
  if (avgValue && value > avgValue * 1.1) {
    return {
      headline: `Vas ${((value / avgValue - 1) * 100).toFixed(0)}% arriba del promedio`,
      cause: `El promedio de ${dayName}s es ${ctx.prefix ?? ""}${avgValue.toFixed(0)}.`,
      nextAction: "Ritmo bueno — proyectá para el mes.",
      tone: "celebrate",
    };
  }

  // 4. Bajó preocupante vs ayer
  if (previousValue && value < previousValue * 0.75) {
    const delta = previousValue - value;
    return {
      headline: `Caíste ${ctx.prefix ?? ""}${delta.toLocaleString("es-PE", { maximumFractionDigits: 0 })} vs ayer`,
      cause: "Puede ser día lento o falta de producto estrella.",
      nextAction: "Revisá stock crítico y creá promo flash de bebidas.",
      tone: "alert",
    };
  }

  // 5. Bajo promedio + sin hora todavía
  if (avgValue && value < avgValue * 0.6 && hour > 12) {
    return {
      headline: `Vas atrás del promedio — aún podés recuperar`,
      cause: `Necesitás ${ctx.prefix ?? ""}${(avgValue - value).toFixed(0)} más para igualar.`,
      nextAction: "Compartí tu catálogo por WhatsApp ahora.",
      tone: "motivate",
    };
  }

  // 6. Sin ventas después de mediodía
  if (value === 0 && hour > 11) {
    return {
      headline: "Sin ventas aún hoy",
      cause: "Los martes suelen arrancar lento. Esto es normal.",
      nextAction: "Mandá un mensaje a tus clientes frecuentes.",
      tone: "motivate",
    };
  }

  // 7. Arranque normal de día
  if (hour < 10 && value > 0) {
    return {
      headline: `Buen arranque — ${ctx.prefix ?? ""}${value.toLocaleString("es-PE", { maximumFractionDigits: 0 })} antes de las 10`,
      cause: "Los clientes de la mañana suelen ser los más recurrentes.",
      tone: "neutral",
    };
  }

  // Default — ritmo normal
  return {
    headline: previousValue
      ? `${value > previousValue ? "Subiste" : "Bajaste"} ${Math.abs(((value - previousValue) / previousValue) * 100).toFixed(0)}% vs ayer`
      : `${ctx.prefix ?? ""}${value.toLocaleString("es-PE", { maximumFractionDigits: 0 })} acumulado hoy`,
    tone: "neutral",
  };
}

/**
 * Story para PEDIDOS (conteo).
 */
export function pedidosStory(ctx: KPIContext): KPIStory {
  const { value, avgValue } = ctx;

  if (value === 0) {
    return {
      headline: "Sin pedidos todavía",
      cause: "Horario bajo o catálogo no difundido.",
      nextAction: "Compartí tu tienda por WhatsApp.",
      tone: "motivate",
    };
  }

  if (avgValue && value > avgValue * 1.3) {
    return {
      headline: `${value} pedidos — ${((value / avgValue - 1) * 100).toFixed(0)}% sobre lo normal`,
      cause: "Demanda alta — asegurá stock y delivery.",
      nextAction: "Activá modo 'preparación rápida' si tenés repartidores extra.",
      tone: "celebrate",
    };
  }

  if (value === 1) {
    return {
      headline: "1 pedido — tu primer cliente del día",
      nextAction: "Preparalo bien — los primeros compradores suelen volver.",
      tone: "neutral",
    };
  }

  return {
    headline: `${value} ${value === 1 ? "pedido" : "pedidos"} hoy`,
    tone: "neutral",
  };
}

/**
 * Story para CLIENTES (únicos).
 */
export function clientesStory(ctx: KPIContext): KPIStory {
  const { value, previousValue } = ctx;

  if (previousValue && value > previousValue * 1.5) {
    const newCount = value - previousValue;
    return {
      headline: `+${newCount} clientes nuevos hoy`,
      cause: "Buena visibilidad o recomendaciones.",
      nextAction: "Agregalos a tu lista WhatsApp para ofertas recurrentes.",
      tone: "celebrate",
    };
  }

  if (value > 50) {
    return {
      headline: `${value} clientes — día fuerte`,
      cause: "Alto tráfico — probablemente día de quincena o feriado.",
      tone: "celebrate",
    };
  }

  return {
    headline: `${value} ${value === 1 ? "cliente único" : "clientes únicos"}`,
    tone: "neutral",
  };
}

/**
 * Story general — detecta tipo por unit string.
 */
export function generateKPIStory(ctx: KPIContext): KPIStory {
  const unit = ctx.unit.toLowerCase();
  if (unit.includes("venta")) return ventasStory(ctx);
  if (unit.includes("pedido") || unit.includes("orden")) return pedidosStory(ctx);
  if (unit.includes("cliente")) return clientesStory(ctx);

  // Genérico
  return {
    headline: `${ctx.prefix ?? ""}${ctx.value.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`,
    tone: "neutral",
  };
}

/**
 * Projection mensual — "te faltan X para llegar a Y"
 */
export function projectionStory(
  current: number,
  target: number,
  dayOfMonth: number,
  prefix?: string,
): KPIStory {
  const daysTotal = 30;
  const daysLeft = daysTotal - dayOfMonth;
  const dailyPace = current / dayOfMonth;
  const projected = dailyPace * daysTotal;
  const gap = target - projected;

  if (projected >= target * 1.1) {
    return {
      headline: `Vas a romper tu meta — ${prefix ?? ""}${(projected - target).toFixed(0)} por encima`,
      cause: `Si seguís así, cerrás con ${prefix ?? ""}${projected.toFixed(0)}.`,
      nextAction: "Anotá qué funcionó este mes — replicá el formato.",
      tone: "celebrate",
    };
  }

  if (projected >= target) {
    return {
      headline: "Vas a llegar a tu meta",
      cause: `Llevás ${prefix ?? ""}${current.toFixed(0)} acumulado — ritmo bueno.`,
      tone: "celebrate",
    };
  }

  if (gap < target * 0.1 && daysLeft > 5) {
    return {
      headline: `Te faltan ${prefix ?? ""}${gap.toFixed(0)} — alcanzable`,
      cause: `Necesitás ${prefix ?? ""}${(gap / daysLeft).toFixed(0)} diarios los próximos ${daysLeft} días.`,
      nextAction: "Enfocate en tus productos con mejor margen.",
      tone: "motivate",
    };
  }

  return {
    headline: `Te faltan ${prefix ?? ""}${gap.toFixed(0)} para la meta`,
    cause: `Ritmo actual: ${prefix ?? ""}${dailyPace.toFixed(0)}/día. Necesitás ${prefix ?? ""}${((target - current) / daysLeft).toFixed(0)}/día.`,
    nextAction: "Evaluá subir precios de productos sin competencia local.",
    tone: "alert",
  };
}
