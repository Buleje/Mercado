'use client';

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Clock, Users, ChefHat, ShoppingCart, Check,
  Share2, Home, ChevronRight, Sparkles, Copy, Play,
  AlertTriangle,
} from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

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
  emoji?: string;
  tiempoMinutos?: number;
  porciones?: number;
  dificultad?: string;
  videoUrl?: string | null;
  categoria?: string;
  costoTotal?: number;
  colorFrom?: string;
  colorTo?: string;
  ingredientes: Ingrediente[];
  totalIngredientes: number;
  pasos?: string[];
};

const CATEGORIA_GRADIENTS: Record<string, { from: string; to: string }> = {
  "Entradas": { from: "#60a5fa", to: "#06b6d4" },
  "Platos de fondo": { from: "#f97316", to: "#ef4444" },
  "Postres": { from: "#f472b6", to: "#a855f7" },
  "Bebidas": { from: "#facc15", to: "#f59e0b" },
  "Sopas": { from: "#4ade80", to: "#2dd4bf" },
};

const DIFICULTAD_EMOJI: Record<string, string> = {
  "Facil": "\u2B50",
  "Media": "\uD83D\uDD25",
  "Dificil": "\uD83C\uDFC6",
};

// ── Component ──────────────────────────────────────────────
export default function RecetaDetalleClient({ recetaId }: { recetaId: string }) {
  const { addItem } = useCart();
  const { showToast } = useToast();

  const [receta, setReceta] = useState<Receta | null>(null);
  const [allRecetas, setAllRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [showConfetti, setShowConfetti] = useState(false);
  const [porciones, setPorciones] = useState<number>(4);
  const [porcionesBase, setPorcionesBase] = useState<number>(4);

  // Load recetas
  useEffect(() => {
    let cancelled = false;
    fetch("/api/recetas/publicas")
      .then(r => r.json())
      .then((data: Receta[]) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setAllRecetas(list);
        const found = list.find(r => r.id === recetaId);
        setReceta(found || null);
        if (found) {
          setCheckedIngredients(new Set(found.ingredientes.map((_, i) => i)));
        }
      })
      .catch(() => { if (!cancelled) { setReceta(null); setAllRecetas([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recetaId]);

  // Load saved steps from localStorage
  useEffect(() => {
    if (!receta) return;
    const saved = (() => { try { return localStorage.getItem(`bsm-receta-steps-${recetaId}`); } catch { return null; } })();
    if (saved) {
      const parsed = (() => { try { return JSON.parse(saved) as number[]; } catch { return null; } })();
      if (parsed) setCheckedSteps(new Set(parsed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recetaId]);

  // Save steps to localStorage
  const toggleStep = (idx: number) => {
    setCheckedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      try { localStorage.setItem(`bsm-receta-steps-${recetaId}`, JSON.stringify([...next])); } catch { /* ignore */ }

      // Check if all steps completed
      if (receta?.pasos && next.size === receta.pasos.length) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
      return next;
    });
  };

  const toggleIngredient = (idx: number) => {
    setCheckedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Computed
  const selectedIngredients = useMemo(() => {
    if (!receta) return [];
    return receta.ingredientes.filter((_, i) => checkedIngredients.has(i));
  }, [receta, checkedIngredients]);

  const selectedTotal = useMemo(() => {
    return selectedIngredients.reduce((sum, ing) => sum + ing.precio * ing.cantidad, 0);
  }, [selectedIngredients]);

  const relatedRecetas = useMemo(() => {
    if (!receta) return [];
    return allRecetas
      .filter(r => r.id !== receta.id && r.categoria === receta.categoria)
      .slice(0, 3);
  }, [receta, allRecetas]);

  const handleAddSelected = () => {
    let addedCount = 0;
    for (const ing of selectedIngredients) {
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
      addedCount = selectedIngredients.filter(i => i.stock > 0).length;
    }
    showToast(
      `${addedCount} ingredientes en tu carrito`,
      selectedIngredients[0]?.imagen || "",
    );
  };

  const handleShare = () => {
    if (!receta) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = [
      `*${receta.emoji || ""} ${receta.nombre}* - Receta de Buleje`,
      receta.tiempoMinutos ? `\u23F1\uFE0F ${receta.tiempoMinutos} minutos` : "",
      receta.porciones ? `\uD83D\uDC65 ${receta.porciones} porciones` : "",
      `\uD83E\uDDC1 Ingredientes: ${receta.ingredientes.map(i => i.nombre).join(", ")}`,
      `\uD83D\uDCB0 Total: S/ ${receta.totalIngredientes.toFixed(2)}`,
      "",
      `\uD83D\uDC49 Ver receta completa: ${url}`,
    ].filter(Boolean).join("\n");

    if (navigator.share) {
      navigator.share({ title: receta.nombre, text, url }).catch(() => { /* cancelled */ });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  const handleCopyLink = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard.writeText(url).then(() => {
      showToast("Link copiado al portapapeles", "");
    }).catch(() => {
      showToast("No se pudo copiar el link", "");
    });
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-[#00B4A6] flex items-center justify-center">
            <ChefHat className="h-7 w-7 text-white animate-pulse" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Cargando receta...</p>
        </div>
      </div>
    );
  }

  // Not found
  if (!receta) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-7xl mb-6">{"\uD83D\uDE15"}</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">Receta no encontrada</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">La receta que buscas no existe o fue eliminada.</p>
          <Link
            href="/recetas"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#00B4A6] text-white font-bold hover:bg-[#009690] transition-colors shadow-lg"
          >
            <ArrowLeft className="h-4 w-4" /> Ver recetario
          </Link>
        </div>
      </div>
    );
  }

  const colors = receta.colorFrom && receta.colorTo
    ? { from: receta.colorFrom, to: receta.colorTo }
    : CATEGORIA_GRADIENTS[receta.categoria || ""] || { from: "#00B4A6", to: "#007A72" };
  const completedSteps = checkedSteps.size;
  const totalSteps = receta.pasos?.length || 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Recipe",
            name: receta.nombre,
            description: receta.descripcion,
            prepTime: receta.tiempoMinutos ? `PT${receta.tiempoMinutos}M` : undefined,
            recipeYield: receta.porciones ? `${receta.porciones} porciones` : undefined,
            recipeIngredient: receta.ingredientes.map(i => `${i.cantidad} ${i.unidad} ${i.nombre}`),
            recipeInstructions: receta.pasos?.map((p, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              text: p,
            })),
          }),
        }}
      />

      {/* ═══════════════════════ HERO SECTION ═══════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${colors.from} 0%, ${colors.to} 100%)`,
        }}
      >
        {/* Pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Breadcrumb on hero */}
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
          <nav className="flex items-center gap-2 text-sm text-white/60">
            <Link href="/" className="hover:text-white transition-colors flex items-center gap-1">
              <Home className="h-3.5 w-3.5" /> Inicio
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href="/recetas" className="hover:text-white transition-colors">
              Recetas
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-white font-medium truncate max-w-[200px]">
              {receta.nombre}
            </span>
          </nav>
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            {/* Large animated emoji */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
              className="mb-6"
            >
              <span
                className="text-[100px] sm:text-[128px] inline-block drop-shadow-2xl"
                style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.3))" }}
              >
                {receta.emoji || "\uD83C\uDF73"}
              </span>
            </motion.div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
              {receta.nombre}
            </h1>

            {receta.descripcion && (
              <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
                {receta.descripcion}
              </p>
            )}

            {/* Badges */}
            <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
              {receta.tiempoMinutos && (
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-white text-sm font-medium border border-white/10">
                  <Clock className="h-4 w-4 text-white/80" /> {receta.tiempoMinutos} min
                </span>
              )}
              {receta.porciones && (
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-white text-sm font-medium border border-white/10">
                  <Users className="h-4 w-4 text-white/80" /> {receta.porciones} porciones
                </span>
              )}
              {receta.dificultad && (
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-white text-sm font-medium border border-white/10">
                  {DIFICULTAD_EMOJI[receta.dificultad] || "\u2B50"} {receta.dificultad}
                </span>
              )}
              {receta.categoria && (
                <span className="px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-bold border border-white/15">
                  {receta.categoria}
                </span>
              )}
            </div>

            {/* Scroll to video button */}
            {receta.videoUrl && (
              <button
                onClick={() => document.getElementById("receta-video")?.scrollIntoView({ behavior: "smooth" })}
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/20 backdrop-blur-sm text-white font-bold hover:bg-white/30 transition-all border border-white/15"
              >
                <Play className="h-4 w-4" /> Ver video
              </button>
            )}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════ MAIN CONTENT ═══════════════════════ */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ═══ LEFT COLUMN (3/5) ═══ */}
          <div className="lg:col-span-3 space-y-8">

            {/* Video section */}
            {receta.videoUrl && (
              <motion.div
                id="receta-video"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="relative w-full rounded-2xl overflow-hidden shadow-xl" style={{ aspectRatio: "16/9" }}>
                  <iframe
                    src={receta.videoUrl}
                    title={`Video: ${receta.nombre}`}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </motion.div>
            )}

            {/* ═══ PREPARATION STEPS ═══ */}
            {receta.pasos && receta.pasos.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8 shadow-sm"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ChefHat className="h-6 w-6 text-[#f97316]" />
                    Preparacion
                  </h2>
                  {totalSteps > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                      {completedSteps}/{totalSteps}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {totalSteps > 0 && (
                  <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 mb-8 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#00B4A6] to-[#2dd4bf]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                )}

                {/* Timeline steps */}
                <div className="space-y-4">
                  {receta.pasos.map((paso, idx) => {
                    const done = checkedSteps.has(idx);
                    return (
                      <motion.button
                        key={idx}
                        onClick={() => toggleStep(idx)}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className={cn(
                          "w-full flex items-start gap-4 sm:gap-5 p-4 sm:p-5 rounded-2xl border text-left transition-all duration-300",
                          done
                            ? "bg-[#00B4A6]/5 border-[#00B4A6]/20 dark:bg-[#00B4A6]/10"
                            : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-[#00B4A6]/30 hover:shadow-md"
                        )}
                      >
                        {/* Step number circle */}
                        <div className={cn(
                          "flex-shrink-0 flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full text-sm sm:text-base font-bold transition-all duration-300",
                          done
                            ? "bg-[#00B4A6] text-white shadow-lg shadow-[#00B4A6]/30"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                        )}>
                          {done ? <Check className="h-5 w-5" /> : idx + 1}
                        </div>
                        <p className={cn(
                          "text-sm sm:text-base leading-relaxed pt-2 transition-all duration-300",
                          done ? "line-through text-gray-400 dark:text-gray-600" : "text-gray-800 dark:text-gray-200"
                        )}>
                          {paso}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Completion message */}
                <AnimatePresence>
                  {completedSteps === totalSteps && totalSteps > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-[#00B4A6]/10 to-[#f97316]/10 dark:from-[#00B4A6]/20 dark:to-[#f97316]/20 text-center border border-[#00B4A6]/20"
                    >
                      <p className="text-2xl mb-2">{showConfetti ? "\uD83C\uDF89\uD83C\uDF8A\uD83E\uDD73" : "\uD83C\uDF7D\uFE0F"}</p>
                      <p className="text-[#00B4A6] dark:text-[#2dd4bf] font-bold text-lg flex items-center justify-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Receta completada! Buen provecho!
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ═══ SHARE SECTION ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                Compartir receta
              </h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#20bd5a] transition-colors shadow-md"
                >
                  <Share2 className="h-4 w-4" />
                  WhatsApp
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  Copiar link
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  Compartir
                </button>
              </div>
            </motion.div>

            {/* ═══ RELATED RECIPES ═══ */}
            {relatedRecetas.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm"
              >
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#f97316]" />
                  Tambien te puede gustar
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {relatedRecetas.map(r => {
                    const rColors = r.colorFrom && r.colorTo
                      ? { from: r.colorFrom, to: r.colorTo }
                      : CATEGORIA_GRADIENTS[r.categoria || ""] || { from: "#00B4A6", to: "#007A72" };
                    return (
                      <Link
                        key={r.id}
                        href={`/recetas/${r.id}`}
                        className="group rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all duration-300"
                      >
                        <div
                          className="h-28 flex items-center justify-center relative"
                          style={{ background: `linear-gradient(135deg, ${rColors.from}, ${rColors.to})` }}
                        >
                          <span className="text-5xl group-hover:scale-110 transition-transform duration-500 drop-shadow-lg">
                            {r.emoji || "\uD83C\uDF73"}
                          </span>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </div>
                        <div className="p-4">
                          <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate group-hover:text-[#00B4A6] dark:group-hover:text-[#2dd4bf] transition-colors">
                            {r.nombre}
                          </h3>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            {r.tiempoMinutos && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {r.tiempoMinutos} min
                              </span>
                            )}
                            <span>{r.ingredientes.length} ing.</span>
                          </div>
                          <p className="text-sm font-bold text-[#00B4A6] dark:text-[#2dd4bf] mt-2">
                            S/ {r.totalIngredientes.toFixed(2)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>

          {/* ═══ RIGHT COLUMN (2/5) — SHOPPING LIST ═══ */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="lg:sticky lg:top-20 space-y-4"
            >
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                {/* Header */}
                <div
                  className="p-5 border-b border-gray-200 dark:border-gray-700"
                  style={{
                    background: `linear-gradient(135deg, ${colors.from}08, ${colors.to}08)`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-[#00B4A6]" />
                      Lista de compras
                    </h2>
                    <span className="text-lg font-extrabold text-[#00B4A6] dark:text-[#2dd4bf]">
                      S/ {receta.totalIngredientes.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {receta.ingredientes.length} ingredientes de la bodega
                  </p>
                </div>

                {/* Ingredient list */}
                <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                  {receta.ingredientes.map((ing, idx) => {
                    const isChecked = checkedIngredients.has(idx);
                    const agotado = ing.stock <= 0;
                    const stockBajo = ing.stock > 0 && ing.stock <= 5;
                    return (
                      <label
                        key={ing.id || idx}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200",
                          isChecked && !agotado
                            ? "border-[#00B4A6]/20 bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                          agotado && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {/* Custom checkbox */}
                        <div className={cn(
                          "flex-shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                          isChecked && !agotado
                            ? "bg-[#00B4A6] border-[#00B4A6]"
                            : "border-gray-300 dark:border-gray-600"
                        )}>
                          {isChecked && !agotado && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked && !agotado}
                          onChange={() => !agotado && toggleIngredient(idx)}
                          disabled={agotado}
                          className="sr-only"
                        />

                        {/* Product image */}
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                          {ing.imagen ? (
                            <Image src={ing.imagen} alt={ing.nombre} width={40} height={40} className="h-10 w-10 object-cover rounded-full" />
                          ) : (
                            <span className="text-lg">{receta.emoji || "\uD83E\uDD5A"}</span>
                          )}
                        </div>

                        {/* Name + quantity */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium truncate transition-all",
                            agotado ? "line-through text-gray-400" : "text-gray-800 dark:text-gray-200"
                          )}>
                            {ing.nombre}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {ing.cantidad} {ing.unidad}
                          </p>
                        </div>

                        {/* Price + stock */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                            S/ {(ing.precio * ing.cantidad).toFixed(2)}
                          </p>
                          {agotado ? (
                            <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5 justify-end">
                              Agotado
                            </span>
                          ) : stockBajo ? (
                            <span className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400 flex items-center gap-0.5 justify-end">
                              <AlertTriangle className="h-2.5 w-2.5" /> Quedan {ing.stock}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-green-600 dark:text-green-400">
                              Disponible
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Totals + action */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedIngredients.length} seleccionados
                    </span>
                    <span className="text-2xl font-extrabold text-gray-900 dark:text-white">
                      S/ {selectedTotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Main add button */}
                  <button
                    onClick={handleAddSelected}
                    disabled={selectedIngredients.length === 0}
                    className="w-full py-4 rounded-xl bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-xl shadow-[#00B4A6]/25 active:scale-[0.98]"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Agregar {selectedIngredients.length} ingredientes &middot; S/ {selectedTotal.toFixed(2)}
                  </button>

                  {/* Share button */}
                  <button
                    onClick={handleShare}
                    className="w-full mt-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Share2 className="h-4 w-4" />
                    Compartir receta
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ═══ STICKY MOBILE BOTTOM BAR ═══ */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 p-3 safe-area-bottom"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
      >
        <button
          onClick={handleAddSelected}
          disabled={selectedIngredients.length === 0}
          className="w-full py-4 rounded-xl bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 shadow-xl shadow-[#00B4A6]/25 active:scale-[0.98]"
        >
          <ShoppingCart className="h-5 w-5" />
          Agregar {selectedIngredients.length} ingredientes &middot; S/ {selectedTotal.toFixed(2)}
        </button>
      </div>
      {/* Spacer for mobile fixed bar */}
      <div className="h-24 lg:hidden" />
    </div>
  );
}
