'use client';

import { useState } from 'react';

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
      <div className="text-center mb-2">
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          Agrega tu primer producto
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          No te preocupes, puedes agregar más después.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Nombre del producto
          </label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => handleChange('nombre', e.target.value)}
            placeholder="Ej: Arroz Costeño 1kg"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Precio venta (S/)
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.precio || ''}
              onChange={e => handleChange('precio', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Costo (S/)
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.costo || ''}
              onChange={e => handleChange('costo', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Categoría
            </label>
            <select
              value={form.categoria}
              onChange={e => handleChange('categoria', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-[var(--accent)] transition-colors"
            >
              {CATEGORIAS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Stock inicial
            </label>
            <input
              type="number"
              min={0}
              value={form.stock || ''}
              onChange={e => handleChange('stock', parseInt(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleNext}
        disabled={!hasValidProduct}
        className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent-dark)] transition-colors shadow-md shadow-[var(--accent)]/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Siguiente &rarr;
      </button>

      <button
        onClick={handleSkip}
        className="w-full text-sm text-gray-400 hover:text-[var(--accent)] transition-colors py-2"
      >
        ¿No tienes la información ahora? &rarr; Saltar
      </button>
    </div>
  );
}
