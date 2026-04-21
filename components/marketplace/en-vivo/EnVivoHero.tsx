"use client";

/**
 * EnVivoHero — Hero editorial estilo Google/big-small para /marketplace/en-vivo.
 *
 * Vocabulario unificado con landing / tiendas / marketplace / explorar / ofertas:
 *   - Kicker con línea accent h-[3px] w-10 + dot pulsante si hay live activo
 *   - Título clamp fluido + italic serif accent en segunda línea
 *   - Grid asimétrico 7fr/5fr con stats vertical
 *   - Indicador LIVE pulsante si hay transmisión activa
 */

import { Radio } from "@buleje/design-system/icons";

export interface EnVivoHeroProps {
  liveCount: number;
  nextInHours?: number;
}

export function EnVivoHero({ liveCount, nextInHours }: EnVivoHeroProps) {
  const isLive = liveCount > 0;

  return (
    <section
      aria-labelledby="en-vivo-hero-heading"
      className="relative w-full overflow-hidden border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-40 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -left-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 lg:pt-28 pb-14 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-12 lg:gap-16 items-center">
          {/* ── LEFT — título dramático ────────────────────────────────── */}
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              <Radio className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Buleje · En vivo
            </p>

            <h1
              id="en-vivo-hero-heading"
              className="text-[clamp(2.75rem,8vw,5.75rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]"
            >
              Mirá lo fresco
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                del día.
              </span>
            </h1>

            <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
              Las bodegas muestran sus productos en vivo. Preguntá en el chat,
              mirá lo que{" "}
              <span className="text-[var(--text-primary)] font-bold">
                acaba de llegar
              </span>{" "}
              y agregalo al carrito sin salir de la transmisión.
            </p>

            {/* Chips de features */}
            <div className="mt-8 flex flex-wrap gap-2">
              {(isLive
                ? ["Chat con el vendedor", "Delivery directo", "Preguntas en vivo"]
                : ["Recordatorios por WhatsApp", "Ofertas exclusivas del live"]
              ).map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          {/* ── RIGHT — stats vertical + indicador LIVE ───────────────── */}
          <div>
            <div className="relative rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 sm:p-10 overflow-hidden">
              {/* Header con indicador LIVE pulsante */}
              <div className="flex items-center justify-between mb-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                  Estado — ahora
                </p>
                {isLive ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.15em] text-red-500">
                    <span
                      aria-hidden
                      className="relative inline-flex h-2 w-2"
                    >
                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 animate-ping opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                    En vivo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Off-air
                  </span>
                )}
              </div>

              <div className="space-y-8">
                <div className="flex items-baseline gap-5">
                  <span className="text-[clamp(2.25rem,4.5vw,3.25rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none w-[5ch] shrink-0">
                    {isLive ? liveCount : "—"}
                  </span>
                  <span className="text-sm sm:text-base text-[var(--text-secondary)] leading-snug">
                    {isLive
                      ? `${liveCount === 1 ? "Bodega transmitiendo" : "Bodegas transmitiendo"} ahora`
                      : "Ninguna transmisión en vivo"}
                  </span>
                </div>
                <div className="flex items-baseline gap-5 pt-6 border-t border-[var(--rule-soft)]">
                  <span className="text-[clamp(2.25rem,4.5vw,3.25rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none w-[5ch] shrink-0">
                    {isLive ? "Chat" : `${nextInHours ?? 2}h`}
                  </span>
                  <span className="text-sm sm:text-base text-[var(--text-secondary)] leading-snug">
                    {isLive
                      ? "Mensajería en tiempo real"
                      : "Hasta la próxima transmisión"}
                  </span>
                </div>
                <div className="flex items-baseline gap-5 pt-6 border-t border-[var(--rule-soft)]">
                  <span className="text-[clamp(2.25rem,4.5vw,3.25rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none w-[5ch] shrink-0">
                    HD
                  </span>
                  <span className="text-sm sm:text-base text-[var(--text-secondary)] leading-snug">
                    Video 720p sin interrupciones
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
