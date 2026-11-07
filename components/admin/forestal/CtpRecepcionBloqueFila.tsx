"use client";

/**
 * Una guía dentro de «Recibir en bloque»: el tilde, su fecha de llegada con lo
 * que esa fecha implica (ADR-434), la observación y lo que se pagó.
 *
 * Sale del modal para que el modal siga siendo el bloque (resumen, envío) y la
 * fila sea la guía: cada una con su propia fecha, no un «hoy» para todas.
 */

import { AlertTriangle, Coins } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { avisoDeCuadre, noCuadra, type MarcaDeGuia } from "@/lib/forestal/recepcion-bloque";
import { loQueFaltaRecibir } from "@/lib/forestal/recepcion-guias";
import { diaDelLibro, type PropuestaDeLlegada, type RevisionDeLlegada } from "@/lib/forestal/fecha-de-llegada";
import { formatCurrency } from "@/lib/format";
import { formatDate } from "./ctp-shared";
import { AvisosDeLlegada, CampoFechaDeLlegada, ConfirmarVencida } from "./CtpFechaDeLlegada";
import type { GuiaParaBloque } from "./CtpRecepcionBloqueModal";

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export default function CtpRecepcionBloqueFila({
  guia: g,
  marca: m,
  propuesta,
  revision,
  hoy,
  vencimiento,
  enviando,
  intentado,
  onTocar,
}: {
  guia: GuiaParaBloque;
  marca: MarcaDeGuia;
  propuesta: PropuestaDeLlegada | null;
  /** Lo que dice `revisarLlegada` de la fecha elegida; `null` si no está marcada. */
  revision: RevisionDeLlegada | null;
  hoy: string;
  /** El vencimiento de la guía (ADR-434 §Vencimiento), si el papel lo trae. */
  vencimiento: string | null;
  enviando: boolean;
  intentado: boolean;
  onTocar: (parche: Partial<MarcaDeGuia>) => void;
}) {
  const aviso = avisoDeCuadre(g);
  const falta = loQueFaltaRecibir(g);
  const total = Number(m.costoTotal.trim());
  const porM3 = Number.isFinite(total) && total > 0 && g.volumenM3 > 0 ? total / g.volumenM3 : null;
  const pideObs = m.marcada && noCuadra(g) && m.observacion.trim().length < 3;
  const diaGuia = diaDelLibro(g.gtfDate);

  return (
    <li
      className={`rounded-xl border-2 p-3 transition-colors ${
        m.marcada ? "border-[var(--accent)] bg-primary/5" : "border-[var(--rule-base)]"
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3" aria-label={`Marcar guía ${g.gtfNumber}`}>
        <input
          type="checkbox"
          checked={m.marcada}
          disabled={enviando}
          /* Al marcarla se llena con SU propuesta: el tilde confirma esa fecha. */
          onChange={(e) =>
            onTocar({
              marcada: e.target.checked,
              ...(e.target.checked && !m.fecha ? { fecha: propuesta?.dia ?? "" } : {}),
            })
          }
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-base font-bold text-[var(--text-primary)]">{g.gtfNumber}</span>
            <span className="truncate text-sm text-[var(--text-secondary)]">{g.providerName}</span>
            <span className="text-sm text-[var(--text-tertiary)]">guía {diaGuia ? formatDate(diaGuia) : "sin fecha"}</span>
          </span>
          <span className="mt-0.5 block font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {fmtM3(g.volumenM3)} m³ · {g.lineas.length} asiento{g.lineas.length === 1 ? "" : "s"}
            {falta.length > 0 && <span className="font-sans text-[var(--text-tertiary)]"> · {falta.join(" · ")}</span>}
          </span>
        </span>
      </label>

      {aviso && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[var(--data-warning-500)]/15 px-2 py-1 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>No cuadra: {aviso}. Se puede recibir igual —la madera ya bajó— pero escribe qué viste.</span>
        </p>
      )}

      {m.marcada && (
        <>
          <div className="mt-2 grid gap-2 sm:grid-cols-[10.5rem_1fr_10rem]">
            <CampoFechaDeLlegada
              id={`llegada-${g.clave}`}
              valor={m.fecha}
              onCambio={(v) => onTocar({ fecha: v })}
              propuesta={propuesta}
              min={diaGuia}
              max={hoy}
              disabled={enviando}
              invalido={(intentado && Boolean(revision?.bloqueo)) || Boolean(revision?.vencida)}
              vencimiento={vencimiento}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-bold text-[var(--text-secondary)]">
                Observación {noCuadra(g) ? "(obligatoria acá)" : "(si hace falta)"}
              </span>
              <input
                type="text"
                value={m.observacion}
                disabled={enviando}
                onChange={(e) => onTocar({ observacion: e.target.value })}
                placeholder="ej: bajaron 4 de 6 trozas, el resto quedó en el monte"
                aria-invalid={intentado && pideObs}
                className={`${CAMPO} ${intentado && pideObs ? "border-[var(--data-error-500)]" : ""}`}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-bold text-[var(--text-secondary)]">Total pagado (S/)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={m.costoTotal}
                disabled={enviando}
                onChange={(e) => onTocar({ costoTotal: e.target.value })}
                placeholder="0.00"
                className={`${CAMPO} tabular-nums`}
              />
              <span className="mt-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                <Coins className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {porM3 ? `${formatCurrency(porM3)} por m³` : "opcional"}
              </span>
            </label>
          </div>
          {revision?.vencida && (
            <ConfirmarVencida
              id={`vencida-${g.clave}`}
              vencida={revision.vencida}
              acepta={m.aceptaVencida}
              motivo={m.motivoVencida}
              disabled={enviando}
              onCambio={onTocar}
            />
          )}
          <AvisosDeLlegada revision={revision} />
        </>
      )}
    </li>
  );
}
