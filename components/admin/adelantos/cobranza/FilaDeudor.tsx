"use client";

/**
 * Un deudor en la lista de cobranza.
 *
 * La fila vieja repetía «Sin fecha pactada: 0 días desde que se dio el
 * adelanto» en nueve de cada diez líneas: un texto que dice lo mismo para casi
 * todos no informa, tapa. Acá el atraso sólo se enuncia cuando existe, y lo que
 * ocupa el lugar es lo que decide a quién llamar primero: cuánto debe, qué
 * prometió y hace cuánto que nadie lo toca.
 */

import { AlertTriangle, MessageCircle, NotebookPen, Phone } from "@buleje/design-system/icons";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { fmtMon } from "../shared";
import {
  diasSinGestion,
  etiquetaGestion,
  type Gestion,
  type PromesaVigente,
} from "@/lib/adelantos/gestion-cobranza";
import type { DeudorCobranza } from "@/lib/adelantos/urgencia-cobranza";
import { explicarAtraso } from "@/lib/adelantos/urgencia-cobranza";

const hace = (dias: number) => (dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} d`);

export default function FilaDeudor({
  deudor: d,
  promesa,
  ultima,
  cumplimiento,
  enTanda,
  onTanda,
  onAnotar,
  onCargarTelefono,
  mensaje,
}: {
  deudor: DeudorCobranza;
  promesa?: PromesaVigente;
  ultima?: Gestion;
  /** % histórico devuelto por esta persona; null si nunca sacó nada. */
  cumplimiento: number | null;
  enTanda: boolean;
  onTanda: (v: boolean) => void;
  onAnotar: () => void;
  onCargarTelefono: () => void;
  /** El texto que se le manda, según su tramo de atraso. */
  mensaje: string;
}) {
  /* El texto lo elige la lista según el tramo de atraso: no se le escribe
     igual a quien se pasó tres días que a quien debe hace tres meses. */
  const wa = enlaceWhatsAppConTexto(d.telefono, mensaje);
  const sinGestion = diasSinGestion(ultima);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 py-3">
      <input
        type="checkbox"
        checked={enTanda}
        disabled={!d.telefono}
        onChange={(e) => onTanda(e.target.checked)}
        aria-label={`Sumar a ${d.nombre} a la ronda`}
        className="h-5 w-5 shrink-0 disabled:opacity-30"
      />

      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        {d.nombre.charAt(0).toUpperCase()}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-base font-bold text-[var(--text-primary)]">{d.nombre}</span>
          {/* Cómo se portó históricamente: a quien siempre paga se le da tiempo;
              a quien nunca, no. Sin historial no se lo etiqueta. */}
          {cumplimiento != null && (
            <span
              title={`Devolvió el ${cumplimiento}% de lo que sacó`}
              className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                cumplimiento >= 70
                  ? "bg-[var(--data-success)]/15 text-[var(--data-success)]"
                  : cumplimiento >= 30
                    ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]"
                    : "bg-[var(--data-error)]/15 text-[var(--data-error)]"
              }`}
            >
              {cumplimiento}%
            </span>
          )}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          {/* El atraso sólo se enuncia cuando LO HAY. */}
          {d.dias > 0 && (
            <span className={d.dias > 60 ? "font-semibold text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}>
              {explicarAtraso(d)}
            </span>
          )}
          {promesa && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                promesa.estado === "incumplio"
                  ? "bg-[var(--data-error)]/15 text-[var(--data-error)]"
                  : promesa.estado === "vence-hoy"
                    ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]"
                    : "bg-[var(--data-info)]/15 text-[var(--data-info)]"
              }`}
            >
              {promesa.estado === "incumplio"
                ? `Prometió y no cumplió (${hace(-promesa.faltan)})`
                : promesa.estado === "vence-hoy"
                  ? "Prometió pagar HOY"
                  : `Prometió en ${promesa.faltan} d`}
            </span>
          )}
          {/* Qué se hizo la última vez: sin esto había que recordarlo.
              Si esa última gestión es la promesa que ya se muestra en el chip,
              acá va sólo CUÁNDO se anotó: «Prometió pagar hoy» junto a
              «Prometió en 3 d» se lee como que prometió para hoy, que es
              exactamente lo contrario de lo que dijo. */}
          <span className="text-[var(--text-tertiary)]">
            {!ultima
              ? "sin gestionar"
              : promesa && ultima.id === promesa.gestion.id
                ? `anotado ${hace(sinGestion ?? 0)}`
                : `${etiquetaGestion(ultima.tipo)} · ${hace(sinGestion ?? 0)}`}
          </span>
        </span>
        {ultima?.nota && (
          <span className="mt-0.5 block truncate text-sm italic text-[var(--text-tertiary)]">«{ultima.nota}»</span>
        )}
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-lg font-extrabold tabular-nums text-[var(--data-warning)]">
          {fmtMon(d.saldo, d.moneda)}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onAnotar}
          title="Anotar qué pasó"
          aria-label={`Anotar gestión de ${d.nombre}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <NotebookPen className="h-4 w-4" />
        </button>
        {d.telefono ? (
          <>
            <a
              href={`tel:${d.telefono.replace(/\D/g, "")}`}
              title="Llamar"
              aria-label={`Llamar a ${d.nombre}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              <Phone className="h-4 w-4" />
            </a>
            <a
              href={wa ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary/12 px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
            >
              <MessageCircle className="h-4 w-4" /> Escribir
            </a>
          </>
        ) : (
          /* Sin número esta persona queda fuera de toda ronda para siempre: el
             aviso es un botón, no un texto muerto. */
          <button
            type="button"
            onClick={onCargarTelefono}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--data-warning)]/12 px-3 text-sm font-bold text-[var(--data-warning)] transition-colors hover:bg-[var(--data-warning)]/20"
          >
            <Phone className="h-4 w-4" /> Cargar teléfono
          </button>
        )}
      </span>
    </li>
  );
}

/** El aviso de que a alguien no se le puede escribir, para el encabezado. */
export function SinTelefonoAviso({ cuantos, onVer }: { cuantos: number; onVer: () => void }) {
  if (cuantos === 0) return null;
  return (
    <button
      type="button"
      onClick={onVer}
      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--data-warning)]/10 px-3 py-1.5 text-sm font-semibold text-[var(--data-warning)] transition-colors hover:bg-[var(--data-warning)]/20"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {cuantos} sin teléfono
    </button>
  );
}
