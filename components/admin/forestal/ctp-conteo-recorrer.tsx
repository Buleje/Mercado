"use client";

/**
 * Paso 2 de «Contar el patio»: recorrer la pila escaneando (Brandon
 * 2026-10-05). Arriba el contador grande «8 de 13 encontradas» —el mismo que
 * se ve dentro de la cámara—, después el escáner (cámara ancha, a una mano, o
 * tipear el código pintado), «Terminar» y las listas Faltan / Encontradas /
 * Sobran. Cada lectura vibra (y suena distinto si sobra): no hay que mirar la
 * pantalla al sol en cada pieza.
 */

import { useRef, useState } from "react";
import { CheckCircle2, RotateCcw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ConteoPatio, LecturaConteo, ResumenConteo, TrozaDelConteo } from "@/lib/forestal/conteo-patio";
import { LABEL_BLOQUEO } from "@/lib/forestal/consumo-trozas";
import { senalDeLectura } from "@/lib/forestal/conteo-patio-senal";
import EscanerTrozas, { nombreDeTroza } from "./EscanerTrozas";
import ListasDelConteo from "./patio-conteo-listas";
import { BOTON, BOTON_BORDE, BOTON_PRIMARIO, TARJETA } from "./ctp-conteo-pasos";

const BOTON_BORRAR = `${BOTON} border-2 border-[var(--data-error-500)] bg-[var(--surface-raised)] text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]`;

/** «8 de 13 encontradas» — en la pantalla y dentro de la cámara. */
function Contador({ resumen, enCamara = false }: { resumen: ResumenConteo; enCamara?: boolean }) {
  const sobran = resumen.sorpresas.length;
  return (
    <div className="space-y-1">
      <p
        className={cn("font-bold tabular-nums leading-none text-[var(--text-primary)]", enCamara ? "text-3xl" : "text-5xl")}
        data-conteo-progreso={enCamara ? undefined : true}
      >
        {resumen.contadas}{" "}
        <span className={cn("font-semibold text-[var(--text-secondary)]", enCamara ? "text-xl" : "text-2xl")}>
          de {resumen.total} encontradas
        </span>
      </p>
      <p className="text-base font-bold tabular-nums text-[var(--text-secondary)]">
        {resumen.faltan.length} faltan
        {" · "}
        <span className={sobran > 0 ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : undefined}>
          {sobran} {sobran === 1 ? "sobra" : "sobran"}
        </span>
      </p>
    </div>
  );
}

export interface AccionesDelRecorrido {
  anotar: (t: TrozaDelConteo) => void;
  anotarCodigo: (codigo: string) => void;
  quitar: (l: Pick<LecturaConteo, "trozaId" | "codigo">) => void;
  empezarOtro: () => void;
}

export default function PasoRecorrer({
  conteo,
  resumen,
  acciones,
  onTerminar,
}: {
  conteo: ConteoPatio;
  resumen: ResumenConteo;
  acciones: AccionesDelRecorrido;
  onTerminar: () => void;
}) {
  const [borrando, setBorrando] = useState(false);
  /* El contador dentro de la cámara está montado = la cámara está abierta: su
     propio pitido ya sonó, el «tic» de encontrada no se suma. */
  const camaraAbierta = useRef(false);
  const yaContadas = new Set(conteo.lecturas.flatMap((l) => (l.trozaId ? [l.trozaId] : [])));
  const pct = resumen.total > 0 ? Math.round((resumen.contadas / resumen.total) * 100) : 0;

  const onTroza = (t: TrozaDelConteo) => {
    acciones.anotar(t);
    senalDeLectura(t.motivo ? "sobra" : "encontrada", { camaraAbierta: camaraAbierta.current });
  };
  const avisoAlTomar = (t: TrozaDelConteo) =>
    t.motivo
      ? { tono: "ya" as const, mensaje: `Sobra: troza ${nombreDeTroza(t)}. ${LABEL_BLOQUEO[t.motivo]}.` }
      : { tono: "ok" as const, mensaje: `Troza ${nombreDeTroza(t)} encontrada.` };
  const onDesconocido = (codigo: string) => {
    acciones.anotarCodigo(codigo);
    senalDeLectura("sobra");
    return `Sobra: ${codigo} no es de ninguna troza del libro.`;
  };

  return (
    <div className="space-y-4" data-paso-recorrer>
      <section className={cn(TARJETA, "space-y-3")} aria-live="polite">
        <Contador resumen={resumen} />
        <div
          role="progressbar"
          aria-label="Avance del conteo"
          aria-valuemin={0}
          aria-valuemax={resumen.total}
          aria-valuenow={resumen.contadas}
          className="h-4 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        >
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <EscanerTrozas
        trozas={conteo.trozas}
        onTroza={onTroza}
        yaElegidas={yaContadas}
        accion="encontrada"
        mostrarCuenta={false}
        avisoAlTomar={avisoAlTomar}
        onDesconocido={onDesconocido}
        camaraGrande
        pieCamara={
          <div
            ref={(el) => {
              camaraAbierta.current = el != null;
            }}
          >
            <Contador resumen={resumen} enCamara />
          </div>
        }
      />

      <button
        type="button"
        onClick={onTerminar}
        disabled={conteo.lecturas.length === 0}
        className={cn(BOTON_PRIMARIO, "w-full")}
        data-terminar-conteo
      >
        <CheckCircle2 className="h-6 w-6" aria-hidden /> Terminar y ver el acta
      </button>

      <ListasDelConteo resumen={resumen} onQuitar={acciones.quitar} />

      {conteo.lecturas.length > 0 && (
        <div className="border-t border-[var(--rule-base)] pt-4">
          {borrando ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-[var(--text-primary)]">¿Borrar lo contado?</span>
              <button
                type="button"
                onClick={() => {
                  acciones.empezarOtro();
                  setBorrando(false);
                }}
                className={BOTON_BORRAR}
              >
                Sí, borrar
              </button>
              <button type="button" onClick={() => setBorrando(false)} className={BOTON_BORDE}>
                No
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setBorrando(true)} className={cn(BOTON_BORDE, "w-full sm:w-auto")}>
              <RotateCcw className="h-5 w-5" aria-hidden /> Empezar de cero
            </button>
          )}
        </div>
      )}
    </div>
  );
}
