"use client";

/**
 * Cámaras › Espejo del celular (24-10, pedido de Brandon: «vincular mi celular
 * con admin para ver duplicada mi pantalla en una página»).
 *
 * El celular se duplica en la PC con scrcpy (cable USB o Wi-Fi) y esta página,
 * abierta en esa PC, captura la ventana «Celular de Brandon» con
 * `getDisplayMedia`. El video no pasa por el servidor: sólo «Guardar la foto en
 * el Archivo» sube algo, y «Que también lo vean otros equipos» manda un cuadro
 * reducido cada 1,5 s que el servidor tiene 10 s (`CompartirEspejo`). En un
 * equipo que no espeja (tablet, otra PC) se ve ese cuadro (`VisorEspejoRemoto`).
 * El stream vive en `hooks/use-espejo-celular.ts`.
 */

import { useRef, useState } from "react";
import { CardTitle, cn } from "@buleje/design-system";
import { Camera, Loader2, Maximize2, MoreHorizontal, RefreshCw, Smartphone, Square, Upload } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useEspejoCelular, type EstadoEspejo } from "@/hooks/use-espejo-celular";
import { useCompartirEspejo } from "@/hooks/use-compartir-espejo";
import { useVisorEspejo } from "@/hooks/use-visor-espejo";
import { nombreFotoEspejo, TITULO_VENTANA_ESPEJO } from "@/lib/camaras/espejo-celular";
import { logger } from "@/lib/logger";
import CompartirEspejo from "./CompartirEspejo";
import GuiaEspejo from "./GuiaEspejo";
import VisorEspejoRemoto from "./VisorEspejoRemoto";

type Aviso = { tono: "ok" | "error"; texto: string } | null;

/** La línea de estado de arriba: qué pasa ahora, en palabras. */
function textoEstado(estado: EstadoEspejo, fps: number | null): { texto: string; tono: "ok" | "aviso" | "neutro" } {
  if (estado === "mostrando") {
    if (fps === null) return { texto: "Mostrando…", tono: "ok" };
    return fps >= 1
      ? { texto: `Mostrando · ${fps} cuadros/s`, tono: "ok" }
      : { texto: "Mostrando · la pantalla del celular no cambia", tono: "ok" };
  }
  if (estado === "pidiendo") return { texto: `Elige la ventana «${TITULO_VENTANA_ESPEJO}»…`, tono: "neutro" };
  if (estado === "cortado") return { texto: "Se cortó: vuelve a elegir la ventana", tono: "aviso" };
  return { texto: "Sin mostrar", tono: "neutro" };
}

const SUPERFICIE: Record<string, string> = { monitor: "la pantalla entera", browser: "una pestaña" };

function bajarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function EspejoCelular() {
  const e = useEspejoCelular();
  const marcoRef = useRef<HTMLDivElement | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [guardando, setGuardando] = useState(false);
  const mostrando = e.estado === "mostrando";
  const compartir = useCompartirEspejo(e.videoRef, mostrando);
  /* Este equipo no espeja: mira el de otra PC (en una tablet, siempre). */
  const mirando = !mostrando && e.estado !== "pidiendo";
  const visor = useVisorEspejo(mirando);
  const estado = textoEstado(e.estado, e.fps);
  const otraSuperficie = mostrando && e.superficie ? SUPERFICIE[e.superficie] : undefined;

  const pantallaCompleta = () => {
    const marco = marcoRef.current;
    if (!marco) return;
    if (document.fullscreenElement === marco) void document.exitFullscreen?.();
    else void marco.requestFullscreen?.();
  };

  const tomarFoto = async () => {
    const blob = await e.foto();
    if (!blob) return setAviso({ tono: "error", texto: "Todavía no llegó ningún cuadro del celular." });
    bajarBlob(blob, nombreFotoEspejo(new Date()));
    setAviso({ tono: "ok", texto: "Foto bajada a tu carpeta de descargas." });
  };

  const guardarEnArchivo = async () => {
    const blob = await e.foto();
    if (!blob) return setAviso({ tono: "error", texto: "Todavía no llegó ningún cuadro del celular." });
    setGuardando(true);
    setAviso(null);
    try {
      // Import al vuelo: el drive entero no tiene por qué viajar con esta vista.
      const { subirArchivosAlDrive } = await import("@/hooks/use-documents");
      let motivo: string | undefined;
      const archivo = new File([blob], nombreFotoEspejo(new Date()), { type: "image/png" });
      const docs = await subirArchivosAlDrive([archivo], {
        onEstado: (_f, est, m) => {
          if (est === "error") motivo = m;
        },
      });
      setAviso(
        docs.length
          ? { tono: "ok", texto: "Foto guardada en el Archivo, en la carpeta principal." }
          : { tono: "error", texto: motivo ?? "No se pudo guardar en el Archivo." },
      );
    } catch (err) {
      logger.warn("[espejo-celular] no se guardó la foto en el Archivo", { error: String(err) });
      setAviso({ tono: "error", texto: "No se pudo guardar en el Archivo. Vuelve a intentarlo." });
    } finally {
      setGuardando(false);
    }
  };

  const error = e.error && !mostrando ? e.error : null;

  return (
    <div className="@container" data-vista="espejo" data-estado={e.estado} data-fps={e.fps ?? ""}>
      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_20rem] @3xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-labelledby="espejo-titulo"
            className="min-w-0 space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <div className="flex items-center gap-1.5">
                <CardTitle id="espejo-titulo">Tu celular en vivo</CardTitle>
                <InfoTip
                  title="Espejo del celular"
                  side="bottom"
                  what={`Lo que muestra la ventana «${TITULO_VENTANA_ESPEJO}» de esta PC, en vivo. No se guarda: sólo la foto que guardes en el Archivo. Al servidor llega sólo si prendes «Que también lo vean otros equipos».`}
                  affects="Si cierras scrcpy o te vas de esta vista, se corta: vuelve a tocar «Mostrar mi celular aquí»."
                  example="Con el celular quieto bajan los cuadros por segundo: scrcpy sólo manda lo que cambia."
                />
              </div>
              <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" data-testid="espejo-estado">
                <span
                  aria-hidden
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    estado.tono === "ok" && "bg-[var(--data-success-500)]",
                    estado.tono === "aviso" && "bg-[var(--data-warning-500)]",
                    estado.tono === "neutro" && "bg-[var(--rule-strong)]",
                  )}
                />
                {estado.texto}
              </p>
            </div>

            <div
              ref={marcoRef}
              className="relative flex min-h-[24rem] items-center justify-center overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2 [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:p-0 [&:fullscreen_video]:h-full [&:fullscreen_video]:max-h-full"
            >
              <video
                ref={e.videoRef}
                muted
                playsInline
                autoPlay
                aria-label="La pantalla del celular, en vivo"
                data-testid="espejo-video"
                className={cn("max-h-[max(20rem,calc(100dvh-21rem))] w-auto max-w-full rounded-md object-contain", !mostrando && "hidden")}
              />
              {!mostrando && (
                <div className="flex max-w-sm flex-col items-center gap-3 px-4 py-8 text-center">
                  <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
                    <Smartphone className="h-8 w-8" />
                  </span>
                  {e.soporte === false ? (
                    <p className="text-sm text-[var(--text-secondary)]" data-testid="espejo-sin-soporte">
                      {typeof window !== "undefined" && window.isSecureContext === false
                        ? "Abre el panel con https o en localhost: sin candado el navegador no deja mostrar ventanas."
                        : "Esto se abre desde la PC donde conectas el celular: en el celular el navegador no puede mostrar su propia pantalla."}
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void e.mostrar()}
                        disabled={e.soporte !== true || e.estado === "pidiendo"}
                        className={button({ size: "xl", className: "gap-2" })}
                      >
                        {e.estado === "pidiendo" ? (
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        ) : e.estado === "cortado" ? (
                          <RefreshCw className="h-5 w-5" aria-hidden />
                        ) : (
                          <Smartphone className="h-5 w-5" aria-hidden />
                        )}
                        {e.estado === "cortado" ? "Elegir otra vez" : "Mostrar mi celular aquí"}
                      </button>
                      <p className="text-sm text-[var(--text-tertiary)]">
                        Con scrcpy abierto, elige la ventana «{TITULO_VENTANA_ESPEJO}».
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {mostrando && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={pantallaCompleta} className={button({ variant: "secondary", className: "gap-1.5" })}>
                  <Maximize2 className="h-4 w-4" aria-hidden /> Pantalla completa
                </button>
                <button type="button" onClick={() => void tomarFoto()} className={button({ variant: "secondary", className: "gap-1.5" })}>
                  <Camera className="h-4 w-4" aria-hidden /> Tomar foto
                </button>
                <button type="button" onClick={e.detener} className={button({ variant: "secondary", className: "gap-1.5" })}>
                  <Square className="h-4 w-4" aria-hidden /> Detener
                </button>
                <ActionMenu
                  label="Más del espejo"
                  icon={MoreHorizontal}
                  soloIcono
                  size="md"
                  className="w-12 shrink-0"
                  title="Guardar la foto en el Archivo y elegir otra ventana"
                  actions={[
                    {
                      id: "archivo",
                      label: guardando ? "Guardando en el Archivo…" : "Guardar la foto en el Archivo",
                      hint: "La foto de lo que se ve ahora, en la carpeta principal",
                      icon: Upload,
                      disabled: guardando,
                      onSelect: () => void guardarEnArchivo(),
                    },
                    {
                      id: "otra",
                      label: "Elegir otra ventana",
                      hint: "Si elegiste mal o abriste scrcpy de nuevo",
                      icon: RefreshCw,
                      onSelect: () => void e.mostrar(),
                    },
                  ]}
                />
              </div>
            )}

            {mostrando && <CompartirEspejo c={compartir} />}

            {otraSuperficie && (
              <p className="text-sm text-[var(--data-warning-ink)]" data-testid="espejo-superficie">
                Elegiste {otraSuperficie}: para ver sólo el celular, en «⋯» toca «Elegir otra ventana» y marca «{TITULO_VENTANA_ESPEJO}».
              </p>
            )}
            {(error || aviso) && (
              <p
                role={error || aviso?.tono === "error" ? "alert" : "status"}
                className={cn(
                  "text-sm",
                  error || aviso?.tono === "error" ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]",
                )}
                data-testid="espejo-aviso"
              >
                {error ?? aviso?.texto}
              </p>
            )}
          </section>
          {/* Con cuadro llegando va primero: en la tablet es lo único que sirve. */}
          {mirando && <VisorEspejoRemoto v={visor} className={visor.hayCuadro ? "order-first" : undefined} />}
        </div>

        <GuiaEspejo />
      </div>
    </div>
  );
}
