"use client";

/**
 * DeliveryLocationMenu — botón de ubicación al lado del logo + popover (estilo
 * AliExpress "Enviar a", Brandon 2026-06-13). Permite cambiar:
 *   País (Perú, fijo) · Departamento · Provincia · Distrito (cascada ubigeo)
 *   + "Usar mi ubicación actual" (GPS) + "Elegir en el mapa" (pin arrastrable).
 *
 * Persiste en localStorage `buleje-delivery-location` y emite el evento
 * `buleje:delivery-location-change`. El label del botón refleja la selección
 * (distrito › departamento › ciudad de marca por defecto).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, ChevronDown, X, Navigation } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  listDepartamentos,
  listProvincias,
  listDistritos,
} from "@/lib/peru-ubigeo";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

const STORAGE_KEY = "buleje-delivery-location";
// Centro aproximado de Ciudad Constitución (Pasco, selva central) para abrir el
// mapa antes de que el usuario use GPS o arrastre el pin.
const DEFAULT_COORDS = { lat: -9.864, lon: -74.924 };

export interface DeliveryLocation {
  country: string; // "PE"
  departmentCode: string;
  departmentName: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  lat?: number;
  lng?: number;
  address?: string;
  label: string;
}

function readStored(): DeliveryLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeliveryLocation) : null;
  } catch {
    return null;
  }
}

export default function DeliveryLocationMenu({ fallbackLabel }: { fallbackLabel: string }) {
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<DeliveryLocation | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Selección en edición (se aplica al Guardar).
  const [depCode, setDepCode] = useState("");
  const [provCode, setProvCode] = useState("");
  const [distCode, setDistCode] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);

  // Hidratar selección desde lo guardado al montar / abrir.
  useEffect(() => {
    const s = readStored();
    setStored(s);
  }, []);
  useEffect(() => {
    if (!open) return;
    const s = readStored();
    if (s) {
      setDepCode(s.departmentCode || "");
      setProvCode(s.provinceCode || "");
      setDistCode(s.districtCode || "");
      if (s.lat != null && s.lng != null) setCoords({ lat: s.lat, lng: s.lng });
      setAddress(s.address || "");
    }
  }, [open]);

  // Cierre por click-afuera + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Audit #4b (Brandon 2026-07-05): coordinación entre popovers. Si se abre OTRO
  // popover (p.ej. el mega-menú de categorías), este se cierra — antes quedaban
  // superpuestos en pantalla. Al abrir ESTE avisamos con el mismo evento.
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "location") setOpen(false);
    };
    window.addEventListener("buleje:popover-open", onOther);
    return () => window.removeEventListener("buleje:popover-open", onOther);
  }, []);

  // Al abrir ESTE, avisar (en effect, NO en el updater de setState — evita
  // "update during render" al cerrar el otro popover).
  useEffect(() => {
    if (open)
      window.dispatchEvent(new CustomEvent("buleje:popover-open", { detail: "location" }));
  }, [open]);

  const departamentos = useMemo(() => listDepartamentos(), []);
  const provincias = useMemo(() => (depCode ? listProvincias(depCode) : []), [depCode]);
  const distritos = useMemo(
    () => (depCode && provCode ? listDistritos(depCode, provCode) : []),
    [depCode, provCode],
  );

  const label =
    stored?.label || fallbackLabel;

  const handleDep = (code: string) => {
    setDepCode(code);
    setProvCode("");
    setDistCode("");
  };
  const handleProv = (code: string) => {
    setProvCode(code);
    setDistCode("");
  };

  const useCurrentLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setShowMap(true);
        // Reverse geocode (mismo proveedor que LeafletMap) para texto legible.
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=es`,
          );
          if (r.ok) {
            const j = await r.json();
            const a = j?.address ?? {};
            const road = a.road ? `${a.road}${a.house_number ? " " + a.house_number : ""}` : "";
            const city = a.city || a.town || a.village || a.county || "";
            setAddress(road || city ? [road, city].filter(Boolean).join(", ") : `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
        } catch {
          setAddress(`GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const handleSave = useCallback(() => {
    const dep = departamentos.find((d) => d.code === depCode);
    const prov = provincias.find((p) => p.code === provCode);
    const dist = distritos.find((d) => d.code === distCode);
    const newLabel =
      dist?.nombre || prov?.nombre || dep?.nombre || address || fallbackLabel;
    const next: DeliveryLocation = {
      country: "PE",
      departmentCode: depCode,
      departmentName: dep?.nombre ?? "",
      provinceCode: provCode,
      provinceName: prov?.nombre ?? "",
      districtCode: distCode,
      districtName: dist?.nombre ?? "",
      lat: coords?.lat,
      lng: coords?.lng,
      address: address || undefined,
      label: newLabel,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {/* storage lleno: igual cerramos */}
    setStored(next);
    window.dispatchEvent(new CustomEvent("buleje:delivery-location-change", { detail: next }));
    setOpen(false);
  }, [departamentos, provincias, distritos, depCode, provCode, distCode, coords, address, fallbackLabel]);

  const selectCls =
    "w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";

  return (
    <div ref={rootRef} className="relative hidden lg:block shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Tu ubicación de entrega — cambiar"
        className="inline-flex items-center gap-1.5 max-w-[200px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <MapPin className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} aria-hidden="true" />
        <span className="text-sm font-bold truncate">{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} strokeWidth={2.25} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Cambiar ubicación de entrega"
          className="absolute left-0 top-full mt-2 z-50 w-[320px] max-w-[90vw] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-black tracking-tight text-[var(--text-primary)]">Enviar a</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <div className="space-y-2.5">
            {/* Audit #4 (Brandon 2026-07-05): opciones RÁPIDAS arriba (GPS + mapa),
                antes iban al fondo tras 4 selects en cascada. La zona manual queda
                abajo como alternativa. Select "País" (siempre Perú) removido. */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-soft)] h-12 px-3 text-sm font-extrabold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-60"
              >
                <Navigation className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                {locating ? "Ubicando…" : "Mi ubicación"}
              </button>
              <button
                type="button"
                onClick={() => setShowMap((s) => !s)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] h-12 px-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                {showMap ? "Ocultar mapa" : "Mapa"}
              </button>
            </div>

            {address && (
              <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">{address}</p>
            )}

            {showMap && (
              <div className="overflow-hidden rounded-xl border border-[var(--rule-soft)]">
                <LeafletMap
                  lat={coords?.lat ?? DEFAULT_COORDS.lat}
                  lon={coords?.lng ?? DEFAULT_COORDS.lon}
                  height={180}
                  onPick={(lat, lng, addr) => {
                    setCoords({ lat, lng });
                    setAddress(addr);
                  }}
                />
              </div>
            )}

            {/* o elegí tu zona manualmente */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="h-px flex-1 bg-[var(--rule-soft)]" aria-hidden />
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                o elegí tu zona
              </span>
              <span className="h-px flex-1 bg-[var(--rule-soft)]" aria-hidden />
            </div>

            {/* Departamento */}
            <label className="block">
              <span className="mb-1 block text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Departamento</span>
              <select className={selectCls} value={depCode} onChange={(e) => handleDep(e.target.value)} aria-label="Departamento">
                <option value="">Elegí departamento</option>
                {departamentos.map((d) => (
                  <option key={d.code} value={d.code}>{d.nombre}</option>
                ))}
              </select>
            </label>

            {/* Provincia */}
            <label className="block">
              <span className="mb-1 block text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Provincia</span>
              <select className={selectCls} value={provCode} onChange={(e) => handleProv(e.target.value)} disabled={!depCode} aria-label="Provincia">
                <option value="">{depCode ? "Elegí provincia" : "Primero el departamento"}</option>
                {provincias.map((p) => (
                  <option key={p.code} value={p.code}>{p.nombre}</option>
                ))}
              </select>
            </label>

            {/* Distrito */}
            <label className="block">
              <span className="mb-1 block text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Distrito</span>
              <select className={selectCls} value={distCode} onChange={(e) => setDistCode(e.target.value)} disabled={!provCode} aria-label="Distrito">
                <option value="">{provCode ? "Elegí distrito" : "Primero la provincia"}</option>
                {distritos.map((d) => (
                  <option key={d.code} value={d.code}>{d.nombre}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleSave}
              className="mt-1 w-full inline-flex items-center justify-center rounded-full bg-[var(--accent)] h-12 text-sm font-extrabold text-white hover:opacity-90 active:scale-[0.99] transition-all"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
