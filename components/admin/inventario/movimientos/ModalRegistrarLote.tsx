"use client";

/** Registrar un lote con fecha de vencimiento (Vencimientos). Movido de `SimpleExpiryTab`, a 48 px. */
import { useMemo, useState } from "react";
import { Loader2, Plus, Search } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field } from "@/components/admin/shared/Field";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

type Producto = { id: number; name: string; unit: string };

const FIELD =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const LABEL = "mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]";

export function ModalRegistrarLote({
  productos,
  onClose,
  onSaved,
}: {
  productos: Producto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState<number | "">("");
  const [psearch, setPsearch] = useState("");
  const [lote, setLote] = useState("");
  const [qty, setQty] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = productos.find((p) => p.id === productId) ?? null;
  const matches = useMemo(() => {
    const q = psearch.toLowerCase();
    return (q ? productos.filter((p) => p.name.toLowerCase().includes(q)) : productos).slice(0, 8);
  }, [productos, psearch]);

  const save = async () => {
    if (!selected) {
      toast.error("Elige un producto");
      return;
    }
    if (!expiry) {
      toast.error("Pon la fecha de vencimiento");
      return;
    }
    if ((Number(qty) || 0) <= 0) {
      toast.error("Pon la cantidad");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          // `expiry` es «AAAA-MM-DD»: `new Date(expiry)` es la medianoche UTC de ese día, que es como se guarda.
          lote: lote.trim() || `L-${expiry}`,
          productName: selected.name,
          productId: selected.id,
          quantity: Number(qty),
          unit: selected.unit,
          entryDate: new Date().toISOString(),
          expiryDate: new Date(expiry).toISOString(),
          costUnit: cost ? Number(cost) : 0,
          supplierName: supplier.trim(),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e?.error ?? "No se pudo registrar");
        return;
      }
      toast.success("Lote registrado");
      onSaved();
    } catch {
      toast.error("Sin conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Registrar lote"
      claveVentana="inventario-registrar-lote"
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={button({ variant: "primary", className: "gap-2" })}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            )}
            {saving ? "Guardando…" : "Registrar lote"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <Field label="Producto" labelClassName={LABEL}>
          {(id) =>
            selected ? (
              <button
                type="button"
                onClick={() => {
                  setProductId("");
                  setPsearch("");
                }}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-[var(--accent)] bg-primary/10 px-3.5 py-2 text-left"
              >
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {selected.name}
                </span>
                <span className="shrink-0 text-sm text-[var(--text-secondary)]">cambiar</span>
              </button>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
                    aria-hidden
                  />
                  <input
                    id={id}
                    value={psearch}
                    onChange={(e) => setPsearch(e.target.value)}
                    placeholder="Buscar producto…"
                    className={cn(FIELD, "pl-9")}
                    autoFocus
                  />
                </div>
                {matches.length > 0 && (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--rule-base)]">
                    {matches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProductId(p.id)}
                        className="flex min-h-12 w-full items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-3 text-left last:border-0 hover:bg-[var(--surface-sunken)]"
                      >
                        <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {p.name}
                        </span>
                        <span className="shrink-0 text-sm text-[var(--text-secondary)]">
                          {p.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          }
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="N° de lote" labelClassName={LABEL}>
            <input
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="automático"
              className={FIELD}
            />
          </Field>
          <Field label="Cantidad" labelClassName={LABEL}>
            <input
              type="number"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className={FIELD}
            />
          </Field>
          <Field label="Vence el *" labelClassName={LABEL}>
            <input
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="Costo unitario (S/)" labelClassName={LABEL}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className={FIELD}
            />
          </Field>
          <Field label="Proveedor (opcional)" labelClassName={LABEL} className="col-span-2">
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Distribuidora…"
              className={FIELD}
            />
          </Field>
        </div>
      </div>
    </AdminModal>
  );
}
