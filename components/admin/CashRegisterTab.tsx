"use client";

/**
 * Ventas & Caja › Caja (`?tab=ventas-caja&vista=caja-registradora`).
 *
 * Era un archivo de 2.538 líneas; ahora orquesta piezas de
 * `components/admin/caja/`: datos (`use-caja-registradora`), parte del día
 * del servidor (`use-parte-del-dia`: origen de cada movimiento + cuadre con
 * ventas), las cinco secciones y las ventanas. La ley de la vista: un título,
 * cabecera en una fila, lo de uso constante a la vista y el resto en «Más».
 *
 * Las secciones viven en `?sub=` (`SUBS_CAJA`). «Cuadrar» es el módulo de
 * cuadres (CashAuditTab) montado tal cual: era la pestaña «Cuadrar caja» de
 * Ventas y caja hasta la ola 3 del panel unificado. Juntar sus contadores con
 * los del arqueo guiado y el cierre de turno es otro paso (ola 6).
 */
import { useCallback, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import {
  AlertTriangle,
  Calculator,
  Download,
  MessageCircle,
  Printer,
  RefreshCw,
  Scan,
  Settings,
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useTenant } from "@/contexts/tenant-context";
import { useMiRol } from "@/hooks/use-mi-rol";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { formatTime } from "@/lib/format";
/* Estático, no `next/dynamic`: en Cuadrar la cabecera de Caja (con sus secciones)
   la dibuja el módulo de cuadres; si bajara aparte, la fila de secciones
   desaparecía mientras cargaba el chunk. */
import CashAuditTab, { type PartesCabeceraCuadres } from "./CashAuditTab";
import { CajaActual } from "./caja/CajaActual";
import { CajaAuditoria } from "./caja/CajaAuditoria";
import { CajaCabecera } from "./caja/CajaCabecera";
import { CajaHistorial } from "./caja/CajaHistorial";
import { CajaReconciliacion } from "./caja/CajaReconciliacion";
import { ModalAbrirCaja } from "./caja/ModalAbrirCaja";
import { ModalArqueoExpress } from "./caja/ModalArqueoExpress";
import { ModalArqueoGuiado } from "./caja/ModalArqueoGuiado";
import { ModalCerrarCaja } from "./caja/ModalCerrarCaja";
import { ModalDetalleCaja } from "./caja/ModalDetalleCaja";
import { ModalMovimientoCaja } from "./caja/ModalMovimientoCaja";
import { ModalToleranciaCaja } from "./caja/ModalToleranciaCaja";
import { enviarParteWhatsApp, exportarMovimientosCsv, imprimirParte } from "./caja/acciones-parte";
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
  /* Sin memoria entre visitas: Caja abre siempre en «Caja de hoy», como antes
     (era estado local). La URL sí manda: `?sub=cuadrar` abre Cuadrar. */
  const { vista, irA } = useSubvistaModulo("ventas-caja-caja", SUBS_CAJA, "hoy", subInicial, {
    recordar: false,
  });
  /* Al salir de Cuadrar se relee la caja: un conteo guardado ahí deja un movimiento
     «arqueo» que «Caja de hoy» no vería hasta su refresco de 30 s. */
  const setVista = useCallback(
    (v: VistaCaja) => {
      if (vista === "cuadrar" && v !== "cuadrar") void fetchData();
      irA(v);
      if (v !== "cuadrar") quitarTurnoDeLaUrl();
    },
    [irA, vista, fetchData],
  );
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
  /* Los cuadres cargan al montar: lo que termina un modal relee la caja y los remonta. */
  const [verCuadres, setVerCuadres] = useState(0);
  const alHacer = useCallback(() => {
    recargar();
    setVerCuadres((v) => v + 1);
  }, [recargar]);
  const abrirIngreso = useCallback(() => setModal("ingreso"), []);
  const abrirRetiro = useCallback(() => setModal("egreso"), []);
  useAtajosCaja(vista === "hoy" && !!caja && modal === null && !detalle, {
    ingreso: abrirIngreso,
    retiro: abrirRetiro,
  });

  if (loading) return <LoadingState message="" size="sm" />;

  const conCaja = (a: Omit<MenuAccion, "disabled">): MenuAccion => ({
    ...a,
    disabled: !caja,
    hint: caja ? a.hint : "Abre una caja primero",
  });
  const acciones: MenuAccion[] = [
    conCaja({
      id: "arqueo",
      seccion: "Contar",
      label: "Arqueo express",
      hint: "Cuenta el cajón sin cerrar",
      icon: Scan,
      onSelect: () => setModal("arqueo"),
    }),
    conCaja({
      id: "guiado",
      seccion: "Contar",
      label: "Arqueo guiado",
      hint: "Billetes, monedas y vouchers; cierra la caja",
      icon: Calculator,
      onSelect: () => setModal("guiado"),
    }),
    conCaja({
      id: "imprimir",
      seccion: "Parte del día",
      label: "Imprimir parte",
      hint: "Hoja de 80 mm para la impresora térmica",
      icon: Printer,
      onSelect: () => {
        if (caja && !imprimirParte(caja, parte.parte, branding.name ?? undefined))
          setAviso(
            "Tu navegador bloqueó la ventana de impresión: permite las ventanas emergentes de este sitio.",
          );
      },
    }),
    conCaja({
      id: "csv",
      seccion: "Parte del día",
      label: "Exportar movimientos (CSV)",
      hint: "Se abre en Excel, con el origen de cada uno",
      icon: Download,
      onSelect: () => caja && exportarMovimientosCsv(caja),
    }),
    {
      id: "whatsapp",
      seccion: "Parte del día",
      label: "Enviar parte por WhatsApp",
      hint: parte.parte ? "Esperado, retiros y cuadre con ventas" : "Abre una caja primero",
      icon: MessageCircle,
      disabled: !parte.parte || !caja,
      onSelect: () => parte.parte && enviarParteWhatsApp(parte.parte),
    },
    {
      id: "tolerancia",
      seccion: "Ajustes",
      label: "Tolerancia de diferencia",
      meta: `±S/${datos.cashTolerance}`,
      icon: Settings,
      onSelect: () => setModal("tolerancia"),
    },
    {
      id: "refrescar",
      seccion: "Ajustes",
      label: "Refrescar",
      hint: "Se refresca solo cada 30 s",
      icon: RefreshCw,
      onSelect: recargar,
    },
  ];

  const estado = caja ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
      Abierta {formatTime(caja.openedAt)} · {stats?.salesCount ?? 0} ventas
    </span>
  ) : (
    <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap">
      Cerrada
    </span>
  );

  /* En Cuadrar, el título, «Indicadores» y las acciones vienen de los cuadres:
     la misma fila, un solo «Más» (sus acciones primero) y sin chip de estado. */
  const cabecera = (cuadres?: PartesCabeceraCuadres) => (
    <>
      <CajaCabecera
        vista={vista}
        onVista={setVista}
        estado={cuadres ? undefined : estado}
        acciones={cuadres ? [...cuadres.acciones, ...acciones] : acciones}
        titulo={cuadres?.titulo}
        extra={cuadres?.indicadores}
      />
      {(errorCarga || aviso) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 py-1 pl-4 pr-1"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
          <p className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
            {aviso ?? errorCarga}
          </p>
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

  return (
    <div className="space-y-4">
      {vista !== "cuadrar" && cabecera()}

      {vista === "hoy" && (
        <CajaActual
          datos={datos}
          parte={parte}
          puedeCambiarMedio={puedeCambiarMedio}
          onAbrir={() => setModal("abrir")}
          onMovimiento={(t) => setModal(t)}
          onCerrarCaja={() => setModal("cerrar")}
          onVerCaja={setDetalle}
        />
      )}
      {vista === "historial" && (
        <CajaHistorial
          cerradas={datos.closedRegisters}
          tolerancia={datos.cashTolerance}
          onVer={setDetalle}
        />
      )}
      {vista === "auditoria" && <CajaAuditoria />}
      {vista === "reconciliacion" && (
        <CajaReconciliacion cerradas={datos.closedRegisters} tolerancia={datos.cashTolerance} />
      )}
      {/* `onIrACaja` llevaba a la pestaña Caja; ahora Caja es la casa: vuelve a «Caja de hoy». */}
      {vista === "cuadrar" && (
        <CashAuditTab key={verCuadres} onIrACaja={() => setVista("hoy")} cabecera={cabecera} />
      )}

      {modal === "abrir" && <ModalAbrirCaja onCerrar={cerrar} onHecho={alHacer} />}
      {modal === "tolerancia" && (
        <ModalToleranciaCaja
          valor={datos.cashTolerance}
          onGuardar={datos.setCashTolerance}
          onCerrar={cerrar}
        />
      )}
      {caja && (modal === "ingreso" || modal === "egreso") && (
        <ModalMovimientoCaja cajaId={caja.id} tipo={modal} onCerrar={cerrar} onHecho={alHacer} />
      )}
      {caja && modal === "cerrar" && (
        <ModalCerrarCaja caja={caja} stats={stats} onCerrar={cerrar} onHecho={alHacer} />
      )}
      {caja && modal === "arqueo" && (
        <ModalArqueoExpress caja={caja} stats={stats} onCerrar={cerrar} onHecho={alHacer} />
      )}
      {caja && modal === "guiado" && (
        <ModalArqueoGuiado
          caja={caja}
          stats={stats}
          ventasPorMedio={datos.paymentBreakdown}
          onCerrar={cerrar}
          onHecho={alHacer}
        />
      )}
      {detalle && <ModalDetalleCaja caja={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
