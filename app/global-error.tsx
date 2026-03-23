"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-lg">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💥</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error crítico</h2>
          <p className="text-sm text-gray-500 mb-6">
            La aplicación encontró un error grave. Por favor recarga la página.
          </p>
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-[#2d6a4f] hover:bg-[#245a42] text-white text-sm font-bold transition-colors"
          >
            Recargar
          </button>
          {error.digest && (
            <p className="text-xs text-gray-400 mt-4">Código: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
