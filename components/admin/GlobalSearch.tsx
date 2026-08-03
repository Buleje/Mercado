"use client";

import { useState, useEffect, useId, useRef, useCallback } from "react";
import { ALL_TABS } from "@/app/admin/_lib/tab-data";
import { ANIDADAS_POR_MODULO, CTP_VISTAS, LOTH_VISTAS, VISTAS_POR_MODULO } from "@/lib/admin/subvistas-modulos";
import {
  Search, X, Package, Users, ShoppingCart, FileText, ShoppingBasket, Tag, AlertTriangle, TrendingUp, Loader2, LayoutDashboard, Monitor, Boxes, Shield, Zap, ArrowRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ResultType =
  | "modulo"
  | "producto"
  | "cliente"
  | "pedido"
  | "accion";

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  tab?: string;
  /** Para módulos: navegar directo al tab */
  navigateTo?: string;
  /** Sub-vista dentro del módulo destino (`?vista=`). */
  vista?: string;
  /** Sub-vista del módulo ANIDADO dentro del destino (ver navigateTab). */
  sub?: string;
  /** Para acciones: callback directo */
  action?: () => void;
  /** Texto original para highlight */
  matchText?: string;
}

interface GroupedResults {
  modulos: SearchResult[];
  productos: SearchResult[];
  clientes: SearchResult[];
  pedidos: SearchResult[];
  acciones: SearchResult[];
}

// ── Índice de módulos ─────────────────────────────────────────────────────────
// Se DERIVA de ALL_TABS (el catálogo que arma el sidebar), no de una lista
// aparte. La lista hardcodeada anterior había quedado vieja: sus 20 entradas
// apuntaban a tabs que ya no existen —pos-caja, crm-clientes,
// inventario-almacenes, precios-promos…— así que el buscador no encontraba
// medio panel y lo que encontraba no llevaba a ningún lado.

interface ModuleEntry {
  tab: string;
  label: string;
  icon: React.ElementType;
  keywords: string[];
  subtabs?: { id: string; label: string; keywords?: string[] }[];
  /** Destinos que además necesitan abrir una vista del hub (ver ANIDADAS_INDEX). */
  anidadas?: { id: string; vista: string; label: string; keywords: string[] }[];
}

/** "Análisis" → "analisis": así "analisis" sin tilde también encuentra. */
function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Sinónimos de negocio que nadie deduce del label ("plata" → dinero, caja…). */
const SINONIMOS: Record<string, string[]> = {
  "vendor-dashboard": ["dashboard", "panel", "resumen", "home"],
  "ventas-caja": ["pos", "punto de venta", "cobrar", "arqueo", "turno", "vender"],
  inventario: ["stock", "almacen", "existencias", "merma", "vencimiento"],
  productos: ["precios", "promos", "ofertas", "descuentos", "catalogo"],
  plata: ["dinero", "finanzas", "gastos", "ingresos", "caja chica", "utilidad"],
  clientes: ["crm", "compradores", "contactos"],
  fiados: ["credito", "deuda", "prestado", "debe"],
  pedidos: ["ordenes", "delivery", "envios"],
  compras: ["proveedores", "abastecimiento", "reposicion"],
  facturacion: ["sunat", "boleta", "factura", "comprobante", "electronica"],
  documentos: ["drive", "archivos", "contratos", "licencias", "papeles"],
  config: ["ajustes", "configuracion", "preferencias"],
  "whatsapp-inbox": ["wa", "mensajes", "chat", "bot"],
  "analytics-pro": ["metricas", "reportes", "bi", "estadisticas"],
  auditoria: ["logs", "actividad", "historial", "seguridad"],
  plan: ["suscripcion", "facturacion buleje", "limites", "upgrade"],
};

/**
 * Sub-vistas buscables por módulo.
 *
 * `subtabs` existía en la interfaz y el buscador ya lo leía, pero NADA lo
 * llenaba: con el Libro CTP (18 vistas) o el de Títulos Habilitantes, la mayor
 * parte de los destinos reales del panel no aparecía al buscar. Se derivan de
 * las MISMAS constantes que dibujan la cabina de cada módulo, así que agregar
 * una vista allá la hace buscable acá sin tocar este archivo.
 *
 * Sólo tiene sentido para módulos cuya vista es direccionable por `?vista=`
 * (los que usan `useVistaModulo`); el resto no tendría a dónde navegar.
 */
const aSubtabs = (vistas: readonly { key: string; label: string; hint: string }[]) =>
  vistas.map((v) => ({
    id: v.key,
    label: v.label,
    keywords: [sinTildes(v.label), ...sinTildes(v.hint).split(/[^a-z0-9]+/).filter((w) => w.length > 3)],
  }));

const SUBTABS_POR_MODULO: Record<string, { id: string; label: string; keywords?: string[] }[]> = {
  "ctp-libro-operaciones": aSubtabs(CTP_VISTAS),
  "loth-libro-operaciones": aSubtabs(LOTH_VISTAS),
  ...Object.fromEntries(Object.entries(VISTAS_POR_MODULO).map(([id, v]) => [id, aSubtabs(v)])),
};

/**
 * Los destinos de segundo nivel, aplanados por módulo. Llevan `vista` además de
 * `id`: el buscador tiene que abrir la vista del hub Y la sub-vista de adentro,
 * o aterriza en la puerta del módulo equivocado.
 */
const ANIDADAS_INDEX: Record<string, { id: string; vista: string; label: string; keywords: string[] }[]> =
  Object.fromEntries(
    Object.entries(ANIDADAS_POR_MODULO).map(([id, vistas]) => [
      id,
      vistas.map((v) => ({
        id: v.key,
        vista: v.vista,
        label: v.label,
        keywords: [sinTildes(v.label), ...sinTildes(v.hint).split(/[^a-z0-9]+/).filter((w) => w.length > 3)],
      })),
    ]),
  );

const MODULE_INDEX: ModuleEntry[] = ALL_TABS.map((t) => {
  const base = sinTildes(t.label).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return {
    tab: t.id as string,
    label: t.label,
    icon: t.icon,
    keywords: [...new Set([...base, ...(SINONIMOS[t.id as string] ?? [])])],
    subtabs: SUBTABS_POR_MODULO[t.id as string],
    anidadas: ANIDADAS_INDEX[t.id as string],
  };
});

// ── Acciones rápidas ──────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  navigateTo: string;
  keywords: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "nuevo-producto",  label: "Nuevo producto",    icon: Package,      navigateTo: "inventario", keywords: ["nuevo producto", "agregar producto", "crear producto"] },
  { id: "nueva-orden",     label: "Nueva orden",       icon: ShoppingCart, navigateTo: "ventas-caja",             keywords: ["nueva orden", "nueva venta", "crear pedido", "nuevo pedido"] },
  { id: "cerrar-caja",     label: "Cerrar caja",       icon: Monitor,      navigateTo: "ventas-caja",             keywords: ["cerrar caja", "arqueo", "cierre turno"] },
  { id: "hacer-backup",    label: "Hacer backup",      icon: Shield,       navigateTo: "auditoria",              keywords: ["backup", "respaldo", "copia seguridad"] },
  { id: "nueva-compra",    label: "Nueva orden compra", icon: ShoppingBasket, navigateTo: "compras",           keywords: ["nueva compra", "orden compra"] },
  { id: "registrar-merma", label: "Registrar merma",   icon: Zap,          navigateTo: "inventario", keywords: ["merma", "pérdida", "registro merma"] },
  { id: "nuevo-cliente",   label: "Nuevo cliente",     icon: Users,        navigateTo: "clientes",         keywords: ["nuevo cliente", "agregar cliente", "crear cliente"] },
  { id: "nuevo-cupon",     label: "Nuevo cupón",       icon: Tag,          navigateTo: "productos",       keywords: ["nuevo cupón", "crear cupón", "descuento"] },
];

// ── Highlight de texto coincidente ───────────────────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Skeleton de carga ─────────────────────────────────────────────────────────

function ResultSkeleton() {
  return (
    <div className="px-4 py-3 space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--rule-soft)] dark:bg-surface shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-[var(--rule-soft)] dark:bg-surface rounded w-2/3" />
            <div className="h-3 bg-[var(--rule-soft)] dark:bg-surface rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Búsqueda local en módulos ─────────────────────────────────────────────────

function searchModules(q: string): SearchResult[] {
  const results: SearchResult[] = [];
  const lower = q.toLowerCase();

  for (const mod of MODULE_INDEX) {
    const labelMatch = mod.label.toLowerCase().includes(lower);
    const kwMatch = mod.keywords.some(k => k.includes(lower));

    if (labelMatch || kwMatch) {
      results.push({
        id: `modulo-${mod.tab}-${mod.label}`,
        type: "modulo",
        title: mod.label,
        subtitle: "Módulo",
        navigateTo: mod.tab,
        tab: mod.tab,
      });
    }

    // Buscar en subtabs
    if (mod.subtabs) {
      for (const sub of mod.subtabs) {
        const subMatch =
          sub.label.toLowerCase().includes(lower) ||
          (sub.keywords ?? []).some(k => k.includes(lower));
        if (subMatch && !labelMatch) {
          results.push({
            id: `subtab-${mod.tab}-${sub.label}`,
            type: "modulo",
            title: sub.label,
            subtitle: `En ${mod.label}`,
            // El destino es el MÓDULO; la vista viaja en la URL (useVistaModulo
            // la lee al montar). Antes se mandaba el id de la sub-vista como si
            // fuera un tab de primer nivel — un destino que no existe.
            navigateTo: mod.tab,
            tab: mod.tab,
            vista: sub.id,
          });
        }
      }
    }

    // Y los de segundo nivel: mismo criterio, pero el destino lleva las DOS
    // coordenadas (la vista del hub y la sub-vista del módulo de adentro).
    if (mod.anidadas) {
      for (const a of mod.anidadas) {
        const match = a.label.toLowerCase().includes(lower) || a.keywords.some((k) => k.includes(lower));
        if (match && !labelMatch) {
          results.push({
            id: `anidada-${mod.tab}-${a.vista}-${a.id}`,
            type: "modulo",
            title: a.label,
            subtitle: `En ${mod.label}`,
            navigateTo: mod.tab,
            tab: mod.tab,
            vista: a.vista,
            sub: a.id,
          });
        }
      }
    }
  }

  return results.slice(0, 5);
}

function searchActions(q: string, onNavigate: (tab: string) => void, onClose: () => void): SearchResult[] {
  const lower = q.toLowerCase();
  return QUICK_ACTIONS
    .filter(a =>
      a.label.toLowerCase().includes(lower) ||
      a.keywords.some(k => k.includes(lower))
    )
    .slice(0, 5)
    .map(a => ({
      id: `accion-${a.id}`,
      type: "accion" as ResultType,
      title: a.label,
      subtitle: "Acción rápida",
      navigateTo: a.navigateTo,
      tab: a.navigateTo,
      action: () => { onNavigate(a.navigateTo); onClose(); },
    }));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onNavigate: (tab: string, vista?: string, sub?: string) => void;
}

// ── Metadatos de grupos ───────────────────────────────────────────────────────

const GROUP_META: Record<keyof GroupedResults, { label: string; icon: React.ElementType; color: string }> = {
  modulos:   { label: "Módulos",         icon: LayoutDashboard, color: "text-primary" },
  productos: { label: "Productos",       icon: Package,         color: "text-[var(--data-success-500)]" },
  clientes:  { label: "Clientes",        icon: Users,           color: "text-[var(--text-secondary)]" },
  pedidos:   { label: "Pedidos",         icon: ShoppingCart,    color: "text-[var(--data-warning-500)]" },
  acciones:  { label: "Acciones rápidas",icon: Zap,             color: "text-[var(--data-success-500)]" },
};

const GROUP_ORDER: (keyof GroupedResults)[] = ["modulos", "productos", "clientes", "pedidos", "acciones"];

// ── Acceso rápido (estado vacío) ──────────────────────────────────────────────

const QUICK_ACCESS = [
  { label: "Nuevo pedido",    tab: "pedidos",              icon: ShoppingCart,   color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
  { label: "Mi stock",        tab: "inventario", icon: Boxes,          color: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 dark:bg-primary/15" },
  { label: "Mis clientes",    tab: "clientes",         icon: Users,          color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
  { label: "Caja",            tab: "ventas-caja",             icon: Monitor,        color: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 dark:bg-primary/15" },
  { label: "Reportes",        tab: "reportes-documentos",  icon: FileText,       color: "text-[var(--text-secondary)] bg-[var(--surface-alt)] dark:bg-surface" },
  { label: "Promociones",     tab: "productos",       icon: TrendingUp,     color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function GlobalSearch({ open, onClose, onOpen, onNavigate }: Props) {
  /** Para atar el diálogo con su título. */
  const idBase = useId();
  const [query, setQuery]       = useState("");
  const [grouped, setGrouped]   = useState<GroupedResults>({ modulos: [], productos: [], clientes: [], pedidos: [], acciones: [] });
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Offset vertical del popover. Estaba fijo en `top-14` (56px), que asume que
  // el header arranca en y=0 — pero arriba puede haber una barra de alertas o
  // el banner de impersonación, así que el popover terminaba TAPANDO el header
  // y su propio botón de búsqueda. Se mide el borde inferior real del header.
  const [anchorTop, setAnchorTop] = useState(56);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const header = document.querySelector<HTMLElement>("[data-admin-header]");
      setAnchorTop(header ? Math.round(header.getBoundingClientRect().bottom + 8) : 56);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // Atajo global Ctrl+K / Cmd+K
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        } else {
          onOpen?.();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [open, onClose, onOpen]);

  // Focus al abrir
  useEffect(() => {
    if (open) {
      setQuery("");
      setGrouped({ modulos: [], productos: [], clientes: [], pedidos: [], acciones: [] });
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Búsqueda combinada
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setGrouped({ modulos: [], productos: [], clientes: [], pedidos: [], acciones: [] });
      return;
    }

    setLoading(true);

    // Búsquedas locales (síncronas) — módulos y acciones
    const modulos  = searchModules(q);
    const acciones = searchActions(q, onNavigate, onClose);

    // Búsquedas remotas en paralelo
    const [apiRes] = await Promise.allSettled([
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then(r => r.ok ? r.json() : { results: [] }),
    ]);

    const apiResults: SearchResult[] = apiRes.status === "fulfilled"
      ? (apiRes.value?.results ?? [])
      : [];

    const productos: SearchResult[] = apiResults
      .filter((r: SearchResult) => r.type === "producto")
      .slice(0, 5);
    const clientes: SearchResult[] = apiResults
      .filter((r: SearchResult) => r.type === "cliente")
      .slice(0, 5);
    const pedidos: SearchResult[] = apiResults
      .filter((r: SearchResult) => r.type === "pedido")
      .slice(0, 5);

    setGrouped({ modulos, productos, clientes, pedidos, acciones });
    setLoading(false);
  }, [onNavigate, onClose]);

  // Debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Lista plana para navegación por teclado
  const flatResults = GROUP_ORDER.flatMap(g => grouped[g]);
  const totalResults = flatResults.length;

  // Navegación por teclado
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, totalResults - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && flatResults[selected]) {
        const r = flatResults[selected];
        if (r.action) { r.action(); }
        else if (r.navigateTo) { onNavigate(r.navigateTo, r.vista, r.sub); onClose(); }
      }
      if (e.key === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flatResults, selected, totalResults]);

  const handleSelect = (r: SearchResult) => {
    if (r.action) { r.action(); }
    else if (r.navigateTo) { onNavigate(r.navigateTo, r.vista, r.sub); onClose(); }
  };

  if (!open) return null;

  const hasResults = totalResults > 0;
  const isSearching = query.trim().length >= 2;

  // Índice global para resaltar selección por teclado
  let globalIdx = 0;

  return (
    <>
      {/* Backdrop transparente — captura click-fuera sin oscurecer la página */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        aria-hidden
      />
      {/* Popover anclado al search button del topbar (top-14 ~ debajo del header
          h-14), alineado a la izquierda con el botón. En mobile ocupa todo el ancho.

          El ancho va en rem EXPLÍCITO, no `max-w-xl`: este repo overridea
          `--container-xl` a 1440px (globals.css :2071), así que `sm:max-w-xl`
          hacía que el popover midiera 1200px —casi toda la pantalla— en vez de
          los ~576px que aparenta. Gotcha del DS: modales y popovers en rem. */}
      <div
        style={{ top: anchorTop }}
        className="fixed left-2 sm:left-12 lg:left-[calc(var(--admin-sidebar-w,260px)+1rem)] right-2 sm:right-auto z-[9999] sm:w-[calc(100vw-3rem)] sm:max-w-[36rem]"
      >
        {/* `role="dialog"` + `aria-modal`: el buscador se comportaba como un
            modal —tapa la página, atrapa Escape, se cierra al click fuera— pero
            no lo DECÍA, así que un lector de pantalla lo leía como un trozo más
            de la página y no anunciaba que se había abierto algo.
            `aria-labelledby` apunta al «Buscar en todo el panel» de adentro, que
            ya existía: no hace falta un título invisible aparte. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${idBase}-titulo`}
          className="bg-[var(--surface-raised)] rounded-2xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] shadow-[var(--shadow-xl)]"
          onClick={e => e.stopPropagation()}
        >
        {/* ── Input de búsqueda — más prominente, h-14, con eyebrow ── */}
        <div className="px-5 pt-4 pb-2 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
          <p
            id={`${idBase}-titulo`}
            className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2"
          >
            Buscar en todo el panel
          </p>
          <div className="flex items-center gap-3">
            {loading
              ? <Loader2 className="h-5 w-5 text-primary shrink-0 animate-spin" />
              : <Search className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted shrink-0" strokeWidth={2} />
            }
            <input
              ref={inputRef}
              type="text"
              placeholder="Módulos, productos, clientes, pedidos, acciones…"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(0); }}
              className="flex-1 bg-transparent text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted placeholder:font-normal outline-none"
            />
            <div className="flex items-center gap-2 shrink-0">
              {query && (
                <button
                  onClick={() => { setQuery(""); setSelected(0); }}
                  className="p-1 rounded-full hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4 text-[var(--text-tertiary)]" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[length:var(--ts-2xs)] font-bold font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                Esc
              </kbd>
            </div>
          </div>
        </div>

        {/* ── Resultados ── */}
        {isSearching && (
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && <ResultSkeleton />}

            {!loading && !hasResults && (
              <div className="flex items-center gap-3 px-4 py-8 text-[var(--text-tertiary)] dark:text-muted text-sm justify-center">
                <AlertTriangle className="h-5 w-5" />
                Sin resultados para &ldquo;{query}&rdquo;
              </div>
            )}

            {!loading && hasResults && GROUP_ORDER.map(groupKey => {
              const items = grouped[groupKey];
              if (items.length === 0) return null;
              const meta = GROUP_META[groupKey];
              const GroupIcon = meta.icon;

              return (
                <div key={groupKey}>
                  {/* Cabecera de grupo — eyebrow uppercase + counter */}
                  <div className="flex items-center justify-between gap-2 px-5 py-2 bg-[var(--surface-sunken)] dark:bg-surface border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                      <GroupIcon className={cn("h-3.5 w-3.5", meta.color)} strokeWidth={2.25} />
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)] dark:text-muted">
                        {meta.label}
                      </span>
                    </div>
                    <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                      {items.length}
                    </span>
                  </div>

                  {items.map(r => {
                    const itemIdx = globalIdx++;
                    const isSelected = itemIdx === selected;
                    const Icon = (() => {
                      if (groupKey === "modulos") {
                        const mod = MODULE_INDEX.find(m => m.tab === r.navigateTo || m.tab === r.tab);
                        return mod?.icon ?? LayoutDashboard;
                      }
                      if (groupKey === "productos") return Package;
                      if (groupKey === "clientes")  return Users;
                      if (groupKey === "pedidos")   return ShoppingCart;
                      const action = QUICK_ACTIONS.find(a => `accion-${a.id}` === r.id);
                      return action?.icon ?? Zap;
                    })();

                    return (
                      <button
                        key={r.id}
                        onClick={() => handleSelect(r)}
                        className={cn(
                          // Separador `--rule-soft`: con `--rule-base` cada fila
                          // quedaba subrayada y la lista se leía como una tabla
                          // rayada en vez de una lista de resultados.
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] last:border-0",
                          isSelected
                            ? "bg-primary/10 ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]"
                            : "hover:bg-[var(--surface-sunken)] dark:hover:bg-surface"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--surface-sunken)] dark:bg-surface",
                          meta.color
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                            <HighlightText text={r.title} query={query} />
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate">{r.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.badge && (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                              // Fallback al token de la superficie fuerte: antes
                              // era el hex #6b7280, que no existe en la paleta.
                              style={{ background: r.badgeColor ?? "var(--rule-strong)" }}
                            >
                              {r.badge}
                            </span>
                          )}
                          {isSelected && (
                            <ArrowRight className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Acceso rápido (estado vacío) ── */}
        {!isSearching && (
          <div className="px-5 py-4">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] dark:text-muted mb-3">
              Acceso rápido
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {QUICK_ACCESS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.tab}
                    onClick={() => { onNavigate(item.tab); onClose(); }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors text-left"
                  >
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", item.color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer — atajos de teclado discretos ── */}
        <div className="px-5 py-2.5 bg-[var(--surface-sunken)] dark:bg-surface border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] dark:text-muted">
            <span className="flex items-center gap-1.5">
              <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold">↵</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold">Esc</kbd>
              cerrar
            </span>
          </div>
          <span className="hidden sm:flex items-center gap-1 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] dark:text-muted">
            <kbd className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] px-1.5 rounded font-mono font-semibold">⌘K</kbd>
            <span>abrir/cerrar</span>
          </span>
        </div>
        </div>
      </div>
    </>
  );
}
