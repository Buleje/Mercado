"use client";

/**
 * El pie de «Talar varios árboles»: cuánto se va a asentar (árboles, m³,
 * ≈ pt), lo que no entra y por qué, y los botones. Después de guardar dice
 * cuántos entraron DE VERDAD y ofrece seguir con el trozado de esos árboles.
 *
 * Al lector de pantalla le llega el avance y el resultado, no el total que
 * cambia en cada tecla.
 *
 * En una plantación (ADR-459) también dice lo que queda del registro de cada
 * especie con la planilla —el pie está siempre a la vista mientras se mide—,
 * en ámbar si la planilla lo pasa (no frena: lo frena el libro al despachar).
 */

import { forwardRef } from "react";
import { AlertTriangle, Axe, CheckCircle2, Loader2, Scissors } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { SaldoEnPlanilla } from "@/lib/forestal/loth-tala-plantacion";
import type { TotalesTanda } from "@/lib/forestal/loth-tala-tanda";
import { formatNumber } from "@/lib/format";

const AMBAR = "font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
const ROJO = "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const num = "font-mono font-bold tabular-nums text-[var(--text-primary)]";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const LothTalaTandaPie = forwardRef<
  HTMLButtonElement,
  {
    totales: TotalesTanda;
    avance: { hecho: number; total: number } | null;
    /** El libro se está releyendo: «Trozar» espera (lista las talas releídas). */
    recargando: boolean;
    onCerrar: () => void;
    onGuardar: () => void;
    onTrozar: (() => void) | null;
    /** Plantación: el saldo del registro por especie con la planilla (`saldoDeLaPlanilla`). */
    registro?: SaldoEnPlanilla[] | null;
  }
>(function LothTalaTandaPie({ totales: t, avance, recargando, onCerrar, onGuardar, onTrozar, registro }, guardarRef) {
  const pasan = (registro ?? []).filter((s) => s.excesoM3 > 0);
  const quedan = (registro ?? []).filter((s) => s.excesoM3 <= 0);
  const yaGuardo = t.guardadas > 0 || t.fallidas > 0;
  const noEntran = [
    t.aMedias.length > 0 ? `${t.aMedias.join(", ")} a medias` : null,
    t.sinMedir.length > 0 ? plural(t.sinMedir.length, "sin medir", "sin medir") : null,
  ].filter(Boolean);
  const vivo = avance
    ? `Guardando ${avance.hecho} de ${avance.total}…`
    : yaGuardo
      ? `Entraron ${plural(t.guardadas, "árbol", "árboles")}${t.fallidas > 0 ? `; ${t.fallidas} con error` : ""}.`
      : "";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="sr-only" aria-live="polite">
        {vivo}
      </span>
      <div className="mr-auto min-w-0 space-y-0.5 text-sm text-[var(--text-secondary)]">
        {avance ? (
          <p className="flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Guardando {avance.hecho} de {avance.total}…
          </p>
        ) : (
          <>
            {t.guardadas > 0 && (
              <p className="flex items-center gap-1.5 font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                En el libro: {plural(t.guardadas, "árbol", "árboles")} · <span className="font-mono tabular-nums">{fmtM3(t.guardadasM3)} m³</span>
              </p>
            )}
            {t.fallidas > 0 && (
              <p className={`flex items-center gap-1.5 ${ROJO}`}>
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {plural(t.fallidas, "no entró", "no entraron")}: corrige su fila y vuelve a guardar
              </p>
            )}
            {t.listas > 0 && (
              <p>
                {yaGuardo ? "Faltan " : ""}
                <span className={num}>{t.listas}</span> {t.listas === 1 ? "árbol" : "árboles"} · <span className={num}>{fmtM3(t.listasM3)}</span> m³ ·{" "}
                ≈ <span className={num}>{formatNumber(t.listasPt)}</span> pt aserr.
              </p>
            )}
            {noEntran.length > 0 && <p className={AMBAR}>{noEntran.join(" · ")}: no se asientan</p>}
            {quedan.length > 0 && (
              <p data-pie-registro>
                Registro: {quedan.map((s, i) => (
                  <span key={s.especie}>
                    {i > 0 && " · "}
                    {s.especie} quedan <span className={num}>{fmtM3(s.quedaM3)}</span>
                  </span>
                ))}{" "}
                m³
              </p>
            )}
            {pasan.length > 0 && (
              <p className={`flex items-start gap-1.5 ${AMBAR}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  {pasan.map((s) => `${s.especie} pasa lo registrado por ${fmtM3(s.excesoM3)} m³`).join(" · ")}: la tala entra; al despachar, el libro no deja pasar el registro.
                </span>
              </p>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onCerrar}
        disabled={avance != null}
        className="inline-flex h-10 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
      >
        {t.listas === 0 && yaGuardo ? "Cerrar" : "Cancelar"}
      </button>
      {onTrozar && (
        <button
          type="button"
          onClick={onTrozar}
          disabled={avance != null || recargando}
          title={recargando ? "Actualizando el libro…" : undefined}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          {recargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Trozar estos árboles
        </button>
      )}
      {(t.listas > 0 || !yaGuardo) && (
        <button
          ref={guardarRef}
          type="button"
          onClick={onGuardar}
          disabled={t.listas === 0 || avance != null}
          title={t.listas === 0 ? "Mide al menos un árbol: la longitud y, si lo pide el modo, D1 y D2" : undefined}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-3.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {avance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Axe className="h-4 w-4" />}
          {yaGuardo
            ? `Guardar ${t.listas === 1 ? "el que falta" : `los ${t.listas} que faltan`}`
            : t.listas === 0
              ? "Talar los árboles"
              : `Talar ${plural(t.listas, "árbol", "árboles")}`}
        </button>
      )}
    </div>
  );
});

export default LothTalaTandaPie;
