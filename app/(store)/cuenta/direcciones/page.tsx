"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  MapPin,
  Plus,
  Trash2,
  ArrowLeft,
  Home,
  Briefcase,
  CheckCircle2,
  Info,
  X,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { csrfHeaders } from "@/lib/csrf-client";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { MensajeronBuscando } from "@/components/ui-system/illustrations";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));

type AddressEntry = {
  id: string;
  label: string;
  address: string;
  reference: string;
  isDefault: boolean;
  type: "home" | "work" | "other";
};

// Sin demo data — direcciones solo vienen del customer real (locations
// guardadas vía checkout). Si no hay, mostramos empty state.

function AddressCard({
  addr,
  onDelete,
  onSetDefault,
}: {
  addr: AddressEntry;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const TypeIcon =
    addr.type === "home"
      ? Home
      : addr.type === "work"
        ? Briefcase
        : MapPin;

  return (
    <div
      className="rounded-2xl p-5 transition-all"
      style={{
        background: "var(--color-card)",
        border: addr.isDefault
          ? "2px solid color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)"
          : "1px solid var(--color-card-border)",
        boxShadow: addr.isDefault
          ? "0 8px 20px -8px color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent)"
          : "0 1px 2px color-mix(in oklch, var(--color-primary, #00A0A0) 8%, transparent)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={
            addr.isDefault
              ? {
                  background:
                    "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                  boxShadow:
                    "0 4px 12px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
                }
              : {
                  background:
                    "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)",
                }
          }
        >
          <TypeIcon
            className="h-5 w-5"
            strokeWidth={2.25}
            style={{
              color: addr.isDefault
                ? "white"
                : "var(--color-primary-dark, #009690)",
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-base font-extrabold text-[var(--text-primary)]">
              {addr.label}
            </span>
            {addr.isDefault && (
              <span
                className="inline-flex items-center gap-1 text-xs font-extrabold px-2 py-0.5 rounded-full text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                }}
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                Principal
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
            {addr.address}
          </p>
          {addr.reference && (
            <p className="text-xs text-muted mt-1 leading-snug">
              Referencia: {addr.reference}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-4">
            {!addr.isDefault && (
              <button
                onClick={() => onSetDefault(addr.id)}
                className="inline-flex items-center gap-1 text-xs font-extrabold hover:underline underline-offset-2 transition-colors"
                style={{ color: "var(--color-primary-dark, #009690)" }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                Marcar como principal
              </button>
            )}
            <button
              onClick={() => onDelete(addr.id)}
              className="inline-flex items-center gap-1 text-xs font-extrabold text-[var(--data-error-600)] hover:text-[var(--data-error-700)] transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DireccionesPage() {
  const { customer } = useCustomer();
  const [addresses, setAddresses] = useState<AddressEntry[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(
    customer?.activeLocationId,
  );
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ location: "", reference: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Carga autoritativa desde el server (SavedLocation del customer, scoped por
  // tenant vía requireCustomer). Reemplaza el estado local que no persistía.
  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/me/addresses", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        addresses?: { id: string; location: string; reference: string }[];
      };
      setAddresses(
        (data.addresses ?? []).map((loc, i) => ({
          id: loc.id,
          label: i === 0 ? "Principal" : `Dirección ${i + 1}`,
          address: loc.location,
          reference: loc.reference,
          isDefault: false, // se computa en render desde activeId
          type: "other" as const,
        })),
      );
    } catch (err) {
      console.error("[direcciones] refetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (customer?.activeLocationId) setActiveId(customer.activeLocationId);
  }, [customer?.activeLocationId]);

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      const location = form.location.trim();
      if (location.length < 3) {
        setFormError("Ingresa una dirección válida (mínimo 3 caracteres).");
        return;
      }
      setSaving(true);
      try {
        const wasEmpty = addresses.length === 0;
        const res = await fetch("/api/me/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({ location, reference: form.reference.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          address?: { id: string };
        };
        if (!res.ok) {
          setFormError(data.error ?? "No se pudo guardar la dirección.");
          return;
        }
        // Primera dirección guardada → marcarla principal automáticamente.
        if (wasEmpty && data.address?.id) {
          await fetch("/api/me/addresses", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...csrfHeaders() },
            credentials: "include",
            body: JSON.stringify({ id: data.address.id }),
          }).catch((err) =>
            console.error("[direcciones] set first active failed", err),
          );
          setActiveId(data.address.id);
        }
        setForm({ location: "", reference: "" });
        setShowForm(false);
        await refetch();
      } catch (err) {
        console.error("[direcciones] add failed", err);
        setFormError("Error de conexión. Intenta de nuevo.");
      } finally {
        setSaving(false);
      }
    },
    [form, addresses.length, refetch],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const snapshot = addresses;
      setAddresses((prev) => prev.filter((a) => a.id !== id)); // optimista
      try {
        const res = await fetch("/api/me/addresses", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({ id }),
        });
        if (!res.ok) setAddresses(snapshot); // revertir si falló
      } catch (err) {
        console.error("[direcciones] delete failed", err);
        setAddresses(snapshot);
      }
    },
    [addresses],
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      const prev = activeId;
      setActiveId(id); // optimista
      try {
        const res = await fetch("/api/me/addresses", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({ id }),
        });
        if (!res.ok) setActiveId(prev); // revertir
      } catch (err) {
        console.error("[direcciones] set default failed", err);
        setActiveId(prev);
      }
    },
    [activeId],
  );

  return (
    <div
      className="min-h-screen dark:bg-background"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, var(--surface-canvas, #f9fafb))",
      }}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi panel", url: "https://www.buleje.pe/mi-panel" },
          { name: "Direcciones", url: "https://www.buleje.pe/cuenta/direcciones" },
        ]}
      />

      {/* ── Hero — brand gradient ─────────────────────────────── */}
      <div
        className="relative overflow-hidden pt-36 sm:pt-44 pb-10 sm:pb-14"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00A0A0) 100%)",
        }}
      >
        <div
          className="absolute -top-16 -right-16 h-64 w-64 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.10)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.07)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav
            aria-label="Migas de pan"
            className="flex items-center gap-1.5 text-xs text-white/75 mb-6 font-semibold"
          >
            <Link href="/" className="hover:text-white transition-colors">
              Inicio
            </Link>
            <span className="text-white/45">/</span>
            <Link
              href="/mi-panel"
              className="hover:text-white transition-colors"
            >
              Mi panel
            </Link>
            <span className="text-white/45">/</span>
            <span className="text-white">Direcciones</span>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/mi-panel"
              className="h-11 w-11 inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors text-white shrink-0 border border-white/20"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            </Link>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-white/85 mb-1">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
                Tu cuenta
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
                Direcciones de entrega
              </h1>
              <p className="text-sm text-white/85 mt-1.5 leading-snug">
                Hasta 5 direcciones guardadas para pedidos más rápidos
              </p>
              {addresses.length > 0 && (
                <span className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 border border-white/25 text-xs font-extrabold text-white">
                  {addresses.length}{" "}
                  {addresses.length === 1 ? "guardada" : "guardadas"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4 pb-28">
        {/* Add button — destacado */}
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
          }}
          className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-sm font-extrabold text-white transition-all active:scale-[0.99]"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
            boxShadow:
              "0 10px 24px -8px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
          }}
        >
          {showForm ? (
            <X className="h-5 w-5" strokeWidth={2.5} />
          ) : (
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          )}
          {showForm ? "Cancelar" : "Agregar nueva dirección"}
        </button>

        {/* Form — agregar dirección (persiste vía /api/me/addresses) */}
        {showForm && (
          <form
            onSubmit={handleAdd}
            noValidate
            aria-label="Agregar nueva dirección"
            className="rounded-2xl p-5 space-y-3"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-card-border)",
            }}
          >
            <div>
              <label
                htmlFor="loc-input"
                className="block text-sm font-bold text-[var(--text-primary)] mb-1.5"
              >
                Dirección
              </label>
              <input
                id="loc-input"
                type="text"
                value={form.location}
                onChange={(e) => {
                  setForm((f) => ({ ...f, location: e.target.value }));
                  setFormError(null);
                }}
                placeholder="Av. Lima 123, Ciudad Constitución"
                autoComplete="street-address"
                className="w-full h-12 rounded-2xl border-2 px-4 text-base text-[var(--text-primary)] bg-[var(--surface-canvas)] focus:outline-none focus:border-[var(--color-primary,#00A0A0)] transition-colors"
                style={{ borderColor: "var(--color-card-border)" }}
              />
            </div>
            <div>
              <label
                htmlFor="ref-input"
                className="block text-sm font-bold text-[var(--text-primary)] mb-1.5"
              >
                Referencia <span className="font-normal text-muted">(opcional)</span>
              </label>
              <input
                id="ref-input"
                type="text"
                value={form.reference}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reference: e.target.value }))
                }
                placeholder="Frente al parque, portón azul"
                className="w-full h-12 rounded-2xl border-2 px-4 text-base text-[var(--text-primary)] bg-[var(--surface-canvas)] focus:outline-none focus:border-[var(--color-primary,#00A0A0)] transition-colors"
                style={{ borderColor: "var(--color-card-border)" }}
              />
            </div>
            {formError && (
              <p className="text-sm font-semibold text-[var(--data-error-600)]">
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full h-12 rounded-2xl text-sm font-extrabold text-white transition-all active:scale-[0.99] disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
              }}
            >
              {saving ? "Guardando…" : "Guardar dirección"}
            </button>
          </form>
        )}

        {/* Addresses list */}
        {addresses.length > 0 ? (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <AddressCard
                key={addr.id}
                addr={{ ...addr, isDefault: addr.id === activeId }}
                onDelete={handleDelete}
                onSetDefault={handleSetDefault}
              />
            ))}
          </div>
        ) : loading || showForm ? null : (
          <div
            className="rounded-3xl p-10 flex flex-col items-center gap-4 text-center"
            style={{
              background: "var(--color-card)",
              border:
                "1px solid var(--color-card-border)",
              boxShadow:
                "0 1px 2px color-mix(in oklch, var(--color-primary, #00A0A0) 10%, transparent)",
            }}
          >
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background:
                  "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)",
              }}
            >
              <MensajeronBuscando size={64} className="text-current" style={{ color: "var(--color-primary-dark, #009690)" }} />
            </div>
            <div>
              <p
                className="text-lg font-extrabold"
                style={{ color: "var(--color-primary-dark, #009690)" }}
              >
                Sin direcciones guardadas
              </p>
              <p className="text-sm text-muted mt-1.5 max-w-xs mx-auto leading-snug">
                Agrega una dirección de entrega para facilitar tus pedidos futuros.
              </p>
            </div>
          </div>
        )}

        {/* Info note — brand-tinted */}
        <div
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{
            background:
              "color-mix(in oklch, var(--color-primary, #00A0A0) 6%, var(--color-card))",
            border:
              "1px solid var(--color-card-border)",
          }}
        >
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background:
                "color-mix(in oklch, var(--color-primary, #00A0A0) 14%, transparent)",
            }}
          >
            <Info
              className="h-4 w-4"
              strokeWidth={2.25}
              style={{ color: "var(--color-primary-dark, #009690)" }}
            />
          </div>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">
            Las direcciones guardadas se usarán automáticamente al realizar un
            nuevo pedido. Puedes tener hasta{" "}
            <strong style={{ color: "var(--color-primary-dark, #009690)" }}>
              5 direcciones
            </strong>{" "}
            guardadas.
          </p>
        </div>
      </main>

      <CartSidebar />
    </div>
  );
}
