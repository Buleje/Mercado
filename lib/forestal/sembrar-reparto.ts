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
  /** De esos repetidos, los que estaban SIN especie y ahora la recibieron. */
  conEspecie?: number;
  /** De esos repetidos, los que no sabían sus trozas y ahora las saben (ADR-464). */
  conTrozas?: number;
}

/** La huella con la que se decide si un bloque ya está cargado. */
const huella = (b: Pick<BloqueRolliza, "etiqueta" | "especie" | "paqueteId">) =>
  b.paqueteId ? `ref::${b.paqueteId}` : `${b.etiqueta}::${b.especie}`;

/** `""`, `"  "` y `null` son «sin especie». */
const sinEspecie = (b: Pick<BloqueRolliza, "especie">) => !String(b.especie ?? "").trim();

/**
 * Tolerancia para decir «es el mismo m³», en la unidad del negocio: la GTF
 * declara m³ a 3 decimales, así que medio litro es «igual» y un litro, no.
 */
const MISMO_M3 = 0.0005;

/**
 * ¿Se le pueden poner sus trozas a un bloque que ya estaba cargado sin ellas?
 * Sólo si es la MISMA madera: misma huella y el mismo m³. Si el m³ cambió
 * (se consumió o llegó una pieza desde que se sembró), las trozas de hoy no
 * son las de ese bloque, y pegárselas le haría escribir en el Libro piezas que
 * no son las suyas (T1). Queda sin trozas y la pantalla dice «Tráelo del Libro».
 */
const puedeRecibirTrozas = (b: BloqueRolliza, c: BloqueSembrable) =>
  !(b.trozaIds && b.trozaIds.length > 0) &&
  Boolean(c.trozaIds && c.trozaIds.length > 0) &&
  huella(b) === huella(c) &&
  Math.abs((Number(b.m3) || 0) - (Number(c.m3) || 0)) <= MISMO_M3;

/**
 * La hoja de rolliza después de sembrar — PURO, sin `localStorage`.
 *
 * Además de sumar los nuevos sin repetir, completa la especie de un bloque que
 * ya estaba cargado SIN ella (Brandon, 2026-10-02: «que se pase a distribución
 * con la especie asignada»). Sin esto, volver a llevar el mismo lote:
 *  · por `paqueteId` lo daba por repetido y la especie no llegaba nunca;
 *  · por `etiqueta::especie` la huella cambiaba («Lote 7::» ≠ «Lote 7::Copal»)
 *    y sembraba un SEGUNDO bloque con el mismo m³ — madera contada dos veces
 *    en la hoja que se firma.
 * Una especie ya puesta NO se pisa: la eligió alguien en la tabla.
 */
export function unirSiembra(
  actuales: readonly BloqueRolliza[],
  candidatos: readonly BloqueSembrable[],
  prefijo: string,
  marca: string,
): { lista: BloqueRolliza[]; sembrados: number; repetidos: number; conEspecie: number; conTrozas: number } {
  const lista = actuales.map((b) => ({ ...b }));
  const yaEstan = new Set(lista.map(huella));
  /* Un lote ya puesto en un bloque (el que se creó desde la Distribución, o uno
     traído antes) no entra otra vez con otra etiqueta: sería la misma madera
     dos veces (revisión de ADR-464). Por lote Y tipo: el «apartado» (rolliza
     sin aserrar) y el «margen» (aserrada que admite) del mismo lote son madera
     distinta y van los dos. */
  const deLote = (b: Pick<BloqueRolliza, "loteId" | "tipo">) => (b.loteId ? `${b.loteId}|${b.tipo ?? "rolliza"}` : null);
  const lotes = new Set(lista.map(deLote).filter((k): k is string => k !== null));
  let sembrados = 0;
  let conEspecie = 0;
  let conTrozas = 0;
  for (const c of candidatos) {
    /* El mismo bloque, cargado antes sin especie: se le pone, no se duplica.
       Va ANTES de la huella: por `paqueteId` la huella ya coincide y lo daría
       por repetido sin completarlo. */
    const vacio = sinEspecie(c)
      ? undefined
      : lista.find((b) =>
          sinEspecie(b) &&
          (c.paqueteId ? b.paqueteId === c.paqueteId : !b.paqueteId && b.etiqueta === c.etiqueta),
        );
    if (vacio) {
      yaEstan.delete(huella(vacio));
      vacio.especie = c.especie;
      yaEstan.add(huella(vacio));
      conEspecie += 1;
      if (puedeRecibirTrozas(vacio, c)) {
        vacio.trozaIds = [...c.trozaIds!];
        conTrozas += 1;
      }
      continue;
    }
    const kLote = deLote(c);
    if (kLote && lotes.has(kLote)) continue;
    const h = huella(c);
    if (yaEstan.has(h)) {
      /* Sembrado antes de que el bloque guardara sus trozas (ADR-464): volver
         a traerlo del Libro se las pone, en vez de dejarlo apagado para siempre. */
      const previo = lista.find((b) => puedeRecibirTrozas(b, c));
      if (previo) {
        previo.trozaIds = [...c.trozaIds!];
        conTrozas += 1;
      }
      continue;
    }
    yaEstan.add(h);
    if (kLote) lotes.add(kLote);
    lista.push({ ...c, id: `${prefijo}-${marca}-${sembrados}` });
    sembrados += 1;
  }
  return { lista, sembrados, repetidos: candidatos.length - sembrados, conEspecie, conTrozas };
}

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
    const r = unirSiembra(actuales, candidatos, prefijo, Date.now().toString(36));
    if (r.sembrados > 0 || r.conEspecie > 0 || r.conTrozas > 0) {
      localStorage.setItem(slugKey("-rolliza"), JSON.stringify(r.lista));
    }
    /* Que Resúmenes abra en la pestaña donde están los bloques recién
       sembrados: llegar a «Tablas» y tener que buscarlos es la mitad del viaje. */
    localStorage.setItem(slugKey("-vista-resumen"), "rolliza");
    return { sembrados: r.sembrados, repetidos: r.repetidos, conEspecie: r.conEspecie, conTrozas: r.conTrozas };
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
