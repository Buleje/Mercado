"use client";

/**
 * La guía en el celular (ADR-346).
 *
 * En el patio la bandeja se mira desde un teléfono: una tarjeta por **papel**,
 * con sus especies listadas y lo que se hace parado frente al camión.
 *
 * 2026-09-25 (Brandon: «en el patio, con la guía en la mano, abres su ficha,
 * sacas la foto y corriges la fecha sin ir a la computadora»): la tarjeta sólo
 * tenía Recepcionar y Validar. Ahora trae lo mismo que la fila de la tabla —
 * «Ficha», el cuadre y el menú «Más» con la MISMA lista (`accionesDeGuia`):
 * documento, fotos, costo, corregir la recepción, acomodar, los asientos y
 * rechazar—. Nada de Ingresos queda sólo en la computadora.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  Download,
  Eye,
  MoreHorizontal,
  PackageCheck,
} from "@buleje/design-system/icons";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { faltaRecibirMadera, loQueFaltaRecibir } from "@/lib/forestal/recepcion-guias";
import { PROVEEDOR_INVENTARIO_APERTURA } from "@/lib/forestal/ctp-serfor-a-libro";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import ActionMenu from "@/components/admin/shared/action-menu";
import CtpEntryActions from "./CtpEntryActions";
import EspecieFoto from "./EspecieFoto";
import type { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { accionesDeGuia, type ManejadoresDeGuia } from "./ctp-guia-acciones";
import type { AccionesDeAsiento } from "./CtpGuiaFila";
import { StatusBadge, formatDate, productLabel, type WoodEntry, type WoodEntryStatus } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

type Guia = GuiaIngreso<WoodEntry>;

/** Alto de dedo (48 px): en el patio se toca con guantes o con prisa. */
const BTN = "inline-flex h-12 grow basis-28 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-40";

export default function CtpGuiaCardMobile({
  guia,
  fotosEspecie,
  marcada,
  onAlternarMarca,
  actionProps,
  onVerGuia,
  onVerDocumento,
  onVerFicha,
  onCuadrar,
  onValidarGuia,
  onRecepcionarGuia,
  onCostear,
  onCorregirRecepcion,
  onAcomodar,
}: Omit<ManejadoresDeGuia, "asientos" | "onStartReject" | "onDetail" | "onChain" | "onDuplicate" | "onEdit"> & {
  guia: Guia;
  fotosEspecie: ReturnType<typeof useEspeciesFotos>["indice"];
  marcada: boolean;
  onAlternarMarca: (v: boolean) => void;
  actionProps: AccionesDeAsiento;
  onVerFicha: (g: Guia) => void;
  onCuadrar: (g: Guia) => void;
  onValidarGuia: (g: Guia) => void;
  onRecepcionarGuia: (g: Guia) => void;
}) {
  const [asientosAbiertos, setAsientosAbiertos] = useState(false);
  const primera = guia.lineas[0];
  const unaSola = guia.lineas.length === 1;
  const pendientes = guia.lineas.filter((l) => l.status === "pendiente").length;
  /* El botón sale si a ESTA guía le falta recibir madera, no según en qué
     pestaña esté parado el teléfono (2026-09-15) — ver `CtpGuiaFila`. */
  const faltaRecibir = faltaRecibirMadera(guia);
  const queFalta = loQueFaltaRecibir(guia);
  const cuadre = cuadreDeIngreso(guia.volumenM3, guia.trozasM3, guia.trozasCount);
  /* «Rechazar» desde el menú abre el motivo acá mismo, como en la fila. */
  const enRechazo = actionProps.rejectingId === primera.id;

  const masAcciones = accionesDeGuia(guia, {
    onVerDocumento,
    onVerGuia,
    onCostear,
    onCorregirRecepcion,
    onAcomodar,
    onDetail: actionProps.onDetail,
    onChain: actionProps.onChain,
    onDuplicate: actionProps.onDuplicate,
    onEdit: actionProps.onEdit,
    onStartReject: actionProps.onStartReject,
    asientos: { abierta: asientosAbiertos, onAlternar: () => setAsientosAbiertos((v) => !v) },
  });

  return (
    <article
      className={`rounded-2xl border-2 p-4 ${
        marcada ? "border-[var(--accent)] bg-primary/5" : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      }`}
    >
      <header className="flex items-start gap-3">
        {pendientes > 0 && (
          <input
            type="checkbox"
            aria-label={`Seleccionar la guía ${guia.gtfNumber}`}
            checked={marcada}
            onChange={(e) => onAlternarMarca(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => actionProps.onDetail(primera)}
            className="block max-w-full truncate text-left text-base font-bold tabular-nums text-[var(--text-primary)] underline-offset-2 hover:underline"
          >
            {guia.gtfNumber}
          </button>
          <p className="flex items-center gap-1.5 truncate text-sm text-[var(--text-secondary)]">
            <span className="truncate">{guia.providerName}</span>
            {guia.providerName === PROVEEDOR_INVENTARIO_APERTURA && (
              <span
                title="Existencia de apertura: entró por el importador del libro"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-info-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
              >
                <Download className="h-3 w-3 shrink-0" aria-hidden /> Importado
              </span>
            )}
          </p>
          {/* El permiso, que en la tabla va con su rótulo bajo el proveedor
              (ADR-400): acá igual, como dato con nombre. */}
          {guia.originCode && (
            <p className="truncate text-sm tabular-nums text-[var(--text-tertiary)]" title={`Permiso ${guia.originCode}${guia.originSourceNumber ? ` · Res. ${guia.originSourceNumber}` : ""}`}>
              Permiso {guia.originCode}
              {guia.originSourceNumber ? ` · Res. ${guia.originSourceNumber}` : ""}
            </p>
          )}
          <p className="text-sm text-[var(--text-tertiary)]">
            {formatDate(guia.entryDate)} · {guia.lineas.length} asiento{guia.lineas.length === 1 ? "" : "s"} del libro
          </p>
        </div>
        {guia.statusMixto ? (
          <span
            title={Object.entries(guia.porEstado).map(([s, n]) => `${s} ×${n}`).join(" · ")}
            className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]"
          >
            mixto
          </span>
        ) : (
          <StatusBadge status={guia.status as WoodEntryStatus} />
        )}
      </header>

      <ul className="mt-3 space-y-1">
        {guia.especies.map((e) => (
          <li key={e.comun} className="flex items-center gap-2 text-sm">
            <EspecieFoto especie={e.comun} indice={fotosEspecie} />
            <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">{e.comun}</span>
            {e.cites && (
              <span className="rounded-full bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">
                CITES
              </span>
            )}
            <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
              {fmtM3(e.volumenM3)} m³
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--rule-soft)] pt-2">
        <p className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {fmtM3(guia.volumenM3)} m³ ·{" "}
          <span className="font-normal text-[var(--text-tertiary)]">
            {guia.trozasCount > 0 ? `${guia.trozasCount} trozas` : `${guia.piezas} piezas`}
            {guia.trozasCount > 0 && ` · ${guia.trozasDecididas}/${guia.trozasCount} recibidas`}
          </span>
        </p>
        {/* El descuadre, también en el teléfono: es un botón que abre el cuadre. */}
        {descuadra(cuadre) && (
          <button
            type="button"
            onClick={() => onCuadrar(guia)}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[var(--data-warning-500)]/15 px-2 py-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {cuadre.aviso} · cuadrar
          </button>
        )}
      </div>

      {enRechazo ? (
        <div className="mt-3">
          <CtpEntryActions entry={primera} {...actionProps} block />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* La FICHA: casilleros, asientos, piezas y recepción (ADR-350). */}
          <button
            type="button"
            onClick={() => onVerFicha(guia)}
            className={`${BTN} border border-[var(--rule-base)] text-[var(--text-primary)]`}
          >
            <Eye className="h-4 w-4" aria-hidden /> Ficha
          </button>
          {faltaRecibir && (
            <button
              type="button"
              onClick={() => onRecepcionarGuia(guia)}
              disabled={Boolean(actionProps.busy)}
              title={queFalta.length > 0 ? `Le falta: ${queFalta.join(", ")}` : undefined}
              className={`${BTN} bg-[var(--accent-dark)] text-white`}
            >
              <PackageCheck className="h-4 w-4" aria-hidden /> Recepcionar
            </button>
          )}
          {pendientes > 0 && (
            <button
              type="button"
              onClick={() => (unaSola ? actionProps.onValidate(primera.id) : onValidarGuia(guia))}
              disabled={Boolean(actionProps.busy)}
              className={`${BTN} border border-[var(--rule-base)] text-[var(--text-secondary)]`}
            >
              <CheckCheck className="h-4 w-4" aria-hidden /> Validar {pendientes > 1 ? pendientes : ""}
            </button>
          )}
          <ActionMenu
            label="Más"
            title="Documento, fotos, costo, corregir la recepción y el resto"
            icon={MoreHorizontal}
            size="md"
            actions={masAcciones}
            compactoEnMovil
          />
        </div>
      )}

      {/* Los asientos de una guía de varias especies, cada uno con SUS acciones
          (ver, duplicar, cadena, corregir, validar, rechazar con motivo): en la
          tabla se despliegan como filas; acá, como lista. */}
      {asientosAbiertos && !unaSola && (
        <ul className="mt-3 space-y-2 border-t border-[var(--rule-soft)] pt-3">
          {guia.lineas.map((l) => (
            <li key={l.id} className="rounded-xl bg-[var(--surface-sunken)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                    N° {l.libroNro ?? "—"} · {l.speciesCommonName}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {productLabel(l.productType)} · <span className="tabular-nums">{fmtM3(Number(l.volumeM3))} m³</span>
                  </p>
                </div>
                <StatusBadge status={l.status} />
              </div>
              <div className="mt-2 [&>div]:flex-wrap">
                <CtpEntryActions entry={l} {...actionProps} onVerGuia={l.serforGtf ? onVerGuia : undefined} block />
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
