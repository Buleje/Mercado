"use client";

import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { CreditCard } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { FORMAS_DE_PAGO } from "@/lib/compras/estados-oc";
import {
  armarDescripcion, descripcionALaVista, revisarAlta, type CuentaComparable, type DatosDeOrigen, type OrdenSinCuenta,
} from "@/lib/compras/referencia-documento";
import { formatCurrency } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import OrigenCuentaCampos, { CAMPO, ROTULO } from "./OrigenCuentaCampos";
import { venceConCredito, type CuentaPorPagar } from "./resumen-cuentas";
import type { NuevaCuenta, ProveedorBasico, ResultadoAccion } from "./use-cuentas-por-pagar";

const ORIGEN_VACIO: DatosDeOrigen = { origen: "documento", tipo: "factura", serie: "", numero: "", emitida: "", ordenId: "", nota: "" };
const AVISO = {
  error: "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  aviso: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
};

/**
 * Alta a mano de una cuenta por pagar (las de una OC a crédito nacen solas).
 * Se elige de dónde sale (C41) y el papel con serie y número (C42). La misma
 * factura u orden con el mismo proveedor no se carga dos veces: la ventana lo
 * avisa antes y el servidor lo frena igual. El mismo importe sólo avisa.
 */
export default function NuevaCuentaModal({ proveedores, cuentas, saving, onCrear, onCerrar }: {
  proveedores: ProveedorBasico[];
  /** Las cuentas ya cargadas: para avisar de un duplicado sin esperar al servidor. */
  cuentas: CuentaPorPagar[];
  saving: boolean;
  onCrear: (f: NuevaCuenta) => Promise<ResultadoAccion>;
  onCerrar: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [origen, setOrigen] = useState<DatosDeOrigen>(ORIGEN_VACIO);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const formId = useId();
  const hoy = limaDateKey();

  // Últimos valores que puso el sistema: si el campo tiene otro, lo escribiste tú y no se pisa.
  const autoVence = useRef("");
  const autoMonto = useRef("");
  const [lineaVence, setLineaVence] = useState<string | null>(null);

  const ponerVence = (fecha: string, linea: string) => {
    if (dueDate !== "" && dueDate !== autoVence.current) return;
    autoVence.current = fecha;
    setDueDate(fecha);
    setLineaVence(linea);
  };

  /** Elegir proveedor llena «Vence» con sus días de crédito y suelta la orden elegida (era de otro). */
  const elegirProveedor = (id: string) => {
    setSupplierId(id);
    setOrigen((o) => ({ ...o, ordenId: "", ordenDocumento: undefined }));
    if (id) {
      const s = venceConCredito(hoy, proveedores.find((p) => p.id === id)?.diasCredito);
      ponerVence(s.fecha, s.linea);
    }
  };

  /** La orden trae su total y, si fue a crédito, su vencimiento desde el día de la orden. */
  const elegirOrden = (o: OrdenSinCuenta | null) => {
    if (!o) return;
    if (amount === "" || amount === autoMonto.current) {
      autoMonto.current = String(o.total);
      setAmount(String(o.total));
    }
    const forma = FORMAS_DE_PAGO.find((f) => f.id === o.condicion);
    if (forma && forma.dias > 0) {
      ponerVence(venceConCredito(o.fecha, forma.dias).fecha, `${forma.label.toLowerCase()} desde la orden`);
    }
  };

  const armada = armarDescripcion(origen);
  const descripcion = "texto" in armada ? armada.texto : "";
  const monto = Number(amount);
  const revision = useMemo(
    () => (supplierId
      ? revisarAlta({ supplierId, description: descripcion, amount: monto, purchaseOrderId: origen.origen === "orden" ? origen.ordenId : null }, cuentas)
      : { mismoDocumento: null, mismaOrden: null, mismoImporte: [] }),
    [supplierId, descripcion, monto, origen.origen, origen.ordenId, cuentas],
  );
  const repetida = revision.mismaOrden ?? revision.mismoDocumento;
  const faltaOrigen = "error" in armada ? armada.error : null;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setErrorServidor(null);
    if (!supplierId || !(monto > 0) || faltaOrigen || repetida) return;
    const r = await onCrear({
      supplierId,
      amount,
      dueDate,
      description: descripcion,
      purchaseOrderId: origen.origen === "orden" ? origen.ordenId : undefined,
    });
    if (r.ok) onCerrar();
    else setErrorServidor(r.error);
  };

  const lineaRepetida = (c: CuentaComparable) =>
    `${descripcionALaVista(c.description, c.purchaseOrderId) || "Sin detalle"} · ${formatCurrency(c.amount)}`;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Nueva cuenta por pagar"
      icon={CreditCard}
      size="lg"
      claveVentana="cuentas-por-pagar-nueva"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button type="submit" form={formId} disabled={saving || !!repetida} className={button({ variant: "primary" })}>
            {saving ? "Guardando…" : "Crear cuenta"}
          </button>
        </ModalFooter>
      }
    >
      <form id={formId} onSubmit={enviar} noValidate className={`space-y-4 ${MODAL_BODY}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Proveedor *" labelClassName={ROTULO}>
            <select required value={supplierId} onChange={(e) => elegirProveedor(e.target.value)} className={CAMPO}>
              <option value="">Elige el proveedor</option>
              {proveedores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Monto (S/) *" labelClassName={ROTULO}>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={CAMPO}
            />
          </Field>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className={cn(ROTULO, "mb-0")}>De dónde sale</span>
            <InfoTip
              title="De dónde sale la deuda"
              what="Con la serie y el número del comprobante, la misma factura no se anota dos veces con el mismo proveedor (F1-123 y F001-00000123 son la misma)."
              affects="Las órdenes a crédito crean su cuenta solas; aquí salen las de este proveedor que todavía no tienen una. Si la orden llega después, vincúlala desde el ⋯ de la cuenta."
              example="Factura F001-123 de S/ 350 emitida el jueves 10/10 → se guarda como «Factura F001-123 · emitida jueves 10/10»."
            />
          </div>
          <OrigenCuentaCampos
            d={origen}
            setD={(c) => setOrigen((o) => ({ ...o, ...c }))}
            proveedorId={supplierId}
            onElegirOrden={elegirOrden}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Vence el"
            labelClassName={ROTULO}
            hint={lineaVence && dueDate === autoVence.current ? lineaVence : undefined}
          >
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={CAMPO} />
          </Field>
          {descripcion && (
            <div className="self-end pb-3 text-sm text-[var(--text-secondary)]">
              Se guarda como <strong className="text-[var(--text-primary)]">{descripcion}</strong>
            </div>
          )}
        </div>

        {repetida && (
          <p role="alert" className={cn("rounded-xl border px-4 py-3 text-sm font-semibold", AVISO.error)}>
            {revision.mismaOrden ? "Esa orden ya tiene su cuenta" : "Ese comprobante ya está anotado con este proveedor"}: {lineaRepetida(repetida)}. No se crea otra.
          </p>
        )}
        {!repetida && revision.mismoImporte.length > 0 && (
          <p role="status" className={cn("rounded-xl border px-4 py-3 text-sm font-semibold", AVISO.aviso)}>
            Ya le debes {revision.mismoImporte.length === 1 ? "una cuenta" : `${revision.mismoImporte.length} cuentas`} del mismo monto: {revision.mismoImporte.slice(0, 2).map(lineaRepetida).join("; ")}. Revisa que no sea la misma.
          </p>
        )}
        {intentado && (faltaOrigen || !supplierId || !(monto > 0)) && (
          <p role="alert" className={cn("rounded-xl border px-4 py-3 text-sm font-semibold", AVISO.error)}>
            {!supplierId ? "Elige el proveedor." : !(monto > 0) ? "Escribe el monto de la deuda." : faltaOrigen}
          </p>
        )}
        {errorServidor && (
          <p role="alert" className={cn("rounded-xl border px-4 py-3 text-sm font-semibold", AVISO.error)}>{errorServidor}</p>
        )}
      </form>
    </AdminModal>
  );
}
