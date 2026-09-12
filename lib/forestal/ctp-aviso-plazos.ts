/**
 * ctp-aviso-plazos — a quién hay que avisarle HOY, antes de que se pase el plazo.
 *
 * El Libro ya sabe decir qué está fuera de plazo, pero sólo cuando alguien abre
 * el panel. En un aserradero eso pasa cuando pasa: la guía llega el viernes, el
 * dueño entra el lunes y ya está vencida. Esto invierte el orden — el sistema
 * avisa antes, no después.
 *
 * PURO: recibe datos ya cargados y decide. El cron sólo junta y manda.
 *
 * El plazo de registro (`PLAZO_REGISTRO_DIAS`, 2 días hábiles) sale de
 * `ctp-compliance.ts` — la MISMA constante que usa el badge de la tabla, para
 * que el aviso no diga algo distinto de lo que después muestra el panel.
 */
import { PLAZO_REGISTRO_DIAS, diasHabilesDeRegistro } from "./ctp-compliance";

/** Estado del plazo de una guía todavía no ingresada al CTP. */
export type EstadoPlazo = "vencido" | "vence_hoy" | "por_vencer" | "en_plazo";

export interface GuiaPendiente {
  gtfNumber: string;
  /** Fecha de la guía (date-only, medianoche UTC). */ gtfDate: string | Date;
  titularName?: string | null;
  volumenTotalM3?: number | null;
}

export interface PlazoGuia extends GuiaPendiente {
  /** Días hábiles transcurridos desde la fecha de la guía. */ diasHabiles: number;
  /** Días hábiles que faltan para pasarse (0 = se pasa hoy, negativo = ya pasó). */ quedan: number;
  estado: EstadoPlazo;
}

/**
 * Días hábiles entre dos fechas. Reusa la fórmula del módulo (lun–vie, sin
 * feriados) para que el aviso y el badge del Libro cuenten IGUAL.
 */
export function diasHabilesEntre(desde: string | Date, hasta: string | Date): number {
  return diasHabilesDeRegistro({ entryDate: desde, createdAt: hasta });
}

/** Ubica una guía respecto del plazo legal de registro. */
export function plazoDeGuia(g: GuiaPendiente, hoy: Date): PlazoGuia {
  const diasHabiles = diasHabilesEntre(g.gtfDate, hoy);
  const quedan = PLAZO_REGISTRO_DIAS - diasHabiles;
  const estado: EstadoPlazo =
    quedan < 0 ? "vencido" : quedan === 0 ? "vence_hoy" : quedan === 1 ? "por_vencer" : "en_plazo";
  return { ...g, diasHabiles, quedan, estado };
}

/** Las que hay que mirar hoy, de la más urgente a la menos. */
const ORDEN_ESTADO: Record<EstadoPlazo, number> = {
  vencido: 0,
  vence_hoy: 1,
  por_vencer: 2,
  en_plazo: 3,
};

export interface DatosAviso {
  guiasSinIngresar: GuiaPendiente[];
  /** Despachos vivos sin número de GTF de salida. */ despachosSinGtf: number;
  /** Especies con saldo negativo: el libro no cierra así. */ saldosNegativos: number;
  /** Ingresos ya registrados fuera de plazo (histórico, no accionable hoy). */ fueraDePlazo: number;
  /**
   * Títulos habilitantes o permisos CITES de la Ficha ya VENCIDOS
   * (`documentosVencimientoDeFicha`, `ctp-ficha-types.ts`) — a diferencia de
   * `fueraDePlazo`, esto SÍ dispara el aviso: un documento vencido invalida
   * el origen legal de TODA la madera que ampara, no un caso puntual. Los
   * "por vencer" (30 días) siguen siendo sólo informativos del panel — un
   * aviso diario durante 30 días enseñaría a ignorarlo.
   */
  documentosVencidosLabels: string[];
  /**
   * Lotes abiertos cuyo proceso ya venció o está por vencer (Brandon,
   * 2026-09-12: «aviso de vencimiento del lote»).
   *
   * Un lote con fecha de fin pasada y todavía abierto es madera apartada que no
   * entró a la sierra: figura comprometida, no se puede usar en otro lote y el
   * SNIFFS espera una producción que nunca se declaró.
   */
  lotes?: LoteEnRiesgo[];
}

/** Un lote con fecha de fin de proceso, para mirarle el vencimiento. */
export interface LoteEnRiesgo {
  code: string;
  /** Fin de proceso programado. */
  finProceso: Date;
  especie: string | null;
  volumenM3: number | null;
  piezas: number;
}

export interface LotePlazo extends LoteEnRiesgo {
  estado: "vencido" | "vence_hoy" | "por_vencer";
  /** Días que faltan; negativo si ya pasó. */
  quedan: number;
}

/**
 * Con cuántos días de anticipación avisar de un lote.
 *
 * Tres, no treinta: el lote es una programación propia del aserradero, no un
 * papel con plazo legal. Avisar un mes antes de que termine un proceso que
 * dura un mes es avisar el día que empieza, y eso enseña a ignorar el aviso.
 */
export const DIAS_AVISO_LOTE = 3;

/**
 * Días enteros entre dos fechas, en UTC.
 *
 * `setHours` usaría la zona de quien corre el proceso: `finProceso` es
 * date-only (medianoche UTC, como lo guarda Prisma) y en Lima —UTC-5— eso es
 * las 19:00 del día anterior, así que un lote que vence hoy salía «venció ayer».
 * Es el mismo off-by-one que ya mordió al resto del libro.
 */
function dias(desde: Date, hasta: Date): number {
  const a = new Date(desde);
  a.setUTCHours(0, 0, 0, 0);
  const b = new Date(hasta);
  b.setUTCHours(0, 0, 0, 0);
  return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Los lotes que hay que mirar hoy, ordenados por urgencia.
 *
 * Sólo los que están dentro de la ventana o ya vencieron: un lote que termina
 * en dos semanas no es noticia.
 */
export function lotesEnPlazo(lotes: readonly LoteEnRiesgo[], hoy: Date): LotePlazo[] {
  return lotes
    .map((l) => {
      const quedan = dias(hoy, l.finProceso);
      const estado: LotePlazo["estado"] = quedan < 0 ? "vencido" : quedan === 0 ? "vence_hoy" : "por_vencer";
      return { ...l, quedan, estado };
    })
    .filter((l) => l.quedan <= DIAS_AVISO_LOTE)
    .sort((a, b) => a.quedan - b.quedan);
}

/** Cómo se lee el plazo de un lote en una línea. */
export function fraseLote(l: LotePlazo): string {
  if (l.quedan < 0) {
    const d = Math.abs(l.quedan);
    return `venció hace ${d} día${d === 1 ? "" : "s"}`;
  }
  if (l.quedan === 0) return "vence hoy";
  if (l.quedan === 1) return "vence mañana";
  return `vence en ${l.quedan} días`;
}

export interface Aviso {
  /** true si hay algo que amerite interrumpir a la persona. */ hayQueAvisar: boolean;
  /** HIGH cuando algo ya venció o vence hoy. */ severidad: "HIGH" | "MEDIUM";
  titulo: string;
  /** Cuerpo corto para la campana del panel. */ resumen: string;
  /** Mensaje de WhatsApp, ya formateado. */ whatsapp: string;
  guias: PlazoGuia[];
  /** Lotes dentro de la ventana de aviso, de más urgente a menos. */ lotes: LotePlazo[];
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

export function frasePlazo(p: PlazoGuia): string {
  if (p.estado === "vencido") {
    const d = Math.abs(p.quedan);
    return `pasada de plazo por ${plural(d, "día hábil", "días hábiles")}`;
  }
  if (p.estado === "vence_hoy") return "se te vence HOY";
  if (p.estado === "por_vencer") return "te queda 1 día hábil";
  return `te quedan ${p.quedan} días hábiles`;
}

/**
 * Decide si hay que avisar y arma el mensaje.
 *
 * Sólo interrumpe por lo ACCIONABLE hoy: guías cuyo plazo corre o ya se pasó,
 * producto despachado sin guía, y saldos negativos. Los ingresos ya registrados
 * fuera de plazo se cuentan en el texto pero no disparan el aviso solos: son
 * historia, no algo que se pueda salvar hoy, y un aviso que no se puede
 * accionar enseña a ignorar los avisos.
 */
export function construirAviso(d: DatosAviso, hoy: Date, nombreNegocio?: string): Aviso {
  const guias = d.guiasSinIngresar
    .map((g) => plazoDeGuia(g, hoy))
    .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.quedan - b.quedan);

  const urgentes = guias.filter((g) => g.estado !== "en_plazo");
  const vencidas = guias.filter((g) => g.estado === "vencido");
  const hoyMismo = guias.filter((g) => g.estado === "vence_hoy");
  const docsVencidos = d.documentosVencidosLabels;

  /* Lotes: el proceso programado que se pasó de fecha con el lote abierto. */
  const lotes = lotesEnPlazo(d.lotes ?? [], hoy);
  const lotesVencidos = lotes.filter((l) => l.estado === "vencido");

  const hayQueAvisar =
    urgentes.length > 0 || d.despachosSinGtf > 0 || d.saldosNegativos > 0 || docsVencidos.length > 0 || lotes.length > 0;
  const severidad: "HIGH" | "MEDIUM" =
    vencidas.length > 0 || hoyMismo.length > 0 || d.saldosNegativos > 0 || docsVencidos.length > 0 || lotesVencidos.length > 0
      ? "HIGH"
      : "MEDIUM";

  // Un documento vencido invalida el origen legal de TODA la madera que
  // ampara — más grave que una guía puntual sin ingresar, así que encabeza
  // el título cuando aparece.
  const titulo =
    docsVencidos.length > 0
      ? `${plural(docsVencidos.length, "documento vencido", "documentos vencidos")} en la Ficha CTP`
      : vencidas.length > 0
        ? `${plural(vencidas.length, "guía pasada", "guías pasadas")} de plazo en el Libro CTP`
        : hoyMismo.length > 0
          ? `${plural(hoyMismo.length, "guía se vence", "guías se vencen")} hoy`
          : urgentes.length > 0
            ? `${plural(urgentes.length, "guía por vencer", "guías por vencer")} en el Libro CTP`
            : d.saldosNegativos > 0
              ? "Saldos en negativo en el Libro CTP"
              : d.despachosSinGtf > 0
                ? "Despachos sin guía de salida"
                : lotesVencidos.length > 0
                  ? `${plural(lotesVencidos.length, "lote vencido", "lotes vencidos")} sin aserrar`
                  : `${plural(lotes.length, "lote por vencer", "lotes por vencer")} sin aserrar`;

  const partes: string[] = [];
  if (docsVencidos.length > 0) partes.push(`${plural(docsVencidos.length, "documento vencido", "documentos vencidos")} en la Ficha`);
  if (urgentes.length > 0) partes.push(`${plural(urgentes.length, "guía del monte", "guías del monte")} sin ingresar`);
  if (d.despachosSinGtf > 0) partes.push(`${plural(d.despachosSinGtf, "despacho", "despachos")} sin GTF de salida`);
  if (d.saldosNegativos > 0) partes.push(`${plural(d.saldosNegativos, "especie", "especies")} con saldo negativo`);
  if (lotes.length > 0) {
    partes.push(
      lotesVencidos.length > 0
        ? `${plural(lotesVencidos.length, "lote vencido", "lotes vencidos")} sin aserrar`
        : `${plural(lotes.length, "lote por vencer", "lotes por vencer")}`,
    );
  }
  const resumen = partes.join(" · ") || "Sin pendientes urgentes.";

  const lineas = urgentes
    .slice(0, 6)
    .map((g) => {
      const vol = g.volumenTotalM3 ? ` · ${g.volumenTotalM3} m³` : "";
      const titular = g.titularName ? ` — ${g.titularName}` : "";
      return `• GTF ${g.gtfNumber}${titular}${vol} — ${frasePlazo(g)}`;
    });

  // `null` = línea que no corresponde y se saca; `""` = renglón en blanco a propósito.
  const whatsapp = [
    `🌲 *${titulo}*${nombreNegocio ? ` — ${nombreNegocio}` : ""}`,
    "",
    docsVencidos.length > 0
      ? `⛔ ${plural(docsVencidos.length, "documento vencido", "documentos vencidos")} en la Ficha CTP: ${docsVencidos.slice(0, 4).join(", ")}${docsVencidos.length > 4 ? ` y ${docsVencidos.length - 4} más` : ""}. Un título o permiso vencido invalida el origen legal de la madera que ampara.`
      : null,
    ...lineas,
    urgentes.length > 6 ? `…y ${urgentes.length - 6} más.` : null,
    d.despachosSinGtf > 0
      ? `\n⚠️ ${plural(d.despachosSinGtf, "despacho salió", "despachos salieron")} sin GTF de salida.`
      : null,
    d.saldosNegativos > 0
      ? `⛔ ${plural(d.saldosNegativos, "especie tiene", "especies tienen")} saldo negativo: el libro no cierra así.`
      : null,
    /* Los lotes van al final del mensaje: son de la programación propia del
       aserradero, no de un plazo ante SERFOR. Importantes, pero no urgentes
       como una guía sin registrar. */
    lotes.length > 0 ? "" : null,
    lotes.length > 0
      ? `🪵 *${plural(lotes.length, "lote de aserrío", "lotes de aserrío")}* con el proceso por cerrar:`
      : null,
    ...lotes.slice(0, 4).map((l) => {
      const vol = l.volumenM3 ? ` · ${l.volumenM3} m³` : "";
      const esp = l.especie ? ` — ${l.especie}` : "";
      return `• Lote ${l.code}${esp}${vol} — ${fraseLote(l)}`;
    }),
    lotes.length > 4 ? `…y ${lotes.length - 4} más.` : null,
    "",
    `El plazo para registrar en el Libro es de ${PLAZO_REGISTRO_DIAS} días hábiles.`,
    "Entrá al panel → Libro CTP (Forestal).",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { hayQueAvisar, severidad, titulo, resumen, whatsapp, guias, lotes };
}
