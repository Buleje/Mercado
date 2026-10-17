"use client";

/**
 * Ventas & Caja › Caja (`?tab=ventas-caja&vista=caja-registradora`).
 *
 * Era un archivo de 2.538 líneas; ahora orquesta piezas de
 * `components/admin/caja/`: datos (`use-caja-registradora`), parte del día
 * del servidor (`use-parte-del-dia`), las secciones y las ventanas.
 *
 * Desde el 10-10 son DOS pestañas con sus secciones (`caja/secciones.ts`),
 * cada sección un valor de `?sub=` (`SUBS_CAJA`):
 *   Hoy:       Resumen (`hoy`) · Movimientos · Medios de pago · Cuadrar
 *   Historial: Por caja (`historial`, los cuadres) · Por día · Quién la tocó
 * Antes eran cinco pestañas y «Hoy» apilaba todo en una columna. La tabla de
 * cajas cerradas se fue: repetía la de los cuadres (misma fila por caja, 5 de
 * 7 columnas iguales); su tendencia pasó a «Por día» y su parte del día se
 * abre desde el detalle de cada cuadre.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@buleje/design-system";
import { AlertTriangle, Unlock } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/tenant-context";
import { useMiRol } from "@/hooks/use-mi-rol";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { formatTime } from "@/lib/format";
import { diasCalendarioLima, fechaCortaLima } from "@/lib/caja/caja-abierta";
/* Estático, no `next/dynamic`: en Historial › Por caja la fila de la cabecera
   la completa el módulo de cuadres; si bajara aparte, la barra de secciones
   desaparecía mientras cargaba el chunk. */
import CashAuditTab, { type PartesCabeceraCuadres } from "./CashAuditTab";
import { CajaActual } from "./caja/CajaActual";
import { CajaAuditoria } from "./caja/CajaAuditoria";
import { CajaCabecera, MenuMasCaja } from "./caja/CajaCabecera";
import { ID_PANEL_CAJA, idPestanaActiva } from "./caja/CajaSecciones";
import { CajaReconciliacion } from "./caja/CajaReconciliacion";
import { ModalAbrirCaja } from "./caja/ModalAbrirCaja";
import { ModalArqueoExpress } from "./caja/ModalArqueoExpress";
import { ModalArqueoGuiado } from "./caja/ModalArqueoGuiado";
import { ModalCerrarCaja } from "./caja/ModalCerrarCaja";
import { ModalDetalleCaja } from "./caja/ModalDetalleCaja";
import { ModalMovimientoCaja } from "./caja/ModalMovimientoCaja";
import { ModalToleranciaCaja } from "./caja/ModalToleranciaCaja";
import { accionesDeCaja } from "./caja/acciones-caja";
import { grupoDe, recordarSeccion, seccionRecordada } from "./caja/secciones";
import { useAtajosCaja } from "./caja/use-atajos-caja";
import { useCajaRegistradora } from "./caja/use-caja-registradora";
import { useParteDelDia } from "./caja/use-parte-del-dia";
import { SUBS_CAJA, type CashRegister, type ModalCaja, type VistaCaja } from "./caja/tipos";

/** `?turno=` es de Cuadrar (la línea «Viene del turno de…»): fuera de ahí, sobra. */
function quitarTurnoDeLaUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("turno")) return;
    url.searchParams.delete("turno");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // history no disponible
  }
}

interface Props {
  /**
   * La sección con la que abre si la URL no trae `?sub=`. La pasa el hub
   * cuando llegó un `?vista=arqueo` viejo: entra directo a «Cuadrar».
   */
  subInicial?: VistaCaja;
}

export default function CashRegisterTab({ subInicial }: Props = {}) {
  const { branding } = useTenant();
  /* «Cambiar medio» sólo para admin/dueño: el servidor devuelve 403 al resto. */
  const rol = useMiRol();
  const puedeCambiarMedio = rol === "admin" || rol === "owner";
  const datos = useCajaRegistradora();
  const { currentRegister: caja, stats, loading, errorCarga, fetchData } = datos;
  /* Caja abre siempre en «Hoy» (la URL manda: `?sub=cuadrar` abre Cuadrar), en
     la sección de «Hoy» que usaste último. Cada pestaña recuerda la suya. */
  const [porDefecto] = useState(() => seccionRecordada("hoy"));
  const { vista, irA } = useSubvistaModulo("ventas-caja-caja", SUBS_CAJA, porDefecto, subInicial, {
    recordar: false,
  });
  /* Al salir de Cuadrar se relee la caja: un conteo guardado ahí deja un movimiento
     «arqueo» que el resto de «Hoy» no vería hasta su refresco de 30 s. */
  const setVista = useCallback(
    (v: VistaCaja) => {
      if (vista === "cuadrar" && v !== "cuadrar") void fetchData();
      irA(v);
      if (v !== "cuadrar") quitarTurnoDeLaUrl();
    },
    [irA, vista, fetchData],
  );
  /* Se recuerda la sección a la vista venga de donde venga (clic, enlace, atrás). */
  useEffect(() => recordarSeccion(vista), [vista]);
  const [modal, setModal] = useState<ModalCaja>(null);
  const [detalle, setDetalle] = useState<CashRegister | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /* «Cambiar medio» no cambia la cantidad de movimientos: el esperado y los
     medios entran en la firma para que el parte se relea igual. */
  const firma = caja
    ? `${caja.id}:${caja.movements.length}:${caja.status}:${stats?.expectedCash ?? ""}:${caja.movements.map((m) => m.method).join(",")}`
    : "";
  const parte = useParteDelDia(caja?.id ?? null, firma);
  const cerrar = useCallback(() => setModal(null), []);
  const recargar = useCallback(() => void fetchData(), [fetchData]);
  /* Los cuadres y el contador cargan al montar: lo que termina un modal relee
     la caja y los remonta (un arqueo del «Más» los dejaba diciendo «abierta»). */
  const [verCuadres, setVerCuadres] = useState(0);
  const alHacer = useCallback(() => {
    recargar();
    setVerCuadres((v) => v + 1);
  }, [recargar]);
  const abrirIngreso = useCallback(() => setModal("ingreso"), []);
  const abrirRetiro = useCallback(() => setModal("egreso"), []);
  /* «I» y «R» en cualquier sección de «Hoy» con la caja abierta. */
  const raizRef = useRef<HTMLDivElement>(null);
  useAtajosCaja(
    grupoDe(vista) === "hoy" && !!caja && modal === null && !detalle,
    { ingreso: abrirIngreso, retiro: abrirRetiro },
    raizRef,
  );

  if (loading) return <LoadingState message="" size="sm" />;

  const acciones = accionesDeCaja({
    caja,
    parte: parte.parte,
    nombreNegocio: branding.name ?? undefined,
    tolerancia: datos.cashTolerance,
    abrirModal: setModal,
    avisar: setAviso,
    recargar,
  });

  /* Una caja abierta desde otro día no es «la caja de hoy» (H01/M01): el chip
     dice desde cuándo y cuántos días lleva; el título deja de decir «hoy». */
  const diasAbierta = caja ? (diasCalendarioLima(caja.openedAt) ?? 0) : 0;
  const estado = caja ? (
    <span
      data-qa="chip-caja-abierta"
      title={`Abierta el ${fechaCortaLima(caja.openedAt)} a las ${formatTime(caja.openedAt)}${diasAbierta > 0 ? `: lleva ${diasAbierta === 1 ? "1 día" : `${diasAbierta} días`} sin cerrarse. Las cifras son de toda la sesión.` : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-bold",
        diasAbierta > 0
          ? "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]"
          : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", diasAbierta > 0 ? "bg-[var(--data-warning-500)]" : "bg-primary")} aria-hidden />
      {diasAbierta === 0
        ? `Abierta hoy ${formatTime(caja.openedAt)}`
        : diasAbierta === 1
          ? `Abierta ayer ${formatTime(caja.openedAt)}`
          : `Desde el ${fechaCortaLima(caja.openedAt)} · ${diasAbierta} días`}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-sm font-bold text-[var(--text-secondary)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-secondary)]" aria-hidden />
      Cerrada
    </span>
  );
  /* Con la caja abierta, en «Hoy», «Más» va con ingreso, retiro y cerrar. */
  const masEnAcciones = !!caja && grupoDe(vista) === "hoy";
  const abrirCaja = !caja && grupoDe(vista) === "hoy" && (
    <button type="button" onClick={() => setModal("abrir")} className={button({ variant: "primary", className: "rounded-xl" })}>
      <Unlock className="h-4 w-4" aria-hidden /> Abrir caja
    </button>
  );

  /* En Historial › Por caja, «Indicadores» y las acciones vienen de los
     cuadres: la misma fila, un solo «Más» (sus acciones primero). */
  const cabecera = (cuadres?: PartesCabeceraCuadres) => (
    <>
      <CajaCabecera
        vista={vista}
        onVista={setVista}
        hoyConSecciones={!!caja}
        titulo={diasAbierta > 0 ? "Caja en curso" : undefined}
        estado={estado}
        acciones={cuadres ? [...cuadres.acciones, ...acciones] : acciones}
        extra={cuadres?.indicadores}
        principal={abrirCaja}
        sinMas={masEnAcciones}
      />
      {(errorCarga || aviso) && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 py-1 pl-4 pr-1">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
          <p className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{aviso ?? errorCarga}</p>
          <button
            type="button"
            onClick={() => (aviso ? setAviso(null) : recargar())}
            className="min-h-12 rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {aviso ? "Entendido" : "Reintentar"}
          </button>
        </div>
      )}
    </>
  );

  /* El parte de una caja vieja, desde el detalle de su cuadre: la caja sale de
     la misma lista que ya está cargada (no hay otro pedido). */
  const panel = { role: "tabpanel", id: ID_PANEL_CAJA, "aria-labelledby": idPestanaActiva(vista, !!caja) } as const;

  const verParte = async (id: string) => {
    const r = datos.registers.find((x) => x.id === id);
    if (r) return setDetalle(r);
    /* M28: «Ver caja» desde la bitácora puede ser de una caja que ya no está en la lista. */
    const res = await fetch(`/api/cash-registers/${encodeURIComponent(id)}`, { credentials: "include" }).catch(() => null);
    if (res?.ok) setDetalle((await res.json()) as CashRegister);
    else toast.error("No pudimos abrir esa caja.");
  };

  return (
    <div ref={raizRef} className="space-y-4" data-caja-raiz>
      {vista !== "historial" && cabecera()}

      {/* El contenido de la sección es el `tabpanel` de la barra de secciones
          (en «Por caja» lo pone CashAuditTab, que arma su propia cabecera). */}
      {vista !== "historial" && (
        <div {...panel}>
          {grupoDe(vista) === "hoy" && (
            <CajaActual
              vista={vista}
              datos={datos}
              parte={parte}
              puedeCambiarMedio={puedeCambiarMedio}
              onMovimiento={(t) => setModal(t)}
              onCerrarCaja={() => setModal("cerrar")}
              onVerCaja={setDetalle}
              onIrA={setVista}
              versionConteo={verCuadres}
              mas={<MenuMasCaja acciones={acciones} cuadrado />}
            />
          )}
          {vista === "reconciliacion" && <CajaReconciliacion cerradas={datos.closedRegisters} tolerancia={datos.cashTolerance} />}
          {vista === "auditoria" && <CajaAuditoria onVerCaja={verParte} />}
        </div>
      )}
      {/* `onIrACaja` lleva a «Hoy»: ahí se abre y se cierra la caja. */}
      {vista === "historial" && (
        <CashAuditTab
          key={verCuadres}
          onIrACaja={() => setVista("hoy")}
          cabecera={cabecera}
          onVerParte={verParte}
          tolerancia={datos.cashTolerance}
          panel={panel}
        />
      )}

      {modal === "abrir" && <ModalAbrirCaja onCerrar={cerrar} onHecho={alHacer} />}
      {modal === "tolerancia" && <ModalToleranciaCaja valor={datos.cashTolerance} onGuardar={datos.setCashTolerance} onCerrar={cerrar} />}
      {caja && (modal === "ingreso" || modal === "egreso") && (
        <ModalMovimientoCaja cajaId={caja.id} tipo={modal} onCerrar={cerrar} onHecho={alHacer} />
      )}
      {caja && modal === "cerrar" && (
        <ModalCerrarCaja
          caja={caja}
          stats={stats}
          onCerrar={cerrar}
          onHecho={alHacer}
          conciliacion={parte.parte?.conciliacion ?? null}
          negocio={branding.name ?? undefined}
          tolerancia={datos.cashTolerance}
          onIr={(v) => { cerrar(); setVista(v); }}
        />
      )}
      {caja && modal === "arqueo" && <ModalArqueoExpress caja={caja} stats={stats} onCerrar={cerrar} onHecho={alHacer} />}
      {caja && modal === "guiado" && (
        <ModalArqueoGuiado caja={caja} stats={stats} ventasPorMedio={datos.paymentBreakdown} onCerrar={cerrar} onHecho={alHacer} />
      )}
      {detalle && <ModalDetalleCaja caja={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
