"use client";

/**
 * MarketplaceCommandLauncher — buscador universal ⌘K del marketplace.
 *
 * Renderiza (1) una barra-lanzador en el feed y (2) un modal tipo command
 * palette (Linear/Vercel) que abre con ⌘K / Ctrl+K o tocando el lanzador.
 * Búsqueda difusa instantánea sobre datos REALES:
 *   · Tiendas      → navega a /marketplace/[slug]
 *   · Categorías   → aplica el filtro del catálogo (CatalogFilterContext)
 *   · Secciones    → scroll suave al ancla del feed
 *
 * Teclado completo: ⌘K abre · ↑/↓ navega · Enter elige · Esc cierra.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Store, Tag, LayoutList, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCatalogFilter } from "@/components/marketplace/catalog-filter-context";

interface StoreLite {
  slug: string;
  name: string;
  logo?: string | null;
  zone?: string | null;
}

interface Props {
  stores?: readonly StoreLite[];
  /** Secciones del feed: { id (ancla DOM), label }. */
  sections?: readonly { id: string; label: string }[];
}

type Item =
  | { kind: "store"; key: string; label: string; sub?: string; slug: string; logo?: string | null }
  | { kind: "category"; key: string; label: string; count: number }
  | { kind: "section"; key: string; label: string; anchor: string };

const KIND_META: Record<Item["kind"], { label: string; icon: typeof Store }> = {
  store: { label: "Tiendas", icon: Store },
  category: { label: "Categorías", icon: Tag },
  section: { label: "Secciones", icon: LayoutList },
};

function prettyLabel(id: string): string {
  const s = id.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default function MarketplaceCommandLauncher({ stores = [], sections = [] }: Props) {
  const router = useRouter();
  const filter = useCatalogFilter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [categories, setCategories] = useState<{ id: string; count: number }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Abrir/cerrar: ⌘K global + evento externo `buleje:open-command` ──────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("buleje:open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("buleje:open-command", onOpen);
    };
  }, []);

  // Cargar categorías reales al primer open (lazy, cacheado por el browser).
  useEffect(() => {
    if (!open || categories.length > 0) return;
    let cancelled = false;
    fetch("/api/marketplace/product-categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const raw = Array.isArray(j) ? j : (j.categories ?? j.data ?? []);
        setCategories(
          (raw as { id: string; count: number }[]).filter((c) => c?.id),
        );
      })
      .catch(() => {/* fetch no crítico: la sección se oculta o usa fallback */});
    return () => {
      cancelled = true;
    };
  }, [open, categories.length]);

  // Focus + reset al abrir; restaurar scroll del body al cerrar.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      document.body.style.overflow = "hidden";
      return () => {
        window.clearTimeout(t);
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // ── Construir índice de items ───────────────────────────────────────────────
  const allItems = useMemo<Item[]>(() => {
    const storeItems: Item[] = stores
      .filter((s) => s?.slug && s?.name)
      .map((s) => ({
        kind: "store",
        key: `store:${s.slug}`,
        label: s.name,
        sub: s.zone ?? undefined,
        slug: s.slug,
        logo: s.logo,
      }));
    const catItems: Item[] = categories.map((c) => ({
      kind: "category",
      key: `cat:${c.id}`,
      label: prettyLabel(c.id),
      count: c.count,
    }));
    const sectionItems: Item[] = sections.map((s) => ({
      kind: "section",
      key: `sec:${s.id}`,
      label: s.label,
      anchor: s.id,
    }));
    return [...storeItems, ...catItems, ...sectionItems];
  }, [stores, categories, sections]);

  // ── Filtrar + ordenar por relevancia ────────────────────────────────────────
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return allItems;
    return allItems
      .map((it) => {
        const l = norm(it.label);
        if (l.startsWith(q)) return { it, rank: 0 };
        if (l.includes(q)) return { it, rank: 1 };
        // match por palabra
        if (l.split(/\s+/).some((w) => w.startsWith(q))) return { it, rank: 2 };
        return null;
      })
      .filter((x): x is { it: Item; rank: number } => x != null)
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.it);
  }, [allItems, query]);

  // Agrupar para mostrar (manteniendo el orden de `results` para el índice plano).
  const groups = useMemo(() => {
    const order: Item["kind"][] = ["store", "category", "section"];
    const flat: Item[] = [];
    const grouped: { kind: Item["kind"]; items: { item: Item; idx: number }[] }[] = [];
    for (const kind of order) {
      const items = results.filter((r) => r.kind === kind);
      if (items.length === 0) continue;
      grouped.push({
        kind,
        items: items.map((item) => {
          const idx = flat.length;
          flat.push(item);
          return { item, idx };
        }),
      });
    }
    return { grouped, flat };
  }, [results]);

  const flat = groups.flat;

  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(Math.max(0, flat.length - 1));
  }, [flat.length, activeIdx]);

  const select = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      setOpen(false);
      if (item.kind === "store") {
        router.push(`/marketplace/${item.slug}`);
      } else if (item.kind === "category") {
        if (filter) {
          filter.setCategory(item.key.replace(/^cat:/, ""));
          window.setTimeout(() => {
            document.getElementById("mp-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 60);
        } else {
          router.push(`/marketplace?category=${encodeURIComponent(item.key.replace(/^cat:/, ""))}`);
        }
      } else {
        document.getElementById(item.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [filter, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(flat[activeIdx]);
    }
  };

  // Mantener el item activo visible en la lista.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <>
      {/* Brandon 2026-06-06: la barra-lanzador visible se quitó — era
          redundante con el buscador del navbar (siempre visible arriba).
          El palette sigue vivo vía ⌘K / Ctrl+K y el evento
          `buleje:open-command` (lo puede disparar cualquier botón). */}

      {/* ── Modal palette ────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Buscador universal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-2xl">
            {/* Input */}
            <div className="flex items-center gap-2.5 border-b border-[var(--rule-soft)] px-4">
              <Search className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2.25} aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Buscar tiendas, categorías o secciones…"
                className="flex-1 bg-transparent py-4 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                aria-label="Buscar"
              />
              <kbd className="shrink-0 rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,0.6875rem)] font-bold text-[var(--text-tertiary)]">
                Esc
              </kbd>
            </div>

            {/* Resultados */}
            <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
              {flat.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                  Sin resultados para “{query}”.
                </p>
              ) : (
                groups.grouped.map((g) => {
                  const Meta = KIND_META[g.kind];
                  return (
                    <div key={g.kind} className="mb-1">
                      <p className="flex items-center gap-1.5 px-4 py-1 text-[length:var(--ts-2xs,0.6875rem)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        <Meta.icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                        {Meta.label}
                      </p>
                      {g.items.map(({ item, idx }) => {
                        const isActive = idx === activeIdx;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            data-idx={idx}
                            onClick={() => select(item)}
                            onMouseMove={() => setActiveIdx(idx)}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                              isActive ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-sunken)]",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg",
                                isActive ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                              )}
                            >
                              {item.kind === "store" && item.logo ? (
                                <Image src={item.logo} alt="" width={32} height={32} className="h-full w-full object-cover" />
                              ) : (
                                (() => {
                                  const I = KIND_META[item.kind].icon;
                                  return <I className="h-4 w-4" strokeWidth={2.25} aria-hidden />;
                                })()
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                                {item.label}
                              </span>
                              {item.kind === "store" && item.sub && (
                                <span className="block truncate text-xs text-[var(--text-tertiary)]">{item.sub}</span>
                              )}
                              {item.kind === "category" && (
                                <span className="block truncate text-xs text-[var(--text-tertiary)]">{item.count} productos</span>
                              )}
                            </span>
                            <ArrowRight
                              className={cn(
                                "h-4 w-4 shrink-0 transition-colors",
                                isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]/40",
                              )}
                              strokeWidth={isActive ? 2.5 : 2}
                              aria-hidden
                            />
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-3 border-t border-[var(--rule-soft)] px-4 py-2 text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1"><kbd className="rounded border border-[var(--rule-base)] px-1">↑</kbd><kbd className="rounded border border-[var(--rule-base)] px-1">↓</kbd> navegar</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-[var(--rule-base)] px-1">↵</kbd> abrir</span>
              <span className="ml-auto flex items-center gap-1"><kbd className="rounded border border-[var(--rule-base)] px-1">esc</kbd> cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
