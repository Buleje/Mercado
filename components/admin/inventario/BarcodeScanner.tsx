'use client';

import { useBarcodeScan } from './useBarcodeScan';
import { useEffect } from 'react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const { isScanning, error, videoRef, startScan, stopScan } = useBarcodeScan();

  useEffect(() => {
    startScan(onScan);
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {/* Close button */}
      <button
        onClick={() => { stopScan(); onClose(); }}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
        aria-label="Cerrar escáner"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {error ? (
        <div className="text-center px-6">
          <div className="text-[var(--data-error-500)] text-lg mb-2">No disponible</div>
          <p className="text-white/70 text-sm">{error}</p>
          <p className="text-white/50 text-xs mt-3">
            Usa Google Chrome en un dispositivo Android para escanear.
          </p>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <>
          {/* Video fullscreen */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-48 border-2 border-white/50 rounded-xl">
              {/* Sweep line animation */}
              <div
                className="absolute left-2 right-2 h-0.5 bg-[var(--data-error-500)] rounded"
                style={{
                  animation: 'barcodeSweep 2s ease-in-out infinite',
                }}
              />
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
            </div>
          </div>

          {/* Hint text */}
          <div className="absolute bottom-12 left-0 right-0 text-center">
            <p className="text-white/80 text-sm">
              {isScanning ? 'Apunta al codigo de barras' : 'Iniciando camara...'}
            </p>
          </div>
        </>
      )}

      {/* CSS for sweep animation */}
      <style>{`
        @keyframes barcodeSweep {
          0%, 100% { top: 8px; }
          50% { top: calc(100% - 10px); }
        }
      `}</style>
    </div>
  );
}
