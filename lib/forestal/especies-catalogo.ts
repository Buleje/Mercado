/**
 * El catálogo de especies del aserradero — el que se puede editar.
 *
 * El pedido (Brandon, 2026-09-10): *«en el cubicador, poder crear especies,
 * quitarlas, modificarlas, y que se guarde esa información»*. Hasta hoy la lista
 * era `ESPECIES_MADERA`, una constante del código: catorce especies de la Selva
 * Central iguales para todos los tenants. Un aserradero que trabaja capirona y
 * cumala blanca tenía que tipear el nombre cada vez —y cada quien lo escribía
 * distinto, que es de dónde salen las dos filas «Tornillo» y «TORNILLO».
 *
 * ## Cómo se compone
 *
 * Las de fábrica **no se borran del código**: se OCULTAN por tenant. Así una
 * planta que no trabaja caoba deja de verla sin que desaparezca para las demás,
 * y sin migrar nada el día que la vuelva a necesitar.
 *
 *   lista = (fábrica − ocultas) + agregadas
 *
 * Editar el nombre de una de fábrica es ocultarla y agregar la nueva: la
 * pantalla lo dice («queda como propia»), porque después de eso el catálogo del
 * tenant es el que manda sobre ese nombre.
 *
 * ## Lo que NO hace
 *
 * **No reescribe lo ya cubicado ni lo ya declarado.** Una pieza guarda el nombre
 * con el que se cargó; borrar o renombrar la especie no toca el libro —sería
 * cambiar en silencio lo que dice un acta—. Lo que cambia es qué se ofrece de
 * acá en adelante.
 *
 * PURO y client-safe: la persistencia vive en `ForestEspeciesDB` (KV, mismo
 * criterio que la biblioteca de fotos).
 */

import { ESPECIES_MADERA } from "./cubicacion";
import { claveEspecie } from "./loth-constants";
import { findSpeciesByCommonName, listSpecies, type ForestrySpecies } from "@/data/forestry-species";

/** Tope por tenant: es un JSON en el KV, no una tabla. */
export const MAX_ESPECIES = 300;

/** Una especie que agregó el aserradero. */
export interface EspeciePropia {
  /** Como se escribe en el libro y en la guía. */
  nombre: string;
  /** Clave normalizada — sin tildes ni mayúsculas. */
  clave: string;
  /** Nombre científico, si se sabe. Va a la columna del LO-CTP. */
  cientifico?: string | null;
  creadoPor?: string;
  creadoEn?: string;
}

export interface CatalogoEspecies {
  agregadas: EspeciePropia[];
  /** Claves de las de fábrica que este tenant no quiere ver. */
  ocultas: string[];
}

export const CATALOGO_VACIO: CatalogoEspecies = { agregadas: [], ocultas: [] };

/** Una especie tal como la ofrece la pantalla. */
export interface EspecieDisponible {
  nombre: string;
  clave: string;
  cientifico?: string | null;
  /** `true` si vino del código y no del catálogo del tenant. */
  deFabrica: boolean;
}

const txt = (v: unknown) => String(v ?? "").trim();

/** Normaliza lo que llega del cliente o del KV; descarta lo que no tiene nombre. */
export function normalizarCatalogo(raw: unknown): CatalogoEspecies {
  const c = (raw ?? {}) as Partial<CatalogoEspecies>;
  const vistas = new Set<string>();
  const agregadas: EspeciePropia[] = [];
  for (const e of Array.isArray(c.agregadas) ? c.agregadas : []) {
    const nombre = txt((e as EspeciePropia)?.nombre);
    const clave = claveEspecie(nombre);
    /* Sin nombre no hay especie, y la misma dos veces es una sola: el catálogo
       se lee por clave y la segunda nunca se podría elegir. */
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    agregadas.push({
      nombre,
      clave,
      cientifico: txt((e as EspeciePropia)?.cientifico) || null,
      creadoPor: txt((e as EspeciePropia)?.creadoPor) || undefined,
      creadoEn: txt((e as EspeciePropia)?.creadoEn) || undefined,
    });
  }
  const ocultas = [
    ...new Set(
      (Array.isArray(c.ocultas) ? c.ocultas : [])
        .map((k) => claveEspecie(String(k)))
        .filter(Boolean),
    ),
  ];
  return { agregadas: agregadas.slice(0, MAX_ESPECIES), ocultas };
}

/** Las de fábrica, con su clave. */
export function especiesDeFabrica(): EspecieDisponible[] {
  return ESPECIES_MADERA.map((n) => ({ nombre: n, clave: claveEspecie(n), deFabrica: true }));
}

/**
 * La lista que se ofrece: fábrica menos ocultas, más las propias, alfabética.
 *
 * Si una propia comparte clave con una de fábrica, **manda la propia**: es la
 * forma de corregir la ortografía o el nombre local de una especie sin perder
 * la que ya trae el sistema.
 */
export function especiesDisponibles(catalogo: CatalogoEspecies): EspecieDisponible[] {
  const ocultas = new Set(catalogo.ocultas);
  const propias = new Map(catalogo.agregadas.map((e) => [e.clave, e]));
  const salida: EspecieDisponible[] = [];
  for (const f of especiesDeFabrica()) {
    if (ocultas.has(f.clave) || propias.has(f.clave)) continue;
    salida.push(f);
  }
  for (const p of catalogo.agregadas) {
    salida.push({
      nombre: p.nombre,
      clave: p.clave,
      cientifico: p.cientifico ?? null,
      deFabrica: false,
    });
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Sólo los nombres — lo que consumen los `<select>` que ya existen. */
export const nombresDisponibles = (catalogo: CatalogoEspecies): string[] =>
  especiesDisponibles(catalogo).map((e) => e.nombre);

/* ── Las tres operaciones ─────────────────────────────────────────────────── */

export type ResultadoCatalogo =
  | { ok: true; catalogo: CatalogoEspecies; mensaje: string }
  | { ok: false; motivo: string };

/** Agrega una especie propia. Rechaza la repetida en vez de duplicar la lista. */
export function agregarEspecie(
  catalogo: CatalogoEspecies,
  entrada: { nombre: string; cientifico?: string | null },
  meta: { usuario?: string; ahora?: string } = {},
): ResultadoCatalogo {
  const nombre = txt(entrada.nombre);
  const clave = claveEspecie(nombre);
  if (!clave) return { ok: false, motivo: "Escribí el nombre de la especie." };
  if (nombre.length > 120)
    return { ok: false, motivo: "El nombre no puede pasar de 120 caracteres." };
  if (catalogo.agregadas.length >= MAX_ESPECIES) {
    return { ok: false, motivo: `El catálogo ya tiene ${MAX_ESPECIES} especies propias.` };
  }
  if (catalogo.agregadas.some((e) => e.clave === clave)) {
    return { ok: false, motivo: `«${nombre}» ya está en el catálogo.` };
  }
  const enFabrica = especiesDeFabrica().find((f) => f.clave === clave);
  /* Si la de fábrica está a la vista, agregarla de nuevo no suma nada. Si
     estaba oculta, agregarla es volver a mostrarla — y eso sí. */
  if (enFabrica && !catalogo.ocultas.includes(clave)) {
    return { ok: false, motivo: `«${enFabrica.nombre}» ya viene en la lista.` };
  }
  return {
    ok: true,
    catalogo: {
      agregadas: [
        ...catalogo.agregadas,
        {
          nombre,
          clave,
          cientifico: txt(entrada.cientifico) || null,
          creadoPor: meta.usuario,
          creadoEn: meta.ahora ?? new Date().toISOString(),
        },
      ],
      ocultas: catalogo.ocultas.filter((k) => k !== clave),
    },
    mensaje: `Se agregó «${nombre}» al catálogo.`,
  };
}

/**
 * Cambia el nombre o el científico de una especie.
 *
 * Sobre una de FÁBRICA no se edita en el lugar —el código es el mismo para
 * todos los tenants—: se la oculta y la nueva queda como propia. La pantalla lo
 * dice; en silencio sería un cambio global que no es.
 */
export function editarEspecie(
  catalogo: CatalogoEspecies,
  clave: string,
  cambios: { nombre?: string; cientifico?: string | null },
  meta: { usuario?: string; ahora?: string } = {},
): ResultadoCatalogo {
  const objetivo = claveEspecie(clave);
  const nombreNuevo = cambios.nombre != null ? txt(cambios.nombre) : null;
  if (cambios.nombre != null && !claveEspecie(nombreNuevo ?? "")) {
    return { ok: false, motivo: "El nombre no puede quedar vacío." };
  }
  const claveNueva = nombreNuevo ? claveEspecie(nombreNuevo) : objetivo;
  if (claveNueva !== objetivo && catalogo.agregadas.some((e) => e.clave === claveNueva)) {
    return { ok: false, motivo: `«${nombreNuevo}» ya está en el catálogo.` };
  }

  const propia = catalogo.agregadas.find((e) => e.clave === objetivo);
  if (propia) {
    return {
      ok: true,
      catalogo: {
        ...catalogo,
        agregadas: catalogo.agregadas.map((e) =>
          e.clave === objetivo
            ? {
                ...e,
                nombre: nombreNuevo ?? e.nombre,
                clave: claveNueva,
                cientifico:
                  cambios.cientifico !== undefined ? txt(cambios.cientifico) || null : e.cientifico,
              }
            : e,
        ),
      },
      mensaje: `Se actualizó «${nombreNuevo ?? propia.nombre}».`,
    };
  }

  const fabrica = especiesDeFabrica().find((f) => f.clave === objetivo);
  if (!fabrica) return { ok: false, motivo: "Esa especie no está en el catálogo." };
  return {
    ok: true,
    catalogo: {
      agregadas: [
        ...catalogo.agregadas,
        {
          nombre: nombreNuevo ?? fabrica.nombre,
          clave: claveNueva,
          cientifico: cambios.cientifico !== undefined ? txt(cambios.cientifico) || null : null,
          creadoPor: meta.usuario,
          creadoEn: meta.ahora ?? new Date().toISOString(),
        },
      ],
      ocultas: [...new Set([...catalogo.ocultas, objetivo])],
    },
    mensaje: `«${fabrica.nombre}» quedó como especie propia del aserradero${
      nombreNuevo && claveNueva !== objetivo ? `, con el nombre «${nombreNuevo}»` : ""
    }.`,
  };
}

/** Saca una especie de la lista: borra la propia, oculta la de fábrica. */
export function quitarEspecie(catalogo: CatalogoEspecies, clave: string): ResultadoCatalogo {
  const objetivo = claveEspecie(clave);
  const propia = catalogo.agregadas.find((e) => e.clave === objetivo);
  if (propia) {
    return {
      ok: true,
      catalogo: {
        agregadas: catalogo.agregadas.filter((e) => e.clave !== objetivo),
        /* Si tapaba a una de fábrica del mismo nombre, ésta vuelve a la lista:
           quitar lo propio no puede dejar un hueco donde antes había algo. */
        ocultas: catalogo.ocultas.filter((k) => k !== objetivo),
      },
      mensaje: `Se quitó «${propia.nombre}» del catálogo.`,
    };
  }
  const fabrica = especiesDeFabrica().find((f) => f.clave === objetivo);
  if (!fabrica) return { ok: false, motivo: "Esa especie no está en el catálogo." };
  if (catalogo.ocultas.includes(objetivo)) {
    return { ok: false, motivo: `«${fabrica.nombre}» ya estaba oculta.` };
  }
  return {
    ok: true,
    catalogo: { ...catalogo, ocultas: [...catalogo.ocultas, objetivo] },
    mensaje: `«${fabrica.nombre}» ya no se ofrece. Se puede volver a mostrar cuando haga falta.`,
  };
}

/** Vuelve a mostrar una de fábrica oculta. */
export function restaurarEspecie(catalogo: CatalogoEspecies, clave: string): ResultadoCatalogo {
  const objetivo = claveEspecie(clave);
  if (!catalogo.ocultas.includes(objetivo)) {
    return { ok: false, motivo: "Esa especie no está oculta." };
  }
  const fabrica = especiesDeFabrica().find((f) => f.clave === objetivo);
  return {
    ok: true,
    catalogo: { ...catalogo, ocultas: catalogo.ocultas.filter((k) => k !== objetivo) },
    mensaje: `«${fabrica?.nombre ?? objetivo}» vuelve a la lista.`,
  };
}

/** Las de fábrica que este tenant ocultó — para poder devolverlas. */
export function especiesOcultas(catalogo: CatalogoEspecies): EspecieDisponible[] {
  const ocultas = new Set(catalogo.ocultas);
  return especiesDeFabrica().filter((f) => ocultas.has(f.clave));
}

// ─── Lo que el libro ya tiene escrito ────────────────────────────────────────
//
// El catálogo empieza vacío y la planta ya lleva meses cargando. Pedirle que
// tipee de nuevo las especies que su propio libro repite todos los días es
// pedirle el trabajo dos veces — y es donde nacen las grafías que después no
// coinciden. Estas funciones son PURAS: leen lo que ya se escribió (el conteo
// sale de la DB) y dicen dos cosas: qué falta en el catálogo, y qué está
// escrito de más de una forma.

/** Una forma de escribir una especie, tal cual figura en el libro. */
export interface GrafiaEnElLibro {
  texto: string;
  usos: number;
}

/** Una especie del libro, con todas sus grafías juntas bajo la misma clave. */
export interface EspecieEnElLibro {
  clave: string;
  /** La grafía que se propone como la buena: la más usada. */
  nombre: string;
  /** El científico más usado de los que trae el libro, si alguno. */
  cientifico: string | null;
  /** Filas del libro que la nombran, sumando todas sus grafías. */
  usos: number;
  grafias: GrafiaEnElLibro[];
  /** `true` si el catálogo del tenant ya la ofrece. */
  enCatalogo: boolean;
}

/** Una fila cruda: un nombre escrito en el libro y cuántas veces aparece. */
export interface FilaDelLibro {
  nombre: string | null | undefined;
  cientifico?: string | null;
  usos: number;
}

/**
 * Entre dos grafías igual de usadas gana la que está escrita como se escribe un
 * nombre propio: «Tornillo» antes que «TORNILLO» o «tornillo». No es cosmética
 * —es la que va a quedar impresa en la guía— y es la que el operador reconoce.
 */
function mejorGrafia(a: GrafiaEnElLibro, b: GrafiaEnElLibro): number {
  if (a.usos !== b.usos) return b.usos - a.usos;
  const puntaje = (t: string) => {
    const primera = t.slice(0, 1);
    const resto = t.slice(1);
    if (primera === primera.toLocaleUpperCase("es") && resto !== resto.toLocaleUpperCase("es")) return 0;
    return 1;
  };
  const pa = puntaje(a.texto);
  const pb = puntaje(b.texto);
  if (pa !== pb) return pa - pb;
  return a.texto.localeCompare(b.texto, "es");
}

/**
 * Junta las filas del libro por clave normalizada y las contrasta con el
 * catálogo. Devuelve alfabético por el nombre propuesto.
 */
export function resumirEspeciesDelLibro(
  filas: readonly FilaDelLibro[],
  catalogo: CatalogoEspecies,
): EspecieEnElLibro[] {
  const enCatalogo = new Set(especiesDisponibles(catalogo).map((e) => e.clave));
  const porClave = new Map<
    string,
    { grafias: Map<string, number>; cientificos: Map<string, number>; usos: number }
  >();

  for (const f of filas) {
    const texto = txt(f.nombre);
    const clave = claveEspecie(texto);
    /* Sin nombre no hay especie. Las filas con la columna vacía existen —el
       libro admite huecos— pero no son una especie que dar de alta. */
    if (!clave) continue;
    const usos = Number.isFinite(f.usos) ? Math.max(0, Math.trunc(f.usos)) : 0;
    const acc = porClave.get(clave) ?? { grafias: new Map(), cientificos: new Map(), usos: 0 };
    acc.grafias.set(texto, (acc.grafias.get(texto) ?? 0) + usos);
    acc.usos += usos;
    const cientifico = txt(f.cientifico);
    if (cientifico) acc.cientificos.set(cientifico, (acc.cientificos.get(cientifico) ?? 0) + usos);
    porClave.set(clave, acc);
  }

  const salida: EspecieEnElLibro[] = [];
  for (const [clave, acc] of porClave) {
    const grafias = [...acc.grafias.entries()]
      .map(([texto, usos]) => ({ texto, usos }))
      .sort(mejorGrafia);
    const cientifico =
      [...acc.cientificos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0]?.[0] ??
      null;
    salida.push({
      clave,
      nombre: grafias[0]?.texto ?? clave,
      cientifico,
      usos: acc.usos,
      grafias,
      enCatalogo: enCatalogo.has(clave),
    });
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Las que el libro usa y el catálogo todavía no ofrece — las que hay que sembrar. */
export const especiesQueFaltan = (delLibro: readonly EspecieEnElLibro[]): EspecieEnElLibro[] =>
  delLibro.filter((e) => !e.enCatalogo);

/**
 * Las escritas de más de una forma: «Tornillo» y «TORNILLO» son dos filas
 * distintas en el mismo libro y una sola madera en el patio.
 */
export const especiesConVariasGrafias = (delLibro: readonly EspecieEnElLibro[]): EspecieEnElLibro[] =>
  delLibro.filter((e) => e.grafias.length > 1);

// ─── El catálogo de la planta, en los formularios del libro ──────────────────

/**
 * El nombre científico de una especie: primero lo que declaró ESTA planta,
 * después el catálogo del código.
 *
 * El orden importa. `data/forestry-species.ts` trae dieciocho especies con su
 * binomio y su CITES —dato de SERFOR, confiable—, pero no sabe qué es una
 * «Panguana» ni una «Yacuchapana», que es lo que entra por la GTF en esta
 * planta. Lo que el aserradero cargó a mano en su catálogo es una declaración
 * explícita suya: manda sobre la lista de fábrica y tapa el hueco de las que
 * ni siquiera están.
 */
export function cientificoDeEspecie(
  nombre: string,
  catalogo: CatalogoEspecies,
): string | null {
  const clave = claveEspecie(nombre);
  if (!clave) return null;
  const propia = especiesDisponibles(catalogo).find((e) => e.clave === clave);
  if (propia?.cientifico) return propia.cientifico;
  return findSpeciesByCommonName(nombre)?.scientificName ?? null;
}

/**
 * Las opciones del picker de especies: las de fábrica con su CITES, más las que
 * el aserradero agregó y el código no conoce.
 *
 * Las del código van con su ficha intacta —CITES y nivel de protección son
 * datos legales, no preferencias de la planta— y las propias entran detrás,
 * alfabéticas, con `cites: false`: decir que una especie NO es CITES porque el
 * catálogo local no lo dice sería inventarlo; lo que se evita es que el
 * operador tenga que elegir «Otro» y tipear el nombre cada vez.
 */
export function opcionesDeEspecie(catalogo: CatalogoEspecies): ForestrySpecies[] {
  const delCodigo = listSpecies({ includeOther: false });
  const conocidas = new Set(delCodigo.map((s) => claveEspecie(s.commonName)));
  const propias: ForestrySpecies[] = [];
  for (const e of especiesDisponibles(catalogo)) {
    if (conocidas.has(e.clave)) continue;
    conocidas.add(e.clave);
    propias.push({
      slug: `planta:${e.clave}`,
      commonName: e.nombre,
      scientificName: e.cientifico ?? "",
      cites: false,
      protectionLevel: "sin_restriccion",
      regions: [],
    });
  }
  const salida = [...delCodigo, ...propias].sort((a, b) =>
    a.commonName.localeCompare(b.commonName, "es"),
  );
  /* «Otro» siempre al final: es la salida de emergencia, no una especie. */
  const otro = listSpecies({ includeOther: true }).find((s) => s.slug === "otro");
  return otro ? [...salida, otro] : salida;
}
