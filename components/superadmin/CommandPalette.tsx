"use client";

/**
 * components/superadmin/CommandPalette.tsx
 *
 * Global Ctrl+K / Cmd+K command palette para el superadmin.
 * Búsqueda fuzzy sobre páginas del shell, items comunes y acciones rápidas.
 *
 * Uso:
 *   1. Usuario presiona Ctrl+K (o Cmd+K en mac)
 *   2. Se abre modal con input y lista de resultados
 *   3. Arrow keys para navegar, Enter para ejecutar, Esc para cerrar
 *
 * Se monta una sola vez en SuperAdminShell y gestiona su propio estado.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Gauge,
  Building2,
  ShoppingBag,
  BarChart3,
  HeartPulse,
  Wrench,
  Activity,
  Settings,
  Moon,
  Sun,
  LogOut,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ─── Command definition ─────────────────────────────────────────────────────

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  category: "navegación" | "acciones";
  keywords?: string[];
  /** href O action, no ambos */
  href?: string;
  action?: () => void;
}

const NAV_COMMANDS: Command[] = [
  { id: "nav-dashboard",       label: "Dashboard",          icon: LayoutDashboard, category: "navegación", href: "/superadmin/dashboard",      keywords: ["home", "inicio"] },
  { id: "nav-control",         label: "Centro de Control",  icon: Gauge,           category: "navegación", href: "/superadmin/control-center", keywords: ["panel", "control"] },
  { id: "nav-tenants",         label: "Tiendas",            icon: Building2,       category: "navegación", href: "/superadmin/tenants",        keywords: ["clientes", "empresas", "tenants"] },
  { id: "nav-marketplace",     label: "Marketplace (hub)",  icon: ShoppingBag,     category: "navegación", href: "/superadmin/marketplace",                  keywords: ["mercado", "vendor", "multi-tienda"] },
  { id: "nav-mkt-suppliers",   label: "Marketplace · Proveedores", icon: ShoppingBag, category: "navegación", href: "/superadmin/marketplace/suppliers",   keywords: ["proveedor", "supplier", "aplicacion", "aprobacion"] },
  { id: "nav-mkt-cat-images",  label: "Marketplace · Imágenes de categorías", icon: ShoppingBag, category: "navegación", href: "/superadmin/marketplace/category-images", keywords: ["categoria", "imagen", "foto", "marketplace grid"] },
  { id: "nav-stores",          label: "Tiendas publicadas", icon: ShoppingBag,     category: "navegación", href: "/superadmin/stores",         keywords: ["tiendas", "mercado"] },
  { id: "nav-analytics",       label: "Analytics",          icon: BarChart3,       category: "navegación", href: "/superadmin/analytics",      keywords: ["reportes", "metricas", "kpi"] },
  { id: "nav-health",          label: "Salud del Sistema",  icon: HeartPulse,      category: "navegación", href: "/superadmin/health",         keywords: ["estado", "monitoreo"] },
  // Brandon 2026-05-21 audit fix #4: "Setup Pendiente" eliminado (redirect a dashboard).
  { id: "nav-activity",        label: "Actividad",          icon: Activity,        category: "navegación", href: "/superadmin/activity",       keywords: ["log", "historial"] },
  { id: "nav-settings",        label: "Config",             icon: Settings,        category: "navegación", href: "/superadmin/settings",       keywords: ["ajustes", "preferencias"] },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  onToggleTheme?: () => void;
  currentTheme?: "light" | "dark";
  onLogout?: () => void;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function CommandPalette({
  onToggleTheme,
  currentTheme = "light",
  onLogout,
}: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Action commands (depend on props) ────────────────────────────────────
  const actionCommands: Command[] = useMemo(() => {
    const cmds: Command[] = [];
    if (onToggleTheme) {
      cmds.push({
        id: "action-theme",
        label: currentTheme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
        icon: currentTheme === "dark" ? Sun : Moon,
        category: "acciones",
        keywords: ["tema", "dark", "light", "oscuro", "claro"],
        action: onToggleTheme,
      });
    }
    if (onLogout) {
      cmds.push({
        id: "action-logout",
        label: "Cerrar sesión",
        icon: LogOut,
        category: "acciones",
        keywords: ["salir", "logout", "exit"],
        action: onLogout,
      });
    }
    return cmds;
  }, [onToggleTheme, currentTheme, onLogout]);

  const allCommands = useMemo(() => [...NAV_COMMANDS, ...actionCommands], [actionCommands]);

  // ── Filtered commands ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter((cmd) => {
      const hay = [
        cmd.label.toLowerCase(),
        cmd.description?.toLowerCase() ?? "",
        cmd.category.toLowerCase(),
        ...(cmd.keywords ?? []).map((k) => k.toLowerCase()),
      ].join(" ");
      return hay.includes(q);
    });
  }, [query, allCommands]);

  // ── Keyboard handler: Ctrl+K / Cmd+K to open ────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // ── Focus input when opening ────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      // Small delay for the modal animation
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── Reset selectedIndex when filter changes ─────────────────────────────
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // ── Execute a command ───────────────────────────────────────────────────
  const executeCommand = useCallback(
    (cmd: Command) => {
      setOpen(false);
      setQuery("");
      if (cmd.href) {
        router.push(cmd.href);
      } else if (cmd.action) {
        cmd.action();
      }
    },
    [router],
  );

  // ── Arrow keys + Enter on input ─────────────────────────────────────────
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) executeCommand(filtered[selectedIndex]);
    }
  };

  // ── Group by category for rendering ─────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: Record<Command["category"], Command[]> = {
      "navegación": [],
      "acciones": [],
    };
    filtered.forEach((cmd) => groups[cmd.category].push(cmd));
    return groups;
  }, [filtered]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (!open) return null;

  // Compute flat index to know which item is selected across groups
  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center pt-20 px-4"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl w-full max-w-2xl shadow-[var(--shadow-xl)] overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--rule-base)]">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Buscar página o acción... (Ctrl+K)"
            className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder-gray-400"
          />
          <kbd className="text-[length:var(--ts-2xs)] font-mono bg-[var(--surface-sunken)] text-gray-500 px-1.5 py-0.5 rounded border border-[var(--rule-base)]">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">
              Sin resultados para &quot;{query}&quot;
            </div>
          )}
          {(["navegación", "acciones"] as const).map((category) => {
            const cmds = grouped[category];
            if (cmds.length === 0) return null;
            return (
              <div key={category} className="py-1">
                <div className="px-4 py-1 text-[length:var(--ts-2xs)] uppercase tracking-wide font-bold text-[var(--text-tertiary)]">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  flatIdx++;
                  const isSelected = flatIdx === selectedIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                      className={[
                        "w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors",
                        isSelected
                          ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                      ].join(" ")}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium flex-1">{cmd.label}</span>
                      {isSelected && (
                        <kbd className="text-[length:var(--ts-2xs)] font-mono bg-[var(--surface-raised)] text-gray-500 px-1.5 py-0.5 rounded border border-[var(--rule-base)]">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--rule-base)] text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1">
            <kbd className="font-mono bg-[var(--surface-sunken)] px-1 py-0.5 rounded border border-[var(--rule-base)]">↑↓</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="font-mono bg-[var(--surface-sunken)] px-1 py-0.5 rounded border border-[var(--rule-base)]">↵</kbd>
            seleccionar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="font-mono bg-[var(--surface-sunken)] px-1 py-0.5 rounded border border-[var(--rule-base)]">Esc</kbd>
            cerrar
          </span>
          <span className="ml-auto">
            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
          </span>
        </div>
      </div>
    </div>
  );
}
