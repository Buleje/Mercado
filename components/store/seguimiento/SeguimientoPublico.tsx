import Link from "next/link";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";
import PublicTrackingClient from "./PublicTrackingClient";

/**
 * El seguimiento público de un pedido (link compartido, sin login).
 *
 * Vive en dos rutas:
 *   · `/t/<negocio>/seguimiento/<token>` — el link que genera
 *     `OrderTrackingDB.createShareToken`. El proxy reescribe `/t/<negocio>/*`
 *     hacia la tienda (`app/(store)`), así que ESA es la ruta que responde:
 *     antes no existía y todo link compartido daba 404 (medido 02-10-2026).
 *   · `app/t/[slug]/seguimiento/[token]` — la de siempre, con marco propio.
 *
 * Dentro de la tienda (`conMarcoPropio = false`) el encabezado y el pie ya los
 * pone el layout del negocio: repetirlos daba dos barras.
 *
 * El negocio sólo se muestra; quién es el dueño del pedido lo dice el token
 * firmado (`verifyShareToken`), nunca la URL.
 */
export default async function SeguimientoPublico({
  token,
  negocio,
  conMarcoPropio,
}: {
  token: string;
  negocio: string;
  conMarcoPropio: boolean;
}) {
  const verified = await OrderTrackingDB.verifyShareToken(token);

  if (!verified) {
    return (
      <Aviso conMarcoPropio={conMarcoPropio} etiqueta="Seguimiento" titulo="Link no válido o expiró">
        Este link de seguimiento ya no es válido. Pide a tu contacto que te envíe uno nuevo, o busca directamente tu
        pedido en tu cuenta.
      </Aviso>
    );
  }

  const snapshot = await OrderTrackingDB.getSnapshot(verified.tenantId, verified.orderId);
  if (!snapshot) {
    return (
      <Aviso conMarcoPropio={conMarcoPropio} titulo="Pedido no encontrado">
        No pudimos encontrar el pedido asociado a este link.
      </Aviso>
    );
  }

  // Versión "segura" del snapshot — sin el teléfono del repartidor.
  const publicSnapshot = {
    ...snapshot,
    driver: snapshot.driver ? { ...snapshot.driver, phone: "" } : null,
  };

  const contenido = (
    <main className="mx-auto max-w-5xl px-4 py-6 pb-16 sm:px-6">
      <PublicTrackingClient initialSnapshot={publicSnapshot} token={token} />
      <p className="mt-10 text-center text-[length:var(--ts-2xs)] text-muted">
        Este link vive 24 horas y permite ver el estado del pedido sin iniciar sesión.
      </p>
    </main>
  );

  if (!conMarcoPropio) return contenido;

  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background">
      <header className="border-b border-[var(--rule-soft)] bg-[var(--surface-inverse)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center border border-primary/30 bg-primary/20 text-sm font-extrabold text-[var(--accent)]">
              B
            </span>
            <span className="text-sm font-extrabold tracking-tight">Buleje</span>
          </Link>
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/60">
            {negocio} · Seguimiento público
          </span>
        </div>
      </header>
      {contenido}
    </div>
  );
}

function Aviso({
  conMarcoPropio,
  etiqueta,
  titulo,
  children,
}: {
  conMarcoPropio: boolean;
  etiqueta?: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-center px-4 ${conMarcoPropio ? "min-h-screen bg-[var(--surface-sunken)] dark:bg-background" : "py-20"}`}
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center">
        {etiqueta && (
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
            {etiqueta}
          </span>
        )}
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">{titulo}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">{children}</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
