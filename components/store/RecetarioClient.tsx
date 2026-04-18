'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Clock, Users, ChefHat, ShoppingCart, Flame,
  X, Sparkles, ArrowRight, Star, Eye, LayoutGrid, List,
  Send, Utensils, Salad, Soup, Cake, GlassWater, Zap,
  Trophy, MapPin, type LucideIcon,
} from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";
import { PaicheEnOlla } from "@/components/ui-system/illustrations/pucallpa-locals";
import { CorazonLatiendo } from "@/components/ui-system/illustrations/contextual";
import { CanastaVacia, OllaVacia } from "@/components/ui-system/illustrations/empty-states";

/**
 * Rotation deterministica de ilustraciones para cards sin imagen.
 * Componente — no retorna componentes dinamicos para evitar
 * react-hooks/static-components lint rule.
 */
function RecipeFallbackIllustration({
  id,
  size = 180,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const pick = Math.abs(hash) % 4;
  if (pick === 0) return <PaicheEnOlla size={size} strokeWidth={1.5} className={className} />;
  if (pick === 1) return <OllaVacia size={size} strokeWidth={1.5} className={className} />;
  if (pick === 2) return <CorazonLatiendo size={size} strokeWidth={1.5} className={className} />;
  return <CanastaVacia size={size} strokeWidth={1.5} className={className} />;
}

// ── Types ──────────────────────────────────────────────────
type Ingrediente = {
  id?: string;
  productoId?: number | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  imagen?: string | null;
  stock: number;
  categoria?: string;
};

type Receta = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tiempoMinutos?: number;
  porciones?: number;
  dificultad?: string;
  videoUrl?: string | null;
  categoria?: string;
  costoTotal?: number;
  colorFrom?: string;
  colorTo?: string;
  imageUrl?: string | null;
  ingredientes: Ingrediente[];
  totalIngredientes: number;
  pasos?: string[];
};

// ── Constants ──────────────────────────────────────────────
const CATEGORIAS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "todas", label: "Todas", Icon: Utensils },
  { id: "entradas", label: "Entradas", Icon: Salad },
  { id: "platos-de-fondo", label: "Platos de fondo", Icon: ChefHat },
  { id: "sopas", label: "Sopas", Icon: Soup },
  { id: "postres", label: "Postres", Icon: Cake },
  { id: "bebidas", label: "Bebidas", Icon: GlassWater },
  { id: "rapidas", label: "Rápidas", Icon: Zap },
];

import { CATEGORIA_GRADIENTS } from "@/lib/recipe-gradients";

const DIFICULTAD_LABELS: Record<string, { label: string; Icon: LucideIcon }> = {
  "Facil": { label: "Fácil", Icon: Star },
  "Media": { label: "Media", Icon: Flame },
  "Dificil": { label: "Difícil", Icon: Trophy },
};

// ── Skeleton ───────────────────────────────────────────────
function RecetaSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse bg-[var(--surface-raised)] shadow-sm border border-[var(--rule-base)]">
      <div className={cn("bg-gray-200 dark:bg-gray-700", tall ? "h-64" : "h-48")} />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl mt-4" />
      </div>
    </div>
  );
}

// ── Intersection Observer hook for reveal ──────────────────
function useInView(ref: React.RefObject<HTMLElement | null>, once = true) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "50px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once]);
  return inView;
}

// ── Recipe Card — Gallery style ────────────────────────────
function RecetaCard({
  receta,
  onAddAll,
  index,
}: {
  receta: Receta;
  onAddAll: (r: Receta) => void;
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef);

  const dif = DIFICULTAD_LABELS[receta.dificultad || ""] || null;
  // Variable aspect ratio based on category
  const isWide = receta.categoria === "Bebidas" || receta.categoria === "Sopas";
  const aspectClass = isWide ? "aspect-[16/10]" : "aspect-[4/3]";

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.5) }}
      className="group break-inside-avoid mb-6"
    >
      <div className="rounded-2xl overflow-hidden bg-[var(--surface-raised)] shadow-sm hover:shadow-[var(--shadow-xl)] border border-[var(--rule-base)] transition-all duration-[var(--dur-slow)]">
        {/* Image area */}
        <Link href={`/recetas/${receta.id}`} className="block relative overflow-hidden">
          <div className={cn("relative w-full overflow-hidden", aspectClass)}>
            {receta.imageUrl ? (
              /* Recipe image */
              <Image
                src={receta.imageUrl}
                alt={receta.nombre}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover group-hover:scale-105 transition-transform duration-[var(--dur-slow)]"
              />
            ) : (
              /* Illustrative fallback rotando 4 ilustraciones deterministicas */
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)]">
                <RecipeFallbackIllustration
                  id={receta.id}
                  size={180}
                  className="text-[var(--text-tertiary)] opacity-70"
                />
              </div>
            )}

            {/* Category kicker corner (editorial, sin emoji) */}
            {receta.categoria && (
              <span className="absolute top-3 left-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white mix-blend-difference">
                {receta.categoria}
              </span>
            )}

            {/* Subtle bottom gradient for readability of floating badges */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/20 to-transparent" />

            {/* Floating badges on image */}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 flex-wrap">
              {receta.tiempoMinutos && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur border border-[var(--rule-base)] text-gray-800 text-[length:var(--ts-xs)] font-bold tabular-nums">
                  <Clock className="h-3 w-3" strokeWidth={1.75} /> {receta.tiempoMinutos} min
                </span>
              )}
              {receta.porciones && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur border border-[var(--rule-base)] text-gray-800 text-[length:var(--ts-xs)] font-bold tabular-nums">
                  <Users className="h-3 w-3" strokeWidth={1.75} /> {receta.porciones}
                </span>
              )}
              {dif && (() => {
                const DIcon = dif.Icon;
                return (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur border border-[var(--rule-base)] text-gray-800 text-[length:var(--ts-xs)] font-bold">
                    <DIcon className="h-3 w-3" strokeWidth={1.75} /> {dif.label}
                  </span>
                );
              })()}
            </div>

            {/* Video badge */}
            {receta.videoUrl && (
              <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-red-500/90 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-1 shadow-lg">
                <Flame className="h-3 w-3" /> Video
              </span>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-[var(--dur-slow)] flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-all duration-[var(--dur-base)] transform translate-y-4 group-hover:translate-y-0 flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/95 text-gray-900 text-sm font-bold shadow-xl">
                <Eye className="h-4 w-4" /> Ver receta
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </Link>

        {/* Card body */}
        <div className="p-5">
          <Link href={`/recetas/${receta.id}`}>
            <h3 className="text-lg font-bold text-[var(--text-primary)] leading-tight group-hover:text-primary dark:group-hover:text-primary-light transition-colors">
              {receta.nombre}
            </h3>
          </Link>
          {receta.categoria && (
            <span className="inline-block mt-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">
              {receta.categoria}
            </span>
          )}
          {receta.descripcion && (
            <p className="text-sm text-[var(--text-tertiary)] line-clamp-2 mt-2 leading-relaxed">
              {receta.descripcion}
            </p>
          )}

          {/* Summary info */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--rule-base)]">
            <span className="text-sm text-[var(--text-tertiary)]">
              {receta.ingredientes.length} ingredientes
            </span>
            <span className="text-lg font-extrabold text-primary dark:text-primary-light">
              S/ {Number(receta.totalIngredientes).toFixed(2)}
            </span>
          </div>

          {/* Buy button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddAll(receta);
            }}
            className="w-full mt-4 py-3 rounded-xl bg-primary hover:bg-primary-dark active:scale-[0.98] text-white text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
          >
            <ShoppingCart className="h-4 w-4" />
            Comprar ingredientes
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Category Highlight Card ────────────────────────────────
function CategoriaCard({
  nombre,
  Icon,
  count,
  onClick,
}: {
  nombre: string;
  Icon: LucideIcon;
  count: number;
  colors?: { from: string; to: string };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-40 sm:w-48 rounded-xl overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-gray-900 dark:hover:border-gray-500 transition-all duration-[var(--dur-base)] group active:scale-[0.98] text-left"
    >
      <div className="h-28 flex items-center justify-center bg-[var(--surface-canvas)] border-b border-[var(--rule-base)] text-[var(--text-secondary)]">
        <Icon
          className="h-10 w-10 group-hover:scale-110 transition-transform duration-[var(--dur-base)]"
          strokeWidth={1.25}
          aria-hidden="true"
        />
      </div>
      <div className="px-4 py-3.5">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 tabular-nums">
          {count} receta{count !== 1 ? "s" : ""}
        </p>
        <p className="mt-1 font-extrabold text-sm text-[var(--text-primary)] tracking-tight">
          {nombre}
        </p>
      </div>
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────
export default function RecetarioClient() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todas");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [suggestion, setSuggestion] = useState("");
  const { addItem } = useCart();
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recetas/publicas")
      .then(r => r.json())
      .then((data: Receta[]) => {
        if (!cancelled) setRecetas(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (!cancelled) { setRecetas([]); setError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = recetas;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.nombre.toLowerCase().includes(q) ||
        r.descripcion?.toLowerCase().includes(q) ||
        r.ingredientes.some(i => i.nombre.toLowerCase().includes(q))
      );
    }

    if (catFilter !== "todas") {
      if (catFilter === "rapidas") {
        list = list.filter(r => r.tiempoMinutos && r.tiempoMinutos < 15);
      } else {
        const catName = CATEGORIAS.find(c => c.id === catFilter)?.label || "";
        list = list.filter(r => r.categoria?.toLowerCase() === catName.toLowerCase());
      }
    }

    return list;
  }, [recetas, search, catFilter]);

  // Category counts for the highlight section
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of recetas) {
      const cat = r.categoria || "Otros";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [recetas]);

  const handleAddAll = useCallback((receta: Receta) => {
    let addedCount = 0;
    for (const ing of receta.ingredientes) {
      if (ing.stock > 0 && ing.productoId) {
        addItem({
          id: ing.productoId,
          name: ing.nombre,
          price: ing.precio,
          image: ing.imagen || "",
          unit: ing.unidad,
          category: ing.categoria || "Receta",
        });
        addedCount++;
      }
    }
    if (addedCount === 0) {
      addedCount = receta.ingredientes.filter(i => i.stock > 0).length;
    }
    showToast(
      `${addedCount} ingredientes de "${receta.nombre}" agregados`,
      receta.ingredientes[0]?.imagen || "",
    );
  }, [addItem, showToast]);

  const handleSuggestion = () => {
    if (!suggestion.trim()) return;
    try {
      const saved = JSON.parse(localStorage.getItem("buleje-recipe-suggestions") || "[]");
      saved.push({ text: suggestion.trim(), date: new Date().toISOString() });
      localStorage.setItem("buleje-recipe-suggestions", JSON.stringify(saved));
    } catch { /* ignore */ }
    showToast("Gracias por tu sugerencia!", "");
    setSuggestion("");
  };

  const handleRetry = useCallback(() => {
    setError(false);
    setLoading(true);
    fetch("/api/recetas/publicas")
      .then(r => r.json())
      .then((data: Receta[]) => setRecetas(Array.isArray(data) ? data : []))
      .catch(() => { setRecetas([]); setError(true); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ═══════════════════════ HERO SECTION — 2 column culinario ═══════════════════════ */}
      <section className="relative overflow-hidden py-12 sm:py-16 lg:py-20 bg-[var(--surface-canvas)]">
        {/* Blobs decorativos */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-24 left-[10%] h-80 w-80 rounded-full bg-primary/8 blur-[100px]" />
          <div className="absolute top-1/3 right-[-8%] h-64 w-64 rounded-full bg-amber-400/8 blur-[90px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 lg:gap-12 items-center">
            {/* LEFT — content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="order-2 lg:order-1"
            >
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-5"
              >
                <ChefHat className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                Recetas · Inspiración local
              </motion.span>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[var(--text-primary)] leading-[1.05] tracking-tight">
                Lo que cocinás hoy,{" "}
                <span className="text-primary">lo traemos mañana</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[var(--text-tertiary)] max-w-xl leading-relaxed">
                Recetas de Pucallpa con ingredientes que podés pedir al toque.
                Arma tu canasta con 1 click y recibe todo en tu casa.
              </p>

              {/* Search bar */}
              <div className="mt-8 max-w-xl">
                <div className="relative">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Busca arroz con pollo, ceviche, lomo saltado..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full h-14 pl-14 pr-12 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-primary)] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4 text-[var(--text-tertiary)]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Stats inline */}
              <div className="mt-6 flex flex-wrap items-center gap-4 sm:gap-6 text-[var(--text-tertiary)] text-sm">
                <span className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-primary" strokeWidth={1.75} />
                  <span className="font-bold text-[var(--text-primary)]">{recetas.length}</span> recetas
                </span>
                <span className="w-px h-4 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
                <span className="flex items-center gap-1.5">
                  <ChefHat className="h-4 w-4 text-primary" strokeWidth={1.75} />
                  <span className="font-bold text-[var(--text-primary)]">{Object.keys(categoryCounts).length}</span> categorias
                </span>
                <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 hidden sm:block" aria-hidden="true" />
                <span className="hidden sm:flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" strokeWidth={1.75} />
                  Ingredientes locales
                </span>
              </div>
            </motion.div>

            {/* RIGHT — ilustracion culinaria stack */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
              className="order-1 lg:order-2 flex flex-col items-center gap-5 sm:gap-6"
              aria-hidden="true"
            >
              {/* Olla con paiche — representa cocina local */}
              <div className="relative w-full max-w-[320px] aspect-square bg-[var(--surface-sunken)] rounded-3xl border border-[var(--rule-base)] flex items-center justify-center overflow-hidden">
                <PaicheEnOlla
                  size={220}
                  className="relative text-[var(--text-secondary)]"
                />
                {/* Steam accent flotante */}
                <div className="absolute top-6 right-6 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              </div>

              {/* Corazón (inspiración) — representa pasión por cocinar */}
              <div className="relative w-full max-w-[320px] aspect-[4/3] bg-[var(--surface-sunken)] rounded-3xl border border-[var(--rule-base)] flex items-center justify-center overflow-hidden">
                <CorazonLatiendo
                  size={160}
                  className="relative text-[var(--text-secondary)]"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FILTER BAR ═══════════════════════ */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-[var(--rule-base)] shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Category pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
              {CATEGORIAS.map(cat => {
                const CIcon = cat.Icon;
                return (
                <button
                  key={cat.id}
                  onClick={() => setCatFilter(cat.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-[var(--dur-base)] flex items-center gap-1.5 border",
                    catFilter === cat.id
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-gray-400"
                  )}
                >
                  <CIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {cat.label}
                </button>
                );
              })}
            </div>

            {/* View toggle + count */}
            <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
              <span className="text-sm text-[var(--text-tertiary)] whitespace-nowrap">
                {filtered.length} receta{filtered.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center rounded-lg border border-[var(--rule-base)] overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "grid" ? "bg-primary text-white" : "text-gray-400 hover:text-gray-600"
                  )}
                  aria-label="Vista de galeria"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "list" ? "bg-primary text-white" : "text-gray-400 hover:text-gray-600"
                  )}
                  aria-label="Vista de lista"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile count */}
          <div className="sm:hidden mt-2 flex items-center justify-between">
            <span className="text-sm text-[var(--text-tertiary)]">
              {filtered.length} receta{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ RECIPE GALLERY ═══════════════════════ */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {loading ? (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="break-inside-avoid mb-6">
                <RecetaSkeleton tall={i % 3 === 0} />
              </div>
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20"
          >
            <div className="text-6xl mb-4">{"\u26A0\uFE0F"}</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              Error cargando recetas
            </h3>
            <p className="text-[var(--text-tertiary)] mb-6">
              No pudimos cargar las recetas. Verifica tu conexion e intenta de nuevo.
            </p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg"
            >
              <Sparkles className="h-4 w-4" />
              Reintentar
            </button>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20"
          >
            <div className="text-7xl mb-4">{"\uD83D\uDD0D"}</div>
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              No hay recetas de {catFilter !== "todas" ? `"${CATEGORIAS.find(c => c.id === catFilter)?.label}"` : "esta busqueda"}
            </h3>
            <p className="text-[var(--text-tertiary)] mb-6">
              Prueba con otra palabra o cambia el filtro.
            </p>
            <button
              onClick={() => { setSearch(""); setCatFilter("todas"); }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg"
            >
              <Sparkles className="h-4 w-4" />
              Ver todas las recetas
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${catFilter}-${search}-${viewMode}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                viewMode === "grid"
                  ? "columns-1 sm:columns-2 lg:columns-3 gap-6"
                  : "space-y-4 max-w-3xl mx-auto"
              )}
            >
              {filtered.map((receta, idx) =>
                viewMode === "grid" ? (
                  <RecetaCard key={receta.id} receta={receta} onAddAll={handleAddAll} index={idx} />
                ) : (
                  <RecetaListItem key={receta.id} receta={receta} onAddAll={handleAddAll} index={idx} />
                )
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ═══════════════════════ CATEGORIES SECTION ═══════════════════════ */}
      {!loading && recetas.length > 0 && (
        <section className="border-t border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-6">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400">
                Explorá
              </p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Categorías destacadas
              </h2>
            </div>
            <div className="flex items-stretch gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {Object.entries(categoryCounts).map(([cat, count]) => {
                const colors = CATEGORIA_GRADIENTS[cat] || { from: "#e5e7eb", to: "#d1d5db" };
                const catEntry = CATEGORIAS.find(c => c.label === cat);
                const CIcon = catEntry?.Icon ?? Utensils;
                return (
                  <CategoriaCard
                    key={cat}
                    nombre={cat}
                    Icon={CIcon}
                    count={count}
                    colors={colors}
                    onClick={() => {
                      const target = CATEGORIAS.find(c => c.label === cat);
                      if (target) setCatFilter(target.id);
                      else setCatFilter("todas");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════ CTA SUGGESTION ═══════════════════════ */}
      <section className="border-t border-[var(--rule-base)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-3">
            No encuentras lo que buscas?
          </h2>
          <p className="text-[var(--text-tertiary)] mb-8 max-w-md mx-auto">
            Cuentanos que plato te gustaria preparar y lo agregaremos al recetario.
          </p>
          <div className="max-w-md mx-auto flex gap-3">
            <input
              type="text"
              placeholder="Ej: Arroz con mariscos"
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSuggestion()}
              className="flex-1 h-12 px-5 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
            <button
              onClick={handleSuggestion}
              disabled={!suggestion.trim()}
              className="h-12 px-6 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <Send className="h-4 w-4" />
              Sugerir
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ FINAL CTA ═══════════════════════ */}
      <section className="border-t border-[var(--rule-base)] bg-[var(--surface-canvas)]/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
            Todos los ingredientes en un solo lugar
          </h2>
          <p className="text-[var(--text-tertiary)] mb-6 max-w-md mx-auto">
            Buleje tiene todo lo que necesitas para preparar tus recetas favoritas. Delivery en Pucallpa.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-white font-bold text-lg hover:bg-primary-dark transition-all active:scale-[0.98]"
          >
            Ver tienda <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

// ── List View Item ─────────────────────────────────────────
function RecetaListItem({
  receta,
  onAddAll,
  index,
}: {
  receta: Receta;
  onAddAll: (r: Receta) => void;
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, x: -20 }}
      animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
    >
      <div className="flex gap-4 bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden shadow-sm hover:shadow-lg transition-all duration-[var(--dur-base)] group">
        {/* Mini image */}
        <Link href={`/recetas/${receta.id}`} className="shrink-0 w-28 sm:w-36 relative overflow-hidden">
          {receta.imageUrl ? (
            <div className="h-full min-h-30 relative">
              <Image
                src={receta.imageUrl}
                alt={receta.nombre}
                fill
                sizes="(max-width: 640px) 112px, 144px"
                className="object-cover group-hover:scale-105 transition-transform duration-[var(--dur-slow)]"
              />
            </div>
          ) : (
            <div className="h-full min-h-30 flex items-center justify-center bg-[var(--surface-sunken)]">
              <RecipeFallbackIllustration
                id={receta.id}
                size={80}
                className="text-[var(--text-tertiary)] opacity-70"
              />
            </div>
          )}
        </Link>

        {/* Content */}
        <div className="flex-1 py-4 pr-4 flex flex-col justify-center min-w-0">
          <Link href={`/recetas/${receta.id}`}>
            <h3 className="font-extrabold tracking-tight text-[var(--text-primary)] group-hover:text-primary dark:group-hover:text-primary-light transition-colors truncate">
              {receta.nombre}
            </h3>
          </Link>
          {receta.descripcion && (
            <p className="text-sm text-[var(--text-tertiary)] line-clamp-1 mt-1">
              {receta.descripcion}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {receta.tiempoMinutos && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {receta.tiempoMinutos} min
              </span>
            )}
            <span>{receta.ingredientes.length} ingredientes</span>
            <span className="font-bold text-primary dark:text-primary-light">
              S/ {Number(receta.totalIngredientes).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center pr-4">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddAll(receta); }}
            className="h-10 w-10 rounded-xl bg-primary hover:bg-primary-dark text-white flex items-center justify-center transition-colors shadow-md"
            aria-label={`Comprar ingredientes de ${receta.nombre}`}
          >
            <ShoppingCart className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
