"use client";

/** Piezas de «Nueva guía»: las etapas, las opciones tipo radio, los «Usar de nuevo» y el campo de texto. */
import type { ReactNode } from "react";
import { BlockTitle } from "@buleje/design-system";
import { Check, History } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import { CAMPO, ETIQUETA } from "./estilos";
import { PASOS_GUIA, type PasoGuia, type Pendiente } from "./guia-reglas";

/** Las 5 etapas: se salta a cualquiera; cada una muestra cuánto le falta. */
export function EtapasGuia({ paso, pendientes, onIr }: { paso: PasoGuia; pendientes: readonly Pendiente[]; onIr: (p: PasoGuia) => void }) {
  const actual = PASOS_GUIA.findIndex((p) => p.id === paso);
  // En celular van sólo los círculos, a todo el ancho, y la etapa se nombra
  // debajo: con el rótulo adentro la fila pasaba los ~360 px del cuerpo (17-10).
  return (
    <div>
      <ol className="flex items-center gap-1 sm:flex-wrap" aria-label="Etapas de la guía">
        {PASOS_GUIA.map((p, i) => {
          const faltan = p.id === "revisar" ? 0 : pendientes.filter((x) => x.paso === p.id).length;
          const esta = p.id === paso;
          return (
            <li key={p.id} className={cn("flex items-center gap-1", i < PASOS_GUIA.length - 1 && "max-sm:flex-1")}>
              <button
                type="button"
                onClick={() => onIr(p.id)}
                aria-current={esta ? "step" : undefined}
                aria-label={`${p.rotulo}${faltan ? `: faltan ${faltan}` : ""}`}
                data-qa={`guia-etapa-${p.id}`}
                className={cn(
                  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-2.5 text-sm font-semibold sm:px-2",
                  esta ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                    faltan > 0 && i < actual
                      ? "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]"
                      : i <= actual
                        ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  )}
                >
                  {faltan > 0 && i < actual ? "!" : i < actual ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className="max-sm:sr-only">{p.rotulo}</span>
              </button>
              {i < PASOS_GUIA.length - 1 && <span className={cn("h-0.5 max-sm:flex-1 sm:w-3", i < actual ? "bg-[var(--text-primary)]" : "bg-[var(--rule-base)]")} aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="text-sm font-semibold text-[var(--text-primary)] sm:hidden" aria-hidden>
        Etapa {actual + 1} de {PASOS_GUIA.length} · {PASOS_GUIA[actual]?.rotulo}
      </p>
    </div>
  );
}

export interface OpcionGuia<T extends string> {
  valor: T;
  rotulo: string;
  detalle?: string;
}

/** Una elección entre pocas opciones, con el estilo de «Emitir comprobante». */
export function OpcionesGuia<T extends string>({ rotulo, valor, opciones, onCambio }: { rotulo: string; valor: T; opciones: readonly OpcionGuia<T>[]; onCambio: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {opciones.map((o) => {
        const elegida = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={elegida}
            onClick={() => onCambio(o.valor)}
            data-qa={`guia-opcion-${o.valor}`}
            className={cn(
              "flex min-h-12 flex-col justify-center rounded-xl border px-3 py-2 text-left text-sm font-semibold",
              elegida ? "border-primary bg-primary/10 text-[var(--text-primary)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            {o.rotulo}
            {o.detalle && <span className="text-sm font-normal text-[var(--text-secondary)]">{o.detalle}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** «Usar de nuevo»: lo de guías anteriores, en un toque (se copia, la guía vieja no cambia). */
export function UsarDeNuevo<T>({ opciones, rotulo, onUsar }: { opciones: readonly T[]; rotulo: (o: T) => string; onUsar: (o: T) => void }) {
  if (opciones.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-sm text-[var(--text-tertiary)]">
        <History className="h-4 w-4" aria-hidden />
        Usar de nuevo
      </span>
      {opciones.map((o, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onUsar(o)}
          className="inline-flex h-12 max-w-full items-center rounded-xl border border-[var(--rule-base)] px-3 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        >
          <span className="truncate">{rotulo(o)}</span>
        </button>
      ))}
    </div>
  );
}

export function BloqueGuia({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <BlockTitle>{titulo}</BlockTitle>
        {extra}
      </div>
      {children}
    </section>
  );
}

interface CampoProps {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  tipo?: string;
  inputMode?: "numeric" | "decimal" | "text";
  maxLength?: number;
  className?: string;
  /** Deja pasar sólo números (RUC, DNI, bultos). */
  soloNumeros?: boolean;
}

export function CampoGuia({ etiqueta, valor, onCambio, placeholder, error, required, tipo = "text", inputMode, maxLength, className, soloNumeros }: CampoProps) {
  return (
    <Field label={etiqueta} labelClassName={ETIQUETA} required={required} error={error} className={className}>
      <input
        type={tipo}
        value={valor}
        inputMode={inputMode ?? (soloNumeros ? "numeric" : undefined)}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onCambio(soloNumeros ? e.target.value.replace(/\D/g, "") : e.target.value)}
        className={cn(CAMPO, error && "border-[var(--data-error-500)]")}
      />
    </Field>
  );
}

/** El error del campo, sólo si la etapa ya se recorrió (no se reta antes de escribir). */
export function errorDe(pendientes: readonly Pendiente[], visitada: boolean) {
  return (k: Pendiente["campo"]) => (visitada ? pendientes.find((p) => p.campo === k)?.texto : undefined);
}
