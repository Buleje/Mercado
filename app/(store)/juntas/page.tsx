import type { Metadata } from "next";
import Link from "next/link";
import { Users, ArrowRight } from "@buleje/design-system/icons";
import { getTenantId } from "@/lib/tenant";
import { JuntasDB } from "@/lib/db/juntas.db";
import { juntaCouponPercent } from "@/lib/junta/constants";
import CreateJuntaForm from "@/components/marketplace/junta/CreateJuntaForm";
import HowJuntaWorks from "@/components/marketplace/junta/HowJuntaWorks";
import JuntaRewardLadder from "@/components/marketplace/junta/JuntaRewardLadder";

export const metadata: Metadata = {
  title: "La Junta del Barrio — junta a tu cuadra y ahorren juntos | Buleje",
  description:
    "Compra colaborativa vecinal: junta a los vecinos de tu cuadra, todos llevan el mismo descuento y llega una sola entrega. Mientras más vecinos, más ahorro.",
};

/**
 * /juntas — Hub de La Junta del Barrio. Visual-first (poco texto): explicador de
 * 3 pasos + escalera de ahorro, la lista de juntas abiertas y el form para armar
 * una. Server component: resuelve tenant y lista juntas OPEN.
 */
export default async function JuntasHubPage() {
  const tenantId = await getTenantId();
  const juntas = await JuntasDB.listOpenRecent(tenantId, 12).catch(() => []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      {/* ── Hero corto ── */}
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
        Compra colaborativa vecinal
      </p>
      <h1 className="mt-2 text-4xl font-black leading-[1.05] tracking-tight text-[var(--text-primary)] lg:text-5xl">
        La Junta del Barrio
      </h1>

      <HowJuntaWorks className="mt-8 max-w-md" />
      <JuntaRewardLadder size="lg" className="mt-8" />

      {/* ── Cuerpo: juntas abiertas + armar ── */}
      <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_minmax(340px,380px)] lg:items-start">
        {/* Juntas abiertas */}
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
            Juntas abiertas en tu barrio
          </h2>
          {juntas.length === 0 ? (
            <div className="mt-4 border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 py-10 text-center">
              <Users
                className="mx-auto h-8 w-8 text-[var(--text-tertiary)]"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="mt-3 text-base font-semibold text-[var(--text-secondary)]">
                Todavía no hay juntas. ¡Arma la primera de tu cuadra!
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {juntas.map((j) => {
                const remaining = Math.max(0, j.targetMembers - j.memberCount);
                const progress = Math.min(
                  100,
                  Math.round((j.memberCount / j.targetMembers) * 100),
                );
                return (
                  <Link
                    key={j.code}
                    href={`/junta/${j.code}`}
                    className="group border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 transition hover:border-[var(--accent)]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-base font-extrabold text-[var(--text-primary)]">
                        {j.zoneLabel}
                      </span>
                      <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--accent)]">
                        {j.memberCount}/{j.targetMembers}
                      </span>
                    </div>
                    {j.productLabel && (
                      <p className="mt-0.5 truncate text-sm text-[var(--text-tertiary)]">
                        {j.productLabel}
                      </p>
                    )}
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden bg-[var(--surface-sunken)]">
                      <div
                        className="h-full bg-[var(--accent)] transition-[width]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2.5 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)]">
                      {remaining > 0
                        ? `Faltan ${remaining} · ${juntaCouponPercent(j.targetMembers)}% off`
                        : "¡Completa!"}
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Armar una junta */}
        <CreateJuntaForm />
      </div>
    </div>
  );
}
