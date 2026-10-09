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
 * El comprobante (tipo, N°, RUC, IGV, foto) también se corrige acá: antes, un
 * gasto guardado sin factura se quedaba así para siempre, y su IGV nunca
 * llegaba a «IGV del mes › compras». La lógica vive en `use-gasto-editar`.
 */

import { AlertTriangle, Loader2, Save, Trash2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import ComprobanteCampos from "@/components/admin/gastos/ComprobanteCampos";
import { PAYMENT_METHOD_LABELS, type ExpensePaymentMethod } from "@/lib/expense-meta";
import { fmt, type HistorialItem } from "./shared";
import { useGastoEditar } from "./use-gasto-editar";
import { formatDate } from "@/lib/format";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

const INPUT =
  "mt-1 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-primary/60 ";

export default function GastoEditarModal({
  item, categorias, onGuardado, onClose,
}: {
  item: HistorialItem;
  /** Las categorías que ya existen, para no inventar una nueva por un typo. */
  categorias: string[];
  onGuardado: () => void;
  onClose: () => void;
}) {
  const g = useGastoEditar(item, onGuardado, onClose);
  const {
    descripcion, setDescripcion, monto, setMonto, categoria, setCategoria, fecha, setFecha,
    metodo, setMetodo, proveedor, setProveedor, notas, setNotas, montoValido, error, guardar, borrar,
    guardando, borrando, ocupado,
  } = g;

  return (
    <AdminModal
      open
      onClose={ocupado ? () => {} : onClose}
      variant="wide"
      title="Corregir gasto"
      description={`Registrado el ${formatDate(item.fecha)} · ${fmt(item.amount)}`}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {/* Sin «¿estás seguro?»: borra y deja 5 segundos para deshacer, que
              es más rápido de usar y más difícil de perder que un diálogo. */}
          <button
            type="button"
            onClick={borrar}
            disabled={ocupado}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--data-error-500)]/40 px-3 text-sm font-semibold text-[var(--data-error-500)] transition-colors hover:bg-[var(--data-error-500)]/10 disabled:opacity-50"
          >
            {borrando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            Borrar
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={ocupado}
              className="inline-flex h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={ocupado || !montoValido}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Guardar
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 px-5 py-5 sm:px-6">
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

        {/* Con papel, «a quién le pagaste» va dentro del comprobante (mismo dato). */}
        {!g.conPapel && (
          <div className="sm:col-span-2">
            <Campo label="Proveedor o a quién se le pagó">
              <input type="text" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={INPUT} />
            </Campo>
          </div>
        )}

        <div className="sm:col-span-2">
          {g.papelListo ? (
            <ComprobanteCampos g={g.comprobante} />
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 py-3 text-sm text-[var(--text-secondary)]">
              {g.papelError ? (
                <><AlertTriangle className="h-4 w-4 text-[var(--data-error-500)]" aria-hidden />No se pudo leer el comprobante: el resto se corrige igual.</>
              ) : (
                <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Leyendo el comprobante…</>
              )}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <Campo label="Notas">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--text-primary)] outline-none focus:border-primary/60 "
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
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{error.texto}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
