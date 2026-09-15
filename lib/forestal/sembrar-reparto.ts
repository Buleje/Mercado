/**
 * Sembrar bloques en la distribución de rolliza y abrir la herramienta.
 *
 * Es el camino que ya usaba «Resumen por permiso» (Consumo) para mandar madera
 * al cubicador; vive acá porque desde 2026-09-08 lo usa también la tarjeta de
 * Capacidad de la planta, y dos copias del mismo guardado terminan escribiendo
 * en claves distintas o sembrando con reglas distintas.
 *
 * Lo que hace, y por qué así:
 *
 *  · **Suma, nunca reemplaza.** Los bloques que ya estaban cargados se
 *    respetan: sembrar desde otra pantalla no puede borrar lo que alguien
 *    acaba de tipear a mano.
 *  · **No siembra dos veces lo mismo.** La huella es `etiqueta::especie` —o el
 *    `paqueteId` cuando la línea viene de una corrida del Libro, que es el
 *    mismo `ref` del picker de paquetes—. Duplicar un bloque duplica su m³
 *    dentro de la hoja que se firma.
 *  · **Navegación DURA a `?tab=`.** El sidebar del panel cambia de módulo por
 *    su propio estado, no leyendo la URL en cada render: un `router.push`
 *    movía la barra de direcciones y dejaba la pantalla donde estaba (bug real
 *    de 2026-09-01, Brandon).
 */

import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";

/**
 * La clave de localStorage del cubicador para el tenant activo.
 * `buleje-cubicacion-{slug}{sufijo}` — el slug al medio; el de trozas lo lleva
 * al final (`buleje-cubicacion-trozas-{slug}`), que ya costó un botón muerto.
 */
/**
 * El slug del tenant activo, para colgar de él una clave de `localStorage`.
 *
 * Los dos libros hermanos (ADR-395) viven en el MISMO origen y cambiar de
 * operación sólo swapea la cookie y recarga: sin el slug en la clave, lo que
 * quedó a medio cargar en una operación reaparece en la otra. Se lee la cookie
 * primero —es lo que el servidor acaba de setear al cambiar— y el localStorage
 * como respaldo.
 */
export function tenantDeLaClave(): string {
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|;\s*)active-tenant-slug=([^;]+)/);
    if (m) return decodeURIComponent(m[1]!);
  }
  try {
    return localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* modo privado: la clave del tenant por defecto sigue siendo usable */
    return "main";
  }
}

export function slugKey(sufijo = "") {
  let slug = "main";
  try {
    slug = localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* modo privado: la clave del tenant por defecto sigue siendo usable */
  }
  return `buleje-cubicacion-${slug}${sufijo}`;
}

/** Un bloque listo para sembrar, sin `id`: se lo pone esta función. */
export type BloqueSembrable = Omit<BloqueRolliza, "id">;

export interface ResultadoSiembra {
  sembrados: number;
  /** Los que ya estaban cargados y no se repitieron. */
  repetidos: number;
}

/** La huella con la que se decide si un bloque ya está cargado. */
const huella = (b: Pick<BloqueRolliza, "etiqueta" | "especie" | "paqueteId">) =>
  b.paqueteId ? `ref::${b.paqueteId}` : `${b.etiqueta}::${b.especie}`;

/**
 * Escribe los bloques nuevos en la hoja de rolliza y deja la vista de
 * Resúmenes lista en «Rolliza». No navega: eso lo decide quien llama.
 */
export function sembrarBloques(
  candidatos: readonly BloqueSembrable[],
  /** Prefijo del id, para reconocer en el JSON de dónde salió cada bloque. */
  prefijo = "sembrado",
): ResultadoSiembra {
  if (candidatos.length === 0) return { sembrados: 0, repetidos: 0 };
  try {
    const raw = localStorage.getItem(slugKey("-rolliza"));
    const actuales: BloqueRolliza[] = raw ? (JSON.parse(raw) as BloqueRolliza[]) : [];
    const yaEstan = new Set(actuales.map(huella));
    const marca = Date.now().toString(36);
    const nuevos: BloqueRolliza[] = [];
    for (const c of candidatos) {
      const h = huella(c);
      if (yaEstan.has(h)) continue;
      yaEstan.add(h);
      nuevos.push({ ...c, id: `${prefijo}-${marca}-${nuevos.length}` });
    }
    if (nuevos.length > 0) {
      localStorage.setItem(slugKey("-rolliza"), JSON.stringify([...actuales, ...nuevos]));
    }
    /* Que Resúmenes abra en la pestaña donde están los bloques recién
       sembrados: llegar a «Tablas» y tener que buscarlos es la mitad del viaje. */
    localStorage.setItem(slugKey("-vista-resumen"), "rolliza");
    return { sembrados: nuevos.length, repetidos: candidatos.length - nuevos.length };
  } catch {
    /* localStorage puede fallar (modo privado). Se informa que no se sembró
       nada; quien llama decide si navega igual. */
    return { sembrados: 0, repetidos: 0 };
  }
}

/** Clave de sesión que le dice a Herramientas Forestales qué pestaña abrir. */
export const TOOL_ONCE_STORAGE_KEY = "buleje-herramientas-tool-once";

/** Abre Herramientas Forestales en Resúmenes (una sola vez, no la recuerda). */
export function abrirResumenesDelCubicador() {
  try {
    sessionStorage.setItem(TOOL_ONCE_STORAGE_KEY, "resumenes");
  } catch {
    /* sin sessionStorage se abre la herramienta por defecto: dos clicks más */
  }
  window.location.href = "/admin?tab=forestal-herramientas";
}
