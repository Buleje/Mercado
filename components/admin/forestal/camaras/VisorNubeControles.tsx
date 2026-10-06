"use client";

/**
 * Los controles del visor de la nube (ADR-471): HD/SD, foto, «Analizar» (la IA
 * mira el cuadro), pantalla completa y «Ver grabación» de la microSD por fecha
 * y hora. A 400 px van en dos filas
 * que no se parten: calidad + acciones arriba, la grabación abajo.
 */

import { useState } from "react";
import { Camera, History, Maximize2, Sparkles, Video } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { BTN } from "./camaras-ui";
import { hoyLocal, horaHaceUnaHora } from "./hik-connect-teams";
import type { AnalisisCuadro } from "./use-analizar-cuadro";
import type { Calidad, VisorNubeEstado } from "./use-visor-nube";

const CAMPO =
  "h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function VisorNubeControles({
  v,
  analisis,
}: {
  v: VisorNubeEstado;
  analisis: AnalisisCuadro;
}) {
  const [abrirRango, setAbrirRango] = useState(false);
  const [fecha, setFecha] = useState(hoyLocal);
  const [hora, setHora] = useState(horaHaceUnaHora);
  const [aviso, setAviso] = useState<string | null>(null);
  const viendo = v.estado === "viendo";
  const enGrabacion = v.modo.tipo === "grabacion";

  const verGrabacion = () => {
    v.actividad();
    if (!v.verGrabacion(fecha, hora)) {
      setAviso("Elige una fecha y una hora válidas.");
      return;
    }
    setAviso(null);
    setAbrirRango(false);
  };

  return (
    <div className="space-y-2" onPointerDown={v.actividad}>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Calidad>
          value={v.calidad}
          onChange={(c) => {
            v.actividad();
            v.setCalidad(c);
          }}
          size="sm"
          label="Calidad del video"
          options={[
            { value: "sd", label: "SD" },
            { value: "hd", label: "HD" },
          ]}
        />
        <button
          type="button"
          onClick={v.foto}
          disabled={!viendo}
          className={BTN}
          title="Bajar una foto del cuadro que se ve"
        >
          <Camera className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Foto</span>
        </button>
        <button
          type="button"
          onClick={() => void analisis.analizar()}
          disabled={!viendo || analisis.ocupado}
          className={BTN}
          title="La IA mira este cuadro: personas, placa y chalecos"
        >
          <Sparkles className="h-4 w-4" aria-hidden /> Analizar
        </button>
        <button
          type="button"
          onClick={v.pantallaCompleta}
          disabled={!viendo}
          className={BTN}
          title="Pantalla completa"
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Pantalla completa</span>
        </button>
        {enGrabacion ? (
          <button type="button" onClick={v.volverAlVivo} className={`${BTN} ml-auto`}>
            <Video className="h-4 w-4" aria-hidden /> En vivo
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAbrirRango((a) => !a)}
            aria-expanded={abrirRango}
            className={`${BTN} ml-auto`}
          >
            <History className="h-4 w-4" aria-hidden /> Ver grabación
          </button>
        )}
      </div>

      {abrirRango && !enGrabacion && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            verGrabacion();
          }}
        >
          <label className="flex flex-col text-xs font-bold text-[var(--text-secondary)]">
            Fecha
            <input
              type="date"
              value={fecha}
              max={hoyLocal()}
              onChange={(e) => setFecha(e.target.value)}
              className={`${CAMPO} mt-1`}
            />
          </label>
          <label className="flex flex-col text-xs font-bold text-[var(--text-secondary)]">
            Desde
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className={`${CAMPO} mt-1`}
            />
          </label>
          <button type="submit" className={BTN}>
            <History className="h-4 w-4" aria-hidden /> Ver 1 hora
          </button>
          <span className="w-full text-xs text-[var(--text-tertiary)]">
            Lo que grabó la tarjeta de la cámara (hora de la cámara). Si no grabó a esa hora, no hay
            video.
          </span>
          {aviso && (
            <span role="alert" className="w-full text-xs text-[var(--data-error-ink)]">
              {aviso}
            </span>
          )}
        </form>
      )}
      {enGrabacion && v.modo.tipo === "grabacion" && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Grabación del {v.modo.desde.slice(0, 10)} de {v.modo.desde.slice(11, 16)} a{" "}
          {v.modo.hasta.slice(11, 16)}.
        </p>
      )}
    </div>
  );
}
