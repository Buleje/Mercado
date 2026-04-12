"use client";

import { useState, useEffect } from "react";
import { Smartphone, Tablet, Monitor, X, ChevronRight, Sparkles, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "buleje_welcome_done";

type Device = "celular" | "tablet" | "computadora";

const DEVICES: { id: Device; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "celular", label: "Celular", Icon: Smartphone },
  { id: "tablet", label: "Tablet", Icon: Tablet },
  { id: "computadora", label: "Computadora", Icon: Monitor },
];

export default function WelcomeSurveyModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"welcome" | "form" | "thanks">("welcome");
  const [name, setName] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Show only to first-time visitors, delay 1.5s for page load
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const timer = setTimeout(() => setOpen(true), 1500);
        return () => clearTimeout(timer);
      }
    } catch {
      // Storage not available (private mode, etc.) — skip silently
    }
  }, []);

  function toggleDevice(d: Device) {
    setDevices((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Por favor escribe tu nombre."); return; }
    if (devices.length === 0) { setError("Selecciona al menos un dispositivo."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/visitor-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), devices }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      localStorage.setItem(STORAGE_KEY, "1");
      setStep("thanks");
      setTimeout(() => setOpen(false), 2200);
    } catch {
      setError("Ocurrió un error. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Proyecto Buleje — Versión 1 Beta"
      className="fixed inset-0 z-9999 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={handleDismiss}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-400">

        {/* Header strip */}
        <div className="bg-linear-to-r from-indigo-600 via-purple-600 to-pink-500 p-6 text-white text-center relative">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 rounded-full bg-white/20 hover:bg-white/30 p-1.5 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex justify-center mb-3">
            <div className="bg-white/20 rounded-2xl p-3 relative">
              <FlaskConical className="w-8 h-8 text-white" />
              <span className="absolute -top-1 -right-1 bg-amber-400 text-amber-900 text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full leading-none shadow">Beta</span>
            </div>
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {step === "thanks" ? "¡Gracias! 🎉" : "Proyecto en desarrollo"}
          </h2>
          <p className="text-white/80 text-sm mt-1">
            {step === "thanks"
              ? "Tu feedback mejora el proyecto"
              : "Buleje · Versión 1 Beta"}
          </p>
        </div>

        {/* Step: welcome */}
        {step === "welcome" && (
          <div className="p-6 text-center space-y-5">
            <div className="space-y-2">
              <p className="text-gray-700 dark:text-gray-200 text-base leading-relaxed">
                Este es un{" "}
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">proyecto de software</span>{" "}
                en su primera versión beta. Algunas funciones aún están en construcción.
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Tu feedback es valioso — ayúdanos a mejorar respondiendo 2 preguntas rápidas. 🙌
              </p>
            </div>
            <div className="flex gap-2 justify-center flex-wrap text-xs">
              {["⚗️ v1 Beta", "🛠️ En desarrollo", "📦 E-commerce", "📊 Dashboard", "🔒 Auth"].map((tag) => (
                <span
                  key={tag}
                  className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
            <button
              className="w-full bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
              onClick={() => setStep("form")}
            >
              <Sparkles className="w-4 h-4" />
              Comenzar
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleDismiss}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Saltar por ahora
            </button>
          </div>
        )}

        {/* Step: form */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ¿Cuál es tu nombre? <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ej: María, Juan..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                autoFocus
              />
            </div>

            {/* Devices */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                ¿Desde dónde nos visitas? <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500">Puedes marcar más de uno</p>
              <div className="grid grid-cols-3 gap-2">
                {DEVICES.map(({ id, label, Icon }) => {
                  const selected = devices.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleDevice(id)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all select-none",
                        selected
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:bg-indigo-50/50"
                      )}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-xs font-medium">{label}</span>
                      {selected && (
                        <span className="w-2 h-2 rounded-full bg-indigo-500 absolute" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-60 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Enviar y entrar a la tienda
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
            >
              Omitir
            </button>
          </form>
        )}

        {/* Step: thanks */}
        {step === "thanks" && (
          <div className="p-8 text-center space-y-3">
            <div className="text-5xl animate-bounce">🎉</div>
            <p className="text-gray-700 dark:text-gray-200 font-medium text-lg">
              ¡Hola, <span className="text-indigo-600 dark:text-indigo-400">{name}</span>!
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Gracias por tu tiempo. ¡Disfruta la tienda!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
