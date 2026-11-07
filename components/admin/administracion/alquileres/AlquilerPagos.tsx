"use client";

/**
 * AlquilerPagos — la grilla de pagos mes a mes de un alquiler (ADR-524), un
 * año a la vez dentro del plazo. Cada mes dice si está pagado, atrasado, si
 * toca pagar o si es futuro (el atraso y el próximo vienen del `resumen` del
 * servidor). Un mes pagado no se vuelve a registrar: se quita o se corrige.
 * Un pago menor a la renta deja el mes «Pagado en parte» con lo que falta
 * (`resumen.periodosParciales`, calculado en el servidor: acá no se resta).
 */
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Receipt, Trash2, Upload } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { toast } from "sonner";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { AlquilerDto, AlquilerPagoDto } from "@/lib/admin/fichas-tramites-alquileres";
import { MESES_NOMBRES, fechaCorta, hoyKey } from "../comun/fechas";
import { Insignia } from "../comun/Insignia";
import { enlaceDocumento } from "../comun/subir-documento";
import { monto } from "../comun/monto";
import { borrarPago } from "./alquileres-api";
import { ESTADO_MES_UI, MEDIO_UI, estadoDelMes, faltaDelMes, textoPeriodo, ultimoPeriodo, type EstadoMes } from "./alquileres-ui";
import { colgarComprobante } from "./papeles-alquiler";
import { RegistrarPagoModal } from "./RegistrarPagoModal";

const FONDO: Record<EstadoMes, string> = {
  pagado: "border-[var(--data-success-500)] bg-[var(--data-success-50)]",
  parcial: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)]",
  atrasado: "border-[var(--data-error-500)] bg-[var(--data-error-50)]",
  por_pagar: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)]",
  sin_pago: "border-[var(--rule-base)]",
  futuro: "border-[var(--rule-base)]",
  fuera: "border-dashed border-[var(--rule-soft)] bg-[var(--surface-sunken)]",
};

interface Props {
  a: AlquilerDto;
  onCambiado: (a: AlquilerDto) => void;
}

export function AlquilerPagos({ a, onCambiado }: Props) {
  const mesHoy = hoyKey().slice(0, 7);
  const primero = Number(a.inicioEl.slice(0, 4));
  const ultimo = Number(ultimoPeriodo(a, mesHoy).slice(0, 4));
  const arranque = Number((a.resumen.proximoPeriodo ?? mesHoy).slice(0, 4));
  const [anio, setAnio] = useState(() => Math.min(Math.max(arranque, primero), ultimo));
  const [registrar, setRegistrar] = useState<string | null>(null);
  const [colgando, setColgando] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const pagoParaColgar = useRef<string | null>(null);
  const { confirm } = useConfirm();

  const porPeriodo = new Map(a.pagos.map((p) => [p.periodo, p]));
  const meses = MESES_NOMBRES.map((_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);

  const quitar = async (p: AlquilerPagoDto) => {
    const ok = await confirm({
      title: `¿Quitar el pago de ${textoPeriodo(p.periodo)}?`,
      description: `${monto(p.monto, a.moneda)} pagado el ${fechaCorta(p.pagadoEl)}. El mes vuelve a quedar sin pago; queda en el historial.`,
      intent: "danger",
      confirmLabel: "Quitar el pago",
    });
    if (!ok) return;
    const r = await borrarPago(a.id, p.id);
    if (!r.ok) return void toast.error(r.error);
    onCambiado(r.data.alquiler);
    toast.success(`Se quitó el pago de ${textoPeriodo(p.periodo)}`);
  };

  const subir = async (archivo: File | undefined) => {
    const pagoId = pagoParaColgar.current;
    if (archivoRef.current) archivoRef.current.value = "";
    if (!archivo || !pagoId) return;
    setColgando(pagoId);
    const r = await colgarComprobante(a, pagoId, archivo);
    setColgando(null);
    if (!r.ok) return void toast.error(r.error);
    onCambiado(r.alquiler);
    toast.success("Comprobante adjuntado");
  };

  return (
    <section className="space-y-3 border-t border-[var(--rule-soft)] pt-4" aria-label="Pagos mes a mes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3">Pagos mes a mes</CardTitle>
        <div className="flex items-center gap-1">
          <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={() => setAnio(anio - 1)} disabled={anio <= primero} aria-label="Año anterior" title="Año anterior">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <span className="min-w-14 text-center font-semibold tabular-nums text-[var(--text-primary)]" aria-live="polite">
            {anio}
          </span>
          <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={() => setAnio(anio + 1)} disabled={anio >= ultimo} aria-label="Año siguiente" title="Año siguiente">
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={button({ variant: "primary", className: "ml-2 max-sm:w-12 max-sm:px-0" })}
            onClick={() => a.resumen.proximoPeriodo && setRegistrar(a.resumen.proximoPeriodo)}
            disabled={!a.resumen.proximoPeriodo}
            title={a.resumen.proximoPeriodo ? `Registrar el pago de ${textoPeriodo(a.resumen.proximoPeriodo)}` : "No hay meses por pagar"}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Registrar pago</span>
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {meses.map((periodo) => {
          const estado = estadoDelMes(a, periodo, mesHoy);
          const pago = porPeriodo.get(periodo);
          const falta = faltaDelMes(a, periodo);
          const ui = ESTADO_MES_UI[estado];
          return (
            <li key={periodo} className={cn("flex min-h-28 flex-col gap-2 rounded-xl border p-3", FONDO[estado])}>
              <div className="flex items-start justify-between gap-1">
                <span className="font-semibold capitalize text-[var(--text-primary)]">{MESES_NOMBRES[Number(periodo.slice(5)) - 1]}</span>
                {pago && (
                  <ActionMenu
                    label="Más"
                    icon={MoreHorizontal}
                    soloIcono
                    size="md"
                    className="-mr-2 -mt-2 w-12 shrink-0"
                    title={`Más del pago de ${textoPeriodo(periodo)}`}
                    actions={[
                      pago.comprobanteDocumentId
                        ? { id: "ver", label: "Ver el comprobante", icon: Receipt, onSelect: () => window.open(enlaceDocumento(pago.comprobanteDocumentId ?? ""), "_blank", "noopener") }
                        : {
                            id: "adjuntar",
                            label: "Adjuntar el comprobante",
                            icon: Upload,
                            busy: colgando === pago.id,
                            onSelect: () => {
                              pagoParaColgar.current = pago.id;
                              archivoRef.current?.click();
                            },
                          },
                      { id: "quitar", label: "Quitar el pago", icon: Trash2, tone: "danger", onSelect: () => void quitar(pago) },
                    ]}
                  />
                )}
              </div>
              <Insignia tono={ui.tono} texto={ui.texto} />
              {pago ? (
                <span className="text-sm text-[var(--text-secondary)]">
                  <span className="block font-semibold tabular-nums text-[var(--text-primary)]">{monto(pago.monto, a.moneda)}</span>
                  {falta !== null && (
                    <span className="block font-semibold tabular-nums text-[var(--data-warning-700)]">Falta {monto(falta, a.moneda)}</span>
                  )}
                  <span className="block">
                    {fechaCorta(pago.pagadoEl)} · {MEDIO_UI[pago.medio]}
                  </span>
                </span>
              ) : (
                estado !== "fuera" && (
                  <button type="button" className={button({ variant: estado === "futuro" || estado === "sin_pago" ? "ghost" : "secondary", className: "mt-auto w-full" })} onClick={() => setRegistrar(periodo)}>
                    Registrar
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
      <input ref={archivoRef} type="file" className="sr-only" tabIndex={-1} accept="image/*,application/pdf" onChange={(e) => void subir(e.target.files?.[0])} />

      {registrar && <RegistrarPagoModal key={registrar} a={a} periodo={registrar} onRegistrado={onCambiado} onCerrar={() => setRegistrar(null)} />}
    </section>
  );
}
