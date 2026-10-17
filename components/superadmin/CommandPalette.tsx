"use client";

/**
 * components/superadmin/CommandPalette.tsx
 *
 * Ctrl+K / Cmd+K del superadmin: TODAS las pantallas (fuente única en
 * `command-palette-pantallas.ts`), los negocios por nombre, código, correo,
 * teléfono o RUC (ficha 360 + chat) y acciones rápidas. SUPMKT-4, 2026-10-09.
 *
 * Flechas para moverte, Enter para ir, Esc para cerrar. Se monta una sola
 * vez en SuperAdminShell y gestiona su propio estado.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Building2,
  MessageSquare,
  Moon,
  Sun,
  LogOut,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { buscarPantallas } from "./command-palette-pantallas";
import { usePaletteNegocios } from "./use-palette-negocios";

// ─── Command definition ─────────────────────────────────────────────────────

type Categoria = "negocios" | "pantallas" | "acciones";

const CATEGORIAS: { id: Categoria; label: string }[] = [
  { id: "negocios", label: "Negocios" },
  { id: "pantallas", label: "Pantallas" },
  { id: "acciones", label: "Acciones" },
];

interface Command {
  id: string;
  label: string;
  /** Módulo o qué abre (se muestra a la derecha). */
  description?: string;
  icon: LucideIcon;
  category: Categoria;
  keywords?: string[];
  /** href O action, no ambos */
  href?: string;
  action?: () => void;
}

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

  const negocios = usePaletteNegocios(open, query);

  // ── Filtered commands (en el orden en que se dibujan: el índice de flechas lo usa) ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const deNegocios: Command[] = negocios.encontrados.flatMap((n) => [
      { id: `neg-${n.id}`, label: n.name, description: "Ficha 360", icon: Building2, category: "negocios" as const, href: `/superadmin/tenants/${encodeURIComponent(n.slug)}` },
      { id: `neg-chat-${n.id}`, label: `Chatear con ${n.name}`, description: "Chat", icon: MessageSquare, category: "negocios" as const, href: `/superadmin/chat?tenant=${encodeURIComponent(n.id)}&name=${encodeURIComponent(n.name)}` },
    ]);
    const pantallas: Command[] = buscarPantallas(query).map((p) => ({
      id: `nav-${p.href}`, label: p.label, description: p.grupo, icon: p.icon, category: "pantallas", href: p.href,
    }));
    const acciones = q
      ? actionCommands.filter((cmd) => [cmd.label, ...(cmd.keywords ?? [])].join(" ").toLowerCase().includes(q))
      : actionCommands;
    return [...deNegocios, ...pantallas, ...acciones];
  }, [query, negocios.encontrados, actionCommands]);

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
    // Permite abrirlo programáticamente (botón "Buscar módulos" del sidebar).
    const openHandler = () => {
      setOpen(true);
      setQuery("");
      setSelectedIndex(0);
    };
    window.addEventListener("superadmin:open-command-palette", openHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("superadmin:open-command-palette", openHandler);
    };
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
    const groups: Record<Categoria, Command[]> = { negocios: [], pantallas: [], acciones: [] };
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
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl w-full max-w-2xl shadow-[var(--shadow-xl)] overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--rule-base)]">
          <Search className="w-5 h-5 text-[var(--text-tertiary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Busca una pantalla o un negocio (nombre, teléfono, RUC)…"
            aria-label="Buscar pantallas, negocios o acciones"
            className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <kbd className="text-[length:var(--ts-2xs)] font-mono bg-[var(--surface-sunken)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded border border-[var(--rule-base)]">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {query.trim().length >= 2 && negocios.cargando && (
            <div className="px-4 py-2 text-xs text-[var(--text-tertiary)]">Buscando negocios…</div>
          )}
          {query.trim().length >= 2 && negocios.error && (
            <div className="px-4 py-2 text-xs text-[var(--data-error)]">No pudimos cargar los negocios; cierra y vuelve a abrir.</div>
          )}
          {filtered.length === 0 && !negocios.cargando && (
            <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">
              Sin resultados para &quot;{query}&quot;
            </div>
          )}
          {CATEGORIAS.map(({ id: category, label: titulo }) => {
            const cmds = grouped[category];
            if (cmds.length === 0) return null;
            return (
              <div key={category} className="py-1">
                <div className="px-4 py-1 text-[length:var(--ts-2xs)] uppercase tracking-wide font-bold text-[var(--text-tertiary)]">
                  {titulo}
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
                      <span className="text-sm font-medium flex-1 min-w-0 truncate">{cmd.label}</span>
                      {cmd.description && (
                        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{cmd.description}</span>
                      )}
                      {isSelected && (
                        <kbd className="text-[length:var(--ts-2xs)] font-mono bg-[var(--surface-raised)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded border border-[var(--rule-base)]">
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
          {([["↑↓", "navegar"], ["↵", "seleccionar"], ["Esc", "cerrar"]] as const).map(([tecla, que]) => (
            <span key={que} className="flex items-center gap-1">
              <kbd className="font-mono bg-[var(--surface-sunken)] px-1 py-0.5 rounded border border-[var(--rule-base)]">{tecla}</kbd>
              {que}
            </span>
          ))}
          <span className="ml-auto">
            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
          </span>
        </div>
      </div>
    </div>
  );
}
