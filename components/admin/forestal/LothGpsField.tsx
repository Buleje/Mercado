"use client";

/**
 * LothGpsField — la georreferencia de una operación del Libro TH, por las TRES
 * vías con que llega en la práctica:
 *
 *   1. GPS del teléfono, parado en el tocón (lo ideal, `enableHighAccuracy`);
 *   2. la coordenada del ÁRBOL CENSADO, que el regente ya levantó en UTM — un
 *      click y la tala queda geolocalizada sin volver al monte;
 *   3. tecleada en UTM desde la libreta de campo.
 *
 * Sin esto la cobertura EUDR (talas con GPS) se queda en 0% aunque el censo
 * entero esté georreferenciado. Presentacional: el valor vive en el formulario.
 */

import { useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, MapPin, Trees, X } from "@buleje/design-system/icons";
import { formatUtmFull, fromUtm, parseUtmZone, toUtm } from "@/lib/forestal/loth-utm";

export interface CensoUtm {
  code: string;
  zona: string | null;
  x: number;
  y: number;
}

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  /** Coordenada del árbol censado que se está registrando (si la tiene). */
  censo?: CensoUtm | null;
}

const INPUT =
  "h-12 w-36 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 font-mono text-sm text-[var(--text-primary)]";
const BTN =
  "inline-flex h-12 items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60";

export default function LothGpsField({ lat, lng, onChange, censo }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [este, setEste] = useState("");
  const [norte, setNorte] = useState("");
  const [zona, setZona] = useState(censo?.zona ?? "18L");

  const capturar = () => {
    if (!navigator.geolocation) {
      setError("Geolocalización no disponible en este dispositivo.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setLoading(false);
      },
      (err) => {
        setError(`No se pudo obtener la ubicación: ${err.message}`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const usarCenso = () => {
    if (!censo) return;
    const { zone, south } = parseUtmZone(censo.zona);
    const [la, ln] = fromUtm(censo.x, censo.y, zone, south);
    onChange(la, ln);
    setError(null);
  };

  const aplicarManual = () => {
    const x = Number(este.replace(/[  ,]/g, ""));
    const y = Number(norte.replace(/[  ,]/g, ""));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) {
      setError("Escribí el Este y el Norte en metros (ej. 545060.02 / 9012340.07).");
      return;
    }
    const { zone, south } = parseUtmZone(zona);
    const [la, ln] = fromUtm(x, y, zone, south);
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) {
      setError("Esas coordenadas caen fuera del planeta: revisá la zona UTM.");
      return;
    }
    onChange(la, ln);
    setError(null);
    setManual(false);
  };

  const utm = lat != null && lng != null ? toUtm(lat, lng) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={capturar} disabled={loading} className={BTN}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4 text-[var(--data-success-600)]" />}
          {loading ? "Obteniendo GPS…" : lat != null ? "Actualizar ubicación GPS" : "Capturar ubicación GPS"}
        </button>
        {censo && (
          <button type="button" onClick={usarCenso} className={BTN} title={`Coordenada del árbol ${censo.code} en el censo`}>
            <Trees className="h-4 w-4 text-[var(--data-success-600)]" /> Usar la del censo
          </button>
        )}
        <button type="button" onClick={() => setManual((v) => !v)} className={BTN}>
          {manual ? "Cerrar UTM" : "Escribir UTM"}
        </button>
      </div>

      {manual && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Este (m)
            <input value={este} onChange={(e) => setEste(e.target.value)} inputMode="decimal" placeholder="545060.02" className={`mt-1 block ${INPUT}`} />
          </label>
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Norte (m)
            <input value={norte} onChange={(e) => setNorte(e.target.value)} inputMode="decimal" placeholder="9012340.07" className={`mt-1 block ${INPUT}`} />
          </label>
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Zona
            <input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="18L" className={`mt-1 block ${INPUT} w-20`} />
          </label>
          <button
            type="button"
            onClick={aplicarManual}
            className="inline-flex h-12 items-center rounded-lg bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90"
          >
            Aplicar
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {lat != null && lng != null && (
        <div className="space-y-0.5">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono tabular-nums">
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </span>
            <a
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2"
            >
              Ver en mapa <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="inline-flex items-center gap-0.5 text-[var(--text-tertiary)] underline underline-offset-2"
            >
              <X className="h-3 w-3" /> quitar
            </button>
          </p>
          {utm && <p className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{formatUtmFull(utm, 1)}</p>}
        </div>
      )}
    </div>
  );
}
