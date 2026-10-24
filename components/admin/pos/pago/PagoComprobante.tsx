"use client";

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { isValidRuc, type ComprobanteTipo } from "@/components/admin/pos/pago/pago-shared";
import { AVISO_DNI_BOLETA } from "@/lib/sunat/boleta-dni";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

const PRINCIPALES: ComprobanteTipo[] = ["ticket", "boleta", "factura"];
const OTROS: ComprobanteTipo[] = ["cotizacion", "proforma"];
const ETIQUETA: Record<ComprobanteTipo, string> = {
  ticket: "Ticket",
  boleta: "Boleta",
  factura: "Factura",
  cotizacion: "Cotización",
  proforma: "Proforma",
};

const SEGMENTO =
  "flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const SEGMENTO_ELEGIDO = "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-sm ring-1 ring-primary/40";
const SEGMENTO_LIBRE = "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]";

/**
 * Comprobante en una fila segmentada: Ticket · Boleta · Factura · Más ▾
 * (Cotización y Proforma, que casi no se usan, en una segunda fila que abre
 * «Más»). Cada tipo pide lo mismo que antes: RUC la factura, DNI la boleta grande.
 */
export default function PagoComprobante({ p }: { p: PagoModal }) {
  const { comprobanteTipo, setComprobanteTipo, comprobanteRuc, setComprobanteRuc, rucError, setRucError, comprobanteDni, setComprobanteDni, pideDni } = p;
  const esOtro = OTROS.includes(comprobanteTipo);
  const [verOtros, setVerOtros] = useState(esOtro);
  const elegir = (tipo: ComprobanteTipo) => {
    setComprobanteTipo(tipo);
    if (tipo !== "factura") {
      setComprobanteRuc("");
      setRucError("");
    }
  };
  const segmento = (tipo: ComprobanteTipo) => (
    <button
      key={tipo}
      type="button"
      onClick={() => elegir(tipo)}
      aria-pressed={comprobanteTipo === tipo}
      className={cn(SEGMENTO, comprobanteTipo === tipo ? SEGMENTO_ELEGIDO : SEGMENTO_LIBRE)}
    >
      <span className="truncate">{ETIQUETA[tipo]}</span>
    </button>
  );
  return (
    <>
            <div className="min-w-0 space-y-2">
              <Kicker as="h3">Comprobante</Kicker>
          <div>
            <div role="group" aria-label="Tipo de comprobante" className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-1">
              {PRINCIPALES.map(segmento)}
              <button
                type="button"
                onClick={() => setVerOtros((v) => !v)}
                aria-expanded={verOtros || esOtro}
                className={cn(SEGMENTO, esOtro ? SEGMENTO_ELEGIDO : SEGMENTO_LIBRE)}
              >
                <span className="truncate">{esOtro ? ETIQUETA[comprobanteTipo] : "Más"}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", (verOtros || esOtro) && "rotate-180")} aria-hidden />
              </button>
            </div>
            {(verOtros || esOtro) && (
              <div role="group" aria-label="Otros documentos" className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-1">
                {OTROS.map(segmento)}
              </div>
            )}
            {(comprobanteTipo === "cotizacion" || comprobanteTipo === "proforma") && (
              <p className="text-sm text-[var(--data-warning-ink)] mt-2 font-medium">
                Se generará {comprobanteTipo === "cotizacion" ? "cotización" : "proforma"} con los artículos del carrito
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
                    "w-full px-3 h-11 rounded-xl border bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none transition-colors",
                    rucError
                      ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)]"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] focus:border-primary"
                  )}
                />
                {rucError && (
                  <p className="text-sm text-[var(--data-error-ink)] mt-1.5">{rucError}</p>
                )}
                {comprobanteRuc.length > 0 &&
                  comprobanteRuc.length < 11 && (
                    <p className="text-sm text-[var(--text-tertiary)] mt-1.5">
                      {11 - comprobanteRuc.length} dígitos restantes
                    </p>
                  )}
              </div>
            )}
            {/* SUNAT: la boleta de más de S/ 700 lleva el DNI del cliente. Por debajo no se pide. */}
            {pideDni && (
              <div className="mt-3">
                <input
                  type="text"
                  value={comprobanteDni}
                  onChange={(e) => setComprobanteDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="DNI del cliente (8 dígitos)"
                  aria-label="DNI del cliente para la boleta"
                  aria-describedby="pos-aviso-dni-boleta"
                  inputMode="numeric"
                  maxLength={8}
                  className="w-full px-3 h-11 rounded-xl border border-[var(--data-warning-500)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-primary"
                />
                <p id="pos-aviso-dni-boleta" className="text-sm text-[var(--data-warning-ink)] mt-1.5">
                  {comprobanteDni.length > 0 && comprobanteDni.length < 8
                    ? `Faltan ${8 - comprobanteDni.length} dígitos. ${AVISO_DNI_BOLETA}`
                    : AVISO_DNI_BOLETA}
                </p>
              </div>
            )}
          </div>
            </div>
    </>
  );
}
