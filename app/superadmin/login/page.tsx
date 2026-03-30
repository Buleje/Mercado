"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck } from "lucide-react";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/superadmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/superadmin");
      } else {
        setError(true);
        setTimeout(() => setError(false), 2500);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(15,118,110,0.08) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div
        className={`bg-white dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-sm p-8 shadow-xl dark:shadow-2xl transition-all ${
          error ? "animate-[shake_0.4s_ease-in-out]" : ""
        }`}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
            style={{
              background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
            }}
          >
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1
              className="text-xl font-bold"
              style={{
                background: "linear-gradient(135deg, #0f766e, #14b8a6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Platform Admin
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Buleje SaaS</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Usuario
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 placeholder:text-gray-400 dark:placeholder:text-gray-600"
              placeholder="platform"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Contraseña
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 placeholder:text-gray-400 dark:placeholder:text-gray-600"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 rounded-xl px-4 py-2.5 text-sm animate-[shake_0.4s_ease-in-out]">
              <Lock className="w-4 h-4 shrink-0" />
              Credenciales inválidas
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-opacity"
            style={{
              background: loading
                ? "#0f766e"
                : "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Acceder
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-6px); }
          40%       { transform: translateX(6px); }
          60%       { transform: translateX(-4px); }
          80%       { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
