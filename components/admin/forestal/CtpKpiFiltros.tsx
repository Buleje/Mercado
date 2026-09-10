"use client";

/**
 * La fila de filtros que gobierna los KPIs (ADR-400).
 *
 * Hasta ahora los KPIs decían el total del período y los filtros vivían en la
 * cabecera de las columnas de la tabla: para saber «cuánto entró de tornillo
 * por el permiso X» había que filtrar abajo y sumar a mano, o creerle a un
 * número que hablaba de otra cosa. Acá los filtros están PEGADOS a las cifras
 * que cambian, que es donde se hace la pregunta.
 *
 * Se combinan: elegir especie y permiso a la vez es la consulta real («de esa
 * madera, la de ese título»). Cada uno arranca en «todas», que es el período
 * completo — el estado de siempre.
 *
 * Es una pieza tonta: no sabe de ingresos ni de producción, sólo dibuja los
 * desplegables que le pasan. Las opciones salen de lo que HAY en el período,
 * no de un catálogo: un desplegable con nueve especies cuando el mes tuvo dos
 * obliga a adivinar cuál trae resultados.
 */

import { SlidersHorizontal, X } from "@buleje/design-system/icons";
import { CampoDeFiltro } from "./ctp-filtros-panel";
import { filtroActivo, valoresDe, type ValorFiltro } from "@/lib/forestal/ctp-secciones-filtro";

export interface OpcionKpiFiltro {
  value: string;
  label: string;
  /** Lo que se ve en chico al costado: «12 ingresos · 340.5 m³». */
  hint?: string;
}

export interface CampoKpiFiltro {
  key: string;
  label: string;
  /** Lo que dice la opción vacía: «Todas las especies». */
  todos: string;
  /** Uno o VARIOS valores (multi-selección, 2026-09-10). */
  valor: ValorFiltro;
  opciones: OpcionKpiFiltro[];
  onChange: (valor: string[]) => void;
  /**
   * `true` = de a uno. Es el caso de la bandeja de Ingresos: sus filtros viajan
   * al servidor (`?species=`) y la consulta admite un valor por campo, así que
   * la lista muestra redondeles y no casillas — prometer dos y aplicar uno sería
   * peor que ofrecer uno.
   */
  unico?: boolean;
}

export default function CtpKpiFiltros({
  campos,
  onLimpiar,
  nota,
}: {
  campos: CampoKpiFiltro[];
  onLimpiar: () => void;
  /** Qué está mirando ahora mismo, en una línea. */
  nota?: React.ReactNode;
}) {
  /* Un campo sin opciones no se dibuja: un desplegable vacío es una promesa
     que la pantalla no puede cumplir. */
  const visibles = campos.filter((c) => c.opciones.length > 0 || filtroActivo(c.valor));
  if (visibles.length === 0) return null;
  const activos = visibles.filter((c) => filtroActivo(c.valor)).length;

  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <span className="flex items-center gap-1.5 self-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filtrar los indicadores
      </span>

      {visibles.map((c) => (
        <div key={c.key} className="flex min-w-[11rem] flex-1 flex-col gap-1 sm:max-w-[15rem]">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {c.label}
          </span>
          <CampoDeFiltro
            label={c.label}
            value={c.valor}
            options={c.opciones}
            onChange={c.onChange}
            placeholder={c.todos}
            unico={c.unico}
            compacto
          />
        </div>
      ))}

      {activos > 0 && (
        <button
          type="button"
          onClick={onLimpiar}
          className="flex h-10 items-center gap-1.5 self-end rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]"
        >
          <X className="h-4 w-4" aria-hidden /> Ver todo
        </button>
      )}

      {/* Qué está mirando: sin esto, un KPI filtrado y uno sin filtrar se ven
          igual, y el número chico se lee como una caída del mes. */}
      {nota && activos > 0 && (
        <p className="w-full text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{nota}</p>
      )}
    </div>
  );
}

/**
 * Los campos de filtro de la BANDEJA de ingresos y su archivo (ADR-400).
 *
 * Los dos miran el mismo conjunto de datos con los mismos filtros de servidor
 * (`facetas` → `?species=`, `?permiso=`, …), así que arman la misma fila. Vivía
 * escrito una vez y copiarlo para el archivo habría dejado dos listas de campos
 * que se desincronizan a la primera faceta nueva.
 */
export function camposDeIngresos({
  stats,
  facetas,
  onFacetas,
  productLabel,
}: {
  stats: {
    species?: { value: string; count: number; volumeM3: number }[];
    providers?: { value: string; count: number; volumeM3: number }[];
    products?: { value: string; count: number; volumeM3: number }[];
    permisos?: { value: string; count: number; volumeM3: number; proveedores: string[]; resoluciones: string[] }[];
  } | null;
  facetas: { species?: string; provider?: string; product?: string; permiso?: string };
  onFacetas: (f: { species?: string; provider?: string; product?: string; permiso?: string }) => void;
  /** Cómo se escribe un tipo de producto para una persona. */
  productLabel: (v: string) => string;
}): CampoKpiFiltro[] {
  const nf = (n: number) => n.toLocaleString("es-PE");
  /* «asientos» dicho con todas las letras: en el archivo la tarjeta cuenta
     GUÍAS (documentos) y esto cuenta líneas del libro. Sin la palabra, «9 ·
     55.78 m³» al lado de una tarjeta que dice «8 guías» se lee como un error. */
  const peso = (f: { count: number; volumeM3: number }) =>
    `${nf(f.count)} ${f.count === 1 ? "asiento" : "asientos"} · ${f.volumeM3.toFixed(2)} m³`;
  return [
    {
      key: "species",
      label: "Especie",
      todos: "Todas las especies",
      valor: facetas.species,
      opciones: (stats?.species ?? []).map((f) => ({ value: f.value, label: f.value, hint: peso(f) })),
      onChange: (v) => onFacetas({ ...facetas, species: v[0] }),
      unico: true,
    },
    {
      key: "permiso",
      label: "Permiso (título habilitante)",
      todos: "Todos los permisos",
      valor: facetas.permiso,
      opciones: (stats?.permisos ?? []).map((f) => ({
        value: f.value,
        /* El código con su resolución y de quién vino: nadie se acuerda del
           número de contrato, se acuerda de «lo de Maderera X». */
        label: [f.value, f.resoluciones[0] ? `Res. ${f.resoluciones[0]}` : null, f.proveedores[0]]
          .filter(Boolean)
          .join(" · "),
        hint: peso(f),
      })),
      onChange: (v) => onFacetas({ ...facetas, permiso: v[0] }),
      unico: true,
    },
    {
      key: "provider",
      label: "Proveedor",
      todos: "Todos los proveedores",
      valor: facetas.provider,
      opciones: (stats?.providers ?? []).map((f) => ({ value: f.value, label: f.value, hint: peso(f) })),
      onChange: (v) => onFacetas({ ...facetas, provider: v[0] }),
      unico: true,
    },
    {
      key: "product",
      label: "Producto",
      todos: "Todos los productos",
      valor: facetas.product,
      opciones: (stats?.products ?? []).map((f) => ({
        value: f.value,
        label: productLabel(f.value),
        hint: nf(f.count),
      })),
      onChange: (v) => onFacetas({ ...facetas, product: v[0] }),
      unico: true,
    },
  ];
}

/** Lo que dice la nota del panel: qué se está mirando, en una línea. */
export function notaDeFiltros(campos: CampoKpiFiltro[]): string | null {
  const puestos = campos.filter((c) => filtroActivo(c.valor));
  if (puestos.length === 0) return null;
  return `Los indicadores muestran sólo ${puestos
    .map((c) => `${c.label.toLowerCase()}: ${valoresDe(c.valor).join(" o ")}`)
    .join(" · ")}`;
}
