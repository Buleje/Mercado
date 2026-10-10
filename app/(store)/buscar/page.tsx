import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Coffee, Cookie, Milk, Sparkles, SprayCan, Package } from "lucide-react";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { buildTenantTitle } from "@/lib/store-metadata";
import { SearchTrigger } from "./SearchTrigger";

const ProductCatalog = dynamic(() => import("@/components/ProductCatalog"));
const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const CustomerModal = dynamic(() => import("@/components/CustomerModal"));
const UserAccountModal = dynamic(() => import("@/components/UserAccountModal"));

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Buscar productos",
    "Busca entre nuestros productos de abarrotes, bebidas, carnes, snacks, limpieza y más. Delivery rápido.",
    { index: false, follow: true },
  );
}

const QUICK_CATEGORIES = [
  { label: "Bebidas",   slug: "bebidas",   Icon: Coffee   },
  { label: "Snacks",    slug: "snacks",    Icon: Cookie   },
  { label: "Lácteos",   slug: "lacteos",   Icon: Milk     },
  { label: "Higiene",   slug: "higiene",   Icon: Sparkles },
  { label: "Limpieza",  slug: "limpieza",  Icon: SprayCan },
  { label: "Despensa",  slug: "despensa",  Icon: Package  },
] as const;

function BuscarEmptyState() {
  return (
    <div className="flex flex-col items-center gap-8 px-4 py-12 sm:py-16">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
          ¿Qué buscas hoy?
        </h1>
        <p className="text-[var(--text-secondary)] text-base">
          Elige una categoría o escribe lo que necesitas arriba.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
        {QUICK_CATEGORIES.map(({ label, slug, Icon }) => (
          <Link
            key={slug}
            href={`/buscar?q=${slug}`}
            className="h-12 flex items-center justify-center gap-2.5 border-2 rounded-2xl text-base font-medium transition-all
              border-[var(--rule-base)] text-[var(--text-primary)]
              hover:border-primary hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5
              active:scale-[0.97]"
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const hasQuery = !!params?.q;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Buscar", url: "https://www.buleje.pe/buscar" },
        ]}
      />
      <main id="main-content" className="min-h-screen">
        <SearchTrigger />
        {hasQuery ? <ProductCatalog /> : <BuscarEmptyState />}
      </main>
      <CartSidebar />
      <CustomerModal />
      <UserAccountModal />
    </>
  );
}
