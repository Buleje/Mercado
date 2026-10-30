"use client";

/**
 * CtpDespachoViajePrecioModal — «Poner precio a este viaje».
 *
 * El dueño escribe el total de la venta (y, si quiere, el N.º de la factura y
 * el monto de la liquidación). La tabla PREVISUALIZA cuánto le toca a cada
 * línea por volumen; el reparto que vale es el del servidor (regla 6), que usa
 * la misma función (`repartirPrecioViaje`). Si la factura y la liquidación no
 * cuadran, se dice cuánto falta.
 */

import { useMemo, useState } from "react";
import { DataTable, SuccessAlert, WarningAlert } from "@buleje/design-system";
import { Banknote, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import {
  diaCorto,
  diferenciaConLiquidacion,
  gtfCorta,
  leerSoles,
  repartirPrecioViaje,
  type ViajeDeDespacho,
} from "@/lib/forestal/despacho-viaje";
import { Btn, Field, I } from "./ctp-shared";

/** «S/» y la cifra nunca se parten en dos renglones (espacio duro). */
const soles = (n: number) => `S/\u00a0${formatNumber(n, 2)}`;

export default function CtpDespachoViajePrecioModal({
  despachoId,
  viaje,
  onClose,
  onGuardado,
}: {
  despachoId: string;
  viaje: ViajeDeDespacho;
  onClose: () => void;
  onGuardado: (aviso: string) => void;
}) {
  const yaTienePrecio = viaje.lineas.some((l) => l.valorVenta != null);
  const comprobantePrevio = viaje.lineas.find((l) => l.comprobante)?.comprobante ?? "";
  const [totalTexto, setTotalTexto] = useState("");
  const [comprobante, setComprobante] = useState(comprobantePrevio);
  const [liquidacionTexto, setLiquidacionTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = leerSoles(totalTexto);
  const liquidacion = leerSoles(liquidacionTexto);
  const reparto = useMemo(() => (total != null ? repartirPrecioViaje(total, viaje.lineas) : null), [total, viaje.lineas]);
  const montoDe = new Map(reparto?.ok ? reparto.lineas.map((l) => [l.id, l.monto]) : []);
  const dif = total != null && liquidacion != null ? diferenciaConLiquidacion(total, liquidacion) : null;

  async function guardar() {
    if (total == null) return setError("Escribe el total de la venta en soles, por ejemplo 26234.67.");
    if (liquidacionTexto.trim() && liquidacion == null) return setError("El monto de la liquidación no se entiende: escríbelo como 26234.67.");
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: despachoId,
          action: "precio_viaje",
          total,
          ...(comprobante.trim() ? { comprobante: comprobante.trim() } : {}),
          liquidacion,
          reemplazar: yaTienePrecio || (Boolean(comprobantePrevio) && comprobante.trim() !== comprobantePrevio),
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.message ?? `HTTP ${r.status}`);
      const lineas = (json.reparto?.lineas ?? []).filter((l: { monto: number | null }) => l.monto != null).length;
      onGuardado(
        `Precio puesto: ${soles(json.reparto?.total ?? total)} en ${lineas} líneas, ${soles(json.reparto?.precioPorPt ?? 0)} por PT.` +
          (json.diferencia?.texto ? ` ${String(json.diferencia.texto).replace(/S\/ /g, "S/\u00a0")}` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const base = reparto?.ok ? reparto.base : null;
  return (
    <AdminModal
      open
      aboveModals
      onClose={onClose}
      title="Poner precio a este viaje"
      description={`Viaje del ${diaCorto(viaje.dia)} · GTF ${viaje.guias.map(gtfCorta).join(", ") || "—"} · ${viaje.lineas.length} ${viaje.lineas.length === 1 ? "línea" : "líneas"}`}
      icon={Banknote}
      size="lg"
      footer={
        <ModalFooter error={error} nota={reparto?.ok ? `${soles(reparto.total)} · ${soles(reparto.precioPorPt)} por PT` : undefined}>
          <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={guardando || !reparto?.ok} onClick={() => void guardar()}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {yaTienePrecio ? "Cambiar el precio" : "Poner precio"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Total de la venta (S/)" required hint="Lo que se cobra por todo el viaje." ejemplo="26234.67">
            <input className={I} inputMode="decimal" autoFocus value={totalTexto} onChange={(e) => setTotalTexto(e.target.value)} placeholder="26234.67" />
          </Field>
          <Field label="Factura o boleta" hint="El N.º que emitió SUNAT. Queda anotado en cada guía del viaje." ejemplo="E001-318">
            <input className={I} value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="E001-318" maxLength={24} />
          </Field>
          <Field label="Monto de la liquidación (S/)" hint="Sólo para comparar con la factura: no se guarda como precio." ejemplo="26234.67">
            <input className={I} inputMode="decimal" value={liquidacionTexto} onChange={(e) => setLiquidacionTexto(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        {yaTienePrecio && (
          <WarningAlert>Este viaje ya tiene precio. Guardar lo cambia en todas sus líneas.</WarningAlert>
        )}
        {dif && (dif.estado === "cuadra" ? (
          <SuccessAlert>Cuadra con la liquidación.</SuccessAlert>
        ) : (
          <WarningAlert>
            {dif.estado === "falta"
              ? `Faltan ${soles(dif.diferencia)} por facturar.`
              : `La factura pasa a la liquidación por ${soles(-dif.diferencia)}.`}
          </WarningAlert>
        ))}
        {reparto && !reparto.ok && reparto.motivo === "sin_volumen" && (
          <WarningAlert>Ninguna línea tiene PT ni m³: no hay cómo repartir el precio.</WarningAlert>
        )}
        {reparto?.ok && reparto.base === "m3" && (
          <WarningAlert>Una línea no tiene PT anotado: el precio se reparte por m³.</WarningAlert>
        )}

        <div className="overflow-x-auto">
          <DataTable className="w-full">
            <thead>
              <tr>
                <th>Línea</th>
                <th className="max-sm:hidden">GTF</th>
                <th>Producto</th>
                <th className="text-right">{base === "m3" ? "m³" : "PT"}</th>
                <th className="text-right">Le toca</th>
              </tr>
            </thead>
            <tbody>
              {viaje.lineas.map((l) => {
                const monto = montoDe.get(l.id);
                const volumen = base === "m3" ? l.m3 : l.pt;
                return (
                  <tr key={l.id}>
                    <td className="font-mono font-bold">#{l.lineNo}</td>
                    <td className="font-mono max-sm:hidden">{l.gtfNumber ? gtfCorta(l.gtfNumber) : "—"}</td>
                    <td>{[l.productType, l.speciesCommon].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="text-right font-mono tabular-nums">{volumen != null ? formatNumber(volumen, base === "m3" ? 3 : 2) : "—"}</td>
                    <td className="whitespace-nowrap text-right font-mono tabular-nums">
                      {monto != null ? soles(monto) : l.valorVenta != null ? <span className="text-[var(--text-tertiary)]">{soles(l.valorVenta)}</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      </div>
    </AdminModal>
  );
}
