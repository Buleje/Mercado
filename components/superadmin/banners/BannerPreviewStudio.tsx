"use client";

/**
 * BannerPreviewStudio — editor + preview consolidado, estilo "Photoshop ligero".
 *
 * 3 modos seleccionables desde el header:
 *  - Editar (default): canvas grande con drag-to-pan + barra de herramientas
 *    flotante (anchors, zoom, undo/redo) + panel izquierdo de banners
 *    (thumbnails clickeables) + panel derecho con tabs:
 *      Encuadre · Imagen · Texto · Color · Promo · Estado
 *  - Solo: el banner aislado sobre fondo blanco a 1200/1600/100% para
 *    validar el resultado real.
 *  - Presentación: rotación automática con play/pause, velocidad y animación
 *    (fade/slide/zoom/none).
 *
 * Atajos:
 *  Esc cierra · 1/2/3 cambia de modo · +/- zoom · 0 reset · C centrar
 *  F toggle fit · ←→↑↓ nudge (modo Editar) · Shift+←→↑↓ nudge x4 ·
 *  Cmd/Ctrl+Z undo · Cmd/Ctrl+Shift+Z redo · espacio play/pausa (Presentación).
 */

import { useEffect, useRef, useState, useCallback, useMemo, Fragment } from "react";
import { useBannerHistory } from "./hooks/useBannerHistory";
import { useBannerCanvas } from "./hooks/useBannerCanvas";
import { useStudioKeyboard } from "./hooks/useStudioKeyboard";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Layers,
  Gauge,
  Maximize2,
  Minimize2,
  RotateCcw,
  Target,
  Edit3,
  Image as ImageIconLucide,
  Type as TypeIcon,
  Palette,
  ShoppingBag,
  ToggleLeft,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Plus,
  Undo2,
  Redo2,
  Layout,
  Save,
  Sun,
  Moon,
  Search,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import PromoBannerRenderer, { type PromoBanner } from "@/components/marketplace/PromoBannerRenderer";
import ImageUploader from "@/components/superadmin/_shared/ImageUploader";
import type { ImageAdjust, PromoItem, Anchor as PromoAnchor } from "@/lib/promo-banners";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "edit" | "solo" | "show";
type StudioTheme = "dark" | "light";
type Animation = "fade" | "slide" | "zoom" | "none";
type Width = "1200" | "1600" | "full";
type EditTab = "frame" | "image" | "text" | "color" | "promo" | "state";

type StudioPromoEmbed = {
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
  imageAdjust?: ImageAdjust;
  items?: PromoItem[];
  badgeAnchor?: PromoAnchor | null;
  buyAnchor?: PromoAnchor | null;
};

/** Subset editable de Banner que usamos en el Studio (compatible con
 *  PromoBanner del renderer + los campos de admin). */
export type StudioBanner = PromoBanner & {
  promo?: StudioPromoEmbed;
};

interface Props {
  banners: StudioBanner[];
  initialIndex?: number;
  slotLabel?: string;
  /** Folder de uploads para imágenes nuevas (ej: `banners-explorar`). */
  uploadFolder?: string;
  /** Si está presente, el modo Editar permite escribir cambios al banner. */
  onPatchBanner?: (index: number, patch: Partial<StudioBanner>) => void;
  onMoveBanner?: (index: number, dir: -1 | 1) => void;
  onDuplicateBanner?: (index: number) => void;
  onRemoveBanner?: (index: number) => void;
  onAddBanner?: () => void;
  onClose: () => void;
  /** Presets de color (gradientes) que usa el editor. */
  colorPresets?: Array<{ id: string; label: string; from: string; to: string }>;
}

const ANIM_DURATION_MS = 400;
const ZOOM_MIN = 50;
const ZOOM_MAX = 250;
const NUDGE_PCT = 5;
const NUDGE_FAST = 20;
const HISTORY_CAP = 30;

const DEFAULT_ADJ: ImageAdjust = { position: { x: 50, y: 50 }, scale: 100, fit: "cover" };

const DEFAULT_PROMO: StudioPromoEmbed = {
  productName: "",
  productImage: null,
  price: null,
  oldPrice: null,
  badge: "",
  buyHref: "",
  buyLabel: "Comprar ahora",
};

const FALLBACK_PRESETS: Array<{ id: string; label: string; from: string; to: string }> = [
  { id: "teal", label: "Buleje", from: "#ccfbf1", to: "#5eead4" },
  { id: "sky", label: "Cielo", from: "#dbeafe", to: "#bfdbfe" },
  { id: "amber", label: "Calidez", from: "#fef3c7", to: "#fde68a" },
  { id: "rose", label: "Promo", from: "#fce7f3", to: "#fbcfe8" },
  { id: "slate", label: "Editorial", from: "#e2e8f0", to: "#cbd5e1" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Banner templates — patches que aplican a un banner para arrancar desde un
// preset estético/comercial. Se aplican con `patch(template.payload)` y luego
// el usuario edita imagen/producto.
// ─────────────────────────────────────────────────────────────────────────────

type BannerTemplate = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  payload: Partial<StudioBanner>;
};

const BANNER_TEMPLATES: BannerTemplate[] = [
  {
    id: "blackfriday",
    label: "Black Friday",
    emoji: "🖤",
    description: "Hero oscuro · badge rojo · CTA contraste",
    payload: {
      type: "promo",
      title: "BLACK FRIDAY",
      subtitle: "Descuentos imperdibles solo este viernes",
      bgFrom: "#0c1015",
      bgTo: "#1f2937",
      ctaLabel: "Ver ofertas",
      promo: {
        ...DEFAULT_PROMO,
        badge: "-50%",
        buyLabel: "Comprar ya",
        badgeAnchor: { x: 12, y: 18 },
        buyAnchor: { x: 88, y: 80 },
      },
    },
  },
  {
    id: "combo2x1",
    label: "Combo 2x1",
    emoji: "🎁",
    description: "Amarillo cálido · badge 2x1",
    payload: {
      type: "promo",
      title: "Llevá 2, pagá 1",
      subtitle: "Combo de la semana en bodega",
      bgFrom: "#fef3c7",
      bgTo: "#fde68a",
      ctaLabel: "Lo quiero",
      promo: {
        ...DEFAULT_PROMO,
        badge: "2x1",
        buyLabel: "Aprovechar",
        badgeAnchor: { x: 12, y: 22 },
        buyAnchor: { x: 88, y: 78 },
      },
    },
  },
  {
    id: "liquidacion",
    label: "Liquidación",
    emoji: "🔥",
    description: "Naranja urgente · % grande",
    payload: {
      type: "promo",
      title: "Liquidación total",
      subtitle: "Hasta 70% off · Stock limitado",
      bgFrom: "#fed7aa",
      bgTo: "#fb923c",
      ctaLabel: "Ver stock",
      promo: {
        ...DEFAULT_PROMO,
        badge: "-70%",
        buyLabel: "Llevarlo",
        badgeAnchor: { x: 50, y: 50 },
        buyAnchor: { x: 88, y: 80 },
      },
    },
  },
  {
    id: "lanzamiento",
    label: "Lanzamiento",
    emoji: "✨",
    description: "Cielo · badge NUEVO",
    payload: {
      type: "promo",
      title: "Acaba de llegar",
      subtitle: "El producto que estabas esperando",
      bgFrom: "#dbeafe",
      bgTo: "#bfdbfe",
      ctaLabel: "Conocer",
      promo: {
        ...DEFAULT_PROMO,
        badge: "NUEVO",
        buyLabel: "Probar",
        badgeAnchor: { x: 14, y: 20 },
        buyAnchor: { x: 88, y: 76 },
      },
    },
  },
  {
    id: "diaespecial",
    label: "Día especial",
    emoji: "💝",
    description: "Rosa cálido · estilo regalo",
    payload: {
      type: "promo",
      title: "Regalá lo que disfruta",
      subtitle: "Selección especial para fechas especiales",
      bgFrom: "#fce7f3",
      bgTo: "#fbcfe8",
      ctaLabel: "Sorprender",
      promo: {
        ...DEFAULT_PROMO,
        badge: "REGALO",
        buyLabel: "Elegir",
        badgeAnchor: { x: 14, y: 18 },
        buyAnchor: { x: 88, y: 80 },
      },
    },
  },
  {
    id: "limpio",
    label: "Editorial",
    emoji: "🪶",
    description: "Gris suave · sin distracción",
    payload: {
      type: "classic",
      title: "Bodega San Martín",
      subtitle: "Frescura todos los días",
      bgFrom: "#e2e8f0",
      bgTo: "#cbd5e1",
      ctaLabel: "Explorar",
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BannerPreviewStudio({
  banners,
  initialIndex = 0,
  slotLabel,
  uploadFolder = "banners",
  onPatchBanner,
  onMoveBanner,
  onDuplicateBanner,
  onRemoveBanner,
  onAddBanner,
  onClose,
  colorPresets = FALLBACK_PRESETS,
}: Props) {
  const editable = !!onPatchBanner;
  const [mode, setMode] = useState<Mode>(editable ? "edit" : "solo");
  const [idx, setIdx] = useState(Math.min(initialIndex, Math.max(0, banners.length - 1)));

  // ── Panel layout + theme ─────────────────────────────────────────────────
  const {
    theme, setTheme,
    tab, setTab,
    leftOpen, setLeftOpen,
    rightOpen, setRightOpen,
    leftWidth, setLeftWidth,
    rightWidth, setRightWidth,
  } = useBannerCanvas();

  // Solo / Presentación state
  const [width, setWidth] = useState<Width>("1600");
  const [animation, setAnimation] = useState<Animation>("fade");
  const [speedMs, setSpeedMs] = useState(6000);
  const [playing, setPlaying] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [idx]);

  // Auto-rotate (modo Presentación)
  useEffect(() => {
    if (mode !== "show" || !playing || banners.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % banners.length), speedMs);
    return () => clearInterval(id);
  }, [mode, playing, speedMs, banners.length]);

  const current = banners[idx];

  // ── History / undo-redo ──────────────────────────────────────────────────
  const { patchAdjust, undo, redo, hasUndo, hasRedo } = useBannerHistory(banners, idx, onPatchBanner);

  // ── Patches generales ────────────────────────────────────────────────────
  const patch = useCallback(
    (p: Partial<StudioBanner>) => onPatchBanner?.(idx, p),
    [idx, onPatchBanner],
  );

  // ── Atajos de teclado ────────────────────────────────────────────────────
  useStudioKeyboard({
    mode, editable, banners, current, onClose,
    setMode,
    setIdx,
    setPlaying,
    patchAdjust,
    undo,
    redo,
  });

  if (banners.length === 0 && !editable) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estudio de banner"
      data-studio-theme={theme}
      className={cn(
        "studio-root fixed inset-0 z-[100] flex flex-col",
        theme === "dark" ? "bg-[#0c1015] text-[rgb(var(--st-fg))]" : "bg-[#f4f5f7] text-[#0c1015]",
      )}
    >
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header
        className={cn(
          "shrink-0 px-4 sm:px-6 py-3 flex items-center gap-3 border-b",
          theme === "dark" ? "border-[rgb(var(--st-fg)/0.1)] bg-black/60" : "border-black/10 bg-white",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[rgb(var(--st-fg))] shrink-0">
            <Edit3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-none truncate">Estudio de banner</p>
            <p className={cn(
              "text-[length:var(--ts-2xs)] leading-tight mt-0.5 truncate",
              theme === "dark" ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60",
            )}>
              {slotLabel ? `${slotLabel} · ` : ""}
              {banners.length} banner{banners.length === 1 ? "" : "s"} · ESC para cerrar
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {editable && (
            <ModeBtn active={mode === "edit"} onClick={() => setMode("edit")} icon={<Edit3 className="h-3.5 w-3.5" />} label="Editar" hint="1" theme={theme} />
          )}
          <ModeBtn active={mode === "solo"} onClick={() => setMode("solo")} icon={<Monitor className="h-3.5 w-3.5" />} label="Solo" hint="2" theme={theme} />
          <ModeBtn active={mode === "show"} onClick={() => setMode("show")} icon={<Layers className="h-3.5 w-3.5" />} label="Presentación" hint="3" theme={theme} />
          <span aria-hidden className={cn("h-6 w-px mx-1", theme === "dark" ? "bg-[rgb(var(--st-fg)/0.2)]" : "bg-black/15")} />
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-label="Cambiar tema del estudio"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              theme === "dark"
                ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg))] hover:bg-[rgb(var(--st-fg)/0.2)]"
                : "bg-black/5 text-[#0c1015] hover:bg-black/10",
            )}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              theme === "dark"
                ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg))] hover:bg-[rgb(var(--st-fg)/0.2)]"
                : "bg-black/5 text-[#0c1015] hover:bg-black/10",
            )}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────── */}
      {mode === "edit" ? (
        <EditMode
          theme={theme}
          banners={banners}
          idx={idx}
          setIdx={setIdx}
          current={current}
          tab={tab}
          setTab={setTab}
          leftOpen={leftOpen}
          setLeftOpen={setLeftOpen}
          rightOpen={rightOpen}
          setRightOpen={setRightOpen}
          leftWidth={leftWidth}
          setLeftWidth={setLeftWidth}
          rightWidth={rightWidth}
          setRightWidth={setRightWidth}
          patch={patch}
          patchAdjust={patchAdjust}
          undo={undo}
          redo={redo}
          hasUndo={hasUndo}
          hasRedo={hasRedo}
          onAddBanner={onAddBanner}
          onMoveBanner={onMoveBanner}
          onDuplicateBanner={onDuplicateBanner}
          onRemoveBanner={onRemoveBanner}
          uploadFolder={uploadFolder}
          colorPresets={colorPresets}
        />
      ) : mode === "solo" ? (
        <SoloMode
          theme={theme}
          current={current}
          banners={banners}
          idx={idx}
          setIdx={setIdx}
          width={width}
          setWidth={setWidth}
          animKey={animKey}
        />
      ) : (
        <ShowMode
          theme={theme}
          current={current}
          banners={banners}
          idx={idx}
          setIdx={setIdx}
          width={width}
          setWidth={setWidth}
          animation={animation}
          setAnimation={setAnimation}
          speedMs={speedMs}
          setSpeedMs={setSpeedMs}
          playing={playing}
          setPlaying={setPlaying}
          animKey={animKey}
        />
      )}

      {/* Animations + scoped utility classes — plain CSS para no toparme con
          styled-jsx en Turbopack (que se quedaba colgado al compilar). */}
      <style dangerouslySetInnerHTML={{ __html: STUDIO_CSS }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditMode — canvas central + paneles laterales + barra de herramientas
// ─────────────────────────────────────────────────────────────────────────────

function EditMode({
  theme,
  banners,
  idx,
  setIdx,
  current,
  tab,
  setTab,
  leftOpen,
  setLeftOpen,
  rightOpen,
  setRightOpen,
  leftWidth,
  setLeftWidth,
  rightWidth,
  setRightWidth,
  patch,
  patchAdjust,
  undo,
  redo,
  hasUndo,
  hasRedo,
  onAddBanner,
  onMoveBanner,
  onDuplicateBanner,
  onRemoveBanner,
  uploadFolder,
  colorPresets,
}: {
  theme: StudioTheme;
  banners: StudioBanner[];
  idx: number;
  setIdx: (i: number) => void;
  current: StudioBanner | undefined;
  tab: EditTab;
  setTab: (t: EditTab) => void;
  leftOpen: boolean;
  setLeftOpen: (b: boolean) => void;
  rightOpen: boolean;
  setRightOpen: (b: boolean) => void;
  leftWidth: number;
  setLeftWidth: (n: number) => void;
  rightWidth: number;
  setRightWidth: (n: number) => void;
  patch: (p: Partial<StudioBanner>) => void;
  patchAdjust: (next: ImageAdjust, opts?: { record?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  hasUndo: boolean;
  hasRedo: boolean;
  onAddBanner?: () => void;
  onMoveBanner?: (i: number, d: -1 | 1) => void;
  onDuplicateBanner?: (i: number) => void;
  onRemoveBanner?: (i: number) => void;
  uploadFolder: string;
  colorPresets: Array<{ id: string; label: string; from: string; to: string }>;
}) {
  const dark = theme === "dark";
  const panelBg = dark ? "bg-black/40" : "bg-white";
  const panelBorder = dark ? "border-[rgb(var(--st-fg)/0.1)]" : "border-black/10";
  const subtleText = dark ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60";
  const canvasBg = dark
    ? "bg-[radial-gradient(circle_at_center,#1f2937_0%,#0c1015_100%)]"
    : "bg-[radial-gradient(circle_at_center,#e5e7eb_0%,#f4f5f7_100%)]";
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; start: { x: number; y: number }; rect: DOMRect } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const adj = current?.imageAdjust ?? DEFAULT_ADJ;

  // Drag handlers for canvas
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!current?.imageUrl) return;
    const node = canvasRef.current;
    if (!node) return;
    node.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      start: { ...adj.position },
      rect: node.getBoundingClientRect(),
    };
    setDragging(true);
    // Push history once at drag start, not per move
    patchAdjust(adj, { record: true });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startY, start, rect } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextX = clamp(start.x - (dx / rect.width) * 100, 0, 100);
    const nextY = clamp(start.y - (dy / rect.height) * 100, 0, 100);
    patchAdjust({ ...adj, position: { x: round(nextX), y: round(nextY) } }, { record: false });
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  // Mouse wheel = zoom
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!current?.imageUrl) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 5;
    patchAdjust({ ...adj, scale: clamp(adj.scale + delta, ZOOM_MIN, ZOOM_MAX) });
  };

  // Drag state para los handles de resize de los paneles laterales.
  const sideDragRef = useRef<{ side: "left" | "right"; startX: number; start: number } | null>(null);
  const onSideResizeDown = (side: "left" | "right") => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    sideDragRef.current = {
      side,
      startX: e.clientX,
      start: side === "left" ? leftWidth : rightWidth,
    };
  };
  const onSideResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = sideDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (drag.side === "left") {
      const next = clamp(drag.start + dx, 200, 520);
      setLeftWidth(Math.round(next));
    } else {
      const next = clamp(drag.start - dx, 260, 600);
      setRightWidth(Math.round(next));
    }
  };
  const onSideResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    sideDragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className="flex-1 min-h-0 grid"
      style={{ gridTemplateColumns: `${leftOpen ? `${leftWidth}px ` : "44px "} 1fr ${rightOpen ? `${rightWidth}px` : "44px"}` }}
    >
      {/* ── LEFT: banner list ─────────────────────────────────────── */}
      <aside className={cn("relative overflow-hidden flex flex-col border-r", panelBg, panelBorder)}>
        {leftOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel izquierdo"
            onPointerDown={onSideResizeDown("left")}
            onPointerMove={onSideResizeMove}
            onPointerUp={onSideResizeEnd}
            onPointerCancel={onSideResizeEnd}
            className={cn(
              "absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-20 group",
              "hover:bg-[var(--accent)]/40 active:bg-[var(--accent)]/60 transition-colors",
            )}
            title="Arrastrá para redimensionar"
          >
            <div className={cn("absolute inset-y-0 right-0 w-px", dark ? "bg-white/10" : "bg-black/10")} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setLeftOpen(!leftOpen)}
          className="shrink-0 h-10 px-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[rgb(var(--st-fg)/0.6)] hover:text-[rgb(var(--st-fg))] border-b border-[rgb(var(--st-fg)/0.1)] flex items-center gap-1.5"
        >
          {leftOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {leftOpen && <span>Banners ({banners.length})</span>}
        </button>
        {leftOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setIdx(i)}
                aria-current={i === idx}
                className={cn(
                  "w-full text-left rounded-lg overflow-hidden border-2 transition-all",
                  i === idx
                    ? "border-[var(--accent)] shadow-md"
                    : "border-transparent hover:border-[rgb(var(--st-fg)/0.3)]",
                )}
              >
                <div className="aspect-[4/1]">
                  <PromoBannerRenderer banner={b} asLink={false} className="[&>div]:rounded-none [&>div]:border-0 h-full" />
                </div>
                <div className="px-2 py-1.5 bg-[rgb(var(--st-fg)/0.05)] flex items-center justify-between gap-1.5">
                  <span className="text-[length:var(--ts-2xs)] font-bold text-[rgb(var(--st-fg)/0.8)] truncate">
                    {b.title || "(sin título)"}
                  </span>
                  {!b.active && (
                    <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-warning-500)] shrink-0">
                      <EyeOff className="h-2.5 w-2.5" />
                      off
                    </span>
                  )}
                </div>
              </button>
            ))}
            {onAddBanner && (
              <button
                type="button"
                onClick={onAddBanner}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[rgb(var(--st-fg)/0.2)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[rgb(var(--st-fg)/0.6)] py-3 text-xs font-extrabold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nuevo banner
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── CENTER: canvas ────────────────────────────────────────── */}
      <section className={cn("relative flex flex-col min-h-0", canvasBg)}>
        {/* Toolbar */}
        <div className={cn("shrink-0 px-3 py-2 flex items-center gap-2 overflow-x-auto border-b", panelBg, panelBorder)}>
          <ToolGroup label="Anclas">
            <AnchorGrid value={adj.position} onChange={(p) => patchAdjust({ ...adj, position: p })} disabled={!current?.imageUrl} />
          </ToolGroup>
          <Divider />
          <ToolGroup label="Zoom">
            <ToolBtn icon={<Minimize2 className="h-3.5 w-3.5" />} title="Reducir (-)" disabled={!current?.imageUrl || adj.scale <= ZOOM_MIN} onClick={() => patchAdjust({ ...adj, scale: clamp(adj.scale - 10, ZOOM_MIN, ZOOM_MAX) })} />
            <span className="px-2 text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-[rgb(var(--st-fg)/0.8)] min-w-[44px] text-center">
              {adj.scale}%
            </span>
            <ToolBtn icon={<Maximize2 className="h-3.5 w-3.5" />} title="Ampliar (+)" disabled={!current?.imageUrl || adj.scale >= ZOOM_MAX} onClick={() => patchAdjust({ ...adj, scale: clamp(adj.scale + 10, ZOOM_MIN, ZOOM_MAX) })} />
            <ToolBtn icon={<Target className="h-3.5 w-3.5" />} title="100% (0)" disabled={!current?.imageUrl} onClick={() => patchAdjust({ ...adj, scale: 100 })} />
          </ToolGroup>
          <Divider />
          <ToolGroup label="Encuadre">
            <ToolBtn label="Llenar" active={adj.fit === "cover"} title="Llenar (F)" disabled={!current?.imageUrl} onClick={() => patchAdjust({ ...adj, fit: "cover" })} />
            <ToolBtn label="Contener" active={adj.fit === "contain"} title="Contener (F)" disabled={!current?.imageUrl} onClick={() => patchAdjust({ ...adj, fit: "contain" })} />
          </ToolGroup>
          <Divider />
          <ToolGroup label="Historia">
            <ToolBtn icon={<Undo2 className="h-3.5 w-3.5" />} title="Deshacer (Cmd+Z)" disabled={!hasUndo} onClick={undo} />
            <ToolBtn icon={<Redo2 className="h-3.5 w-3.5" />} title="Rehacer (Cmd+Shift+Z)" disabled={!hasRedo} onClick={redo} />
            <ToolBtn icon={<RotateCcw className="h-3.5 w-3.5" />} title="Reset encuadre" disabled={!current?.imageUrl} onClick={() => patchAdjust(DEFAULT_ADJ)} />
          </ToolGroup>

          <div className="ml-auto flex items-center gap-1.5">
            {current && (
              <button
                type="button"
                onClick={() => setTemplatesOpen((v) => !v)}
                aria-pressed={templatesOpen}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition-colors",
                  templatesOpen
                    ? "bg-[var(--accent)] text-[rgb(var(--st-fg))]"
                    : dark
                      ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.85)] hover:bg-[rgb(var(--st-fg)/0.18)]"
                      : "bg-black/5 text-[#0c1015] hover:bg-black/10",
                )}
                title="Aplicar una plantilla al banner actual"
              >
                <Layout className="h-3.5 w-3.5" />
                Plantillas
              </button>
            )}
            {current && (
              <button
                type="button"
                onClick={() => patch({ active: !current.active })}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition-colors",
                  current.active
                    ? "bg-[var(--data-success-500)]/20 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/30"
                    : "bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/30",
                )}
              >
                {current.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {current.active ? "Activo" : "Oculto"}
              </button>
            )}
          </div>
        </div>

        {/* Templates strip — slide-down justo debajo del toolbar */}
        {templatesOpen && current && (
          <div className={cn("shrink-0 px-3 py-3 border-b overflow-x-auto", panelBg, panelBorder)}>
            <div className="flex items-center gap-2">
              <span className={cn("text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0", subtleText)}>
                Plantillas
              </span>
              <div className="flex gap-2 flex-1">
                {BANNER_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      patch(tpl.payload);
                      setTemplatesOpen(false);
                    }}
                    className={cn(
                      "shrink-0 rounded-lg border-2 px-3 py-2 text-left transition-all hover:scale-[1.02] hover:shadow-md min-w-[140px]",
                      dark
                        ? "border-[rgb(var(--st-fg)/0.15)] bg-[rgb(var(--st-fg)/0.05)] hover:border-[var(--accent)]"
                        : "border-black/10 bg-white hover:border-[var(--accent)]",
                    )}
                  >
                    <div className="text-lg leading-none mb-1">{tpl.emoji}</div>
                    <div className={cn("text-xs font-extrabold leading-tight", dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>
                      {tpl.label}
                    </div>
                    <div className={cn("text-[length:var(--ts-2xs)] leading-snug mt-0.5 truncate", subtleText)}>
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setTemplatesOpen(false)}
                className={cn(
                  "shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg",
                  dark ? "hover:bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.7)]" : "hover:bg-black/10 text-black/60",
                )}
                aria-label="Cerrar plantillas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Canvas viewport */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 sm:p-10 overflow-auto">
          {current ? (
            <div
              className="w-full max-w-[1600px]"
              style={{ aspectRatio: "4 / 1" }}
            >
              <div
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={endDrag}
                onWheel={onWheel}
                className={cn(
                  "relative h-full w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 select-none touch-none",
                  current.imageUrl ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
                )}
                aria-label="Canvas — arrastrá para mover la imagen, scroll para zoom"
              >
                <PromoBannerRenderer banner={current} asLink={false} className="[&>div]:rounded-none [&>div]:border-0 h-full" />
                {/* Overlay: drag directo de Comprar / Insignia sobre el canvas (solo type=promo) */}
                <PromoElementOverlay banner={current} onPatch={patch} canvasRef={canvasRef} theme={theme} />
                {dragging && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] text-[rgb(var(--st-fg))] px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shadow-md">
                    <Target className="h-3 w-3" />
                    Moviendo
                  </span>
                )}
                {/* Crosshair guides (solo durante drag) */}
                {dragging && (
                  <>
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30 pointer-events-none" />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/30 pointer-events-none" />
                  </>
                )}
              </div>

              {/* Bottom info strip */}
              <div className="mt-3 flex items-center justify-between text-[length:var(--ts-2xs)] font-bold text-[rgb(var(--st-fg)/0.5)] tabular-nums">
                <span>X {adj.position.x}% · Y {adj.position.y}%</span>
                <span className="truncate max-w-[40ch] mx-3 text-[rgb(var(--st-fg)/0.7)]">{current.title || "(sin título)"}</span>
                <span>Zoom {adj.scale}% · {adj.fit === "cover" ? "Llenar" : "Contener"}</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-[rgb(var(--st-fg)/0.6)]">
              <p className="text-sm font-bold">Sin banners en este slot</p>
              {onAddBanner && (
                <button
                  type="button"
                  onClick={onAddBanner}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] text-[rgb(var(--st-fg))] px-4 py-2 text-sm font-extrabold hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  Crear primer banner
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── RIGHT: tools panel ─────────────────────────────────────── */}
      <aside className={cn("relative overflow-hidden flex flex-col border-l", panelBg, panelBorder)}>
        {rightOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel derecho"
            onPointerDown={onSideResizeDown("right")}
            onPointerMove={onSideResizeMove}
            onPointerUp={onSideResizeEnd}
            onPointerCancel={onSideResizeEnd}
            className={cn(
              "absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-20",
              "hover:bg-[var(--accent)]/40 active:bg-[var(--accent)]/60 transition-colors",
            )}
            title="Arrastrá para redimensionar"
          >
            <div className={cn("absolute inset-y-0 left-0 w-px", dark ? "bg-white/10" : "bg-black/10")} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setRightOpen(!rightOpen)}
          className="shrink-0 h-10 px-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[rgb(var(--st-fg)/0.6)] hover:text-[rgb(var(--st-fg))] border-b border-[rgb(var(--st-fg)/0.1)] flex items-center gap-1.5"
        >
          {rightOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          {rightOpen && <span>Herramientas</span>}
        </button>

        {rightOpen && current && (
          <>
            {/* Tabs */}
            <nav className="shrink-0 grid grid-cols-6 border-b border-[rgb(var(--st-fg)/0.1)]">
              <TabBtn icon={<Maximize2 className="h-3.5 w-3.5" />} active={tab === "frame"} onClick={() => setTab("frame")} title="Encuadre" />
              <TabBtn icon={<ImageIconLucide className="h-3.5 w-3.5" />} active={tab === "image"} onClick={() => setTab("image")} title="Imagen" />
              <TabBtn icon={<TypeIcon className="h-3.5 w-3.5" />} active={tab === "text"} onClick={() => setTab("text")} title="Texto" />
              <TabBtn icon={<Palette className="h-3.5 w-3.5" />} active={tab === "color"} onClick={() => setTab("color")} title="Color" />
              <TabBtn icon={<ShoppingBag className="h-3.5 w-3.5" />} active={tab === "promo"} onClick={() => setTab("promo")} title="Promo" />
              <TabBtn icon={<ToggleLeft className="h-3.5 w-3.5" />} active={tab === "state"} onClick={() => setTab("state")} title="Estado" />
            </nav>

            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {tab === "frame" && <FrameTab adj={adj} hasImage={!!current.imageUrl} onChange={(a) => patchAdjust(a)} />}
              {tab === "image" && <ImageTab banner={current} onPatch={patch} uploadFolder={uploadFolder} />}
              {tab === "text" && <TextTab banner={current} onPatch={patch} />}
              {tab === "color" && <ColorTab banner={current} onPatch={patch} presets={colorPresets} />}
              {tab === "promo" && <PromoTab banner={current} onPatch={patch} uploadFolder={uploadFolder} theme={theme} />}
              {tab === "state" && (
                <StateTab
                  banner={current}
                  index={idx}
                  total={banners.length}
                  onPatch={patch}
                  onMove={(d) => onMoveBanner?.(idx, d)}
                  onDuplicate={() => onDuplicateBanner?.(idx)}
                  onRemove={() => onRemoveBanner?.(idx)}
                />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SoloMode — banner aislado sobre fondo blanco
// ─────────────────────────────────────────────────────────────────────────────

function SoloMode({
  theme,
  current,
  banners,
  idx,
  setIdx,
  width,
  setWidth,
  animKey,
}: {
  theme: StudioTheme;
  current: StudioBanner | undefined;
  banners: StudioBanner[];
  idx: number;
  setIdx: (i: number) => void;
  width: Width;
  setWidth: (w: Width) => void;
  animKey: number;
}) {
  const dark = theme === "dark";
  const widthPx = width === "1200" ? 1200 : width === "1600" ? 1600 : null;
  if (!current) return null;
  return (
    <>
      <div className={cn(
        "flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 overflow-auto",
        dark ? "bg-white" : "bg-[#0c1015]",
      )}>
        <div className="w-full" style={widthPx ? { maxWidth: `${widthPx}px` } : undefined}>
          <div key={animKey} className="animate-bs-fade">
            <PromoBannerRenderer banner={current} asLink={false} />
          </div>
          <div className={cn(
            "mt-4 flex items-center justify-center gap-2 text-xs font-bold",
            dark ? "text-[#0c1015]/60" : "text-[rgb(var(--st-fg)/0.6)]",
          )}>
            <span>{widthPx ? `${widthPx}px` : "100% del contenedor"}</span>
            <span>·</span>
            <span className="truncate max-w-[40ch]">{current.title || "(sin título)"}</span>
          </div>
        </div>
      </div>
      <footer className={cn(
        "shrink-0 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 border-t",
        dark ? "border-[rgb(var(--st-fg)/0.1)] bg-black/60" : "border-black/10 bg-white",
      )}>
        <div className="flex items-center gap-1.5">
          {(["1200", "1600", "full"] as Width[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              aria-pressed={width === w}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors",
                width === w ? "bg-white text-[#0c1015]" : "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.8)] hover:bg-[rgb(var(--st-fg)/0.2)]",
              )}
            >
              {w === "full" ? "100%" : `${w}px`}
            </button>
          ))}
        </div>
        <NavCounter idx={idx} total={banners.length} onPrev={() => setIdx((idx - 1 + banners.length) % banners.length)} onNext={() => setIdx((idx + 1) % banners.length)} />
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ShowMode — slideshow auto-rotate
// ─────────────────────────────────────────────────────────────────────────────

function ShowMode({
  theme,
  current,
  banners,
  idx,
  setIdx,
  width: _width,
  setWidth: _setWidth,
  animation,
  setAnimation,
  speedMs,
  setSpeedMs,
  playing,
  setPlaying,
  animKey,
}: {
  theme: StudioTheme;
  current: StudioBanner | undefined;
  banners: StudioBanner[];
  idx: number;
  setIdx: (i: number) => void;
  width: Width;
  setWidth: (w: Width) => void;
  animation: Animation;
  setAnimation: (a: Animation) => void;
  speedMs: number;
  setSpeedMs: (ms: number) => void;
  playing: boolean;
  setPlaying: (b: boolean) => void;
  animKey: number;
}) {
  const dark = theme === "dark";
  if (!current) return null;
  return (
    <>
      <div className={cn(
        "flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 overflow-auto",
        dark ? "bg-[#0c1015]" : "bg-white",
      )}>
        <div className="w-full" style={{ maxWidth: "1600px" }}>
          <div
            key={animKey}
            className={cn(
              animation === "fade" && "animate-bs-fade",
              animation === "slide" && "animate-bs-slide",
              animation === "zoom" && "animate-bs-zoom",
            )}
          >
            <PromoBannerRenderer banner={current} asLink={false} />
          </div>
        </div>
      </div>
      <footer className={cn(
        "shrink-0 px-4 sm:px-6 py-3 space-y-3 border-t",
        dark ? "border-[rgb(var(--st-fg)/0.1)] bg-black/60" : "border-black/10 bg-white",
      )}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold hover:opacity-90 transition-opacity"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pausar" : "Reproducir"}
          </button>
          <NavCounter idx={idx} total={banners.length} onPrev={() => setIdx((idx - 1 + banners.length) % banners.length)} onNext={() => setIdx((idx + 1) % banners.length)} />
          <div className="flex items-center gap-2 ml-auto">
            <Gauge className="h-3.5 w-3.5 text-[rgb(var(--st-fg)/0.6)]" />
            <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[rgb(var(--st-fg)/0.6)]">Velocidad</span>
            <input type="range" min={2000} max={15000} step={500} value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))} className="w-32 accent-[var(--accent)]" aria-label="Velocidad" />
            <span className="text-xs font-bold tabular-nums min-w-[42px] text-right">{(speedMs / 1000).toFixed(1)}s</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[rgb(var(--st-fg)/0.6)]">Animación</span>
          {(["fade", "slide", "zoom", "none"] as Animation[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAnimation(a)}
              aria-pressed={animation === a}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors capitalize",
                animation === a ? "bg-white text-[#0c1015]" : "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.8)] hover:bg-[rgb(var(--st-fg)/0.2)]",
              )}
            >
              {a === "none" ? "Sin animación" : a}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {Array.from({ length: banners.length }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Banner ${i + 1}`}
                aria-current={i === idx}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === idx ? "w-8 bg-white" : "w-2 bg-white/30 hover:bg-[rgb(var(--st-fg)/0.6)]",
                )}
              />
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs (right panel)
// ─────────────────────────────────────────────────────────────────────────────

function FrameTab({ adj, hasImage, onChange }: { adj: ImageAdjust; hasImage: boolean; onChange: (a: ImageAdjust) => void }) {
  if (!hasImage) {
    return (
      <p className="text-xs text-[rgb(var(--st-fg)/0.5)] leading-snug">
        Subí una imagen primero (pestaña <strong className="text-[rgb(var(--st-fg)/0.8)]">Imagen</strong>) para poder reencuadrarla acá.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-[rgb(var(--st-fg))]">
      <Section title="Posición precisa">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X (%)" value={adj.position.x} min={0} max={100} step={1} onChange={(v) => onChange({ ...adj, position: { ...adj.position, x: clamp(v, 0, 100) } })} />
          <NumField label="Y (%)" value={adj.position.y} min={0} max={100} step={1} onChange={(v) => onChange({ ...adj, position: { ...adj.position, y: clamp(v, 0, 100) } })} />
        </div>
      </Section>
      <Section title="Zoom">
        <div className="flex items-center gap-2">
          <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={5} value={adj.scale} onChange={(e) => onChange({ ...adj, scale: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
          <span className="text-xs font-extrabold tabular-nums w-12 text-right">{adj.scale}%</span>
        </div>
      </Section>
      <Section title="Modo de ajuste">
        <div className="grid grid-cols-2 gap-1.5">
          <FitChip active={adj.fit === "cover"} onClick={() => onChange({ ...adj, fit: "cover" })} label="Llenar" hint="Recorta para cubrir" />
          <FitChip active={adj.fit === "contain"} onClick={() => onChange({ ...adj, fit: "contain" })} label="Contener" hint="Imagen entera" />
        </div>
      </Section>
      <Section title="Atajos">
        <ul className="text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.6)] space-y-1 leading-snug">
          <li><Kbd>←→↑↓</Kbd> mover 5% · <Kbd>Shift</Kbd>+arrows mover 20%</li>
          <li><Kbd>+</Kbd>/<Kbd>-</Kbd> zoom · <Kbd>0</Kbd> reset · <Kbd>C</Kbd> centrar · <Kbd>F</Kbd> fit</li>
          <li><Kbd>⌘Z</Kbd> deshacer · <Kbd>⌘⇧Z</Kbd> rehacer · scroll = zoom</li>
        </ul>
      </Section>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-px border border-[rgb(var(--st-fg)/0.2)] rounded bg-[rgb(var(--st-fg)/0.06)] font-mono text-[0.7em]">
      {children}
    </kbd>
  );
}

function ImageTab({ banner, onPatch, uploadFolder }: { banner: StudioBanner; onPatch: (p: Partial<StudioBanner>) => void; uploadFolder: string }) {
  return (
    <div className="space-y-3">
      <Section title="Subir imagen">
        <div className="bg-[rgb(var(--st-fg)/0.05)] rounded-lg p-2">
          <ImageUploader
            value={banner.imageUrl}
            onChange={(url) => onPatch({ imageUrl: url })}
            folder={uploadFolder}
            mode="wide"
            aspectClass="aspect-[16/7]"
          />
        </div>
      </Section>
      <Section title="O pegá una URL">
        <input
          value={banner.imageUrl ?? ""}
          onChange={(e) => onPatch({ imageUrl: e.target.value || null })}
          placeholder="https://…"
          className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--st-fg)/0.05)] border border-[rgb(var(--st-fg)/0.1)] text-xs font-mono text-[rgb(var(--st-fg))] placeholder-[rgb(var(--st-fg)/0.3)] focus:border-[var(--accent)] outline-none"
        />
      </Section>
      <p className="text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.5)] leading-snug">
        Recomendado: <span className="text-[rgb(var(--st-fg)/0.8)] font-mono">1600 × 400 px</span> · 4:1 · &lt;200 KB.
      </p>
      {banner.imageUrl && (
        <button
          type="button"
          onClick={() => onPatch({ imageUrl: null })}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[rgb(var(--st-fg)/0.6)] hover:text-[var(--data-error-500)] transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          Quitar imagen
        </button>
      )}
    </div>
  );
}

function TextTab({ banner, onPatch }: { banner: StudioBanner; onPatch: (p: Partial<StudioBanner>) => void }) {
  return (
    <div className="space-y-3">
      <Section title="Tipo de banner">
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { id: "classic", label: "Clásico", icon: TypeIcon },
            { id: "image", label: "Imagen", icon: Layout },
            { id: "promo", label: "Promo", icon: ShoppingBag },
          ] as const).map((opt) => {
            const active = (banner.type ?? "classic") === opt.id;
            const I = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPatch({ type: opt.id as StudioBanner["type"], ...(opt.id === "promo" && !banner.promo ? { promo: DEFAULT_PROMO } : {}) })}
                aria-pressed={active}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-extrabold transition-all flex flex-col items-center gap-1",
                  active ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]" : "border-[rgb(var(--st-fg)/0.1)] bg-[rgb(var(--st-fg)/0.05)] text-[rgb(var(--st-fg)/0.7)] hover:border-[rgb(var(--st-fg)/0.3)]",
                )}
              >
                <I className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Título">
        <input value={banner.title} onChange={(e) => onPatch({ title: e.target.value })} maxLength={120} className={STUDIO_INPUT_CLS} />
      </Section>
      <Section title="Subtítulo">
        <input value={banner.subtitle ?? ""} onChange={(e) => onPatch({ subtitle: e.target.value })} maxLength={200} className={STUDIO_INPUT_CLS} />
      </Section>
      <Section title="Texto del botón (CTA)">
        <input value={banner.ctaLabel} onChange={(e) => onPatch({ ctaLabel: e.target.value })} maxLength={40} className={STUDIO_INPUT_CLS} />
      </Section>
      <Section title="Destino del botón">
        <input value={banner.ctaHref} onChange={(e) => onPatch({ ctaHref: e.target.value })} placeholder="/marketplace/ofertas" className={cn(STUDIO_INPUT_CLS, "font-mono text-[length:var(--ts-2xs)]")} />
      </Section>
    </div>
  );
}

const STUDIO_INPUT_CLS =
  "w-full px-3 py-2 rounded-lg bg-[rgb(var(--st-fg)/0.05)] border border-[rgb(var(--st-fg)/0.1)] text-xs font-bold text-[rgb(var(--st-fg))] outline-none focus:border-[var(--accent)] transition-colors";

function ColorTab({
  banner,
  onPatch,
  presets,
}: {
  banner: StudioBanner;
  onPatch: (p: Partial<StudioBanner>) => void;
  presets: Array<{ id: string; label: string; from: string; to: string }>;
}) {
  if (banner.imageUrl) {
    return (
      <p className="text-xs text-[rgb(var(--st-fg)/0.6)] leading-snug">
        Los colores de fondo se usan solo cuando NO hay imagen. Quitá la imagen desde la pestaña <strong className="text-[rgb(var(--st-fg)/0.8)]">Imagen</strong> para personalizar el gradiente.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-[rgb(var(--st-fg))]">
      <Section title="Presets">
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map((p) => {
            const active = banner.bgFrom === p.from && banner.bgTo === p.to;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPatch({ bgFrom: p.from, bgTo: p.to })}
                aria-pressed={active}
                className={cn(
                  "rounded-lg border-2 p-2 transition-all text-left",
                  active ? "border-[var(--accent)]" : "border-transparent hover:border-[rgb(var(--st-fg)/0.2)]",
                )}
              >
                <div className="h-8 rounded-md mb-1" style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }} />
                <p className="text-[length:var(--ts-2xs)] font-extrabold">{p.label}</p>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Personalizado">
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Desde" value={banner.bgFrom} onChange={(v) => onPatch({ bgFrom: v })} />
          <ColorField label="Hasta" value={banner.bgTo} onChange={(v) => onPatch({ bgTo: v })} />
        </div>
      </Section>
    </div>
  );
}

function PromoTab({ banner, onPatch, uploadFolder, theme }: { banner: StudioBanner; onPatch: (p: Partial<StudioBanner>) => void; uploadFolder: string; theme: StudioTheme }) {
  if (banner.type !== "promo") {
    return (
      <p className="text-xs text-[rgb(var(--st-fg)/0.6)] leading-snug">
        Cambiá el tipo a <strong className="text-[rgb(var(--st-fg)/0.8)]">Promo</strong> en la pestaña Texto para usar producto/combo embebido con compra directa.
      </p>
    );
  }
  const promo = banner.promo ?? DEFAULT_PROMO;
  const items: PromoItem[] = promo.items && promo.items.length > 0
    ? promo.items
    : [{ id: "legacy", source: "manual", productName: promo.productName, productImage: promo.productImage, price: promo.price, oldPrice: promo.oldPrice, badge: promo.badge, buyHref: promo.buyHref, buyLabel: promo.buyLabel, imageAdjust: promo.imageAdjust }];

  const writeItems = (next: PromoItem[]) => {
    // Sincronizar campos legacy con el primer item para back-compat con el renderer público viejo.
    const first = next[0];
    onPatch({
      promo: {
        ...promo,
        items: next,
        productName: first?.productName ?? promo.productName,
        productImage: first?.productImage ?? promo.productImage,
        price: first?.price ?? promo.price,
        oldPrice: first?.oldPrice ?? promo.oldPrice,
        badge: first?.badge ?? promo.badge,
        buyHref: first?.buyHref ?? promo.buyHref,
        buyLabel: first?.buyLabel ?? promo.buyLabel,
        imageAdjust: first?.imageAdjust ?? promo.imageAdjust,
      },
    });
  };

  const updateItem = (idx: number, p: Partial<PromoItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...p } : it));
    writeItems(next);
  };

  const addItem = () => {
    const next: PromoItem[] = [
      ...items,
      {
        id: `item-${Date.now()}`,
        source: "manual",
        productName: "",
        productImage: null,
        price: null,
        oldPrice: null,
        badge: "",
        buyHref: "",
        buyLabel: "Comprar",
      },
    ];
    writeItems(next);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    writeItems(items.filter((_, i) => i !== idx));
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    writeItems(next);
  };

  return (
    <div className={cn("space-y-3", theme === "dark" ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>
      <div className={cn("rounded-lg p-2.5 border text-[length:var(--ts-2xs)] leading-snug",
        theme === "dark" ? "bg-[rgb(var(--st-fg)/0.05)] border-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.7)]" : "bg-black/5 border-black/10 text-black/70")}>
        Banner con <strong>{items.length}</strong> producto{items.length === 1 ? "" : "s"} · Si agregás más de uno se renderizan en grilla horizontal scrolleable.
      </div>

      {items.map((it, idx) => (
        <PromoItemEditor
          key={it.id}
          item={it}
          index={idx}
          total={items.length}
          onChange={(p) => updateItem(idx, p)}
          onMove={(d) => moveItem(idx, d)}
          onRemove={() => removeItem(idx)}
          uploadFolder={uploadFolder}
          theme={theme}
        />
      ))}

      <button
        type="button"
        onClick={addItem}
        className={cn("w-full inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-2.5 text-xs font-extrabold transition-colors",
          theme === "dark" ? "border-[rgb(var(--st-fg)/0.2)] text-[rgb(var(--st-fg)/0.6)] hover:border-[var(--accent)] hover:text-[var(--accent)]" : "border-black/20 text-black/60 hover:border-[var(--accent)] hover:text-[var(--accent)]")}
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar otro producto
      </button>
    </div>
  );
}

function PromoItemEditor({
  item,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  uploadFolder,
  theme,
}: {
  item: PromoItem;
  index: number;
  total: number;
  onChange: (p: Partial<PromoItem>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  uploadFolder: string;
  theme: StudioTheme;
}) {
  const dark = theme === "dark";
  const [open, setOpen] = useState(index === 0);
  const adj = item.imageAdjust ?? DEFAULT_ADJ;
  const headerCls = dark ? "bg-[rgb(var(--st-fg)/0.05)] border-[rgb(var(--st-fg)/0.1)]" : "bg-black/5 border-black/10";

  return (
    <div className={cn("rounded-lg border", dark ? "border-[rgb(var(--st-fg)/0.1)]" : "border-black/10")}>
      <div className={cn("flex items-center gap-2 px-2.5 py-2 border-b rounded-t-lg", headerCls)}>
        <span className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded text-[length:var(--ts-2xs)] font-extrabold tabular-nums shrink-0",
          dark ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.8)]" : "bg-black/10 text-black/70",
        )}>
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn("flex-1 min-w-0 text-left text-xs font-extrabold truncate", dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}
          aria-expanded={open}
        >
          {item.productName || "(sin nombre)"}
        </button>
        <span className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0",
          item.source === "linked"
            ? "bg-[var(--accent)]/20 text-[var(--accent)]"
            : dark ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.6)]" : "bg-black/10 text-black/60",
        )}>
          {item.source === "linked" ? "tienda" : "manual"}
        </span>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={cn("h-6 w-6 inline-flex items-center justify-center rounded transition-colors", dark ? "hover:bg-[rgb(var(--st-fg)/0.1)] disabled:opacity-30" : "hover:bg-black/10 disabled:opacity-30")} title="Subir">
          <ArrowUp className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={cn("h-6 w-6 inline-flex items-center justify-center rounded transition-colors", dark ? "hover:bg-[rgb(var(--st-fg)/0.1)] disabled:opacity-30" : "hover:bg-black/10 disabled:opacity-30")} title="Bajar">
          <ArrowDown className="h-3 w-3" />
        </button>
        <button type="button" onClick={onRemove} disabled={total === 1} className={cn("h-6 w-6 inline-flex items-center justify-center rounded transition-colors", dark ? "hover:bg-[var(--data-error-500)]/20 hover:text-[var(--data-error-500)] disabled:opacity-30" : "hover:bg-[var(--data-error-500)]/20 hover:text-[var(--data-error-500)] disabled:opacity-30")} title="Eliminar">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {open && (
        <div className="p-2.5 space-y-2.5">
          {/* Source toggle */}
          <div className="grid grid-cols-2 gap-1.5">
            <SourceBtn
              active={item.source === "manual"}
              onClick={() => onChange({ source: "manual", linkedStoreSlug: null, linkedProductId: null })}
              icon={<Edit3 className="h-3 w-3" />}
              label="Manual"
              hint="Subo imagen y datos"
              theme={theme}
            />
            <SourceBtn
              active={item.source === "linked"}
              onClick={() => onChange({ source: "linked" })}
              icon={<Search className="h-3 w-3" />}
              label="Desde tienda"
              hint="Elijo del catálogo"
              theme={theme}
            />
          </div>

          {item.source === "linked" && (
            <CatalogPickerLauncher
              storeSlug={item.linkedStoreSlug ?? null}
              productId={item.linkedProductId ?? null}
              productName={item.productName}
              productImage={item.productImage}
              onPick={(picked) =>
                onChange({
                  linkedStoreSlug: picked.storeSlug,
                  linkedProductId: picked.productId,
                  productName: picked.name,
                  productImage: picked.image,
                  price: picked.price,
                  oldPrice: picked.oldPrice,
                  buyHref: picked.href,
                })
              }
              theme={theme}
            />
          )}

          {/* Imagen del producto + drag adjust con preview real */}
          <Section title="Imagen del producto · arrastrá para reposicionar">
            <div className={cn("rounded-lg p-2", dark ? "bg-[rgb(var(--st-fg)/0.05)]" : "bg-black/5")}>
              <ImageUploader
                value={item.productImage}
                onChange={(url) => onChange({ productImage: url })}
                folder={`${uploadFolder}-promo`}
                mode="square"
                aspectClass="aspect-square"
              />
            </div>
            {item.productImage && (
              <ItemImageAdjustMini
                value={adj}
                onChange={(a) => onChange({ imageAdjust: a })}
                imageUrl={item.productImage}
                theme={theme}
              />
            )}
          </Section>

          <Section title="Nombre del producto">
            <input value={item.productName} onChange={(e) => onChange({ productName: e.target.value })} className={STUDIO_INPUT_CLS} />
          </Section>

          {/* ── ✨ Sugerencias de copy con IA ─────────────────────── */}
          <AICopySuggester item={item} onApply={onChange} theme={theme} />
          <div className="grid grid-cols-2 gap-2">
            <Section title="Precio">
              <input type="number" step="0.10" value={item.price ?? ""} onChange={(e) => onChange({ price: e.target.value === "" ? null : Number(e.target.value) })} className={cn(STUDIO_INPUT_CLS, "tabular-nums")} />
            </Section>
            <Section title="Antes">
              <input type="number" step="0.10" value={item.oldPrice ?? ""} onChange={(e) => onChange({ oldPrice: e.target.value === "" ? null : Number(e.target.value) })} className={cn(STUDIO_INPUT_CLS, "tabular-nums")} />
            </Section>
          </div>
          <Section title="Insignia (badge rojo)">
            <input value={item.badge} onChange={(e) => onChange({ badge: e.target.value })} placeholder="-30% · 2x1 · Liquidación" className={STUDIO_INPUT_CLS} />
          </Section>
          <div className="grid grid-cols-2 gap-2">
            <Section title="Texto del botón">
              <input value={item.buyLabel} onChange={(e) => onChange({ buyLabel: e.target.value })} className={STUDIO_INPUT_CLS} />
            </Section>
            <Section title="Link">
              <input value={item.buyHref} onChange={(e) => onChange({ buyHref: e.target.value })} placeholder="/t/store/producto/123" className={cn(STUDIO_INPUT_CLS, "font-mono text-[length:var(--ts-2xs)]")} />
            </Section>
          </div>

          {/* ── Posición libre del producto ──────────────────────── */}
          <AnchorControl
            title="Posición de la imagen del producto"
            value={item.productAnchor ?? null}
            onChange={(a) => onChange({ productAnchor: a })}
            theme={theme}
          />
          {item.productAnchor && (
            <Section title={`Tamaño del producto · ${Math.round(item.productSize ?? 28)}%`}>
              <input
                type="range"
                min={10}
                max={60}
                step={1}
                value={item.productSize ?? 28}
                onChange={(e) => onChange({ productSize: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </Section>
          )}

          {/* ── Posición libre del botón Comprar ─────────────────── */}
          <AnchorControl
            title="Posición del botón Comprar"
            value={item.buyAnchor ?? null}
            onChange={(a) => onChange({ buyAnchor: a })}
            theme={theme}
          />
          {item.buyAnchor && (
            <Section title={`Tamaño del botón · ${Math.round(item.buySize ?? 22)}%`}>
              <input
                type="range"
                min={8}
                max={50}
                step={1}
                value={item.buySize ?? 22}
                onChange={(e) => onChange({ buySize: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </Section>
          )}

          {/* ── Posición libre de la insignia ────────────────────── */}
          {item.badge && (
            <AnchorControl
              title="Posición de la insignia"
              value={item.badgeAnchor ?? null}
              onChange={(a) => onChange({ badgeAnchor: a })}
              theme={theme}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Sugerencias de copy con IA (Haiku) — genera 3 títulos / 3 subtítulos / 3 badges
 *  a partir del producto + precio + tono. Click en chip aplica el valor. */
function AICopySuggester({
  item,
  onApply,
  theme,
}: {
  item: PromoItem;
  onApply: (p: Partial<PromoItem>) => void;
  theme: StudioTheme;
}) {
  type Tone = "urgent" | "friendly" | "premium" | "playful";
  const [tone, setTone] = useState<Tone>("friendly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ productNames: string[]; badges: string[]; ctas: string[] } | null>(null);
  const dark = theme === "dark";

  const canSuggest = (item.productName ?? "").trim().length > 0;

  const fetchSuggestions = async () => {
    if (!canSuggest || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/banners/copy-suggest", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          productName: item.productName,
          price: item.price,
          oldPrice: item.oldPrice,
          tone,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Error ${res.status}`);
        return;
      }
      setData(json.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fallo de red");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section title="✨ Sugerencias de copy (IA)">
      <div className={cn("rounded-lg border p-2 space-y-2",
        dark ? "border-[rgb(var(--st-fg)/0.1)] bg-[rgb(var(--st-fg)/0.05)]" : "border-black/10 bg-black/5")}>
        <div className="flex items-center gap-1 flex-wrap">
          {(["urgent", "friendly", "premium", "playful"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              aria-pressed={tone === t}
              className={cn(
                "px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider transition-colors",
                tone === t
                  ? "bg-[var(--accent-600,var(--accent))] text-white"
                  : dark
                    ? "bg-[rgb(var(--st-fg)/0.08)] text-[rgb(var(--st-fg)/0.7)] hover:bg-[rgb(var(--st-fg)/0.15)]"
                    : "bg-black/5 text-black/60 hover:bg-black/15",
              )}
            >
              {t === "urgent" ? "Urgente" : t === "friendly" ? "Cercano" : t === "premium" ? "Premium" : "Divertido"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={!canSuggest || loading}
          className={cn(
            "w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-extrabold transition-all",
            !canSuggest || loading
              ? "bg-[rgb(var(--st-fg)/0.08)] text-[rgb(var(--st-fg)/0.4)] cursor-not-allowed"
              : "bg-[var(--accent-600,var(--accent))] text-white hover:brightness-110",
          )}
        >
          {loading ? "Generando…" : data ? "Volver a sugerir" : "Sugerir copy"}
        </button>
        {!canSuggest && (
          <p className={cn("text-[length:var(--ts-2xs)] leading-snug", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
            Cargá primero un nombre de producto para que la IA tenga contexto.
          </p>
        )}
        {error && (
          <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] font-bold">
            {error}
          </p>
        )}
        {data && (
          <div className="space-y-2">
            <SuggestionRow label="Nombre del producto" items={data.productNames} onPick={(v) => onApply({ productName: v })} dark={dark} />
            <SuggestionRow label="Badge" items={data.badges} onPick={(v) => onApply({ badge: v })} dark={dark} />
            <SuggestionRow label="Texto del botón" items={data.ctas} onPick={(v) => onApply({ buyLabel: v })} dark={dark} />
          </div>
        )}
      </div>
    </Section>
  );
}

function SuggestionRow({
  label,
  items,
  onPick,
  dark,
}: {
  label: string;
  items: string[];
  onPick: (v: string) => void;
  dark: boolean;
}) {
  return (
    <div>
      <p className={cn("text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider mb-1", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {items.map((s, i) => (
          <button
            key={`${label}-${i}`}
            type="button"
            onClick={() => onPick(s)}
            className={cn(
              "rounded-full px-2 py-1 text-[length:var(--ts-2xs)] font-bold transition-colors text-left max-w-full truncate",
              dark
                ? "bg-[rgb(var(--st-fg)/0.08)] text-[rgb(var(--st-fg)/0.85)] hover:bg-[var(--accent)] hover:text-white"
                : "bg-black/5 text-[#0c1015] hover:bg-[var(--accent)] hover:text-white",
            )}
            title={s}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Control compacto para posicionar libremente un overlay sobre el banner.
 *  Estados: "default" (null) | "free" (con X/Y %). Presets rápidos a 5 esquinas. */
function AnchorControl({
  title,
  value,
  onChange,
  theme,
}: {
  title: string;
  value: PromoAnchor | null;
  onChange: (next: PromoAnchor | null) => void;
  theme: StudioTheme;
}) {
  const dark = theme === "dark";
  const isFree = value !== null && value !== undefined;
  const x = value?.x ?? 50;
  const y = value?.y ?? 50;

  const presets: Array<{ label: string; pos: PromoAnchor | null }> = [
    { label: "Defecto", pos: null },
    { label: "↖", pos: { x: 8, y: 12 } },
    { label: "↗", pos: { x: 92, y: 12 } },
    { label: "Centro", pos: { x: 50, y: 50 } },
    { label: "↙", pos: { x: 8, y: 88 } },
    { label: "↘", pos: { x: 92, y: 88 } },
  ];

  return (
    <Section title={title}>
      <div className={cn("rounded-lg border p-2 space-y-2",
        dark ? "border-[rgb(var(--st-fg)/0.1)] bg-[rgb(var(--st-fg)/0.05)]" : "border-black/10 bg-black/5")}>
        <div className="grid grid-cols-6 gap-1">
          {presets.map((p) => {
            const active = p.pos === null
              ? !isFree
              : isFree && Math.abs(x - p.pos.x) < 1 && Math.abs(y - p.pos.y) < 1;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.pos)}
                aria-pressed={active}
                className={cn(
                  "h-7 rounded text-[length:var(--ts-2xs)] font-extrabold transition-colors",
                  active
                    ? "bg-[var(--accent-600,var(--accent))] text-white"
                    : dark
                      ? "bg-[rgb(var(--st-fg)/0.08)] text-[rgb(var(--st-fg)/0.7)] hover:bg-[rgb(var(--st-fg)/0.15)]"
                      : "bg-black/5 text-black/60 hover:bg-black/10",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {isFree && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={cn("text-[length:var(--ts-2xs)] font-extrabold tabular-nums w-7", dark ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60")}>X</span>
              <input type="range" min={0} max={100} step={1} value={x} onChange={(e) => onChange({ x: Number(e.target.value), y })} className="flex-1 accent-[var(--accent)]" />
              <span className={cn("text-[length:var(--ts-2xs)] font-extrabold tabular-nums w-9 text-right", dark ? "text-[rgb(var(--st-fg)/0.85)]" : "text-[#0c1015]")}>{x}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-[length:var(--ts-2xs)] font-extrabold tabular-nums w-7", dark ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60")}>Y</span>
              <input type="range" min={0} max={100} step={1} value={y} onChange={(e) => onChange({ x, y: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
              <span className={cn("text-[length:var(--ts-2xs)] font-extrabold tabular-nums w-9 text-right", dark ? "text-[rgb(var(--st-fg)/0.85)]" : "text-[#0c1015]")}>{y}%</span>
            </div>
          </div>
        )}
        {!isFree && (
          <p className={cn("text-[length:var(--ts-2xs)] leading-snug", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
            Tip: presioná uno de los presets de arriba o usá <strong>Centro</strong> para liberar el slider X/Y.
          </p>
        )}
      </div>
    </Section>
  );
}

function SourceBtn({
  active,
  onClick,
  icon,
  label,
  hint,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
  theme: StudioTheme;
}) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-2 py-2 text-left transition-all flex items-start gap-1.5",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/15"
          : dark
            ? "border-[rgb(var(--st-fg)/0.1)] bg-[rgb(var(--st-fg)/0.05)] hover:border-[rgb(var(--st-fg)/0.3)]"
            : "border-black/10 bg-black/5 hover:border-black/30",
      )}
    >
      <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded shrink-0 mt-0.5",
        active ? "bg-[var(--accent)] text-[rgb(var(--st-fg))]" : dark ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.7)]" : "bg-black/10 text-black/60")}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className={cn("text-xs font-extrabold", active ? "text-[var(--accent)]" : dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>{label}</p>
        <p className={cn("text-[length:var(--ts-2xs)] leading-snug", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>{hint}</p>
      </div>
    </button>
  );
}

function ItemImageAdjustMini({
  value,
  onChange,
  imageUrl,
  theme,
}: {
  value: ImageAdjust;
  onChange: (a: ImageAdjust) => void;
  imageUrl: string;
  theme: StudioTheme;
}) {
  const dark = theme === "dark";
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; start: { x: number; y: number }; rect: DOMRect } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const node = previewRef.current;
    if (!node) return;
    node.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      start: { ...value.position },
      rect: node.getBoundingClientRect(),
    };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startY, start, rect } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextX = clamp(start.x - (dx / rect.width) * 100, 0, 100);
    const nextY = clamp(start.y - (dy / rect.height) * 100, 0, 100);
    onChange({ ...value, position: { x: round(nextX), y: round(nextY) } });
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 5;
    onChange({ ...value, scale: clamp(value.scale + delta, 50, 250) });
  };

  return (
    <div className={cn("mt-2 rounded-lg p-2 border space-y-2", dark ? "bg-[rgb(var(--st-fg)/0.05)] border-[rgb(var(--st-fg)/0.1)]" : "bg-black/5 border-black/10")}>
      <div className="flex items-center justify-between">
        <span className={cn("text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider", dark ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60")}>
          X {value.position.x}% · Y {value.position.y}% · Zoom {value.scale}%
        </span>
        <button type="button" onClick={() => onChange(DEFAULT_ADJ)} className={cn("text-[length:var(--ts-2xs)] font-bold hover:text-[var(--accent)]", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
          Reset
        </button>
      </div>

      {/* Preview drag-able real */}
      <div
        ref={previewRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onWheel={onWheel}
        className={cn(
          "aspect-square w-full rounded-lg overflow-hidden border select-none touch-none",
          dragging ? "cursor-grabbing ring-2 ring-[var(--accent)]/50" : "cursor-grab",
          dark ? "bg-white/95 border-[rgb(var(--st-fg)/0.1)]" : "bg-white border-black/10",
        )}
        aria-label="Preview del producto — arrastrá para mover, scroll para zoom"
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundPosition: `${value.position.x}% ${value.position.y}%`,
          backgroundRepeat: "no-repeat",
          backgroundSize: value.fit === "contain" ? `${value.scale}% auto` : `${value.scale}% ${value.scale}%`,
        }}
      >
        {dragging && (
          <>
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--accent)]/40 pointer-events-none" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--accent)]/40 pointer-events-none" />
          </>
        )}
      </div>

      {/* Anchor grid 3x3 */}
      <div className="grid grid-cols-3 gap-0.5">
        {[
          [0,0],[50,0],[100,0],
          [0,50],[50,50],[100,50],
          [0,100],[50,100],[100,100],
        ].map(([x, y]) => {
          const active = Math.abs(value.position.x - x!) < 1 && Math.abs(value.position.y - y!) < 1;
          return (
            <button
              key={`${x}-${y}`}
              type="button"
              onClick={() => onChange({ ...value, position: { x: x!, y: y! } })}
              title={`X ${x}% · Y ${y}%`}
              className={cn(
                "h-5 rounded transition-colors",
                active ? "bg-[var(--accent)]" : dark ? "bg-[rgb(var(--st-fg)/0.1)] hover:bg-[rgb(var(--st-fg)/0.25)]" : "bg-black/10 hover:bg-black/25",
              )}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <span className={cn("text-[length:var(--ts-2xs)] font-extrabold tabular-nums w-9", dark ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60")}>Zoom</span>
        <input type="range" min={50} max={250} step={5} value={value.scale} onChange={(e) => onChange({ ...value, scale: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
        <button type="button" onClick={() => onChange({ ...value, fit: value.fit === "cover" ? "contain" : "cover" })}
          className={cn("text-[length:var(--ts-2xs)] font-extrabold uppercase rounded px-1.5 py-0.5 transition-colors",
            dark ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.8)] hover:bg-[rgb(var(--st-fg)/0.2)]" : "bg-black/10 text-black/70 hover:bg-black/20")}>
          {value.fit === "cover" ? "Llenar" : "Contener"}
        </button>
      </div>
    </div>
  );
}

type Picked = {
  storeSlug: string;
  productId: number | string;
  name: string;
  image: string | null;
  price: number | null;
  oldPrice: number | null;
  href: string;
};

function CatalogPickerLauncher({
  storeSlug,
  productId,
  productName,
  productImage,
  onPick,
  theme,
}: {
  storeSlug: string | null;
  productId: string | number | null;
  productName: string;
  productImage: string | null;
  onPick: (p: Picked) => void;
  theme: StudioTheme;
}) {
  const dark = theme === "dark";
  const [open, setOpen] = useState(false);
  const linked = !!storeSlug && productId !== null && productId !== "";

  return (
    <>
      <div className={cn("rounded-lg p-3 border space-y-2", "bg-[var(--accent)]/[0.08] border-[var(--accent)]/30")}>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-[rgb(var(--st-fg))] shrink-0">
            <Search className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-[var(--accent)]">Catálogo de tiendas</p>
            <p className={cn("text-[length:var(--ts-2xs)] leading-snug", dark ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60")}>
              Buscá un producto real con imagen + precio actualizado.
            </p>
          </div>
        </div>

        {linked ? (
          <div className={cn("rounded-lg p-2 border flex items-center gap-2", dark ? "bg-[rgb(var(--st-fg)/0.05)] border-[rgb(var(--st-fg)/0.1)]" : "bg-white border-black/10")}>
            <div className={cn("h-10 w-10 rounded-md overflow-hidden shrink-0", dark ? "bg-[rgb(var(--st-fg)/0.1)]" : "bg-black/5")}>
              {productImage ? (
                <div role="img" aria-label={productName} className="h-full w-full" style={{ background: `url(${productImage}) center/cover` }} />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <ImageIconLucide className={cn("h-4 w-4", dark ? "text-[rgb(var(--st-fg)/0.4)]" : "text-black/40")} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-xs font-extrabold truncate", dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>
                {productName || "(sin nombre)"}
              </p>
              <p className={cn("text-[length:var(--ts-2xs)] truncate font-mono", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
                {storeSlug} · #{String(productId)}
              </p>
            </div>
          </div>
        ) : (
          <p className={cn("text-[length:var(--ts-2xs)] italic", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
            Sin producto vinculado todavía.
          </p>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] text-[rgb(var(--st-fg))] px-3 py-2 text-xs font-extrabold hover:opacity-90 transition-opacity"
        >
          <Search className="h-3.5 w-3.5" />
          {linked ? "Cambiar producto…" : "Buscar producto…"}
        </button>
      </div>

      {open && (
        <ProductCatalogModal
          theme={theme}
          initialStoreSlug={storeSlug ?? null}
          onPick={(p) => {
            onPick(p);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductCatalogModal — modal grande con grilla de tiendas → grilla de productos
// ─────────────────────────────────────────────────────────────────────────────

type CatalogStore = {
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  productCount: number;
  rating: number;
};
type CatalogProduct = {
  id: number | string;
  name: string;
  image: string | null;
  price: number | null;
  category: string;
  unit: string;
  stock: number;
};

function ProductCatalogModal({
  theme,
  initialStoreSlug,
  onPick,
  onClose,
}: {
  theme: StudioTheme;
  initialStoreSlug: string | null;
  onPick: (p: Picked) => void;
  onClose: () => void;
}) {
  const dark = theme === "dark";
  const [step, setStep] = useState<"stores" | "products">(initialStoreSlug ? "products" : "stores");
  const [activeStore, setActiveStore] = useState<CatalogStore | null>(null);
  const [stores, setStores] = useState<CatalogStore[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    setLoadingStores(true);
    fetch("/api/marketplace/stores?limit=80")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: CatalogStore[] } | null) => {
        const list = (d?.data ?? []).filter((s) => !!s.slug);
        setStores(list);
        if (initialStoreSlug) {
          const found = list.find((s) => s.slug === initialStoreSlug);
          if (found) setActiveStore(found);
        }
      })
      .catch((err) => {
         
        console.warn("[CatalogModal] stores", err);
      })
      .finally(() => setLoadingStores(false));
  }, [initialStoreSlug]);

  useEffect(() => {
    if (!activeStore) return;
    setLoadingProducts(true);
    fetch(`/api/marketplace/stores/${activeStore.slug}/products?limit=120`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: Array<{ id: number | string; name: string; image: string; price: string | number; category: string; unit: string; stock: number }> } | null) => {
        const list: CatalogProduct[] = (d?.data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          image: p.image && p.image.length > 0 ? p.image : null,
          price: numOrNull(p.price),
          category: p.category,
          unit: p.unit,
          stock: p.stock,
        }));
        setProducts(list);
      })
      .catch((err) => {
         
        console.warn("[CatalogModal] products", err);
      })
      .finally(() => setLoadingProducts(false));
  }, [activeStore]);

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredStores = stores.filter(
    (s) => !storeSearch || `${s.name} ${s.slug} ${s.category} ${s.zone ?? ""}`.toLowerCase().includes(storeSearch.toLowerCase()),
  );
  const filteredProducts = products.filter(
    (p) => !productSearch || `${p.name} ${p.category}`.toLowerCase().includes(productSearch.toLowerCase()),
  );

  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Catálogo de productos"
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-8 bg-black/70"
      onClick={onClose}
    >
      <div
        onClick={stopPropagation}
        className={cn(
          "w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden",
          dark ? "bg-[#0c1015] border border-[rgb(var(--st-fg)/0.1)]" : "bg-white border border-black/10",
        )}
      >
        {/* Header */}
        <header className={cn("shrink-0 px-5 py-3 flex items-center gap-3 border-b", dark ? "border-[rgb(var(--st-fg)/0.1)] bg-black/40" : "border-black/10 bg-[#f4f5f7]")}>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-[rgb(var(--st-fg))] shrink-0">
            <Search className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-extrabold leading-none", dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>
              {step === "stores" ? "Elegí una tienda" : "Elegí un producto"}
            </p>
            <p className={cn("text-[length:var(--ts-2xs)] leading-tight mt-0.5 truncate", dark ? "text-[rgb(var(--st-fg)/0.6)]" : "text-black/60")}>
              {step === "stores"
                ? `${stores.length} tiendas en el marketplace`
                : `${activeStore?.name ?? ""} · ${products.length} productos`}
            </p>
          </div>
          {step === "products" && (
            <button
              type="button"
              onClick={() => { setStep("stores"); setActiveStore(null); setProducts([]); setProductSearch(""); }}
              className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition-colors",
                dark ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.8)] hover:bg-[rgb(var(--st-fg)/0.2)]" : "bg-black/5 text-black/70 hover:bg-black/10")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Tiendas
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              dark ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg))] hover:bg-[rgb(var(--st-fg)/0.2)]" : "bg-black/5 text-[#0c1015] hover:bg-black/10")}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Search */}
        <div className={cn("shrink-0 px-5 py-3 border-b", dark ? "border-[rgb(var(--st-fg)/0.1)]" : "border-black/10")}>
          <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 border", dark ? "bg-[rgb(var(--st-fg)/0.05)] border-[rgb(var(--st-fg)/0.1)]" : "bg-white border-black/10")}>
            <Search className={cn("h-4 w-4 shrink-0", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/40")} />
            {step === "stores" ? (
              <input
                value={storeSearch}
                onChange={(e) => setStoreSearch(e.target.value)}
                placeholder="Buscar por nombre, categoría o zona…"
                className={cn("flex-1 bg-transparent outline-none text-sm font-semibold", dark ? "text-[rgb(var(--st-fg))] placeholder-[rgb(var(--st-fg)/0.4)]" : "text-[#0c1015] placeholder-black/40")}
                autoFocus
              />
            ) : (
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar producto…"
                className={cn("flex-1 bg-transparent outline-none text-sm font-semibold", dark ? "text-[rgb(var(--st-fg))] placeholder-[rgb(var(--st-fg)/0.4)]" : "text-[#0c1015] placeholder-black/40")}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          {step === "stores" ? (
            loadingStores ? (
              <p className={cn("text-center py-12 text-sm", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>Cargando tiendas…</p>
            ) : filteredStores.length === 0 ? (
              <p className={cn("text-center py-12 text-sm", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
                {storeSearch ? "Ninguna tienda matchea." : "Sin tiendas en el marketplace."}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredStores.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => { setActiveStore(s); setStep("products"); }}
                    className={cn(
                      "rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5",
                      dark
                        ? "border-[rgb(var(--st-fg)/0.1)] bg-[rgb(var(--st-fg)/0.05)] hover:border-[var(--accent)] hover:bg-[rgb(var(--st-fg)/0.1)]"
                        : "border-black/10 bg-white hover:border-[var(--accent)] hover:shadow-md",
                    )}
                  >
                    <div className={cn("aspect-square rounded-lg overflow-hidden mb-2 flex items-center justify-center",
                      dark ? "bg-[rgb(var(--st-fg)/0.1)]" : "bg-black/5")}>
                      {s.logo ? (
                        <div role="img" aria-label={s.name} className="h-full w-full" style={{ background: `url(${s.logo}) center/cover` }} />
                      ) : (
                        <span className={cn("font-display text-3xl font-extrabold", dark ? "text-[rgb(var(--st-fg)/0.3)]" : "text-black/30")}>
                          {(s.name || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className={cn("text-xs font-extrabold truncate", dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>
                      {s.name}
                    </p>
                    <div className={cn("flex items-center gap-1 mt-0.5 text-[length:var(--ts-2xs)]", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
                      <span className="capitalize truncate">{s.category}</span>
                      <span>·</span>
                      <span className="tabular-nums shrink-0">{s.productCount} prod.</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : loadingProducts ? (
            <p className={cn("text-center py-12 text-sm", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>Cargando productos…</p>
          ) : filteredProducts.length === 0 ? (
            <p className={cn("text-center py-12 text-sm", dark ? "text-[rgb(var(--st-fg)/0.5)]" : "text-black/50")}>
              {productSearch ? "Ningún producto matchea." : "Esta tienda no tiene productos."}
            </p>
          ) : (
            (() => {
              const pickProduct = (p: CatalogProduct) => {
                if (!activeStore) return;
                onPick({
                  storeSlug: activeStore.slug,
                  productId: p.id,
                  name: p.name,
                  image: p.image,
                  price: p.price,
                  oldPrice: null,
                  href: `/t/${activeStore.slug}/producto/${p.id}`,
                });
              };
              // Si hay search activa, mostrar lista plana. Si no, agrupar por categoría.
              if (productSearch.trim()) {
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredProducts.map((p) => (
                      <ProductCard key={String(p.id)} product={p} onPick={pickProduct} dark={dark} />
                    ))}
                  </div>
                );
              }
              // Agrupar por categoría
              const groups = new Map<string, CatalogProduct[]>();
              for (const p of filteredProducts) {
                const cat = (p.category || "sin-categoria").trim() || "sin-categoria";
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat)!.push(p);
              }
              const sorted = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
              return (
                <div className="space-y-6">
                  {sorted.map(([cat, items]) => (
                    <section key={cat}>
                      <header className={cn(
                        "sticky top-0 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 py-2 mb-3 flex items-center gap-2 backdrop-blur",
                        dark ? "bg-[rgb(var(--st-bg)/0.85)]" : "bg-[rgb(var(--st-bg)/0.85)]",
                      )}>
                        <h3 className={cn(
                          "text-xs font-extrabold uppercase tracking-wider truncate flex-1",
                          dark ? "text-[rgb(var(--st-fg)/0.85)]" : "text-[#0c1015]",
                        )}>
                          {cat.replace(/-/g, " ")}
                        </h3>
                        <span className={cn(
                          "text-[length:var(--ts-2xs)] font-extrabold tabular-nums shrink-0 rounded-full px-2 py-0.5",
                          dark ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.7)]" : "bg-black/5 text-black/60",
                        )}>
                          {items.length}
                        </span>
                      </header>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {items.map((p) => (
                          <ProductCard key={String(p.id)} product={p} onPick={pickProduct} dark={dark} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ProductCard({
  product,
  onPick,
  dark,
}: {
  product: CatalogProduct;
  onPick: (p: CatalogProduct) => void;
  dark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className={cn(
        "rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5",
        dark
          ? "border-[rgb(var(--st-fg)/0.1)] bg-[rgb(var(--st-fg)/0.05)] hover:border-[var(--accent)] hover:bg-[rgb(var(--st-fg)/0.1)]"
          : "border-black/10 bg-white hover:border-[var(--accent)] hover:shadow-md",
      )}
    >
      <div className={cn(
        "aspect-square rounded-lg overflow-hidden mb-2 flex items-center justify-center",
        dark ? "bg-[rgb(var(--st-fg)/0.1)]" : "bg-black/5",
      )}>
        {product.image ? (
          <div role="img" aria-label={product.name} className="h-full w-full" style={{ background: `url(${product.image}) center/cover` }} />
        ) : (
          <ImageIconLucide className={cn("h-8 w-8", dark ? "text-[rgb(var(--st-fg)/0.3)]" : "text-black/30")} strokeWidth={1.25} />
        )}
      </div>
      <p className={cn("text-xs font-extrabold truncate leading-tight", dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>
        {product.name}
      </p>
      <div className="flex items-baseline justify-between gap-1 mt-1">
        <span className={cn("font-display text-sm font-extrabold tabular-nums", dark ? "text-[rgb(var(--st-fg))]" : "text-[#0c1015]")}>
          {product.price !== null ? `S/ ${Number(product.price).toFixed(2)}` : "—"}
        </span>
        <span className={cn("text-[length:var(--ts-2xs)] truncate", dark ? "text-[rgb(var(--st-fg)/0.4)]" : "text-black/40")}>
          {product.unit}
        </span>
      </div>
    </button>
  );
}

function StateTab({
  banner,
  index,
  total,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
}: {
  banner: StudioBanner;
  index: number;
  total: number;
  onPatch: (p: Partial<StudioBanner>) => void;
  onMove: (d: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  // banners v2 F3: rendimiento (impresiones/clicks) del banner actual.
  const [stats, setStats] = useState<{ impressions: number; clicks: number } | null>(null);
  useEffect(() => {
    let cancel = false;
    fetch("/api/superadmin/banners/stats", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancel && j?.stats) setStats(j.stats[banner.id] ?? { impressions: 0, clicks: 0 }); })
      .catch(() => { /* sin stats */ });
    return () => { cancel = true; };
  }, [banner.id]);
  const ctr = stats && stats.impressions > 0 ? Math.round((stats.clicks / stats.impressions) * 1000) / 10 : 0;

  return (
    <div className="space-y-3 text-[rgb(var(--st-fg))]">
      <Section title="Visibilidad">
        <button
          type="button"
          onClick={() => onPatch({ active: !banner.active })}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold transition-colors",
            banner.active
              ? "bg-[var(--data-success-500)]/20 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/30"
              : "bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/30",
          )}
        >
          {banner.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {banner.active ? "Activo · visible al público" : "Oculto · solo visible acá"}
        </button>
      </Section>
      {/* banners v2 F2: programación. Vacío = sin límite por ese lado. El banner
          se muestra al público solo si está activo Y dentro de la ventana. */}
      <Section title="Programación (opcional)">
        <div className="grid grid-cols-1 gap-2">
          <label className="text-[length:var(--ts-2xs)] font-bold text-[rgb(var(--st-fg)/0.6)]">
            Desde
            <input
              type="datetime-local"
              value={isoToLocalInput(banner.startsAt)}
              onChange={(e) => onPatch({ startsAt: localInputToIso(e.target.value) })}
              className="mt-1 w-full rounded-lg bg-[rgb(var(--st-fg)/0.06)] border border-[rgb(var(--st-fg)/0.12)] px-2 py-1.5 text-xs text-[rgb(var(--st-fg))]"
            />
          </label>
          <label className="text-[length:var(--ts-2xs)] font-bold text-[rgb(var(--st-fg)/0.6)]">
            Hasta
            <input
              type="datetime-local"
              value={isoToLocalInput(banner.endsAt)}
              onChange={(e) => onPatch({ endsAt: localInputToIso(e.target.value) })}
              className="mt-1 w-full rounded-lg bg-[rgb(var(--st-fg)/0.06)] border border-[rgb(var(--st-fg)/0.12)] px-2 py-1.5 text-xs text-[rgb(var(--st-fg))]"
            />
          </label>
          {(banner.startsAt || banner.endsAt) && (
            <button
              type="button"
              onClick={() => onPatch({ startsAt: null, endsAt: null })}
              className="text-[length:var(--ts-2xs)] font-bold text-[rgb(var(--st-fg)/0.5)] hover:text-[rgb(var(--st-fg)/0.8)] text-left"
            >
              Quitar programación (mostrar siempre)
            </button>
          )}
        </div>
      </Section>
      {/* banners v2 F4: segmentación por zona. Sin selección = todas las zonas. */}
      <Section title="Segmentación por zona">
        <div className="flex flex-wrap gap-1.5">
          {BANNER_ZONES.map((z) => {
            const sel = (banner.targetZones ?? []).includes(z);
            return (
              <button
                key={z}
                type="button"
                onClick={() => {
                  const cur = banner.targetZones ?? [];
                  const next = sel ? cur.filter((x) => x !== z) : [...cur, z];
                  onPatch({ targetZones: next });
                }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition-colors",
                  sel
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[rgb(var(--st-fg)/0.06)] text-[rgb(var(--st-fg)/0.7)] hover:bg-[rgb(var(--st-fg)/0.12)]",
                )}
              >
                {z}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.5)]">
          {(banner.targetZones ?? []).length === 0
            ? "Se muestra en todas las zonas."
            : `Solo en: ${(banner.targetZones ?? []).join(", ")}`}
        </p>
      </Section>
      <Section title={`Orden (${index + 1} de ${total})`}>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={STATE_BTN_CLS}>
            <ArrowUp className="h-3.5 w-3.5" /> Subir
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index >= total - 1} className={STATE_BTN_CLS}>
            <ArrowDown className="h-3.5 w-3.5" /> Bajar
          </button>
        </div>
      </Section>
      <Section title="Acciones">
        <div className="grid grid-cols-1 gap-1.5">
          <button type="button" onClick={onDuplicate} className={STATE_BTN_CLS}>
            <Copy className="h-3.5 w-3.5" /> Duplicar este banner
          </button>
          <button
            type="button"
            onClick={onRemove}
            className={cn(STATE_BTN_CLS, "hover:bg-[rgba(239,68,68,0.15)] hover:border-[rgba(239,68,68,0.4)] hover:text-[rgba(252,165,165,1)]")}
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar este banner
          </button>
        </div>
      </Section>
      <Section title="Rendimiento">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-[rgb(var(--st-fg)/0.06)] px-2 py-2">
            <p className="text-sm font-extrabold tabular-nums text-[rgb(var(--st-fg))]">{stats?.impressions ?? "—"}</p>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[rgb(var(--st-fg)/0.5)]">Vistas</p>
          </div>
          <div className="rounded-lg bg-[rgb(var(--st-fg)/0.06)] px-2 py-2">
            <p className="text-sm font-extrabold tabular-nums text-[rgb(var(--st-fg))]">{stats?.clicks ?? "—"}</p>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[rgb(var(--st-fg)/0.5)]">Clicks</p>
          </div>
          <div className="rounded-lg bg-[rgb(var(--st-fg)/0.06)] px-2 py-2">
            <p className="text-sm font-extrabold tabular-nums text-[rgb(var(--st-fg))]">{stats ? `${ctr}%` : "—"}</p>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[rgb(var(--st-fg)/0.5)]">CTR</p>
          </div>
        </div>
      </Section>
      <Section title="Identificador interno">
        <code className="block px-2 py-1 rounded bg-[rgb(var(--st-fg)/0.05)] text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.5)] font-mono">{banner.id}</code>
      </Section>
      <p className="text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.5)] leading-snug pt-2 border-t border-[rgb(var(--st-fg)/0.1)]">
        <Save className="inline h-3 w-3 mr-1" />
        Los cambios se aplican al instante en el editor. No olvides presionar
        <span className="text-[rgb(var(--st-fg)/0.8)] font-extrabold"> Guardar </span>
        en la barra inferior cuando salgas del estudio.
      </p>
    </div>
  );
}

const STATE_BTN_CLS =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[rgb(var(--st-fg)/0.06)] border border-[rgb(var(--st-fg)/0.1)] text-xs font-extrabold text-[rgb(var(--st-fg)/0.85)] transition-all hover:bg-[rgb(var(--st-fg)/0.12)] hover:border-[rgb(var(--st-fg)/0.25)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[rgb(var(--st-fg)/0.06)] disabled:hover:border-[rgb(var(--st-fg)/0.1)]";

// banners v2 F4: zonas de Pucallpa para segmentación.
const BANNER_ZONES = ["Centro", "Yarinacocha", "Manantay", "Callería", "Campo Verde"] as const;

// banners v2 F2: conversión ISO ↔ valor de <input type="datetime-local">.
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DDTHH:mm en hora local (datetime-local no maneja timezone).
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(val: string): string | null {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-bits
// ─────────────────────────────────────────────────────────────────────────────

function ModeBtn({
  active,
  onClick,
  icon,
  label,
  hint,
  theme = "dark",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  theme?: StudioTheme;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint ? `${label} (${hint})` : label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors",
        active
          ? "bg-[var(--accent)] text-[rgb(var(--st-fg))]"
          : theme === "dark"
            ? "bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg)/0.8)] hover:bg-[rgb(var(--st-fg)/0.2)]"
            : "bg-black/5 text-[#0c1015]/70 hover:bg-black/10 hover:text-[#0c1015]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[rgb(var(--st-fg)/0.4)] mr-1.5 hidden lg:inline">
        {label}
      </span>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

function ToolBtn({
  icon,
  label,
  onClick,
  title,
  active,
  disabled,
}: {
  icon?: React.ReactNode;
  label?: string;
  onClick: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-extrabold transition-colors",
        active ? "bg-[var(--accent)] text-[rgb(var(--st-fg))]" : "bg-[rgb(var(--st-fg)/0.05)] hover:bg-[rgb(var(--st-fg)/0.15)] text-[rgb(var(--st-fg)/0.8)]",
        disabled && "opacity-30 cursor-not-allowed hover:bg-[rgb(var(--st-fg)/0.05)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="h-6 w-px bg-[rgb(var(--st-fg)/0.1)] mx-1" />;
}

function AnchorGrid({ value, onChange, disabled }: { value: { x: number; y: number }; onChange: (p: { x: number; y: number }) => void; disabled?: boolean }) {
  const points: Array<{ x: number; y: number; title: string }> = [
    { x: 0, y: 0, title: "Sup. izq." }, { x: 50, y: 0, title: "Sup. centro" }, { x: 100, y: 0, title: "Sup. der." },
    { x: 0, y: 50, title: "Med. izq." }, { x: 50, y: 50, title: "Centro" }, { x: 100, y: 50, title: "Med. der." },
    { x: 0, y: 100, title: "Inf. izq." }, { x: 50, y: 100, title: "Inf. centro" }, { x: 100, y: 100, title: "Inf. der." },
  ];
  return (
    <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-[rgb(var(--st-fg)/0.05)] rounded-md">
      {points.map((p) => {
        const active = Math.abs(value.x - p.x) < 1 && Math.abs(value.y - p.y) < 1;
        return (
          <button
            key={`${p.x}-${p.y}`}
            type="button"
            onClick={() => onChange(p)}
            title={p.title}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              "h-5 w-5 rounded-sm transition-colors",
              active ? "bg-[var(--accent)]" : "bg-[rgb(var(--st-fg)/0.15)] hover:bg-[rgb(var(--st-fg)/0.3)]",
              disabled && "opacity-30 cursor-not-allowed",
            )}
          />
        );
      })}
    </div>
  );
}

function NavCounter({ idx, total, onPrev, onNext }: { idx: number; total: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[rgb(var(--st-fg))]">
      <button type="button" onClick={onPrev} disabled={total <= 1} className={NAV_BTN_CLS}><ChevronLeft className="h-4 w-4" /></button>
      <span className="text-xs font-bold tabular-nums min-w-[44px] text-center">
        {total === 0 ? "—" : `${idx + 1} / ${total}`}
      </span>
      <button type="button" onClick={onNext} disabled={total <= 1} className={NAV_BTN_CLS}><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

const NAV_BTN_CLS =
  "inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[rgb(var(--st-fg)/0.1)] text-[rgb(var(--st-fg))] transition-colors hover:bg-[rgb(var(--st-fg)/0.2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[rgb(var(--st-fg)/0.1)]";

function TabBtn({ icon, active, onClick, title }: { icon: React.ReactNode; active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "h-10 inline-flex items-center justify-center text-xs font-extrabold transition-colors border-b-2",
        active
          ? "border-[var(--accent)] text-[var(--accent)] bg-[rgb(var(--st-fg)/0.05)]"
          : "border-transparent text-[rgb(var(--st-fg)/0.6)] hover:text-[rgb(var(--st-fg))] hover:bg-[rgb(var(--st-fg)/0.05)]",
      )}
    >
      {icon}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[rgb(var(--st-fg)/0.5)] mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function NumField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.6)] mb-0.5">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1.5 rounded-md bg-[rgb(var(--st-fg)/0.05)] border border-[rgb(var(--st-fg)/0.1)] text-xs font-extrabold text-[rgb(var(--st-fg))] tabular-nums focus:border-[var(--accent)] outline-none"
      />
    </label>
  );
}

function FitChip({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-2 py-2 text-left transition-all",
        active ? "border-[var(--accent)] bg-[var(--accent)]/15" : "border-[rgb(var(--st-fg)/0.1)] bg-[rgb(var(--st-fg)/0.05)] hover:border-[rgb(var(--st-fg)/0.3)]",
      )}
    >
      <p className={cn("text-xs font-extrabold", active ? "text-[var(--accent)]" : "text-[rgb(var(--st-fg))]")}>{label}</p>
      <p className="text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.5)] leading-snug mt-0.5">{hint}</p>
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[length:var(--ts-2xs)] text-[rgb(var(--st-fg)/0.6)] mb-0.5">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 rounded cursor-pointer border-none bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-md bg-[rgb(var(--st-fg)/0.05)] border border-[rgb(var(--st-fg)/0.1)] text-xs font-mono text-[rgb(var(--st-fg))] focus:border-[var(--accent)] outline-none"
        />
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas overlay — drag directo de "Comprar" e Insignia sobre el banner.
// Convierte el canvas en un editor estilo Photoshop: cada chip es agarrable y
// al soltarlo escribe `buyAnchor` / `badgeAnchor` en el item correspondiente.
// ─────────────────────────────────────────────────────────────────────────────

type AnchorKey = "buyAnchor" | "badgeAnchor" | "productAnchor";
type SnapResult = { x: number; y: number; matchedX: number | null; matchedY: number | null };

const SNAP_EPS = 2.5; // % tolerance for snap
const SNAP_GUIDES_X = [0, 25, 33.3333, 50, 66.6667, 75, 100];
const SNAP_GUIDES_Y = [0, 25, 33.3333, 50, 66.6667, 75, 100];

function PromoElementOverlay({
  banner,
  onPatch,
  canvasRef,
  theme,
}: {
  banner: StudioBanner;
  onPatch: (p: Partial<StudioBanner>) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  theme: StudioTheme;
}) {
  const [snapLines, setSnapLines] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const dark = theme === "dark";

  const promo = banner.promo ?? DEFAULT_PROMO;
  const items: PromoItem[] = useMemo(() => {
    if (banner.type !== "promo") return [];
    return promo.items && promo.items.length > 0
      ? promo.items
      : [{
          id: "legacy",
          source: "manual",
          productName: promo.productName,
          productImage: promo.productImage,
          price: promo.price,
          oldPrice: promo.oldPrice,
          badge: promo.badge,
          buyHref: promo.buyHref,
          buyLabel: promo.buyLabel,
          imageAdjust: promo.imageAdjust,
        }];
  }, [banner.type, promo]);

  // Posiciones de TODOS los anchors actuales — para snap entre elementos.
  const allAnchors = useMemo(() => {
    const list: Array<{ id: string; idx: number; key: AnchorKey; x: number; y: number }> = [];
    items.forEach((it, idx) => {
      if (it.buyAnchor) list.push({ id: it.id, idx, key: "buyAnchor", x: it.buyAnchor.x, y: it.buyAnchor.y });
      if (it.badgeAnchor) list.push({ id: it.id, idx, key: "badgeAnchor", x: it.badgeAnchor.x, y: it.badgeAnchor.y });
      if (it.productAnchor) list.push({ id: it.id, idx, key: "productAnchor", x: it.productAnchor.x, y: it.productAnchor.y });
    });
    return list;
  }, [items]);

  const computeSnap = useCallback((rawX: number, rawY: number, excludeIdx: number, excludeKey: AnchorKey): SnapResult => {
    const otherX = allAnchors.filter((a) => !(a.idx === excludeIdx && a.key === excludeKey)).map((a) => a.x);
    const otherY = allAnchors.filter((a) => !(a.idx === excludeIdx && a.key === excludeKey)).map((a) => a.y);
    const xs = [...SNAP_GUIDES_X, ...otherX];
    const ys = [...SNAP_GUIDES_Y, ...otherY];
    let best: { v: number; d: number } | null = null;
    for (const g of xs) {
      const d = Math.abs(rawX - g);
      if (d <= SNAP_EPS && (!best || d < best.d)) best = { v: g, d };
    }
    const matchedX = best?.v ?? null;
    best = null;
    for (const g of ys) {
      const d = Math.abs(rawY - g);
      if (d <= SNAP_EPS && (!best || d < best.d)) best = { v: g, d };
    }
    const matchedY = best?.v ?? null;
    return { x: matchedX ?? rawX, y: matchedY ?? rawY, matchedX, matchedY };
  }, [allAnchors]);

  const updateItemAnchor = useCallback((idx: number, key: AnchorKey, anchor: PromoAnchor | null) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [key]: anchor } : it));
    const first = next[0];
    onPatch({
      promo: {
        ...promo,
        items: next,
        productName: first?.productName ?? promo.productName,
        productImage: first?.productImage ?? promo.productImage,
        price: first?.price ?? promo.price,
        oldPrice: first?.oldPrice ?? promo.oldPrice,
        badge: first?.badge ?? promo.badge,
        buyHref: first?.buyHref ?? promo.buyHref,
        buyLabel: first?.buyLabel ?? promo.buyLabel,
        imageAdjust: first?.imageAdjust ?? promo.imageAdjust,
      },
    });
  }, [items, onPatch, promo]);

  if (banner.type !== "promo") return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {/* Snap guide lines — solo durante drag activo con match */}
      {snapLines.x != null && (
        <div
          className="absolute top-0 bottom-0 w-px bg-fuchsia-400 shadow-[0_0_4px_rgba(217,70,239,0.8)] pointer-events-none"
          style={{ left: `${snapLines.x}%` }}
          aria-hidden
        />
      )}
      {snapLines.y != null && (
        <div
          className="absolute left-0 right-0 h-px bg-fuchsia-400 shadow-[0_0_4px_rgba(217,70,239,0.8)] pointer-events-none"
          style={{ top: `${snapLines.y}%` }}
          aria-hidden
        />
      )}

      {items.map((it, idx) => (
        <Fragment key={it.id}>
          <DraggableHandle
            label={items.length > 1 ? `Producto #${idx + 1}` : "Producto"}
            color="sky"
            anchor={it.productAnchor ?? { x: 18, y: 50 }}
            isFree={it.productAnchor != null}
            canvasRef={canvasRef}
            theme={theme}
            onChange={(a) => updateItemAnchor(idx, "productAnchor", a)}
            computeSnap={(x, y) => computeSnap(x, y, idx, "productAnchor")}
            onSnapChange={setSnapLines}
          />
          <DraggableHandle
            label={items.length > 1 ? `Comprar #${idx + 1}` : "Comprar"}
            color="emerald"
            anchor={it.buyAnchor ?? { x: 88, y: 88 }}
            isFree={it.buyAnchor != null}
            canvasRef={canvasRef}
            theme={theme}
            onChange={(a) => updateItemAnchor(idx, "buyAnchor", a)}
            computeSnap={(x, y) => computeSnap(x, y, idx, "buyAnchor")}
            onSnapChange={setSnapLines}
          />
          {it.badge ? (
            <DraggableHandle
              label={items.length > 1 ? `Insignia #${idx + 1}` : "Insignia"}
              color="rose"
              anchor={it.badgeAnchor ?? { x: 12, y: 18 }}
              isFree={it.badgeAnchor != null}
              canvasRef={canvasRef}
              theme={theme}
              onChange={(a) => updateItemAnchor(idx, "badgeAnchor", a)}
              computeSnap={(x, y) => computeSnap(x, y, idx, "badgeAnchor")}
              onSnapChange={setSnapLines}
            />
          ) : null}
        </Fragment>
      ))}
      {/* Hint inferior */}
      {!dark && null}
    </div>
  );
}

function DraggableHandle({
  label,
  color,
  anchor,
  isFree,
  canvasRef,
  theme,
  onChange,
  computeSnap,
  onSnapChange,
}: {
  label: string;
  color: "emerald" | "rose" | "sky";
  anchor: PromoAnchor;
  isFree: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  theme: StudioTheme;
  onChange: (a: PromoAnchor | null) => void;
  computeSnap?: (x: number, y: number) => SnapResult;
  onSnapChange?: (lines: { x: number | null; y: number | null }) => void;
}) {
  const dragRef = useRef<{ rect: DOMRect } | null>(null);
  const [active, setActive] = useState(false);
  const dark = theme === "dark";

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const node = canvasRef.current;
    if (!node) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { rect: node.getBoundingClientRect() };
    setActive(true);
    if (!isFree) onChange(anchor);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const { rect } = dragRef.current;
    const rawX = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const rawY = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    if (computeSnap) {
      const snap = computeSnap(rawX, rawY);
      onSnapChange?.({ x: snap.matchedX, y: snap.matchedY });
      onChange({ x: round(snap.x), y: round(snap.y) });
    } else {
      onChange({ x: round(rawX), y: round(rawY) });
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setActive(false);
    onSnapChange?.({ x: null, y: null });
    const t = e.currentTarget;
    if (t.hasPointerCapture(e.pointerId)) t.releasePointerCapture(e.pointerId);
  };

  const palette =
    color === "emerald"
      ? { bg: "bg-[var(--data-success-500)]", ring: "ring-emerald-300" }
      : color === "rose"
        ? { bg: "bg-rose-500", ring: "ring-rose-300" }
        : { bg: "bg-sky-500", ring: "ring-sky-300" };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Arrastrar ${label}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "absolute",
        left: `${anchor.x}%`,
        top: `${anchor.y}%`,
        transform: "translate(-50%, -50%)",
      }}
      className={cn(
        "pointer-events-auto select-none touch-none transition-all",
        active ? "cursor-grabbing scale-110" : "cursor-grab hover:scale-105",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white shadow-lg ring-2",
          palette.bg,
          active ? palette.ring : isFree ? "ring-white/40" : "ring-white/20",
          !isFree && "opacity-70 hover:opacity-100",
        )}
        title={isFree ? `${label} · ${Math.round(anchor.x)}% / ${Math.round(anchor.y)}%` : `${label} · click para fijar y arrastrar`}
      >
        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dark ? "bg-white/90" : "bg-white")} />
        {label}
        {isFree && (
          <button
            type="button"
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => {
              ev.stopPropagation();
              onChange(null);
            }}
            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/30 hover:bg-black/60 text-white text-[length:var(--ts-2xs)] leading-none"
            title="Volver a posición por defecto"
            aria-label="Resetear posición"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number): number {
  return Math.round(v * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS — keyframes en plain string (evitamos styled-jsx que rompía Turbopack
// al combinarse con muchos sub-componentes anidados en un mismo archivo).
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_CSS = `
.studio-root[data-studio-theme="dark"] {
  --st-fg: 255 255 255;
  --st-bg: 12 16 21;
}
.studio-root[data-studio-theme="light"] {
  --st-fg: 12 16 21;
  --st-bg: 244 245 247;
}
@keyframes bs-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes bs-slide {
  from { opacity: 0; transform: translateX(40px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes bs-zoom {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
.animate-bs-fade  { animation: bs-fade ${ANIM_DURATION_MS}ms ease-out both; }
.animate-bs-slide { animation: bs-slide ${ANIM_DURATION_MS}ms cubic-bezier(0.2,0.8,0.2,1) both; }
.animate-bs-zoom  { animation: bs-zoom ${ANIM_DURATION_MS}ms cubic-bezier(0.2,0.8,0.2,1) both; }
`;
