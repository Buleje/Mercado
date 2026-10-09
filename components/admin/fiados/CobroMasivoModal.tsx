"use client";

/**
 * Ventana «Cobrar seleccionados» (cobro masivo): un monto que el servidor
 * reparte del fiado más viejo al más nuevo, con su medio y —si quieres— a la
 * caja abierta en la misma transacción. Salió de FiadoModals al sumarle medio
 * y caja (antes el cobro masivo no entraba a la caja ni guardaba el medio).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { m, AnimatePresence } from "@/components/admin/providers";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { useCajaAbierta } from "@/hooks/use-caja-abierta";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Banknote, CreditCard, DollarSign, Landmark, Loader2, Smartphone, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { ETIQUETA_METODO, type MetodoCobro } from "@/lib/fiados/cobro-metodo";
import type { DatosCobroMasivo, Reparto } from "./use-cobro-masivo";

const MEDIOS: { id: MetodoCobro; icon: typeof Banknote; corto: string }[] = [
  { id: "efectivo", icon: Banknote, corto: "Efectivo" },
  { id: "yape", icon: Smartphone, corto: "Yape" },
  { id: "plin", icon: Smartphone, corto: "Plin" },
  { id: "tarjeta", icon: CreditCard, corto: "Tarjeta" },
  { id: "transferencia", icon: Landmark, corto: "Transf." },
];

/** La misma preferencia que «Cobrar» de un cliente (PagoFiadoModal): el último medio vale para las dos. */
const CLAVE_PREF = "fiados-cobro-preferencia";
const INPUT = "w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30";

function leerPreferencia(): { metodo: MetodoCobro; aCaja: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(tenantCacheKey(CLAVE_PREF)) || "{}") as { metodo?: MetodoCobro; aCaja?: boolean };
    return { metodo: v.metodo && v.metodo in ETIQUETA_METODO ? v.metodo : "efectivo", aCaja: v.aCaja !== false };
  } catch {
    return { metodo: "efectivo", aCaja: true };
  }
}

/** Se monta sólo con la ventana abierta y «a la caja» marcado: lee la caja en ese momento. */
function AvisoSinCaja() {
  const { caja } = useCajaAbierta();
  if (!caja || caja.abierta) return null; // cargando o sin poder leer: no se afirma nada
  return (
    <p role="status" className="text-xs font-semibold text-[var(--data-warning-700)]">
      No hay caja abierta: el cobro se anota, pero no entra a la caja.
    </p>
  );
}

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  fiados: Array<{ id: string; customerId: string; customerName?: string; saldo: number }>;
  total: number;
  monto: string;
  setMonto: (v: string) => void;
  pagando: boolean;
  error: string | null;
  computeDistribution: (monto: number) => Reparto[];
  onCobrar: (datos: DatosCobroMasivo) => void;
};

export default function CobroMasivoModal({ abierto, onCerrar, fiados, total, monto, setMonto, pagando, error, computeDistribution, onCobrar }: Props) {
  const panelRef = useRef<HTMLFormElement>(null);
  const tituloId = useId();
  const [metodo, setMetodo] = useState<MetodoCobro>("efectivo");
  const [aCaja, setACaja] = useState(true);
  const [notas, setNotas] = useState("");
  const cerrar = useCallback(() => onCerrar(), [onCerrar]);
  // El Escape lo coordina FiadosModule (cuál ventana cierra primero).
  useModalAccesible(panelRef, { onCerrar: cerrar, activo: abierto, cerrarConEscape: false });
  const ventana = useVentanaDeModal(abierto, { ref: panelRef, aplicarTranslate: true, claveMemoria: "fiados-cobro-masivo" });

  useEffect(() => {
    if (!abierto) return;
    const pref = leerPreferencia();
    setMetodo(pref.metodo);
    setACaja(pref.aCaja);
    setNotas("");
  }, [abierto]);

  const montoNum = parseFloat(monto);
  const reparto = Number.isFinite(montoNum) && montoNum > 0 ? computeDistribution(montoNum) : [];
  const cobrado = Math.round(reparto.reduce((s, d) => s + d.pago * 100, 0)) / 100;
  const sobrante = Number.isFinite(montoNum) ? Math.round((montoNum - cobrado) * 100) / 100 : 0;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    try { localStorage.setItem(tenantCacheKey(CLAVE_PREF), JSON.stringify({ metodo, aCaja })); } catch { /* sin memoria: igual cobra */ }
    onCobrar({ metodo, aCaja, notas });
  };

  return (
    <AnimatePresence>
      {abierto && (
        <>
          <m.div key="cobro-masivo-fondo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 60 }} onClick={cerrar} />
          <m.div
            key="cobro-masivo-ventana"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && !ventana.fijado && cerrar()}
          >
            <form ref={panelRef} onSubmit={enviar} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1}
              className="relative max-h-[85vh] w-full max-w-[28rem] space-y-4 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
              <div {...ventana.asaProps} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle as="h2" id={tituloId} className="font-display text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">Cobrar seleccionados</CardTitle>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {fiados.length} fiado{fiados.length !== 1 ? "s" : ""} · deben <span className="font-bold text-[var(--data-error-500)]">{formatCurrency(total)}</span>
                  </p>
                </div>
                <span className="ml-auto flex items-center gap-1">
                  <ControlesDeVentana ventana={ventana} />
                  <button type="button" aria-label="Cerrar" onClick={cerrar} className="rounded-xl p-1.5 hover:bg-[var(--rule-soft)]">
                    <X className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </span>
              </div>

              <Field label="Monto que pagan (S/)" labelClassName="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                <div className="flex gap-2">
                  <input type="number" inputMode="decimal" step="0.01" min="0.01" value={monto} autoFocus
                    onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className={cn(INPUT, "flex-1 font-mono text-base")} />
                  <button type="button" onClick={() => setMonto(total.toFixed(2))} className="h-11 rounded-xl bg-[var(--surface-sunken)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]">Todo</button>
                </div>
              </Field>

              {reparto.length > 0 && (
                <div className="space-y-1.5 rounded-xl bg-[var(--surface-sunken)] p-3">
                  <p className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                    Así se reparte
                    <InfoTip
                      title="Reparto del cobro"
                      what="El monto paga primero el fiado más antiguo y lo que sobra pasa al siguiente."
                      example="Pagan S/ 50 y deben S/ 30 (marzo) y S/ 40 (abril): marzo queda pagado y abril baja a S/ 20."
                    />
                  </p>
                  {reparto.map((d) => (
                    <div key={d.fiadoId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-[var(--text-primary)]">{d.customerName}</span>
                      <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">
                        {formatCurrency(d.pago)}
                        <span className="ml-1 font-normal text-[var(--text-tertiary)]">{d.tipo === "Pago completo" ? "· queda pagado" : `· de ${formatCurrency(d.saldo)}`}</span>
                      </span>
                    </div>
                  ))}
                  {fiados.filter((f) => !reparto.some((d) => d.fiadoId === f.id)).map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
                      <span className="truncate">{f.customerName || f.customerId}</span>
                      <span className="shrink-0">no alcanza · queda en {formatCurrency(f.saldo)}</span>
                    </div>
                  ))}
                  {sobrante >= 0.01 && (
                    <p className="text-xs font-semibold text-[var(--data-warning-700)]">Sobran {formatCurrency(sobrante)}: los elegidos deben menos. Eso no se cobra.</p>
                  )}
                </div>
              )}

              <fieldset>
                <legend className="mb-1 text-xs font-bold text-[var(--text-secondary)]">¿Cómo pagan?</legend>
                {/* flex y no grid: el panel es un <form> y en móvil `form .grid` (globals.css) lo apila en 1 columna. */}
                <div className="flex gap-1.5" role="radiogroup">
                  {MEDIOS.map(({ id, icon: Icono, corto }) => (
                    <button key={id} type="button" role="radio" aria-checked={metodo === id} aria-label={ETIQUETA_METODO[id]} title={ETIQUETA_METODO[id]} onClick={() => setMetodo(id)}
                      className={cn(
                        "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-0.5 text-xs font-bold transition-colors",
                        metodo === id
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
                      )}>
                      <Icono className="h-4 w-4" aria-hidden />
                      {corto}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <input type="checkbox" checked={aCaja} onChange={(e) => setACaja(e.target.checked)} className="h-4 w-4 rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                    Anotar en la caja abierta
                  </label>
                  <InfoTip
                    title="Anotar en la caja"
                    what="Lo cobrado entra como ingreso de la caja del turno, con su medio: un ingreso por cliente."
                    affects="Sólo el efectivo suma a lo que tienes que contar al cerrar; Yape, Plin, tarjeta y transferencia quedan anotados aparte."
                    example="Rosa y Juan pagan S/ 20 y S/ 15 en efectivo: la caja espera S/ 35 más en el arqueo."
                  />
                </div>
                {aCaja && <AvisoSinCaja />}
              </div>

              <Field label="Nota (opcional)" labelClassName="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={400} placeholder="Ej: lo trajo el cobrador" className={INPUT} />
              </Field>

              {error && <p role="alert" className="text-xs font-semibold text-[var(--data-error-500)]">{error}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={cerrar} className="flex-1 rounded-xl bg-[var(--rule-soft)] px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--rule-base)]">
                  Cancelar
                </button>
                <button type="submit" disabled={pagando || cobrado < 0.01} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
                  {pagando ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                  Cobrar {cobrado >= 0.01 ? formatCurrency(cobrado) : ""}
                </button>
              </div>
              <TiradorDeVentana ventana={ventana} />
            </form>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
