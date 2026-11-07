"use client";

/**
 * «Volumen › Por troza» (Brandon 19-10): el patio pieza por pieza, recortado
 * por lo que se eligió en Volumen —las tarjetas de pila, el permiso y la
 * especie—. Lista las MISMAS trozas que cuenta la columna «N° trozas»
 * (`trozaEnVolumen`, una sola regla).
 *
 * Un solo filtro: el de Volumen. La lista de trozas filtra por el texto del
 * permiso tal cual («Sin título declarado» aparte) y Volumen por su clave; este
 * hook traduce en los dos sentidos, así elegir en la columna de la tabla mueve
 * el chip de arriba y al revés. Sin `alcance` (la vista suelta), cada filtro
 * vive acá como antes.
 */

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { clavePermiso } from "@/lib/forestal/productos-disponibles-resumen";
import { SIN_TITULO } from "@/lib/forestal/trozas-patio";
import {
  entraPorEspecie,
  entraPorPermiso,
  partesDePermiso,
  trozaDelFiltro,
  trozaEnVolumen,
  type FuenteVolumen,
} from "@/lib/forestal/volumen-disponible";

export interface AlcanceVolumen {
  fuentes: readonly FuenteVolumen[];
  permisos: readonly string[];
  especies: readonly string[];
  onPermisos: (claves: string[]) => void;
  onEspecies: (claves: string[]) => void;
  /** «Solo este permiso» (ADR-431): el patio se pide ya acotado, como lo pide Volumen. */
  contratoId?: string | null;
}

const SIN_ESPECIE = "Sin especie";
const unicos = (xs: readonly string[]) => [...new Set(xs)];

/** Valor de la lista → clave de Volumen, leído de las piezas (grafías distintas, misma clave). */
function mapaDeClaves<T extends TrozaConsumible>(todas: readonly T[]) {
  const titulo = new Map<string, string>();
  const especie = new Map<string, string>();
  for (const t of todas) {
    const p = (t.permiso ?? "").trim();
    titulo.set(p || SIN_TITULO, clavePermiso(p));
    especie.set((t.especieComun ?? "").trim() || SIN_ESPECIE, claveEspecie(t.especieComun));
  }
  return { titulo, especie };
}

export function useTrozasEnVolumen<T extends TrozaConsumible>(todas: T[], alcance?: AlcanceVolumen) {
  const [especieLocal, setEspecieLocal] = useState<string[]>([]);
  const [tituloLocal, setTituloLocal] = useState<string[]>([]);
  /** Ver también las que no suman (consumidas, despachadas, de otra pila). */
  const [verFuera, setVerFuera] = useState(false);
  const fuentes = alcance?.fuentes;
  const permisos = alcance?.permisos;
  const especies = alcance?.especies;

  const recorte = useMemo(() => {
    if (!fuentes || !permisos || !especies) return null;
    const delFiltro = todas.filter((t) => trozaDelFiltro(t, permisos, especies));
    const enVolumen = delFiltro.filter((t) => trozaEnVolumen(t, fuentes, [], []));
    const claves = mapaDeClaves(todas);
    const elegidos = (mapa: Map<string, string>, entra: (clave: string) => boolean, hay: boolean) =>
      hay ? [...mapa].filter(([, k]) => entra(k)).map(([v]) => v) : [];
    return {
      delFiltro,
      enVolumen,
      claves,
      titulo: elegidos(claves.titulo, (k) => entraPorPermiso(k, permisos), permisos.length > 0),
      especie: elegidos(claves.especie, (k) => entraPorEspecie(k, especies), especies.length > 0),
    };
  }, [todas, fuentes, permisos, especies]);

  if (!recorte || !alcance) {
    return {
      trozas: todas,
      especie: especieLocal,
      setEspecie: setEspecieLocal,
      titulo: tituloLocal,
      setTitulo: setTituloLocal,
      fuera: 0,
      verFuera,
      setVerFuera,
    };
  }
  return {
    trozas: verFuera ? recorte.delFiltro : recorte.enVolumen,
    especie: recorte.especie,
    setEspecie: (vals: string[]) =>
      alcance.onEspecies(unicos(vals.map((v) => recorte.claves.especie.get(v) ?? claveEspecie(v === SIN_ESPECIE ? "" : v)))),
    titulo: recorte.titulo,
    /* Una troza declara un título; si alguno trae «A · B», entra por cualquiera. */
    setTitulo: (vals: string[]) =>
      alcance.onPermisos(
        unicos(vals.flatMap((v) => (v === SIN_TITULO ? [""] : partesDePermiso(recorte.claves.titulo.get(v) ?? clavePermiso(v))))),
      ),
    fuera: recorte.delFiltro.length - recorte.enVolumen.length,
    verFuera,
    setVerFuera,
  };
}

/** Una línea: cuántas del permiso elegido no suman al volumen, y verlas o no. */
export function AvisoFueraDelVolumen({
  fuera,
  verFuera,
  onVerFuera,
}: {
  fuera: number;
  verFuera: boolean;
  onVerFuera: (si: boolean) => void;
}) {
  if (fuera <= 0) return null;
  const Icono = verFuera ? EyeOff : Eye;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
      <span>
        {verFuera ? "Se ven también" : "No se ven"}{" "}
        <b className="tabular-nums text-[var(--text-primary)]">{fuera}</b>{" "}
        {fuera === 1 ? "troza que no suma" : "trozas que no suman"} al volumen
      </span>
      <InfoTip
        title="Trozas que no suman al volumen"
        what="Las del mismo permiso y especie que ya no están para trabajar: entraron a una corrida, salieron despachadas, son descarte o madre retrozada, o están en una pila que no elegiste arriba."
        affects="«N° trozas» y el volumen no las cuentan. Míralas para buscar una pieza o revisar su historia."
        example="Una troza que entró a la corrida del jueves 16/10 ya no está en el patio: sale acá, no en el volumen."
      />
      <button
        type="button"
        onClick={() => onVerFuera(!verFuera)}
        aria-pressed={verFuera}
        className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
      >
        <Icono className="h-4 w-4" aria-hidden="true" />
        {verFuera ? "Ocultarlas" : "Verlas también"}
      </button>
    </div>
  );
}
