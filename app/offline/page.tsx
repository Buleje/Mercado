"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4" role="img" aria-label="Sin señal">
          📡
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Sin conexión
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          No hay conexión a internet. Las ventas que registres se guardarán y
          sincronizarán cuando vuelva la señal.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-[#0f766e] text-white font-bold rounded-xl hover:bg-[#0d5f58] active:scale-95 transition-all"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
