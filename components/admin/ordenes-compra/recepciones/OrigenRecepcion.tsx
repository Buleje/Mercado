"use client";

import { ClipboardList, PackageOpen } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { claveDeDia, diaCorto, lineasDeSeguimiento } from "@/lib/compras/ciclo-oc";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MOTIVOS_SIN_ORDEN, itemsDeOrden, type PendingOC } from "@/components/admin/ordenes-compra/recepciones/tipos";
import type { NuevaRecepcion as Estado } from "@/components/admin/ordenes-compra/recepciones/use-nueva-recepcion";

const CAMPO = "w-full mt-1 px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm";

/** «Distribuidora ABC · jueves 10/09 · faltan 2 de 5 productos · S/ 320.00» — sin el código interno. */
function rotuloDeOrden(oc: PendingOC): string {
  const lineas = lineasDeSeguimiento(itemsDeOrden(oc), oc.seguimiento);
  const faltan = lineas.filter((l) => l.falta > 0).length;
  const dia = oc.createdAt ? claveDeDia(oc.createdAt) : null;
  const productos = faltan < lineas.length
    ? `faltan ${faltan} de ${lineas.length} productos`
    : `${lineas.length} producto${lineas.length === 1 ? "" : "s"}`;
  return [oc.supplierName || "Sin proveedor", dia ? `pedida el ${diaCorto(dia)}` : null, productos, oc.total ? formatCurrency(Number(oc.total)) : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * C18 · Contra qué llega la mercadería: una orden pendiente (se elige por
 * proveedor y día, no por su código) o «Sin orden» con su motivo. Antes había
 * un campo libre «Nro. Orden de Compra» obligatorio: sin orden la recepción
 * nunca se guardaba (el botón no hacía nada).
 */
export default function OrigenRecepcion({ n }: { n: Estado }) {
  const { origen, cambiarOrigen, pendingOCs, selectedOcId, applyOC, motivo, setMotivo, motivoOtro, setMotivoOtro } = n;
  const opcion = (valor: typeof origen, rotulo: string, Icono: typeof ClipboardList) => (
    <button
      type="button"
      aria-pressed={origen === valor}
      onClick={() => cambiarOrigen(valor)}
      data-qa={`origen-${valor}`}
      className={cn(
        "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
        origen === valor
          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
      )}
    >
      <Icono className="h-4 w-4" aria-hidden /> {rotulo}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2" role="group" aria-label="Contra qué llega">
        {opcion("orden", "Contra una orden", ClipboardList)}
        {opcion("sin_orden", "Sin orden", PackageOpen)}
      </div>

      {origen === "orden" && (pendingOCs.length > 0 ? (
        <Field label="Orden que llegó" labelClassName="text-sm font-semibold text-[var(--text-secondary)]">
          <select value={selectedOcId} onChange={(e) => applyOC(e.target.value)} className={CAMPO} data-qa="elegir-orden">
            <option value="">— Elige la orden —</option>
            {pendingOCs.map((oc) => <option key={oc.id} value={oc.id}>{rotuloDeOrden(oc)}</option>)}
          </select>
        </Field>
      ) : (
        <p role="status" className="text-sm text-[var(--text-secondary)]">
          No hay órdenes esperando mercadería. Si llegó algo igual, marca «Sin orden».
        </p>
      ))}

      {origen === "sin_orden" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="¿Por qué llega sin orden?" labelClassName="text-sm font-semibold text-[var(--text-secondary)]">
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CAMPO} data-qa="motivo-sin-orden">
              <option value="">— Elige el motivo —</option>
              {MOTIVOS_SIN_ORDEN.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="otro">Otro…</option>
            </select>
          </Field>
          {motivo === "otro" && (
            <Field label="Cuéntalo en pocas palabras" labelClassName="text-sm font-semibold text-[var(--text-secondary)]">
              <input value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value.slice(0, 120))} placeholder="Ej.: lo dejó el vendedor para probar" className={CAMPO} />
            </Field>
          )}
          <p className="flex items-center gap-1 text-sm font-semibold text-[var(--data-warning-ink)] sm:col-span-2">
              No suma al stock ni a lo que debes
              <InfoTip
                title="Recepción sin orden"
                what="Queda anotado qué llegó, de quién y por qué. El stock y las cuentas por pagar sólo se mueven cuando la mercadería llega contra una orden."
                affects="Si quieres que entre al stock, crea la orden primero (Órdenes › Nueva orden) y recíbela contra ella."
                example="El proveedor dejó 2 muestras de champú: «Sin orden» › «Regalo o muestra del proveedor»."
              />
          </p>
        </div>
      )}
    </div>
  );
}
