"use client";

import { useState, useEffect } from "react";
import SupplierDashboard from "@/components/supplier/SupplierDashboard";

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return json.error ?? "API Key inválida";
    }
    const data = await res.json();
    setSupplierData(data.supplier ?? null);
    setAuthenticated(true);
    return null;
  };

  // ── Logout handler ─────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await fetch("/api/supplier/auth", { method: "DELETE" });
    setAuthenticated(false);
    setSupplierData(null);
  };

  // ── Cargando ───────────────────────────────────────────────────────────────
  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
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
            style={{ background: "#00B4A6" }}
          >
            B
          </span>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Portal Proveedor</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Ingresa tu API Key para acceder
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
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              autoComplete="current-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Pega tu clave de acceso aquí"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: "#00B4A6" }}
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-600">
          ¿No tienes API Key? Contacta al administrador del marketplace.
        </p>
      </div>
    </div>
  );
}
