"use client";

/**
 * LothLineaDetalleModal — todo lo que la fila no puede mostrar.
 *
 * La tabla tiene seis columnas y el dato que decide una fiscalización suele ser
 * el séptimo: cuándo se asentó la línea (y cuántos días después de la actividad),
 * quién la asentó, dónde se tomó el GPS, la foto del tocón, y si esta línea
 * corrige —o fue corregida por— otra.
 */

import { Camera, Clock, Link2, MapPin, QrCode, User, X } from "@buleje/design-system/icons";
import { useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import {
  ControlesDeVentana,
  TiradorDeVentana,
} from "@/components/admin/shared/modal-controles-ventana";
import {
  diasDeRegistro,
  estaFueraDePlazo,
  PLAZO_REGISTRO_DIAS,
  type LothEntryDTO,
} from "@/lib/forestal/loth-constants";
import { medidasDeLinea } from "@/lib/forestal/loth-despacho-medidas";
import { guiaDeLineas, type GuiaDelDespacho } from "@/lib/forestal/loth-despacho-por-guia";
import { DespachoAcciones, DespachoDatos, LineaDatos } from "./LothLineaDatos";

const fFecha = (iso: string | null | undefined, conHora = false) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};

export default function LothLineaDetalleModal({
  linea,
  corregidaPorLineNo,
  onClose,
  onVerCadena,
  onImprimirEtiqueta,
  despacho,
}: {
  linea: LothEntryDTO | null;
  /** N° de la línea que enmienda a ésta, si existe. */
  corregidaPorLineNo?: number | null;
  onClose: () => void;
  onVerCadena?: (code: string) => void;
  /** Trozado: la etiqueta QR de ESTA troza (28-09). Despacho: la de su troza, con las medidas del trozado (08-10). */
  onImprimirEtiqueta?: (linea: LothEntryDTO) => void;
  /** Despacho de trozas (08-10): las guías del permiso (destino, placa, CTP) y a dónde llevan sus acciones. */
  despacho?: { guias: readonly GuiaDelDespacho[]; hayCtp: boolean; onVerGuia: (gtf: string) => void };
}) {
  /* Sin esto el foco se queda atrás del modal: Tab se va a la pantalla
     de abajo y Escape no cierra (hook medido en el módulo, 2026-09-09). */
  const cajaRef = useRef<HTMLDivElement>(null);
  // `activo`: el libro lo monta siempre, con `linea` en null hasta abrir una.
  useModalAccesible(cajaRef, { onCerrar: onClose, activo: !!linea });
  /**
   * Ventana: se mueve, se achica y se fija (ADR-420).
   *
   * Este modal se abre para COMPARAR: si la línea corrige a otra, o si el árbol
   * tiene más trozas asentadas, el dato contra el que se lee está en la tabla
   * que quedó tapada. Movido a un costado se leen las dos, y fijado se puede
   * abrir otra fila sin que el detalle se cierre de golpe.
   */
  const ventana = useVentanaDeModal(!!linea, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "loth-linea-detalle",
  });
  if (!linea) return null;

  const dias = diasDeRegistro(linea.entryDate, linea.createdAt);
  const tarde = estaFueraDePlazo(linea.entryDate, linea.createdAt);
  const codigo = linea.trozaCode || linea.treeCode;
  const lat = linea.gpsLat != null ? Number(linea.gpsLat) : null;
  const lng = linea.gpsLng != null ? Number(linea.gpsLng) : null;
  const esDespacho = linea.section === "despacho_troza" && !!despacho;
  const guia = esDespacho ? guiaDeLineas(linea.gtfNumber, linea.planId, despacho.guias) : null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        /* Fijado quiere decir «lo dejo abierto para leer la tabla de atrás»:
           el clic afuera deja de cerrar. La X y Escape siguen cerrando. */
        if (e.target === e.currentTarget && !ventana.fijado) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* El diálogo en sí: acá viven el foco, el arrastre y el tamaño —
          el velo de atrás no se mueve. */}
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de la línea ${linea.lineNo}`}
        /* `relative`: el tirador de redimensión se ancla a esta esquina. */
        className="relative flex max-h-[88vh] w-full max-w-[42rem] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        {/* Cabecera — y asa para arrastrar la ventana. */}
        <header
          {...ventana.asaProps}
          className="flex items-start justify-between gap-3 border-b-2 border-[var(--rule-base)] px-5 py-3"
        >
          <div>
            <p className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Línea N° {linea.lineNo}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
              {fFecha(linea.entryDate)} · {medidasDeLinea(linea).especie ?? "sin especie"}
              {medidasDeLinea(linea).cites ? " · CITES" : ""}
            </p>
          </div>
          {/* `ml-auto`: la cabecera reparte con `justify-between`, así que sin
              esto los controles quedarían flotando en el medio. */}
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
          {/* Estado del asiento: lo que decide una fiscalización */}
          <div
            className={`rounded-xl border-2 p-3 ${
              linea.status === "anulado"
                ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10"
                : tarde
                  ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)]"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                <Clock className="h-4 w-4" />
                {linea.status === "anulado" ? "Anulada" : tarde ? "Asentada fuera de plazo" : "Asentada en plazo"}
              </span>
              {linea.createdAt && (
                <span className="text-[var(--text-secondary)]">
                  registro {fFecha(linea.createdAt, true)}
                  {dias != null && ` · ${dias} día${dias === 1 ? "" : "s"} después de la actividad`}
                  {tarde && ` (el plazo es de ${PLAZO_REGISTRO_DIAS})`}
                </span>
              )}
              {linea.createdBy && (
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <User className="h-4 w-4" /> {linea.createdBy}
                </span>
              )}
            </div>
            {linea.status === "anulado" && linea.annulledReason && (
              <p className="mt-1.5 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                Motivo: {linea.annulledReason}
              </p>
            )}
          </div>

          {/* Cadena de correcciones */}
          {(linea.correctsLineNo != null || corregidaPorLineNo != null) && (
            <div className="rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-500)]/10 p-3 text-sm">
              {linea.correctsLineNo != null && (
                <p className="font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                  Esta línea corrige a la N° {linea.correctsLineNo}
                  {linea.correctionNote ? ` — ${linea.correctionNote}` : ""}
                </p>
              )}
              {corregidaPorLineNo != null && (
                <p className="text-[var(--text-secondary)]">
                  Fue corregida por la línea N° {corregidaPorLineNo}: para lo vigente, mira esa.
                </p>
              )}
            </div>
          )}

          {/* Datos de la línea; un despacho, con su troza, su guía y el CTP */}
          {esDespacho ? <DespachoDatos linea={linea} guia={guia} /> : <LineaDatos linea={linea} />}

          {linea.observations && (
            <p className="rounded-xl border border-[var(--rule-soft)] p-3 text-sm text-[var(--text-secondary)]">
              <span className="font-bold text-[var(--text-primary)]">Observaciones: </span>
              {linea.observations}
            </p>
          )}

          {/* Evidencia de campo */}
          {(lat != null || linea.photoUrl) && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-soft)] p-3">
              {lat != null && lng != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="font-mono tabular-nums">
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                  </span>
                </a>
              )}
              {lat != null && linea.gpsOrigen && (
                <span className="text-xs text-[var(--text-secondary)]">
                  {linea.gpsOrigen === "telefono" ? "GPS del teléfono" : linea.gpsOrigen === "censo" ? "Copiada del censo, no tomada en el tocón" : "UTM escrita a mano"}
                </span>
              )}
              {linea.photoUrl && (
                <a href={linea.photoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={linea.photoUrl}
                    alt="Foto de evidencia de campo"
                    className="h-20 w-auto rounded-lg border border-[var(--rule-base)] object-cover"
                  />
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                    <Camera className="h-3.5 w-3.5" /> ver foto
                  </span>
                </a>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-[var(--rule-base)] px-5 py-3">
          {esDespacho && (
            <DespachoAcciones
              linea={linea}
              guia={guia}
              hayCtp={despacho.hayCtp}
              onVerGuia={despacho.onVerGuia}
              onVerCadena={onVerCadena}
              onImprimirEtiqueta={onImprimirEtiqueta}
              onClose={onClose}
            />
          )}
          {linea.section === "trozado" && codigo && onImprimirEtiqueta && (
            <button
              type="button"
              onClick={() => onImprimirEtiqueta(linea)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
            >
              <QrCode className="h-4 w-4" /> Imprimir etiqueta
            </button>
          )}
          {!esDespacho && codigo && onVerCadena && (
            <button
              type="button"
              onClick={() => {
                onVerCadena(codigo);
                onClose();
              }}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
            >
              <Link2 className="h-4 w-4" /> Cadena de custodia
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white hover:opacity-90"
          >
            Cerrar
          </button>
        </footer>

        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
