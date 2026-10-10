"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ShoppingCart, Wallet, HandCoins, Clock, Users } from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { cn } from "@/lib/utils";

const MODULE_ID = "ventas-caja";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { button } from "@/components/ui-system/button-variants";

const POSView                = dynamic(() => import("@/components/admin/POSView"),                { loading: S });
const CashRegisterTab        = dynamic(() => import("@/components/admin/CashRegisterTab"),        { loading: S });
const FiadosModule           = dynamic(() => import("@/components/admin/FiadosModule"),           { loading: S });
const TurnosModule           = dynamic(() => import("@/components/admin/TurnosModule"),           { loading: S });
const OfflineIndicator       = dynamic(() => import("@/components/admin/OfflineIndicator"),       { ssr: false });
const CommissionCalculator   = dynamic(() => import("@/components/admin/CommissionCalculator"),   { loading: S });

/**
 * Las pestañas se bajan en segundo plano cuando el navegador queda libre: cada
 * una es un chunk aparte (`next/dynamic`) y, sin esto, la primera vez que se
 * abre cada pestaña se ve el cargador mientras baja (medido en dev: 330-470 ms
 * por pestaña). «Cuadrar» (CashAuditTab) vive dentro de Caja desde la ola 3 del
 * panel unificado y va en el mismo chunk que Caja (import estático: su cabecera
 * es la de Caja). Con «ahorro de datos» activo no se precarga nada.
 */
const PRECARGAS = [
  () => import("@/components/admin/POSView"),
  () => import("@/components/admin/TurnosModule"),
  () => import("@/components/admin/CashRegisterTab"),
  () => import("@/components/admin/FiadosModule"),
  () => import("@/components/admin/CommissionCalculator"),
];

import { usePOSOffline } from "@/components/admin/pos/usePOSOffline";


// ── Tabs reordenados en flujo lógico del día ──────────────────────────────────
// Panel unificado, ola 3 (2026-10-10): de 6 a 5. «Cuadrar caja» dejó de ser
// pestaña: es la sección «Cuadrar» de Caja (`?vista=caja-registradora&sub=cuadrar`),
// y el nombre viejo `arqueo` sigue llegando por el alias de abajo. Sin
// `shortLabel`: AdminTabBar lo dibuja SIEMPRE en vez del rótulo (decía «POS»,
// «Fiados», «Cuadre»), y el rótulo es el nombre que se busca y se enlaza.
const TABS = [
  { id: "pos"               as const, label: "Vender",                    hint: "Busca productos, cobra y genera comprobantes",            icon: ShoppingCart },
  { id: "turnos"            as const, label: "Turnos",                    hint: "Abre y cierra el turno de caja de cada cajero",           icon: Clock },
  { id: "caja-registradora" as const, label: "Caja",                      hint: "El efectivo del día: abrir, ingresos, retiros y cuadrar", icon: Wallet },
  { id: "cuentas-cobrar"    as const, label: "Me deben",                  hint: "Lo que quedó fiado: quién debe, cobrar y recordar",       icon: HandCoins },
  { id: "comisiones"        as const, label: "Comisiones de vendedores",  hint: "Lo que ganó cada vendedor por lo que vendió",            icon: Users },
];

type TabId = typeof TABS[number]["id"];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

/** Nombres viejos de vista → la que hoy los cubre (link guardado, memoria del navegador). */
const ALIAS_DE_VISTA = { arqueo: "caja-registradora" } as const satisfies Record<string, TabId>;

/** `?vista=arqueo` al abrir → Caja entra directo a su sección «Cuadrar». */
function subDeCajaPorVistaVieja(): "cuadrar" | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("vista") === "arqueo" ? "cuadrar" : undefined;
}

// ── Main Module ─────────────────────────────────────────────────────────────

export default function POSCajaModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: link compartible, atrás del navegador y
  // destino del buscador global. `initialTab` gana cuando el módulo se abre
  // desde un tab alias (ej. `?tab=turnos`).
  // `turno` (Caja › Cuadrar) y `cerrar` (Turnos) son de UNA vista: se borran al salir
  // de ella. `sub` también: Caja y Me deben guardan ahí su 2.º nivel, y un `?sub=`
  // de una no tiene que llegarle a la otra.
  //
  // Se lee ANTES que el hook: un `?vista=arqueo` (link viejo que todavía no pasó
  // por VISTA_MIGRATION) cae en Caja por el alias, y Caja tiene que abrir en
  // Cuadrar, no en «Caja de hoy».
  const [subDeCaja, setSubDeCaja] = useState(subDeCajaPorVistaVieja);
  const { vista: sub, irA: setSub } = useVistaModulo<TabId>(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab, {
    paramsDeVista: { "caja-registradora": ["sub", "turno"], "cuentas-cobrar": ["sub"], turnos: ["cerrar", "sub", "turno"] },
    alias: ALIAS_DE_VISTA,
  });
  const { notice } = useConfirm();
  const { pendingCount, isOnline: _isOnline } = usePOSOffline();

  // Caja abre en Cuadrar sólo la primera vez (el link viejo); al salir de Caja, se olvida.
  useEffect(() => {
    if (sub !== "caja-registradora") setSubDeCaja(undefined);
  }, [sub]);

  // ── Estado de turno abierto ──────────────────────────────────────────────
  // `null` = todavía no se sabe (la consulta no volvió o falló): se dibuja como
  // «Sin turno», igual que antes, pero no decide a dónde lleva «Abrir».
  const [turnoAbierto, setTurnoAbierto] = useState<boolean | null>(null);

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

  /**
   * «Abrir» desde el POS tiene UN solo camino (plan «panel unificado», ola 3).
   *
   * Abrir el turno abre la caja, o adopta la que ya está abierta (POST
   * /api/turnos). Así que sin turno, todo «Abrir» lleva a Turnos; sólo con el
   * turno abierto y la caja cerrada lleva a Caja. Antes «Sin caja · Abrir», de
   * la barra del POS, mandaba a Caja aunque no hubiera turno: abrías la caja,
   * volvías a cobrar y el aviso «Sin turno abierto» te mandaba a Turnos — dos
   * viajes para lo mismo, y una caja abierta sin cajero responsable.
   *
   * El aviso del POS ya elige bien (manda `navigate-turnos` cuando sabe que no
   * hay turno); la barra no sabe del turno y por eso decide acá.
   */
  useEffect(() => {
    const irAAbrir = () => setSub(turnoAbierto === false ? "turnos" : "caja-registradora");
    const irATurnos = () => setSub("turnos");
    window.addEventListener("buleje:navigate-caja", irAAbrir);
    window.addEventListener("buleje:navigate-turnos", irATurnos);
    return () => {
      window.removeEventListener("buleje:navigate-caja", irAAbrir);
      window.removeEventListener("buleje:navigate-turnos", irATurnos);
    };
  }, [turnoAbierto, setSub]);

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
          title: t.hint,
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
      {/* Y en Vender: su cabecera ya trae «Abrir turno» y a 400 px tapaba la grilla encima de la barra de cobro. */}
      {sub !== "turnos" && sub !== "pos" && (
      <div className="sm:hidden fixed bottom-[calc(72px+env(safe-area-inset-bottom)+12px)] right-4 z-40">
        {/* 48 px y colores del DS: el blanco sobre turquesa (3,2:1) y sobre rojo -500 no llegaban a AA. */}
        {turnoAbierto ? (
          <button
            type="button"
            onClick={handleOpenCloseModal}
            className={button({ variant: "danger", className: "rounded-xl shadow-[var(--shadow-lg)]" })}
          >
            <span className="h-2 w-2 rounded-full bg-white/70 animate-pulse" aria-hidden />
            Cerrar turno
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSub("turnos")}
            className={button({ variant: "primary", className: "rounded-xl shadow-[var(--shadow-lg)]" })}
          >
            Abrir turno
          </button>
        )}
      </div>
      )}

      {/* ── CAMBIO 7: Renderizado de contenido por tab ───────────────── */}
      {sub === "pos"               && <POSView />}
      {sub === "turnos"            && <TurnosModule />}
      {sub === "caja-registradora" && <CashRegisterTab subInicial={subDeCaja} />}
      {sub === "cuentas-cobrar"    && <FiadosModule />}
      {sub === "comisiones"        && <CommissionCalculator />}

      </AdminTabBar>
    </div>
  );
}
