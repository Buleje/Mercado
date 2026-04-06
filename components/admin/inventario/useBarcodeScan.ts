'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook para escanear códigos de barras usando BarcodeDetector API nativo (Chrome/Android).
 * NO usa @zxing/browser — solo BarcodeDetector nativo del navegador.
 */
export function useBarcodeScan() {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopScan = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startScan = useCallback(async (onResult: (barcode: string) => void) => {
    setError(null);

    // Check if BarcodeDetector is supported
    if (!('BarcodeDetector' in window)) {
      setError('Tu navegador no soporta el escáner. Usa Chrome en Android.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanning(true);

      const detector = new (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'],
      });

      const detectLoop = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            onResult(code);
            // Vibrate on success
            if (navigator.vibrate) navigator.vibrate(100);
            stopScan();
            return;
          }
        } catch {
          // Detection frame error — continue
        }
        if (streamRef.current) requestAnimationFrame(detectLoop);
      };
      detectLoop();
    } catch {
      setError('No se pudo acceder a la cámara');
    }
  }, [stopScan]);

  // Cleanup on unmount
  useEffect(() => () => stopScan(), [stopScan]);

  return { isScanning, error, videoRef, startScan, stopScan };
}
