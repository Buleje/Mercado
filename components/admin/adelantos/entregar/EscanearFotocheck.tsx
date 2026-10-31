"use client";

/**
 * Leer el QR del fotocheck para elegir a la persona (ADR-491): la cámara del
 * kiosko de asistencia (`useCamaraKiosko`, `BarcodeDetector`) dentro de la
 * pantalla, sin otro modal encima. Al leer un código lo pasa tal cual: el
 * servidor lo entiende (`codigoDeMarcacion`) y busca la persona vinculada.
 *
 * Sin `BarcodeDetector` (Firefox, Safari) el botón no se muestra: ver
 * `puedeLeerFotocheck`. Al desmontarse, la cámara se apaga.
 */

import { useState } from "react";
import { Loader2, QrCode, X } from "@buleje/design-system/icons";
import { useCamaraKiosko, type EstadoCamara } from "@/components/rrhh/kiosko/use-camara-kiosko";

/** ¿Este navegador lee QR? Sin eso, el fotocheck no sirve y el botón no se ofrece. */
export function puedeLeerFotocheck(): boolean {
  return typeof globalThis !== "undefined" && "BarcodeDetector" in globalThis;
}

const TEXTO: Record<EstadoCamara, string> = {
  iniciando: "Prendiendo la cámara…",
  lista: "Pon el QR del fotocheck frente a la cámara.",
  sin_permiso: "El navegador no dio permiso para la cámara: búscalo por nombre.",
  sin_camara: "No encontré una cámara: búscalo por nombre.",
};

export default function EscanearFotocheck({ onCodigo, onCerrar }: { onCodigo: (texto: string) => void; onCerrar: () => void }) {
  const [leido, setLeido] = useState(false);
  const { videoRef, estado } = useCamaraKiosko(!leido, (texto) => {
    setLeido(true);
    onCodigo(texto);
  });

  return (
    <div className="space-y-3 rounded-2xl bg-[var(--surface-sunken)] p-3" data-escanear-fotocheck>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--surface-canvas)]">
        <video ref={videoRef} muted playsInline aria-label="Cámara para leer el fotocheck" className="h-full w-full object-cover" />
        <span aria-hidden className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-[var(--accent)]" />
      </div>
      <div className="flex items-center gap-3">
        <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--text-secondary)]">
          {leido ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> Buscando a la persona…
            </>
          ) : (
            <>
              <QrCode className="h-4 w-4 shrink-0" aria-hidden /> {TEXTO[estado]}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden /> Cerrar cámara
        </button>
      </div>
    </div>
  );
}
