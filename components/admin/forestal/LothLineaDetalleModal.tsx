"use client";

/**
 * LothLineaDetalleModal — todo lo que la fila no puede mostrar.
 *
 * La tabla tiene seis columnas y el dato que decide una fiscalización suele ser
 * el séptimo: cuándo se asentó la línea (y cuántos días después de la actividad),
 * quién la asentó, dónde se tomó el GPS, la foto del tocón, y si esta línea
 * corrige —o fue corregida por— otra.
 */

import { Camera, Clock, Link2, MapPin, User, X } from "@buleje/design-system/icons";
import {
  diasDeRegistro,
  estaFueraDePlazo,
  PLAZO_REGISTRO_DIAS,
  type LothEntryDTO,
} from "@/lib/forestal/loth-constants";

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

const n = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));

export default function LothLineaDetalleModal({
  linea,
  corregidaPorLineNo,
  onClose,
  onVerCadena,
}: {
  linea: LothEntryDTO | null;
  /** N° de la línea que enmienda a ésta, si existe. */
  corregidaPorLineNo?: number | null;
  onClose: () => void;
  onVerCadena?: (code: string) => void;
}) {
  if (!linea) return null;

  const dias = diasDeRegistro(linea.entryDate, linea.createdAt);
  const tarde = estaFueraDePlazo(linea.entryDate, linea.createdAt);
  const codigo = linea.trozaCode || linea.treeCode;
  const lat = linea.gpsLat != null ? Number(linea.gpsLat) : null;
  const lng = linea.gpsLng != null ? Number(linea.gpsLng) : null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de la línea ${linea.lineNo}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[42rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]">
        <header className="flex items-start justify-between gap-3 border-b-2 border-[var(--rule-base)] px-5 py-3">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
              Línea N° {linea.lineNo}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
              {fFecha(linea.entryDate)} · {linea.speciesCommon ?? "sin especie"}
              {linea.cites ? " · CITES" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
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
                  Fue corregida por la línea N° {corregidaPorLineNo}: para lo vigente, mirá esa.
                </p>
              )}
            </div>
          )}

          {/* Datos de la línea */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-[var(--rule-soft)] p-3 text-sm sm:grid-cols-3">
            <Dato label="Sección" valor={linea.section.replace(/_/g, " ")} />
            <Dato label="Cód. árbol" valor={linea.treeCode ?? "—"} mono />
            <Dato label="Cód. troza" valor={linea.trozaCode ?? "—"} mono />
            <Dato label="Especie" valor={linea.speciesCommon ?? "—"} />
            <Dato label="Científico" valor={linea.speciesScientific ?? "—"} />
            <Dato label="N° GTF" valor={linea.gtfNumber ?? "—"} mono />
            <Dato label="Ø mayor" valor={n(linea.diamMayorM, 2)} mono />
            <Dato label="Ø menor" valor={n(linea.diamMenorM, 2)} mono />
            <Dato label="Longitud" valor={n(linea.lengthM, 2)} mono />
            <Dato label="Volumen m³" valor={n(linea.volumeM3)} mono />
            <Dato label="Producto" valor={linea.productType ?? "—"} />
            <Dato label="Cantidad" valor={linea.quantity ? `${n(linea.quantity)} ${linea.unit ?? ""}` : "—"} mono />
            {linea.pieces != null && <Dato label="Piezas" valor={String(linea.pieces)} mono />}
            {linea.isRama && <Dato label="Origen" valor="Rama aprovechable" />}
            {linea.discarded && <Dato label="Descartado" valor="Sí" />}
            {linea.consumoInterno && <Dato label="Consumo interno" valor="Sí" />}
          </dl>

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
          {codigo && onVerCadena && (
            <button
              type="button"
              onClick={() => {
                onVerCadena(codigo);
                onClose();
              }}
              className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
            >
              <Link2 className="h-4 w-4" /> Cadena de custodia
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Dato({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</dt>
      <dd className={`text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{valor}</dd>
    </div>
  );
}
