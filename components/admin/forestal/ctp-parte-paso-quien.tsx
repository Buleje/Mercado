"use client";

/**
 * Paso 1 de la ficha del Directorio: qué papel cumple y quién es (documento,
 * padrón y nombre). Es lo que se llena primero y lo que decide los demás pasos.
 * Al editar, arriba va lo que ya se sabe de la parte: su saldo y lo que se le
 * compró — es lo primero que se mira al abrir una ficha existente.
 */

import { Download, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DOC_TIPOS, ROLES_PARTE, ROL_DESCRIPCION, ROL_LABEL, type DocTipo, type Parte } from "@/lib/forestal/directorio";
import { Btn, Field, I, Seccion } from "./ctp-shared";
import CtpParteSaldo from "./CtpParteSaldo";
import CtpTratoSinCobrar from "./CtpTratoSinCobrar";
import CtpParteNombreEsDocumento from "./ctp-parte-nombre-documento";
import { PendientesDelPaso } from "./ctp-parte-salud";
import type { ParteFormEstado } from "./hooks/use-parte-form";
import type { HistorialDeCompras } from "./hooks/use-historial-proveedor";

/** Un chip que se prende y se apaga: papel o categoría. 44 px de alto, borde fino y anillo al elegirlo. */
export const CHIP_BASE = "inline-flex min-h-11 items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors";
export const CHIP_ON = "border-[var(--accent)] bg-primary/10 ring-1 ring-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]";
export const CHIP_OFF =
  "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]";

export default function CtpPartePasoQuien({
  form,
  onUsarExistente,
}: {
  form: ParteFormEstado;
  onUsarExistente?: (p: Parte) => void;
}) {
  const { parte, b, set, docTipo, docMal, coincide, coincideBloquea, fuente, estado, parecidas, existentes, esCliente, saldo, historial } = form;
  return (
    <>
      {parte && (
        <div className="mb-3 space-y-2">
          <CtpParteSaldo saldo={saldo.saldo} onVerCuenta={() => void form.verCuenta()} />
          {/* Lo que su trato no cobró por la fecha (caso WASACO 23-09): explica el saldo. */}
          <CtpTratoSinCobrar parteId={esCliente ? parte.id : null} onCobrado={() => void saldo.recargar()} />
        </div>
      )}
      {historial && historial.guias > 0 && <LoQueCompraste historial={historial} />}
      <PendientesDelPaso pendientes={form.pendientesDe("quien")} />

      <Seccion title="Qué papel cumple" hint="Se puede marcar más de uno">
        <div className="sm:col-span-12 flex flex-wrap gap-2">
          {ROLES_PARTE.map((rol) => {
            const on = b.roles.includes(rol);
            return (
              <button
                key={rol}
                type="button"
                aria-pressed={on}
                title={ROL_DESCRIPCION[rol]}
                onClick={() => form.alternarRol(rol)}
                className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {ROL_LABEL[rol]}
              </button>
            );
          })}
        </div>
      </Seccion>

      <Seccion title="Identidad">
        <Field label="Tipo de documento" span={3}>
          <select className={I} value={docTipo} onChange={(e) => set({ docTipo: e.target.value as DocTipo })}>
            {DOC_TIPOS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field
          label="N° de documento"
          span={4}
          hint={docMal ?? (coincideBloquea ? "Ya es de otra ficha" : coincide ? "Ya existe — se va a combinar" : undefined)}
        >
          <input
            type="text"
            aria-invalid={coincideBloquea || docMal ? true : undefined}
            className={`${I} font-mono ${coincideBloquea || docMal ? "border-[var(--data-error-500)]" : ""}`}
            value={b.docNumero ?? ""}
            onChange={(e) => set({ docNumero: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-5 flex items-end">
          {fuente && (
            <Btn variant="secondary" disabled={!!docMal || !b.docNumero || estado !== "idle"} onClick={() => void form.traerDelPadron()}>
              {estado === "consultando" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              Traer de {fuente}
            </Btn>
          )}
        </div>
        <Field label="Nombre o razón social" required span={12}>
          <input type="text" className={I} value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} />
        </Field>
        <CtpParteNombreEsDocumento
          nombre={b.nombre ?? ""}
          idFicha={b.id ?? null}
          roles={b.roles}
          existentes={existentes}
          onCambiar={(v) => set(v)}
          onUsarExistente={onUsarExistente}
        />

        {parecidas.length > 0 && (
          <div className="col-span-12 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
            <p className="flex items-center gap-1 font-bold">
              {parecidas.length === 1 ? "Ya hay una ficha parecida" : `Ya hay ${parecidas.length} fichas parecidas`}
              <InfoTip
                title="Ficha parecida"
                what={
                  onUsarExistente
                    ? "Si es la misma, toca el botón y seguimos con esa."
                    : "Si es la misma, cancela y edita la que ya existe."
                }
                affects="Si de verdad son dos, sigue cargando: esto es sólo un aviso."
              />
            </p>
            <ul className="mt-1 space-y-0.5">
              {parecidas.slice(0, 3).map((p) => (
                <li key={p.id ?? p.nombre} className="truncate">
                  · {p.nombre}
                  {p.docNumero ? ` — ${p.docTipo ?? "Doc"} ${p.docNumero}` : " — sin documento"}
                </li>
              ))}
            </ul>
            {onUsarExistente && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {parecidas.slice(0, 3).map((p) => (
                  <button
                    key={`usar-${p.id ?? p.nombre}`}
                    type="button"
                    onClick={() => onUsarExistente(p)}
                    className="inline-flex min-h-11 items-center rounded-xl border border-[var(--data-warning-500)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--data-warning-700)] transition-colors hover:bg-[var(--data-warning-100)] dark:text-[var(--data-warning-500)] dark:hover:bg-[var(--data-warning-500)]/15"
                  >
                    Usar «{p.nombre.slice(0, 26)}»
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Seccion>
    </>
  );
}

/** Lo que el libro ya sabe de este proveedor (sólo al editar uno con guías). */
function LoQueCompraste({ historial }: { historial: HistorialDeCompras }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2 dark:border-[var(--data-info-500)]/30 dark:bg-[var(--data-info-500)]/12">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
        Lo que compraste
      </span>
      <span className="text-sm text-[var(--text-primary)]">
        <b className="font-mono tabular-nums">{historial.guias}</b> guía{historial.guias === 1 ? "" : "s"}
      </span>
      <span className="text-sm text-[var(--text-primary)]">
        <b className="font-mono tabular-nums">{Number(historial.ingresadoM3).toFixed(2)}</b> m³ ingresados
      </span>
      <span className="text-sm text-[var(--text-primary)]">
        <b className="font-mono tabular-nums">{Number(historial.enPatioM3).toFixed(2)}</b> m³ todavía en patio
      </span>
      {historial.guiasSinCosto > 0 && (
        <span className="text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <b className="font-mono tabular-nums">{historial.guiasSinCosto}</b> sin factura cargada
        </span>
      )}
      {historial.escritoComo && (
        <span className="w-full text-xs text-[var(--text-tertiary)]">
          En las guías está escrito «{historial.escritoComo}» — es el mismo titular con otro nombre.
        </span>
      )}
    </div>
  );
}
