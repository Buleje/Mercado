"use client";

/**
 * Compras (`?tab=compras`): 7 vistas (plan «panel unificado», ola 3).
 *
 *   Comprar ← punto-compra · Órdenes y recepción ← ordenes-compra + recepcion
 *   (2.ª sección «Recibir», con o sin orden) · Sugerencias ← sugerencias +
 *   Predicción (reorden) + Sugerencias IA › Compras: UN solo «qué reponer» ·
 *   Proveedores ← proveedores + comparador (2.ª sección «Comparar», con los
 *   precios del mercado) · Por pagar ← cuentas-por-pagar (casa única de
 *   PayablesTab; Comprobantes y Mi Plata enlazan acá) · Devoluciones ·
 *   Dropship ← dropship (sólo donde dropship se ve: rubro y plan, por origen).
 *
 * Gastos fijos e Historial de gastos se mudaron a Mi Plata › Gastos y
 * presupuesto: Comprar deja el enlace y `?vista=historial-gastos` llega allá
 * (VISTA_MIGRATION). Cada vista declara su `origen` en
 * `lib/admin/subvistas-modulos.ts` (regla R2) y `useVistasPermitidas` ofrece
 * sólo las que esta persona veía antes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Lightbulb, ClipboardList, Users, PackagePlus, ShoppingBasket, RotateCcw, CreditCard, Truck,
} from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { useVistaModulo, type AliasDeVista } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const PuntoCompraView = dynamic(() => import("@/components/admin/pos/PuntoCompraView"), { loading: S });
const OrdenesYRecepcion = dynamic(() => import("@/components/admin/compras/OrdenesYRecepcion"), { loading: S });
const SugerenciasVista = dynamic(() => import("@/components/admin/compras/SugerenciasVista"), { loading: S });
const ProveedoresVista = dynamic(() => import("@/components/admin/compras/ProveedoresVista"), { loading: S });
/* La cabecera prometía «cuentas por pagar» y ninguna sub-vista las mostraba:
   vivían sólo en Facturación (09-10). Desde la ola 3 ésta es su casa única. */
const PayablesTab = dynamic(() => import("@/components/admin/PayablesTab"), { loading: S });
const DevolucionesProveedorModule = dynamic(() => import("@/components/admin/DevolucionesProveedorModule"), { loading: S });
const DropshipModule = dynamic(() => import("@/components/admin/unified/DropshipModule"), { loading: S });

const MODULE_ID = "compras";

/* `shortLabel` (10-10): «Órdenes y recepción» medía 181 px, casi dos pestañas;
   con «Órdenes» las 7 entran en una fila a 1280 (con la de Dropship) y el
   título y las pestañas comparten la banda desde 1440. El nombre entero sigue
   en el `title` de la pestaña y en el buscador del panel. */
const TABS: AdminTab[] = [
  { id: "punto-compra", label: "Comprar", icon: ShoppingBasket },
  { id: "ordenes-compra", label: "Órdenes y recepción", shortLabel: "Órdenes", icon: ClipboardList },
  { id: "sugerencias", label: "Sugerencias", icon: Lightbulb },
  { id: "proveedores", label: "Proveedores", icon: Users },
  { id: "cuentas-por-pagar", label: "Por pagar", icon: CreditCard },
  { id: "devoluciones", label: "Devoluciones", icon: RotateCcw },
  { id: "dropship", label: "Dropship", icon: Truck },
];

/** Vistas que se fundieron en otra: un link guardado o la memoria del navegador siguen llegando. */
const ALIAS: AliasDeVista<string> = { recepcion: "ordenes-compra", comparador: "proveedores" };

/** La sección de la vista que abre cada nombre viejo (o la lista, si vas a la vista). */
const SECCION_AL_IR: Readonly<Record<string, { vista: string; sub: string }>> = {
  "ordenes-compra": { vista: "ordenes-compra", sub: "ordenes" },
  recepcion: { vista: "ordenes-compra", sub: "recibir" },
  comparador: { vista: "proveedores", sub: "comparar" },
};

/**
 * La sección que pide un nombre viejo al abrir (`?vista=recepcion` → Órdenes y
 * recepción › Recibir). Se lee ANTES que `useVistaModulo`, que reescribe la URL
 * con el nombre de hoy: la vista de adentro carga después y ya no lo vería.
 */
function seccionPorNombreViejo(initialTab?: string): { vista: string; sub: string } | undefined {
  if (typeof window === "undefined") return undefined;
  const pedida = new URLSearchParams(window.location.search).get("vista") ?? initialTab;
  return pedida && Object.hasOwn(ALIAS, pedida) ? SECCION_AL_IR[pedida] : undefined;
}

/** Cuánto se espera al rol antes de abrir igual (sin las vistas que dependen de él). */
const ESPERA_DEL_ROL_MS = 4000;

export default function ComprasModule({ initialTab }: { initialTab?: string } = {}) {
  /* Dropship llegó de otra pestaña: depende del rol (R2) y `useVistaModulo`
     valida la vista de la URL UNA vez, al montar. Sin esperar al rol,
     `?tab=dropship` caía en Comprar. */
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);
  if (!rolListo && !rolTarde) return <LoadingState message="Cargando Compras..." />;
  return <ComprasConVistas initialTab={initialTab} />;
}

/** `true` cuando `esperando` lleva `ms` sin resolverse. */
function useEsperaVencida(esperando: boolean, ms: number): boolean {
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setVencida(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return vencida;
}

function ComprasConVistas({ initialTab }: { initialTab?: string }) {
  const vistas = useVistasPermitidas(MODULE_ID, TABS);
  const ids = useMemo(() => vistas.map((v) => v.id), [vistas]);

  // La sub-vista vive en `?vista=`: link compartible, atrás del navegador y
  // destino del buscador global. `initialTab` gana cuando el módulo se abre
  // desde un tab alias (ver useVistaModulo). La orden y el proveedor abiertos
  // (`?oc=`, `?proveedor=`), la sección (`?sub=`) y el filtro de Comprar
  // (`?reponer=1`) son de UNA vista: se borran al salir.
  const [entrada, setEntrada] = useState(() => seccionPorNombreViejo(initialTab));
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, ids, ids[0] ?? "punto-compra", initialTab, {
    paramsDeVista: { "punto-compra": ["reponer"], "ordenes-compra": ["oc", "sub"], proveedores: ["proveedor", "sub"] },
    alias: ALIAS,
  });
  // La sección del nombre viejo vale sólo para la primera vista: al salir, se olvida.
  useEffect(() => {
    if (entrada && sub !== entrada.vista) setEntrada(undefined);
  }, [sub, entrada]);
  const seccionDe = (vista: string) => (entrada?.vista === vista ? entrada.sub : undefined);

  /** Ir a una vista; si nombra una sección (o es un nombre viejo), abrirla en esa sección. */
  const irAVista = useCallback(
    (id: string) => {
      const conSeccion = SECCION_AL_IR[id];
      if (conSeccion) setSub(conSeccion.vista, { sub: conSeccion.sub });
      else setSub(id);
    },
    [setSub],
  );

  // Escuchar navegación desde adentro: «Ver en Órdenes» del Punto de Compra,
  // el aviso de crédito de una recepción (Por pagar, Devoluciones).
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail;
      if (typeof tabId === "string" && (TABS.some((t) => t.id === tabId) || tabId in SECCION_AL_IR)) irAVista(tabId);
    };
    window.addEventListener("compras-navigate-tab", handler);
    return () => window.removeEventListener("compras-navigate-tab", handler);
  }, [irAVista]);

  // Pre-fetch de products + suppliers al montar el módulo Compras —
  // así cuando el usuario entra a Punto de Compra/Sugerencias/Proveedores
  // los datos ya están cacheados (warmup en background, no bloquea render).
  useEffect(() => {
    const logFail = (ctx: string) => (err: unknown) =>
      console.warn(`[compras-prefetch] ${ctx} failed`, err instanceof Error ? err.message : String(err));
    void Promise.allSettled([
      fetch("/api/products").then(r => r.ok ? r.json() : null).then(json => {
        if (!json) return;
        const raw = Array.isArray(json) ? json : json.products ?? [];
        const filtered = raw.filter((p: { active?: boolean }) => p.active !== false);
        try { localStorage.setItem("poc-products-cache", JSON.stringify({ data: filtered, ts: Date.now() })); } catch { /* quota */ }
      }).catch(logFail("products")),
      fetch("/api/suppliers").then(r => r.ok ? r.json() : null).then(json => {
        if (!json) return;
        const raw = json.suppliers ?? (Array.isArray(json) ? json : []);
        try { localStorage.setItem("poc-suppliers-cache", JSON.stringify({ data: raw, ts: Date.now() })); } catch { /* quota */ }
      }).catch(logFail("suppliers")),
    ]);
  }, []);

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla. */}
      <AdminTabBar
        heading={{ title: "Compras", description: "Comprar, órdenes y recepción, qué reponer, proveedores, lo que debes y devoluciones.", icon: PackagePlus }}
        tabs={vistas}
        activeTab={sub}
        onTabChange={setSub}
        moduleId="compras"
      >
        {sub === "punto-compra" && <PuntoCompraView />}
        {sub === "ordenes-compra" && <OrdenesYRecepcion seccionInicial={seccionDe("ordenes-compra")} />}
        {sub === "sugerencias" && <SugerenciasVista />}
        {sub === "proveedores" && (
          <ProveedoresVista
            seccionInicial={seccionDe("proveedores")}
            onCrearOC={(supplier) => {
              // "Crear OC" desde el comparador → llevar al flujo de Nueva Orden
              // con el proveedor preseleccionado (una OC necesita productos; no
              // se crea vacía por API). PurchaseOrdersTab lee este stash al montar.
              try { localStorage.setItem("bsm-new-oc-supplier", JSON.stringify(supplier)); } catch { /* quota */ }
              irAVista("ordenes-compra");
            }}
          />
        )}
        {sub === "cuentas-por-pagar" && <PayablesTab />}
        {sub === "devoluciones" && <DevolucionesProveedorModule />}
        {sub === "dropship" && <DropshipModule enCompras />}
      </AdminTabBar>
    </div>
  );
}
