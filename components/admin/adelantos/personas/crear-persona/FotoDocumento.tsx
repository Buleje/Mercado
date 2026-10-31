"use client";

/**
 * Foto del DNI: tomarla con la cámara (la misma del comprobante) o subirla, con
 * su miniatura. No sube nada todavía: se manda DESPUÉS de guardar la persona,
 * a su ruta privada (dato personal, Ley 29733). Al editar, la que ya tenía se
 * ve, se abre en grande o se quita (se borra recién al guardar).
 *
 * 30-10: quien no edita adelantos (el analista) ve que HAY foto pero el GET de
 * la imagen le da 403 a propósito (Ley 29733): en vez de una miniatura rota ve
 * un recuadro con candado, y la imagen no se pide (tampoco mientras el rol carga).
 */
import { useRef, useState, type ReactNode } from "react";
import { Camera, ExternalLink, ImageIcon, Lock, Trash2, Upload } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import CapturaFoto from "../../CapturaFoto";
import { usePuedeEditarAdelantos } from "../../hooks/use-puede-editar-adelantos";
import { MAX_FOTO_BYTES, TIPOS_FOTO, blobDeDataUrl, urlFotoDocumento, type FotoElegida } from "./acciones";
import { PIE, PIE_AVISO, PIE_AYUDA, ROTULO } from "./clases";

const ICONO = button({ variant: "ghost", size: "icon" });

function Miniatura({ src }: { src: string | null }) {
  const [rota, setRota] = useState(false);
  return (
    <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
      {src && !rota ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL o ruta privada con sesión: next/image no sirve
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setRota(true)} />
      ) : (
        <ImageIcon className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
      )}
    </span>
  );
}

export default function FotoDocumento({
  personaId,
  tieneGuardada,
  foto,
  onFoto,
  quitarGuardada,
  onQuitarGuardada,
}: {
  personaId?: string;
  /** La persona ya tiene una foto en el servidor. */
  tieneGuardada: boolean;
  foto: FotoElegida | null;
  onFoto: (f: FotoElegida | null) => void;
  quitarGuardada: boolean;
  onQuitarGuardada: (v: boolean) => void;
}) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardada = tieneGuardada && !quitarGuardada && !!personaId;
  /* `null` = el rol todavía no llegó: no se pide la imagen hasta saberlo. */
  const puedeVer = usePuedeEditarAdelantos();

  const elegirArchivo = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_FOTO_BYTES) return setError("Esa foto pesa más de 8 MB. Toma otra o redúcela.");
    if (!f.type.startsWith("image/") && !/\.hei[cf]$/i.test(f.name)) return setError("Tiene que ser una foto (JPG, PNG o HEIC).");
    const lector = new FileReader();
    lector.onload = () => onFoto({ blob: f, nombre: f.name, vista: typeof lector.result === "string" ? lector.result : null });
    lector.onerror = () => onFoto({ blob: f, nombre: f.name, vista: null });
    lector.readAsDataURL(f);
  };

  let fila: ReactNode;
  if (!foto && guardada && puedeVer === false) {
    fila = (
      <div
        className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-[var(--rule-strong)] bg-[var(--surface-sunken)] px-3 py-2"
        data-foto-bloqueada
      >
        <Lock className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--text-secondary)]">Solo quien edita adelantos ve la foto</span>
      </div>
    );
  } else if (foto || guardada) {
    fila = (
      <div className="flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-1 dark:bg-[var(--surface-sunken)]">
        <Miniatura src={foto ? foto.vista : personaId && puedeVer ? urlFotoDocumento(personaId) : null} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">
          {foto ? "Foto nueva" : "Foto guardada"}
        </span>
        {guardada && !foto && personaId && puedeVer && (
          <a href={urlFotoDocumento(personaId)} target="_blank" rel="noopener noreferrer" className={ICONO} aria-label="Ver la foto del DNI" title="Ver en grande">
            <ExternalLink className="h-5 w-5" aria-hidden />
          </a>
        )}
        <button
          type="button"
          className={cn(ICONO, "text-[var(--text-secondary)]")}
          aria-label="Quitar la foto del DNI"
          title="Quitar"
          onClick={() => (foto ? onFoto(null) : onQuitarGuardada(true))}
        >
          <Trash2 className="h-5 w-5" aria-hidden />
        </button>
      </div>
    );
  } else {
    fila = (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button({ variant: "secondary", className: "px-3" })} onClick={() => setCamara(true)}>
          <Camera className="h-4 w-4" aria-hidden /> Tomar
        </button>
        <button type="button" className={button({ variant: "secondary", className: "px-3" })} onClick={() => archivoRef.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden /> Subir
        </button>
      </div>
    );
  }

  return (
    <div role="group" aria-label="Foto del DNI">
      <span className={ROTULO}>Foto del DNI</span>
      {fila}
      <input
        ref={archivoRef}
        type="file"
        accept={TIPOS_FOTO}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          elegirArchivo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? (
        <span className={cn(PIE, PIE_AVISO)} role="alert">{error}</span>
      ) : quitarGuardada && tieneGuardada && !foto ? (
        <span className={cn(PIE, PIE_AYUDA)}>
          Se quita al guardar.
          <button type="button" className={button({ variant: "link", className: "h-auto min-h-11 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]" })} onClick={() => onQuitarGuardada(false)}>
            Deshacer
          </button>
        </span>
      ) : (
        <span className={cn(PIE, PIE_AYUDA)}>Privada: sólo la ve quien maneja adelantos.</span>
      )}
      {camara && (
        <CapturaFoto
          titulo="Foto del DNI"
          onCerrar={() => setCamara(false)}
          onFoto={(jpeg) => onFoto({ blob: blobDeDataUrl(jpeg), nombre: "dni.jpg", vista: jpeg })}
        />
      )}
    </div>
  );
}
