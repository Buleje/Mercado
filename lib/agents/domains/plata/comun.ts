/**
 * lib/agents/domains/plata/comun.ts
 *
 * Las piezas que comparten las búsquedas y las escrituras del dominio `plata`:
 * formato de plata, normalización para comparar, validación de fecha y los
 * catálogos que tienen que coincidir con los formularios del panel.
 *
 * Salieron del agente cuando pasó las 900 líneas. Nada cambió de comportamiento.
 */

import type { AgentTask } from "@/lib/agents/types";

// ── Utilidades del dominio ───────────────────────────────────────────────────

/** Soles con dos decimales. Todo monto que sale de acá pasó por esto. */
export const soles = (n: number) => Math.round(n * 100) / 100;

export const fmt = (n: number) =>
  `S/ ${soles(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const texto = (v: unknown): string => String(v ?? "").trim();

/** ¿Está en modo ensayo? El route lo pide antes de ofrecer la confirmación. */
export const esEnsayo = (task: AgentTask) => task.payload.__validar === true;

/**
 * Normaliza para comparar: sin tildes, sin guiones, minúsculas.
 *
 * Una placa se dicta «A cuatro B ocho nueve dos» y se escribe «A4B-892»: sin
 * sacar el guion, buscar "A4B892" no encuentra nada.
 */
export function clave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Palabras de 3+ letras/dígitos — el matching es por palabra, no por substring. */
export function palabras(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

/**
 * Una fecha dictada, siempre en el pasado razonable.
 *
 * El modelo resuelve «ayer» contra la fecha de hoy que ya viaja en el snapshot;
 * acá sólo se valida que lo que llegó sea una fecha y que no sea de otro siglo.
 * Un gasto con fecha de mañana desordena el cierre del mes en silencio.
 */
export function fechaValida(raw: unknown): { ok: true; fecha: Date } | { ok: false; error: string } {
  const s = texto(raw);
  if (!s) return { ok: true, fecha: new Date() };
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `No entendí la fecha "${s}". Usá el formato AAAA-MM-DD.` };
  }
  const manana = Date.now() + 86_400_000;
  if (d.getTime() > manana) {
    return { ok: false, error: `Esa fecha (${s}) es futura. Un gasto se anota cuando ya salió la plata.` };
  }
  if (d.getTime() < Date.now() - 3 * 365 * 86_400_000) {
    return { ok: false, error: `Esa fecha (${s}) es de hace más de 3 años. ¿Está bien el año?` };
  }
  return { ok: true, fecha: d };
}

export const METODOS_PAGO = ["efectivo", "yape", "plin", "transferencia", "tarjeta", "credito"] as const;
export type MetodoPagoGasto = (typeof METODOS_PAGO)[number];

/** Los métodos que mueven el cajón. `credito` no salió de la caja: se debe. */
export const METODOS_CAJA = new Set(["efectivo", "yape", "plin", "transferencia", "tarjeta"]);

export function metodoPago(raw: unknown): MetodoPagoGasto | null {
  const m = clave(texto(raw));
  const hit = METODOS_PAGO.find((x) => clave(x) === m);
  return hit ?? null;
}

/** Categorías del libro de la máquina — las mismas del formulario de Activos. */
export const CATEGORIAS_MAQUINA = ["combustible", "mantenimiento", "repuesto", "operador", "peaje", "otro"] as const;

/** Categorías del libro de gastos — las mismas del formulario de Gastos. */
export const CATEGORIAS_GASTO = [
  "alquiler", "servicios", "personal", "transporte",
  "limpieza", "marketing", "mantenimiento", "otros",
] as const;

/**
 * ¿Hay que preguntar, o hay un ganador claro?
 *
 * Que aparezcan dos resultados NO es ambigüedad: buscando «camión N12» también
 * pica «Camión N7» por compartir la palabra «camión», y frenar ahí para
 * preguntar convierte cada dictado en un ida y vuelta. El puntaje es RELATIVO
 * (misma lección que el matcher de voz del POS): sólo se pregunta cuando el
 * segundo le pisa los talones al primero.
 */
export function hayEmpate(rank: { score: number }[]): boolean {
  return rank.length > 1 && rank[1].score >= rank[0].score * 0.8;
}

