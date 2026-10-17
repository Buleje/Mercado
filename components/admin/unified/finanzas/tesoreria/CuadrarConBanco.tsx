"use client";

/**
 * «Cuadrar con el banco» (Mi Plata › Tesorería): subes el extracto que bajaste
 * del BCP, Interbank o BBVA y ves qué coincide con lo que anotó el sistema, qué
 * está sólo en el banco, qué está sólo en el sistema y qué cruzó con otro monto.
 * v1 sólo muestra: no guarda nada ni toca saldos.
 */

import { useState } from "react";
import { Loader2, Upload } from "@buleje/design-system/icons";
import AdminModal, { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { button } from "@/components/ui-system/button-variants";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { CuentaTesoreria } from "@/hooks/use-tesoreria";
import CuadroDelBanco from "@/components/admin/unified/finanzas/tesoreria/CuadroDelBanco";
import { useCuadrarConBanco } from "@/components/admin/unified/finanzas/tesoreria/use-cuadrar-con-banco";

const ES_BANCO = new Set(["BANCO_AHORRO", "BANCO_CORRIENTE"]);
const AVISO_ERROR = "rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

export default function CuadrarConBanco({ open, onClose, cuentas }: { open: boolean; onClose: () => void; cuentas: CuentaTesoreria[] }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cuentaId, setCuentaId] = useState("");
  const [conVentas, setConVentas] = useState(true);
  const { resultado, error, cargando, cuadrar, limpiar } = useCuadrarConBanco();
  /* Primero las de banco (es lo que se cuadra); las demás también, por si el extracto es de la billetera. */
  const opciones = [...cuentas.filter((c) => c.activa && ES_BANCO.has(c.tipo)), ...cuentas.filter((c) => c.activa && !ES_BANCO.has(c.tipo))];

  const cerrar = () => {
    limpiar();
    setArchivo(null);
    onClose();
  };

  return (
    <AdminModal open={open} onClose={cerrar} variant="wide" title="Cuadrar con el banco">
      <div className={cn(MODAL_GUTTER, "space-y-4 py-5")}>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (archivo) void cuadrar({ archivo, cuentaId, conVentas });
          }}
        >
          <label className={button({ variant: "secondary", className: "min-w-0 max-w-full cursor-pointer rounded-xl" })}>
            <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{archivo ? archivo.name : "Elegir el extracto"}</span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                limpiar();
              }}
            />
          </label>
          <InfoTip
            title="El extracto del banco"
            what="El archivo de movimientos que bajas de la banca por internet: CSV o Excel (.xlsx) del BCP, Interbank, BBVA o Scotiabank. Se reconocen solas las columnas Fecha, Descripción, Monto (o Cargo y Abono) y N° de operación."
            affects="Se cruza con lo que anotó el sistema en esas fechas: la cuenta de Tesorería y, si lo dejas prendido, lo cobrado por Yape, Plin, tarjeta o transferencia en ventas, caja y pedidos. No se guarda nada."
            example="Un Yape de S/ 25,50 del 15/10 en el BCP coincide con la venta de S/ 25,50 de ese día. Un abono de tarjeta por S/ 95,50 contra una venta de S/ 100 sale «con diferencia» (la comisión)."
          />
          <select
            aria-label="Cuenta del extracto"
            value={cuentaId}
            onChange={(e) => {
              setCuentaId(e.target.value);
              /* Con una cuenta de banco elegida y varias en el negocio, no se sabe a
                 cuál cae cada Yape o tarjeta: sumar las ventas por defecto las daría
                 «sólo en el sistema». Una billetera cruza sólo su medio (el servidor). */
              const elegida = opciones.find((c) => c.id === e.target.value);
              const bancos = opciones.filter((c) => ES_BANCO.has(c.tipo)).length;
              setConVentas(!elegida || elegida.tipo === "MONEDERO_DIGITAL" || (ES_BANCO.has(elegida.tipo) && bancos <= 1));
              limpiar();
            }}
            className={cn(CAMPO_INPUT, "h-12 w-full sm:w-auto sm:min-w-[12rem] sm:flex-1")}
          >
            <option value="">Todas tus cuentas de banco</option>
            {opciones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <button type="submit" aria-disabled={!archivo || cargando} disabled={!archivo || cargando} className={button({ variant: "primary", className: "rounded-xl" })}>
            {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Cuadrar
          </button>
          <Interruptor
            className="w-full"
            enabled={conVentas}
            onChange={(v) => {
              setConVentas(v);
              limpiar();
            }}
            label="Sumar lo cobrado por Yape, Plin, tarjeta y transferencia"
            desc="Las ventas, la caja y los pedidos de esas fechas, además de la cuenta de Tesorería."
          />
        </form>

        {error && <p className={AVISO_ERROR}>{error}</p>}
        {!resultado && !error && !cargando && (
          <p className="text-sm text-[var(--text-secondary)]">Elige el extracto que bajaste del banco y toca «Cuadrar».</p>
        )}
        {resultado && <CuadroDelBanco key={`${resultado.periodo.desde}-${resultado.banco.movimientos}`} resultado={resultado} />}
      </div>
    </AdminModal>
  );
}
