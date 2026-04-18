"use client";

import { useState } from "react";
import { Plus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export default function AplicarCuponForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;
    setStatus({ kind: "loading" });

    try {
      const res = await fetch("/api/cupones/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", message: data.error ?? "Error al aplicar" });
        return;
      }
      setStatus({
        kind: "success",
        message: `Cupon "${data.cupon.title}" agregado a tu coleccion`,
      });
      setCode("");
    } catch {
      setStatus({ kind: "error", message: "Error de conexion. Intentalo de nuevo." });
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
        Tenes un codigo?
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Aplicalo aca y queda guardado en tus cupones.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="cupon-code" className="sr-only">
          Codigo del cupon
        </label>
        <input
          id="cupon-code"
          type="text"
          maxLength={32}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Ej: BIENVENIDA10"
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white dark:focus:ring-white"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={status.kind === "loading" || !code.trim()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:disabled:bg-gray-700"
        >
          {status.kind === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Validando
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Aplicar
            </>
          )}
        </button>
      </form>

      {status.kind === "success" && (
        <p
          role="status"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {status.message}
        </p>
      )}
      {status.kind === "error" && (
        <p
          role="alert"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {status.message}
        </p>
      )}
    </section>
  );
}
