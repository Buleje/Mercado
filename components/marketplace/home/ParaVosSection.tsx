"use client";

/**
 * ParaVosSection — 3 carousels horizontales de recomendaciones personalizadas.
 *
 * Se ubica inmediatamente despues del hero. Muestra tres cortes:
 *   1) "Porque compraste pan" — afinidad a ultima compra (mock).
 *   2) "Porque sos Socio" — solo si isSocio (precio exclusivo visible).
 *   3) "En tu zona" — populares en el distrito del user.
 *
 * Los datos son mock por ahora; cuando existan endpoints reales
 * (/api/marketplace/reco?type=...) se conecta fetch por fila.
 */

import Link from "next/link";
import { useCustomer } from "@/contexts/customer-context";
import { CardTitle, Caption, Kicker } from "@buleje/design-system";
import {
  ArrowRight,
  Crown,
  MapPin,
  Sparkles,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type RecoProduct = {
  id: string;
  name: string;
  storeSlug: string;
  storeName: string;
  price: number;
  memberPrice?: number;
  category: string;
};

type RecoRow = {
  key: string;
  title: string;
  subtitle: string;
  Icon: typeof Sparkles;
  products: RecoProduct[];
  memberOnly?: boolean;
};

const RECO_PAN: RecoProduct[] = [
  { id: "r1", name: "Mantequilla Laive 200 g", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 7.9, category: "Lacteos" },
  { id: "r2", name: "Queso fresco Valle 250 g", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 9.5, category: "Lacteos" },
  { id: "r3", name: "Mermelada Fanny fresa 300 g", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 11.2, category: "Abarrotes" },
  { id: "r4", name: "Cafe Altomayo 250 g", storeSlug: "minimarket-los-angeles", storeName: "Minimarket Los Angeles", price: 18.9, category: "Abarrotes" },
  { id: "r5", name: "Jugo Frugos naranja 1 L", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 5.5, category: "Bebidas" },
];

const RECO_SOCIO: RecoProduct[] = [
  { id: "s1", name: "Arroz Costeno extra 5 kg", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 22.9, memberPrice: 20.6, category: "Abarrotes" },
  { id: "s2", name: "Aceite Primor 1 L", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 8.5, memberPrice: 7.65, category: "Abarrotes" },
  { id: "s3", name: "Detergente Ariel 1 kg", storeSlug: "minimarket-los-angeles", storeName: "Minimarket Los Angeles", price: 14.9, memberPrice: 13.4, category: "Limpieza" },
  { id: "s4", name: "Leche Gloria 6 pack", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 24.5, memberPrice: 22.0, category: "Lacteos" },
  { id: "s5", name: "Azucar rubia 2 kg", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 8.9, memberPrice: 8.0, category: "Abarrotes" },
];

const RECO_ZONA: RecoProduct[] = [
  { id: "z1", name: "Platano seda (kilo)", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 3.0, category: "Frutas" },
  { id: "z2", name: "Yuca fresca (kilo)", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 2.5, category: "Verduras" },
  { id: "z3", name: "Paiche fresco (kilo)", storeSlug: "carniceria-selva", storeName: "Carniceria de la Selva", price: 38.0, category: "Carnes" },
  { id: "z4", name: "Chorizo regional (250 g)", storeSlug: "carniceria-selva", storeName: "Carniceria de la Selva", price: 14.5, category: "Carnes" },
  { id: "z5", name: "Masato de yuca (1 L)", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 6.0, category: "Bebidas" },
];

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function RecoCard({ product, showMember }: { product: RecoProduct; showMember?: boolean }) {
  const finalPrice = showMember && product.memberPrice ? product.memberPrice : product.price;
  return (
    <Link
      href={`/marketplace/${product.storeSlug}/producto/${product.id}`}
      className={cn(
        "group block rounded-xl border border-[var(--rule-base)] bg-white dark:bg-gray-900",
        "overflow-hidden transition-colors hover:border-[var(--rule-strong)]",
      )}
    >
      <div className="relative aspect-square bg-[var(--surface-sunken)] flex items-center justify-center">
        {showMember && product.memberPrice ? (
          <span
            className={cn(
              "absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5",
              "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
              "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
            )}
          >
            <Crown className="h-3 w-3" aria-hidden />
            Socio
          </span>
        ) : null}
        <span
          className="text-[length:var(--ts-2xl)] font-extrabold text-[var(--text-tertiary)]/30 tracking-tight"
          aria-hidden
        >
          {product.category.slice(0, 3).toUpperCase()}
        </span>
      </div>
      <div className="p-3">
        <h3 className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] leading-tight line-clamp-2 h-10">
          {product.name}
        </h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[length:var(--ts-base)] font-extrabold text-[var(--text-primary)] tabular-nums">
            {fmt(finalPrice)}
          </span>
          {showMember && product.memberPrice ? (
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] line-through tabular-nums">
              {fmt(product.price)}
            </span>
          ) : null}
        </div>
        <Caption className="mt-0.5 truncate text-[var(--text-tertiary)]">
          {product.storeName}
        </Caption>
      </div>
    </Link>
  );
}

function RecoRow({ row, showMember }: { row: RecoRow; showMember: boolean }) {
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
            <row.Icon
              className="h-4 w-4 text-[var(--text-secondary)]"
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <Kicker className="text-[var(--text-tertiary)]">{row.subtitle}</Kicker>
            <CardTitle className="text-[length:var(--ts-base)]">
              {row.title}
            </CardTitle>
          </div>
        </div>
        <Link
          href="/marketplace/explorar"
          className={cn(
            "inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors",
          )}
        >
          Ver mas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* Scroll horizontal consistente en mobile y desktop para preservar el
          feel "Amazon para vos" sin romper el grid de otras secciones. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {row.products.map((p) => (
          <div
            key={p.id}
            className="shrink-0 w-[160px] sm:w-[180px] lg:w-[200px] snap-start"
          >
            <RecoCard product={p} showMember={showMember && !!row.memberOnly} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ParaVosSection() {
  const { customer } = useCustomer();
  // Heuristica simple: isSocio = customer.phone termina en 0 (mock).
  // Cuando exista SocioBuleje context real se reemplaza.
  const isSocio = Boolean(customer?.phone && customer.phone.endsWith("0"));

  const rows: RecoRow[] = [
    {
      key: "pan",
      title: "Porque compraste pan",
      subtitle: "Afinidad de compra",
      Icon: Sparkles,
      products: RECO_PAN,
    },
    ...(isSocio
      ? [
          {
            key: "socio",
            title: "Porque sos Socio",
            subtitle: "Precios exclusivos",
            Icon: Crown,
            products: RECO_SOCIO,
            memberOnly: true,
          } as RecoRow,
        ]
      : []),
    {
      key: "zona",
      title: "En tu zona",
      subtitle: customer?.location
        ? `Popular en ${customer.location}`
        : "Popular en Pucallpa",
      Icon: MapPin,
      products: RECO_ZONA,
    },
  ];

  return (
    <section
      aria-labelledby="para-vos-title"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div className="mb-5">
        <Kicker className="text-[var(--text-tertiary)]">
          {customer?.name ? `Hola ${customer.name}` : "Recomendado"}
        </Kicker>
        <CardTitle
          as="h2"
          id="para-vos-title"
          className="text-[length:var(--ts-xl)]"
        >
          Para vos
        </CardTitle>
      </div>

      <div className="space-y-6">
        {rows.map((row) => (
          <RecoRow key={row.key} row={row} showMember={isSocio} />
        ))}
      </div>
    </section>
  );
}
