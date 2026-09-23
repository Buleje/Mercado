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
 *
 * ADR-430: la cuenta nueva nace como **cliente** (antes, «proveedor»: el dueño
 * de la madera que se asierra le compra el servicio al aserradero), y al lado
 * del selector se dice qué trato tiene —de ahí sale el precio de lo que no se
 * ponga a mano—. En madera propia se puede decir para qué cliente es: su trato
 * de VENTA sugiere el precio de cada especie.
 */
import { useState } from "react";
import { Receipt, UserPlus, Warehouse } from "@buleje/design-system/icons";
import { ETIQUETA_SERVICIO, type TipoServicio } from "@/lib/forestal/declarar-produccion";
import type { GrupoEspecies } from "@/lib/forestal/precio-cliente";
import { formatCurrency } from "@/lib/format";
import CtpCobroAserrio, { type DirectorioForestal } from "./CtpCobroAserrio";
import CtpParteModal from "./CtpParteModal";
import { Btn } from "./ctp-shared";
import type { TratoDelCliente } from "./hooks/use-trato-del-cliente";
import CtpLineaDelTrato from "./CtpLineaDelTrato";

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
  compradorId,
  onComprador,
  fecha,
  directorio,
  cargo,
  trato,
  grupos = [],
  calculando = false,
}: {
  servicio: TipoServicio | null;
  onServicio: (t: TipoServicio) => void;
  parteId: string | null;
  onParte: (id: string | null) => void;
  /** Madera propia: para qué cliente (opcional). Sólo sugiere el precio de venta. */
  compradorId?: string | null;
  onComprador?: (id: string | null) => void;
  fecha: string;
  /** La libreta que comparte con el selector: la cuenta recién creada aparece elegida al toque. */
  directorio: DirectorioForestal;
  /** Tercero: la suma de lo que se cargaría y las especies que no se cobran. */
  cargo: { total: number | null; sinImporte: string[] };
  /** El trato del cliente elegido (el de este servicio). */
  trato?: TratoDelCliente;
  /** Los grupos de especies de la planta, para nombrar los precios «por grupo». */
  grupos?: readonly GrupoEspecies[];
  /**
   * Todavía se leen el trato, la tarifa o los grupos y hay especies sin precio
   * a mano: el cargo no se sabe. Decir «no se carga nada» mientras tanto es el
   * error que midió el revisor de ADR-429.
   */
  calculando?: boolean;
}) {
  const [creando, setCreando] = useState(false);
  const cliente = parteId ? (directorio.partes.find((p) => p.id === parteId) ?? null) : null;
  const comprador = compradorId ? (directorio.partes.find((p) => p.id === compradorId) ?? null) : null;
  /* La cuenta recién creada va al selector del servicio que está a la vista. */
  const usarCreada = (id: string) => (servicio === "propia" ? onComprador?.(id) : onParte(id));

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

      {servicio === "propia" && onComprador && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <CtpCobroAserrio
              soloDueno
              etiqueta="¿Para qué cliente? (opcional)"
              opcionSinDueno="Sin cliente — sugiere el último precio usado"
              directorio={directorio}
              fecha={fecha}
              bloques={[]}
              valor={{ duenoParteId: compradorId ?? null, precioManualPt: null }}
              onChange={(v) => onComprador(v.duenoParteId)}
              labelSinElegir="Sin cliente — sugiere el último precio usado"
            />
            <Btn onClick={() => setCreando(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> Crear cliente
            </Btn>
          </div>
          {comprador && trato && (
            <CtpLineaDelTrato trato={trato} servicio="venta" fecha={fecha} grupos={grupos} nombre={comprador.nombre} />
          )}
        </div>
      )}

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
          {cliente && trato && (
            <CtpLineaDelTrato trato={trato} servicio="aserrio" fecha={fecha} grupos={grupos} nombre={cliente.nombre} />
          )}
          {cliente && (
            <p
              className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]"
              aria-live="polite"
            >
              {calculando ? (
                <>
                  Calculando lo que se cargará a <b className="text-[var(--text-primary)]">{cliente.nombre}</b>…
                </>
              ) : cargo.total != null ? (
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
              {!calculando && cargo.total != null && cargo.sinImporte.length > 0 && (
                <> Sin precio, trato ni tarifa, no se cobra: {cargo.sinImporte.join(", ")}.</>
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
          /* El dueño de la madera que se asierra es CLIENTE del aserradero
             (ADR-430): con ese papel se le pone precio en el Directorio. */
          rolInicial="cliente"
          existentes={directorio.partes}
          vehiculos={directorio.vehiculos}
          onGuardar={async (datos) => {
            const guardada = await directorio.guardarParte(datos);
            /* La cuenta recién creada queda elegida: el paso siguiente siempre es usarla. */
            usarCreada(guardada.id);
            return guardada;
          }}
          onUsarExistente={(existente) => {
            usarCreada(existente.id);
            setCreando(false);
          }}
          onClose={() => setCreando(false)}
        />
      )}
    </div>
  );
}
