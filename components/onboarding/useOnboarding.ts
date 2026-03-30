'use client';
import { useState, useCallback, useEffect } from 'react';

type StepData = {
  brand: { nombre: string; direccion: string; telefono: string; logoUrl?: string };
  product: { nombre: string; precio: number; costo: number; categoria: string; stock: number } | null;
  client: { nombre: string; celular: string; limiteFiado: number } | null;
  preferences: { notifications: boolean; pwa: boolean; whatsappResumen: boolean; whatsappNumber: string };
};

const STORAGE_KEY = 'onboarding_draft';
const INITIAL: StepData = {
  brand: { nombre: '', direccion: '', telefono: '' },
  product: null,
  client: null,
  preferences: { notifications: true, pwa: true, whatsappResumen: true, whatsappNumber: '' },
};

export function useOnboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepData, setStepData] = useState<StepData>(() => {
    if (typeof window === 'undefined') return INITIAL;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...INITIAL, ...JSON.parse(saved) } : INITIAL;
    } catch {
      return INITIAL;
    }
  });
  const [isCompleting, setIsCompleting] = useState(false);

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stepData));
    } catch {
      // localStorage unavailable
    }
  }, [stepData]);

  const updateStep = useCallback(<K extends keyof StepData>(key: K, data: StepData[K]) => {
    setStepData(prev => ({ ...prev, [key]: data }));
  }, []);

  const goNext = useCallback(() => setCurrentStep(s => Math.min(s + 1, 5)), []);
  const goPrev = useCallback(() => setCurrentStep(s => Math.max(s - 1, 1)), []);

  const complete = useCallback(async () => {
    setIsCompleting(true);
    try {
      // Save brand settings
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: stepData.brand.nombre,
          businessAddress: stepData.brand.direccion,
          businessPhone: stepData.brand.telefono,
          logoUrl: stepData.brand.logoUrl,
        }),
      });

      // Create product if provided
      if (stepData.product) {
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: stepData.product.nombre,
            price: stepData.product.precio,
            costPrice: stepData.product.costo,
            category: stepData.product.categoria,
            stock: stepData.product.stock,
          }),
        });
      }

      // Create customer if provided
      if (stepData.client) {
        await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: stepData.client.nombre,
            phone: stepData.client.celular,
          }),
        });
      }

      // Mark onboarding complete
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: stepData.preferences }),
      });

      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    } finally {
      setIsCompleting(false);
    }
  }, [stepData]);

  return { currentStep, stepData, isCompleting, updateStep, goNext, goPrev, complete, setCurrentStep };
}
