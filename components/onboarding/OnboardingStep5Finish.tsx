'use client';

import { OnboardingPrimaryButton, OB_INPUT, OB_LABEL } from './onboarding-ui';

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
      <div className="mb-2 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          ¡Casi listo!
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Configura tus preferencias finales
        </p>
      </div>

      <div className="space-y-4">
        {/* Notifications */}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 transition-all duration-200 hover:border-[var(--accent)]/50 hover:bg-primary/10 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-primary/10">
          <input
            type="checkbox"
            checked={data.notifications}
            onChange={e => handleNotifications(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-shrink-0 rounded accent-[var(--accent)]"
          />
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Activar notificaciones del navegador</p>
            <p className="text-sm text-[var(--text-secondary)]">Recibe alertas de nuevos pedidos y stock bajo</p>
          </div>
        </label>

        {/* PWA */}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 transition-all duration-200 hover:border-[var(--accent)]/50 hover:bg-primary/10 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-primary/10">
          <input
            type="checkbox"
            checked={data.pwa}
            onChange={e => onChange({ ...data, pwa: e.target.checked })}
            className="mt-0.5 h-5 w-5 flex-shrink-0 rounded accent-[var(--accent)]"
          />
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Instalar app en mi celular</p>
            <p className="text-sm text-[var(--text-secondary)]">Puedes instalar la app desde el menú del navegador para acceso rápido</p>
          </div>
        </label>

        {/* WhatsApp resumen */}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4 transition-all duration-200 hover:border-[var(--accent)]/50 hover:bg-primary/10 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-primary/10">
          <input
            type="checkbox"
            checked={data.whatsappResumen}
            onChange={e => onChange({ ...data, whatsappResumen: e.target.checked })}
            className="mt-0.5 h-5 w-5 flex-shrink-0 rounded accent-[var(--accent)]"
          />
          <div className="flex-1">
            <p className="font-semibold text-[var(--text-primary)]">Recibir resumen diario por WhatsApp</p>
            <p className="text-sm text-[var(--text-secondary)]">Ventas, stock bajo y más, todos los días a las 8pm</p>
          </div>
        </label>

        {data.whatsappResumen && (
          <div className="pl-8">
            <label className={OB_LABEL}>
              Número WhatsApp para resumen
            </label>
            <input
              type="tel"
              value={whatsappNumber}
              onChange={e => onChange({ ...data, whatsappNumber: e.target.value })}
              placeholder="961234567"
              className={OB_INPUT}
            />
          </div>
        )}
      </div>

      <OnboardingPrimaryButton
        onClick={onComplete}
        disabled={isCompleting}
        size="lg"
        withArrow={!isCompleting}
      >
        {isCompleting ? (
          <>
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Configurando...
          </>
        ) : (
          'Comenzar a usar mi bodega digital'
        )}
      </OnboardingPrimaryButton>
    </div>
  );
}
