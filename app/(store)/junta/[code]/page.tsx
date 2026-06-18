import Link from "next/link";
import { Users } from "@buleje/design-system/icons";
import { getTenantId } from "@/lib/tenant";
import { JuntasDB } from "@/lib/db/juntas.db";
import GroupBuyCard from "@/components/marketplace/GroupBuyCard";

/**
 * /junta/[code] — Landing real de una Junta del Barrio (Fase A1).
 * Reemplaza el 404 al que apuntaba el viejo GroupBuyCard muerto. Server
 * component: resuelve el tenant del host (mismo `x-tenant-id` que la API),
 * lee la junta y renderiza el progreso real + acciones (unirse/compartir).
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
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)]">
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
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-[var(--accent)] px-6 text-base font-bold text-white hover:opacity-90"
        >
          Ir a comprar
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-5">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
          Compra colaborativa vecinal
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          La Junta del Barrio
        </h1>
      </header>

      <GroupBuyCard
        code={junta.code}
        zoneLabel={junta.zoneLabel}
        productLabel={junta.productLabel}
        count={junta.memberCount}
        target={junta.targetMembers}
        status={junta.status}
      />
    </div>
  );
}
