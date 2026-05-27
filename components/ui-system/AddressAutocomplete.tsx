"use client";

/**
 * AddressAutocomplete — Input con autocompletado de direcciones.
 *
 * Modo 1 (default): sugerencias estaticas por distrito + busqueda por
 * referencia (mercado X, parque Y). Ideal para bodegas barriales donde
 * "Jr. Los Eucaliptos 456, Yarinacocha" es mas util que lat/lng.
 *
 * Modo 2 (fetchSuggestions): async callback para integrar con Google
 * Places API, Mapbox, o el que sea.
 *
 * Incluye "Usar mi ubicacion actual" via navigator.geolocation.
 *
 * Uso:
 *   <AddressAutocomplete
 *     value={address}
 *     onChange={setAddress}
 *     referencesSuggestions={["Mercado Agropecuario", "Parque San Martín", ...]}
 *   />
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { MapPin, Navigation, Search, X } from "@buleje/design-system/icons";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

export interface AddressSuggestion {
  label: string;
  subtitle?: string;
  coords?: { lat: number; lng: number };
}

interface Props {
  value: string;
  onChange: (value: string, suggestion?: AddressSuggestion) => void;
  /** Modo async */
  fetchSuggestions?: (q: string) => Promise<AddressSuggestion[]>;
  /** Sugerencias estaticas (references populares) */
  referencesSuggestions?: string[];
  /** Habilitar "Usar mi ubicacion" */
  enableGeolocation?: boolean;
  /** Handler cuando el user pide geoloc */
  onGeolocation?: (coords: { lat: number; lng: number }) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  label?: string;
  hint?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  fetchSuggestions,
  referencesSuggestions = [],
  enableGeolocation = true,
  onGeolocation,
  placeholder = "Ej: Jr. Ucayali 245, al costado de la ferretería",
  required,
  className,
  label = "Dirección",
  hint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [async, setAsync] = useState<AddressSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedValue = useDebounce(value, 350);

  useEffect(() => {
    if (!fetchSuggestions) return;
    if (debouncedValue.length < 3) {
       
      setAsync([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSuggestions(debouncedValue)
      .then((res) => {
        if (!cancelled) setAsync(res);
      })
      .catch(() => {
        if (!cancelled) setAsync([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedValue, fetchSuggestions]);

  const staticSuggestions = useMemo<AddressSuggestion[]>(() => {
    if (!value.trim()) return [];
    const q = value.toLowerCase();
    return referencesSuggestions
      .filter((r) => r.toLowerCase().includes(q))
      .slice(0, 6)
      .map((r) => ({ label: r, subtitle: "Referencia popular" }));
  }, [value, referencesSuggestions]);

  const allSuggestions = useMemo(() => {
    if (fetchSuggestions) return async;
    return staticSuggestions;
  }, [fetchSuggestions, async, staticSuggestions]);

  const requestGeo = () => {
    if (!("geolocation" in navigator)) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        onGeolocation?.({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setGeoLoading(false),
      { timeout: 10000 },
    );
  };

  return (
    <div className={cn("relative", className)}>
      <label className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
        {label}
        {required && <span className="text-[var(--data-error,_#e11d48)] ml-1">*</span>}
      </label>
      <div
        className={cn(
          "flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-colors",
          open && "border-[var(--accent)]",
        )}
      >
        <span className="pl-3 text-[var(--text-tertiary)]" aria-hidden>
          <MapPin className="h-4 w-4" strokeWidth={2} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          required={required}
          className="flex-1 bg-transparent outline-none px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label="Limpiar"
            className="p-1 mr-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</p>}

      {/* Dropdown */}
      {open && (enableGeolocation || allSuggestions.length > 0 || loading) && (
        <div className="absolute top-full left-0 right-0 z-40 mt-1 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl overflow-hidden motion-safe:animate-[fadeIn_0.15s]">
          {enableGeolocation && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                requestGeo();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-sunken)] transition-colors border-b border-[var(--rule-base)]"
            >
              <div className="h-8 w-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0">
                <Navigation className="h-4 w-4" strokeWidth={2} aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {geoLoading ? "Obteniendo ubicación…" : "Usar mi ubicación actual"}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">Más rápido y exacto</p>
              </div>
            </button>
          )}

          {loading && (
            <div className="px-4 py-4 text-center text-xs text-[var(--text-tertiary)]">
              Buscando direcciones…
            </div>
          )}

          {!loading && allSuggestions.length > 0 && (
            <ul className="max-h-72 overflow-y-auto py-1">
              {allSuggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(s.label, s);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <Search className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">{s.label}</p>
                      {s.subtitle && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                          {s.subtitle}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
