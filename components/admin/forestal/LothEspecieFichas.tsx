"use client";

/**
 * Una ficha por especie: todo lo que el plan dice de ella, en un solo lugar.
 *
 * Antes la misma especie vivía en TRES tablas apiladas —«Control por especie»,
 * «Balance de extracción» y «Especies autorizadas»— con columnas que se
 * solapaban: «autorizado 80.00» estaba repetido en las tres. Para saber cómo
 * iba el Tornillo había que bajar por tres cuadros y cruzarlos de memoria.
 *
 * Acá cada especie es una fila que cuenta su historia de izquierda a derecha
 * —autorizado → censado → talado → movilizado— con la barra de cuánto se
 * ejecutó y el saldo que queda. El detalle que no se mira todos los días
 * (árboles, precio, pago por derecho de aprovechamiento) se abre a un click.
 *
 * El orden lo manda el semáforo: lo que está fuera del plan aparece primero,
 * porque es lo que hay que resolver antes de emitir una GTF.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Pencil, Printer, ShieldAlert, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";

export interface FichaEspecie {
  species: string;
  cites: boolean;
  autorizada: boolean;
  autorizadoM3: number;
  autorizadoArboles: number | null;
  censadoCount: number;
  censadoVolM3: number;
  taladoCount: number;
  /** m³ talados según el balance (no la cuenta de árboles). */
  taladoM3: number;
  movilizado: number;
  saldo: number;
  pctEjecutado: number;
  /** Lo que vale lo movilizado y lo que se paga por derecho, si hay precio. */
  valorSoles: number | null;
  pagoDerechoSoles: number | null;
  precioM3: number | null;
  venM3: number | null;
  /** Motivos por los que la especie está en rojo o ámbar. */
  motivos: string[];
  tone: "ok" | "warn" | "danger";
  /** id de la especie autorizada, para editar/borrar. `null` si no está en el plan. */
  speciesId: string | null;
}

const TONO = {
  ok: {
    Icono: CheckCircle2,
    punto: "bg-[var(--data-success-500)]",
    texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    fila: "",
  },
  warn: {
    Icono: AlertTriangle,
    punto: "bg-[var(--data-warning-500)]",
    texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    fila: "bg-[var(--data-warning-500)]/8",
  },
  danger: {
    Icono: ShieldAlert,
    punto: "bg-[var(--data-error-500)]",
    texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    fila: "bg-[var(--data-error-500)]/10",
  },
} as const;

const m3 = (n: number) => n.toFixed(2);
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** Un eslabón de la cadena: rótulo arriba, número abajo, tabular para alinear. */
function Paso({ label, valor, sub, apagado }: { label: string; valor: string; sub?: string; apagado?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`font-mono text-sm font-bold tabular-nums ${apagado ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
        {valor}
      </p>
      {sub && <p className="truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}

export default function LothEspecieFichas({
  fichas,
  pagoArea,
  pagoDerechoTotal,
  valorTotal,
  onEditar,
  onBorrar,
  onImprimir,
  onAgregar,
}: {
  fichas: FichaEspecie[];
  pagoArea: number | null;
  pagoDerechoTotal: number | null;
  valorTotal: number | null;
  onEditar?: (speciesId: string) => void;
  onBorrar?: (speciesId: string) => void;
  onImprimir?: () => void;
  onAgregar?: () => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div className="min-w-0">
          <CardTitle as="h3" className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Especies del plan
          </CardTitle>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
            Lo autorizado contra lo censado, talado y movilizado — con su saldo
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onImprimir && (
            <button
              type="button"
              onClick={onImprimir}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
          )}
          {onAgregar && (
            <button
              type="button"
              onClick={onAgregar}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-success-700)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              + Agregar
            </button>
          )}
        </div>
      </header>

      <ul className="divide-y divide-[var(--rule-soft)]">
        {fichas.map((f) => {
          const t = TONO[f.tone];
          const abierto = abierta === f.species;
          /* La barra se corta en 100 pero el número se dice entero: pasarse del
             autorizado es exactamente el dato que no hay que esconder. */
          const pct = Math.max(0, Math.min(100, f.pctEjecutado));
          return (
            <li key={f.species} className={t.fila}>
              <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-12">
                {/* Identidad */}
                <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.punto}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">{f.species}</p>
                    <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-semibold">
                      {f.cites && <span className="rounded bg-[var(--data-warning-500)]/20 px-1 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">CITES</span>}
                      {!f.autorizada ? (
                        <span className={t.texto}>fuera del plan</span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">
                          {f.autorizadoArboles != null ? `${f.censadoCount}/${f.autorizadoArboles} árb.` : `${f.censadoCount} árb.`}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* La cadena, de izquierda a derecha */}
                <div className="col-span-2 grid grid-cols-4 gap-3 sm:col-span-5">
                  <Paso label="Autoriz." valor={f.autorizada ? m3(f.autorizadoM3) : "—"} apagado={!f.autorizada} />
                  <Paso label="Censado" valor={m3(f.censadoVolM3)} apagado={f.censadoVolM3 === 0} />
                  <Paso label="Talado" valor={m3(f.taladoM3)} apagado={f.taladoM3 === 0} />
                  <Paso label="Movilizado" valor={m3(f.movilizado)} apagado={f.movilizado === 0} />
                </div>

                {/* Ejecución y saldo */}
                <div className="col-span-2 sm:col-span-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Ejecutado
                    </span>
                    <span className={`font-mono text-sm font-bold tabular-nums ${f.pctEjecutado > 100 ? TONO.danger.texto : "text-[var(--text-primary)]"}`}>
                      {f.pctEjecutado.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <div
                      className={`h-full rounded-full ${f.pctEjecutado > 100 ? "bg-[var(--data-error-500)]" : "bg-[var(--data-success-500)]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    saldo <span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{m3(f.saldo)}</span> m³
                  </p>
                </div>

                {/* Abrir el detalle */}
                <div className="col-span-2 flex justify-end sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => setAbierta(abierto ? null : f.species)}
                    aria-expanded={abierto}
                    aria-label={`${abierto ? "Cerrar" : "Ver"} el detalle de ${f.species}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Los motivos van SIEMPRE visibles: son la razón del color, y un
                  semáforo sin explicación se aprende a ignorar. */}
              {f.motivos.length > 0 && (
                <ul className={`space-y-0.5 px-4 pb-3 text-xs font-semibold ${t.texto}`}>
                  {f.motivos.map((m) => (
                    <li key={m} className="flex items-start gap-1.5">
                      <t.Icono className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      {m}
                    </li>
                  ))}
                </ul>
              )}

              {abierto && (
                <div className="grid grid-cols-2 gap-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60 px-4 py-3 sm:grid-cols-4">
                  <Paso label="Árboles autorizados" valor={f.autorizadoArboles != null ? String(f.autorizadoArboles) : "—"} sub={`${f.taladoCount} talado(s)`} />
                  <Paso label="Precio / m³" valor={f.precioM3 != null ? soles(f.precioM3) : "—"} sub={f.venM3 != null ? `VEN ${soles(f.venM3)}` : undefined} />
                  <Paso label="Valor movilizado" valor={f.valorSoles != null ? soles(f.valorSoles) : "—"} />
                  <Paso label="Pago por derecho" valor={f.pagoDerechoSoles != null ? soles(f.pagoDerechoSoles) : "—"} />
                  {f.speciesId && (onEditar || onBorrar) && (
                    <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
                      {onEditar && (
                        <button
                          type="button"
                          onClick={() => onEditar(f.speciesId!)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                      )}
                      {onBorrar && (
                        <button
                          type="button"
                          onClick={() => onBorrar(f.speciesId!)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--data-error-500)]/40 px-3 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Quitar del plan
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {(valorTotal != null || pagoDerechoTotal != null) && (
        <footer className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t-2 border-[var(--rule-base)] px-4 py-2.5 text-xs">
          {valorTotal != null && (
            <span className="text-[var(--text-tertiary)]">
              Valor movilizado <b className="font-mono tabular-nums text-[var(--text-primary)]">{soles(valorTotal)}</b>
            </span>
          )}
          {pagoArea != null && (
            <span className="text-[var(--text-tertiary)]">
              Pago por área <b className="font-mono tabular-nums text-[var(--text-primary)]">{soles(pagoArea)}</b>
            </span>
          )}
          {pagoDerechoTotal != null && (
            <span className="text-[var(--text-tertiary)]">
              Pago derecho total <b className="font-mono tabular-nums text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{soles(pagoDerechoTotal)}</b>
            </span>
          )}
        </footer>
      )}
    </section>
  );
}
