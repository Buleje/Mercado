"use client";

/**
 * La foto de personas en grande, con flechas (botones y teclado ← →) para
 * pasar a la anterior y la siguiente de la grilla. La imagen se pide al Drive
 * (`/raw`), que vuelve a chequear sesión y permisos de la carpeta.
 */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FolderOpen, ImageOff, Loader2, Users } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { enlaceAlDrive } from "@/components/admin/forestal/plan-documentos/plan-documentos-api";
import { MOTIVO_FOTO_PERSONA_LABEL } from "@/lib/camaras/personas";
import type { FotoPersonaGaleria } from "@/lib/camaras/personas-galeria";
import { cn } from "@/lib/utils";
import { navegarEnElPanel } from "./navegar-panel";
import { BTN, diaLegible } from "./camaras-ui";

interface Props {
  fotos: FotoPersonaGaleria[];
  indice: number;
  dia: string;
  onIndice: (i: number) => void;
  onCerrar: () => void;
}

const FLECHA =
  "absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-md)] transition hover:border-[var(--accent)] disabled:opacity-30";

const esCampo = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export default function VisorFotoPersona({ fotos, indice, dia, onIndice, onCerrar }: Props) {
  const foto = fotos[indice];
  const hayAnterior = indice > 0;
  const haySiguiente = indice < fotos.length - 1;
  const [estado, setEstado] = useState<{ id: string; ok: boolean } | null>(null);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || esCampo(e.target)) return;
      if (e.key === "ArrowLeft" && indice > 0) {
        e.preventDefault();
        onIndice(indice - 1);
      } else if (e.key === "ArrowRight" && indice < fotos.length - 1) {
        e.preventDefault();
        onIndice(indice + 1);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [indice, fotos.length, onIndice]);

  /* La siguiente ya bajando: pasar con la flecha no espera la descarga. */
  const siguienteId = haySiguiente ? fotos[indice + 1].id : null;
  useEffect(() => {
    if (!siguienteId) return;
    const img = new Image();
    img.src = `/api/admin/documents/${siguienteId}/raw`;
  }, [siguienteId]);

  if (!foto) return null;
  const cargada = estado?.id === foto.id ? estado : null;
  const motivo = foto.motivo ? MOTIVO_FOTO_PERSONA_LABEL[foto.motivo] : "Foto de personas";
  const detalle = [
    foto.camaraNombre,
    foto.personas !== null ? `${foto.personas} ${foto.personas === 1 ? "persona" : "personas"}` : null,
    foto.confianza !== null ? `${Math.round(foto.confianza * 100)} % de seguridad` : null,
    diaLegible(dia),
  ]
    .filter(Boolean)
    .join(" · ");
  /* La carpeta del día de ESA cámara, donde está la foto. */
  const hrefDrive = enlaceAlDrive(foto.carpetaId);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`${foto.hora} · ${motivo}`}
      description={detalle}
      icon={Users}
      variant="info"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm tabular-nums text-[var(--text-secondary)]">
            {indice + 1} de {fotos.length}
          </span>
          <a
            href={hrefDrive}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              onCerrar();
              navegarEnElPanel(hrefDrive);
            }}
            className={BTN}
          >
            <FolderOpen className="h-4 w-4" aria-hidden /> Abrir en el Drive
          </a>
          <a href={`/api/admin/documents/${foto.id}/raw?download=1`} className={BTN} download>
            <Download className="h-4 w-4" aria-hidden /> Descargar
          </a>
        </div>
      }
    >
      <div className={cn(MODAL_BODY, "relative")}>
        <div className="relative flex min-h-[16rem] items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
          {!cargada && (
            <Loader2 className="absolute h-6 w-6 animate-spin text-[var(--text-tertiary)]" aria-label="Cargando la foto" />
          )}
          {cargada && !cargada.ok ? (
            <p className="flex flex-col items-center gap-2 py-16 text-sm text-[var(--text-secondary)]">
              <ImageOff className="h-6 w-6" aria-hidden /> No se pudo abrir esta foto.
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- archivo privado del Drive, servido por nuestra API
            <img
              key={foto.id}
              src={`/api/admin/documents/${foto.id}/raw`}
              alt={`${motivo} en ${foto.camaraNombre} a las ${foto.hora}`}
              onLoad={() => setEstado({ id: foto.id, ok: true })}
              onError={() => setEstado({ id: foto.id, ok: false })}
              className={cn("max-h-[68vh] w-full object-contain", !cargada && "opacity-0")}
            />
          )}
          <button
            type="button"
            onClick={() => onIndice(indice - 1)}
            disabled={!hayAnterior}
            aria-label="Foto anterior (más nueva)"
            className={cn(FLECHA, "left-2")}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onIndice(indice + 1)}
            disabled={!haySiguiente}
            aria-label="Foto siguiente (más vieja)"
            className={cn(FLECHA, "right-2")}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
