"use client";

/**
 * Un cuadro del mosaico «Ver todas en vivo» (ADR-471): su nombre y estado, su
 * video, HD/SD, sonido, «Analizar» y pantalla completa propios, y encima los
 * controles del aparato (ADR-472; las flechas del teclado mueven la cámara del
 * cuadro que tiene el foco). El corte por inactividad NO es suyo: lo lleva el
 * mosaico (`activo` / `onActividad`).
 *
 * Vigilancia (2026-10-07): con `detectar`, el detector de personas mira el
 * lienzo de EZUIKit mientras hay video — también con el mosaico minimizado,
 * porque el cuadro sigue montado — y su pastilla dice cuántas ve y cuántas
 * fotos guardó. El ojo tachado abre «Zonas que el detector ignora» sobre el
 * cuadro en vivo (08-10): lo que cae ahí no cuenta como persona.
 *
 * Marcar y avisar (Brandon 2026-10-08: «que detecte el movimiento de las
 * personas, las marque, les ponga la etiqueta y avise»): encima del video van
 * las cajas del detector (`CajasEnVivo`); cuando aparece gente el cuadro se
 * resalta con un anillo coral unos segundos y le pasa la aparición al mosaico
 * (`onAparicion`), que es el que suena y muestra el mensaje.
 */

import { useEffect } from "react";
import { Maximize2, Sparkles } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import type { AparicionPersona, CajaFraccion } from "@/lib/camaras/vigia";
import { cn } from "@/lib/utils";
import { useApiCamaras } from "./api-camaras";
import BotonSonido from "./BotonSonido";
import BotonZonasDetector from "./BotonZonasDetector";
import CajasEnVivo from "./CajasEnVivo";
import { BTN } from "./camaras-ui";
import ChipPersonas from "./ChipPersonas";
import ControlesCamara from "./ControlesCamara";
import { useAnalizarCuadro } from "./use-analizar-cuadro";
import { useAparicionReciente } from "./use-aviso-personas";
import { useDetectorDelVisor } from "./use-detector-del-visor";
import type { UltimaFotoPersona } from "./use-detector-personas";
import type { TomarCuadro } from "./use-personas-mosaico";
import { useVisorNube, type Calidad, type EstadoVisor } from "./use-visor-nube";
import VisorNubeAnalisis from "./VisorNubeAnalisis";
import VisorNubeCapas, { ChipEstadoVivo } from "./VisorNubeCapas";

/** «Ver movimiento» apagado: la capa sigue (personas), sin los recuadros celestes. */
const SIN_MOVIMIENTO: readonly CajaFraccion[] = Object.freeze([]);

export interface CamaraMosaico {
  id: string;
  nombre: string;
  conCodigo: boolean;
}

interface Props {
  camara: CamaraMosaico;
  activo: boolean;
  retrasoMs: number;
  onActividad: () => void;
  onVerFotos: () => void;
  /** Base de la API (`TV_API_TV` = sólo mirar: sin mover, micrófono ni «Analizar»). */
  baseApi?: string;
  /** «Detectar personas» del mosaico (apagado si no se pasa: el Modo TV no lo usa). */
  detectar?: boolean;
  /** «Ver movimiento» del mosaico: los recuadros celestes del detector (recordado). */
  verMovimiento?: boolean;
  onFotoPersona?: (foto: UltimaFotoPersona) => void;
  /** Para el punto «en vivo» de la burbuja. */
  onEstado?: (camaraId: string, estado: EstadoVisor) => void;
  /** La miniatura de respaldo de la burbuja: un cuadro sin contar como toque. */
  registrarCuadro?: (camaraId: string, tomar: TomarCuadro | null) => void;
  /** Apareció gente en este cuadro: el mosaico avisa (mensaje + pitido). */
  onAparicion?: (a: AparicionPersona) => void;
}

export default function MosaicoNubeCuadro({
  camara,
  activo,
  retrasoMs,
  onActividad,
  onVerFotos,
  baseApi,
  detectar = false,
  verMovimiento = true,
  onFotoPersona,
  onEstado,
  registrarCuadro,
  onAparicion,
}: Props) {
  const { base, soloMirar } = useApiCamaras(baseApi);
  const v = useVisorNube(camara.id, { activo, retrasoMs, onActividad, baseApi: base });
  const a = useAnalizarCuadro(camara.id, v.tomarCuadro);
  const viendo = v.estado === "viendo";
  const { contenedorId, estado, tomarCuadroQuieto } = v;
  const { personas, zonas } = useDetectorDelVisor({
    camaraId: camara.id,
    nombre: camara.nombre,
    v,
    activo: detectar && !soloMirar,
    onFoto: onFotoPersona,
  });
  const reciente = useAparicionReciente(personas.aparicion, onAparicion);
  const marcar = detectar && viendo;

  useEffect(() => {
    onEstado?.(camara.id, estado);
  }, [onEstado, camara.id, estado]);
  useEffect(() => {
    if (!registrarCuadro) return;
    registrarCuadro(camara.id, tomarCuadroQuieto);
    return () => registrarCuadro(camara.id, null);
  }, [registrarCuadro, camara.id, tomarCuadroQuieto]);

  return (
    <li
      className={cn(
        "min-w-0 space-y-2 rounded-xl border bg-[var(--surface-raised)] p-2.5 transition-shadow",
        reciente
          ? "border-[var(--data-warning-500)] ring-2 ring-[var(--data-warning-500)]"
          : "border-[var(--rule-base)]",
      )}
      data-cuadro-mosaico={camara.id}
      data-persona-reciente={reciente || undefined}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
          {camara.nombre}
        </span>
        {marcar && <ChipPersonas d={personas} />}
        <ChipEstadoVivo estado={v.estado} />
      </div>

      <div
        id={v.marcoId}
        className={
          v.enPantallaCompleta
            ? "relative flex h-full w-full flex-col bg-[var(--surface-canvas)]"
            : "relative"
        }
      >
        <div
          className={
            v.enPantallaCompleta
              ? "relative min-h-0 w-full flex-1 overflow-hidden"
              : "relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]"
          }
        >
          {/* Vacío a propósito: EZUIKit dibuja acá adentro (React no le pone hijos). */}
          <div
            id={v.contenedorId}
            className="flex h-full w-full items-center justify-center"
            data-visor-nube={camara.id}
          />
          {marcar && (
            <CajasEnVivo
              personas={personas.personasEnVivo}
              movimiento={verMovimiento ? personas.movimientoEnVivo : SIN_MOVIMIENTO}
              contenedorId={contenedorId}
            />
          )}
          <VisorNubeCapas v={v} conCodigo={camara.conCodigo} compacto />
        </div>
        {!soloMirar && (
          <ControlesCamara
            camaraId={camara.id}
            nombre={camara.nombre}
            marcoId={v.marcoId}
            viendo={viendo}
            teclado="grupo"
            compacto
            onVerFotos={onVerFotos}
            tomarCuadro={v.tomarCuadro}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Calidad>
          value={v.calidad}
          onChange={(c) => {
            v.actividad();
            v.setCalidad(c);
          }}
          size="sm"
          label={`Calidad del video de ${camara.nombre}`}
          options={[
            { value: "sd", label: "SD" },
            { value: "hd", label: "HD" },
          ]}
        />
        <BotonSonido
          v={v}
          className={`${BTN} w-9 justify-center px-0 max-sm:h-11 max-sm:w-11`}
          nombre={camara.nombre}
          soloIcono
        />
        {!soloMirar && (
          <button
            type="button"
            onClick={() => void a.analizar()}
            disabled={!viendo || a.ocupado}
            className={BTN}
            title="La IA mira este cuadro: personas, placa y chalecos"
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Analizar
          </button>
        )}
        {!soloMirar && (
          <BotonZonasDetector
            camaraId={camara.id}
            nombre={camara.nombre}
            zonas={zonas}
            cargarImagen={tomarCuadroQuieto}
            className={BTN}
          />
        )}
        <button
          type="button"
          onClick={v.pantallaCompleta}
          disabled={!viendo}
          className={`${BTN} ml-auto w-9 justify-center px-0`}
          title="Pantalla completa"
          aria-label={`Ver ${camara.nombre} en pantalla completa`}
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {!soloMirar && <VisorNubeAnalisis a={a} onVerFotos={onVerFotos} />}
    </li>
  );
}
