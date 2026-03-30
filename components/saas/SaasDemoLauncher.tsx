"use client";

import { useState } from "react";
import {
  Play, Loader2, ExternalLink, Copy, Check,
  LayoutDashboard, Store, ShoppingCart, BarChart3, Package,
  Users, Truck, Clock, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DemoResult = {
  slug: string;
  username: string;
  password: string;
  expiresIn: string;
  adminUrl: string;
  storeUrl: string;
};

const DEMO_LINKS = [
  { label: "Panel Admin", desc: "Dashboard, ventas, inventario, reportes", icon: <LayoutDashboard className="h-4 w-4" />, key: "adminUrl", color: "bg-blue-50 dark:bg-blue-950/30 text-blue-600" },
  { label: "Tienda Online", desc: "La tienda que veran tus clientes", icon: <Store className="h-4 w-4" />, key: "storeUrl", color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" },
];

const FEATURES_INCLUDED = [
  { icon: <ShoppingCart className="h-3.5 w-3.5" />, text: "20 productos cargados" },
  { icon: <Users className="h-3.5 w-3.5" />, text: "5 clientes de ejemplo" },
  { icon: <Package className="h-3.5 w-3.5" />, text: "10 pedidos con historial" },
  { icon: <BarChart3 className="h-3.5 w-3.5" />, text: "Reportes con datos reales" },
  { icon: <Truck className="h-3.5 w-3.5" />, text: "Delivery configurado" },
  { icon: <Shield className="h-3.5 w-3.5" />, text: "Plan Enterprise completo" },
];

export default function SaasDemoLauncher() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const launchDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al crear demo");
        return;
      }
      setResult(data);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Usuario: ${result.username}\nClave: ${result.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-20 sm:py-28 bg-gradient-to-b from-gray-900 to-gray-950 text-white overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 bg-teal-500/20 text-teal-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Play className="h-3 w-3" /> Demo en vivo
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold">
            Entra y explora el sistema completo
          </h2>
          <p className="text-gray-400 mt-3 max-w-2xl mx-auto">
            Creamos una tienda ficticia con productos, clientes, pedidos y reportes.
            Plan Enterprise con todo habilitado. Sin registro. Expira en 24 horas.
          </p>
        </div>

        {!result ? (
          /* ── Estado: sin demo creada ── */
          <div className="space-y-8">
            {/* Features grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
              {FEATURES_INCLUDED.map((f) => (
                <div key={f.text} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5">
                  <span className="text-teal-400">{f.icon}</span>
                  <span className="text-xs text-gray-300">{f.text}</span>
                </div>
              ))}
            </div>

            {/* Boton principal */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={launchDemo}
                disabled={loading}
                className="group flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-base sm:text-lg shadow-2xl shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-wait"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creando tu demo...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 group-hover:scale-110 transition-transform" />
                    Lanzar demo gratis
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Se crea en 5 segundos. Sin registro. Expira en 24h.
              </p>
            </div>

            {error && (
              <p className="text-center text-sm text-red-400 font-medium">{error}</p>
            )}
          </div>
        ) : (
          /* ── Estado: demo creada ── */
          <div className="space-y-6 max-w-xl mx-auto">
            {/* Credenciales */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-teal-400">Credenciales de acceso</p>
                <button
                  onClick={copyCredentials}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-xs font-medium text-gray-300 hover:bg-white/20 transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 uppercase">Usuario</p>
                  <p className="text-sm font-mono font-bold text-white">{result.username}</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 uppercase">Clave</p>
                  <p className="text-sm font-mono font-bold text-white">{result.password}</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Expira en {result.expiresIn}
              </p>
            </div>

            {/* Links de acceso */}
            <div className="space-y-2">
              {DEMO_LINKS.map((link) => (
                <a
                  key={link.key}
                  href={result[link.key as keyof DemoResult]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-teal-500/40 transition-all group"
                >
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", link.color)}>
                    {link.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{link.label}</p>
                    <p className="text-xs text-gray-400">{link.desc}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-teal-400 transition-colors shrink-0" />
                </a>
              ))}
            </div>

            {/* CTA registro */}
            <div className="text-center pt-2">
              <p className="text-sm text-gray-400 mb-3">Te gusto? Crea tu propia tienda en 2 minutos.</p>
              <a
                href="/registro"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-gray-900 font-bold text-sm hover:bg-gray-100 transition-colors shadow-lg"
              >
                Crear mi tienda gratis
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
