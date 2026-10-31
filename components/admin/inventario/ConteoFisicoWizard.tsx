'use client';

/**
 * Conteo físico › Asistente: eliges qué contar, cuentas producto por producto,
 * revisas las diferencias y cierras aplicando los ajustes. El estado y las
 * llamadas viven en `conteo/use-conteo-wizard.ts`; cada paso es un archivo.
 */
import dynamic from 'next/dynamic';
import { WizardPaso1 } from './conteo/WizardPaso1';
import { WizardPaso2 } from './conteo/WizardPaso2';
import { WizardPaso3, WizardPaso4 } from './conteo/WizardPaso3y4';
import { useConteoWizard } from './conteo/use-conteo-wizard';

const BarcodeScannerDynamic = dynamic(() => import('./BarcodeScanner'), { ssr: false });

export default function ConteoFisicoWizard() {
  const w = useConteoWizard();
  return (
    <div className="space-y-4">
      {w.error && (
        <div role="alert" className="rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-ink)]">
          {w.error}
        </div>
      )}
      {w.paso === 1 && <WizardPaso1 w={w} />}
      {w.paso === 2 && <WizardPaso2 w={w} />}
      {w.paso === 3 && <WizardPaso3 w={w} />}
      {w.paso === 4 && <WizardPaso4 w={w} />}
      {w.showScanner && <BarcodeScannerDynamic onScan={w.alEscanear} onClose={() => w.setShowScanner(false)} />}
    </div>
  );
}
