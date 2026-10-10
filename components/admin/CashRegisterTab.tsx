"use client";

/**
 * Ventas & Caja › Caja (`?tab=ventas-caja&vista=caja-registradora`).
 *
 * Era un archivo de 2.538 líneas; ahora orquesta piezas de
 * `components/admin/caja/`: datos (`use-caja-registradora`), parte del día
 * del servidor (`use-parte-del-dia`: origen de cada movimiento + cuadre con
 * ventas), las cuatro vistas y las ventanas. La ley de la vista: un título,
 * cabecera en una fila, lo de uso constante a la vista y el resto en «Más».
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
import { formatTime } from "@/lib/format";
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
import type { CashRegister, ModalCaja, VistaCaja } from "./caja/tipos";

export default function CashRegisterTab() {
  const { branding } = useTenant();
  /* «Cambiar medio» sólo para admin/dueño: el servidor devuelve 403 al resto. */
  const rol = useMiRol();
  const puedeCambiarMedio = rol === "admin" || rol === "owner";
  const datos = useCajaRegistradora();
  const { currentRegister: caja, stats, loading, errorCarga, fetchData } = datos;
  const [vista, setVista] = useState<VistaCaja>("current");
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
  const abrirIngreso = useCallback(() => setModal("ingreso"), []);
  const abrirRetiro = useCallback(() => setModal("egreso"), []);
  useAtajosCaja(vista === "current" && !!caja && modal === null && !detalle, {
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
      Abierta {formatTime(caja.openedAt)} · {stats?.salesCount ?? 0} ventas
    </span>
  ) : (
    <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap">
      Cerrada
    </span>
  );

  return (
    <div className="space-y-4">
      <CajaCabecera vista={vista} onVista={setVista} estado={estado} acciones={acciones} />

      {(errorCarga || aviso) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
          <p className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
            {aviso ?? errorCarga}
          </p>
          <button
            type="button"
            onClick={() => (aviso ? setAviso(null) : recargar())}
            className="text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {aviso ? "Entendido" : "Reintentar"}
          </button>
        </div>
      )}

      {vista === "current" && (
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
      {vista === "history" && (
        <CajaHistorial
          cerradas={datos.closedRegisters}
          tolerancia={datos.cashTolerance}
          onVer={setDetalle}
        />
      )}
      {vista === "auditoria" && <CajaAuditoria />}
      {vista === "reconcile" && (
        <CajaReconciliacion cerradas={datos.closedRegisters} tolerancia={datos.cashTolerance} />
      )}

      {modal === "abrir" && <ModalAbrirCaja onCerrar={cerrar} onHecho={recargar} />}
      {modal === "tolerancia" && (
        <ModalToleranciaCaja
          valor={datos.cashTolerance}
          onGuardar={datos.setCashTolerance}
          onCerrar={cerrar}
        />
      )}
      {caja && (modal === "ingreso" || modal === "egreso") && (
        <ModalMovimientoCaja cajaId={caja.id} tipo={modal} onCerrar={cerrar} onHecho={recargar} />
      )}
      {caja && modal === "cerrar" && (
        <ModalCerrarCaja caja={caja} stats={stats} onCerrar={cerrar} onHecho={recargar} />
      )}
      {caja && modal === "arqueo" && (
        <ModalArqueoExpress caja={caja} stats={stats} onCerrar={cerrar} onHecho={recargar} />
      )}
      {caja && modal === "guiado" && (
        <ModalArqueoGuiado
          caja={caja}
          stats={stats}
          ventasPorMedio={datos.paymentBreakdown}
          onCerrar={cerrar}
          onHecho={recargar}
        />
      )}
      {detalle && <ModalDetalleCaja caja={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
