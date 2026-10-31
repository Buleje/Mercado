"use client";

/**
 * Buscador + chips de situación de Personas, en UNA fila pegada a la tabla.
 * Salió de `PersonasView` (30-10) cuando el orden se fue a los encabezados: el
 * desplegable «Orden: saldo» ya no cabía al lado de los chips y bajaba solo a
 * una fila propia. Los chips son los mismos de Cobranza (`chipSituacion`).
 */

import { Search } from "@buleje/design-system/icons";
import { ORDENES, type FiltroPersonas, type OrdenPersonas } from "@/lib/adelantos/ordenar-personas";
import { chipSituacion as chip } from "../shared";

/** Las seis maneras de ordenar, dichas como uno las pediría. */
const ETIQUETA_ORDEN: Record<OrdenPersonas, string> = {
  saldo: "Orden: quien más te debe",
  riesgo: "Orden: más cerca del tope",
  nombre: "Orden: por nombre",
  adelantado: "Orden: más adelantado",
  cumplimiento: "Orden: quien menos devolvió",
  reciente: "Orden: último adelanto",
};

export default function BarraPersonas({
  q,
  onQ,
  filtro,
  onFiltro,
  orden,
  onOrden,
  cuentas,
}: {
  q: string;
  onQ: (v: string) => void;
  filtro: FiltroPersonas;
  onFiltro: (f: FiltroPersonas) => void;
  orden: OrdenPersonas;
  /** Sólo en el celular: ahí la tabla es tarjetas y no hay encabezados para ordenar. */
  onOrden: (o: OrdenPersonas) => void;
  /** Cuántas personas hay en cada situación (un chip en cero no se muestra, salvo Todas y Al día). */
  cuentas: { todas: number; deben: number; riesgo: number; sinTelefono: number; faltanDatos: number; hayTopes: boolean };
}) {
  const c = cuentas;
  const boton = (f: FiltroPersonas, texto: string) => (
    <button key={f} type="button" aria-pressed={filtro === f} className={chip(filtro === f)} onClick={() => onFiltro(f)}>
      {texto}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
      <div className="relative flex-1 sm:max-w-sm" style={{ minWidth: 240 }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Buscar por nombre, documento o teléfono…"
          aria-label="Buscar persona"
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base text-[var(--text-primary)] outline-none focus:border-primary"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por situación">
        {boton("todas", `Todas ${c.todas}`)}
        {c.deben > 0 && boton("deben", `Deben ${c.deben}`)}
        {boton("al-dia", `Al día ${c.todas - c.deben}`)}
        {/* Sólo si hay topes cargados y alguien sin margen, sin teléfono o con
            datos por completar: un filtro que siempre da cero enseña a no confiar. */}
        {c.hayTopes && c.riesgo > 0 && boton("riesgo", `Sin margen ${c.riesgo}`)}
        {c.sinTelefono > 0 && boton("sin-telefono", `Sin teléfono ${c.sinTelefono}`)}
        {c.faltanDatos > 0 && boton("faltan-datos", `Faltan datos ${c.faltanDatos}`)}
      </div>
      {/* Bajo 640 px las filas son tarjetas (`.admin-mobile-cards` esconde el
          thead): sin esto, en el celular no se podía ordenar. Arriba, se ordena
          desde los encabezados y el desplegable no ocupa una fila. */}
      <select
        value={orden}
        onChange={(e) => onOrden(e.target.value as OrdenPersonas)}
        aria-label="Ordenar personas"
        className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base font-semibold text-[var(--text-primary)] outline-none focus:border-primary sm:hidden"
      >
        {ORDENES.filter((o) => o !== "riesgo" || c.hayTopes).map((o) => (
          <option key={o} value={o}>
            {ETIQUETA_ORDEN[o]}
          </option>
        ))}
      </select>
    </div>
  );
}
