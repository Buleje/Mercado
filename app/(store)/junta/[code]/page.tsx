import Link from "next/link";
import {
  Users,
  Wallet,
  Truck,
  ShieldCheck,
} from "@buleje/design-system/icons";
import { getTenantId } from "@/lib/tenant";
import { JuntasDB } from "@/lib/db/juntas.db";
import GroupBuyCard from "@/components/marketplace/GroupBuyCard";

/**
 * /junta/[code] — Landing real de una Junta del Barrio (Fase A1).
 *
 * Rediseño 2026-06-18: layout editorial 2-columnas pensado para computadora —
 * narrativa (cómo funciona + confianza) a la izquierda, panel de acción
 * (GroupBuyCard) a la derecha. Bordes rectos y plano (minimalista). Server
 * component: resuelve el tenant del host, lee la junta y su progreso real.
 */
export default async function JuntaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const tenantId = await getTenantId();
  const junta = await JuntasDB.getByCode(tenantId, code).catch(() => null);

  if (!junta) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <Users className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">
          Esta junta no existe o ya cerró
        </h1>
        <p className="mt-2 text-base text-[var(--text-secondary)]">
          Pídele a tu vecino el link más reciente, o arma una nueva junta en tu
          tienda.
        </p>
        <Link
          href="/marketplace"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center bg-[var(--accent)] px-6 text-base font-bold text-white transition hover:opacity-90"
        >
          Ir a comprar
        </Link>
      </div>
    );
  }

  const orderCount = await JuntasDB.countOrders(tenantId, junta.id).catch(
    () => 0,
  );

  const target = junta.targetMembers;
  const steps = [
    `Arma la junta de un producto y comparte el link con tu cuadra.`,
    `Cada vecino que se suma acerca la meta de ${target} vecinos.`,
    `Al llegar a la meta, todos reciben el mismo descuento.`,
    `Llega una sola entrega al barrio: menos costo, menos viajes.`,
  ];
  const trust = [
    { icon: Wallet, label: "Sin pagar de más" },
    { icon: Truck, label: "Una sola entrega" },
    { icon: ShieldCheck, label: "Sin compromiso hasta la meta" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_minmax(360px,400px)] lg:items-start lg:gap-14">
        {/* ── Columna narrativa ── */}
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
            La Junta del Barrio
          </p>
          <h1 className="mt-2 text-4xl font-black leading-[1.05] tracking-tight text-[var(--text-primary)] lg:text-5xl">
            Junten pedidos,
            <br />
            ahorren juntos
          </h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-[var(--text-secondary)]">
            Más vecinos en la junta = el mismo descuento para todos y una sola
            entrega para la cuadra.
          </p>

          {junta.productLabel && (
            <div className="mt-6 border-l-4 border-[var(--accent)] bg-primary/10 px-4 py-3">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
                Esta junta es para
              </p>
              <p className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">
                {junta.productLabel}
              </p>
            </div>
          )}

          {/* Cómo funciona */}
          <div className="mt-9">
            <h2 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Cómo funciona
            </h2>
            <ol className="mt-3 border-t border-[var(--rule-soft)]">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-4 border-b border-[var(--rule-soft)] py-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary/10 text-base font-black tabular-nums text-[var(--accent)]">
                    {i + 1}
                  </span>
                  <p className="text-base leading-relaxed text-[var(--text-secondary)]">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {/* Confianza */}
          <div className="mt-8 grid gap-px border border-[var(--rule-base)] bg-[var(--rule-soft)] sm:grid-cols-3">
            {trust.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 bg-[var(--surface-raised)] px-4 py-3.5"
              >
                <Icon
                  className="h-5 w-5 shrink-0 text-[var(--accent)]"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Panel de acción ── */}
        <GroupBuyCard
          code={junta.code}
          zoneLabel={junta.zoneLabel}
          productLabel={junta.productLabel}
          count={junta.memberCount}
          target={junta.targetMembers}
          status={junta.status}
          windowEnd={junta.windowEnd}
          couponCode={junta.couponCode}
          orderCount={orderCount}
          lastJoinedAt={junta.lastJoinedAt}
        />
      </div>
    </div>
  );
}
