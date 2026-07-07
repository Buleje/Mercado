"use client";

/**
 * CheckoutEditModal — edita "datos" (quién recibe) o "entrega" (dirección) en un
 * modal, sin redirigir. Inputs enlazados al checkout-data (mismo estado que las
 * páginas). "Listo" solo cierra.
 *
 * Brandon 2026-07-06 (v2): funciones ricas —
 *   - Datos: campo DNI → lookup RENIEC autocompleta nombre/apellidos.
 *   - Entrega: "Poner mi ubicación actual" (GPS → reverse-geocode → mapa
 *     confirmable) además de la carga manual (calle + ubigeo).
 */

import { useCallback, useEffect, useState } from "react";
import { X, User, MapPin, Check, Navigation, Loader2, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import { LocationConfirmModal } from "@/components/checkout/parts/LocationConfirmModal";

type UbigeoEntry = { code: string; nombre: string };

const labelCls =
  "mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const fieldCls =
  "h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

export default function CheckoutEditModal({
  mode,
  onClose,
}: {
  mode: "datos" | "entrega";
  onClose: () => void;
}) {
  const { customer, address, setCustomer, setAddress, isCustomerValid, isAddressValid } =
    useCheckoutData();

  const [departamentos, setDepartamentos] = useState<UbigeoEntry[]>([]);
  const [provincias, setProvincias] = useState<UbigeoEntry[]>([]);
  const [distritos, setDistritos] = useState<UbigeoEntry[]>([]);

  // DNI (datos)
  const [dniLoading, setDniLoading] = useState(false);
  const [dniMsg, setDniMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Geolocalización + mapa (entrega)
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapInit, setMapInit] = useState<{ lat: number; lon: number; address: string } | null>(null);

  // Escape + scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !mapOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, mapOpen]);

  // ── Cascada de ubigeo (solo modo entrega) ──────────────────────────────
  useEffect(() => {
    if (mode !== "entrega") return;
    let cancelled = false;
    fetch("/api/marketplace/ubigeo")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { items?: UbigeoEntry[] }) => {
        if (!cancelled) setDepartamentos(d.items ?? []);
      })
      .catch(() => {
        /* ubigeo no crítico: fire-and-forget (CLAUDE.md #7) */
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "entrega" || !address.departmentCode) {
      setProvincias([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/marketplace/ubigeo?dep=${encodeURIComponent(address.departmentCode)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { items?: UbigeoEntry[] }) => {
        if (!cancelled) setProvincias(d.items ?? []);
      })
      .catch(() => {
        /* ubigeo no crítico: fire-and-forget (CLAUDE.md #7) */
      });
    return () => {
      cancelled = true;
    };
  }, [mode, address.departmentCode]);

  useEffect(() => {
    if (mode !== "entrega" || !address.departmentCode || !address.provinceCode) {
      setDistritos([]);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/marketplace/ubigeo?dep=${encodeURIComponent(address.departmentCode)}&prov=${encodeURIComponent(address.provinceCode)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { items?: UbigeoEntry[] }) => {
        if (!cancelled) setDistritos(d.items ?? []);
      })
      .catch(() => {
        /* ubigeo no crítico: fire-and-forget (CLAUDE.md #7) */
      });
    return () => {
      cancelled = true;
    };
  }, [mode, address.departmentCode, address.provinceCode]);

  // ── DNI → RENIEC (autocompleta nombre) ─────────────────────────────────
  const dni = customer.dni ?? "";
  useEffect(() => {
    if (mode !== "datos" || !/^\d{8}$/.test(dni)) {
      setDniMsg(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setDniLoading(true);
      setDniMsg(null);
      try {
        const res = await fetch(`/api/reniec/dni/${dni}`, { signal: ctrl.signal });
        const data = (await res.json()) as { nombreCompleto?: string; error?: string };
        if (res.ok && data?.nombreCompleto) {
          setCustomer({ name: data.nombreCompleto });
          setDniMsg({ ok: true, text: "Datos encontrados en RENIEC" });
        } else {
          setDniMsg({ ok: false, text: data?.error ?? "No encontramos ese DNI." });
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setDniMsg({ ok: false, text: "No se pudo consultar el DNI." });
        }
      } finally {
        setDniLoading(false);
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [dni, mode, setCustomer]);

  // ── Geolocalización (entrega) ──────────────────────────────────────────
  const handleUseCurrentLocation = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setGeoError("Tu navegador no soporta ubicación.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
        }),
      );
      const { latitude, longitude } = pos.coords;
      let initialAddress = "";
      try {
        const r = await fetch(
          `/api/marketplace/reverse-geocode?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`,
        );
        if (r.ok) initialAddress = ((await r.json()).displayName as string | undefined) ?? "";
      } catch {
        /* preview textual opcional */
      }
      setMapInit({ lat: latitude, lon: longitude, address: initialAddress });
      setMapOpen(true);
    } catch (err) {
      const ge = err as GeolocationPositionError;
      setGeoError(
        ge?.code === 1
          ? "Bloqueaste la ubicación. Permitíla en el 🔒 de la barra de direcciones."
          : ge?.code === 3
            ? "Tiempo agotado. Intentá de nuevo."
            : "No pudimos obtener tu ubicación. Cargá los campos manualmente.",
      );
    } finally {
      setGeoLoading(false);
    }
  }, []);

  const handleMapConfirm = useCallback(
    async (lat: number, lon: number, displayAddr: string) => {
      try {
        const r = await fetch(
          `/api/marketplace/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}`,
        );
        if (!r.ok) throw new Error("reverse-geocode failed");
        const data = await r.json();
        const street = (data.street as string | null) ?? "";
        const match = (data.match ?? {}) as {
          departamento?: { code: string; nombre: string } | null;
          provincia?: { code: string; nombre: string } | null;
          distrito?: { code: string; nombre: string } | null;
        };
        setAddress({
          address: street || displayAddr || address.address,
          departmentCode: match.departamento?.code ?? "",
          departmentName: match.departamento?.nombre ?? "",
          provinceCode: match.provincia?.code ?? "",
          provinceName: match.provincia?.nombre ?? "",
          districtCode: match.distrito?.code ?? "",
          districtName: match.distrito?.nombre ?? "",
          zone:
            match.distrito && match.provincia && match.departamento
              ? `${match.distrito.nombre}, ${match.provincia.nombre}, ${match.departamento.nombre}`
              : ((data.displayName as string | undefined) ?? displayAddr ?? ""),
        });
      } catch {
        setGeoError("No pudimos identificar tu dirección. Cargá los campos manualmente.");
      } finally {
        setMapOpen(false);
      }
    },
    [setAddress, address.address],
  );

  const onDept = (depCode: string) => {
    const dep = departamentos.find((d) => d.code === depCode);
    setAddress({
      departmentCode: dep?.code ?? "",
      departmentName: dep?.nombre ?? "",
      provinceCode: "",
      provinceName: "",
      districtCode: "",
      districtName: "",
    });
  };
  const onProv = (provCode: string) => {
    const prov = provincias.find((p) => p.code === provCode);
    setAddress({ provinceCode: prov?.code ?? "", provinceName: prov?.nombre ?? "", districtCode: "", districtName: "" });
  };
  const onDist = (distCode: string) => {
    const dist = distritos.find((d) => d.code === distCode);
    setAddress({
      districtCode: dist?.code ?? "",
      districtName: dist?.nombre ?? "",
      zone: dist ? `${dist.nombre}, ${address.provinceName}, ${address.departmentName}` : "",
    });
  };

  const isDatos = mode === "datos";
  const canSave = isDatos ? isCustomerValid : isAddressValid;
  const Icon = isDatos ? User : MapPin;
  const phoneOk = /^9\d{8}$/.test(customer.phone ?? "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isDatos ? "Editar tus datos" : "Editar la entrega"}
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-[fadeIn_.2s_ease-out]"
      />

      <div className="relative w-full sm:max-w-[30rem] max-h-[92vh] flex flex-col bg-[var(--surface-canvas)] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-[0_24px_80px_-20px_rgba(0,0,0,0.5)] animate-[scaleIn_.25s_ease-out]">
        <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[var(--rule-soft)]">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent-dark)] dark:text-[var(--accent)]"
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <h2 className="text-lg font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              {isDatos ? "Editar tus datos" : "Editar la entrega"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          {isDatos ? (
            <>
              {/* DNI → RENIEC */}
              <div>
                <label htmlFor="edit-dni" className={labelCls}>
                  DNI (autocompleta tu nombre)
                </label>
                <div className="relative">
                  <input
                    id="edit-dni"
                    value={dni}
                    onChange={(e) => setCustomer({ dni: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                    inputMode="numeric"
                    placeholder="8 dígitos"
                    className={cn(fieldCls, "font-mono tabular-nums pr-11")}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2">
                    {dniLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" aria-hidden />
                    ) : dniMsg?.ok ? (
                      <CheckCircle2 className="h-5 w-5 text-[var(--data-success-600)]" strokeWidth={2.25} aria-hidden />
                    ) : null}
                  </span>
                </div>
                {dniMsg && (
                  <p
                    className={cn(
                      "mt-2 ml-1 text-sm font-medium",
                      dniMsg.ok ? "text-[var(--data-success-600)]" : "text-[var(--data-error-500)]",
                    )}
                  >
                    {dniMsg.text}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="edit-name" className={labelCls}>Nombre completo</label>
                <input
                  id="edit-name"
                  value={customer.name ?? ""}
                  onChange={(e) => setCustomer({ name: e.target.value })}
                  placeholder="Ej. María Pérez"
                  className={fieldCls}
                />
              </div>
              <div>
                <label htmlFor="edit-phone" className={labelCls}>WhatsApp</label>
                <input
                  id="edit-phone"
                  value={customer.phone ?? ""}
                  onChange={(e) => setCustomer({ phone: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                  inputMode="numeric"
                  placeholder="9XXXXXXXX"
                  className={cn(fieldCls, "font-mono tabular-nums")}
                />
                {(customer.phone ?? "").length > 0 && !phoneOk && (
                  <p className="mt-2 ml-1 text-sm text-[var(--data-error-500)]">
                    Tu WhatsApp debe tener 9 dígitos y empezar con 9.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Ubicación actual (GPS + mapa) */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={geoLoading}
                className="group flex w-full items-center gap-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-3.5 text-left transition-colors hover:border-[var(--accent)] disabled:opacity-60"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
                  {geoLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Navigation className="h-5 w-5" strokeWidth={2} aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent-dark)] dark:text-[var(--accent)]">
                    1 toque · en el mapa
                  </span>
                  <span className="block text-base font-bold text-[var(--text-primary)] leading-tight">
                    {geoLoading ? "Ubicando…" : "Poner mi ubicación actual"}
                  </span>
                </span>
              </button>
              {geoError && (
                <p className="text-sm text-[var(--data-error-500)] leading-snug">{geoError}</p>
              )}

              <div className="relative flex items-center gap-3">
                <span className="flex-1 h-px bg-[var(--rule-soft)]" aria-hidden />
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">o cargá manual</span>
                <span className="flex-1 h-px bg-[var(--rule-soft)]" aria-hidden />
              </div>

              <div>
                <label htmlFor="edit-street" className={labelCls}>Calle y número</label>
                <input
                  id="edit-street"
                  value={address.address ?? ""}
                  onChange={(e) => setAddress({ address: e.target.value })}
                  placeholder="Ej: Jr. Los Olivos 123"
                  className={fieldCls}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="edit-dept" className={labelCls}>Departamento</label>
                  <select id="edit-dept" value={address.departmentCode} onChange={(e) => onDept(e.target.value)} className={fieldCls}>
                    <option value="">Seleccioná</option>
                    {departamentos.map((d) => (
                      <option key={d.code} value={d.code}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-prov" className={labelCls}>Provincia</label>
                  <select id="edit-prov" value={address.provinceCode} onChange={(e) => onProv(e.target.value)} disabled={!address.departmentCode} className={cn(fieldCls, "disabled:opacity-50")}>
                    <option value="">Seleccioná</option>
                    {address.provinceCode && !provincias.find((p) => p.code === address.provinceCode) && (
                      <option value={address.provinceCode}>{address.provinceName}</option>
                    )}
                    {provincias.map((p) => (
                      <option key={p.code} value={p.code}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-dist" className={labelCls}>Distrito</label>
                  <select id="edit-dist" value={address.districtCode} onChange={(e) => onDist(e.target.value)} disabled={!address.provinceCode} className={cn(fieldCls, "disabled:opacity-50")}>
                    <option value="">Seleccioná</option>
                    {address.districtCode && !distritos.find((d) => d.code === address.districtCode) && (
                      <option value={address.districtCode}>{address.districtName}</option>
                    )}
                    {distritos.map((d) => (
                      <option key={d.code} value={d.code}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="edit-notes" className={labelCls}>Referencia o instrucciones</label>
                <input
                  id="edit-notes"
                  value={address.notes ?? ""}
                  onChange={(e) => setAddress({ notes: e.target.value })}
                  placeholder="Ej: casa azul, tocar el timbre"
                  className={fieldCls}
                />
              </div>
            </>
          )}
        </div>

        <footer className="px-5 sm:px-6 py-4 border-t border-[var(--rule-soft)]">
          <button
            type="button"
            onClick={onClose}
            disabled={!canSave}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 h-12 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            Listo
          </button>
        </footer>
      </div>

      {/* Mapa confirmable (GPS) */}
      {mapInit && (
        <LocationConfirmModal
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          initialLat={mapInit.lat}
          initialLon={mapInit.lon}
          initialAddress={mapInit.address}
          onConfirm={handleMapConfirm}
        />
      )}
    </div>
  );
}
