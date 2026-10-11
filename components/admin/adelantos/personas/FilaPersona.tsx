"use client";

/**
 * Una persona = una fila (patrón del panel, 11-10). Era una tarjeta de ~280 px
 * de alto en una grilla de tres, con cinco botones de 32-36 px (editar,
 * eliminar, adelanto, WhatsApp, teléfono): 12 personas = 1,96 pantallas y 42
 * botones bajos. La fila dice lo mismo —adelantado, te debe, cumplimiento,
 * tope, abiertos y el último— con UNA acción a la vista (Entregar, ADR-491) y
 * el resto en «⋯». Tocar el nombre abre su ficha, como antes la tarjeta.
 */

import { CheckCircle, Eye, HandCoins, MessageCircle, MoreHorizontal, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/currency";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { cumplimientoDe } from "@/lib/adelantos/saldo-persona";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { cuentaDePersona, hayDeuda } from "@/lib/adelantos/modos-alta";
import { MontosEnLineas, fmtMonedas } from "../shared";
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

export default function FilaPersona({
  persona: b,
  onVerFicha,
  onEditar,
  onEliminar,
  onAdelanto,
  onEntregar,
}: {
  persona: BeneficiarioConSaldo;
  onVerFicha: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  /** El formulario completo (plan de cuotas, lo que te adelantan a ti). */
  onAdelanto: () => void;
  /** «Entregar» (ADR-491) con la persona ya elegida; sin él, la acción es el formulario. */
  onEntregar?: () => void;
}) {
  /* `saldoPendiente` es lo DADO abierto: gobierna el tope, la cobranza y el
     recordatorio. «Te debe» / «Le debes» son las dos direcciones (ADR-448). */
  const debe = Object.values(b.saldoPendiente).some((v) => v > 0);
  const cuenta = cuentaDePersona(b);
  const leDebes = hayDeuda(cuenta.leDebes);
  const credito = estadoDeCredito(b.limiteCredito, saldoParaLimite(b.saldoPendiente));
  const cumplimiento = cumplimientoDe(b);
  /* Sólo lo DADO: a quien te pagó antes no se le recuerda «tu saldo pendiente». */
  const wa = enlaceWhatsAppConTexto(
    b.telefono,
    debe
      ? `Hola ${b.nombre}, te recuerdo que tienes un saldo pendiente de ${fmtMonedas(b.saldoPendiente)} por liquidar. ¡Gracias!`
      : `Hola ${b.nombre}, ¿cómo estás?`,
  );

  const acciones: MenuAccion[] = [
    { id: "ficha", label: "Ver su ficha", hint: "Sus adelantos, entregas y firmas", icon: Eye, onSelect: onVerFicha },
    ...(onEntregar ? [{ id: "nuevo", label: "Nuevo adelanto (formulario)", hint: "Plan de cuotas, permiso o lo que te adelantan a ti", icon: Plus, onSelect: onAdelanto }] : []),
    ...(wa
      ? [{ id: "wa", label: debe ? "Recordarle el saldo" : "Escribirle", hint: `WhatsApp · ${b.telefono}`, icon: MessageCircle, onSelect: () => void window.open(wa, "_blank", "noopener,noreferrer") }]
      : []),
    { id: "editar", label: "Editar", hint: "Nombre, documento, teléfono, tope", icon: Pencil, onSelect: onEditar },
    { id: "eliminar", label: "Eliminar", icon: Trash2, onSelect: onEliminar },
  ];

  return (
    <tr>
      <td>
        <button type="button" onClick={onVerFicha} title="Ver su ficha completa" className="group flex min-w-0 items-center gap-3 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden>
            {b.nombre.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-ink)] dark:group-hover:text-[var(--accent)]">{b.nombre}</span>
            {(b.documento || b.telefono) && (
              <span className="block truncate text-sm tabular-nums text-[var(--text-tertiary)]">{[b.documento, b.telefono].filter(Boolean).join(" · ")}</span>
            )}
          </span>
        </button>
      </td>
      <td className="text-right text-base font-semibold tabular-nums text-[var(--text-primary)]">
        <MontosEnLineas map={b.totalAdelantado} />
      </td>
      <td className="text-right">
        <span className={`block text-base font-extrabold tabular-nums ${hayDeuda(cuenta.teDebe) ? "text-[var(--data-warning-ink)]" : "text-[var(--data-success-ink)]"}`}>
          <MontosEnLineas map={cuenta.teDebe} />
        </span>
        {/* Lo que le debes: lo que te entregó de más + lo que te pagó antes o te prestó. */}
        {leDebes && (
          <span className="block text-sm font-semibold tabular-nums text-[var(--data-info-ink)]">
            Le debes <MontosEnLineas map={cuenta.leDebes} />
          </span>
        )}
      </td>
      <td>
        {/* Cuánto de lo que sacó ya devolvió, y lo que QUEDA de su tope: lo que
            decide si conviene volver a darle plata. */}
        {cumplimiento != null ? (
          <span className="flex items-center gap-2">
            <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--rule-base)]" aria-hidden>
              <span
                className={`block h-full rounded-full ${cumplimiento >= 70 ? "bg-[var(--data-success)]" : cumplimiento >= 30 ? "bg-[var(--data-warning)]" : "bg-[var(--data-error)]"}`}
                style={{ width: `${cumplimiento}%` }}
              />
            </span>
            <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">{cumplimiento}%</span>
          </span>
        ) : (
          <span className="text-sm text-[var(--text-tertiary)]">—</span>
        )}
        {credito.estado !== "sin-limite" && (
          <span
            title={`Tope de ${formatCurrency(credito.limite)}; debe ${formatCurrency(credito.usado)}`}
            className={`block whitespace-nowrap text-sm font-semibold tabular-nums ${requiereAtencion(credito) ? "text-[var(--data-error-ink)]" : "text-[var(--text-tertiary)]"}`}
          >
            {credito.disponible > 0 ? `Le queda ${formatCurrency(credito.disponible)}` : "Sin margen"}
          </span>
        )}
      </td>
      <td>
        {debe ? (
          <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[var(--data-warning)]/15 px-3 py-1 text-sm font-bold text-[var(--data-warning-ink)]">
            {b.adelantosAbiertos} abierto{b.adelantosAbiertos === 1 ? "" : "s"}
          </span>
        ) : leDebes ? (
          <span className="inline-flex items-center rounded-full bg-[var(--data-info-500)]/12 px-3 py-1 text-sm font-bold text-[var(--data-info-ink)]">Le debes</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success)]/15 px-3 py-1 text-sm font-bold text-[var(--data-success-ink)]">
            <CheckCircle className="h-4 w-4" aria-hidden /> Al día
          </span>
        )}
        {b.ultimoAdelanto && <span className="mt-0.5 block whitespace-nowrap text-sm text-[var(--text-tertiary)]">Último {hace(b.ultimoAdelanto)}</span>}
      </td>
      <td>
        <span className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onEntregar ?? onAdelanto}
            aria-label={`Entregarle un adelanto a ${b.nombre}`}
            className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl px-3" })}
          >
            <HandCoins className="h-4 w-4" aria-hidden /> Entregar
          </button>
          <ActionMenu label={`Más sobre ${b.nombre}`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" />
        </span>
      </td>
    </tr>
  );
}
