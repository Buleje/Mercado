"use client";

/**
 * «Completar datos» dentro de Personas (Brandon 30-10): las personas a las que
 * les falta el DNI/RUC, el celular o el tipo, una por fila, para escribirlo
 * todo de corrido sin abrir una ventana por persona. Enter baja a la fila de
 * abajo (Shift+Enter sube), Tab pasa al campo de al lado, y «Guardar N
 * cambios» guarda sólo las filas que cambiaron, una por una.
 */

import { useRef, useState, type KeyboardEvent } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ArrowLeft, CheckCircle, Loader2, Save } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { EmptyState } from "../../shared";
import { useCompletarLote } from "../../hooks/use-completar-lote";
import type { BeneficiarioConSaldo } from "../../crear-adelanto/tipos";
import FilaCompletar from "./FilaCompletar";

/** Enter = la misma columna de la fila de abajo (como en Excel). En la última, al botón de guardar. */
function moverConEnter(e: KeyboardEvent<HTMLTableSectionElement>, guardar: HTMLButtonElement | null) {
  if (e.key !== "Enter") return;
  const el = e.target as HTMLElement;
  const col = el.dataset.loteCol;
  const fila = Number(el.dataset.loteFila);
  if (!col || !Number.isFinite(fila)) return;
  e.preventDefault();
  const destino = e.currentTarget.querySelector<HTMLElement>(`[data-lote-fila="${fila + (e.shiftKey ? -1 : 1)}"][data-lote-col="${col}"]`);
  if (destino) {
    destino.focus();
    if (destino instanceof HTMLInputElement) destino.select();
  } else if (!e.shiftKey && guardar && !guardar.disabled) guardar.focus();
}

export default function CompletarLote({
  personas,
  onGuardado,
  onSalir,
}: {
  personas: readonly BeneficiarioConSaldo[];
  /** Hubo al menos una fila guardada: se relee la lista. */
  onGuardado: () => void;
  onSalir: () => void;
}) {
  const lote = useCompletarLote(personas, onGuardado);
  const guardarRef = useRef<HTMLButtonElement>(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const n = lote.pendientes;
  const guardadas = lote.filas.filter((f) => f.estado?.fase === "ok").length;
  const conError = lote.filas.filter((f) => f.estado?.fase === "error").length;

  const salir = () => (n > 0 && !confirmarSalida ? setConfirmarSalida(true) : onSalir());

  let pie: string;
  if (lote.progreso) pie = `Guardando ${lote.progreso.hechas} de ${lote.progreso.total}…`;
  else if (n > 0) pie = `${n} persona${n === 1 ? "" : "s"} sin guardar${lote.conAviso > 0 ? ` · ${lote.conAviso} con algo por revisar` : ""}`;
  else if (guardadas > 0 || conError > 0)
    pie = [guardadas > 0 && `${guardadas} guardada${guardadas === 1 ? "" : "s"}`, conError > 0 && `${conError} con error`].filter(Boolean).join(" · ");
  else pie = "Escribe en las filas; Enter baja a la siguiente.";

  return (
    <div className="space-y-3" data-completar-lote>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="whitespace-nowrap">Completar datos</CardTitle>
          <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
            {lote.filas.length} persona{lote.filas.length === 1 ? "" : "s"}
          </span>
          <InfoTip
            title="Completar datos"
            what="Las personas a las que les falta el DNI o RUC, el celular o qué son para tu negocio. Escribe en la fila y baja a la siguiente con Enter; Tab pasa al campo de al lado."
            affects="Se guarda sólo lo que cambiaste, persona por persona: si una falla, las demás se guardan igual y su fila dice por qué. Lo demás de la ficha (Yape, tope, notas, foto del DNI) queda como estaba."
            example="Escribes 45678912 en el DNI de Juan, Enter, y el cursor baja al DNI de la persona de abajo."
          />
        </div>
        <button type="button" onClick={salir} disabled={!!lote.progreso} className={button({ variant: "secondary", className: "ml-auto shrink-0 px-4" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>
            Volver<span className="max-sm:hidden"> a la lista</span>
          </span>
        </button>
      </div>

      {lote.filas.length === 0 ? (
        <EmptyState icon={CheckCircle} title="Nadie con datos por completar" hint="Todas tienen DNI o RUC, celular y tipo." />
      ) : (
        <DataTable className="[&_tbody_td]:py-1 [&_tbody_td]:align-middle">
          <thead>
            <tr>
              <th>Persona</th>
              <th>DNI o RUC</th>
              <th>Celular</th>
              <th>Tipo</th>
              <th>Cómo va</th>
            </tr>
          </thead>
          <tbody onKeyDown={(e) => moverConEnter(e, guardarRef.current)}>
            {lote.filas.map((f, i) => (
              <FilaCompletar key={f.persona.id} indice={i} fila={f} bloqueada={!!lote.progreso} onEscribir={lote.escribir} />
            ))}
          </tbody>
        </DataTable>
      )}

      {/* Pegado abajo: con 49 filas, el botón de guardar no queda a 2 pantallas.
          En el celular, justo encima de la barra de abajo del panel
          (`AdminMobileBottomBar`: 58 px + max(safe-area, 4 px)). */}
      <div
        className="sticky bottom-[calc(3.625rem+max(env(safe-area-inset-bottom),4px))] z-10 sm:bottom-0 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-md)]"
        data-pie-completar
      >
        {confirmarSalida && n > 0 ? (
          <>
            <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--data-warning-ink)]" role="alert">
              ¿Salir sin guardar {n === 1 ? "el cambio" : `los ${n} cambios`}?
            </p>
            <button type="button" onClick={() => setConfirmarSalida(false)} className={button({ variant: "secondary", className: "px-4" })}>
              Seguir aquí
            </button>
            <button type="button" onClick={onSalir} className={button({ variant: "ghost", className: "px-4 text-[var(--data-error-ink)]" })}>
              Salir sin guardar
            </button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-[var(--text-secondary)]" aria-live="polite">
              {pie}
            </p>
            <button ref={guardarRef} type="button" onClick={() => void lote.guardar()} disabled={n === 0 || !!lote.progreso} className={button({ className: "shrink-0 px-5" })}>
              {lote.progreso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              {n > 0 ? `Guardar ${n} cambio${n === 1 ? "" : "s"}` : "Guardar cambios"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
