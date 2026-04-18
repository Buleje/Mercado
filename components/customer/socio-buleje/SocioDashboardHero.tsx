"use client";

/**
 * SocioDashboardHero — Hero del panel del socio.
 *
 * Saludo + badge de membresía + fecha de vencimiento + CTA "Renovar".
 */

import {
  PageTitle,
  BodyText,
  Caption,
  IconBadge,
  PrimaryButton,
  BadgeStatus,
} from "@buleje/design-system";
import { Sparkles, CalendarClock } from "@buleje/design-system/icons";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";
import { SocioCorona } from "@/components/ui-system/illustrations";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function SocioDashboardHero({ name = "Socio" }: { name?: string }) {
  const { status, plan, membershipEnd, resume } = useSocioBuleje();
  const isCanceled = status === "canceled";
  const isTrial = status === "trial";
  const firstName = name.split(" ")[0] ?? "Socio";

  return (
    <section className="relative overflow-hidden border-b border-[var(--rule-muted)] bg-[var(--surface-raised)]">
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            "radial-gradient(50% 30% at 80% 20%, color-mix(in oklch, var(--accent) 18%, transparent) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-5xl px-4 py-10 lg:py-12">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <IconBadge size="lg" intent="success" asDiv>
                <Sparkles className="h-5 w-5" aria-hidden />
              </IconBadge>
              <BadgeStatus
                variant={isCanceled ? "warning" : "success"}
                label={
                  isCanceled
                    ? "Membresía en cancelación"
                    : isTrial
                      ? "Trial activo"
                      : "Socio activo"
                }
                dot
                pulse={!isCanceled}
              />
            </div>

            <div>
              <Caption className="font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Bienvenido
              </Caption>
              <PageTitle className="mt-1">
                {firstName}, sos Socio Buleje
              </PageTitle>
            </div>

            <BodyText className="text-[var(--text-secondary)] max-w-lg">
              Tus beneficios están activos. Delivery gratis, 5% de cashback y
              precios exclusivos en cada pedido del marketplace.
            </BodyText>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-lg border border-[var(--rule-muted)] bg-[var(--surface-sunken)]">
                <CalendarClock
                  className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                  aria-hidden
                />
                <Caption className="text-[var(--text-secondary)]">
                  {isCanceled ? "Vence el" : "Renovación el"}{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {fmtDate(membershipEnd)}
                  </span>
                </Caption>
              </div>
              {plan && (
                <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-lg border border-[var(--rule-muted)] bg-[var(--surface-sunken)]">
                  <Caption className="text-[var(--text-secondary)]">
                    Plan{" "}
                    <span className="font-semibold text-[var(--text-primary)]">
                      {plan === "yearly" ? "Anual" : "Mensual"}
                    </span>
                  </Caption>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center gap-3">
            {/* Ilustración editorial — corona con identidad shipibo */}
            <div
              className="hidden sm:flex text-[var(--text-secondary)] opacity-90"
              aria-hidden="true"
            >
              <SocioCorona size={120} />
            </div>
            {isCanceled ? (
              <PrimaryButton onClick={() => resume()}>
                Reactivar membresía
              </PrimaryButton>
            ) : (
              <PrimaryButton variant="secondary">
                Renovar anticipado
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
