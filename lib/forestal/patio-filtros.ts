/**
 * patio-filtros — cómo se acota la pila del patio desde la pantalla.
 *
 * Salió de `patio-resumen.ts` (ADR-431) al sumarle los filtros de días, medidas,
 * sin código y guía CITES: el resumen y el filtro son dos preguntas distintas y
 * juntas pasaban de 400 líneas. `patio-resumen` lo re-exporta todo, así que
 * quien importaba de ahí no cambia.
 *
 * PURO y client-safe.
 */

import { diametroDe, esSinCodigo, medidaPositiva, type TrozaConsumible } from "./consumo-trozas";
import { claveEspecie } from "./loth-constants";
import { grafiaPreferida } from "./especies-catalogo";
import { tramoDeTroza, tramosEnCero, type TramoDias } from "./patio-dias";

/**
 * Cómo se acota la pila desde la pantalla.
 *
 * Cada campo admite UNO o VARIOS valores (Brandon, 2026-09-01 para las guías;
 * el resto, 2026-09-10): «de esas 3 quiero 2». Sin esto, comparar dos especies
 * obligaba a mirar el patio dos veces y sumar a mano.
 *
 * `string` sigue valiendo —se lee como una lista de uno— para no romper a quien
 * ya llamaba con un valor suelto.
 */
export interface FiltroPatio {
  /** Busca por código de planta, codificación, parcela, especie, guía… */
  texto?: string;
  especie?: string | readonly string[];
  guia?: string | readonly string[];
  /** N° del título habilitante. */
  permiso?: string | readonly string[];
  /** N° de resolución que aprueba el plan de manejo. */
  resolucion?: string | readonly string[];
  proveedor?: string | readonly string[];
  /**
   * Tramos de días EN EL PATIO (`TramoDias`, ADR-431). OR entre tramos. Una
   * pieza sin fecha —o por recepcionar, que no está en el patio— no cae en
   * ningún tramo y queda fuera en cuanto se pide uno.
   */
  tramos?: readonly TramoDias[];
  /** Largo en metros, bordes incluidos. Con un borde puesto, la pieza SIN largo queda fuera. */
  largoM?: RangoPatio;
  /** Diámetro en cm (`diametroDe`), bordes incluidos. Sin dato → fuera. */
  diametroCm?: RangoPatio;
  /** Sólo las piezas sin codificación (vacía o «-»: `esSinCodigo`). */
  sinCodigo?: boolean;
  /** Sólo las de guía CITES (`guiaCites`: un derivado de la GUÍA, no de la troza). */
  cites?: boolean;
}

/** Un rango numérico. Un borde ausente (o no finito) no acota. */
export interface RangoPatio {
  min?: number;
  max?: number;
}

const borde = (v: number | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);

/** ¿El rango tiene al menos un borde? Sin bordes, no filtra nada. */
const acota = (r: RangoPatio | undefined): boolean => borde(r?.min) != null || borde(r?.max) != null;

const dentroDe = (r: RangoPatio, valor: number | null): boolean => {
  if (valor == null) return false;
  const min = borde(r.min);
  const max = borde(r.max);
  return (min == null || valor >= min) && (max == null || valor <= max);
};

/** Los valores elegidos de un campo, normalizados y sin vacíos. */
const elegidos = (v: string | readonly string[] | undefined): string[] =>
  (v == null ? [] : Array.isArray(v) ? v : [v as string]).map(norm).filter(Boolean);

const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * La ESPECIE se compara con `claveEspecie`, que es como la agrupan las facetas
 * y como el libro decide qué grafía guarda. Con `norm` a secas, la faceta decía
 * «3 piezas» (agrupadas por clave) y la tabla mostraba 2, porque el filtro no
 * sacaba el binomio entre paréntesis (auditoría 2026-09-11).
 */
const normEspecie = (v: string | null | undefined) => claveEspecie(v);

/**
 * Acota la pila. **Sin «sólo las libres»**: ése es un ayudante para elegir, no
 * un filtro de contenido, y si entrara acá los KPI dirían siempre «0 apartadas»
 * (ver `resumenPatio`).
 *
 * `ahora` sólo pesa si se piden tramos de días; los llamadores viejos sin él
 * siguen igual.
 */
export function filtrarPatio(
  trozas: readonly TrozaConsumible[],
  f: FiltroPatio,
  ahora: Date = new Date(),
): TrozaConsumible[] {
  const texto = norm(f.texto);
  const tramos = f.tramos ?? [];
  const porLargo = acota(f.largoM);
  const porDiametro = acota(f.diametroCm);
  const especies = elegidos(f.especie);
  const guias = elegidos(f.guia);
  const permisos = elegidos(f.permiso);
  const resoluciones = elegidos(f.resolucion);
  const proveedores = elegidos(f.proveedor);

  /* OR adentro de un campo, AND entre campos: el autofiltro de Excel. */
  const entra = (valores: string[], suyo: string | null | undefined) =>
    valores.length === 0 || valores.includes(norm(suyo));
  /* La especie por su clave, a los dos lados de la comparación. */
  const entraEspecie = (valores: string[], suyo: string | null | undefined) =>
    valores.length === 0 || valores.map(normEspecie).includes(normEspecie(suyo));

  return trozas.filter((t) => {
    if (!entraEspecie(especies, t.especieComun)) return false;
    if (!entra(guias, t.gtfNumber)) return false;
    if (!entra(permisos, t.permiso)) return false;
    if (!entra(resoluciones, t.resolucion)) return false;
    if (!entra(proveedores, t.proveedor)) return false;
    if (tramos.length > 0) {
      const suyo = tramoDeTroza(t, ahora);
      if (suyo == null || !tramos.includes(suyo)) return false;
    }
    if (porLargo && !dentroDe(f.largoM as RangoPatio, medidaPositiva(t.largoM))) return false;
    if (porDiametro && !dentroDe(f.diametroCm as RangoPatio, diametroDe(t))) return false;
    if (f.sinCodigo && !esSinCodigo(t)) return false;
    if (f.cites && t.guiaCites !== true) return false;
    if (texto) {
      const campos = [
        t.codigoPlanta, t.codificacion, t.parcela, t.especieComun,
        t.gtfNumber, t.proveedor, t.permiso, t.resolucion,
      ];
      if (!campos.some((c) => norm(c).includes(texto))) return false;
    }
    return true;
  });
}

/** Lo que hay para elegir en cada `<select>`, sacado de la pila entera. */
export interface OpcionesPatio {
  especies: string[];
  guias: string[];
  permisos: string[];
  resoluciones: string[];
  proveedores: string[];
}

/**
 * Las opciones salen de TODA la pila, no de lo ya filtrado: si se achicaran con
 * el filtro puesto, quitar uno no se podría deshacer desde el propio selector.
 */
export function opcionesDePatio(trozas: readonly TrozaConsumible[]): OpcionesPatio {
  const unicos = (get: (t: TrozaConsumible) => string | null | undefined) =>
    [...new Set(trozas.map((t) => (get(t) ?? "").trim()).filter(Boolean))].sort();
  return {
    /* La especie va por CLAVE: «Tornillo» y «TORNILLO» son una sola madera y
       ofrecerlas como dos opciones parte la pila en el selector (el filtro ya
       compara normalizado, así que la de más piezas las trae a las dos). */
    especies: especiesUnicas(trozas),
    guias: unicos((t) => t.gtfNumber),
    permisos: unicos((t) => t.permiso),
    resoluciones: unicos((t) => t.resolucion),
    proveedores: unicos((t) => t.proveedor),
  };
}

/** Las especies de la pila, una por clave, escritas con su mejor grafía. */
function especiesUnicas(trozas: readonly TrozaConsumible[]): string[] {
  const m = new Map<string, Map<string, number>>();
  for (const t of trozas) {
    const texto = (t.especieComun ?? "").trim();
    const clave = claveEspecie(texto);
    if (!clave) continue;
    const g = m.get(clave) ?? new Map<string, number>();
    g.set(texto, (g.get(texto) ?? 0) + 1);
    m.set(clave, g);
  }
  return [...m.values()]
    .map((g) => grafiaPreferida([...g.entries()].map(([texto, usos]) => ({ texto, usos }))))
    .sort((a, b) => a.localeCompare(b, "es"));
}

/** Un valor de una columna con cuántas piezas lo tienen. */
export interface FacetaPatio {
  value: string;
  count: number;
}

/** Cuántas piezas traen el dato y entre qué valores: `null` si ninguna lo trae. */
export interface RangoConDato {
  conDato: number;
  min: number | null;
  max: number | null;
}

/**
 * Las facetas de columna (listas con su peso) y las de los filtros nuevos
 * (ADR-431). Un control cuya faceta da 0 se ESCONDE: en Blas, diámetro, sin
 * código y guía CITES dan 0 de 77, y un filtro que no puede devolver nada
 * enseña a ignorar el panel entero.
 */
export type FacetasDePatio = Record<keyof OpcionesPatio, FacetaPatio[]> & {
  /** Piezas por tramo de días en el patio (`tramoDeTroza`: lo por recepcionar no tiene tramo). */
  tramos: Record<TramoDias, number>;
  largo: RangoConDato;
  diametro: RangoConDato;
  sinCodigo: number;
  /** De guía CITES. */
  cites: number;
};

function rangoDe(valores: readonly (number | null)[]): RangoConDato {
  let conDato = 0;
  let min: number | null = null;
  let max: number | null = null;
  for (const v of valores) {
    if (v == null) continue;
    conDato += 1;
    if (min == null || v < min) min = v;
    if (max == null || v > max) max = v;
  }
  return { conDato, min, max };
}

/**
 * Lo mismo que `opcionesDePatio`, pero con el PESO de cada valor: el autofiltro
 * de la cabecera (estilo Excel) elige por cuántas piezas hay detrás, y una
 * opción que devuelve cero es una trampa. De toda la pila, por lo mismo que
 * arriba. Orden: más piezas primero, empate por nombre.
 */
export function facetasDePatio(trozas: readonly TrozaConsumible[], ahora: Date = new Date()): FacetasDePatio {
  const contarEspecies = (): FacetaPatio[] => {
    const m = new Map<string, { grafias: Map<string, number>; count: number }>();
    for (const t of trozas) {
      const texto = (t.especieComun ?? "").trim();
      const clave = claveEspecie(texto);
      if (!clave) continue;
      const acc = m.get(clave) ?? { grafias: new Map<string, number>(), count: 0 };
      acc.grafias.set(texto, (acc.grafias.get(texto) ?? 0) + 1);
      acc.count += 1;
      m.set(clave, acc);
    }
    return [...m.values()]
      .map((v) => ({
        value: grafiaPreferida([...v.grafias.entries()].map(([texto, usos]) => ({ texto, usos }))),
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  const contar = (get: (t: TrozaConsumible) => string | null | undefined): FacetaPatio[] => {
    const m = new Map<string, number>();
    for (const t of trozas) {
      const v = (get(t) ?? "").trim();
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  return {
    especies: contarEspecies(),
    guias: contar((t) => t.gtfNumber),
    permisos: contar((t) => t.permiso),
    resoluciones: contar((t) => t.resolucion),
    proveedores: contar((t) => t.proveedor),
    ...facetasNuevas(trozas, ahora),
  };
}

function facetasNuevas(trozas: readonly TrozaConsumible[], ahora: Date) {
  const tramos = tramosEnCero();
  let sinCodigo = 0;
  let cites = 0;
  for (const t of trozas) {
    const tramo = tramoDeTroza(t, ahora);
    if (tramo) tramos[tramo] += 1;
    if (esSinCodigo(t)) sinCodigo += 1;
    if (t.guiaCites === true) cites += 1;
  }
  return {
    tramos,
    largo: rangoDe(trozas.map((t) => medidaPositiva(t.largoM))),
    diametro: rangoDe(trozas.map(diametroDe)),
    sinCodigo,
    cites,
  };
}
