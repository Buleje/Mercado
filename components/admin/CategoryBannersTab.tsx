"use client";

/**
 * CategoryBannersTab — Editor de banners promocionales por categoría.
 *
 * El admin sube una imagen banner por categoría que aparece en la sección
 * "Oferta de Temporada" del storefront. Al click, el cliente va a la categoría
 * (filtrado en la tienda) o a un producto específico si está vinculado.
 *
 * Las categorías se cargan desde GET /api/products → derivadas dinámicamente.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { Tag, ImageIcon, ToggleLeft, ToggleRight, ExternalLink, Sparkles, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import ImageUpload from "./ImageUpload";
import type { StoreTheme } from "./StoreCustomizer";

type Category = {
  id: string;
  label: string;
  count: number;
};

type CategoryBanner = NonNullable<StoreTheme["categoryBanners"]>[string];

export default function CategoryBannersTab({
  theme,
  update,
  inputCls,
}: {
  theme: StoreTheme;
  update: <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => void;
  inputCls: string;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Array<{ id: number; name: string; category?: string; slug?: string }>>([]);

  // Cargar categorías + productos del tenant para llenar selects.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const slug = await resolveActiveTenantSlug();
      const headers: Record<string, string> = {};
      if (slug) headers["x-tenant-slug"] = slug;
      await fetch("/api/products", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        // El endpoint devuelve un array directo de productos.
        const list = (Array.isArray(data) ? data : data?.products ?? []) as Array<{ id: number; name: string; category?: string; slug?: string }>;
        setProducts(list);
        // Derivar categorías
        const counts = new Map<string, { label: string; count: number }>();
        for (const p of list) {
          if (!p.category) continue;
          const id = p.category.toLowerCase().replace(/\s+/g, "-");
          const cur = counts.get(id);
          if (cur) cur.count += 1;
          else counts.set(id, { label: p.category, count: 1 });
        }
        const cats = Array.from(counts.entries()).map(([id, v]) => ({ id, label: v.label, count: v.count }));
        cats.sort((a, b) => b.count - a.count);
        setCategories(cats);
      })
        .catch(() => setCategories([]))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const banners = theme.categoryBanners ?? {};

  const updateBanner = (catId: string, patch: Partial<CategoryBanner>) => {
    const next = { ...banners, [catId]: { ...banners[catId], ...patch } };
    update("categoryBanners", next);
  };

  const removeBanner = (catId: string) => {
    const next = { ...banners };
    delete next[catId];
    update("categoryBanners", next);
  };

  const enabledCount = Object.values(banners).filter((b) => b?.enabled !== false && b?.image).length;

  return (
    <div className="space-y-8">
      {/* Banner explicativo */}
      <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-foreground">Promociones por categoría</p>
          <p className="text-sm text-muted mt-0.5">
            Subí una imagen promocional por cada categoría. Aparece en la sección{" "}
            <span className="font-bold">&ldquo;Oferta de Temporada&rdquo;</span> del storefront. Al click, el
            cliente va directo a la categoría — o a un producto específico si lo vinculás.
          </p>
        </div>
        <div className="hidden sm:block shrink-0 text-right">
          <p className="text-xs text-muted uppercase tracking-wider font-bold">Activos</p>
          <p className="text-2xl font-extrabold text-primary tabular-nums">{enabledCount}/{categories.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] dark:border-card-border p-10 text-center">
          <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
          <p className="text-sm text-muted mt-3">Cargando categorías…</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] dark:border-card-border p-8 text-center">
          <Tag className="h-10 w-10 text-muted mx-auto mb-2" />
          <p className="text-base font-bold text-foreground">Aún no hay categorías</p>
          <p className="text-sm text-muted mt-1">Agregá productos primero — las categorías se generan automáticamente.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {categories.map((cat) => {
            const banner = banners[cat.id] ?? {};
            const isEnabled = banner.enabled !== false; // default ON cuando hay imagen
            const hasImage = !!banner.image;
            const catProducts = products.filter((p) => (p.category || "").toLowerCase().replace(/\s+/g, "-") === cat.id);

            return (
              <section
                key={cat.id}
                className={cn(
                  "rounded-2xl border-2 transition-all overflow-hidden",
                  hasImage
                    ? "border-primary/30 bg-primary/[0.02]"
                    : "border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card"
                )}
              >
                {/* Header de categoría */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold",
                      hasImage ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-foreground"
                    )}>
                      <Tag className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-foreground leading-tight truncate">{cat.label}</h3>
                      <p className="text-xs text-muted">{cat.count} producto{cat.count !== 1 ? "s" : ""}{hasImage ? " · banner configurado" : " · sin banner"}</p>
                    </div>
                  </div>

                  {hasImage && (
                    <button
                      type="button"
                      onClick={() => updateBanner(cat.id, { enabled: !isEnabled })}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold transition-all",
                        isEnabled
                          ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] hover:bg-[var(--data-success-500)]/20"
                          : "bg-gray-100 dark:bg-surface text-muted hover:bg-gray-200"
                      )}
                    >
                      {isEnabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      {isEnabled ? "Activo" : "Desactivado"}
                    </button>
                  )}
                </div>

                {/* Body — grid imagen + textos */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* IMAGEN */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Imagen del banner</p>
                    <ImageUpload
                      value={banner.image ?? ""}
                      onChange={(url) => updateBanner(cat.id, { image: url, enabled: true })}
                      onClear={() => updateBanner(cat.id, { image: "" })}
                      folder={`promos/${cat.id}`}
                      label=""
                      aspectRatio="banner"
                      hint="Recomendado 1200×400 px. Aparece como fondo de la promo en la tienda."
                    />
                  </div>

                  {/* TEXTOS */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted">Título</label>
                      <input
                        type="text"
                        value={banner.title ?? ""}
                        onChange={(e) => updateBanner(cat.id, { title: e.target.value })}
                        placeholder={`Oferta en ${cat.label}`}
                        className={inputCls}
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted">Subtítulo</label>
                      <input
                        type="text"
                        value={banner.subtitle ?? ""}
                        onChange={(e) => updateBanner(cat.id, { subtitle: e.target.value })}
                        placeholder="Hasta 20% OFF en productos seleccionados"
                        className={inputCls}
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted">Texto del botón</label>
                      <input
                        type="text"
                        value={banner.ctaText ?? ""}
                        onChange={(e) => updateBanner(cat.id, { ctaText: e.target.value })}
                        placeholder={`Ver ${cat.label}`}
                        className={inputCls}
                        maxLength={30}
                      />
                    </div>

                    {/* Vincular a producto específico (opcional) */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                        Vincular a producto <span className="text-[length:var(--ts-2xs)] font-normal text-muted normal-case tracking-normal">(opcional)</span>
                      </label>
                      <select
                        value={banner.productSlug ?? ""}
                        onChange={(e) => updateBanner(cat.id, { productSlug: e.target.value || undefined })}
                        className={cn(inputCls, "appearance-none")}
                      >
                        <option value="">Filtrar por categoría completa</option>
                        {catProducts.map((p) => (
                          <option key={p.id} value={p.slug ?? String(p.id)}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[length:var(--ts-xs)] text-muted leading-snug">
                        Si elegís un producto, el botón lleva directo al detalle de ese producto.
                        Sin elegir, filtra toda la categoría.
                      </p>
                    </div>

                    {/* Acciones */}
                    {hasImage && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => removeBanner(cat.id)}
                          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold text-[var(--data-error-600)] border-2 border-[var(--data-error-500)]/20 hover:bg-[var(--data-error-500)]/5"
                        >
                          Quitar banner
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Preview live (cuando hay imagen) */}
                {hasImage && isEnabled && (
                  <div className="px-5 pb-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" />
                      Preview de cómo se verá
                    </p>
                    <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] dark:border-card-border h-44">
                      <Image
                        src={banner.image!}
                        alt={banner.title ?? cat.label}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                        unoptimized={banner.image!.startsWith("data:")}
                      />
                      <div className="absolute inset-0 bg-linear-to-r from-black/70 via-black/40 to-transparent" />
                      <div className="absolute inset-0 flex flex-col justify-center px-6 max-w-md">
                        <span className="inline-flex items-center gap-1.5 self-start text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/90 mb-2">
                          <Tag className="h-3 w-3" />
                          Oferta de Temporada
                        </span>
                        <h4 className="text-xl font-extrabold text-white leading-tight">{banner.title || `Oferta en ${cat.label}`}</h4>
                        <p className="text-sm text-white/85 mt-1 line-clamp-2">{banner.subtitle || "Hasta 20% OFF en productos seleccionados"}</p>
                        <button
                          type="button"
                          className="mt-3 self-start inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-white dark:bg-[var(--color-card)] text-primary text-xs font-bold shadow-[var(--shadow-lg)] pointer-events-none"
                        >
                          {banner.ctaText || `Ver ${cat.label}`}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Tip final */}
      <div className="rounded-2xl border-2 border-[var(--data-success-500)]/20 bg-[var(--data-success-500)]/5 p-5 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--data-success-500)]/15 flex items-center justify-center">
          <ExternalLink className="h-5 w-5 text-[var(--data-success-500)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Tip: cómo se ve en la tienda</p>
          <p className="text-xs text-muted mt-1 leading-snug">
            Los banners aparecen en la sección <span className="font-bold">&ldquo;Oferta de Temporada&rdquo;</span> rotando automáticamente cada 5 segundos.
            En desktop se muestra grande con 2 promos secundarias al lado. Al click, navegan al producto vinculado (si elegiste uno) o filtran la categoría en el catálogo.
          </p>
        </div>
      </div>
    </div>
  );
}
