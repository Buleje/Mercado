"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ShoppingCart, Wallet, Scale, HandCoins, Clock, Users } from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { cn } from "@/lib/utils";

const MODULE_ID = "ventas-caja";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const POSView                = dynamic(() => import("@/components/admin/POSView"),                { loading: S });
const CashRegisterTab        = dynamic(() => import("@/components/admin/CashRegisterTab"),        { loading: S });
const CashAuditTab           = dynamic(() => import("@/components/admin/CashAuditTab"),           { loading: S });
const FiadosModule           = dynamic(() => import("@/components/admin/FiadosModule"),           { loading: S });
const TurnosModule           = dynamic(() => import("@/components/admin/TurnosModule"),           { loading: S });
const OfflineIndicator       = dynamic(() => import("@/components/admin/OfflineIndicator"),       { ssr: false });
const CommissionCalculator   = dynamic(() => import("@/components/admin/CommissionCalculator"),   { loading: S });

/**
 * Las seis pestañas se bajan en segundo plano cuando el navegador queda libre:
 * cada una es un chunk aparte (`next/dynamic`) y, sin esto, la primera vez que
 * se abre cada pestaña se ve el cargador mientras baja (medido en dev: 330-470 ms
 * por pestaña). Con «ahorro de datos» activo no se precarga nada.
 */
const PRECARGAS = [
  () => import("@/components/admin/POSView"),
  () => import("@/components/admin/TurnosModule"),
  () => import("@/components/admin/CashRegisterTab"),
  () => import("@/components/admin/FiadosModule"),
  () => import("@/components/admin/CashAuditTab"),
  () => import("@/components/admin/CommissionCalculator"),
];

import { usePOSOffline } from "@/components/admin/pos/usePOSOffline";


// ── Tabs reordenados en flujo lógico del día ──────────────────────────────────
const TABS = [
  { id: "pos"               as const, label: "Vender",            shortLabel: "POS",     hint: "Punto de venta",      icon: ShoppingCart,  desc: "Busca productos, cobra y genera comprobantes" },
  { id: "turnos"            as const, label: "Turnos",            shortLabel: "Turnos",  hint: "Control de personal", icon: Clock,         desc: "Abre y cierra turnos de trabajo del equipo" },
  { id: "caja-registradora" as const, label: "Caja Registradora", shortLabel: "Caja",    hint: "Gestión de efectivo", icon: Wallet,        desc: "Movimientos de efectivo, retiros e ingresos" },
  { id: "cuentas-cobrar"    as const, label: "Me deben",          shortLabel: "Fiados",  hint: "Créditos a clientes", icon: HandCoins,     desc: "Créditos otorgados, cobros y seguimiento" },
  { id: "arqueo"            as const, label: "Cuadrar Caja",      shortLabel: "Cuadre",      hint: "Cierre del día",      icon: Scale,         desc: "Conteo de billetes y cierre del día" },
  { id: "comisiones"        as const, label: "Comisiones",        shortLabel: "Comisiones",  hint: "Cálculo comisiones",  icon: Users,         desc: "Calcula comisiones de vendedores" },
];

type TabId = typeof TABS[number]["id"];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

// ── Main Module ─────────────────────────────────────────────────────────────

export default function POSCajaModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: link compartible, atrás del navegador y
  // destino del buscador global. `initialTab` gana cuando el módulo se abre
  // desde un tab alias (ej. `?tab=turnos`).
  // `turno` (Cuadrar caja) y `cerrar` (Turnos) son de UNA vista: se borran al salir de ella.
  const { vista: sub, irA: setSub } = useVistaModulo<TabId>(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab, {
    paramsDeVista: { arqueo: ["turno"], turnos: ["cerrar"] },
  });
  const { notice } = useConfirm();
  const { pendingCount, isOnline: _isOnline } = usePOSOffline();

  // ── Estado de turno abierto ──────────────────────────────────────────────
  const [turnoAbierto, setTurnoAbierto] = useState(false);

  // Fetch turno activo al montar y al cambiar de tab (por si se abrió/cerró)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/turnos/activo")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setTurnoAbierto(!!data.turnoActivo); })
      .catch((err) => console.warn("[POSCajaModule] turno activo", err));
    return () => { cancelled = true; };
  }, [sub]);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return;
    const precargar = () => {
      for (const cargar of PRECARGAS) cargar().catch((err) => console.warn("[POSCajaModule] precarga", err));
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(precargar, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(precargar, 2500);
    return () => clearTimeout(t);
  }, []);

  // Escucha apertura/cierre desde TurnosModule (buleje:turno-changed)
  useEffect(() => {
    const handler = (e: Event) => {
      const { abierto } = (e as CustomEvent<{ abierto: boolean }>).detail;
      setTurnoAbierto(abierto);
    };
    window.addEventListener("buleje:turno-changed", handler);
    return () => window.removeEventListener("buleje:turno-changed", handler);
  }, []);

  // QA Brandon 2026-06-10 #2: el modal "Caja sin abrir" del POS ofrece
  // "Abrir caja primero" → salta al sub-tab de Caja Registradora.
  useEffect(() => {
    const goCaja = () => setSub("caja-registradora");
    // Y su gemelo para el turno: el mismo modal ahora también aparece cuando
    // falta el turno, y ahí lo que hay que abrir está en otra pestaña.
    const goTurnos = () => setSub("turnos");
    window.addEventListener("buleje:navigate-caja", goCaja);
    window.addEventListener("buleje:navigate-turnos", goTurnos);
    return () => {
      window.removeEventListener("buleje:navigate-caja", goCaja);
      window.removeEventListener("buleje:navigate-turnos", goTurnos);
    };
  }, []);

  /**
   * Cerrar el turno tiene UNA sola ventana: la de Turnos (conteo, diferencia y nota).
   * Desde otra vista se navega con `?cerrar=1` (llega aunque Turnos aún no haya montado);
   * si ya estás en Turnos, `irA` no toca la URL y se avisa por evento.
   */
  const handleOpenCloseModal = () => {
    if (pendingCount > 0) {
      void notice({
        title: `Tienes ${pendingCount} ventas pendientes de sincronizar`,
        description: 'En modo Offline. Conéctate a internet y pulsa "Sincronizar ahora" en la barra azul antes de cerrar el turno — si no, esas ventas no se reflejarán en el corte.',
        intent: "warning",
      });
      return;
    }
    if (sub === "turnos") window.dispatchEvent(new CustomEvent("buleje:cerrar-turno"));
    else setSub("turnos", { cerrar: "1" });
  };

  return (
    <div className="space-y-4 pb-16 sm:pb-0">
      {/* pb en móvil: el botón fijo «Abrir/Cerrar turno» no tapa la última fila. */}
      <OfflineIndicator />

      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla. Recupera ~90px verticales,
          que en una laptop de 677px útiles es la diferencia entre ver los
          datos o sólo los encabezados.
          El `eyebrow` se fue con el header: decía la categoría del sidebar
          («Abastecimiento · Compras» sobre un título «Compras») — el mismo
          dato tres veces contando el ítem marcado en el sidebar. */}
      <AdminTabBar
        heading={{ title: "Ventas & Caja", description: "Vende, cobra, gestiona tu turno y cierra caja. Todo el flujo del mostrador en un solo lugar.", icon: ShoppingCart }}
        tabs={TABS.map(t => ({
          id: t.id,
          label: t.label,
          shortLabel: t.shortLabel,
          icon: t.icon,
        }))}
        activeTab={sub}
        onTabChange={(id) => setSub(id as TabId)}
        moduleId="pos-caja"
        rightSlot={
          /* Chip micro de status — visible desde cualquier sub-tab.
             - Turno abierto: abre modal para cerrar (accion mas frecuente).
             - Turno cerrado: navega a Turnos (donde se abre con el form). */
          <button
            type="button"
            onClick={() => {
              if (turnoAbierto) handleOpenCloseModal();
              else setSub("turnos");
            }}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
              turnoAbierto
                ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-primary/10"
                : "bg-[var(--rule-soft)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]",
            )}
            title={turnoAbierto ? "Turno abierto — click para cerrar" : "Sin turno — click para abrir uno"}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              turnoAbierto ? "bg-[var(--data-success-500)] animate-pulse" : "bg-[var(--text-tertiary)]",
            )} aria-hidden />
            {turnoAbierto ? "Turno abierto" : "Sin turno"}
          </button>
        }
      >

      {/* Se oculta en Turnos: ahí el formulario ya trae «Abrir/Cerrar turno» y el botón tapaba «Último turno» a 400 px. */}
      {/* ── Mobile Cerrar/Abrir Turno button — fixed at bottom ───────────
          Posicionado POR ENCIMA del bottom-nav (~72px + safe-area): antes con
          bottom-16 (64px) quedaba detrás del nav (z-50) y tapaba cards sin
          elevación. Sombra lg para separarlo del contenido que scrollea debajo. */}
      {sub !== "turnos" && (
      <div className="sm:hidden fixed bottom-[calc(72px+env(safe-area-inset-bottom)+12px)] right-4 z-40">
        {turnoAbierto ? (
          <button
            onClick={handleOpenCloseModal}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] shadow-[var(--shadow-lg)] transition-colors flex items-center gap-1.5"
          >
            <span className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />
            Cerrar Turno
          </button>
        ) : (
          <button
            onClick={() => setSub("turnos")}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-dark shadow-[var(--shadow-lg)] transition-colors flex items-center gap-1.5"
          >
            Abrir Turno
          </button>
        )}
      </div>
      )}

      {/* ── CAMBIO 7: Renderizado de contenido por tab ───────────────── */}
      {sub === "pos"               && <POSView />}
      {sub === "turnos"            && <TurnosModule />}
      {sub === "caja-registradora" && <CashRegisterTab />}
      {sub === "cuentas-cobrar"    && <FiadosModule />}
      {sub === "arqueo"            && <CashAuditTab onIrACaja={() => setSub("caja-registradora")} />}
      {sub === "comisiones"        && <CommissionCalculator />}

      </AdminTabBar>
    </div>
  );
}
