"use client";

/**
 * StorePromoBanner — banner promocional PROPIO de una tienda en /tiendas
 * (beneficio "Banner propio", superadmin). Usa la imagen banner/cover de la
 * tienda + nombre + CTA. Marcado como "Publicidad" para transparencia.
 */

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Store as StoreIcon, MapPin } from "@buleje/design-system/icons";

interface Props {
  slug: string;
  name: string;
  banner?: string | null;
  cover?: string | null;
  logo?: string | null;
  category?: string;
  zone?: string | null;
}

export default function StorePromoBanner({ slug, name, banner, cover, logo, category, zone }: Props) {
  const bg = banner || cover || logo || null;
  return (
    <Link
      href={`/marketplace/${slug}`}
      aria-label={`${name} — banner publicitario, ver tienda`}
      className="group relative block w-full overflow-hidden rounded-2xl border border-[var(--rule-base)] shadow-sm transition-all hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {/* Fondo: imagen de la tienda o gradiente de marca */}
      <div className="relative h-40 w-full sm:h-48">
        {bg ? (
          <Image
            src={bg}
            // alt descriptivo (SEO 2026-06-01): el Link ya tiene aria-label, así
            // que esto NO duplica para lectores de pantalla (aria-label gana),
            // pero sí asocia la imagen con el nombre+zona de la tienda en Google
            // Images. Reservar alt="" solo para íconos puramente decorativos.
            alt={`${name}${zone ? ` en ${zone}` : ""} — tienda con delivery en Buleje`}
            fill
            // Es el banner del hero de /tiendas — casi siempre el LCP. priority
            // setea loading="eager" + fetchPriority="high" y mata el warning de
            // Next ("LCP image should have priority").
            priority
            sizes="(min-width:1024px) 960px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(120deg, var(--accent), var(--accent-dark, var(--accent)))" }}
          />
        )}
        {/* Overlay para legibilidad del texto */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.08) 100%)" }}
        />

        {/* Etiqueta Publicidad */}
        <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-sm">
          Publicidad
        </span>

        {/* Contenido */}
        <div className="absolute inset-0 flex flex-col justify-center gap-2 p-5 sm:p-7">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow">
            <StoreIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden /> Tienda destacada
          </span>
          <h3 className="max-w-[70%] text-2xl font-black leading-tight tracking-tight text-white drop-shadow sm:text-3xl">
            {name}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/85">
            {category && <span className="capitalize">{category}</span>}
            {zone && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden /> {zone}
              </span>
            )}
          </div>
          <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 h-9 text-sm font-extrabold text-[var(--accent)] shadow-md transition-all group-hover:gap-3">
            Ver tienda
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
