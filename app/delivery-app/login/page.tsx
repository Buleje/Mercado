"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Phone, Lock, ArrowRight, Bike } from "@buleje/design-system/icons";

export default function DeliveryLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const csrf = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
      const res = await fetch("/api/delivery/me/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos iniciar sesión");
        return;
      }
      router.push("/delivery-app");
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/10 mb-4">
            <Bike className="h-8 w-8 text-[var(--accent)]" strokeWidth={2.25} />
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)]">
            Repartidor Buleje
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Ingresá con tu teléfono para empezar a recibir pedidos
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
          <div>
            <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
              <Phone className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
              Tu teléfono
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9XXXXXXXX"
              autoComplete="tel"
              className="w-full h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] outline-none"
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
              <Lock className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              autoComplete="current-password"
              className="w-full h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] outline-none"
            />
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              Si es tu primera vez, usá tu número de teléfono como contraseña.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-extrabold text-white shadow-md transition-all hover:scale-[1.01] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
            ) : (
              <>
                Ingresar
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          ¿Aún no sos repartidor?{" "}
          <Link href="/marketplace/repartidor" className="font-bold text-[var(--accent)]">
            Inscribite acá
          </Link>
        </p>
      </div>
    </main>
  );
}
