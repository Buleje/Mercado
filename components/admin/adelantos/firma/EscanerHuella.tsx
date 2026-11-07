"use client";

/**
 * «Escanear con la cámara» (23-10): la yema del dedo dentro del marco, con la
 * linterna si el teléfono la tiene; se toma sola cuando sale nítida y quieta
 * (o con «Tomar ahora»). Se ve realzada como huella (gris + contraste local)
 * y se puede guardar la realzada o la original.
 *
 * Sin cámara (una PC, permiso negado) ofrece elegir una foto: pasa por el
 * mismo realce. Es la imagen de la huella como prueba del recibo: no se
 * compara con RENIEC ni con otra huella.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Flashlight, RotateCcw, ScanLine } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { cajaGuia, NITIDEZ_BUENA } from "@/lib/adelantos/huella-imagen";
import { logger } from "@/lib/logger";
import { procesarHuella, useCamaraHuella, type HuellaTomada } from "./use-camara-huella";

const SECUNDARIO = button({ variant: "secondary", className: "rounded-xl" });
const PRIMARIO = button({ variant: "primary", className: "rounded-xl" });

type Vista = "realzada" | "original";

/** El marco en % del cuadro: el mismo `cajaGuia` que recorta, así el dibujo cae donde se corta. */
function marcoEnPorcentaje(relacion: number) {
  const c = cajaGuia(1000 * relacion, 1000);
  const w = 1000 * relacion;
  return { left: `${(c.x / w) * 100}%`, top: `${(c.y / 1000) * 100}%`, width: `${(c.ancho / w) * 100}%`, height: `${(c.alto / 1000) * 100}%` };
}

export default function EscanerHuella({ onCambio, deshabilitado = false }: { onCambio: (huella: Blob | null) => void; deshabilitado?: boolean }) {
  const [tomada, setTomada] = useState<HuellaTomada | null>(null);
  const [vista, setVista] = useState<Vista>("realzada");
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const cam = useCamaraHuella({ activa: !tomada, auto, onTomada: setTomada });

  const elegida = tomada ? (vista === "realzada" ? tomada.realzada : tomada.original) : null;
  useEffect(() => {
    onCambio(elegida);
    if (!elegida) return setSrc(null);
    const url = URL.createObjectURL(elegida);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [elegida, onCambio]);

  const desdeArchivo = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const bmp = await createImageBitmap(f);
      setTomada(await procesarHuella(bmp, { x: 0, y: 0, ancho: bmp.width, alto: bmp.height }));
      bmp.close();
    } catch (e) {
      logger.warn("[huella] no se pudo leer la foto elegida", { error: String(e) });
      setError("No pude leer esa foto: elige otra o tómala de nuevo.");
    } finally {
      if (archivo.current) archivo.current.value = "";
    }
  };

  if (tomada && src) {
    return (
      <div className="space-y-3" data-huella-tomada>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob local recién tomado */}
        <img src={src} alt={`Huella ${vista}`} className="mx-auto h-64 w-48 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] object-contain" />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <SegmentedControl<Vista>
            value={vista}
            onChange={setVista}
            size="lg"
            label="Qué imagen guardar"
            options={[
              { value: "realzada", label: "Realzada", title: "Gris con las crestas resaltadas" },
              { value: "original", label: "Original", title: "La foto tal cual salió" },
            ]}
          />
          <button type="button" onClick={() => setTomada(null)} disabled={deshabilitado} className={SECUNDARIO} data-huella-otra>
            <RotateCcw className="h-4 w-4" aria-hidden /> Tomar otra
          </button>
        </div>
      </div>
    );
  }

  const sinCamara = cam.estado === "sin-camara" || cam.estado === "denegada" || cam.estado === "bloqueada";
  const nitida = cam.medida >= NITIDEZ_BUENA;
  return (
    <div className="space-y-3" data-escaner-huella={cam.estado}>
      <input ref={archivo} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden onChange={(e) => void desdeArchivo(e.target.files?.[0])} data-huella-archivo />
      {sinCamara ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-[var(--rule-base)] p-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            {cam.estado === "bloqueada"
              ? "La cámara en vivo todavía no está habilitada en el panel."
              : cam.estado === "denegada"
                ? "El navegador no dio permiso para la cámara."
                : "No hay cámara disponible aquí."}{" "}
            Toma la foto de la yema con la cámara del celular: pasa por el mismo realce.
          </p>
          <button type="button" onClick={() => archivo.current?.click()} disabled={deshabilitado} className={PRIMARIO} data-huella-elegir>
            <Camera className="h-4 w-4" aria-hidden /> Tomar foto de la huella
          </button>
        </div>
      ) : (
        <>
          <div
            className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--surface-sunken)]"
            style={{ aspectRatio: cam.relacion ?? 3 / 4 }}
          >
            <video ref={cam.videoRef} muted playsInline className="h-full w-full object-contain" aria-label="Vista de la cámara" />
            {cam.relacion && (
              <div
                aria-hidden
                className={`pointer-events-none absolute rounded-[45%] border-4 border-dashed transition-colors ${nitida ? "border-[var(--data-success)]" : "border-[var(--accent)]"}`}
                style={marcoEnPorcentaje(cam.relacion)}
              />
            )}
          </div>
          <div className="mx-auto max-w-sm space-y-1" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="meter" aria-label="Nitidez" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((cam.medida / NITIDEZ_BUENA) * 100))}>
              <div className={`h-full rounded-full ${nitida ? "bg-[var(--data-success)]" : "bg-[var(--accent)]"}`} style={{ width: `${Math.min(100, (cam.medida / NITIDEZ_BUENA) * 100)}%` }} />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {cam.estado === "pidiendo" ? "Abriendo la cámara…" : cam.tomando ? "Tomando…" : nitida ? "Nítida: quédate quieto." : "Pon la yema del dedo dentro del marco, a unos 5 cm, con buena luz."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => void cam.tomar()} disabled={deshabilitado || cam.estado !== "viva" || cam.tomando} className={PRIMARIO} data-huella-tomar>
              <ScanLine className="h-4 w-4" aria-hidden /> Tomar ahora
            </button>
            {cam.hayLinterna && (
              <button type="button" onClick={() => void cam.alternarLinterna()} aria-pressed={cam.linterna} className={SECUNDARIO}>
                <Flashlight className="h-4 w-4" aria-hidden /> {cam.linterna ? "Apagar linterna" : "Linterna"}
              </button>
            )}
            <button type="button" onClick={() => setAuto(!auto)} aria-pressed={auto} className={SECUNDARIO} title="Cuando la yema sale nítida y quieta, la toma sola">
              {auto ? "Se toma sola" : "Sólo con el botón"}
            </button>
            <button type="button" onClick={() => archivo.current?.click()} disabled={deshabilitado} className={SECUNDARIO}>
              <Camera className="h-4 w-4" aria-hidden /> Elegir foto
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-[var(--data-error)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
