"use client";

/**
 * Lo que va a quedar guardado ANTES de tocar «Guardar» (y, después, lo que
 * quedó): cuántas guías, cuántos m³ y cuánta plata; cuáles cambian de precio,
 * de cuánto a cuánto; y cuáles se saltan y por qué. Son muchas escrituras de
 * plata de una vez: se ven como una cifra, no como una lista que nadie lee.
 */

import { CheckCircle2, Coins } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TEXTO_MOTIVO, type MotivoSalto, type PlanDePrecio } from "@/lib/forestal/precio-en-tanda";
import { formatNumber } from "@/lib/format";

const soles = (n: number) => `S/ ${formatNumber(n, 2)}`;
const m3 = (n: number) => `${formatNumber(n, { max: 3 })} m³`;
const guias = (n: number) => `${n} ${n === 1 ? "guía" : "guías"}`;
/** Cuántas filas de «de cuánto a cuánto» se listan; el resto va en el total. */
const TOPE_CAMBIOS = 40;

export default function CtpPrecioTandaPrevia({ plan, hecho = false }: { plan: PlanDePrecio; hecho?: boolean }) {
  const { totales, saltadas } = plan;
  const pisadas = plan.cambios.filter((c) => c.antes != null);
  const porMotivo = new Map<MotivoSalto, typeof saltadas>();
  for (const s of saltadas) porMotivo.set(s.motivo, [...(porMotivo.get(s.motivo) ?? []), s]);

  return (
    <section
      aria-live="polite"
      className={`space-y-2 rounded-xl border-2 p-3 ${
        hecho
          ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] dark:bg-transparent"
          : "border-[var(--accent)]/40 bg-[var(--surface-sunken)]"
      }`}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-[var(--text-primary)]">
        {hecho ? (
          <CheckCircle2 className="h-5 w-5 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
        ) : (
          <Coins className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
        )}
        <span>{hecho ? "Quedaron con precio" : "Vas a poner precio a"}</span>
        <b>{guias(totales.filas)}</b>
        <span className="text-[var(--text-tertiary)]">·</span>
        <b className="font-mono tabular-nums">{m3(totales.m3)}</b>
        <span className="text-[var(--text-tertiary)]">·</span>
        <b className="font-mono tabular-nums">{soles(totales.soles)}</b>
      </p>

      {pisadas.length > 0 && (
        <div>
          <p className="text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {pisadas.length === 1 ? "1 guía ya tenía precio y cambia:" : `${pisadas.length} guías ya tenían precio y cambian:`}
          </p>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-sm">
            {pisadas.slice(0, TOPE_CAMBIOS).map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[var(--text-secondary)]">
                <span>
                  <span className="font-mono">{c.gtfNumber}</span> · {c.especie}
                </span>
                <span className="font-mono tabular-nums">
                  {c.monedaAntes === "USD" ? "USD" : "S/"} {formatNumber(c.antes ?? 0, 2)} →{" "}
                  <b className="text-[var(--text-primary)]">{soles(c.despues)}</b>
                </span>
              </li>
            ))}
          </ul>
          {pisadas.length > TOPE_CAMBIOS && (
            <p className="text-sm text-[var(--text-tertiary)]">y {pisadas.length - TOPE_CAMBIOS} más.</p>
          )}
        </div>
      )}

      {[...porMotivo].map(([motivo, lista]) => (
        <p key={motivo} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <span>
            {guias(lista.length)} no {lista.length === 1 ? "se toca" : "se tocan"}: {TEXTO_MOTIVO[motivo]}
            {motivo === "periodo-cerrado" && lista[0]?.detalle ? ` (${[...new Set(lista.map((s) => s.detalle))].join(", ")})` : ""}.
            {motivo === "ya-tiene-precio" && !hecho ? " Tilda «también las que ya tienen precio» para cambiarlas." : ""}
          </span>
          {lista.some((s) => s.gtfNumber) && (
            <InfoTip
              title="Guías que no se tocan"
              ancho="w-96"
              what={<span>{lista.map((s) => (s.gtfNumber ? `${s.gtfNumber} (${s.especie})` : "una guía que ya no existe")).join(", ")}</span>}
              affects={
                motivo === "periodo-cerrado"
                  ? "Para ponerles precio hay que reabrir ese mes."
                  : motivo === "congelado"
                    ? "Su costo ya quedó en el acta de una corrida: cambiarlo haría que el libro diga dos cosas."
                    : undefined
              }
            />
          )}
        </p>
      ))}
    </section>
  );
}
