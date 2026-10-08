"use client";

/**
 * «Ver todas en vivo» (ADR-471): todas las cámaras enlazadas a Hik-Connect a
 * la vez, a lo ancho de la ventana — 2 columnas grandes en la PC, una debajo
 * de otra en el celular —, cada una con sus controles (ADR-472). Arranca en
 * SD (menos datos), pide el video de a una (Hikvision corta a 5 pedidos/s) y
 * lleva UN reloj de 5 min sin tocar para todo el mosaico. Al cerrar, cada
 * cuadro suelta su reproductor (`destroy` de EZUIKit en el desmontaje).
 *
 * Minimizar (2026-10-07): el panel NO se desmonta —desmontarlo corta el video
 * y la detección de personas—, sólo se vuelve invisible, inerte y sin velo, y
 * queda la burbuja (`MosaicoBurbuja`). Por eso ya no es un `AdminModal`: el
 * `Dialog` de Radix desmonta su contenido al cerrarse. Es un diálogo a mano en
 * un portal, con `useModalAccesible` (foco, Tab, Escape) sólo mientras se ve.
 *
 * Aviso de personas (2026-10-08): cada cuadro le pasa sus apariciones y acá
 * suenan el pitido y el mensaje (`useAvisoPersonas`) — también minimizado,
 * porque el mosaico sigue montado; ahí el mensaje trae «Ver» para expandirlo.
 */

import { useCallback, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Battery, Play, Tv } from "@buleje/design-system/icons";
import { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { cn } from "@/lib/utils";
import { useApiCamaras } from "./api-camaras";
import { BTN } from "./camaras-ui";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import MosaicoBurbuja from "./MosaicoBurbuja";
import MosaicoNubeCabecera from "./MosaicoNubeCabecera";
import MosaicoNubeCuadro, { type CamaraMosaico } from "./MosaicoNubeCuadro";
import { navegarEnElPanel } from "./navegar-panel";
import { useAvisoPersonas } from "./use-aviso-personas";
import { RETRASO_ENTRE_CUADROS_MS, useMosaicoNube, vecesMas } from "./use-mosaico-nube";
import { usePersonasMosaico } from "./use-personas-mosaico";
import type { EstadoVisor } from "./use-visor-nube";

interface Props {
  camaras: readonly CamaraMosaico[];
  onCerrar: () => void;
  onVerFotos: () => void;
  /** Base de la API de cada cuadro (`TV_API_TV` = sólo mirar). */
  baseApi?: string;
  /** «Verlo en el televisor» (Modo TV): el canvas de Hik-Connect no se puede transmitir. */
  onVerEnTv?: () => void;
  /** Mosaico del panel (`MosaicoGlobalProvider`): escondido, el video sigue y queda la burbuja. */
  minimizado?: boolean;
  onMinimizar?: () => void;
  onExpandir?: () => void;
}

/* Las clases de `AdminModal` variante `info` + `sm:max-w-[96vw]` (lo que era antes). */
const PANEL =
  "fixed z-modal flex flex-col overflow-clip bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] outline-none bottom-0 left-0 right-0 w-full rounded-t-2xl max-h-[92vh] sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-[96vw] sm:rounded-2xl sm:max-h-[92vh]";

const FOTOS_DE_PERSONAS = "/admin?tab=camaras&vista=personas";

export default function MosaicoNube({
  camaras,
  onCerrar,
  onVerFotos,
  baseApi,
  onVerEnTv,
  minimizado = false,
  onMinimizar,
  onExpandir,
}: Props) {
  const { soloMirar } = useApiCamaras(baseApi);
  const [detectar, setDetectar] = useState(!soloMirar);
  const [sinPausa, setSinPausa] = useState(false);
  const m = useMosaicoNube({ sinPausa });
  const p = usePersonasMosaico({ minimizado, conCarpeta: !soloMirar });
  const [estados, setEstados] = useState<Record<string, EstadoVisor>>({});
  const panel = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  /* Los tokens del panel se copian al EXPANDIR: si cambió el tema minimizado, se releen. */
  const tokens = usePanelTokens(!minimizado);

  const { alMinimizar } = p;
  const minimizar = useCallback(() => {
    if (!onMinimizar) return;
    alMinimizar();
    onMinimizar();
  }, [alMinimizar, onMinimizar]);
  /* Escape y el velo minimizan (no cortan) si hay burbuja; si no, cierran como antes. */
  const salir = onMinimizar ? minimizar : onCerrar;
  useModalAccesible(panel, { onCerrar: salir, activo: !minimizado });

  const verFotos = useCallback(() => {
    if (onMinimizar) alMinimizar();
    onVerFotos();
  }, [alMinimizar, onMinimizar, onVerFotos]);
  const expandir = useCallback(() => {
    /* Tocar la burbuja es actividad: si no, abierta a los 4:59 se pausa al segundo. */
    if (m.cortado) m.seguir();
    else m.actividad();
    onExpandir?.();
  }, [m, onExpandir]);
  const aviso = useAvisoPersonas(minimizado && onExpandir ? expandir : undefined);
  const cambiarSinPausa = (v: boolean) => {
    setSinPausa(v);
    if (v && m.cortado) m.seguir();
  };
  const onEstado = useCallback((id: string, e: EstadoVisor) => {
    setEstados((prev) => (prev[id] === e ? prev : { ...prev, [id]: e }));
  }, []);
  const viendo = camaras.filter((c) => estados[c.id] === "viendo").length;

  /* La galería de hoy (con «Abrir en el Drive» adentro), no el Drive: ~1.200 fotos al día. */
  const carpetaHref = FOTOS_DE_PERSONAS;
  const irACarpeta = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!carpetaHref || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    minimizar();
    navegarEnElPanel(carpetaHref);
  };

  return (
    <>
      {createPortal(
        <>
          {!minimizado && <div className="modal-backdrop" onClick={salir} aria-hidden />}
          <div
            ref={panel}
            role={minimizado ? undefined : "dialog"}
            aria-modal={minimizado ? undefined : true}
            aria-labelledby={tituloId}
            aria-hidden={minimizado || undefined}
            inert={minimizado || undefined}
            tabIndex={-1}
            style={tokens}
            className={cn(PANEL, minimizado && "pointer-events-none opacity-0")}
            data-mosaico-panel={minimizado ? "minimizado" : "abierto"}
          >
            <MosaicoNubeCabecera
              tituloId={tituloId}
              camaras={camaras.length}
              vigilancia={!soloMirar}
              detectar={detectar}
              onDetectar={setDetectar}
              sonido={aviso.sonido}
              onSonido={aviso.cambiarSonido}
              sinPausa={sinPausa}
              onSinPausa={cambiarSinPausa}
              carpetaHref={carpetaHref}
              onIrACarpeta={irACarpeta}
              onMinimizar={onMinimizar ? minimizar : undefined}
              onCerrar={onCerrar}
            />
            <div
              className={`${MODAL_BODY} relative min-h-0 flex-1 space-y-3 overflow-y-auto`}
              onPointerDown={m.actividad}
              onKeyDown={m.actividad}
              data-mosaico-nube
            >
              <AvisoDatos camaras={camaras.length} sinPausa={sinPausa} onVerEnTv={onVerEnTv} />

              {m.cortado && (
                <div
                  role="status"
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <span className="min-w-0 flex-1">
                    Se pausaron tras {MINUTOS_SIN_TOCAR} min sin tocar, para cuidar la batería.
                  </span>
                  <button type="button" onClick={m.seguir} className={BTN}>
                    <Play className="h-4 w-4" aria-hidden /> Seguir viendo
                  </button>
                </div>
              )}

              <ul className="grid gap-3 md:grid-cols-2">
                {camaras.map((c, i) => (
                  <MosaicoNubeCuadro
                    key={c.id}
                    camara={c}
                    activo={!m.cortado}
                    retrasoMs={i * RETRASO_ENTRE_CUADROS_MS}
                    onActividad={m.actividad}
                    onVerFotos={verFotos}
                    baseApi={baseApi}
                    detectar={detectar}
                    onFotoPersona={p.onFoto}
                    onEstado={onEstado}
                    registrarCuadro={p.registrarCuadro}
                    onAparicion={aviso.avisar}
                  />
                ))}
              </ul>
            </div>
          </div>
        </>,
        document.body,
      )}
      {minimizado && onExpandir && (
        <MosaicoBurbuja
          camaras={camaras.length}
          viendo={viendo}
          pausado={m.cortado}
          miniatura={p.miniatura}
          miniaturaAt={p.miniaturaAt}
          miniaturaEsPersona={p.miniaturaEsPersona}
          fotos={p.desdeMinimizar}
          onExpandir={expandir}
          onCerrar={onCerrar}
        />
      )}
    </>
  );
}

/** El aviso de batería y datos; con «No pausar», el de datos por hora. */
function AvisoDatos({
  camaras,
  sinPausa,
  onVerEnTv,
}: {
  camaras: number;
  sinPausa: boolean;
  onVerEnTv?: () => void;
}) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
      <Battery className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      <span className="min-w-0 flex-1">
        {sinPausa
          ? `Sin pausa: cada cámara gasta ${DATOS_POR_HORA} de su chip hasta que cierres.`
          : `Gasta ${vecesMas(camaras)} de batería y datos mientras está abierto.`}
      </span>
      <InfoTip
        title="Batería y datos"
        what={`Cada cámara transmite a la vez y gasta ${DATOS_POR_HORA} de su chip (SD gasta menos que HD).`}
        affects={`Si nadie toca el mosaico por ${MINUTOS_SIN_TOCAR} minutos, se pausan todas (salvo con «No pausar»). Minimizar NO corta: cerrar sí.`}
        example="Para mirar una sola con calma, cierra esto y usa «En vivo» de esa cámara."
      />
      {onVerEnTv && (
        <button
          type="button"
          onClick={onVerEnTv}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] underline-offset-4 hover:underline dark:text-[var(--accent)]"
          title="El Modo TV muestra las cámaras en el navegador del televisor"
        >
          <Tv className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Verlo en el televisor</span>
        </button>
      )}
    </p>
  );
}
