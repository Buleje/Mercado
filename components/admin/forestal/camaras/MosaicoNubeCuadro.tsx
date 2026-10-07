"use client";

/**
 * Un cuadro del mosaico «Ver todas en vivo» (ADR-471): su nombre y estado, su
 * video, HD/SD, sonido, «Analizar» y pantalla completa propios, y encima los
 * controles del aparato (ADR-472; las flechas del teclado mueven la cámara del
 * cuadro que tiene el foco). El corte por inactividad NO es suyo: lo lleva el
 * mosaico (`activo` / `onActividad`).
 */

import { Maximize2, Sparkles, Volume2, VolumeX } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useApiCamaras } from "./api-camaras";
import { BTN } from "./camaras-ui";
import ControlesCamara from "./ControlesCamara";
import { useAnalizarCuadro } from "./use-analizar-cuadro";
import { useVisorNube, type Calidad } from "./use-visor-nube";
import VisorNubeAnalisis from "./VisorNubeAnalisis";
import VisorNubeCapas, { ChipEstadoVivo } from "./VisorNubeCapas";

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
}

export default function MosaicoNubeCuadro({
  camara,
  activo,
  retrasoMs,
  onActividad,
  onVerFotos,
  baseApi,
}: Props) {
  const { base, soloMirar } = useApiCamaras(baseApi);
  const v = useVisorNube(camara.id, { activo, retrasoMs, onActividad, baseApi: base });
  const a = useAnalizarCuadro(camara.id, v.tomarCuadro);
  const viendo = v.estado === "viendo";

  return (
    <li
      className="min-w-0 space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5"
      data-cuadro-mosaico={camara.id}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
          {camara.nombre}
        </span>
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
        <button
          type="button"
          onClick={() => void v.alternarSonido()}
          disabled={!viendo}
          aria-pressed={v.sonido}
          className={`${BTN} w-9 justify-center px-0 max-sm:h-11 max-sm:w-11`}
          title={v.sonido ? "Silenciar" : "Escuchar lo que oye la cámara"}
          aria-label={v.sonido ? `Silenciar ${camara.nombre}` : `Escuchar ${camara.nombre}`}
        >
          {v.sonido ? (
            <Volume2 className="h-4 w-4" aria-hidden />
          ) : (
            <VolumeX className="h-4 w-4" aria-hidden />
          )}
        </button>
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
