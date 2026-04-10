export default function OnboardingLoading() {
  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm text-gray-500 animate-pulse">
            Preparando configuracion inicial...
          </p>
        </div>
      </div>
    </div>
  );
}
