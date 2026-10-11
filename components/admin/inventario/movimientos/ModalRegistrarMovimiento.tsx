"use client";

/**
 * Registrar una entrada o salida de stock — también una pérdida, con su causa.
 *
 * Había dos formularios para lo mismo: este (el kardex) y el de la pestaña
 * Pérdidas. Éste registraba la pérdida SIN causa y Pérdidas la mostraba como
 * «Rotura» aunque fuera un vencido; el otro guardaba como autor un texto libre
 * («Almacenero») en vez de quien inició sesión. Ahora es uno solo: la causa
 * viaja como `lossType` y el autor lo pone el servidor.
 */
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Plus, Search } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field } from "@/components/admin/shared/Field";
import {
  CAUSA,
  CAUSAS,
  TIPOS_DE_ENTRADA,
  TIPOS_DE_SALIDA,
  type Causa,
  type ProductoDeMovimiento,
} from "./tipos";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

const FIELD =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const LABEL = "mb-1.5 block text-sm font-semibold text-[var(--text-secondary)]";

interface Props {
  productos: ProductoDeMovimiento[];
  /** «Registrar pérdida» abre el mismo modal ya en Salida › Pérdida. */
  inicial?: { dir: "in" | "out"; type: string };
  onClose: () => void;
  onSaved: () => void;
}

export function ModalRegistrarMovimiento({ productos, inicial, onClose, onSaved }: Props) {
  const [dir, setDir] = useState<"in" | "out">(inicial?.dir ?? "in");
  const [type, setType] = useState<string>(inicial?.type ?? "compra");
  const [causa, setCausa] = useState<Causa>("expiry");
  const [productId, setProductId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  const [texto, setTexto] = useState("");
  const [psearch, setPsearch] = useState("");
  const [saving, setSaving] = useState(false);

  const tipos = dir === "in" ? TIPOS_DE_ENTRADA : TIPOS_DE_SALIDA;
  const esPerdida = type === "merma";
  const selected = productos.find((p) => p.id === productId) ?? null;
  const qn = Number(qty) || 0;
  const newStock = selected
    ? Math.max(0, dir === "in" ? selected.stock + qn : selected.stock - qn)
    : null;
  const matches = useMemo(() => {
    const q = psearch.toLowerCase();
    return (q ? productos.filter((p) => p.name.toLowerCase().includes(q)) : productos).slice(0, 8);
  }, [productos, psearch]);

  const elegirDir = (d: "in" | "out") => {
    setDir(d);
    setType(d === "in" ? "compra" : "ajuste_negativo");
  };

  const save = async () => {
    if (!productId) {
      toast.error("Elige un producto");
      return;
    }
    if (!Number.isInteger(qn) || qn <= 0) {
      toast.error("Pon una cantidad entera mayor que 0");
      return;
    }
    setSaving(true);
    try {
      const nota = texto.trim() || undefined;
      const res = await fetch("/api/inventory-movements", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        // En una pérdida el texto es «qué pasó» (notas, como guardaba Pérdidas);
        // en el resto, la referencia (N° de factura, proveedor).
        body: JSON.stringify({
          productId,
          type,
          quantity: qn,
          ...(esPerdida ? { lossType: causa, notes: nota } : { reference: nota }),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e?.error ?? "No se pudo registrar");
        return;
      }
      toast.success(
        esPerdida
          ? `Pérdida registrada: ${CAUSA[causa].label.toLowerCase()}`
          : dir === "in"
            ? "Entrada registrada"
            : "Salida registrada",
      );
      onSaved();
    } catch {
      toast.error("Sin conexión");
    } finally {
      setSaving(false);
    }
  };

  const tono =
    dir === "in"
      ? "text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";

  return (
    <AdminModal
      open
      onClose={onClose}
      title={esPerdida ? "Registrar pérdida" : "Registrar movimiento"}
      claveVentana="inventario-registrar-movimiento"
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
            {saving ? "Guardando…" : esPerdida ? "Registrar pérdida" : "Registrar"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["in", "Entrada", ArrowUpCircle],
              ["out", "Salida", ArrowDownCircle],
            ] as const
          ).map(([d, rotulo, Icono]) => (
            <button
              key={d}
              type="button"
              aria-pressed={dir === d}
              onClick={() => elegirDir(d)}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold transition-colors",
                dir !== d
                  ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  : d === "in"
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]",
              )}
            >
              <Icono className="h-4 w-4" aria-hidden /> {rotulo}
            </button>
          ))}
        </div>

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
                <span className="shrink-0 text-sm text-[var(--text-secondary)]">
                  stock {selected.stock} {selected.unit} · cambiar
                </span>
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
                          {p.stock} {p.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          }
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tipo" labelClassName={LABEL}>
            <select value={type} onChange={(e) => setType(e.target.value)} className={FIELD}>
              {tipos.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad" labelClassName={LABEL}>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className={FIELD}
            />
          </Field>
        </div>
        {esPerdida && (
          <Field label="Por qué se perdió" labelClassName={LABEL}>
            <select
              value={causa}
              onChange={(e) => setCausa(e.target.value as Causa)}
              className={FIELD}
            >
              {CAUSAS.map((c) => (
                <option key={c} value={c}>
                  {CAUSA[c].label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label={esPerdida ? "Qué pasó (opcional)" : "Referencia (opcional)"}
          labelClassName={LABEL}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={esPerdida ? 300 : 100}
            placeholder={
              esPerdida ? "Se cayó la caja al descargar…" : "N° de factura, proveedor, observación…"
            }
            className={FIELD}
          />
        </Field>

        {selected && qn > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
            <span className="text-sm font-bold text-[var(--text-secondary)]">
              Stock: {selected.stock} → <span className={tono}>{newStock}</span> {selected.unit}
            </span>
            <span className={cn("font-mono text-lg font-bold tabular-nums", tono)}>
              {dir === "in" ? `+${qn}` : `−${qn}`}
            </span>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
