"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBasket, Loader2, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminLoginPage() {
  const router = useRouter();
  const fromRef = useRef<string | null>(null);
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);
  const [bypassError, setBypassError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    fromRef.current = params.get("from");
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username || undefined, password: pw }),
      });
      if (res.ok) {
        router.push(fromRef.current ? decodeURIComponent(fromRef.current) : "/admin");
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

  const handleBypass = async () => {
    setBypassLoading(true);
    setBypassError(false);
    try {
      const res = await fetch("/api/auth/bypass", { method: "POST" });
      if (res.ok) {
        router.push(fromRef.current ? decodeURIComponent(fromRef.current) : "/admin");
      } else {
        setBypassError(true);
        setTimeout(() => setBypassError(false), 3000);
      }
    } catch {
      setBypassError(true);
      setTimeout(() => setBypassError(false), 3000);
    }
    setBypassLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center mb-4 shadow-lg shadow-primary/25">
            <ShoppingBasket className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Admin</h1>
          <p className="text-sm text-gray-400 mt-1">Bodega San Martín</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuario (opcional)"
            className="w-full px-4 py-3 rounded-xl border-2 text-gray-900 placeholder:text-gray-400 outline-none focus:border-primary transition-colors border-gray-200"
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Contraseña"
            autoFocus
            className={cn(
              "w-full px-4 py-3 rounded-xl border-2 text-gray-900 placeholder:text-gray-400 outline-none focus:border-primary transition-colors",
              error ? "border-red-400 bg-red-50" : "border-gray-200"
            )}
          />
          {error && (
            <p className="text-sm text-red-500 font-semibold">
              Credenciales incorrectas
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <button
            onClick={handleBypass}
            disabled={bypassLoading}
            className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {bypassLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {bypassLoading ? "Entrando…" : "Entrar sin login"}
          </button>
          {bypassError && (
            <p className="text-xs text-amber-600 text-center mt-2">Acceso sin login no disponible</p>
          )}
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-4">admin / cajero / almacen</p>
      </div>
    </div>
  );
}
