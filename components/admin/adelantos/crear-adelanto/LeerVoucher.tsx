"use client";

/**
 * El aviso de «Llenar desde: Foto»: mientras lee, lo que no pudo leer, y lo
 * que puso (con la persona si no se pudo elegir sola). Las entradas (elegir,
 * cámara, pegar) están en `LlenarDesde`; el estado y el OCR, en
 * `hooks/use-leer-voucher`; el parser, en `lib/adelantos/leer-comprobante-yape`
 * (puro, con test).
 */

import { AlertTriangle, Loader2, X } from "@buleje/design-system/icons";
import type { LeerVoucher } from "../hooks/use-leer-voucher";
import { AvisoLlenado, BOTON_SUAVE, type PersonasDelAviso } from "./AvisoLlenado";
import PersonaDelAviso from "./PersonaDelAviso";

function Miniatura({ src }: { src: string }) {
  /* eslint-disable-next-line @next/next/no-img-element -- blob local de la captura, no pasa por el optimizador */
  return <img src={src} alt="La captura que se leyó" className="h-20 w-14 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover object-top" />;
}

export function AvisoVoucher({ voucher, personas }: { voucher: LeerVoucher; personas: PersonasDelAviso }) {
  const { estado } = voucher;
  if (estado.fase === "inactivo") return null;

  if (estado.fase === "leyendo") {
    const p = estado.progreso;
    return (
      <div role="status" aria-live="polite" data-aviso-llenado="foto-leyendo" className="flex items-center gap-3 rounded-xl bg-[var(--surface-raised)] px-3.5 py-2.5 ring-1 ring-[var(--rule-soft)]">
        <Miniatura src={estado.miniatura} />
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent-ink)]" aria-hidden />
        <span className="text-sm font-semibold text-[var(--text-secondary)]">
          {p ? `${p.etapa}… ${Math.round(p.progreso * 100)} %` : "Leyendo la foto…"} La lectura se hace en tu equipo: la foto no sale de acá.
        </span>
      </div>
    );
  }

  if (estado.fase === "error" || estado.fase === "sin-monto") {
    return (
      <div role="alert" data-aviso-llenado={`foto-${estado.fase}`} className="flex items-start gap-3 rounded-xl bg-[var(--data-warning-500)]/10 px-3.5 py-3">
        {estado.fase === "sin-monto" && <Miniatura src={estado.miniatura} />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex items-start gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden />
            {estado.fase === "error" ? estado.mensaje : "No encontré el monto en la imagen: no cambié nada."}
          </p>
          {estado.fase === "sin-monto" && (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Prueba con la captura original del celular (no una foto de otra pantalla) o escribe el monto a mano. Confianza de la lectura: {estado.confianza} %.
              </p>
              <details className="text-sm text-[var(--text-secondary)]">
                <summary className="cursor-pointer font-semibold">Lo que leí</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-sunken)] p-2 font-mono text-xs">
                  {estado.texto.trim() || "(nada)"}
                </pre>
              </details>
            </>
          )}
        </div>
        <button type="button" onClick={voucher.cerrar} aria-label="Cerrar el aviso de la foto" className={BOTON_SUAVE}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  const baja = estado.confianza < 80;
  return (
    <AvisoLlenado
      de="foto"
      izquierda={<Miniatura src={estado.miniatura} />}
      etiqueta={
        <span
          className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
            baja ? "bg-[var(--data-warning-500)]/15 text-[var(--text-primary)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          }`}
        >
          Confianza {estado.confianza} %{baja ? " · baja" : ""}
        </span>
      }
      puestos={estado.puestos}
      avisos={estado.avisos}
      persona={<PersonaDelAviso persona={estado.persona} {...personas} onElegir={voucher.elegirPersona} />}
      onDeshacer={voucher.deshacer}
      onListo={voucher.cerrar}
    />
  );
}
