/**
 * TenantStoreHome — INICIO de la tienda individual (cuando isTenant).
 *
 * Brandon 2026-06-07: el inicio del comerciante mostraba el marketplace entero.
 * Ahora es una portada propia, mínima y aislada: identidad de la tienda + tagline
 * + CTA a su catálogo. El catálogo vive en /tienda. Sin nada del marketplace.
 *
 * Server component — lee settings (logo + slogan) por tenant.
 *
 * ADR-457: es la portada hermana de `/t/<slug>` (la de subdominio y dominio
 * propio), así que lleva el mismo enchufe `tienda.portada`: una pieza puede
 * reemplazar este bloque o agregar otros debajo. Sin piezas queda idéntica.
 */

import Link from "next/link";
import { ArrowRight, ShoppingBag } from "@buleje/design-system/icons";
import { resolveStoreContext, getCachedSettings } from "@/lib/store-metadata";
import { resolveTenantSlug, resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { TenantsDB } from "@/lib/db/tenants.db";
import { sinDato } from "@/lib/errores/sin-dato";
import { Enchufe } from "@/lib/extensiones/Enchufe";
import { resolverPiezas } from "@/lib/extensiones/resolver";

/**
 * El negocio de la visita como id + slug reales, que es lo que pide el enchufe.
 * `x-tenant-id` trae el slug (subdominio), `custom--<host>` (dominio propio) o
 * el id (sesión del panel). `null` = no se sabe de quién es: sin piezas.
 */
async function negocioDeLaVisita(crudo: string): Promise<{ id: string; slug: string } | null> {
  const slug = await resolveTenantSlug(crudo).catch(sinDato("portada: slug del negocio"));
  if (!slug) return null;
  const id = await resolveTenantSlugToId(slug);
  if (id !== slug) return { id, slug };
  // Ya era un id (o un slug que no existe): el slug sale de la base, o no hay negocio.
  const t = await TenantsDB.getBasicById(id).catch(sinDato("portada: negocio por id"));
  return t ? { id: t.id, slug: t.slug } : null;
}

export default async function TenantStoreHome() {
  const ctx = await resolveStoreContext();
  // Los ajustes y el negocio de la visita no dependen uno del otro: en paralelo.
  const [settings, negocio] = await Promise.all([
    getCachedSettings(ctx.tenantId).catch(sinDato("portada: ajustes de la tienda")),
    negocioDeLaVisita(ctx.tenantId),
  ]);
  const logo = (settings as { logoUrl?: string | null } | null)?.logoUrl ?? null;
  const tagline =
    (settings as { slogan?: string | null } | null)?.slogan?.trim() ||
    "Pedí online · delivery con Yape, Plin o efectivo.";
  const initial = (ctx.name?.trim()?.charAt(0) || "T").toUpperCase();
  // Sin piezas no se monta el enchufe: la portada sale idéntica, byte a byte.
  const conPiezas = negocio
    ? (await resolverPiezas(negocio.id, "tienda.portada")).length > 0
    : false;

  const portadaNormal = (
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
      <p className="mt-3 max-w-md text-base text-[var(--text-secondary)] sm:text-lg">{tagline}</p>
      <Link
        href="/tienda"
        className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-sm font-extrabold text-white transition-opacity hover:opacity-90"
      >
        <ShoppingBag className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        Ver catálogo
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </Link>
    </section>
  );

  return (
    <main id="main-content">
      {negocio && conPiezas ? (
        <Enchufe
          nombre="tienda.portada"
          tenantId={negocio.id}
          slug={negocio.slug}
          fallback={portadaNormal}
        />
      ) : (
        portadaNormal
      )}
    </main>
  );
}
