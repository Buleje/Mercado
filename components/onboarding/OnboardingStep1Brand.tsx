'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import Image from "next/image";
import { OnboardingPrimaryButton, OB_INPUT, OB_LABEL } from './onboarding-ui';

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
      <div className="mb-2 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Bienvenido a tu bodega digital
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Configura los datos de tu negocio para empezar
        </p>
      </div>

      {/* Logo upload */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] transition-all duration-200 hover:border-[var(--accent)] hover:bg-primary/10"
        >
          {logoPreview ? (
            <Image src={logoPreview} alt="Logo" fill className="object-cover" sizes="96px" unoptimized />
          ) : (
            <div className="text-center">
              <svg className="mx-auto h-8 w-8 text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="mt-1 block text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]">Logo</span>
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
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">JPG o PNG (opcional)</p>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div>
          <label htmlFor="ob-brand-nombre" className={OB_LABEL}>
            Nombre del negocio *
          </label>
          <input
            id="ob-brand-nombre"
            type="text"
            value={data.nombre}
            onChange={e => onChange({ ...data, nombre: e.target.value })}
            placeholder="Ej: Buleje"
            className={OB_INPUT}
          />
        </div>

        <div>
          <label htmlFor="ob-brand-direccion" className={OB_LABEL}>
            Dirección
          </label>
          <input
            id="ob-brand-direccion"
            type="text"
            value={data.direccion}
            onChange={e => onChange({ ...data, direccion: e.target.value })}
            placeholder="Ej: Jr. Ucayali 123, Pucallpa"
            className={OB_INPUT}
          />
        </div>

        <div>
          <label htmlFor="ob-brand-telefono" className={OB_LABEL}>
            Teléfono WhatsApp
          </label>
          <input
            id="ob-brand-telefono"
            type="tel"
            value={data.telefono}
            onChange={e => onChange({ ...data, telefono: e.target.value })}
            placeholder="Ej: 961234567"
            className={OB_INPUT}
          />
        </div>
      </div>

      <OnboardingPrimaryButton onClick={onNext} disabled={!isValid} withArrow>
        Empecemos
      </OnboardingPrimaryButton>
    </div>
  );
}
