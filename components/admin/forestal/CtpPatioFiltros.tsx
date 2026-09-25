"use client";

/**
 * La barra de filtros del patio — una sola, y de una sola fila (ADR-347/431).
 *
 * Vive DENTRO de la tarjeta de la tabla que filtra (2026-09-24, «datos
 * dispersos»: era una banda suelta entre las cifras y la tabla, con el lote
 * mezclado). El lote y el día pasaron al encabezado de la tarjeta, como su
 * acción; acá queda **sólo lo que se usa siempre**: la búsqueda, «Filtros» y
 * «Solo libres», en un renglón. Lo que tiene columna —guía, permiso, especie, días en
 * el patio, largo y diámetro— se filtra desde la cabecera de la tabla (estilo
 * Excel); en el celular la tabla es tarjetas, así que ahí también va en el
 * panel. «Filtros» guarda lo especializado: sin código, guía CITES, resolución
 * y proveedor, y cada control se ESCONDE si su faceta da 0 (en Blas diámetro,
 * CITES y sin código dan 0 de 77: un filtro que no puede devolver nada enseña a
 * ignorar el panel).
 *
 * Lo puesto se ve como chip que se saca de un clic: nunca hay un filtro
 * escondido que explique por qué falta madera.
 */

import { useId, useState } from "react";
import { Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { ETIQUETA_TRAMO_DIAS, TRAMOS_DIAS, type TramoDias } from "@/lib/forestal/patio-resumen";
import { formatNumber } from "@/lib/format";
import type { EstadoFiltroPatio, RangoFiltro } from "./hooks/use-filtro-patio";
import { CampoDeFiltro } from "./ctp-filtros-panel";

/** El campo de la barra (h-12, borde 2 px): lo comparten el buscador y la fecha. */
export const CLASE_CAMPO_PATIO =
  "h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "text-sm font-bold text-[var(--text-secondary)]";
const CASILLA = "h-6 w-6 shrink-0 cursor-pointer accent-[var(--accent)]";

/** Un campo multi del panel con su rótulo; sin opciones no se dibuja. */
function Multi({ etiqueta, valor, onCambio, todos, opciones, className = "" }: {
  etiqueta: string;
  valor: readonly string[];
  onCambio: (v: string[]) => void;
  todos: string;
  opciones: { value: string; label?: string; count?: number }[];
  className?: string;
}) {
  if (opciones.length === 0 && valor.length === 0) return null;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className={ROTULO} aria-hidden>{etiqueta}</span>
      <CampoDeFiltro label={etiqueta} value={valor} options={opciones} onChange={onCambio} placeholder={todos} />
    </div>
  );
}

/** Un rango con su unidad; oculto si ninguna troza trae el dato. */
function RangoPanel({ etiqueta, unidad, valor, onCambio, conDato, className = "" }: {
  etiqueta: string;
  unidad: string;
  valor: RangoFiltro;
  onCambio: (r: RangoFiltro) => void;
  conDato: number;
  className?: string;
}) {
  if (conDato === 0 && valor.min == null && valor.max == null) return null;
  const leer = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const campo = `${CLASE_CAMPO_PATIO} w-28`;
  return (
    <fieldset className={`flex flex-col gap-1 ${className}`}>
      <legend className={ROTULO}>{etiqueta} ({unidad})</legend>
      <div className="flex items-center gap-2">
        <input type="number" inputMode="decimal" step="0.1" value={valor.min ?? ""} placeholder="desde"
          aria-label={`${etiqueta} desde, en ${unidad}`} className={campo}
          onChange={(e) => onCambio({ min: leer(e.target.value), max: valor.max })} />
        <span className="text-sm text-[var(--text-secondary)]">–</span>
        <input type="number" inputMode="decimal" step="0.1" value={valor.max ?? ""} placeholder="hasta"
          aria-label={`${etiqueta} hasta, en ${unidad}`} className={campo}
          onChange={(e) => onCambio({ min: valor.min, max: leer(e.target.value) })} />
      </div>
    </fieldset>
  );
}

/** Un «solo X» con su cuenta; oculto si no hay ninguna. */
function Interruptor({ texto, cuantas, valor, onCambio }: {
  texto: string;
  cuantas: number;
  valor: boolean;
  onCambio: (v: boolean) => void;
}) {
  if (cuantas === 0 && !valor) return null;
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]">
      <input type="checkbox" checked={valor} onChange={(e) => onCambio(e.target.checked)} className={CASILLA} />
      <span>{texto} <span className="tabular-nums text-[var(--text-secondary)]">({formatNumber(cuantas)})</span></span>
    </label>
  );
}

const rangoTexto = (r: RangoFiltro, u: string) =>
  r.min != null && r.max != null ? `${r.min}–${r.max} ${u}` : r.min != null ? `≥ ${r.min} ${u}` : `≤ ${r.max} ${u}`;

export default function CtpPatioFiltros({ filtro }: { filtro: EstadoFiltroPatio }) {
  const { facetas, set } = filtro;
  const [abierto, setAbierto] = useState(false);
  const idBuscar = useId();
  const idPanel = useId();
  /* Lo que tiene columna en la tabla: en el panel sólo en el celular. */
  const soloMovil = "sm:hidden";

  /* Un chip por VALOR, con el campo en su nombre accesible. */
  const chips: { campo: string; valor: string; quitar: () => void }[] = [
    ...(filtro.texto.trim() ? [{ campo: "Búsqueda", valor: filtro.texto.trim(), quitar: () => set.texto("") }] : []),
    ...filtro.especie.map((v) => ({ campo: "Especie", valor: v, quitar: () => set.especie(filtro.especie.filter((x) => x !== v)) })),
    ...filtro.guia.map((v) => ({ campo: "Guía", valor: v, quitar: () => set.guia(filtro.guia.filter((x) => x !== v)) })),
    ...filtro.permiso.map((v) => ({ campo: "Permiso", valor: v, quitar: () => set.permiso(filtro.permiso.filter((x) => x !== v)) })),
    ...filtro.resolucion.map((v) => ({ campo: "Resolución", valor: v, quitar: () => set.resolucion(filtro.resolucion.filter((x) => x !== v)) })),
    ...filtro.proveedor.map((v) => ({ campo: "Proveedor", valor: v, quitar: () => set.proveedor(filtro.proveedor.filter((x) => x !== v)) })),
    ...filtro.tramos.map((t) => ({ campo: "Días en el patio", valor: ETIQUETA_TRAMO_DIAS[t], quitar: () => set.tramos(filtro.tramos.filter((x) => x !== t)) })),
    ...(filtro.largo.min != null || filtro.largo.max != null ? [{ campo: "Largo", valor: rangoTexto(filtro.largo, "m"), quitar: () => set.largo({ min: null, max: null }) }] : []),
    ...(filtro.diametro.min != null || filtro.diametro.max != null ? [{ campo: "Diámetro", valor: rangoTexto(filtro.diametro, "cm"), quitar: () => set.diametro({ min: null, max: null }) }] : []),
    ...(filtro.sinCodigo ? [{ campo: "Sin código", valor: "sí", quitar: () => set.sinCodigo(false) }] : []),
    ...(filtro.cites ? [{ campo: "Guía CITES", valor: "sí", quitar: () => set.cites(false) }] : []),
  ];

  const tramos = TRAMOS_DIAS.filter((t) => facetas.tramos[t] > 0 || filtro.tramos.includes(t)).map((t) => ({
    value: t, label: ETIQUETA_TRAMO_DIAS[t], count: facetas.tramos[t],
  }));
  const especializado =
    facetas.sinCodigo + facetas.cites + facetas.resoluciones.length + facetas.proveedores.length > 0 ||
    filtro.sinCodigo || filtro.cites || filtro.resolucion.length + filtro.proveedor.length > 0;
  const deColumna = facetas.especies.length + facetas.guias.length + facetas.permisos.length + tramos.length > 0;
  const n = filtro.cuantosFiltros;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* El rótulo va para el lector: la lupa y el texto de ayuda ya dicen qué es. */}
        <div className="relative min-w-[min(100%,16rem)] flex-1">
          <label htmlFor={idBuscar} className="sr-only">Buscar en el patio</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input id={idBuscar} type="search" value={filtro.texto} onChange={(e) => set.texto(e.target.value)}
            placeholder="Buscar por código, guía o proveedor…" className={`${CLASE_CAMPO_PATIO} pl-9`} />
        </div>

        <div className="flex gap-2 max-sm:w-full">
          {(especializado || deColumna) && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              aria-controls={idPanel}
              className={`flex h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border-2 px-4 text-sm font-semibold sm:flex-none text-[var(--text-primary)] transition-colors ${
                n > 0 || abierto ? "border-[var(--accent)]" : "border-[var(--rule-base)] hover:border-[var(--accent)]"
              } ${especializado ? "" : "sm:hidden"}`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtros
              {n > 0 && (
                <span className="rounded-full bg-primary/15 px-2 text-sm tabular-nums">
                  {n}<span className="sr-only"> {n === 1 ? "filtro activo" : "filtros activos"}</span>
                </span>
              )}
            </button>
          )}
          <label className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm text-[var(--text-primary)] sm:flex-none">
            <input type="checkbox" checked={filtro.soloLibres} onChange={(e) => set.soloLibres(e.target.checked)} className={CASILLA} />
            Solo libres
          </label>
        </div>
      </div>

      {/* Desplegado: se cierra sólo a mano — quien abre para afinar toca dos seguidos. */}
      {abierto && (
        <div id={idPanel} role="group" aria-label="Filtros del patio"
          className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Multi className={soloMovil} etiqueta="Especie" todos="Todas las especies" valor={filtro.especie} onCambio={set.especie}
            opciones={facetas.especies.map((f) => ({ value: f.value, count: f.count }))} />
          <Multi className={soloMovil} etiqueta="Guía de ingreso" todos="Todas las guías" valor={filtro.guia} onCambio={set.guia}
            opciones={facetas.guias.map((f) => ({ value: f.value, count: f.count }))} />
          <Multi className={soloMovil} etiqueta="Permiso" todos="Todos los permisos" valor={filtro.permiso} onCambio={set.permiso}
            opciones={facetas.permisos.map((f) => ({ value: f.value, count: f.count }))} />
          <Multi className={soloMovil} etiqueta="Días en el patio" todos="Todos los tramos" valor={filtro.tramos}
            onCambio={(v) => set.tramos(v as TramoDias[])} opciones={tramos} />
          <RangoPanel className={soloMovil} etiqueta="Largo" unidad="m" valor={filtro.largo} onCambio={set.largo} conDato={facetas.largo.conDato} />
          <RangoPanel className={soloMovil} etiqueta="Diámetro" unidad="cm" valor={filtro.diametro} onCambio={set.diametro} conDato={facetas.diametro.conDato} />
          <Interruptor texto="Solo sin código" cuantas={facetas.sinCodigo} valor={filtro.sinCodigo} onCambio={set.sinCodigo} />
          <Interruptor texto="Solo de guía CITES" cuantas={facetas.cites} valor={filtro.cites} onCambio={set.cites} />
          <Multi etiqueta="Resolución" todos="Todas las resoluciones" valor={filtro.resolucion} onCambio={set.resolucion}
            opciones={facetas.resoluciones.map((f) => ({ value: f.value, count: f.count }))} />
          <Multi etiqueta="Proveedor" todos="Todos los proveedores" valor={filtro.proveedor} onCambio={set.proveedor}
            opciones={facetas.proveedores.map((f) => ({ value: f.value, count: f.count }))} />
          <p className="hidden text-sm text-[var(--text-secondary)] sm:block sm:col-span-2 lg:col-span-4">
            Guía, permiso, especie, días en el patio y medidas se filtran <b className="text-[var(--text-primary)]">desde su encabezado en la tabla</b>.
          </p>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={`${c.campo}:${c.valor}`}
              type="button"
              onClick={c.quitar}
              aria-label={`Quitar filtro ${c.campo}: ${c.valor}`}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border-2 border-[var(--accent)] bg-primary/10 px-2.5 py-1 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-primary/20"
            >
              <span className="font-normal text-[var(--text-secondary)]">{c.campo}:</span> {c.valor}
              <X className="h-4 w-4" aria-hidden />
            </button>
          ))}
          <button type="button" onClick={filtro.limpiar}
            className="inline-flex min-h-8 items-center px-1 text-sm font-bold text-[var(--text-primary)] underline underline-offset-2">
            Quitar filtros
          </button>
        </div>
      )}
    </div>
  );
}
