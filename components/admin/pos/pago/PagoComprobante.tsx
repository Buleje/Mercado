"use client";

import { Receipt } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { isValidRuc, type ComprobanteTipo } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/** Tarjeta Comprobante: ticket, boleta, factura (RUC), cotización, proforma. */
export default function PagoComprobante({ p }: { p: PagoModal }) {
  const { comprobanteTipo, setComprobanteTipo, comprobanteRuc, setComprobanteRuc, rucError, setRucError } = p;
  return (
    <>
            <div className="lg:col-span-4 min-w-0 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--rule-soft)] flex items-center gap-2.5">
                <span className="h-8 w-8 rounded-full bg-[var(--data-warning-500)]/15 flex items-center justify-center text-[var(--data-warning-500)]">
                  <Receipt className="h-4 w-4" />
                </span>
                <Kicker as="h3" className="libro-kicker">Comprobante</Kicker>
              </div>
              <div className="px-4 py-3 space-y-3 min-w-0">

          {/* Tipo de comprobante */}
          <div>
            {/*
              Brandon 2026-05-16 v2: grid 3 columnas fijo en lugar de
              flex-wrap, así los chips Ticket/Boleta/Factura quedan
              en la primera fila y Cotización/Proforma en la segunda,
              sin solaparse aunque la columna sea estrecha.
            */}
            <div className="grid grid-cols-3 gap-1.5">
              {(["ticket", "boleta", "factura", "cotizacion", "proforma"] as ComprobanteTipo[]).map(
                (tipo) => {
                  const labels: Record<ComprobanteTipo, string> = {
                    ticket: "Ticket",
                    boleta: "Boleta",
                    factura: "Factura",
                    cotizacion: "Cotización",
                    proforma: "Proforma",
                  };
                  return (
                    <button
                      key={tipo}
                      onClick={() => {
                        setComprobanteTipo(tipo);
                        if (tipo !== "factura") {
                          setComprobanteRuc("");
                          setRucError("");
                        }
                      }}
                      className={cn(
                        "py-2 rounded-xl text-xs font-semibold border transition-all truncate",
                        comprobanteTipo === tipo
                          ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] ring-1 ring-primary/20"
                          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-gray-300 hover:text-[var(--text-primary)]"
                      )}
                    >
                      {labels[tipo]}
                    </button>
                  );
                }
              )}
            </div>
            {(comprobanteTipo === "cotizacion" || comprobanteTipo === "proforma") && (
              <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-2 font-medium">
                Se generará {comprobanteTipo === "cotizacion" ? "cotización" : "proforma"} con los items del carrito
              </p>
            )}
            {comprobanteTipo === "factura" && (
              <div className="mt-3">
                <input
                  type="text"
                  value={comprobanteRuc}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                    setComprobanteRuc(v);
                    if (v.length === 11 && !isValidRuc(v)) {
                      setRucError(
                        "RUC debe empezar con 10 (persona) o 20 (empresa)"
                      );
                    } else {
                      setRucError("");
                    }
                  }}
                  placeholder="RUC (11 dígitos)"
                  aria-label="RUC de la factura"
                  inputMode="numeric"
                  maxLength={11}
                  className={cn(
                    "w-full px-3 h-11 rounded-xl border text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none transition-colors",
                    rucError
                      ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)]"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] focus:border-primary"
                  )}
                />
                {rucError && (
                  <p className="text-sm text-[var(--data-error-500)] mt-1.5">{rucError}</p>
                )}
                {comprobanteRuc.length > 0 &&
                  comprobanteRuc.length < 11 && (
                    <p className="text-sm text-[var(--text-tertiary)] mt-1.5">
                      {11 - comprobanteRuc.length} dígitos restantes
                    </p>
                  )}
              </div>
            )}
          </div>
              </div>{/* fin contenido card Comprobante */}
            </div>{/* fin Card Comprobante */}
    </>
  );
}
