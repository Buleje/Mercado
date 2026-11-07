/**
 * Las filas de Configuración › Mi panel › «Uso del panel» (puro, testeable):
 * una por pestaña que la persona ve en su barra, con sus aperturas de 7 y 30
 * días, la última vez y la vista más abierta. Las que nadie abrió en 30 días
 * quedan al final: son las candidatas a esconder (eso lo decide el dueño).
 */
import type { AperturasDeClave } from "./aperturas-panel";

export interface FilaUsoPanel {
  tab: string;
  etiqueta: string;
  /** La categoría de la barra donde vive («Forestal», «Ventas»). */
  categoria: string;
  d7: number;
  d30: number;
  /** Última apertura (ms) de la pestaña o de cualquiera de sus vistas. */
  ultima: number | null;
  /** La vista más abierta en 30 días, si la pestaña tiene vistas y alguna se abrió. */
  vista: { etiqueta: string; d30: number } | null;
}

interface CategoriaConEtiqueta {
  id: string;
  label: string;
  tabs: readonly string[];
}

const SIN_APERTURAS: AperturasDeClave = { d7: 0, d30: 0, ultima: null };

const masReciente = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.max(a, b);

export function filasDeUso(
  categorias: readonly CategoriaConEtiqueta[],
  claves: Readonly<Record<string, AperturasDeClave>>,
  etiquetaDeTab: (tab: string) => string,
  etiquetaDeVista: (tab: string, vista: string) => string | null,
  puedeVer: (tab: string) => boolean,
): FilaUsoPanel[] {
  /* Las vistas de cada pestaña (`tab:vista`), juntadas una sola vez. */
  const vistasDe = new Map<string, [string, AperturasDeClave][]>();
  for (const [clave, a] of Object.entries(claves)) {
    const i = clave.indexOf(":");
    if (i < 0) continue;
    const tab = clave.slice(0, i);
    const lista = vistasDe.get(tab) ?? [];
    lista.push([clave.slice(i + 1), a]);
    vistasDe.set(tab, lista);
  }

  const vistas = new Set<string>();
  const filas: FilaUsoPanel[] = [];
  for (const cat of categorias) {
    for (const tab of cat.tabs) {
      if (vistas.has(tab) || !puedeVer(tab)) continue;
      vistas.add(tab);
      const propia = claves[tab] ?? SIN_APERTURAS;
      let ultima = propia.ultima;
      let top: { etiqueta: string; d30: number } | null = null;
      for (const [vista, a] of vistasDe.get(tab) ?? []) {
        ultima = masReciente(ultima, a.ultima);
        if (a.d30 > 0 && (!top || a.d30 > top.d30)) top = { etiqueta: etiquetaDeVista(tab, vista) ?? vista, d30: a.d30 };
      }
      filas.push({ tab, etiqueta: etiquetaDeTab(tab), categoria: cat.label, d7: propia.d7, d30: propia.d30, ultima, vista: top });
    }
  }
  /* `sort` es estable: a igual uso, queda el orden de la barra. */
  return filas.sort((a, b) => b.d30 - a.d30 || b.d7 - a.d7 || (b.ultima ?? 0) - (a.ultima ?? 0));
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
/** Perú no cambia de hora: UTC−5 todo el año. */
const LIMA_MS = -5 * 3_600_000;
const DIA_MS = 86_400_000;
const dos = (n: number) => String(n).padStart(2, "0");

/** «jueves 10/09» de una fecha `AAAA-MM-DD` (date-only, en UTC). */
export function diaConFecha(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return `${DIAS[fecha.getUTCDay()]} ${dos(d)}/${dos(m)}`;
}

/** «hoy 14:05», «ayer 09:10» o «jueves 10/09», en la hora de Lima. */
export function cuandoFue(ms: number, ahora: number = Date.now()): string {
  const local = new Date(ms + LIMA_MS);
  const diaDe = (t: number) => Math.floor((t + LIMA_MS) / DIA_MS);
  const hace = diaDe(ahora) - diaDe(ms);
  const hora = `${dos(local.getUTCHours())}:${dos(local.getUTCMinutes())}`;
  if (hace <= 0) return `hoy ${hora}`;
  if (hace === 1) return `ayer ${hora}`;
  return `${DIAS[local.getUTCDay()]} ${dos(local.getUTCDate())}/${dos(local.getUTCMonth() + 1)}`;
}
