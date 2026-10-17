"use client";

import { SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useId, useRef, useState } from "react";
import { X, ChevronRight, ChevronLeft, Check, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { errorDeVencimiento } from "@/lib/compras/lotes-recepcion";
import { faltaConformidad, notasConConformidad, pereciblesSinVence } from "@/lib/compras/conformidad-recepcion";
import { useControlesDeProductos } from "@/components/admin/ordenes-compra/recepciones/use-controles-de-productos";
import { lineasDeSeguimiento, type SeguimientoOC } from "@/lib/compras/ciclo-oc";
import { conVence, type CondicionItem, type OCItem, type ReceivedItem } from "./oc-recepcion-tipos";
import OCRecepcionPaso1 from "./OCRecepcionPaso1";
import OCRecepcionPaso2 from "./OCRecepcionPaso2";
import OCRecepcionPaso3 from "./OCRecepcionPaso3";

interface OCRecepcionModalProps {
  ocId: string;
  /**
   * Nombre del proveedor. El endpoint lo exige (`supplier`, requerido): sin él
   * el POST volvía 400 «Datos inválidos» SIEMPRE, así que este botón nunca
   * llegó a registrar una recepción.
   */
  supplier: string;
  items: OCItem[];
  /**
   * C19 · Lo que ya llegó por recepciones anteriores. Con esto cada línea se
   * precarga con lo que FALTA (no con lo pedido entero) y las completas no se
   * vuelven a contar: antes un segundo viaje sugería recibir todo de nuevo.
   */
  seguimiento?: SeguimientoOC;
  onComplete: () => void;
  onClose: () => void;
}

/**
 * «Recibir la orden» en 3 pasos (contar → precios de la factura → confirmar).
 * Cada paso vive en `OCRecepcionPaso{1,2,3}.tsx` y los tipos en `oc-recepcion-tipos.ts`;
 * acá queda el estado, la validación y el POST a `/api/compras/recepciones`.
 */
export default function OCRecepcionModal({ ocId, supplier, items, seguimiento, onComplete, onClose }: OCRecepcionModalProps) {
  useScrollLock(true);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalAccesible(panelRef, { onCerrar: onClose, activo: true });
  const ventana = useVentanaDeModal(true, { ref: panelRef, aplicarTranslate: true, claveMemoria: "oc-recepcion" });

  const [step, setStep] = useState(1);
  const [lineas] = useState(() => lineasDeSeguimiento(items, seguimiento));
  /** Lo que ya llegó entero: no se vuelve a contar. */
  const completos = lineas.filter((l) => l.falta <= 0);
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(() =>
    items.flatMap((i, idx) => (lineas[idx].falta <= 0 ? [] : [{
      productId: i.productId,
      name: i.name,
      orderedQty: lineas[idx].falta,
      yaLlego: lineas[idx].llego,
      pedidoTotal: i.quantity,
      receivedQty: lineas[idx].falta,
      unitPrice: i.unitCost,
      originalPrice: i.unitCost,
      unit: i.unit,
      noLlego: false,
      condition: "ok" as CondicionItem,
    }])),
  );
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateItem = (idx: number, patch: Partial<ReceivedItem>) => {
    setReceivedItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, ...patch };
        if (patch.noLlego !== undefined) {
          updated.receivedQty = patch.noLlego ? 0 : item.orderedQty;
        }
        return updated;
      }),
    );
  };

  const totalFactura = receivedItems.reduce(
    (sum, i) => sum + i.receivedQty * i.unitPrice,
    0,
  );

  const itemsConDiferencia = receivedItems.filter(
    (i) => i.receivedQty !== i.orderedQty,
  );

  const itemsRecibidos = receivedItems.filter((i) => i.receivedQty > 0);
  /** Una fecha de vencimiento imposible frena el paso (el servidor la rechazaría). */
  const venceConError = receivedItems.some((i) => conVence(i) && errorDeVencimiento(i.expiryDate ?? "") !== null);
  /* C22: un servicio se acepta por alcance y responsable (no hace lote); un perecible pide su vence. */
  const controlDe = useControlesDeProductos();
  const controles = receivedItems.map((i) => controlDe(i.productId));
  const lineasC22 = receivedItems.map((i) => ({ ...i, product: i.name, receivedQty: i.noLlego ? 0 : i.receivedQty }));
  const faltaC22 = faltaConformidad(lineasC22, controles);
  const sinVence = pereciblesSinVence(lineasC22, controles);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);

    try {
      // El shape es el que valida `RecepcionSchema` en el endpoint, no el que
      // parecía razonable desde acá: `orderRef` (no `ocId`), `supplier`
      // requerido, y cada ítem con `product` (el nombre) además del id. Mandar
      // otra cosa devolvía 400 en cada intento.
      const res = await fetch("/api/compras/recepciones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orderRef: ocId,
          supplier,
          items: receivedItems
            .filter((i) => i.receivedQty > 0 || i.noLlego)
            .map((i) => ({
              product: i.name,
              productId: i.productId,
              expectedQty: i.orderedQty,
              receivedQty: i.receivedQty,
              // Lo que no llegó se declara como faltante: es la diferencia que
              // el proveedor tiene que responder, no una recepción normal de 0.
              condition: i.noLlego ? "faltante" : i.condition,
              notes: controlDe(i.productId) === "servicio" ? notasConConformidad("", i) : "",
              ...(conVence(i) && controlDe(i.productId) !== "servicio" ? { expiryDate: i.expiryDate, lote: i.lote } : {}),
            })),
          status: receivedItems.some((i) => i.noLlego || i.condition !== "ok" || i.receivedQty !== i.orderedQty)
            ? "parcial"
            : "aceptada",
          nonConformities: receivedItems.filter((i) => i.noLlego || i.condition !== "ok").length,
          // `notes`, no `notas`: con el nombre en castellano Zod lo descartaba
          // y la anotación de la recepción se perdía sin decir nada.
          notes: notas || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al procesar recepcion");
        setSaving(false);
        return;
      }

      onComplete();
    } catch {
      setError("Sin conexión con el servidor: no se guardó la recepción");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div {...ventana.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          <div>
            <SectionTitle id={titleId} className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              Recibir la orden
            </SectionTitle>
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
              {supplier} · Paso {step} de 3
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
            <button type="button" aria-label="Cerrar" onClick={onClose} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--rule-soft)] transition-colors">
              <X className="h-5 w-5 text-[var(--text-secondary)]" />
            </button>
          </span>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 py-2 gap-1 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-colors",
                s <= step ? "bg-primary" : "bg-[var(--rule-base)] ",
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step 1: Verify Items */}
          {step === 1 && (
            <OCRecepcionPaso1
              completos={completos}
              receivedItems={receivedItems}
              controles={controles}
              faltaC22={faltaC22}
              error={error}
              setError={setError}
              updateItem={updateItem}
            />
          )}

          {/* Step 2: Adjust Prices */}
          {step === 2 && (
            <OCRecepcionPaso2 receivedItems={receivedItems} totalFactura={totalFactura} updateItem={updateItem} />
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <OCRecepcionPaso3
              receivedItems={receivedItems}
              itemsRecibidos={itemsRecibidos}
              itemsConDiferencia={itemsConDiferencia}
              totalFactura={totalFactura}
              sinVence={sinVence}
              notas={notas}
              setNotas={setNotas}
              error={error}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => { setError(null); setStep((s) => s + 1); }}
              disabled={step === 1 && (venceConError || receivedItems.length === 0 || faltaC22 !== null)}
              title={step === 1 && venceConError ? "Corrige la fecha de vencimiento marcada en rojo" : step === 1 && faltaC22 ? faltaC22 : undefined}
              className="flex items-center gap-1 px-4 min-h-12 bg-[var(--accent-dark)] hover:brightness-110 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              Siguiente <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={saving || itemsRecibidos.length === 0}
              className="flex items-center gap-2 px-4 min-h-12 bg-[var(--accent-dark)] hover:brightness-110 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar recepción
            </button>
          )}
        </div>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
