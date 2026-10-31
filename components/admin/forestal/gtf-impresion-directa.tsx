"use client";

/**
 * Piezas de «Imprimir directo» en la cola del monte (16-10): el aviso con sus
 * salidas, «Probar la impresora» (hoja de prueba con cruces, con la impresora
 * del envío), el aviso de valores cortados y el ⓘ «Qué necesitas en el monte».
 */

import { Download, Printer, Smartphone } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { rutaSalida } from "@/lib/forestal/gtf-cola-monte";
import { Btn } from "./ctp-shared";
import { botonMonte } from "./gtf-cola-monte-ui";
import type { ImpresionDirecta } from "./hooks/use-imprimir-directo";

/** «N valores no entran en su casillero: revisa la disposición» (la salida los cortó). */
export function AvisoRecortes({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null;
  return (
    <p role="status" className="text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" data-qa="aviso-recortados">
      {texto}
    </p>
  );
}

/** El resultado de la última impresión y, si falló, qué hacer: bajar el .prn o abrirlo en RawBT. */
export function AvisoImpresionDirecta({ d }: { d: ImpresionDirecta }) {
  const e = d.estado;
  if (!e) return <AvisoRecortes texto={d.recortes} />;
  const conSalidas = e.tipo === "error" && e.motivo !== "bajada";
  return (
    <div className="space-y-2" data-qa="aviso-impresion-directa">
      <p
        role={e.tipo === "error" ? "alert" : "status"}
        className={cn(
          "text-sm font-bold",
          e.tipo === "error" ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
        )}
      >
        {e.mensaje}
      </p>
      <AvisoRecortes texto={d.recortes} />
      {conSalidas && (
        <div className={cn("grid gap-2", e.android && "grid-cols-2")}>
          <button type="button" onClick={() => void d.bajarPrn()} className={botonMonte("claro")} data-qa="bajar-prn">
            <Download className="h-5 w-5 shrink-0" aria-hidden /> Bajar el .prn
          </button>
          {e.android && (
            <button type="button" onClick={() => void d.abrirRawbt()} className={botonMonte("claro")} data-qa="abrir-rawbt">
              <Smartphone className="h-5 w-5 shrink-0" aria-hidden /> Abrir en RawBT
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** ⓘ con lo que hay que llevar al monte para «Imprimir directo». */
export function QueNecesitasEnElMonte() {
  return (
    <InfoTip
      icono="ayuda"
      title="Qué necesitas en el monte"
      ariaLabel="Qué necesitas en el monte"
      what={
        <span className="block space-y-0.5">
          <span className="block">· Celular Android con Chrome</span>
          <span className="block">· Adaptador OTG (USB-C o micro USB a USB)</span>
          <span className="block">· Cable USB A-B de la impresora</span>
          <span className="block">· Matricial Epson (LX-350, LX-310, FX-890)</span>
        </span>
      }
      affects="iPhone no puede: usa el PDF."
      example="Conecta, prende la impresora y toca «Probar la impresora»: la 1.ª vez Chrome pide elegirla."
    />
  );
}

/**
 * «Probar la impresora»: la hoja de prueba (cruces a 10 mm del borde) con la
 * impresora del envío (`perfilId`: la que va a imprimir de verdad), sobre la
 * hoja del titular de esa guía. El estado lo tiene la vista, que dibuja el
 * aviso debajo de la cabecera.
 */
export function BotonProbarImpresora({ gtfId, perfilId, d }: { gtfId: string | null; perfilId: string; d: ImpresionDirecta }) {
  const probar = () => {
    if (!gtfId) return;
    void d.imprimir(rutaSalida({ gtfId, formato: "escp", perfilId, hoja: "guia", prueba: true }), "prueba-monte.prn");
  };
  return (
    <Btn
      variant="secondary"
      className="min-h-12"
      onClick={probar}
      disabled={!gtfId || d.ocupado}
      title={gtfId ? "Hoja de prueba con cruces, con la calibración de la impresora del envío" : "Se puede probar cuando llegue una guía"}
      data-qa="probar-impresora"
    >
      <Printer className="h-4 w-4" aria-hidden />
      <span>{d.ocupado ? "Imprimiendo…" : <>Probar<span className="max-sm:sr-only"> la impresora</span></>}</span>
    </Btn>
  );
}
