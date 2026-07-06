"use client";

/**
 * CheckoutEditModal — edita "datos" (quién recibe) o "entrega" (dirección)
 * DENTRO de un modal, sin redirigir a /checkout/datos ni /checkout/entrega.
 *
 * Brandon 2026-07-06: desde /checkout/confirmar el lápiz de Datos/Entrega abre
 * este modal. Los inputs escriben directo al checkout-data (mismo estado que las
 * páginas), así que editar acá = editar en el flujo. "Listo" solo cierra.
 */

import { useEffect, useState } from "react";
import { X, User, MapPin, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCheckoutData } from "@/hooks/use-checkout-data";

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
  const {
    customer,
    address,
    setCustomer,
    setAddress,
    isCustomerValid,
    isAddressValid,
  } = useCheckoutData();

  const [departamentos, setDepartamentos] = useState<UbigeoEntry[]>([]);
  const [provincias, setProvincias] = useState<UbigeoEntry[]>([]);
  const [distritos, setDistritos] = useState<UbigeoEntry[]>([]);

  // Escape + scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

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
    setAddress({
      provinceCode: prov?.code ?? "",
      provinceName: prov?.nombre ?? "",
      districtCode: "",
      districtName: "",
    });
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
        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          {isDatos ? (
            <>
              <div>
                <label htmlFor="edit-name" className={labelCls}>Nombre completo</label>
                <input
                  id="edit-name"
                  value={customer.name ?? ""}
                  onChange={(e) => setCustomer({ name: e.target.value })}
                  placeholder="Ej. María Pérez"
                  autoFocus
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
                {(customer.phone ?? "").length > 0 && !/^9\d{8}$/.test(customer.phone) && (
                  <p className="mt-2 ml-1 text-sm text-[var(--data-error-500)]">
                    Tu WhatsApp debe tener 9 dígitos y empezar con 9.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="edit-street" className={labelCls}>Calle y número</label>
                <input
                  id="edit-street"
                  value={address.address ?? ""}
                  onChange={(e) => setAddress({ address: e.target.value })}
                  placeholder="Ej: Jr. Los Olivos 123"
                  autoFocus
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

        {/* Footer */}
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
    </div>
  );
}
