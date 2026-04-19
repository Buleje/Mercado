'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import Image from "next/image";

interface BrandData {
  nombre: string;
  direccion: string;
  telefono: string;
  logoUrl?: string;
}

interface Props {
  data: BrandData;
  onChange: (data: BrandData) => void;
  onNext: () => void;
}

export default function OnboardingStep1Brand({ data, onChange, onNext }: Props) {
  const [logoPreview, setLogoPreview] = useState<string | undefined>(data.logoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = data.nombre.trim().length >= 3;

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/jpeg') && !file.type.startsWith('image/png')) {
      return;
    }

    // Convert to base64 data URL
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoPreview(result);
      onChange({ ...data, logoUrl: result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">
          Bienvenido a tu bodega digital
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Configura los datos de tu negocio para empezar
        </p>
      </div>

      {/* Logo upload */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden hover:border-[#00B4A6] transition-colors cursor-pointer group"
        >
          {logoPreview ? (
            <Image src={logoPreview} alt="Logo" fill className="object-cover" sizes="96px" unoptimized />
          ) : (
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto text-gray-400 group-hover:text-[#00B4A6] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[length:var(--ts-2xs)] text-gray-400 mt-1">Logo</span>
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleLogoChange}
          className="hidden"
        />
        <p className="text-xs text-gray-400 mt-2">JPG o PNG (opcional)</p>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Nombre del negocio *
          </label>
          <input
            type="text"
            value={data.nombre}
            onChange={e => onChange({ ...data, nombre: e.target.value })}
            placeholder="Ej: Buleje"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#00B4A6] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Direcci&oacute;n
          </label>
          <input
            type="text"
            value={data.direccion}
            onChange={e => onChange({ ...data, direccion: e.target.value })}
            placeholder="Ej: Jr. Ucayali 123, Pucallpa"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#00B4A6] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Tel&eacute;fono WhatsApp
          </label>
          <input
            type="tel"
            value={data.telefono}
            onChange={e => onChange({ ...data, telefono: e.target.value })}
            placeholder="Ej: 961234567"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#00B4A6] transition-colors"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!isValid}
        className="w-full py-3 rounded-xl bg-[#00B4A6] text-white font-bold hover:bg-[#009690] transition-colors shadow-md shadow-[#00B4A6]/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Empecemos &rarr;
      </button>
    </div>
  );
}
