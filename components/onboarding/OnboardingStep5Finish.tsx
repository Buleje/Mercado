'use client';

interface PreferencesData {
  notifications: boolean;
  pwa: boolean;
  whatsappResumen: boolean;
  whatsappNumber: string;
}

interface Props {
  data: PreferencesData;
  defaultPhone: string;
  onChange: (data: PreferencesData) => void;
  onComplete: () => void;
  isCompleting: boolean;
}

export default function OnboardingStep5Finish({ data, defaultPhone, onChange, onComplete, isCompleting }: Props) {
  // Pre-fill whatsapp number from step 1 phone if empty
  const whatsappNumber = data.whatsappNumber || defaultPhone;

  const handleNotifications = async (checked: boolean) => {
    onChange({ ...data, notifications: checked });
    if (checked && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        await Notification.requestPermission();
      } catch {
        // Permission request failed
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          &iexcl;Casi listo!
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Configura tus preferencias finales
        </p>
      </div>

      <div className="space-y-4">
        {/* Notifications */}
        <label className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer border border-gray-100 dark:border-gray-700 hover:border-[#0f766e]/30 transition-colors">
          <input
            type="checkbox"
            checked={data.notifications}
            onChange={e => handleNotifications(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded accent-[#0f766e]"
          />
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Activar notificaciones del navegador</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Recibe alertas de nuevos pedidos y stock bajo</p>
          </div>
        </label>

        {/* PWA */}
        <label className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer border border-gray-100 dark:border-gray-700 hover:border-[#0f766e]/30 transition-colors">
          <input
            type="checkbox"
            checked={data.pwa}
            onChange={e => onChange({ ...data, pwa: e.target.checked })}
            className="mt-0.5 w-5 h-5 rounded accent-[#0f766e]"
          />
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Instalar app en mi celular</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Puedes instalar la app desde el men&uacute; del navegador para acceso r&aacute;pido</p>
          </div>
        </label>

        {/* WhatsApp resumen */}
        <label className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer border border-gray-100 dark:border-gray-700 hover:border-[#0f766e]/30 transition-colors">
          <input
            type="checkbox"
            checked={data.whatsappResumen}
            onChange={e => onChange({ ...data, whatsappResumen: e.target.checked })}
            className="mt-0.5 w-5 h-5 rounded accent-[#0f766e]"
          />
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-white">Recibir resumen diario por WhatsApp</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ventas, stock bajo y m&aacute;s, todos los d&iacute;as a las 8pm</p>
          </div>
        </label>

        {data.whatsappResumen && (
          <div className="pl-8">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              N&uacute;mero WhatsApp para resumen
            </label>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={e => onChange({ ...data, whatsappNumber: e.target.value })}
              placeholder="961234567"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#0f766e] transition-colors"
            />
          </div>
        )}
      </div>

      <button
        onClick={onComplete}
        disabled={isCompleting}
        className="w-full py-4 rounded-xl bg-[#0f766e] text-white font-extrabold text-lg hover:bg-[#0d5f58] transition-colors shadow-lg shadow-[#0f766e]/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isCompleting ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Configurando...
          </>
        ) : (
          'Comenzar a usar mi bodega digital'
        )}
      </button>
    </div>
  );
}
