"use client";

/**
 * «Resumen del turno»: se abre al cerrar o al tocar un turno del historial.
 * Salidas: ticket de 80 mm, WhatsApp y el paso siguiente del día, Cuadrar caja.
 */
import { useState } from "react";
import { MessageCircle, Printer, Scale, Trophy } from "@buleje/design-system/icons";
import { formatTime } from "@/lib/format";
import { enviarCortePorWhatsApp, imprimirCorte80mm } from "./corte-turno";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, MarcoModalTurno } from "./MarcoModalTurno";
import { ResumenTurnoDetalle } from "./ResumenTurnoDetalle";
import { diaConFecha, type Turno, type TurnoSummary } from "./tipos";

type Props = {
  abierto: boolean;
  resumen: TurnoSummary | null;
  historial: Turno[];
  metaVentas: number;
  onCerrar: () => void;
  onCuadrarCaja: (r: TurnoSummary) => void;
};

const BOTON_SALIDA = "inline-flex items-center justify-center gap-2 min-h-11 px-3 rounded-xl text-sm font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] transition-colors";

export function ResumenTurnoModal({ abierto, resumen, historial, metaVentas, onCerrar, onCuadrarCaja }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const r = resumen;

  return (
    <MarcoModalTurno
      abierto={abierto && !!r}
      claveMemoria="turnos-resumen-turno"
      titulo="Resumen del turno"
      subtitulo={r ? `${r.cajeroNombre} · ${diaConFecha(r.abrioEn)} ${formatTime(r.abrioEn)}${r.cerroEn ? ` a ${formatTime(r.cerroEn)}` : ""}` : undefined}
      icono={Trophy}
      ancho="lg"
      onFondo={onCerrar}
      onCerrar={onCerrar}
      pie={r && <>
        <button
          type="button"
          className={BOTON_SALIDA}
          title="Ticket de 80 mm para la ticketera (o PDF si no hay)"
          onClick={() => setAviso(imprimirCorte80mm(r) ? null : "El navegador bloqueó la ventana de impresión: permite las ventanas emergentes.")}
        >
          <Printer className="h-4 w-4" aria-hidden /> Imprimir
        </button>
        <button type="button" className={BOTON_SALIDA} title="Elige a quién mandárselo" onClick={() => enviarCortePorWhatsApp(r)}>
          <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
        </button>
        <span className="hidden sm:block flex-1" aria-hidden />
        <button type="button" className={`${BOTON_SECUNDARIO} sm:flex-none`} onClick={onCerrar}>Cerrar</button>
        <button type="button" className={`${BOTON_PRIMARIO} sm:flex-none`} onClick={() => onCuadrarCaja(r)}>
          <Scale className="h-4 w-4" aria-hidden /> Cuadrar caja
        </button>
      </>}
    >
      {aviso && <p role="alert" className="text-sm text-[var(--data-error-500)]">{aviso}</p>}
      {r && <ResumenTurnoDetalle resumen={r} historial={historial} metaVentas={metaVentas} />}
    </MarcoModalTurno>
  );
}
