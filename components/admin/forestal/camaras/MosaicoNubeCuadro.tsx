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
 * fotos guardó.
 */

import { useCallback, useEffect } from "react";
import { Maximize2, Sparkles, Users, Volume2, VolumeX } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useApiCamaras } from "./api-camaras";
import { BTN, CHIP_BASE, CHIP_TONO, ICONO_TONO } from "./camaras-ui";
import ControlesCamara from "./ControlesCamara";
import { fuenteDelVideo } from "./reproductor-nube";
import { useAnalizarCuadro } from "./use-analizar-cuadro";
import {
  useDetectorPersonas,
  type DetectorPersonas,
  type UltimaFotoPersona,
} from "./use-detector-personas";
import type { TomarCuadro } from "./use-personas-mosaico";
import { useVisorNube, type Calidad, type EstadoVisor } from "./use-visor-nube";
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
  /** «Detectar personas» del mosaico (apagado si no se pasa: el Modo TV no lo usa). */
  detectar?: boolean;
  onFotoPersona?: (foto: UltimaFotoPersona) => void;
  /** Para el punto «en vivo» de la burbuja. */
  onEstado?: (camaraId: string, estado: EstadoVisor) => void;
  /** La miniatura de respaldo de la burbuja: un cuadro sin contar como toque. */
  registrarCuadro?: (camaraId: string, tomar: TomarCuadro | null) => void;
}

export default function MosaicoNubeCuadro({
  camara,
  activo,
  retrasoMs,
  onActividad,
  onVerFotos,
  baseApi,
  detectar = false,
  onFotoPersona,
  onEstado,
  registrarCuadro,
}: Props) {
  const { base, soloMirar } = useApiCamaras(baseApi);
  const v = useVisorNube(camara.id, { activo, retrasoMs, onActividad, baseApi: base });
  const a = useAnalizarCuadro(camara.id, v.tomarCuadro);
  const viendo = v.estado === "viendo";
  const { contenedorId, estado, tomarCuadroQuieto } = v;
  const leerFuente = useCallback(() => fuenteDelVideo(document.getElementById(contenedorId)), [contenedorId]);
  const personas = useDetectorPersonas({
    camaraId: camara.id,
    nombre: camara.nombre,
    activo: viendo && detectar && !soloMirar,
    leerFuente,
    tomarCuadro: tomarCuadroQuieto,
    onFoto: onFotoPersona,
  });

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
      className="min-w-0 space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5"
      data-cuadro-mosaico={camara.id}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
          {camara.nombre}
        </span>
        {detectar && viendo && <ChipPersonas d={personas} />}
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

/** «2 personas · 12 fotos» del detector de este cuadro (nada si está apagado). */
function ChipPersonas({ d }: { d: DetectorPersonas }) {
  if (d.estado === "apagado") return null;
  if (d.estado === "error")
    return (
      <span className={`${CHIP_BASE} ${CHIP_TONO.alerta}`} title={d.error ?? undefined}>
        <Users className={`h-3.5 w-3.5 ${ICONO_TONO.alerta}`} aria-hidden /> No detecta
      </span>
    );
  if (d.estado === "cargando")
    return (
      <span className={`${CHIP_BASE} ${CHIP_TONO.neutro}`}>
        <Users className={`h-3.5 w-3.5 ${ICONO_TONO.neutro}`} aria-hidden /> Preparando…
      </span>
    );
  const hay = d.personasAhora > 0;
  return (
    <span
      className={`${CHIP_BASE} ${hay ? CHIP_TONO.aviso : CHIP_TONO.neutro}`}
      title="Personas en cuadro ahora · fotos guardadas en la carpeta «Personas»"
      aria-live="polite"
    >
      <Users className={`h-3.5 w-3.5 ${hay ? ICONO_TONO.aviso : ICONO_TONO.neutro}`} aria-hidden />
      {hay ? `${d.personasAhora} ${d.personasAhora === 1 ? "persona" : "personas"}` : "Nadie"}
      {d.fotosTomadas > 0 && (
        <span className="text-[var(--text-tertiary)]">
          · {d.fotosTomadas} {d.fotosTomadas === 1 ? "foto" : "fotos"}
        </span>
      )}
    </span>
  );
}
