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
 *
 * Al lado (2026-10-09, `use-acople-mosaico`): acoplado a la izquierda o a la
 * derecha deja de ser modal —sin velo, sin trampa de foco, Escape es de la
 * página— y el panel se corre al otro lado, donde se marca la asistencia o se
 * recepciona el camión mirando la cámara. `data-capa-libre` le dice a
 * `AdminModal` que un clic acá no es «afuera» (no cierra el modal de al lado).
 */

import { useCallback, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Play } from "@buleje/design-system/icons";
import { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { cn } from "@/lib/utils";
import { useApiCamaras } from "./api-camaras";
import { BTN } from "./camaras-ui";
import { MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import { AsaAcople, MenuAlLado } from "./MosaicoAcople";
import AvisoDatos from "./MosaicoAvisoDatos";
import MosaicoBurbuja from "./MosaicoBurbuja";
import MosaicoNubeCabecera from "./MosaicoNubeCabecera";
import MosaicoNubeCuadro, { type CamaraMosaico } from "./MosaicoNubeCuadro";
import { navegarEnElPanel } from "./navegar-panel";
import { HREF_ASISTENCIA_HOY, useAcopleMosaico, useRuedaLibre } from "./use-acople-mosaico";
import { useAvisoPersonas } from "./use-aviso-personas";
import { RETRASO_ENTRE_CUADROS_MS, useMosaicoNube } from "./use-mosaico-nube";
import { usePersonasMosaico, type TomarCuadro } from "./use-personas-mosaico";
import { useVerMovimiento } from "./use-ver-movimiento";
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
  /** Cada cuadro anota su captura también en el panel («Marcar con foto» de asistencia). */
  onCuadro?: (camaraId: string, tomar: TomarCuadro | null) => void;
}

const PANEL =
  "fixed z-modal flex flex-col overflow-clip bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] outline-none";
/* Las clases de `AdminModal` variante `info` + `sm:max-w-[96vw]` (lo que era antes). */
const AL_CENTRO =
  "bottom-0 left-0 right-0 w-full rounded-t-2xl max-h-[92vh] sm:bottom-auto sm:right-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-[96vw] sm:rounded-2xl sm:max-h-[92vh]";
/* `pointer-events-auto`: con un modal de Radix abierto al otro lado, el body queda sin clics. */
const AL_LADO = {
  izquierda: "inset-y-0 left-0 border-r border-[var(--rule-base)] pointer-events-auto",
  derecha: "inset-y-0 right-0 border-l border-[var(--rule-base)] pointer-events-auto",
} as const;

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
  onCuadro,
}: Props) {
  const { soloMirar } = useApiCamaras(baseApi);
  const [detectar, setDetectar] = useState(!soloMirar);
  const [verMovimiento, setVerMovimiento] = useVerMovimiento();
  const [sinPausa, setSinPausa] = useState(false);
  const m = useMosaicoNube({ sinPausa });
  const p = usePersonasMosaico({ minimizado, conCarpeta: !soloMirar });
  const [estados, setEstados] = useState<Record<string, EstadoVisor>>({});
  const panel = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  /* Los tokens del panel se copian al EXPANDIR: si cambió el tema minimizado, se releen. */
  const tokens = usePanelTokens(!minimizado);
  const acople = useAcopleMosaico(Boolean(onMinimizar), !minimizado);
  const acoplado = acople.lado !== null;
  useRuedaLibre(panel, acoplado && !minimizado);

  const { alMinimizar } = p;
  const minimizar = useCallback(() => {
    if (!onMinimizar) return;
    alMinimizar();
    onMinimizar();
  }, [alMinimizar, onMinimizar]);
  /* Escape y el velo minimizan (no cortan) si hay burbuja; si no, cierran como antes. */
  const salir = onMinimizar ? minimizar : onCerrar;
  useModalAccesible(panel, { onCerrar: salir, activo: !minimizado && !acoplado });

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
  /* «Marcar asistencia» del aviso: la hoja del día al lado de las cámaras. En
     una pantalla angosta no hay «al lado»: se minimiza y la hoja queda entera. */
  const { disponible: puedeAcoplar, lado, acoplar } = acople;
  const marcarAsistencia = useCallback(() => {
    if (!puedeAcoplar) minimizar();
    else {
      if (minimizado) expandir();
      if (!lado) acoplar();
    }
    navegarEnElPanel(HREF_ASISTENCIA_HOY);
  }, [puedeAcoplar, minimizar, minimizado, expandir, lado, acoplar]);
  const aviso = useAvisoPersonas(
    minimizado && onExpandir ? expandir : undefined,
    onMinimizar && !soloMirar ? marcarAsistencia : undefined,
  );
  const cambiarSinPausa = (v: boolean) => {
    setSinPausa(v);
    if (v && m.cortado) m.seguir();
  };
  const { registrarCuadro: registrarEnMiniatura } = p;
  const registrarCuadro = useCallback(
    (id: string, tomar: TomarCuadro | null) => {
      registrarEnMiniatura(id, tomar);
      onCuadro?.(id, tomar);
    },
    [registrarEnMiniatura, onCuadro],
  );
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
          {!minimizado && !acoplado && <div className="modal-backdrop" onClick={salir} aria-hidden />}
          <div
            ref={panel}
            role={minimizado ? undefined : acoplado ? "region" : "dialog"}
            aria-modal={minimizado || acoplado ? undefined : true}
            aria-labelledby={tituloId}
            aria-hidden={minimizado || undefined}
            inert={minimizado || undefined}
            tabIndex={-1}
            style={acople.lado ? { ...tokens, width: `${acople.ancho}vw` } : tokens}
            className={cn(
              PANEL,
              acople.lado ? AL_LADO[acople.lado] : AL_CENTRO,
              minimizado && "pointer-events-none opacity-0",
            )}
            data-mosaico-panel={minimizado ? "minimizado" : acoplado ? "acoplado" : "abierto"}
            data-capa-libre={acoplado || undefined}
          >
            <AsaAcople acople={acople} panel={panel} />
            <MosaicoNubeCabecera
              tituloId={tituloId}
              camaras={camaras.length}
              vigilancia={!soloMirar}
              detectar={detectar}
              onDetectar={setDetectar}
              verMovimiento={verMovimiento}
              onVerMovimiento={setVerMovimiento}
              sonido={aviso.sonido}
              onSonido={aviso.cambiarSonido}
              sinPausa={sinPausa}
              onSinPausa={cambiarSinPausa}
              carpetaHref={carpetaHref}
              onIrACarpeta={irACarpeta}
              onMinimizar={onMinimizar ? minimizar : undefined}
              onCerrar={onCerrar}
              acciones={<MenuAlLado acople={acople} />}
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

              <ul className={cn("grid gap-3", !acoplado && "md:grid-cols-2")}>
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
                    verMovimiento={verMovimiento}
                    onFotoPersona={p.onFoto}
                    onEstado={onEstado}
                    registrarCuadro={registrarCuadro}
                    onAparicion={aviso.avisar}
                    ampliable={!acoplado && camaras.length > 1}
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
