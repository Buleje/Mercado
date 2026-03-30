'use client';

import { useState } from 'react';

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
      <div className="text-center mb-2">
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          &iquest;Tienes un cliente de confianza?
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Los clientes frecuentes pueden pagar con fiado.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Nombre del cliente
          </label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => handleChange('nombre', e.target.value)}
            placeholder="Ej: Mar&iacute;a L&oacute;pez"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#0f766e] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Celular
          </label>
          <input
            type="tel"
            value={form.celular}
            onChange={e => handleChange('celular', e.target.value)}
            placeholder="Ej: 961234567"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#0f766e] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            L&iacute;mite de fiado (S/)
          </label>
          <input
            type="number"
            min={0}
            step={10}
            value={form.limiteFiado}
            onChange={e => handleChange('limiteFiado', parseInt(e.target.value) || 0)}
            placeholder="100"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#0f766e] transition-colors"
          />
          <p className="text-xs text-gray-400 mt-1">Monto m&aacute;ximo que puede deber este cliente</p>
        </div>
      </div>

      <button
        onClick={handleNext}
        disabled={!hasValidClient}
        className="w-full py-3 rounded-xl bg-[#0f766e] text-white font-bold hover:bg-[#0d5f58] transition-colors shadow-md shadow-[#0f766e]/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Siguiente &rarr;
      </button>

      <button
        onClick={handleSkip}
        className="w-full text-sm text-gray-400 hover:text-[#0f766e] transition-colors py-2"
      >
        Saltar este paso &rarr;
      </button>
    </div>
  );
}
