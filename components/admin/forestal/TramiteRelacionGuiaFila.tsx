"use client";

/**
 * Una guía de la «Relación de guías» en el formulario (extraída de
 * `TramiteRelacionGuias`): N°, fecha, cantidad, permiso, destinatario,
 * especie, producto, N° de su lista de trozas y el detalle pieza por pieza.
 */

import { Ban, Trash2 } from "@buleje/design-system/icons";
import { listaDeTrozas, type FilaGuiaInforme } from "@/lib/forestal/tramites-relacion-guias";
import { CLASE_FALTA } from "./ctp-guia-piezas";

/**
 * Casillero que falta llenar: borde ámbar (`CLASE_FALTA`). En oscuro
 * `globals.css` pisa con más especificidad el borde de todo input del panel sin
 * clase `dark:bg-` y el de toda `border-[var(--rule-base)]` (medido 08-10: el
 * ámbar no se veía): por eso se saca esa clase y se agrega un `dark:bg-`.
 */
export const claseFalta = (base: string): string =>
  `${base.replace("border-[var(--rule-base)]", "")} ${CLASE_FALTA} dark:bg-[var(--surface-sunken)]`;

const ORIGEN_LABEL: Record<FilaGuiaInforme["origen"], string> = {
  ctp: "Libro CTP",
  loth: "Libro TH",
  manual: "",
};

/** Input compacto: estas filas ya tienen 6 celdas, un `h-11` las hace gigantes. */
const IC =
  "h-9 w-full rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

export default function TramiteRelacionGuiaFila({
  fila,
  otroPermiso,
  onEditar,
  onQuitar,
}: {
  fila: FilaGuiaInforme;
  /** La guía dice un permiso distinto del elegido para el oficio. */
  otroPermiso: boolean;
  onEditar: (cambios: Partial<FilaGuiaInforme>) => void;
  onQuitar: () => void;
}) {
  const lista = listaDeTrozas(fila);
  return (
    <li
      className={`rounded-xl border p-3 transition-colors ${
        fila.anulada
          ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] opacity-80"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)]"
      }`}
    >
      {/* Tres filas en 12 columnas (la columna del formulario mide ~450 px a
          1280: en dos filas el N° y la fecha salían cortados): identidad
          (N°, fecha, cantidad), de quién (permiso, destinatario) y qué
          llevaba (especie, producto). «Permiso» (07-10) lo trae la guía del
          Libro TH; en una fila manual se tipea. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
        <input
          className={`${IC} sm:col-span-4`}
          placeholder="N° de GTF"
          aria-label="N° de GTF"
          value={fila.numero}
          onChange={(e) => onEditar({ numero: e.target.value })}
        />
        <input
          type="date"
          className={`${IC} sm:col-span-4`}
          value={fila.fecha}
          onChange={(e) => onEditar({ fecha: e.target.value })}
          aria-label="Fecha de la guía"
        />
        <input
          className={`${IC} sm:col-span-2`}
          placeholder="Cantidad"
          aria-label="Cantidad"
          value={fila.cantidad}
          onChange={(e) => onEditar({ cantidad: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-2`}
          placeholder="Unidad"
          aria-label="Unidad"
          value={fila.unidad}
          onChange={(e) => onEditar({ unidad: e.target.value })}
        />
        <input
          className={`${IC} col-span-2 sm:col-span-6`}
          placeholder="Permiso / título habilitante"
          aria-label="Permiso o título habilitante"
          value={fila.permiso ?? ""}
          onChange={(e) => onEditar({ permiso: e.target.value })}
        />
        <input
          className={`${IC} col-span-2 sm:col-span-6`}
          placeholder="Destinatario"
          aria-label="Destinatario"
          value={fila.destinatario}
          onChange={(e) => onEditar({ destinatario: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-4`}
          placeholder="Especie"
          aria-label="Especie"
          value={fila.especie}
          onChange={(e) => onEditar({ especie: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-4`}
          placeholder="Producto"
          aria-label="Producto"
          value={fila.producto}
          onChange={(e) => onEditar({ producto: e.target.value })}
        />
        {/* N° de la lista de trozas (Brandon 08-10: en el papel va sólo su N°). Vacío
            en una guía de trozas = el papel pone el N° de la GTF: ámbar para revisarlo. */}
        <input
          className={`${lista?.derivada ? claseFalta(IC) : IC} col-span-2 font-mono sm:col-span-4`}
          placeholder={lista?.derivada ? `Lista N° (va ${lista.nro})` : "Lista de trozas N°"}
          aria-label="N° de la lista de trozas"
          title={lista?.derivada ? "La guía no trae el N° de su lista de trozas: en el papel va el N° de la GTF." : undefined}
          value={fila.listaTrozasNro ?? ""}
          onChange={(e) => onEditar({ listaTrozasNro: e.target.value })}
        />
      </div>

      <textarea
        rows={Math.min(6, Math.max(2, fila.trozas.split("\n").length))}
        aria-label="Lista de trozas"
        className={`${IC} mt-2 h-auto py-1.5 font-mono`}
        placeholder="Detalle de trozas (va en hoja aparte si lo pides): código y medida, una por línea"
        value={fila.trozas}
        onChange={(e) => onEditar({ trozas: e.target.value })}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onEditar({ anulada: !fila.anulada, motivo: fila.anulada ? "" : fila.motivo })}
          aria-pressed={fila.anulada}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold transition ${
            fila.anulada
              ? "border-[var(--text-tertiary)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)]"
          }`}
        >
          <Ban className="h-3.5 w-3.5" /> Anulada
        </button>
        {fila.anulada && (
          <input
            className={`${IC} max-w-xs flex-1`}
            placeholder="Motivo de la anulación"
            value={fila.motivo}
            onChange={(e) => onEditar({ motivo: e.target.value })}
          />
        )}
        {otroPermiso && (
          <span className="rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Otro permiso
          </span>
        )}
        {fila.origen !== "manual" && (
          <span className="rounded-full bg-[var(--data-info-500)]/12 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
            {ORIGEN_LABEL[fila.origen]}
          </span>
        )}
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar la guía ${fila.numero || "sin número"}`}
          className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
