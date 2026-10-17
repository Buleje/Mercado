"use client";

/**
 * El detalle de una guía (panel a la derecha): a quién va, por dónde, quién la
 * lleva, qué lleva y en qué estado está. Desde acá se duplica (borrador), se
 * anula (pide el motivo) y se imprime.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { Copy, Package, Printer, Truck, User, X, XCircle } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { button } from "@/components/ui-system/button-variants";
import { useMembrete } from "@/hooks/use-membrete";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOTON_ICONO, CAMPO } from "./estilos";
import { unidadLegible } from "./guia-unidades";
import { GuiaTimeline } from "./GuiaTimeline";
import { printGuiaSunat } from "./imprimir-guia";
import { getPlaca, MOTIVO_ROTULO, STATUS_META, type GuiaRemision } from "./tipos";

interface Props {
  guia: GuiaRemision;
  onCerrar: () => void;
  onDuplicar: () => Promise<void>;
  onAnular: (motivo: string) => Promise<void>;
}

function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-[var(--text-tertiary)]">{rotulo}</p>
      <p className="break-words text-sm text-[var(--text-primary)]">{children}</p>
    </div>
  );
}

function Avatar({ children }: { children: ReactNode }) {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)]">{children}</span>;
}

export function GuiaDetalle({ guia, onCerrar, onDuplicar, onAnular }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const membrete = useMembrete();

  useModalAccesible(ref, { onCerrar, activo: true, cerrarConEscape: false });
  /* Escape cierra primero «Anular» (que se abre encima) y después el panel. */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (anulando) setAnulando(false);
      else onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [anulando, onCerrar]);

  const corre = async (accion: () => Promise<void>, fallo: string) => {
    setOcupado(true);
    setAviso(null);
    try { await accion(); } catch { setAviso(fallo); } finally { setOcupado(false); }
  };

  const meta = STATUS_META[guia.status];
  const placa = getPlaca(guia);
  const items = guia.items ?? [];
  const sinPeso = items.filter((it) => !it.pesoUnitario || it.pesoUnitario <= 0).length;
  const pesoTotal = items.reduce((s, it) => s + it.cantidad * (it.pesoUnitario || 0), 0);

  return (
    <>
      <m.div key="grr-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 40 }} onClick={onCerrar} />
      <m.div key="grr-panel" ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 250 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle id={titleId} className="font-display font-mono text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">{guia.numero}</CardTitle>
              <p className="text-sm text-[var(--text-tertiary)]">Creada: {formatDateTime(guia.createdAt)}</p>
            </div>
            <div className="flex items-center gap-1">
              {guia.status === "BORRADOR" && (
                <AdminTooltip content="Crear una copia de esta guía">
                  <button type="button" onClick={() => corre(onDuplicar, "No se pudo duplicar la guía.")} disabled={ocupado} aria-label="Duplicar" className={BOTON_ICONO}>
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                </AdminTooltip>
              )}
              {guia.status !== "ANULADA" && guia.status !== "ENTREGADA" && (
                <AdminTooltip content="Anular la guía">
                  <button type="button" onClick={() => setAnulando(true)} aria-label="Anular" className={cn(BOTON_ICONO, "text-[var(--data-error-ink)]")}>
                    <XCircle className="h-4 w-4" aria-hidden />
                  </button>
                </AdminTooltip>
              )}
              <button type="button" aria-label="Cerrar" onClick={onCerrar} className={BOTON_ICONO}><X className="h-5 w-5" aria-hidden /></button>
            </div>
          </div>

          {anulando && (
            <div role="group" aria-label="Anular guía" className="space-y-3 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-4">
              <p className="text-sm font-semibold text-[var(--data-error-ink)]">¿Anular la guía {guia.numero}? Queda en tu historial como anulada.</p>
              <input autoFocus type="text" aria-label="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (lo pide SUNAT): p. ej. «se canceló el envío»" className={CAMPO} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setAnulando(false)} className={button({ variant: "secondary", className: "flex-1 rounded-xl" })}>Volver</button>
                <button type="button" disabled={ocupado || !motivo.trim()}
                  onClick={() => corre(async () => { await onAnular(motivo.trim()); setAnulando(false); setMotivo(""); }, "No se pudo anular la guía.")}
                  className={button({ variant: "danger", className: "flex-1 rounded-xl" })}>Anular guía</button>
              </div>
            </div>
          )}
          {aviso && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{aviso}</p>}

          <div className="space-y-3 rounded-xl bg-[var(--surface-sunken)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-[var(--text-primary)]">{guia.destinatarioNombre}</p>
                {guia.destinatarioRuc && <p className="text-sm text-[var(--text-secondary)]">RUC: {guia.destinatarioRuc}</p>}
              </div>
              <span className={cn("shrink-0 rounded-lg px-2 py-1 text-sm font-bold", meta.bg, meta.color)}>{meta.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--rule-base)] pt-3">
              <Dato rotulo="Motivo">{MOTIVO_ROTULO[guia.motivoTraslado] ?? guia.motivoTraslado}</Dato>
              <Dato rotulo="Fecha de traslado">{formatDate(guia.fechaTraslado)}</Dato>
              <Dato rotulo="Origen">{guia.puntoPartida}</Dato>
              <Dato rotulo="Destino">{guia.puntoLlegada}</Dato>
            </div>
          </div>

          <section className="space-y-2 border-t border-[var(--rule-base)] pt-3">
            <BlockTitle>Transporte</BlockTitle>
            {guia.transportistaNombre ? (
              <div className="flex items-center gap-3">
                <Avatar><Truck className="h-4 w-4" aria-hidden /></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{guia.transportistaNombre}</p>
                  {guia.transportistaRuc && <p className="text-sm text-[var(--text-tertiary)]">RUC: {guia.transportistaRuc}</p>}
                </div>
                <span className={cn("rounded-lg px-2 py-1 text-sm font-bold", placa ? "bg-[var(--data-success-100)] text-[var(--data-success-ink)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]")}>
                  {placa || "Sin placa"}
                </span>
              </div>
            ) : (
              <p className="text-sm italic text-[var(--text-tertiary)]">Sin transportista asignado</p>
            )}
            {(guia.conductorNombre || guia.conductorDni) && (
              <div className="flex items-center gap-3">
                <Avatar><User className="h-4 w-4" aria-hidden /></Avatar>
                <div className="min-w-0 flex-1">
                  {guia.conductorNombre && <p className="text-sm font-medium text-[var(--text-primary)]">{guia.conductorNombre}</p>}
                  {guia.conductorDni && <p className="text-sm text-[var(--text-tertiary)]">DNI: {guia.conductorDni}</p>}
                </div>
              </div>
            )}
          </section>

          {(guia.bultos != null || guia.documentoRef || guia.pesoTotal != null || guia.pesoBruto != null) && (
            <section className="grid grid-cols-2 gap-3 border-t border-[var(--rule-base)] pt-3">
              {guia.bultos != null && <Dato rotulo="Bultos">{guia.bultos}</Dato>}
              {guia.documentoRef && <Dato rotulo="Doc. de referencia">{guia.documentoRef}</Dato>}
              {guia.pesoTotal != null && <Dato rotulo="Peso neto">{Number(guia.pesoTotal).toFixed(2)} kg</Dato>}
              {guia.pesoBruto != null && <Dato rotulo="Peso bruto">{Number(guia.pesoBruto).toFixed(3)} kg</Dato>}
            </section>
          )}

          <section className="border-t border-[var(--rule-base)] pt-3">
            <BlockTitle className="mb-2">Estados</BlockTitle>
            <GuiaTimeline guia={guia} />
          </section>

          <section>
            <BlockTitle className="mb-2">Qué lleva</BlockTitle>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3">
                  <Avatar><Package className="h-4 w-4" aria-hidden /></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.descripcion}</p>
                    <p className="text-sm text-[var(--text-tertiary)]">{item.cantidad} {unidadLegible(item.unidad).toLowerCase()}{item.pesoUnitario ? ` · ${item.pesoUnitario} kg` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)]">Peso total</span>
              <span className="text-lg font-extrabold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{pesoTotal > 0 ? `${pesoTotal.toFixed(1)} kg` : "Sin datos de peso"}</span>
            </div>
            {sinPeso > 0 && <p className="mt-1 text-sm text-[var(--data-warning-ink)]">{sinPeso} ítem{sinPeso !== 1 ? "s" : ""} sin peso registrado</p>}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className={button({ variant: "secondary", className: "flex-1 rounded-xl" })}>
              <Printer className="h-4 w-4" aria-hidden /> Imprimir
            </button>
            <button type="button" onClick={() => printGuiaSunat(guia, formatDate, membrete)} className={button({ variant: "primary", className: "flex-1 rounded-xl" })}>
              <Printer className="h-4 w-4" aria-hidden /> GRR SUNAT
            </button>
          </div>
        </div>
      </m.div>
    </>
  );
}
