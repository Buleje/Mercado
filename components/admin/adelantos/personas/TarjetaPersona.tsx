"use client";

/**
 * Una persona en la grilla.
 *
 * Antes mostraba nombre, adelantado y saldo. Faltaba lo que decide si conviene
 * volver a darle plata: cuánto de lo que sacó ya devolvió, cuándo fue la última
 * vez, y si hay algo a favor de ella. El teléfono estaba escrito pero no se
 * podía tocar.
 */

import { CheckCircle, MessageCircle, Pencil, Phone, Plus, Trash2 } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { estadoDeCredito, requiereAtencion } from "@/lib/adelantos/limite-credito";
import { cumplimientoDe } from "@/lib/adelantos/saldo-persona";
import { enlaceWhatsApp } from "@/lib/adelantos/contacto";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

/** Hace cuánto, en la unidad en que uno lo diría en voz alta. */
function hace(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(meses / 12);
  return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
}

export default function TarjetaPersona({
  persona: b,
  onVerFicha,
  onEditar,
  onEliminar,
  onAdelanto,
}: {
  persona: BeneficiarioConSaldo;
  onVerFicha: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  onAdelanto: () => void;
}) {
  const debe = b.saldoPendiente > 0;
  const credito = estadoDeCredito(b.limiteCredito, b.saldoPendiente);
  const cumplimiento = cumplimientoDe(b);
  const wa = enlaceWhatsApp(b.telefono, b.nombre, b.saldoPendiente);

  return (
    <div className="relative flex flex-col rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="absolute right-3 top-3 flex gap-1">
        <button
          onClick={onEditar}
          title="Editar"
          aria-label={`Editar a ${b.nombre}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onEliminar}
          title="Eliminar"
          aria-label={`Eliminar a ${b.nombre}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error)]/10 hover:text-[var(--data-error)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* `div role="button"` y no `<button>`: adentro vive el enlace `tel:` y un
          `<a>` no puede colgar de un botón — el navegador lo saca de ahí al
          parsear y React avisa del anidado inválido. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onVerFicha}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onVerFicha();
          }
        }}
        className="group flex cursor-pointer items-start gap-3 pr-16 text-left"
        title="Ver su ficha completa"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          {b.nombre.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold text-[var(--text-primary)] transition-colors group-hover:text-primary">
            {b.nombre}
          </span>
          {b.documento && <span className="block truncate text-sm tabular-nums text-[var(--text-tertiary)]">{b.documento}</span>}
          {/* El teléfono como enlace: en el celular del dueño, llamar es la
              acción que sigue. Antes era texto muerto. */}
          {b.telefono && (
            <a
              href={`tel:${b.telefono.replace(/\D/g, "")}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-sm tabular-nums text-[var(--text-tertiary)] hover:text-primary hover:underline"
            >
              <Phone className="h-3 w-3 shrink-0" aria-hidden /> {b.telefono}
            </a>
          )}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t-2 border-[var(--rule-soft)] pt-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">Adelantado</p>
          <p className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(b.totalAdelantado)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">Debe hoy</p>
          <p className={`text-base font-extrabold tabular-nums ${debe ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"}`}>
            {formatCurrency(b.saldoPendiente)}
          </p>
        </div>
      </div>

      {/* Cuánto de lo que sacó ya devolvió: la nota de comportamiento que antes
          había que deducir mirando la lista de adelantos uno por uno. */}
      {cumplimiento != null && (
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-[var(--text-tertiary)]">Cumplimiento</span>
            <span className="font-extrabold tabular-nums text-[var(--text-secondary)]">{cumplimiento}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className={`h-full rounded-full ${cumplimiento >= 70 ? "bg-[var(--data-success)]" : cumplimiento >= 30 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]"}`}
              style={{ width: `${cumplimiento}%` }}
            />
          </div>
        </div>
      )}

      {/* Lo que QUEDA de su tope, no lo que ya gastó: es lo que decide si se le
          puede adelantar de nuevo. */}
      {credito.estado !== "sin-limite" && (
        <p className={`mt-1.5 text-sm font-semibold ${requiereAtencion(credito) ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}`}>
          {credito.disponible > 0
            ? `Le queda ${formatCurrency(credito.disponible)} de ${formatCurrency(credito.limite)}`
            : `Sin margen · debe ${formatCurrency(credito.usado)} de un tope de ${formatCurrency(credito.limite)}`}
        </p>
      )}

      {b.saldoAFavor > 0 && (
        <p className="mt-1.5 text-sm font-semibold text-[var(--data-info)]">
          Te entregó {formatCurrency(b.saldoAFavor)} de más
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          {debe ? (
            <span className="inline-flex w-fit items-center rounded-full bg-[var(--data-warning)]/15 px-3 py-1 text-sm font-bold text-[var(--data-warning)]">
              {b.adelantosAbiertos} abierto{b.adelantosAbiertos === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--data-success)]/15 px-3 py-1 text-sm font-bold text-[var(--data-success)]">
              <CheckCircle className="h-4 w-4" /> Al día
            </span>
          )}
          {b.ultimoAdelanto && (
            <span className="text-xs text-[var(--text-tertiary)]">Último {hace(b.ultimoAdelanto)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAdelanto}
            className="inline-flex h-9 items-center gap-1 rounded-xl border-2 border-primary px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
          >
            <Plus className="h-4 w-4" /> Adelanto
          </button>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary"
              title={debe ? "Recordar el saldo por WhatsApp" : "Escribir por WhatsApp"}
              aria-label={`WhatsApp a ${b.nombre}`}
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
