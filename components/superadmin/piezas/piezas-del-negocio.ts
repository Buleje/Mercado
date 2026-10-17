/**
 * Qué se le ofrece a cada negocio, sin pantalla de por medio (ADR-457/458).
 * La tabla de todos y la ficha de UN negocio leen de acá, para que digan lo
 * mismo: una página propia es de UN negocio, y una pieza hecha para otro rubro
 * se muestra aparte.
 */
import { ENCHUFE_PAGINA } from "@/extensiones/_contrato";
import type { FilaDeLaMatriz, PiezaDelCatalogo } from "@/lib/extensiones/resolver";

/** `tienda.pagina` es la página entera de `/t/<negocio>`: sus piezas son exclusivas de un negocio. */
export const esEnchufePagina = (enchufe: string): boolean => enchufe === ENCHUFE_PAGINA;

/** El catálogo con lo que el servidor suma de la página propia (de quién es, si ya la tiene alguien). */
export type PiezaDeCatalogoUI = PiezaDelCatalogo & { duenoPagina?: { tenantId: string; nombre: string } | null };

export interface DuenoDePagina {
  tenantId: string;
  nombre: string;
}

/** De quién es una página propia: lo que dice el catálogo, y si no, la fila que ya la tiene asignada (aunque esté apagada). */
export function duenoDePagina(pieza: PiezaDeCatalogoUI, matriz: readonly FilaDeLaMatriz[]): DuenoDePagina | null {
  if (pieza.duenoPagina) return pieza.duenoPagina;
  const fila = matriz.find((f) => f.piezaId === pieza.id && esEnchufePagina(f.enchufe));
  return fila ? { tenantId: fila.tenantId, nombre: fila.tenantNombre } : null;
}

export type Pertenencia = { tipo: "libre" } | { tipo: "propia" } | { tipo: "de-otro"; dueno: string };

/** ¿Esta columna es de este negocio? Sólo las páginas propias tienen dueño; el resto sirve a cualquiera. */
export function pertenencia(
  pieza: PiezaDeCatalogoUI,
  enchufe: string,
  tenantId: string,
  matriz: readonly FilaDeLaMatriz[],
): Pertenencia {
  if (!esEnchufePagina(enchufe)) return { tipo: "libre" };
  const dueno = duenoDePagina(pieza, matriz);
  if (!dueno) return { tipo: "libre" };
  return dueno.tenantId === tenantId ? { tipo: "propia" } : { tipo: "de-otro", dueno: dueno.nombre };
}

/** La pieza dice para qué rubros se hizo y el negocio no es de ninguno (sin `rubros`, sirve a todos). */
export function esDeOtroRubro(pieza: Pick<PiezaDelCatalogo, "rubros">, industry: string | null | undefined): boolean {
  return pieza.rubros.length > 0 && !pieza.rubros.includes(industry ?? "");
}

export interface Oferta {
  pieza: PiezaDeCatalogoUI;
  enchufe: string;
  fila?: FilaDeLaMatriz;
}

export interface OfertaDelNegocio {
  /** Su página propia (la que ya es suya, prendida o apagada). */
  pagina: Oferta | null;
  /** Páginas propias sin dueño: cualquiera puede quedar de este negocio, a elección. */
  paginasLibres: Oferta[];
  /** Piezas de su rubro o de todos. */
  delRubro: Oferta[];
  /** Hechas para otro rubro: disponibles igual. */
  deOtroRubro: Oferta[];
  /** Filas de este negocio cuya pieza ya no existe en el código. */
  huerfanas: FilaDeLaMatriz[];
}

/** Todo lo que se le puede prender a UN negocio, ya repartido para la ficha. */
export function ofertaDelNegocio(
  catalogo: readonly PiezaDeCatalogoUI[],
  matriz: readonly FilaDeLaMatriz[],
  negocio: { id: string; industry?: string | null },
): OfertaDelNegocio {
  const filaDe = (p: string, e: string) => matriz.find((f) => f.tenantId === negocio.id && f.piezaId === p && f.enchufe === e);
  const oferta: OfertaDelNegocio = { pagina: null, paginasLibres: [], delRubro: [], deOtroRubro: [], huerfanas: matriz.filter((f) => f.tenantId === negocio.id && f.huerfana) };
  for (const pieza of catalogo) {
    for (const enchufe of pieza.enchufes) {
      const p = pertenencia(pieza, enchufe, negocio.id, matriz);
      if (p.tipo === "de-otro") continue;
      const o: Oferta = { pieza, enchufe, fila: filaDe(pieza.id, enchufe) };
      if (esEnchufePagina(enchufe)) {
        // Las libres se listan TODAS: elegir por el superadmin, nunca «la primera».
        if (p.tipo === "propia") oferta.pagina = o;
        else oferta.paginasLibres.push(o);
      } else if (esDeOtroRubro(pieza, negocio.industry)) oferta.deOtroRubro.push(o);
      else oferta.delRubro.push(o);
    }
  }
  return oferta;
}
