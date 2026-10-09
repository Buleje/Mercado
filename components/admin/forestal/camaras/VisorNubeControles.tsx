"use client";

/**
 * Los controles del visor de la nube (ADR-471): HD/SD, sonido, bajar el
 * cuadro, «Analizar» (la IA mira el cuadro), Teatro, pantalla completa y «Ver
 * grabación» de la microSD por fecha y hora. Los del APARATO (mover, foto a
 * Fotos, detección, alarma) van encima del video: `ControlesCamara` (ADR-472).
 * A 400 px van en dos filas que no se parten: calidad + acciones arriba, la
 * grabación abajo; en el celular los botones miden 44 px.
 *
 * El mosaico (2026-10-09, Brandon: las funciones del «En vivo» también en
 * «todas») usa estos mismos controles en cada cuadro, `compacto` (sólo ícono
 * donde el nombre sobra) y con «Teatro» convertido en «Ampliar»: el cuadro
 * toma el ancho entero del mosaico en vez de la ventana.
 */

import { useState, type ReactNode } from "react";
import {
  Download,
  Expand,
  History,
  Maximize2,
  Minimize2,
  Sparkles,
  Video,
} from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { cn } from "@/lib/utils";
import BotonSonido from "./BotonSonido";
import { BTN as BTN_BASE } from "./camaras-ui";
import { hoyLocal, horaHaceUnaHora } from "./hik-connect-teams";
import type { AnalisisCuadro } from "./use-analizar-cuadro";
import type { Calidad, VisorNubeEstado } from "./use-visor-nube";

const BTN = `${BTN_BASE} max-sm:h-11 max-sm:min-w-11 max-sm:justify-center`;

const CAMPO =
  "h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function VisorNubeControles({
  v,
  analisis,
  compacto = false,
  nombre,
  teatro = "ventana",
  extra,
}: {
  v: VisorNubeEstado;
  /** Sin esto (Modo TV, sólo mirar), no hay «Analizar». */
  analisis?: AnalisisCuadro;
  /** Cuadro del mosaico: «Bajar», «Pantalla completa» y el sonido sólo con ícono. */
  compacto?: boolean;
  /** Para nombrar los botones de sólo ícono («Bajar el cuadro de Patio»). */
  nombre?: string;
  /** `ventana` = Teatro del visor; `mosaico` = Ampliar el cuadro; `null` = sin el botón. */
  teatro?: "ventana" | "mosaico" | null;
  /** Al lado de «Analizar» (las zonas del detector, en el mosaico). */
  extra?: ReactNode;
}) {
  const [abrirRango, setAbrirRango] = useState(false);
  const [fecha, setFecha] = useState(hoyLocal);
  const [hora, setHora] = useState(horaHaceUnaHora);
  const [aviso, setAviso] = useState<string | null>(null);
  const viendo = v.estado === "viendo";
  const enGrabacion = v.modo.tipo === "grabacion";
  const de = nombre ? ` de ${nombre}` : "";
  const etiqueta = compacto ? "sr-only" : "max-sm:sr-only";
  const icono = compacto ? "w-9 justify-center px-0" : "";

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
          label={`Calidad del video${de}`}
          options={[
            { value: "sd", label: "SD" },
            { value: "hd", label: "HD" },
          ]}
        />
        <BotonSonido v={v} className={cn(BTN, icono)} nombre={nombre} soloIcono={compacto} />
        <button
          type="button"
          onClick={v.foto}
          disabled={!viendo}
          className={cn(BTN, icono)}
          title="Bajar a tu equipo el cuadro que se ve"
        >
          <Download className="h-4 w-4" aria-hidden />
          <span className={etiqueta}>Bajar{compacto && ` el cuadro${de}`}</span>
        </button>
        {analisis && (
          <button
            type="button"
            onClick={() => void analisis.analizar()}
            disabled={!viendo || analisis.ocupado}
            className={BTN}
            title="La IA mira este cuadro: personas, placa y chalecos"
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Analizar
          </button>
        )}
        {extra}
        {teatro && (
          <button
            type="button"
            onClick={v.alternarTeatro}
            aria-pressed={v.teatro}
            className={`${BTN} max-sm:hidden`}
            title={
              teatro === "mosaico"
                ? v.teatro
                  ? "Volver al tamaño de las demás"
                  : "Ampliar: esta cámara a todo el ancho"
                : v.teatro
                  ? "Volver al tamaño normal"
                  : "Teatro: el video a toda la ventana"
            }
            data-control="teatro"
          >
            {v.teatro ? (
              <Minimize2 className="h-4 w-4" aria-hidden />
            ) : (
              <Expand className="h-4 w-4" aria-hidden />
            )}
            {teatro === "mosaico" ? (v.teatro ? "Achicar" : "Ampliar") : v.teatro ? "Normal" : "Teatro"}
          </button>
        )}
        <button
          type="button"
          onClick={v.pantallaCompleta}
          disabled={!viendo}
          className={cn(BTN, icono)}
          title="Pantalla completa (Esc para salir)"
        >
          <Maximize2 className="h-4 w-4" aria-hidden />
          <span className={etiqueta}>Pantalla completa{compacto && de}</span>
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
            <History className="h-4 w-4" aria-hidden /> {compacto ? "Grabación" : "Ver grabación"}
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
