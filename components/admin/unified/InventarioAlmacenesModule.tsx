"use client";

/**
 * Productos e inventario (`?tab=inventario`).
 *
 * Plan «panel unificado», ola 3 (2026-10-10): Inventario absorbe la pestaña
 * Productos (catálogo) y el Conteo físico, que era un modal. Ocho vistas en
 * `?vista=`; cada una se monta tal cual estaba (R5), con sus endpoints de
 * siempre:
 *   stock · kardex · lotes · mermas ← inventario
 *   conteo ← los 3 modales de conteo (Asistente | Manual | Escáner en `?sub=`)
 *   categorias · precios ← productos
 *   ofertas ← productos (ofertas y cupones) + marketplace (sus cupones)
 * Qué vista ve cada quien lo decide su ORIGEN (R2, `useVistasPermitidas`):
 * Productos es plan Básico e Inventario Pro, así que un negocio Básico sigue
 * viendo Categorías, Precios y Ofertas y cupones.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeftRight, BadgePercent, Boxes, CalendarClock, ClipboardCheck, FileSignature, FolderTree,
  LineChart, ListChecks, Package, Printer, TrendingDown,
} from "@buleje/design-system/icons";
import { useVistaModulo, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import type { ModuleActionItem } from "@/components/admin/shared/ModuleActionMenu";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const InventoryTab = dynamic(() => import("@/components/admin/InventoryTab"), { loading: S });
const SimpleMovementsTab = dynamic(() => import("@/components/admin/inventario/SimpleMovementsTab"), { loading: S });
const SimpleExpiryTab = dynamic(() => import("@/components/admin/inventario/SimpleExpiryTab"), { loading: S });
// Mermas/Pérdidas: ShrinkageTab estaba huérfano (0 imports) y roto contra /api/mermas
// (GET paginado, cause↔lossType, registeredBy). Reparado + montado. Brandon 2026-06-20.
const ShrinkageTab = dynamic(() => import("@/components/admin/ShrinkageTab"), { loading: S });
const ConteoFisicoVista = dynamic(() => import("@/components/admin/inventario/ConteoFisicoVista"), { loading: S });
const CategoriesEditorTab = dynamic(() => import("@/components/admin/CategoriesEditorTab"), { loading: S });
const PreciosVista = dynamic(() => import("@/components/admin/inventario/PreciosVista"), { loading: S });
const OfertasYCuponesVista = dynamic(() => import("@/components/admin/inventario/OfertasYCuponesVista"), { loading: S });
const DeclaracionInventarioModule = dynamic(() => import("@/components/admin/DeclaracionInventarioModule"), { loading: S });
const DemandForecast = dynamic(() => import("@/components/admin/inventario/DemandForecast"), { loading: S });
const EtiquetasPrecio = dynamic(() => import("@/components/admin/inventario/EtiquetasPrecio"));

const MODULE_ID = "inventario";

const TABS = [
  { id: "stock" as const, label: "Productos y stock", icon: Package },
  { id: "kardex" as const, label: "Entradas y salidas", icon: ArrowLeftRight },
  { id: "lotes" as const, label: "Vencimientos", icon: CalendarClock },
  { id: "mermas" as const, label: "Pérdidas", icon: TrendingDown },
  { id: "conteo" as const, label: "Conteo físico", icon: ClipboardCheck },
  { id: "categorias" as const, label: "Categorías", icon: FolderTree },
  { id: "precios" as const, label: "Precios", icon: LineChart },
  { id: "ofertas" as const, label: "Ofertas y cupones", icon: BadgePercent },
];
type Vista = (typeof TABS)[number]["id"];

/** Al dejar Conteo físico u Ofertas y cupones, su `?sub=` no viaja a la vista siguiente. */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { conteo: ["sub"], ofertas: ["sub"] };

/** Cuánto se espera al rol antes de abrir igual (con las vistas propias del hub). */
const ESPERA_DEL_ROL_MS = 4000;

export default function InventarioAlmacenesModule({ initialTab }: { initialTab?: string } = {}) {
  /* Categorías, Precios y Ofertas llegaron de `productos` (Básico) y el resto es
     de Inventario (Pro): qué vistas se ven depende del plan, la plantilla y el
     rol (R2), y `useVistaModulo` valida la vista UNA vez, al montar. Sin esperar
     al rol, `?tab=productos` (alias a `&vista=categorias`) abría Stock. */
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);
  if (!rolListo && !rolTarde) return <S />;
  return <HubInventario initialTab={initialTab} />;
}

function useEsperaVencida(esperando: boolean, ms: number): boolean {
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setVencida(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return vencida;
}

function HubInventario({ initialTab }: { initialTab?: string }) {
  const tabs = useVistasPermitidas(MODULE_ID, TABS);
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  // La sub-vista vive en `?vista=`: link compartible, atrás del navegador y
  // destino del buscador global. `initialTab` gana cuando el módulo se abre
  // desde un tab alias (ver useVistaModulo).
  const { vista: pedida, irA } = useVistaModulo<Vista>(MODULE_ID, tabIds, tabIds[0] ?? "stock", initialTab, {
    paramsDeVista: PARAMS_DE_VISTA,
  });
  // Si el permiso cambió con el módulo abierto, nunca se dibuja una vista vedada.
  const vista: Vista = tabIds.includes(pedida) ? pedida : (tabIds[0] ?? "stock");

  const [verDeclaracion, setVerDeclaracion] = useState(false);
  const [verEtiquetas, setVerEtiquetas] = useState(false);
  const [forecastProductId, setForecastProductId] = useState<number | null>(null);

  // Auto-refresh: increment key to force child remount/re-fetch
  const [refreshKey, setRefreshKey] = useState(0);
  const { paused, togglePause, secondsLeft, refreshNow, isActive } = useAutoRefresh({
    intervalSeconds: 300,
    onRefresh: () => setRefreshKey((k) => k + 1),
    enabled: vista === "stock",
  });

  // Exposed for InventoryTab: open forecast for a product
  // This is set via a global callback so InventoryTab can trigger it
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__openForecast = (productId: number) => {
      setForecastProductId(productId);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__openForecast;
    };
  }, []);

  /* Lo que «Más acciones» de Productos y stock suma a las suyas. El Conteo
     físico ya es una vista: el ítem queda como atajo (R6, el lugar viejo deja
     enlace). Etiquetas era un botón suelto en la cabecera. */
  const accionesStock: ModuleActionItem[] = [
    ...(tabIds.includes("conteo")
      ? [{ label: "Conteo físico", icon: ListChecks, onClick: () => irA("conteo"), description: "Contar y conciliar el stock real" }]
      : []),
    {
      label: "Generar declaración",
      icon: FileSignature,
      onClick: () => setVerDeclaracion(true),
      description: "Declaración jurada de inventario",
    },
    {
      label: "Imprimir etiquetas",
      icon: Printer,
      onClick: () => setVerEtiquetas(true),
      description: "Etiquetas de precio en A4 para tus anaqueles",
    },
  ];

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07): identidad a la izquierda, pestañas a la derecha,
          una sola regla; las acciones del módulo, en la misma banda. */}
      <AdminTabBar
        heading={{
          title: "Productos e inventario",
          description:
            "Tus productos con su stock, las entradas y salidas, vencimientos, pérdidas y el conteo físico; además sus categorías, el historial de precios y las ofertas y cupones.",
          icon: Boxes,
          actions:
            vista === "stock" ? (
              <AutoRefreshControl
                secondsLeft={secondsLeft}
                paused={paused}
                isActive={isActive}
                onTogglePause={togglePause}
                onRefreshNow={refreshNow}
              />
            ) : undefined,
        }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={irA}
        moduleId={MODULE_ID}
      >
        {vista === "stock" && (
          <div key={refreshKey} className="space-y-6">
            <InventoryTab headerActions={accionesStock} />
          </div>
        )}
        {vista === "kardex" && <SimpleMovementsTab />}
        {vista === "lotes" && <SimpleExpiryTab />}
        {vista === "mermas" && <ShrinkageTab />}
        {vista === "conteo" && <ConteoFisicoVista onDeclaracion={() => setVerDeclaracion(true)} />}
        {vista === "categorias" && <CategoriesEditorTab />}
        {vista === "precios" && <PreciosVista />}
        {vista === "ofertas" && <OfertasYCuponesVista />}
      </AdminTabBar>

      {/* La declaración jurada: salida del conteo físico y atajo de Productos y stock. */}
      <AdminModal
        open={verDeclaracion}
        onClose={() => setVerDeclaracion(false)}
        title="Declaración de inventario"
        icon={FileSignature}
        variant="info"
      >
        <div className={MODAL_BODY}>{verDeclaracion && <DeclaracionInventarioModule />}</div>
      </AdminModal>

      {/* Siempre montada (pide sus productos al abrirse): desmontarla al cerrar
          cortaba el cierre de Radix y el foco caía al inicio de la página. */}
      <EtiquetasPrecio open={verEtiquetas} onClose={() => setVerEtiquetas(false)} />

      {/* ── Demand Forecast Modal ── */}
      {forecastProductId !== null && (
        <div className="modal-backdrop p-4">
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <DemandForecast productId={forecastProductId} onClose={() => setForecastProductId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
