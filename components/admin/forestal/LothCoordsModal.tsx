"use client";

/**
 * LothCoordsModal — entrada del polígono por COORDENADAS, que es como llega en
 * la vida real: el cuadro del plan de manejo pegado desde Excel, el KML del
 * consultor o el GeoJSON del expediente. Dibujarlo a mano es el último recurso.
 *
 * Muestra en vivo qué se leyó (formato, vértices, área, líneas ignoradas) antes
 * de reemplazar el borrador: el usuario confirma que el polígono es el que
 * aprobó la ARFFS, no uno "parecido".
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Upload, X } from "@buleje/design-system/icons";
import { polygonAreaHa, type LatLng } from "@/lib/forestal/loth-geo";
import { parseCoordText, parseGeometryFile, type ParseResult } from "@/lib/forestal/loth-coords-io";
import { perimeterM, formatDistance } from "@/lib/forestal/loth-utm";

const FORMATO_LABEL: Record<ParseResult["formato"], string> = {
  utm: "Coordenadas UTM",
  geograficas: "Coordenadas geográficas (lat/lng)",
  geojson: "GeoJSON",
  kml: "KML",
  vacio: "—",
};

const EJEMPLO = `C.001\t545060.02\t9012340.07
C.002\t545064.56\t9012317.22
C.003\t545077.54\t9012297.84`;

interface Props {
  open: boolean;
  zonaDefault: string;
  onClose: () => void;
  onApply: (vertices: LatLng[]) => void;
}

export default function LothCoordsModal({ open, zonaDefault, onClose, onApply }: Props) {
  const [text, setText] = useState("");
  const [zona, setZona] = useState(zonaDefault);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const result = useMemo<ParseResult>(
    () => (fileName ? parseGeometryFile(fileName, text, zona) : parseCoordText(text, zona)),
    [text, zona, fileName],
  );
  const areaHa = result.vertices.length >= 3 ? polygonAreaHa(result.vertices) : 0;
  const perim = result.vertices.length >= 3 ? perimeterM(result.vertices) : 0;
  const listo = result.vertices.length >= 3;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const content = await file.text();
      setFileName(file.name);
      setText(content);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Importar coordenadas del área de aprovechamiento"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[44rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]">
        <header className="flex items-center justify-between gap-3 border-b-2 border-[var(--rule-base)] px-5 py-3">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">Importar coordenadas</p>
            <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
              Pegá el cuadro del plan de manejo o subí el KML / GeoJSON del expediente
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

        <div className="flex-1 space-y-3 overflow-auto px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-bold text-[var(--text-secondary)]">
              Zona UTM
              <input
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                placeholder="18L"
                className="mt-1 block h-12 w-28 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 font-mono text-base font-bold text-[var(--text-primary)]"
              />
            </label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
            >
              <Upload className="h-4 w-4" /> Subir archivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".kml,.json,.geojson,.csv,.txt"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {fileName && (
              <span className="text-xs font-bold text-[var(--text-tertiary)]">
                {fileName}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setFileName(null);
                    setText("");
                  }}
                  className="underline"
                >
                  quitar
                </button>
              </span>
            )}
          </div>

          <label className="block text-xs font-bold text-[var(--text-secondary)]">
            Coordenadas
            <textarea
              value={text}
              onChange={(e) => {
                setFileName(null);
                setText(e.target.value);
              }}
              rows={10}
              spellCheck={false}
              placeholder={EJEMPLO}
              className="mt-1 block w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
          </label>

          {fileError && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-3.5 w-3.5" /> {fileError}
            </p>
          )}

          <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Lectura</p>
            {listo ? (
              <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
                {FORMATO_LABEL[result.formato]}
                {result.formato === "utm" && result.zone ? ` · zona ${result.zone}` : ""} ·{" "}
                <b className="font-mono tabular-nums text-[var(--text-primary)]">{result.vertices.length}</b> vértices ·{" "}
                <b className="font-mono tabular-nums text-[var(--text-primary)]">{areaHa.toFixed(2)} ha</b> · perímetro{" "}
                <b className="font-mono tabular-nums text-[var(--text-primary)]">{formatDistance(perim)}</b>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Pegá al menos 3 vértices. Se aceptan columnas <b>Este / Norte</b> (UTM), lat/lng decimales, o un archivo KML/GeoJSON.
              </p>
            )}
            {result.ignoradas.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {result.ignoradas.length} línea(s) sin interpretar: “{result.ignoradas.slice(0, 2).join("”, “")}”
              </p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t-2 border-[var(--rule-base)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!listo}
            onClick={() => {
              onApply(result.vertices);
              onClose();
            }}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            <Check className="h-4 w-4" /> Usar este polígono
          </button>
        </footer>
      </div>
    </div>
  );
}
