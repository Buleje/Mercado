"use client";

/**
 * El alcance de Facturas y boletas (F34/F36): buscador global, período, tipo,
 * estado y origen en UNA fila pegada a la tabla; debajo, lo puesto como chips
 * con su «×», «Restablecer alcance» y las vistas guardadas de la persona.
 * Escribir o dar Enter sólo filtra: nada de acá emite ni guarda documentos.
 */
import { useState, type ReactNode, type RefObject } from "react";
import { Bookmark, Search, X } from "@buleje/design-system/icons";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { ResumenComprobantes } from "@/lib/comprobantes/resumen";
import { CLASE_SELECT, SelectorPeriodo } from "./SelectorPeriodo";
import {
  chipsDe,
  esAlcanceInicial,
  ESTADOS_FILTRABLES,
  FILTROS_INICIALES,
  ROTULO_ORIGEN,
  TIPOS_FILTRABLES,
  type FiltrosComprobantes,
  type OrigenFiltro,
} from "./filtros-comprobantes";
import { STATUS_META, TYPE_META, type DocStatus, type DocType } from "./tipos";
import { huellaDe, TOPE_VISTAS, useVistasGuardadas } from "./use-vistas-guardadas";

/* A 400 px los cuatro filtros van en una grilla de 2 × 2 (en una fila se aplastaban: «Tip» y un cuadrado). */
const FILTRO_EN_FILA = "mt-0! min-w-0 [&_summary]:h-12 [&_summary]:rounded-xl";
const CELDA_SELECT = "min-w-0 [&_select]:w-full sm:[&_select]:w-auto";
const CHIP_48 = "inline-flex h-12 max-w-full items-center rounded-xl border text-sm font-semibold";

/** Cuántos hay de cada tipo/estado en el alcance (sin el propio filtro). */
function cuentas(r: ResumenComprobantes | null) {
  const tipo: Record<DocType, number> = {
    boleta: 0,
    factura: 0,
    "nota-credito": 0,
    "nota-debito": 0,
    baja: 0,
  };
  const estado: Record<DocStatus, number> = {
    emitido: 0,
    aceptado: 0,
    pendiente: 0,
    rechazado: 0,
    anulado: 0,
  };
  if (!r) return { tipo, estado };
  tipo.boleta = r.boletas;
  tipo.factura = r.facturas;
  tipo["nota-credito"] = r.notas;
  tipo.baja = Math.max(0, r.documentos - r.boletas - r.facturas - r.notas);
  estado.pendiente = r.pendientes;
  estado.rechazado = r.rechazados;
  estado.anulado = r.anulados;
  estado.aceptado = Math.max(0, r.documentos - r.pendientes - r.rechazados - r.anulados);
  return { tipo, estado };
}

interface Props {
  filtros: FiltrosComprobantes;
  onCambiar: (f: FiltrosComprobantes) => void;
  facetas: ResumenComprobantes | null;
  refBuscar: RefObject<HTMLInputElement | null>;
  usuario: string | null;
  /** Lo que va al final de la fila (restablecer columnas). */
  extra?: ReactNode;
}

export function FiltrosComprobantes({
  filtros,
  onCambiar,
  facetas,
  refBuscar,
  usuario,
  extra,
}: Props) {
  const { tipo, estado } = cuentas(facetas);
  const poner = (parcial: Partial<FiltrosComprobantes>) => onCambiar({ ...filtros, ...parcial });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            ref={refBuscar}
            value={filtros.q}
            maxLength={80}
            onChange={(e) => poner({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault(); // Enter sólo busca (ya buscó al escribir)
              if (e.key === "Escape" && filtros.q) {
                e.stopPropagation();
                poner({ q: "" });
              }
            }}
            placeholder="Serie-número, cliente, RUC, #pedido o importe"
            aria-label="Buscar comprobante por serie y número, cliente, RUC, código del pedido, importe o estado"
            aria-keyshortcuts="/"
            data-qa="buscar-comprobante"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <SelectorPeriodo
            valor={filtros.periodo}
            onCambiar={(periodo) => poner({ periodo })}
            qa="comprobantes-periodo"
            className={CELDA_SELECT}
          />
          <FiltroColumnaMulti
            label="Tipo"
            value={filtros.tipos}
            options={TIPOS_FILTRABLES.map((t) => ({ value: t, count: tipo[t] }))}
            etiqueta={(v) => TYPE_META[v as DocType]?.label ?? v}
            onChange={(v) => poner({ tipos: TIPOS_FILTRABLES.filter((t) => v.includes(t)) })}
            placeholder="Tipo: todos"
            className={FILTRO_EN_FILA}
          />
          <FiltroColumnaMulti
            label="Estado"
            value={filtros.estados}
            options={ESTADOS_FILTRABLES.map((s) => ({ value: s, count: estado[s] }))}
            etiqueta={(v) => STATUS_META[v as DocStatus]?.label ?? v}
            onChange={(v) => poner({ estados: ESTADOS_FILTRABLES.filter((s) => v.includes(s)) })}
            placeholder="Estado: todos"
            className={FILTRO_EN_FILA}
          />
          <label className={cn("inline-flex items-center", CELDA_SELECT)}>
            <span className="sr-only">Origen</span>
            <select
              value={filtros.origen}
              data-qa="comprobantes-origen"
              onChange={(e) => poner({ origen: e.target.value as OrigenFiltro })}
              className={CLASE_SELECT}
            >
              <option value="">Origen: todos</option>
              <option value="pedido">{ROTULO_ORIGEN.pedido}</option>
              <option value="sin-pedido">{ROTULO_ORIGEN["sin-pedido"]}</option>
            </select>
          </label>
          {extra}
        </div>
      </div>
      <ChipsYVistas filtros={filtros} onCambiar={onCambiar} usuario={usuario} />
    </div>
  );
}

/** Lo puesto como chips + «Restablecer alcance» + las vistas guardadas (por persona). */
function ChipsYVistas({
  filtros,
  onCambiar,
  usuario,
}: Pick<Props, "filtros" | "onCambiar" | "usuario">) {
  const chips = chipsDe(filtros);
  const { vistas, guardar, borrar, listo } = useVistasGuardadas(usuario);
  const [lleno, setLleno] = useState(false);
  const huella = huellaDe(filtros);
  const yaGuardada = vistas.some((v) => huellaDe(v.filtros) === huella);
  if (chips.length === 0 && vistas.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-qa="alcance-comprobantes">
      {chips.map((c) => (
        <span
          key={c.clave}
          className={cn(CHIP_48, "border-primary/40 bg-primary/10 pl-3 text-[var(--text-primary)]")}
        >
          <span className="truncate">{c.rotulo}</span>
          <button
            type="button"
            onClick={() => onCambiar(c.quitar(filtros))}
            aria-label={`Quitar el filtro ${c.rotulo}`}
            className="inline-flex h-12 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
      ))}
      {!esAlcanceInicial(filtros) && (
        <>
          <button
            type="button"
            onClick={() => onCambiar(FILTROS_INICIALES)}
            data-qa="restablecer-alcance"
            className={button({ variant: "ghost", className: "rounded-xl" })}
          >
            Restablecer alcance
          </button>
          {listo && !yaGuardada && (
            <button
              type="button"
              onClick={() => setLleno(!guardar(filtros))}
              data-qa="guardar-vista"
              className={button({ variant: "secondary", className: "rounded-xl" })}
            >
              <Bookmark className="h-4 w-4" aria-hidden /> Guardar vista
            </button>
          )}
        </>
      )}
      {lleno && (
        <span className="text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          Tope de {TOPE_VISTAS} vistas: borra una para guardar otra.
        </span>
      )}
      {vistas.length > 0 && (
        <div
          role="group"
          aria-label="Vistas guardadas"
          className="flex flex-wrap items-center gap-2 sm:ml-auto"
        >
          <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            Vistas
            <InfoTip
              what="Alcances que guardaste: un clic y la tabla, las cifras y el Excel quedan con ese filtro. Son tuyas y viven en esta computadora."
              example="«Rechazado · Este mes» para revisar los rechazos cada lunes."
            />
          </span>
          {vistas.map((v) => {
            const activa = huellaDe(v.filtros) === huella;
            return (
              <span
                key={v.id}
                className={cn(
                  CHIP_48,
                  activa ? "border-primary bg-primary/10" : "border-[var(--rule-base)]",
                )}
              >
                <button
                  type="button"
                  aria-pressed={activa}
                  onClick={() => onCambiar(v.filtros)}
                  data-qa="vista-guardada"
                  className="h-12 max-w-[14rem] truncate rounded-xl pl-3 pr-1 text-left text-[var(--text-primary)]"
                  title={v.nombre}
                >
                  {v.nombre}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLleno(false);
                    borrar(v.id);
                  }}
                  aria-label={`Borrar la vista ${v.nombre}`}
                  className="inline-flex h-12 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
