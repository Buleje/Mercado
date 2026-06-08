/**
 * TenantStoreHome — INICIO de la tienda individual (cuando isTenant).
 *
 * Brandon 2026-06-07: el inicio del comerciante mostraba el marketplace entero.
 * Ahora es una portada propia, mínima y aislada: identidad de la tienda + tagline
 * + CTA a su catálogo. El catálogo vive en /tienda. Sin nada del marketplace.
 *
 * Server component — lee settings (logo + slogan) por tenant.
 */

import Link from "next/link";
import { ArrowRight, ShoppingBag } from "@buleje/design-system/icons";
import { resolveStoreContext, getCachedSettings } from "@/lib/store-metadata";

export default async function TenantStoreHome() {
  const ctx = await resolveStoreContext();
  const settings = await getCachedSettings(ctx.tenantId).catch(() => null);
  const logo = (settings as { logoUrl?: string | null } | null)?.logoUrl ?? null;
  const tagline =
    (settings as { slogan?: string | null } | null)?.slogan?.trim() ||
    "Pedí online · delivery con Yape, Plin o efectivo.";
  const initial = (ctx.name?.trim()?.charAt(0) || "T").toUpperCase();

  return (
    <main id="main-content">
      <section className="mx-auto flex max-w-[760px] flex-col items-center px-4 py-16 text-center sm:py-24">
        <span className="inline-flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-3xl font-black text-[var(--text-secondary)]">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar simple
            <img src={logo} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-4xl">
          {ctx.name}
        </h1>
        <p className="mt-3 max-w-md text-base text-[var(--text-secondary)] sm:text-lg">
          {tagline}
        </p>
        <Link
          href="/tienda"
          className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-sm font-extrabold text-white transition-opacity hover:opacity-90"
        >
          <ShoppingBag className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          Ver catálogo
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </Link>
      </section>
    </main>
  );
}
