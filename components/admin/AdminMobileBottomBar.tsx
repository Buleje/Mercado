"use client";

/**
 * components/admin/AdminMobileBottomBar.tsx
 *
 * Barra de navegación del celular (sm:hidden): Inicio + las 3 pestañas que
 * esta persona más abre (`lib/admin/barra-inferior.ts`, mismo contador que
 * «Menú en tu orden») + «Menú», que abre el cajón con todo lo demás.
 *
 * 29-10: era siempre Vender / Pedidos / Stock (en el aserradero quedaba Inicio
 * solo) y el botón se llamaba «Más», igual que el «Más ▾» de las pestañas de
 * cada módulo: dos «Más» en la misma pantalla que hacían cosas distintas. El
 * menú ya no vive también arriba (la hamburguesa salió de la cabecera).
 *
 * Cada botón muestra el badge de alertas de su pestaña; «Menú» suma las de
 * las pestañas que no están en la barra.
 */

import { useEffect, useState, type ComponentType } from "react";
import { Menu } from "@buleje/design-system/icons";
import { leerContadorDeUso, useModoOrden } from "@/hooks/use-uso-de-pestanas";
import { etiquetaCorta, pestanasDeLaBarra } from "@/lib/admin/barra-inferior";
import type { ContadorDeUso } from "@/lib/admin/orden-por-uso";
import { cn } from "@/lib/utils";
import type { Tab } from "../../app/admin/_lib/tabs.types";

export interface FilteredTab {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export interface AdminMobileBottomBarProps {
  /** Ya no decide nada (29-10): la barra sale del uso de cada persona. */
  userRole?: string;
  currentTab: Tab;
  filteredTabs: readonly FilteredTab[];
  alerts: Record<string, number>;
  onNavigate: (tab: Tab) => void;
  onOpenMobileNav: () => void;
}

/** Un casillero de la barra de pestañas de abajo (no es un botón del DS: es navegación). */
const CASILLERO =
  "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2.5 text-[length:var(--ts-2xs)] font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]";
const APAGADO = "text-[var(--text-tertiary)] dark:text-muted";

function Contador({ n }: { n: number }) {
  return (
    <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--data-error-500)] px-0.5 text-[length:var(--ts-2xs)] font-extrabold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function AdminMobileBottomBar({
  currentTab,
  filteredTabs,
  alerts,
  onNavigate,
  onOpenMobileNav,
}: AdminMobileBottomBarProps) {
  const modo = useModoOrden();
  /* El contador vive en el navegador: se lee después de montar (el HTML del
     servidor sale con las de siempre) y otra vez al cambiar de pestaña. */
  const [contador, setContador] = useState<ContadorDeUso | null>(null);
  useEffect(() => {
    setContador(leerContadorDeUso());
  }, [currentTab]);

  const ids = pestanasDeLaBarra(
    filteredTabs.map((t) => t.id),
    contador,
    modo === "uso",
  );
  const enBarra = new Set<string>(ids);
  const quickTabs = ids
    .map((id) => filteredTabs.find((t) => t.id === id))
    .filter((t): t is FilteredTab => t != null);
  const alertasDelMenu = filteredTabs.reduce((s, t) => s + (enBarra.has(t.id) ? 0 : alerts[t.id] ?? 0), 0);
  const desdeElMenu = !enBarra.has(currentTab);

  return (
    // Audit 2026-05-17 07-P2-2: touch targets ≥48px (WCAG 2.1 AA pide ≥44).
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface-raised)] border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] flex items-stretch"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      aria-label="Navegación rápida"
    >
      {quickTabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onNavigate(id)}
          className={cn(CASILLERO, currentTab === id ? "text-primary" : APAGADO)}
          aria-current={currentTab === id ? "page" : undefined}
          title={label}
        >
          <span className="relative inline-flex">
            <Icon className="h-5 w-5" />
            {alerts[id] ? <Contador n={alerts[id]} /> : null}
          </span>
          <span className="max-w-full truncate leading-tight">{etiquetaCorta(id, label)}</span>
          {currentTab === id && <span className="absolute top-0 inset-x-0 h-0.5 bg-primary" />}
        </button>
      ))}

      {/* «Menú»: el cajón con todos los módulos. Se ve encendido cuando estás en
          uno que no está en la barra (para saber de dónde vino). */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        className={cn(CASILLERO, desdeElMenu ? "text-primary" : APAGADO)}
        aria-label={`Menú: todos los módulos${alertasDelMenu > 0 ? `, ${alertasDelMenu} avisos` : ""}`}
        aria-haspopup="dialog"
      >
        <span className="relative inline-flex">
          <Menu className="h-5 w-5" />
          {alertasDelMenu > 0 && <Contador n={alertasDelMenu} />}
        </span>
        <span className="leading-tight">Menú</span>
        {desdeElMenu && <span className="absolute top-0 inset-x-0 h-0.5 bg-primary/40" />}
      </button>
    </nav>
  );
}
