"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "welcome" | "store-info" | "products" | "done";

const STEPS: { id: Step; title: string; emoji: string }[] = [
  { id: "welcome", title: "Bienvenido", emoji: "👋" },
  { id: "store-info", title: "Tu bodega", emoji: "🏪" },
  { id: "products", title: "Productos", emoji: "📦" },
  { id: "done", title: "Listo!", emoji: "🎉" },
];

export default function OnboardingSetup() {
  const [step, setStep] = useState<Step>("welcome");
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const router = useRouter();

  const currentIdx = STEPS.findIndex((s) => s.id === step);
  const progress = ((currentIdx + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white flex flex-col items-center px-4 py-8">
      {/* Progress bar */}
      <div className="w-full max-w-md mb-8">
        <div className="flex justify-between mb-2">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`text-sm font-medium ${i <= currentIdx ? "text-teal-600" : "text-gray-400"}`}
            >
              {s.emoji} {s.title}
            </span>
          ))}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-teal-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-500 mt-1">
          Tu bodega esta {Math.round(progress)}% lista
        </p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
        {/* Step: Welcome */}
        {step === "welcome" && (
          <div className="text-center space-y-4">
            <div className="text-6xl">🏪</div>
            <h1 className="text-2xl font-bold text-gray-900">
              Bienvenido a Buleje
            </h1>
            <p className="text-gray-600">
              Vamos a configurar tu bodega digital en 3 pasos simples.
              No necesitas saber de tecnologia — te guiamos en todo.
            </p>
            <button
              onClick={() => setStep("store-info")}
              className="w-full bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 transition"
            >
              Empezar configuracion →
            </button>
          </div>
        )}

        {/* Step: Store Info */}
        {step === "store-info" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">🏪 Tu bodega</h2>
            <p className="text-sm text-gray-500">
              Cuentanos sobre tu negocio
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de tu bodega
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ej: Bodega Doña Maria"
                className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direccion
              </label>
              <input
                type="text"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="Ej: Jr. 28 de Julio 147, Pucallpa"
                className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefono / WhatsApp
              </label>
              <input
                type="tel"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                placeholder="Ej: 961 234 567"
                className="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("welcome")}
                className="flex-1 border border-gray-300 py-3 rounded-xl font-medium hover:bg-gray-50"
              >
                ← Atras
              </button>
              <button
                onClick={() => setStep("products")}
                disabled={!storeName}
                className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 transition disabled:opacity-50"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {/* Step: Products */}
        {step === "products" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">📦 Productos</h2>
            <p className="text-sm text-gray-500">
              No te preocupes — empezamos con productos de ejemplo que puedes editar despues
            </p>
            <div className="bg-teal-50 rounded-xl p-4 space-y-2">
              <p className="font-medium text-teal-800">
                Cargamos 50 productos tipicos de bodega:
              </p>
              <ul className="text-sm text-teal-700 space-y-1">
                <li>✅ Arroz, azucar, aceite, fideos, leche...</li>
                <li>✅ Gaseosas, agua, jugos...</li>
                <li>✅ Pan, galletas, golosinas...</li>
                <li>✅ Productos de limpieza...</li>
              </ul>
              <p className="text-xs text-teal-600 mt-2">
                Puedes agregar, editar o borrar cualquier producto despues desde el panel de admin.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("store-info")}
                className="flex-1 border border-gray-300 py-3 rounded-xl font-medium hover:bg-gray-50"
              >
                ← Atras
              </button>
              <button
                onClick={() => setStep("done")}
                className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 transition"
              >
                Cargar productos →
              </button>
            </div>
          </div>
        )}

        {/* Step: Done! */}
        {step === "done" && (
          <div className="text-center space-y-4">
            <div className="text-6xl">🎉</div>
            <h1 className="text-2xl font-bold text-gray-900">
              Tu bodega esta lista!
            </h1>
            <p className="text-gray-600">
              <strong>{storeName}</strong> ya tiene todo configurado.
              Ahora puedes empezar a vender.
            </p>
            <div className="bg-green-50 rounded-xl p-4 text-left space-y-2">
              <p className="font-medium text-green-800">Lo que sigue:</p>
              <ul className="text-sm text-green-700 space-y-1">
                <li>1. 📱 Comparte tu tienda con clientes</li>
                <li>2. 💰 Configura Yape/Plin como metodo de pago</li>
                <li>3. 🚚 Activa delivery si ofreces entregas</li>
                <li>4. 📊 Ve tus ventas en el panel de admin</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/admin")}
                className="flex-1 bg-teal-500 text-white py-3 rounded-xl font-semibold hover:bg-teal-600 transition"
              >
                Ir al panel admin →
              </button>
              <button
                onClick={() => router.push("/tienda")}
                className="flex-1 border border-teal-500 text-teal-600 py-3 rounded-xl font-semibold hover:bg-teal-50 transition"
              >
                Ver mi tienda →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
