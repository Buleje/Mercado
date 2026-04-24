"use client";

/**
 * ParaVosSection — 3 carousels horizontales de recomendaciones personalizadas.
 *
 * Se ubica inmediatamente despues del hero. Muestra tres cortes:
 *   1) "Porque compraste pan" — afinidad a última compra (mock).
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
import { ArrowRight } from "@buleje/design-system/icons";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";

type RecoProduct = {
  id: string;
  name: string;
  storeSlug: string;
  storeName: string;
  price: number;
  memberPrice?: number;
  category: string;
  description?: string;
};

type RecoRow = {
  key: string;
  title: string;
  subtitle: string;
  products: RecoProduct[];
  memberOnly?: boolean;
  viewMoreHref?: string;
};

const RECO_PAN: RecoProduct[] = [
  { id: "r1", name: "Mantequilla Laive 200 g", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 7.9, category: "Lacteos", description: "Cremosa, ideal para desayuno con pan fresco." },
  { id: "r2", name: "Queso fresco Valle 250 g", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 9.5, category: "Lacteos", description: "Fresco del dia, acompana bien el pan serrano." },
  { id: "r3", name: "Mermelada Fanny fresa 300 g", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 11.2, category: "Abarrotes", description: "70% fruta, sin conservantes. Dulce casero." },
  { id: "r4", name: "Cafe Altomayo 250 g", storeSlug: "minimarket-los-angeles", storeName: "Minimarket Los Angeles", price: 18.9, category: "Abarrotes", description: "Cafe peruano tostado, aroma intenso de San Martin." },
  { id: "r5", name: "Jugo Frugos naranja 1 L", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 5.5, category: "Bebidas", description: "Pulpa natural, ideal para acompanar el pan." },
  { id: "r6", name: "Miel de abeja 500 g", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 16.0, category: "Abarrotes", description: "Miel pura de apicultores de Ucayali." },
];

const RECO_SOCIO: RecoProduct[] = [
  { id: "s1", name: "Arroz Costeno extra 5 kg", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 22.9, memberPrice: 20.6, category: "Abarrotes", description: "Precio Socio con 10% off — valido hasta fin de mes." },
  { id: "s2", name: "Aceite Primor 1 L", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 8.5, memberPrice: 7.65, category: "Abarrotes", description: "Precio Socio · sin colesterol, vegetal puro." },
  { id: "s3", name: "Detergente Ariel 1 kg", storeSlug: "minimarket-los-angeles", storeName: "Minimarket Los Angeles", price: 14.9, memberPrice: 13.4, category: "Limpieza", description: "Precio Socio · remueve manchas en agua fria." },
  { id: "s4", name: "Leche Gloria 6 pack", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 24.5, memberPrice: 22.0, category: "Lacteos", description: "Precio Socio · leche evaporada familiar." },
  { id: "s5", name: "Azucar rubia 2 kg", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 8.9, memberPrice: 8.0, category: "Abarrotes", description: "Precio Socio · azucar rubia natural peruana." },
  { id: "s6", name: "Atun Florida x3", storeSlug: "minimarket-los-angeles", storeName: "Minimarket Los Angeles", price: 15.9, memberPrice: 14.3, category: "Abarrotes", description: "Precio Socio · trozos grandes en agua." },
];

const RECO_ZONA: RecoProduct[] = [
  { id: "z1", name: "Platano seda (kilo)", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 3.0, category: "Frutas", description: "De chacras de Ucayali, maduro listo para comer." },
  { id: "z2", name: "Yuca fresca (kilo)", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 2.5, category: "Verduras", description: "Cosechada esta semana, ideal para el tacacho." },
  { id: "z3", name: "Paiche fresco (kilo)", storeSlug: "carniceria-selva", storeName: "Carniceria de la Selva", price: 38.0, category: "Carnes", description: "Pescado amazonico del dia, sin huesos." },
  { id: "z4", name: "Chorizo regional (250 g)", storeSlug: "carniceria-selva", storeName: "Carniceria de la Selva", price: 14.5, category: "Carnes", description: "Ahumado con lena, receta tradicional de Pucallpa." },
  { id: "z5", name: "Masato de yuca (1 L)", storeSlug: "bodega-don-pepe", storeName: "Bodega Don Pepe", price: 6.0, category: "Bebidas", description: "Fermentado artesanal, bebida tipica amazonica." },
  { id: "z6", name: "Aguaje fresco (kilo)", storeSlug: "frutas-selva", storeName: "Frutas de la Selva", price: 8.0, category: "Frutas", description: "Fruto amazonico, rico en vitamina A y colageno." },
];

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function RecoRowView({
  row,
  showMember,
}: {
  row: RecoRow;
  showMember: boolean;
}) {
  const viewMoreHref = row.viewMoreHref ?? "/marketplace/explorar";

  return (
    <MarketplaceSection
      id={`reco-${row.key}`}
      kicker={row.subtitle}
      title={row.title}
      className="py-4"
      innerClassName="px-0 sm:px-0 lg:px-0"
      actions={
        <Link
          href={viewMoreHref}
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Ver mas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      {/* Grid 5 columnas desktop (cards más anchas para que el precio no lo
          tape el CTA flotante del carrito) */}
      <div
        role="list"
        aria-label={row.title}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4"
      >
        {row.products.slice(0, 5).map((p, i) => {
          const usesMemberPrice =
            showMember && row.memberOnly && p.memberPrice != null;
          return (
            <div key={p.id} role="listitem" className="min-w-0">
              <UnifiedProductCard
                index={i}
                href={`/marketplace/${p.storeSlug}/producto/${p.id}`}
                product={{
                  id: hashId(p.id),
                  name: p.name,
                  price: usesMemberPrice ? p.memberPrice! : p.price,
                  originalPrice: usesMemberPrice ? p.price : undefined,
                  category: p.category,
                  image: null,
                  storeName: p.storeName,
                  storeSlug: p.storeSlug,
                  description: p.description,
                }}
              />
            </div>
          );
        })}
      </div>
    </MarketplaceSection>
  );
}

export default function ParaVosSection() {
  const { customer } = useCustomer();
  // Heuristica simple: isSocio = customer.phone termina en 0 (mock).
  const isSocio = Boolean(customer?.phone && customer.phone.endsWith("0"));

  const rows: RecoRow[] = [
    {
      key: "pan",
      title: "Porque compraste pan",
      subtitle: "Afinidad de compra",
      products: RECO_PAN,
    },
    ...(isSocio
      ? [
          {
            key: "socio",
            title: "Porque sos Socio",
            subtitle: "Precios exclusivos",
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
      products: RECO_ZONA,
    },
  ];

  return (
    <section
      aria-labelledby="para-vos-title"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6"
    >
      <div className="mb-2">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
          {customer?.name ? `Hola ${customer.name}` : "Recomendado"}
        </p>
        <h2
          id="para-vos-title"
          className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 dark:text-white"
        >
          Para ti
        </h2>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <RecoRowView key={row.key} row={row} showMember={isSocio} />
        ))}
      </div>
    </section>
  );
}
