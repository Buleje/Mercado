"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, FolderOpen, Image as ImageIcon } from "@buleje/design-system/icons";
import { SelectorDrive } from "./SelectorDrive";

type Sub = "menu" | "camara" | "drive";

/**
 * Elegir de dónde vienen las páginas: cámara (varias fotos), subir archivos
 * (varios) o importar imágenes del Archivo. Se puede volver para sumar más.
 */
export function PasoFuentes({ onAgregar, onVolver }: { onAgregar: (b: Blob[]) => void; onVolver: (() => void) | null }) {
  const [sub, setSub] = useState<Sub>("menu");
  const [camState, setCamState] = useState<"idle" | "on" | "denied" | "unsupported">("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => () => stop(), [stop]);

  const startCamera = useCallback(async () => {
    setSub("camara");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setCamState("on");
    } catch {
      setCamState("denied");
    }
  }, []);

  // El <video> sólo se monta cuando camState === "on". Antes se le asignaba el
  // stream dentro de startCamera, con el ref aún en null, y la cámara salía en
  // negro; se le pega recién cuando el elemento ya existe.
  useEffect(() => {
    const v = videoRef.current;
    if (camState === "on" && v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch((err) => console.warn("[escaner] video play", err));
    }
  }, [camState]);

  const capturar = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((b) => b && onAgregar([b]), "image/jpeg", 0.92);
  };

  const Boton = ({ icon: Icon, children, onClick }: { icon: typeof Camera; children: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
    >
      <Icon className="h-7 w-7 text-[var(--accent)]" />
      <span className="text-sm font-semibold text-[var(--text-primary)]">{children}</span>
    </button>
  );

  if (sub === "drive") {
    return (
      <SelectorDrive
        onVolver={() => setSub("menu")}
        onElegir={(blobs) => {
          onAgregar(blobs);
          setSub("menu");
        }}
      />
    );
  }

  if (sub === "camara") {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            stop();
            setCamState("idle");
            setSub("menu");
          }}
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        {camState === "on" ? (
          <>
            <div className="overflow-hidden rounded-xl bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="max-h-[48vh] w-full object-contain" playsInline muted />
            </div>
            <button
              type="button"
              onClick={capturar}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-600)]"
            >
              <Camera className="h-4 w-4" /> Capturar página
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center">
            <Camera className="h-8 w-8 text-[var(--text-tertiary)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              {camState === "denied"
                ? "No pudimos acceder a la cámara. Sube fotos o elige del Archivo."
                : "Este dispositivo no expone cámara al navegador. Sube fotos."}
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)]"
            >
              <ImageIcon className="h-4 w-4" /> Subir fotos
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
            if (fs.length) onAgregar(fs);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {onVolver && (
        <button
          type="button"
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a las páginas
        </button>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Boton icon={Camera} onClick={startCamera}>
          Cámara
        </Boton>
        <Boton icon={ImageIcon} onClick={() => fileRef.current?.click()}>
          Subir archivos
        </Boton>
        <Boton icon={FolderOpen} onClick={() => setSub("drive")}>
          Elegir de mis documentos
        </Boton>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (fs.length) onAgregar(fs);
          e.target.value = "";
        }}
      />
    </div>
  );
}
