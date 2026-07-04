import type { VitalGrade } from "@/hooks/use-web-vitals";

/**
 * Consejo accionable para el bodeguero, en lenguaje llano, según la métrica
 * más floja. Prioridad LCP > INP > CLS (impacto percibido). Devuelve null si
 * todo está bien o no hay datos.
 */

export interface PerfAdvice {
  metric: "lcp" | "inp" | "cls";
  title: string;
  body: string;
}

const ADVICE: Record<PerfAdvice["metric"], Omit<PerfAdvice, "metric">> = {
  lcp: {
    title: "Tu tienda tarda en mostrar lo importante",
    body: "Suele ser por imágenes pesadas. Comprimí las fotos del banner y de los productos más vistos (subilas en buena calidad pero livianas). Si tenés muchos productos, activá el caché rápido (Redis) para que el catálogo cargue al instante.",
  },
  inp: {
    title: "La tienda tarda en reaccionar cuando tocan",
    body: "Suele venir de scripts de terceros (píxeles de publicidad, chats externos). Revisá cuáles tenés activos y quitá los que no usás — cada uno le suma peso a cada toque.",
  },
  cls: {
    title: "La página 'salta' mientras carga",
    body: "Pasa cuando las imágenes o banners empujan el contenido al aparecer. Asegurate de que cada foto tenga su espacio reservado (tamaño fijo) para que nada se mueva de golpe.",
  },
};

/** Orden de prioridad: la primera métrica no-buena manda. */
const PRIORITY: PerfAdvice["metric"][] = ["lcp", "inp", "cls"];

export function pickAdvice(
  grades: Partial<Record<"lcp" | "inp" | "cls", VitalGrade>>,
): PerfAdvice | null {
  // Primero las pobres, después las regulares.
  for (const wanted of ["pobre", "regular"] as const) {
    for (const metric of PRIORITY) {
      if (grades[metric] === wanted) {
        return { metric, ...ADVICE[metric] };
      }
    }
  }
  return null;
}
