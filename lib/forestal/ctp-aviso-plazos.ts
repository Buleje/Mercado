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
}

export interface Aviso {
  /** true si hay algo que amerite interrumpir a la persona. */ hayQueAvisar: boolean;
  /** HIGH cuando algo ya venció o vence hoy. */ severidad: "HIGH" | "MEDIUM";
  titulo: string;
  /** Cuerpo corto para la campana del panel. */ resumen: string;
  /** Mensaje de WhatsApp, ya formateado. */ whatsapp: string;
  guias: PlazoGuia[];
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

function frasePlazo(p: PlazoGuia): string {
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

  const hayQueAvisar = urgentes.length > 0 || d.despachosSinGtf > 0 || d.saldosNegativos > 0 || docsVencidos.length > 0;
  const severidad: "HIGH" | "MEDIUM" =
    vencidas.length > 0 || hoyMismo.length > 0 || d.saldosNegativos > 0 || docsVencidos.length > 0 ? "HIGH" : "MEDIUM";

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
              : "Despachos sin guía de salida";

  const partes: string[] = [];
  if (docsVencidos.length > 0) partes.push(`${plural(docsVencidos.length, "documento vencido", "documentos vencidos")} en la Ficha`);
  if (urgentes.length > 0) partes.push(`${plural(urgentes.length, "guía del monte", "guías del monte")} sin ingresar`);
  if (d.despachosSinGtf > 0) partes.push(`${plural(d.despachosSinGtf, "despacho", "despachos")} sin GTF de salida`);
  if (d.saldosNegativos > 0) partes.push(`${plural(d.saldosNegativos, "especie", "especies")} con saldo negativo`);
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
    "",
    `El plazo para registrar en el Libro es de ${PLAZO_REGISTRO_DIAS} días hábiles.`,
    "Entrá al panel → Libro CTP (Forestal).",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { hayQueAvisar, severidad, titulo, resumen, whatsapp, guias };
}
