"use client";

/**
 * «¿De quién es esta madera?» al declarar una producción (ADR-429).
 *
 * Obligatorio y sin valor inicial: un aserradero que presta servicio no es
 * dueño de lo que produce, y suponer «propia» es la respuesta que después nadie
 * revisa (ver `tanda-valor-inicial-destructivo`).
 *
 *  - **Madera propia (para vender)**: el precio de cada especie es de VENTA.
 *  - **Servicio de aserrío a un tercero**: se elige su cuenta —o se crea acá
 *    mismo, con el editor único de partes encima— y el cargo lo hace el
 *    servidor (`cobrarCorrida`, uno por corrida). La vista previa usa la misma
 *    cotización: lo que se lee acá es lo que se va a cargar.
 */
import { useState } from "react";
import { Receipt, UserPlus, Warehouse } from "@buleje/design-system/icons";
import { ETIQUETA_SERVICIO, type TipoServicio } from "@/lib/forestal/declarar-produccion";
import { formatCurrency } from "@/lib/format";
import CtpCobroAserrio, { type DirectorioForestal } from "./CtpCobroAserrio";
import CtpParteModal from "./CtpParteModal";
import { Btn } from "./ctp-shared";

const OPCIONES: { tipo: TipoServicio; Icono: typeof Warehouse; detalle: string }[] = [
  {
    tipo: "propia",
    Icono: Warehouse,
    detalle:
      "Es del centro. Pon el precio de venta de cada especie: valoriza lo producido y se propone al despachar.",
  },
  {
    tipo: "tercero",
    Icono: Receipt,
    detalle:
      "La madera es de un cliente. Elige su cuenta y el precio: la deuda queda cargada en su cuenta.",
  },
];

export default function CtpServicioProduccion({
  servicio,
  onServicio,
  parteId,
  onParte,
  fecha,
  directorio,
  cargo,
}: {
  servicio: TipoServicio | null;
  onServicio: (t: TipoServicio) => void;
  parteId: string | null;
  onParte: (id: string | null) => void;
  fecha: string;
  /** La libreta que comparte con el selector: la cuenta recién creada aparece elegida al toque. */
  directorio: DirectorioForestal;
  /** Tercero: la suma de lo que se cargaría y las especies que no se cobran. */
  cargo: { total: number | null; sinImporte: string[] };
}) {
  const [creando, setCreando] = useState(false);
  const cliente = parteId ? (directorio.partes.find((p) => p.id === parteId) ?? null) : null;

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="sr-only">Tipo de servicio</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPCIONES.map(({ tipo, Icono, detalle }) => {
            const activo = servicio === tipo;
            return (
              <label
                key={tipo}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-[var(--accent-muted)] ${
                  activo
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--rule-base)] hover:border-[var(--accent)]"
                }`}
              >
                <input
                  type="radio"
                  name="servicio-de-la-produccion"
                  value={tipo}
                  checked={activo}
                  onChange={() => onServicio(tipo)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <Icono
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                  aria-hidden
                />
                <span className="min-w-0 text-sm font-bold text-[var(--text-primary)]">
                  {ETIQUETA_SERVICIO[tipo]}
                  <span className="mt-0.5 block text-xs font-normal leading-snug text-[var(--text-secondary)]">
                    {detalle}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {servicio === "tercero" && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <CtpCobroAserrio
              soloDueno
              directorio={directorio}
              fecha={fecha}
              bloques={[]}
              valor={{ duenoParteId: parteId, precioManualPt: null }}
              onChange={(v) => onParte(v.duenoParteId)}
              labelSinElegir="Elige la cuenta del cliente…"
            />
            <Btn onClick={() => setCreando(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> Crear cuenta nueva
            </Btn>
          </div>
          {cliente && (
            <p
              className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]"
              aria-live="polite"
            >
              {cargo.total != null ? (
                <>
                  Se cargará{" "}
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">
                    {formatCurrency(cargo.total)}
                  </b>{" "}
                  a la cuenta de <b className="text-[var(--text-primary)]">{cliente.nombre}</b>.
                </>
              ) : (
                <>
                  Con estos precios no se carga nada a{" "}
                  <b className="text-[var(--text-primary)]">{cliente.nombre}</b>: pon el precio de
                  cada especie en el resumen.
                </>
              )}
              {cargo.total != null && cargo.sinImporte.length > 0 && (
                <> Sin precio ni tarifa, no se cobra: {cargo.sinImporte.join(", ")}.</>
              )}
              <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">
                Vista previa: el importe lo calcula el servidor al registrar, uno por especie.
              </span>
            </p>
          )}
        </div>
      )}

      {creando && (
        <CtpParteModal
          aboveModals
          parte={null}
          rolInicial="proveedor"
          existentes={directorio.partes}
          vehiculos={directorio.vehiculos}
          onGuardar={async (datos) => {
            const guardada = await directorio.guardarParte(datos);
            /* La cuenta recién creada queda elegida: el paso siguiente siempre es usarla. */
            onParte(guardada.id);
            return guardada;
          }}
          onUsarExistente={(existente) => {
            onParte(existente.id);
            setCreando(false);
          }}
          onClose={() => setCreando(false)}
        />
      )}
    </div>
  );
}
