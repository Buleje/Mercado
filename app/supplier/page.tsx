"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import SupplierDashboard from "@/components/supplier/SupplierDashboard";
import { csrfHeaders } from "@/lib/csrf-client";

interface SupplierInfo {
  id: string;
  name: string;
}

export default function SupplierPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null); // null = cargando
  const [supplierData, setSupplierData] = useState<SupplierInfo | null>(null);

  // ── Verificar sesión al montar ─────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/supplier/auth", { method: "GET" })
      .then((res) => {
        if (!res.ok) {
          setAuthenticated(false);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.authenticated) {
          setAuthenticated(true);
          setSupplierData(data.supplier ?? null);
        } else {
          setAuthenticated(false);
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  // ── Login handler ──────────────────────────────────────────────────────────
  const handleLogin = async (apiKey: string): Promise<string | null> => {
    const res = await fetch("/api/supplier/auth", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return json.error ?? "Código de acceso inválido";
    }
    const data = await res.json();
    setSupplierData(data.supplier ?? null);
    setAuthenticated(true);
    return null;
  };

  // ── Logout handler ─────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await fetch("/api/supplier/auth", { method: "DELETE", headers: csrfHeaders() });
    setAuthenticated(false);
    setSupplierData(null);
  };

  // ── Cargando ───────────────────────────────────────────────────────────────
  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--accent-dark)] border-t-transparent" />
      </div>
    );
  }

  // ── Autenticado → Dashboard ────────────────────────────────────────────────
  if (authenticated) {
    return <SupplierDashboard supplierName={supplierData?.name} onLogout={handleLogout} />;
  }

  // ── No autenticado → Pantalla de login ────────────────────────────────────
  return <SupplierLoginScreen onLogin={handleLogin} />;
}

// ── Componente de login ────────────────────────────────────────────────────

function SupplierLoginScreen({
  onLogin,
}: {
  onLogin: (apiKey: string) => Promise<string | null>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);
    const err = await onLogin(apiKey.trim());
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / marca */}
        <div className="mb-8 text-center">
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white text-xl font-black mb-3"
            style={{ background: "var(--accent)" }}
          >
            B
          </span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portal Proveedor</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Ingresa tu código de acceso para continuar
          </p>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-sm border border-gray-200 dark:border-gray-800 space-y-4"
        >
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Código de acceso
            </label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="current-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Te lo dió el administrador de la tienda"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--accent-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-dark)]/20"
              disabled={loading}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Si no lo tienes, contacta al administrador de la tienda.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-[var(--data-error-600)] dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </form>

        <a
          href="https://wa.me/?text=Hola%2C%20necesito%20mi%20c%C3%B3digo%20de%20acceso%20de%20proveedor"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-[var(--accent-dark)] dark:hover:text-[var(--accent)] transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Contactar admin por WhatsApp
        </a>
      </div>
    </div>
  );
}
