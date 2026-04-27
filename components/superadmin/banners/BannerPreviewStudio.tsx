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

import { useEffect, useRef, useState, useCallback } from "react";
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
import type { ImageAdjust, PromoItem } from "@/lib/promo-banners";

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
  const [theme, setTheme] = useState<StudioTheme>("dark");
  const [idx, setIdx] = useState(Math.min(initialIndex, Math.max(0, banners.length - 1)));
  const [tab, setTab] = useState<EditTab>("frame");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Solo / Presentación state
  const [width, setWidth] = useState<Width>("1600");
  const [animation, setAnimation] = useState<Animation>("fade");
  const [speedMs, setSpeedMs] = useState(6000);
  const [playing, setPlaying] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  // Undo/redo de imageAdjust (por banner) en state, así hasUndo/hasRedo es
  // derivado puro y no rompe la regla react-hooks/refs.
  const [history, setHistory] = useState<Record<string, { past: ImageAdjust[]; future: ImageAdjust[] }>>({});

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

  // ── History helpers ──────────────────────────────────────────────────────
  const pushHistory = useCallback((bannerId: string, prev: ImageAdjust) => {
    setHistory((h) => {
      const entry = h[bannerId] ?? { past: [], future: [] };
      const past = [...entry.past, prev];
      if (past.length > HISTORY_CAP) past.shift();
      return { ...h, [bannerId]: { past, future: [] } };
    });
  }, []);

  const patchAdjust = useCallback(
    (next: ImageAdjust, opts: { record?: boolean } = {}) => {
      if (!current || !onPatchBanner) return;
      if (opts.record !== false) pushHistory(current.id, current.imageAdjust ?? DEFAULT_ADJ);
      onPatchBanner(idx, { imageAdjust: next });
    },
    [current, idx, onPatchBanner, pushHistory],
  );

  const undo = useCallback(() => {
    if (!current || !onPatchBanner) return;
    const entry = history[current.id];
    if (!entry || entry.past.length === 0) return;
    const prev = entry.past[entry.past.length - 1]!;
    setHistory((h) => {
      const e = h[current.id]!;
      return {
        ...h,
        [current.id]: {
          past: e.past.slice(0, -1),
          future: [...e.future, current.imageAdjust ?? DEFAULT_ADJ],
        },
      };
    });
    onPatchBanner(idx, { imageAdjust: prev });
  }, [current, idx, history, onPatchBanner]);

  const redo = useCallback(() => {
    if (!current || !onPatchBanner) return;
    const entry = history[current.id];
    if (!entry || entry.future.length === 0) return;
    const next = entry.future[entry.future.length - 1]!;
    setHistory((h) => {
      const e = h[current.id]!;
      return {
        ...h,
        [current.id]: {
          past: [...e.past, current.imageAdjust ?? DEFAULT_ADJ],
          future: e.future.slice(0, -1),
        },
      };
    });
    onPatchBanner(idx, { imageAdjust: next });
  }, [current, idx, history, onPatchBanner]);

  // ── Patches generales ────────────────────────────────────────────────────
  const patch = useCallback(
    (p: Partial<StudioBanner>) => onPatchBanner?.(idx, p),
    [idx, onPatchBanner],
  );

  // ── Atajos de teclado ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (!inField) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (inField) return;

      if (e.key === "1") setMode(editable ? "edit" : "solo");
      else if (e.key === "2") setMode("solo");
      else if (e.key === "3") setMode("show");

      if (mode === "show" && e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
        return;
      }

      // Cmd/Ctrl+Z / Shift+Z
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      // Navegación entre banners
      if (mode !== "edit") {
        if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + banners.length) % banners.length);
        if (e.key === "ArrowRight") setIdx((i) => (i + 1) % banners.length);
        return;
      }

      // En Editar: arrows = nudge, Shift+arrows = nudge rápido
      if (mode === "edit" && current?.imageUrl && current.imageAdjust !== undefined) {
        const adj = current.imageAdjust ?? DEFAULT_ADJ;
        const step = e.shiftKey ? NUDGE_FAST : NUDGE_PCT;
        const nudge = (dx: number, dy: number) =>
          patchAdjust({
            ...adj,
            position: { x: clamp(adj.position.x + dx, 0, 100), y: clamp(adj.position.y + dy, 0, 100) },
          });
        if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
        else if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
        else if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
        else if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
        else if (e.key === "0") patchAdjust(DEFAULT_ADJ);
        else if (e.key === "+" || e.key === "=") patchAdjust({ ...adj, scale: clamp(adj.scale + 10, ZOOM_MIN, ZOOM_MAX) });
        else if (e.key === "-" || e.key === "_") patchAdjust({ ...adj, scale: clamp(adj.scale - 10, ZOOM_MIN, ZOOM_MAX) });
        else if (e.key === "c" || e.key === "C") patchAdjust({ ...adj, position: { x: 50, y: 50 } });
        else if (e.key === "f" || e.key === "F") patchAdjust({ ...adj, fit: adj.fit === "cover" ? "contain" : "cover" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, banners.length, onClose, current, patchAdjust, undo, redo, editable]);

  if (banners.length === 0 && !editable) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estudio de banner"
      data-studio-theme={theme}
      className={cn(
        "studio-root fixed inset-0 z-[100] flex flex-col",
        theme === "dark" ? "bg-[#0c1015] text-white" : "bg-[#f4f5f7] text-[#0c1015]",
      )}
    >
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header
        className={cn(
          "shrink-0 px-4 sm:px-6 py-3 flex items-center gap-3 border-b",
          theme === "dark" ? "border-white/10 bg-black/60" : "border-black/10 bg-white",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white shrink-0">
            <Edit3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-none truncate">Estudio de banner</p>
            <p className={cn(
              "text-[length:var(--ts-2xs)] leading-tight mt-0.5 truncate",
              theme === "dark" ? "text-white/60" : "text-black/60",
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
          <span aria-hidden className={cn("h-6 w-px mx-1", theme === "dark" ? "bg-white/20" : "bg-black/15")} />
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-label="Cambiar tema del estudio"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              theme === "dark"
                ? "bg-white/10 text-white hover:bg-white/20"
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
                ? "bg-white/10 text-white hover:bg-white/20"
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
          patch={patch}
          patchAdjust={patchAdjust}
          undo={undo}
          redo={redo}
          hasUndo={!!current && (history[current.id]?.past.length ?? 0) > 0}
          hasRedo={!!current && (history[current.id]?.future.length ?? 0) > 0}
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
  const panelBorder = dark ? "border-white/10" : "border-black/10";
  const subtleText = dark ? "text-white/60" : "text-black/60";
  const canvasBg = dark
    ? "bg-[radial-gradient(circle_at_center,#1f2937_0%,#0c1015_100%)]"
    : "bg-[radial-gradient(circle_at_center,#e5e7eb_0%,#f4f5f7_100%)]";
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; start: { x: number; y: number }; rect: DOMRect } | null>(null);

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

  return (
    <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: `${leftOpen ? "240px " : "44px "} 1fr ${rightOpen ? "320px" : "44px"}` }}>
      {/* ── LEFT: banner list ─────────────────────────────────────── */}
      <aside className={cn("overflow-hidden flex flex-col border-r", panelBg, panelBorder)}>
        <button
          type="button"
          onClick={() => setLeftOpen(!leftOpen)}
          className="shrink-0 h-10 px-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/60 hover:text-white border-b border-white/10 flex items-center gap-1.5"
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
                    : "border-transparent hover:border-white/30",
                )}
              >
                <div className="aspect-[4/1]">
                  <PromoBannerRenderer banner={b} asLink={false} className="[&>div]:rounded-none [&>div]:border-0 h-full" />
                </div>
                <div className="px-2 py-1.5 bg-white/5 flex items-center justify-between gap-1.5">
                  <span className="text-[length:var(--ts-2xs)] font-bold text-white/80 truncate">
                    {b.title || "(sin título)"}
                  </span>
                  {!b.active && (
                    <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-warning)] shrink-0">
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
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-white/20 hover:border-[var(--accent)] hover:text-[var(--accent)] text-white/60 py-3 text-xs font-extrabold transition-colors"
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
            <span className="px-2 text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-white/80 min-w-[44px] text-center">
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
                onClick={() => patch({ active: !current.active })}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition-colors",
                  current.active
                    ? "bg-[var(--data-success)]/20 text-[var(--data-success)] hover:bg-[var(--data-success)]/30"
                    : "bg-[var(--data-warning)]/20 text-[var(--data-warning)] hover:bg-[var(--data-warning)]/30",
                )}
              >
                {current.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {current.active ? "Activo" : "Oculto"}
              </button>
            )}
          </div>
        </div>

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
                {dragging && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] text-white px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shadow-md">
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
              <div className="mt-3 flex items-center justify-between text-[length:var(--ts-2xs)] font-bold text-white/50 tabular-nums">
                <span>X {adj.position.x}% · Y {adj.position.y}%</span>
                <span className="truncate max-w-[40ch] mx-3 text-white/70">{current.title || "(sin título)"}</span>
                <span>Zoom {adj.scale}% · {adj.fit === "cover" ? "Llenar" : "Contener"}</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-white/60">
              <p className="text-sm font-bold">Sin banners en este slot</p>
              {onAddBanner && (
                <button
                  type="button"
                  onClick={onAddBanner}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] text-white px-4 py-2 text-sm font-extrabold hover:opacity-90"
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
      <aside className={cn("overflow-hidden flex flex-col border-l", panelBg, panelBorder)}>
        <button
          type="button"
          onClick={() => setRightOpen(!rightOpen)}
          className="shrink-0 h-10 px-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/60 hover:text-white border-b border-white/10 flex items-center gap-1.5"
        >
          {rightOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          {rightOpen && <span>Herramientas</span>}
        </button>

        {rightOpen && current && (
          <>
            {/* Tabs */}
            <nav className="shrink-0 grid grid-cols-6 border-b border-white/10">
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
            dark ? "text-[#0c1015]/60" : "text-white/60",
          )}>
            <span>{widthPx ? `${widthPx}px` : "100% del contenedor"}</span>
            <span>·</span>
            <span className="truncate max-w-[40ch]">{current.title || "(sin título)"}</span>
          </div>
        </div>
      </div>
      <footer className={cn(
        "shrink-0 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 border-t",
        dark ? "border-white/10 bg-black/60" : "border-black/10 bg-white",
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
                width === w ? "bg-white text-[#0c1015]" : "bg-white/10 text-white/80 hover:bg-white/20",
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
        dark ? "border-white/10 bg-black/60" : "border-black/10 bg-white",
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
            <Gauge className="h-3.5 w-3.5 text-white/60" />
            <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/60">Velocidad</span>
            <input type="range" min={2000} max={15000} step={500} value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))} className="w-32 accent-[var(--accent)]" aria-label="Velocidad" />
            <span className="text-xs font-bold tabular-nums min-w-[42px] text-right">{(speedMs / 1000).toFixed(1)}s</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/60">Animación</span>
          {(["fade", "slide", "zoom", "none"] as Animation[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAnimation(a)}
              aria-pressed={animation === a}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-extrabold transition-colors capitalize",
                animation === a ? "bg-white text-[#0c1015]" : "bg-white/10 text-white/80 hover:bg-white/20",
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
                  i === idx ? "w-8 bg-white" : "w-2 bg-white/30 hover:bg-white/60",
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
      <p className="text-xs text-white/50 leading-snug">
        Subí una imagen primero (pestaña <strong className="text-white/80">Imagen</strong>) para poder reencuadrarla acá.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-white">
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
        <ul className="text-[length:var(--ts-2xs)] text-white/60 space-y-1 leading-snug">
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
    <kbd className="inline-block px-1.5 py-px border border-white/20 rounded bg-white/[0.06] font-mono text-[0.7em]">
      {children}
    </kbd>
  );
}

function ImageTab({ banner, onPatch, uploadFolder }: { banner: StudioBanner; onPatch: (p: Partial<StudioBanner>) => void; uploadFolder: string }) {
  return (
    <div className="space-y-3">
      <Section title="Subir imagen">
        <div className="bg-white/5 rounded-lg p-2">
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
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-white placeholder-white/30 focus:border-[var(--accent)] outline-none"
        />
      </Section>
      <p className="text-[length:var(--ts-2xs)] text-white/50 leading-snug">
        Recomendado: <span className="text-white/80 font-mono">1600 × 400 px</span> · 4:1 · &lt;200 KB.
      </p>
      {banner.imageUrl && (
        <button
          type="button"
          onClick={() => onPatch({ imageUrl: null })}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-[var(--data-error)] transition-colors"
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
                  active ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]" : "border-white/10 bg-white/5 text-white/70 hover:border-white/30",
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
  "w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-white outline-none focus:border-[var(--accent)] transition-colors";

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
      <p className="text-xs text-white/60 leading-snug">
        Los colores de fondo se usan solo cuando NO hay imagen. Quitá la imagen desde la pestaña <strong className="text-white/80">Imagen</strong> para personalizar el gradiente.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-white">
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
                  active ? "border-[var(--accent)]" : "border-transparent hover:border-white/20",
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
      <p className="text-xs text-white/60 leading-snug">
        Cambiá el tipo a <strong className="text-white/80">Promo</strong> en la pestaña Texto para usar producto/combo embebido con compra directa.
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
    <div className={cn("space-y-3", theme === "dark" ? "text-white" : "text-[#0c1015]")}>
      <div className={cn("rounded-lg p-2.5 border text-[length:var(--ts-2xs)] leading-snug",
        theme === "dark" ? "bg-white/5 border-white/10 text-white/70" : "bg-black/5 border-black/10 text-black/70")}>
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
          theme === "dark" ? "border-white/20 text-white/60 hover:border-[var(--accent)] hover:text-[var(--accent)]" : "border-black/20 text-black/60 hover:border-[var(--accent)] hover:text-[var(--accent)]")}
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
  const headerCls = dark ? "bg-white/5 border-white/10" : "bg-black/5 border-black/10";

  return (
    <div className={cn("rounded-lg border", dark ? "border-white/10" : "border-black/10")}>
      <div className={cn("flex items-center gap-2 px-2.5 py-2 border-b rounded-t-lg", headerCls)}>
        <span className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-extrabold tabular-nums shrink-0",
          dark ? "bg-white/10 text-white/80" : "bg-black/10 text-black/70",
        )}>
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn("flex-1 min-w-0 text-left text-xs font-extrabold truncate", dark ? "text-white" : "text-[#0c1015]")}
          aria-expanded={open}
        >
          {item.productName || "(sin nombre)"}
        </button>
        <span className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wider shrink-0",
          item.source === "linked"
            ? "bg-[var(--accent)]/20 text-[var(--accent)]"
            : dark ? "bg-white/10 text-white/60" : "bg-black/10 text-black/60",
        )}>
          {item.source === "linked" ? "tienda" : "manual"}
        </span>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={cn("h-6 w-6 inline-flex items-center justify-center rounded transition-colors", dark ? "hover:bg-white/10 disabled:opacity-30" : "hover:bg-black/10 disabled:opacity-30")} title="Subir">
          <ArrowUp className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={cn("h-6 w-6 inline-flex items-center justify-center rounded transition-colors", dark ? "hover:bg-white/10 disabled:opacity-30" : "hover:bg-black/10 disabled:opacity-30")} title="Bajar">
          <ArrowDown className="h-3 w-3" />
        </button>
        <button type="button" onClick={onRemove} disabled={total === 1} className={cn("h-6 w-6 inline-flex items-center justify-center rounded transition-colors", dark ? "hover:bg-[var(--data-error)]/20 hover:text-[var(--data-error)] disabled:opacity-30" : "hover:bg-[var(--data-error)]/20 hover:text-[var(--data-error)] disabled:opacity-30")} title="Eliminar">
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
            <ProductPicker
              storeSlug={item.linkedStoreSlug ?? null}
              productId={item.linkedProductId ?? null}
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

          {/* Imagen del producto + drag adjust */}
          <Section title="Imagen del producto">
            <div className={cn("rounded-lg p-2", dark ? "bg-white/5" : "bg-black/5")}>
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
                theme={theme}
              />
            )}
          </Section>

          <Section title="Nombre del producto">
            <input value={item.productName} onChange={(e) => onChange({ productName: e.target.value })} className={STUDIO_INPUT_CLS} />
          </Section>
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
        </div>
      )}
    </div>
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
            ? "border-white/10 bg-white/5 hover:border-white/30"
            : "border-black/10 bg-black/5 hover:border-black/30",
      )}
    >
      <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded shrink-0 mt-0.5",
        active ? "bg-[var(--accent)] text-white" : dark ? "bg-white/10 text-white/70" : "bg-black/10 text-black/60")}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className={cn("text-xs font-extrabold", active ? "text-[var(--accent)]" : dark ? "text-white" : "text-[#0c1015]")}>{label}</p>
        <p className={cn("text-[length:var(--ts-2xs)] leading-snug", dark ? "text-white/50" : "text-black/50")}>{hint}</p>
      </div>
    </button>
  );
}

function ItemImageAdjustMini({ value, onChange, theme }: { value: ImageAdjust; onChange: (a: ImageAdjust) => void; theme: StudioTheme }) {
  const dark = theme === "dark";
  return (
    <div className={cn("mt-2 rounded-lg p-2 border space-y-1.5", dark ? "bg-white/5 border-white/10" : "bg-black/5 border-black/10")}>
      <div className="flex items-center justify-between">
        <span className={cn("text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider", dark ? "text-white/60" : "text-black/60")}>
          Encuadre · X {value.position.x}% · Y {value.position.y}% · Zoom {value.scale}%
        </span>
        <button type="button" onClick={() => onChange(DEFAULT_ADJ)} className={cn("text-[length:var(--ts-2xs)] font-bold hover:text-[var(--accent)]", dark ? "text-white/50" : "text-black/50")}>
          Reset
        </button>
      </div>
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
              className={cn(
                "h-5 rounded transition-colors",
                active ? "bg-[var(--accent)]" : dark ? "bg-white/10 hover:bg-white/25" : "bg-black/10 hover:bg-black/25",
              )}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn("text-[length:var(--ts-2xs)] font-extrabold tabular-nums w-9", dark ? "text-white/60" : "text-black/60")}>Zoom</span>
        <input type="range" min={50} max={250} step={5} value={value.scale} onChange={(e) => onChange({ ...value, scale: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
        <button type="button" onClick={() => onChange({ ...value, fit: value.fit === "cover" ? "contain" : "cover" })}
          className={cn("text-[length:var(--ts-2xs)] font-extrabold uppercase rounded px-1.5 py-0.5",
            dark ? "bg-white/10 text-white/80 hover:bg-white/20" : "bg-black/10 text-black/70 hover:bg-black/20")}>
          {value.fit === "cover" ? "Llenar" : "Contener"}
        </button>
      </div>
    </div>
  );
}

function ProductPicker({
  storeSlug,
  productId,
  onPick,
  theme,
}: {
  storeSlug: string | null;
  productId: string | number | null;
  onPick: (p: { storeSlug: string; productId: number | string; name: string; image: string | null; price: number | null; oldPrice: number | null; href: string }) => void;
  theme: StudioTheme;
}) {
  type StoreOpt = { slug: string; name: string };
  type ProdOpt = { id: number | string; name: string; image: string | null; price: number | null; oldPrice: number | null };
  const dark = theme === "dark";
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [products, setProducts] = useState<ProdOpt[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    setLoadingStores(true);
    fetch("/api/marketplace/stores?limit=50")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stores?: Array<{ slug?: string; tenant?: { slug: string; name: string } }> } | null) => {
        const opts: StoreOpt[] = (d?.stores ?? [])
          .map((s) => ({ slug: s.tenant?.slug ?? s.slug ?? "", name: s.tenant?.name ?? s.slug ?? "" }))
          .filter((s) => !!s.slug);
        setStores(opts);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[ProductPicker] load stores", err);
      })
      .finally(() => setLoadingStores(false));
  }, []);

  useEffect(() => {
    if (!storeSlug) { setProducts([]); return; }
    setLoadingProducts(true);
    fetch(`/api/marketplace/stores/${storeSlug}/products?limit=80`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { products?: Array<{ id: number | string; name?: string; image?: string | null; price?: number | string; salePrice?: number | string; oldPrice?: number | string }> } | null) => {
        const opts: ProdOpt[] = (d?.products ?? []).map((p) => ({
          id: p.id,
          name: p.name ?? "",
          image: p.image ?? null,
          price: numOrNull(p.salePrice ?? p.price),
          oldPrice: numOrNull(p.oldPrice ?? (p.salePrice ? p.price : undefined)),
        }));
        setProducts(opts);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[ProductPicker] load products", err);
      })
      .finally(() => setLoadingProducts(false));
  }, [storeSlug]);

  const handleProductChange = (id: string) => {
    const p = products.find((x) => String(x.id) === id);
    if (!p || !storeSlug) return;
    onPick({
      storeSlug,
      productId: p.id,
      name: p.name,
      image: p.image,
      price: p.price,
      oldPrice: p.oldPrice,
      href: `/t/${storeSlug}/producto/${p.id}`,
    });
  };

  return (
    <div className={cn("rounded-lg p-2.5 border space-y-2", dark ? "bg-[var(--accent)]/[0.08] border-[var(--accent)]/30" : "bg-[var(--accent)]/[0.08] border-[var(--accent)]/30")}>
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
        Pickar del catálogo
      </p>
      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className={cn("block text-[length:var(--ts-2xs)] mb-0.5", dark ? "text-white/60" : "text-black/60")}>Tienda</span>
          <select
            value={storeSlug ?? ""}
            onChange={(e) => onPick({ storeSlug: e.target.value, productId: "", name: "", image: null, price: null, oldPrice: null, href: "" })}
            className={STUDIO_INPUT_CLS}
            disabled={loadingStores}
          >
            <option value="">{loadingStores ? "Cargando…" : "— Elegí una tienda —"}</option>
            {stores.map((s) => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={cn("block text-[length:var(--ts-2xs)] mb-0.5", dark ? "text-white/60" : "text-black/60")}>Producto</span>
          <select
            value={productId !== null ? String(productId) : ""}
            onChange={(e) => handleProductChange(e.target.value)}
            disabled={!storeSlug || loadingProducts}
            className={STUDIO_INPUT_CLS}
          >
            <option value="">
              {!storeSlug ? "— Elegí tienda primero —" : loadingProducts ? "Cargando…" : products.length === 0 ? "Sin productos" : "— Elegí producto —"}
            </option>
            {products.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {p.name}{p.price != null ? ` · S/ ${Number(p.price).toFixed(2)}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={cn("text-[length:var(--ts-2xs)] leading-snug", dark ? "text-white/50" : "text-black/50")}>
        Auto-completa imagen, precio y link al producto. Podés editarlos manualmente abajo después.
      </p>
    </div>
  );
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  return (
    <div className="space-y-3 text-white">
      <Section title="Visibilidad">
        <button
          type="button"
          onClick={() => onPatch({ active: !banner.active })}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold transition-colors",
            banner.active
              ? "bg-[var(--data-success)]/20 text-[var(--data-success)] hover:bg-[var(--data-success)]/30"
              : "bg-[var(--data-warning)]/20 text-[var(--data-warning)] hover:bg-[var(--data-warning)]/30",
          )}
        >
          {banner.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {banner.active ? "Activo · visible al público" : "Oculto · solo visible acá"}
        </button>
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
      <Section title="Identificador interno">
        <code className="block px-2 py-1 rounded bg-white/5 text-[length:var(--ts-2xs)] text-white/50 font-mono">{banner.id}</code>
      </Section>
      <p className="text-[length:var(--ts-2xs)] text-white/50 leading-snug pt-2 border-t border-white/10">
        <Save className="inline h-3 w-3 mr-1" />
        Los cambios se aplican al instante en el editor. No olvides presionar
        <span className="text-white/80 font-extrabold"> Guardar </span>
        en la barra inferior cuando salgas del estudio.
      </p>
    </div>
  );
}

const STATE_BTN_CLS =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-xs font-extrabold text-white/85 transition-all hover:bg-white/[0.12] hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/[0.06] disabled:hover:border-white/10";

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
          ? "bg-[var(--accent)] text-white"
          : theme === "dark"
            ? "bg-white/10 text-white/80 hover:bg-white/20"
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
      <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/40 mr-1.5 hidden lg:inline">
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
        active ? "bg-[var(--accent)] text-white" : "bg-white/5 hover:bg-white/15 text-white/80",
        disabled && "opacity-30 cursor-not-allowed hover:bg-white/5",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="h-6 w-px bg-white/10 mx-1" />;
}

function AnchorGrid({ value, onChange, disabled }: { value: { x: number; y: number }; onChange: (p: { x: number; y: number }) => void; disabled?: boolean }) {
  const points: Array<{ x: number; y: number; title: string }> = [
    { x: 0, y: 0, title: "Sup. izq." }, { x: 50, y: 0, title: "Sup. centro" }, { x: 100, y: 0, title: "Sup. der." },
    { x: 0, y: 50, title: "Med. izq." }, { x: 50, y: 50, title: "Centro" }, { x: 100, y: 50, title: "Med. der." },
    { x: 0, y: 100, title: "Inf. izq." }, { x: 50, y: 100, title: "Inf. centro" }, { x: 100, y: 100, title: "Inf. der." },
  ];
  return (
    <div className="grid grid-cols-3 gap-0.5 p-0.5 bg-white/5 rounded-md">
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
              active ? "bg-[var(--accent)]" : "bg-white/15 hover:bg-white/30",
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
    <div className="flex items-center gap-2 text-white">
      <button type="button" onClick={onPrev} disabled={total <= 1} className={NAV_BTN_CLS}><ChevronLeft className="h-4 w-4" /></button>
      <span className="text-xs font-bold tabular-nums min-w-[44px] text-center">
        {total === 0 ? "—" : `${idx + 1} / ${total}`}
      </span>
      <button type="button" onClick={onNext} disabled={total <= 1} className={NAV_BTN_CLS}><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

const NAV_BTN_CLS =
  "inline-flex items-center justify-center h-8 w-8 rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10";

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
          ? "border-[var(--accent)] text-[var(--accent)] bg-white/5"
          : "border-transparent text-white/60 hover:text-white hover:bg-white/5",
      )}
    >
      {icon}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white/50 mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function NumField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[length:var(--ts-2xs)] text-white/60 mb-0.5">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs font-extrabold text-white tabular-nums focus:border-[var(--accent)] outline-none"
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
        active ? "border-[var(--accent)] bg-[var(--accent)]/15" : "border-white/10 bg-white/5 hover:border-white/30",
      )}
    >
      <p className={cn("text-xs font-extrabold", active ? "text-[var(--accent)]" : "text-white")}>{label}</p>
      <p className="text-[length:var(--ts-2xs)] text-white/50 leading-snug mt-0.5">{hint}</p>
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[length:var(--ts-2xs)] text-white/60 mb-0.5">{label}</span>
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
          className="flex-1 px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-white focus:border-[var(--accent)] outline-none"
        />
      </div>
    </label>
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
