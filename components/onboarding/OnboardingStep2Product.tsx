'use client';

import { useState } from 'react';
import { OnboardingPrimaryButton, OnboardingSkipButton, OB_INPUT, OB_LABEL } from './onboarding-ui';

interface ProductData {
  nombre: string;
  precio: number;
  costo: number;
  categoria: string;
  stock: number;
}

interface Props {
  data: ProductData | null;
  onChange: (data: ProductData | null) => void;
  onNext: () => void;
}

const CATEGORIAS = ['Abarrotes', 'Bebidas', 'Limpieza', 'Lacteos', 'Snacks', 'Otros'];

export default function OnboardingStep2Product({ data, onChange, onNext }: Props) {
  const [form, setForm] = useState<ProductData>(
    data ?? { nombre: '', precio: 0, costo: 0, categoria: 'Abarrotes', stock: 0 }
  );

  const hasValidProduct = form.nombre.trim().length > 0 && form.precio > 0;

  const handleChange = (field: keyof ProductData, value: string | number) => {
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
    if (hasValidProduct) {
      onChange(form);
    }
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="mb-2 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Agrega tu primer producto
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          No te preocupes, puedes agregar más después.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={OB_LABEL}>
            Nombre del producto
          </label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => handleChange('nombre', e.target.value)}
            placeholder="Ej: Arroz Costeño 1kg"
            className={OB_INPUT}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={OB_LABEL}>
              Precio venta (S/)
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.precio || ''}
              onChange={e => handleChange('precio', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className={OB_INPUT}
            />
          </div>
          <div>
            <label className={OB_LABEL}>
              Costo (S/)
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.costo || ''}
              onChange={e => handleChange('costo', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className={OB_INPUT}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={OB_LABEL}>
              Categoría
            </label>
            <select
              value={form.categoria}
              onChange={e => handleChange('categoria', e.target.value)}
              className={OB_INPUT}
            >
              {CATEGORIAS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={OB_LABEL}>
              Stock inicial
            </label>
            <input
              type="number"
              min={0}
              value={form.stock || ''}
              onChange={e => handleChange('stock', parseInt(e.target.value) || 0)}
              placeholder="0"
              className={OB_INPUT}
            />
          </div>
        </div>
      </div>

      <OnboardingPrimaryButton onClick={handleNext} disabled={!hasValidProduct} withArrow>
        Siguiente
      </OnboardingPrimaryButton>

      <OnboardingSkipButton onClick={handleSkip}>
        ¿No tienes la información ahora? → Saltar
      </OnboardingSkipButton>
    </div>
  );
}
