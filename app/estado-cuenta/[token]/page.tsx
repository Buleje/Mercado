import { verifyStatementToken } from "@/lib/fiado/statement-token";
import { FiadosDB } from "@/lib/db/fiados.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { SettingsDB } from "@/lib/db/settings.db";

/**
 * /estado-cuenta/[token] — Estado de cuenta de fiados PÚBLICO (link compartible).
 *
 * El dueño genera el link firmado (POST /api/fiados/statement-link) y lo manda
 * por WhatsApp. El cliente ve su deuda consolidada sin login. El token (HMAC) no
 * es enumerable y vence a los 30 días. Brandon 2026-06-17.
 */
export const metadata = {
  title: "Estado de cuenta",
  robots: "noindex, nofollow",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const fmtDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric" }).format(d);
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

export default async function EstadoCuentaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const v = verifyStatementToken(token);

  if (!v.valid) {
    return (
      <Shell>
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center shadow-[var(--shadow-sm)]">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Link no válido</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Este enlace expiró o no es correcto. Pídele a la tienda uno nuevo.
          </p>
        </div>
      </Shell>
    );
  }

  const [fiados, tenant, settings] = await Promise.all([
    FiadosDB.list(v.tenantId, { customerId: v.customerId }),
    TenantsDB.getBasicById(v.tenantId),
    // Datos Yape de la tienda — para el bloque "Pagar con Yape". Degrada a
    // null si falla (la página sigue mostrando el estado de cuenta).
    SettingsDB.get(v.tenantId).catch(() => null),
  ]);

  const pendientes = fiados.filter((f) => f.status === "ACTIVO" || f.status === "VENCIDO");
  const total = pendientes.reduce((s, f) => s + f.saldo, 0);
  const nombre = pendientes[0]?.customerName ?? fiados[0]?.customerName ?? "Cliente";
  const tienda = tenant?.name ?? "la tienda";
  const now = Date.now();

  // "Pagar con Yape" — solo si la tienda tiene Yape activo y hay saldo.
  const yape =
    settings?.yapeEnabled && (settings.yapePhone || settings.yapeImage)
      ? {
          phone: settings.yapePhone ?? null,
          name: settings.yapeName ?? null,
          image: settings.yapeImage ?? null,
        }
      : null;

  return (
    <Shell>
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] overflow-hidden">
        {/* Cabecera */}
        <div className="bg-[var(--accent)] px-6 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{tienda}</p>
          <h1 className="mt-1 text-lg font-bold">Hola {nombre} 👋</h1>
          <p className="text-sm opacity-90">Este es tu estado de cuenta</p>
        </div>

        {/* Total */}
        <div className="px-6 py-6 text-center border-b border-[var(--rule-base)]">
          {pendientes.length === 0 ? (
            <>
              <p className="text-2xl font-extrabold text-[var(--data-success-500)]">¡Estás al día! 🎉</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">No tienes deudas pendientes.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--text-tertiary)]">Total pendiente</p>
              <p className="mt-1 text-4xl font-extrabold text-[var(--text-primary)] tabular-nums">{fmt(total)}</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {pendientes.length} {pendientes.length === 1 ? "cuenta" : "cuentas"} por regularizar
              </p>
            </>
          )}
        </div>

        {/* Detalle */}
        {pendientes.length > 0 && (
          <ul className="divide-y divide-[var(--rule-base)]">
            {pendientes.map((f) => {
              const vencido = f.fechaVence ? new Date(f.fechaVence).getTime() < now : false;
              const fecha = fmtDate(f.fechaVence);
              return (
                <li key={f.id} className="flex items-start justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {f.descripcion || "Fiado"}
                    </p>
                    {fecha && (
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {vencido ? "Venció el" : "Vence el"} {fecha}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmt(f.saldo)}</p>
                    {vencido && (
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--data-error-500)]">
                        Vencido
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagar con Yape — datos de la tienda + monto. Sin gateway: el cliente
            yapea y avisa con su captura; el dueño registra el pago. */}
        {pendientes.length > 0 && yape && (
          <div className="border-t border-[var(--rule-base)] px-6 py-5">
            <p className="text-sm font-bold text-[var(--text-primary)]">Paga con Yape</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Yapea {fmt(total)} a {tienda} y envía tu captura por WhatsApp.
            </p>

            {yape.image ? (
              // QR de Yape de la tienda. <img> nativo: página pública standalone
              // sin config de next/image para dominios externos.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={yape.image}
                alt={`Código Yape de ${tienda}`}
                className="mx-auto mt-4 h-44 w-44 rounded-xl border border-[var(--rule-base)] object-contain bg-white"
              />
            ) : null}

            {yape.phone && (
              <div className="mt-4 rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-center">
                <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Número Yape
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {yape.phone}
                </p>
                {yape.name && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{yape.name}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pie */}
        <div className="px-6 py-4 bg-[var(--surface-sunken)] text-center">
          <p className="text-xs text-[var(--text-tertiary)]">
            {yape
              ? <>Después de yapear, avísale a <span className="font-semibold text-[var(--text-secondary)]">{tienda}</span> con tu captura.</>
              : <>Acércate a <span className="font-semibold text-[var(--text-secondary)]">{tienda}</span> para regularizar tu cuenta.</>}
          </p>
        </div>
      </div>
    </Shell>
  );
}
