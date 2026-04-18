"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Store, ShoppingCart, TrendingDown, CheckCircle2, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompareProductData } from "@/lib/db/marketplace-compare.db";

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type CompareTableProps = {
  products: CompareProductData[];
  onRemove: (id: number) => void;
  onAddToCart: (p: CompareProductData) => void;
};

type RowConfig = {
  key: string;
  label: string;
  render: (p: CompareProductData, ctx: { minPrice: number; products: CompareProductData[] }) => React.ReactNode;
};

const ROWS: RowConfig[] = [
  {
    key: "image",
    label: "",
    render: (p) => (
      <div className="relative aspect-square w-full max-w-[180px] mx-auto bg-gray-50 dark:bg-gray-950 rounded-xl overflow-hidden">
        {p.image ? (
          <Image
            src={p.image}
            alt={p.name}
            fill
            sizes="(max-width: 768px) 50vw, 180px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-300">
            <Package className="h-10 w-10" />
          </div>
        )}
      </div>
    ),
  },
  {
    key: "name",
    label: "Producto",
    render: (p) => (
      <Link
        href={`/marketplace/${p.store.slug}/producto/${p.id}`}
        className="block text-sm font-semibold text-gray-900 dark:text-white hover:text-primary transition-colors line-clamp-2"
      >
        {p.name}
      </Link>
    ),
  },
  {
    key: "category",
    label: "Categoría",
    render: (p) => (
      <span className="text-sm text-gray-600 dark:text-gray-400">{p.category ?? "—"}</span>
    ),
  },
  {
    key: "price",
    label: "Precio",
    render: (p, { minPrice }) => (
      <div className="flex flex-col items-start gap-1">
        <span
          className={cn(
            "text-base font-extrabold",
            p.price === minPrice
              ? "text-success"
              : "text-gray-900 dark:text-white",
          )}
        >
          {fmt(p.price)}
          {p.unit && (
            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
              / {p.unit}
            </span>
          )}
        </span>
        {p.price === minPrice && p.price > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
            <TrendingDown className="h-3 w-3" />
            Mejor precio
          </span>
        )}
        {p.wholesalePrice && (
          <span className="text-xs text-primary font-medium">
            Mayorista {fmt(p.wholesalePrice)}
          </span>
        )}
      </div>
    ),
  },
  {
    key: "stock",
    label: "Disponibilidad",
    render: (p) => {
      if (p.stock === null) {
        return <span className="text-sm text-gray-600 dark:text-gray-400">Consultar</span>;
      }
      if (p.stock === 0) {
        return (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-danger">
            <span className="h-2 w-2 rounded-full bg-danger" />
            Agotado
          </span>
        );
      }
      if (p.stock <= 5) {
        return (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-warning">
            <span className="h-2 w-2 rounded-full bg-warning" />
            Solo {p.stock}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          En stock
        </span>
      );
    },
  },
  {
    key: "store",
    label: "Tienda",
    render: (p) => (
      <Link
        href={`/marketplace/${p.store.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-dark font-medium"
      >
        {p.store.logo ? (
          <Image
            src={p.store.logo}
            alt={p.store.name}
            width={18}
            height={18}
            className="h-4 w-4 rounded-full object-cover"
          />
        ) : (
          <Store className="h-3.5 w-3.5" />
        )}
        <span className="truncate">{p.store.name}</span>
      </Link>
    ),
  },
  {
    key: "badge",
    label: "Etiqueta",
    render: (p) =>
      p.badge ? (
        <span className="inline-block rounded-full bg-secondary/10 text-secondary px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
          {p.badge}
        </span>
      ) : (
        <span className="text-sm text-gray-400 dark:text-gray-600">—</span>
      ),
  },
  {
    key: "minOrder",
    label: "Pedido mínimo",
    render: (p) => (
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {p.minOrderQty} {p.unit ?? "unid."}
      </span>
    ),
  },
  {
    key: "description",
    label: "Descripción",
    render: (p) => (
      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-4 leading-snug">
        {p.description ?? "Sin descripción disponible."}
      </p>
    ),
  },
];

export default function CompareTable({ products, onRemove, onAddToCart }: CompareTableProps) {
  const minPrice = useMemo(() => {
    const positives = products.map((p) => p.price).filter((p) => p > 0);
    return positives.length ? Math.min(...positives) : 0;
  }, [products]);

  const ctx = { minPrice, products };

  return (
    <div className="mx-auto max-w-7xl px-0 sm:px-4">
      {/* Desktop / tablet: tabla sticky */}
      <div className="hidden md:block">
        <div className="relative overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <table className="w-full border-collapse">
            {/* Header sticky: actions */}
            <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-950">
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 dark:bg-gray-950 min-w-[160px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-800">
                  Comparando
                </th>
                {products.map((p) => (
                  <th
                    key={`head-${p.id}`}
                    className="min-w-[220px] px-4 py-3 text-left border-r border-gray-200 dark:border-gray-800 last:border-r-0"
                  >
                    <button
                      onClick={() => onRemove(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-danger transition-colors"
                      aria-label={`Quitar ${p.name} de la comparación`}
                    >
                      <X className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ROWS.map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-gray-200 dark:border-gray-800"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-950 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-800 align-top"
                  >
                    {row.label}
                  </th>
                  {products.map((p) => (
                    <td
                      key={`${row.key}-${p.id}`}
                      className="px-4 py-4 align-top border-r border-gray-200 dark:border-gray-800 last:border-r-0 bg-white dark:bg-gray-900"
                    >
                      {row.render(p, ctx)}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Row final con CTA */}
              <tr className="border-t border-gray-200 dark:border-gray-800">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-950 px-4 py-5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-800 align-top"
                >
                  Acciones
                </th>
                {products.map((p) => (
                  <td
                    key={`cta-${p.id}`}
                    className="px-4 py-5 align-top border-r border-gray-200 dark:border-gray-800 last:border-r-0 bg-white dark:bg-gray-900"
                  >
                    <button
                      onClick={() => onAddToCart(p)}
                      disabled={p.stock !== null && p.stock <= 0}
                      className={cn(
                        "w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                        p.stock !== null && p.stock <= 0
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                          : "bg-primary text-white hover:bg-primary-dark",
                      )}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Agregar
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: cards apiladas */}
      <div className="md:hidden space-y-4 px-4">
        {products.map((p) => (
          <article
            key={`m-${p.id}`}
            className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
          >
            <div className="flex items-start gap-3 p-4">
              <div className="relative h-24 w-24 shrink-0 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-950">
                {p.image ? (
                  <Image src={p.image} alt={p.name} fill sizes="96px" className="object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-300">
                    <Package className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/marketplace/${p.store.slug}/producto/${p.id}`}
                  className="block text-sm font-bold text-gray-900 dark:text-white line-clamp-2"
                >
                  {p.name}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {p.category ?? "—"}
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "text-base font-extrabold",
                      p.price === minPrice
                        ? "text-success"
                        : "text-gray-900 dark:text-white",
                    )}
                  >
                    {fmt(p.price)}
                  </span>
                  {p.unit && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">/ {p.unit}</span>
                  )}
                </div>
                {p.price === minPrice && p.price > 0 && (
                  <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                    <TrendingDown className="h-3 w-3" />
                    Mejor precio
                  </span>
                )}
              </div>
              <button
                onClick={() => onRemove(p.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-danger hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={`Quitar ${p.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-2 px-4 pb-4 text-xs">
              <div>
                <dt className="text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                  Stock
                </dt>
                <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                  {p.stock === null
                    ? "Consultar"
                    : p.stock === 0
                      ? "Agotado"
                      : p.stock <= 5
                        ? `Solo ${p.stock}`
                        : "En stock"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                  Tienda
                </dt>
                <dd className="mt-0.5 truncate">
                  <Link
                    href={`/marketplace/${p.store.slug}`}
                    className="text-primary hover:text-primary-dark font-medium"
                  >
                    {p.store.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                  Mínimo
                </dt>
                <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                  {p.minOrderQty} {p.unit ?? "unid."}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                  Etiqueta
                </dt>
                <dd className="mt-0.5 text-gray-900 dark:text-gray-100">
                  {p.badge ?? "—"}
                </dd>
              </div>
            </dl>

            <div className="px-4 pb-4">
              <button
                onClick={() => onAddToCart(p)}
                disabled={p.stock !== null && p.stock <= 0}
                className={cn(
                  "w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  p.stock !== null && p.stock <= 0
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    : "bg-primary text-white hover:bg-primary-dark",
                )}
              >
                <ShoppingCart className="h-4 w-4" />
                Agregar al carrito
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
