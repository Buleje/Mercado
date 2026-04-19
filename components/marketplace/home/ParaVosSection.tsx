"use client";

/**
 * ParaVosSection — 3 carousels horizontales de recomendaciones personalizadas.
 *
 * Se ubica inmediatamente despues del hero. Muestra tres cortes:
 *   1) "Porque compraste pan" — afinidad a ultima compra (mock).
 *   2) "Porque sos Socio" — solo si isSocio (precio exclusivo visible).
 *   3) "En tu zona" — populares en el distrito del user.
 *
 * Ola 7: migrado al primitivo ProductCardCompact del DS. Antes usaba un
 * RecoCard local con Link y pricing duplicado; ahora consume el canonico
 * para consistencia visual con Top Hoy / Recent Viewed / Cross-sell.
 *
 * Los datos son mock por ahora; cuando existan endpoints reales
 * (/api/marketplace/reco?type=...) se conecta fetch por fila.
 */

import Link from "next/link";
import { useCustomer } from "@/contexts/customer-context";
import {
  CardTitle,
  Kicker,
  ProductCardCompact,
  type ProductCardProduct,
} from "@buleje/design-system";
import {
  ArrowRight,
  Crown,
  MapPin,
  Sparkles,
} from "@buleje/design-system/icons";

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

/**
 * Convierte RecoProduct (mock) al shape canonico del DS.
 * Si `showMember` y el row es `memberOnly`, aplica precio socio + badge.
 */
function recoToCard(
  p: RecoProduct,
  showMember: boolean,
  memberOnly: boolean,
): ProductCardProduct {
  const usesMemberPrice = showMember && memberOnly && p.memberPrice != null;
  return {
    id: p.id,
    name: p.name,
    price: usesMemberPrice ? p.memberPrice! : p.price,
    originalPrice: usesMemberPrice ? p.price : undefined,
    image: null,
    category: p.category,
    storeSlug: p.storeSlug,
    storeName: p.storeName,
    href: `/marketplace/${p.storeSlug}/producto/${p.id}`,
    badge: usesMemberPrice ? "socio" : undefined,
  };
}

function RecoRowView({
  row,
  showMember,
}: {
  row: RecoRow;
  showMember: boolean;
}) {
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
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Ver mas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* ProductCardCompact (Ola 7) — carousel horizontal de recomendaciones */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2">
        {row.products.map((p) => (
          <div key={p.id} className="shrink-0 snap-start">
            <ProductCardCompact
              product={recoToCard(p, showMember, !!row.memberOnly)}
            />
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
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6"
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
          <RecoRowView key={row.key} row={row} showMember={isSocio} />
        ))}
      </div>
    </section>
  );
}
