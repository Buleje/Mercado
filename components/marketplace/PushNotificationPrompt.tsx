"use client";

import { useState } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

const DISMISS_KEY = "buleje-push-prompt-dismissed";

/**
 * Marketplace banner that prompts customers to enable push notifications.
 * Appears once for new users; remembers dismissals via localStorage.
 *
 * Place inside the marketplace layout (e.g., above product grid).
 */
export default function PushNotificationPrompt() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    requestPermission,
  } = usePushNotifications();

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return !!localStorage.getItem(DISMISS_KEY);
  });
  const [showSuccess, setShowSuccess] = useState(false);

  // Don't show if unsupported, already subscribed, or dismissed
  if (!isSupported || isSubscribed || dismissed) {
    if (showSuccess) {
      return (
        <div className="bg-white border border-emerald-200 rounded-xl p-4 flex items-center gap-3 mx-4 mt-3">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-emerald-700 font-medium">
            Notificaciones activadas. Te avisaremos sobre tus pedidos y ofertas.
          </p>
        </div>
      );
    }
    return null;
  }

  const handleActivate = async () => {
    const success = await requestPermission();
    if (success) {
      setShowSuccess(true);
      // Auto-hide success after 4 seconds
      setTimeout(() => setShowSuccess(false), 4000);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mx-4 mt-3">
      <div className="flex items-start gap-3">
        {/* Bell icon */}
        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
          <svg
            className="w-5 h-5 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Recibe notificaciones de tus pedidos y ofertas
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Te avisaremos cuando tu pedido cambie de estado o haya promociones
            especiales.
          </p>

          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleActivate}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Activando...
                </>
              ) : (
                "Activar notificaciones"
              )}
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
