"use client";

/**
 * GastoEditarModal — corregir (o borrar) un gasto operativo.
 *
 * El historial era de sólo lectura: un monto mal tipeado o una categoría
 * equivocada obligaban a irse a otro módulo, borrar el gasto y volver a
 * cargarlo entero. La ficha ya mostraba todos los datos; lo único que faltaba
 * era poder tocarlos.
 *
 * Sólo aplica a `source === "expense"`. Una compra a proveedor, un flete, un
 * adelanto o un retiro de caja se corrigen en el módulo que los emitió — acá
 * son un reflejo, y editarlos por este lado dejaría los dos lados en desacuerdo.
 */

import { useState } from "react";
import { undoToast } from "@buleje/design-system";
import { AlertTriangle, Loader2, Save, Trash2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { PAYMENT_METHOD_LABELS, type ExpensePaymentMethod } from "@/lib/expense-meta";
import { borrarGasto, restaurarGasto } from "./restaurar";
import { fmt, type HistorialItem } from "./shared";

/** `YYYY-MM-DD` en hora local: con `toISOString()` el día se corre en Perú. */
function comoFechaInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

const INPUT =
  "mt-1 h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white px-3 text-base text-[var(--text-primary)] outline-none focus:border-primary/60 dark:bg-[var(--color-card)]";

export default function GastoEditarModal({
  item, categorias, onGuardado, onClose,
}: {
  item: HistorialItem;
  /** Las categorías que ya existen, para no inventar una nueva por un typo. */
  categorias: string[];
  onGuardado: () => void;
  onClose: () => void;
}) {
  const [descripcion, setDescripcion] = useState(item.description);
  const [monto, setMonto] = useState(String(item.amount));
  const [categoria, setCategoria] = useState(item.category);
  const [fecha, setFecha] = useState(() => comoFechaInput(item.fecha));
  const [metodo, setMetodo] = useState<string>(item.meta?.paymentMethod ?? "");
  const [proveedor, setProveedor] = useState(item.supplierName ?? "");
  const [notas, setNotas] = useState(item.meta?.notes ?? "");

  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoNum = Number(monto.replace(",", "."));
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;

  const guardar = async () => {
    if (!montoValido) { setError("El monto tiene que ser un número mayor que cero."); return; }
    setGuardando(true);
    setError(null);

    // Se manda SÓLO lo que cambió. Importa: los gastos viejos (pre-ADR-374)
    // guardan metadata serializada dentro de `description`, así que reescribirla
    // sin necesidad borraría la frecuencia o el día de pago que sólo viven ahí.
    const patch: Record<string, unknown> = {};
    if (descripcion !== item.description) patch.description = descripcion;
    if (montoNum !== item.amount) patch.amount = montoNum;
    if (categoria !== item.category) patch.category = categoria;
    if (fecha !== comoFechaInput(item.fecha)) {
      const [y, m, d] = fecha.split("-").map(Number);
      patch.date = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).toISOString();
    }
    if (metodo !== (item.meta?.paymentMethod ?? "")) patch.paymentMethod = metodo || null;
    if (proveedor !== (item.supplierName ?? "")) patch.supplierName = proveedor || null;
    if (notas !== (item.meta?.notes ?? "")) patch.notes = notas || null;

    if (Object.keys(patch).length === 0) { setGuardando(false); onClose(); return; }

    try {
      const res = await fetch(`/api/expenses/${item.refId}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onGuardado();
      onClose();
    } catch (err) {
      console.warn("[GastoEditarModal] guardar falló", err);
      setError("No se pudo guardar el cambio. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      const borrado = await borrarGasto(item.refId);
      onGuardado();
      onClose();
      // El undo de 5 segundos es lo que reemplaza al «¿estás seguro?»: la
      // acción se completa al toque y el arrepentimiento tiene una salida
      // (patrón `undoToast` del DS).
      undoToast({
        message: "Gasto borrado",
        description: `${item.description || "Sin descripción"} · ${fmt(item.amount)}`,
        onUndo: async () => {
          try {
            await restaurarGasto(borrado);
            onGuardado();
          } catch (err) {
            console.warn("[GastoEditarModal] restaurar falló", err);
          }
        },
      });
    } catch (err) {
      console.warn("[GastoEditarModal] borrar falló", err);
      setError("No se pudo borrar el gasto. Intentá de nuevo.");
      setBorrando(false);
    }
  };

  const ocupado = guardando || borrando;

  return (
    <AdminModal
      open
      onClose={ocupado ? () => {} : onClose}
      variant="wide"
      title="Corregir gasto"
      description={`Registrado el ${new Date(item.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })} · ${fmt(item.amount)}`}
      footer={
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          {/* Sin «¿estás seguro?»: borra y deja 5 segundos para deshacer, que
              es más rápido de usar y más difícil de perder que un diálogo. */}
          <button
            type="button"
            onClick={borrar}
            disabled={ocupado}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--data-error-500)]/40 px-3 text-sm font-bold text-[var(--data-error-500)] transition-colors hover:bg-[var(--data-error-500)]/10 disabled:opacity-50"
          >
            {borrando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            Borrar
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={ocupado}
              className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={ocupado || !montoValido}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Guardar
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo label="Descripción">
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="En qué se gastó"
              className={INPUT}
            />
          </Campo>
        </div>

        <Campo label="Monto">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={`${INPUT} tabular-nums`}
            aria-invalid={!montoValido}
          />
        </Campo>

        <Campo label="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${INPUT} tabular-nums`} />
        </Campo>

        <Campo label="Categoría">
          {/* `datalist` y no `select`: las categorías son libres, pero ofrecer
              las que ya existen evita crear «Transporte » con espacio al final. */}
          <input
            type="text"
            list="historial-categorias"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={INPUT}
          />
          <datalist id="historial-categorias">
            {categorias.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Campo>

        <Campo label="Método de pago">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={INPUT}>
            <option value="">Sin especificar</option>
            {(Object.keys(PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[]).map((k) => (
              <option key={k} value={k}>{PAYMENT_METHOD_LABELS[k]}</option>
            ))}
          </select>
        </Campo>

        <div className="sm:col-span-2">
          <Campo label="Proveedor o a quién se le pagó">
            <input type="text" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={INPUT} />
          </Campo>
        </div>

        <div className="sm:col-span-2">
          <Campo label="Notas">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white px-3 py-2 text-base text-[var(--text-primary)] outline-none focus:border-primary/60 dark:bg-[var(--color-card)]"
            />
          </Campo>
        </div>

        {!montoValido && (
          <p className="text-sm font-semibold text-[var(--data-error-500)] sm:col-span-2" role="alert">
            El monto tiene que ser un número mayor que cero.
          </p>
        )}

        {error && (
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-error-500)] sm:col-span-2" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden />{error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
