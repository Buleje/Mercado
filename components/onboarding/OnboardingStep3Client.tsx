'use client';

import { useState } from 'react';
import { OnboardingPrimaryButton, OnboardingSkipButton, OB_INPUT, OB_LABEL } from './onboarding-ui';

interface ClientData {
  nombre: string;
  celular: string;
  limiteFiado: number;
}

interface Props {
  data: ClientData | null;
  onChange: (data: ClientData | null) => void;
  onNext: () => void;
}

export default function OnboardingStep3Client({ data, onChange, onNext }: Props) {
  const [form, setForm] = useState<ClientData>(
    data ?? { nombre: '', celular: '', limiteFiado: 100 }
  );

  const hasValidClient = form.nombre.trim().length > 0 && form.celular.trim().length > 0;

  const handleChange = (field: keyof ClientData, value: string | number) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (updated.nombre.trim().length > 0) {
      onChange(updated);
    }
  };

  const handleSkip = () => {
    onChange(null);
    onNext();
  };

  const handleNext = () => {
    if (hasValidClient) {
      onChange(form);
    }
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="mb-2 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          ¿Tienes un cliente de confianza?
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Los clientes frecuentes pueden pagar con fiado.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={OB_LABEL}>
            Nombre del cliente
          </label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => handleChange('nombre', e.target.value)}
            placeholder="Ej: María López"
            className={OB_INPUT}
          />
        </div>

        <div>
          <label className={OB_LABEL}>
            Celular
          </label>
          <input
            type="tel"
            value={form.celular}
            onChange={e => handleChange('celular', e.target.value)}
            placeholder="Ej: 961234567"
            className={OB_INPUT}
          />
        </div>

        <div>
          <label className={OB_LABEL}>
            Límite de fiado (S/)
          </label>
          <input
            type="number"
            min={0}
            step={10}
            value={form.limiteFiado}
            onChange={e => handleChange('limiteFiado', parseInt(e.target.value) || 0)}
            placeholder="100"
            className={OB_INPUT}
          />
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">Monto máximo que puede deber este cliente</p>
        </div>
      </div>

      <OnboardingPrimaryButton onClick={handleNext} disabled={!hasValidClient} withArrow>
        Siguiente
      </OnboardingPrimaryButton>

      <OnboardingSkipButton onClick={handleSkip}>
        Saltar este paso →
      </OnboardingSkipButton>
    </div>
  );
}
