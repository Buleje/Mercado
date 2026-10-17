"use client";

/**
 * Un cliente en «Quién debe»: cuánto debe, desde cuándo, qué prometió, cuándo
 * se lo gestionó por última vez y cuánto de su límite ya usó; con anotar,
 * llamar, escribir y cobrar a un toque.
 *
 * Port de la fila de Adelantos. Sin el caso "sin teléfono": en Fiados el
 * teléfono ES la clave del cliente (`customerId`), así que siempre está.
 * 10-10: absorbió la fila de «Quién te debe» del Resumen (fecha de inicio,
 * uso del límite y «Cobrar»), que repetía esta misma lista.
 */
import { DollarSign, MessageCircle, NotebookPen, Phone } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { waLink } from "@/lib/whatsapp-link";
import { diasSinGestion, etiquetaGestion, type Gestion, type PromesaVigente } from "@/lib/fiados/gestion-cobranza";
import { explicarAtraso, type DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diaLeido } from "../fechas";
import { anotarRecordatorio } from "../recordar";

const hace = (dias: number) => (dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} d`);

const BOTON_ICONO =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";

const PASTILLA = "rounded-full px-2 py-0.5 text-sm font-bold";

export default function FilaDeudor({
  deudor: d,
  promesa,
  ultima,
  cumplimiento,
  limite,
  desde,
  enTanda,
  onTanda,
  onAnotar,
  onCobrar,
  onVerCuenta,
  onEscrito,
  mensaje,
}: {
  deudor: DeudorCobranza;
  promesa?: PromesaVigente;
  ultima?: Gestion;
  /** % histórico de puntualidad; null si nunca tuvo un fiado cerrado. */
  cumplimiento: number | null;
  /** Límite de crédito del cliente (0 = sin tope). */
  limite: number;
  /** Cuándo abrió el fiado más viejo que todavía debe. */
  desde: string | null;
  enTanda: boolean;
  onTanda: (v: boolean) => void;
  onAnotar: () => void;
  onCobrar: () => void;
  /** Abre su cuenta entera (compras, abonos, gestiones) en la ficha lateral. */
  onVerCuenta?: () => void;
  /** Se anotó el recordatorio en la bitácora (para refrescar «anotado hoy»). */
  onEscrito?: () => void;
  /** El texto que se le manda, según su tramo de atraso. */
  mensaje: string;
}) {
  const wa = waLink(d.telefono, mensaje);
  const sinGestion = diasSinGestion(ultima);
  const uso = limite > 0 ? Math.round((d.saldo / limite) * 100) : null;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
      <label className="flex h-12 w-8 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" checked={enTanda} onChange={(e) => onTanda(e.target.checked)} aria-label={`Sumar a ${d.nombre} a la ronda`} className="h-5 w-5" />
      </label>

      <span className="min-w-0 flex-1 basis-56">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {onVerCuenta ? (
            <button type="button" onClick={onVerCuenta} title="Ver su cuenta: compras, abonos y gestiones" data-qa="cobranza-ver-cuenta"
              className="truncate text-left text-base font-bold text-[var(--text-primary)] underline-offset-4 hover:text-[var(--accent-ink)] hover:underline dark:hover:text-[var(--accent)]">
              {d.nombre}
            </button>
          ) : (
            <span className="truncate text-base font-bold text-[var(--text-primary)]">{d.nombre}</span>
          )}
          {cumplimiento != null && (
            <span
              title={`Pagó a tiempo el ${cumplimiento} % de sus fiados cerrados`}
              className={cn(
                PASTILLA,
                "tabular-nums",
                cumplimiento >= 70
                  ? "bg-[var(--data-success)]/15 text-[var(--data-success-ink)]"
                  : cumplimiento >= 30
                    ? "bg-[var(--data-warning)]/15 text-[var(--data-warning-ink)]"
                    : "bg-[var(--data-error)]/15 text-[var(--data-error-ink)]",
              )}
            >
              paga a tiempo {cumplimiento} %
            </span>
          )}
          {promesa && (
            <span
              className={cn(
                PASTILLA,
                promesa.estado === "incumplio"
                  ? "bg-[var(--data-error)]/15 text-[var(--data-error-ink)]"
                  : promesa.estado === "vence-hoy"
                    ? "bg-[var(--data-warning)]/15 text-[var(--data-warning-ink)]"
                    : "bg-[var(--data-info)]/15 text-[var(--data-info-ink)]",
              )}
            >
              {promesa.estado === "incumplio"
                ? `Prometió y no cumplió (${hace(-promesa.faltan)})`
                : promesa.estado === "vence-hoy"
                  ? "Prometió pagar HOY"
                  : `Prometió en ${promesa.faltan} d`}
            </span>
          )}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[var(--text-secondary)]">
          {desde && <span>desde {diaLeido(desde)}</span>}
          {d.dias > 0 && (
            <span className={d.base === "vencimiento" ? "font-semibold text-[var(--data-error-ink)]" : undefined}>{explicarAtraso(d)}</span>
          )}
          <span>
            {!ultima
              ? "sin gestionar"
              : promesa && ultima.id === promesa.gestion.id
                ? `anotado ${hace(sinGestion ?? 0)}`
                : `${etiquetaGestion(ultima.tipo)} ${hace(sinGestion ?? 0)}`}
          </span>
        </span>
        {ultima?.nota && <span className="mt-0.5 block truncate text-sm italic text-[var(--text-secondary)]">«{ultima.nota}»</span>}
      </span>

      {uso !== null && (
        <span className="w-32 shrink-0" title={`Usa ${formatCurrency(d.saldo)} de su límite de ${formatCurrency(limite)}`}>
          <span className="block h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <span
              className={cn("block h-full rounded-full", uso >= 100 ? "bg-[var(--data-error-500)]" : uso >= 80 ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent)]")}
              style={{ width: `${Math.min(100, uso)}%` }}
            />
          </span>
          <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{uso} % del límite</span>
        </span>
      )}

      <span className="w-28 shrink-0 text-right text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(d.saldo)}</span>

      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onAnotar} title="Anotar qué pasó" aria-label={`Anotar gestión de ${d.nombre}`} className={BOTON_ICONO}>
          <NotebookPen className="h-5 w-5" aria-hidden />
        </button>
        <a href={`tel:${d.telefono.replace(/\D/g, "")}`} title="Llamar" aria-label={`Llamar a ${d.nombre}`} className={BOTON_ICONO}>
          <Phone className="h-5 w-5" aria-hidden />
        </a>
        <a href={wa ?? "#"} target="_blank" rel="noopener noreferrer"
          onClick={() => { if (wa) void anotarRecordatorio(d.telefono).then((ok) => { if (ok) onEscrito?.(); }); }}
          title="Escribir por WhatsApp con tu mensaje de este tramo" aria-label={`Escribir a ${d.nombre} por WhatsApp`}
          className={cn(BOTON_ICONO, "bg-primary/12 text-[var(--accent-ink)] dark:text-[var(--accent)]")}>
          <MessageCircle className="h-5 w-5" aria-hidden />
        </a>
        <button type="button" onClick={onCobrar} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4 font-bold" })}>
          <DollarSign className="h-4 w-4" aria-hidden /> Cobrar
        </button>
      </span>
    </li>
  );
}
