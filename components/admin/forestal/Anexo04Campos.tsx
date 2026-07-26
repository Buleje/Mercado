"use client";

/**
 * Anexo04Campos — los datos que el emisor llena en el ANEXO N° 04: cabecera
 * (logo, razón social, N°, GTF), observaciones y el firmante (13)-(16).
 *
 * Dos ayudas pensadas para el aserradero, donde se emite guía tras guía:
 * el **correlativo** avanza solo desde el último usado, y los **emisores**
 * quedan guardados por tenant para elegirlos de una lista en vez de re-tipear
 * nombre, DNI y cargo cada vez.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ImageIcon, Trash2, UserPlus, X } from "@buleje/design-system/icons";
import {
  siguienteCorrelativo, type DatosAnexo04, type EmisorGuardado,
} from "@/lib/forestal/anexo04-serfor";
import { claveTenant } from "@/hooks/use-anexo04-datos";

const INPUT = "h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const LABEL = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const MINI = "inline-flex h-11 shrink-0 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]";

/** Lado máximo del logo guardado: entra nítido en la hoja sin inflar localStorage. */
const LOGO_MAX_PX = 320;
const LOGO_MAX_BYTES = 5_000_000;

/** Lee el archivo, lo reduce a `LOGO_MAX_PX` y devuelve dataURL + proporción. */
async function leerLogo(file: File): Promise<{ src: string; aspect: number }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("no se pudo leer el archivo"));
    fr.readAsDataURL(file);
  });
  const img = new window.Image();
  img.src = dataUrl;
  await img.decode();
  const escala = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  return { src: canvas.toDataURL("image/png"), aspect: img.width / img.height };
}

/** Botón-miniatura que sube/quita una de las imágenes de la hoja. */
function ImagenCampo({ src, label, alto = "h-11 w-14", onArchivo, onQuitar }: {
  src?: string; label: string; alto?: string;
  onArchivo: (f?: File) => void; onQuitar: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { onArchivo(e.target.files?.[0]); e.target.value = ""; }} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        title={src ? `Cambiar ${label.toLowerCase()}` : `Subir ${label.toLowerCase()}`}
        aria-label={`${src ? "Cambiar" : "Subir"} ${label.toLowerCase()}`}
        className={`flex ${alto} items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]`}
      >
        {src
          // eslint-disable-next-line @next/next/no-img-element -- dataURL local, no pasa por el optimizador
          ? <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
          : <ImageIcon className="h-5 w-5" />}
      </button>
      {src && (
        <button type="button" onClick={onQuitar} aria-label={`Quitar ${label.toLowerCase()}`} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function Anexo04Campos({
  datos, onChange, ficha, onError,
}: {
  datos: DatosAnexo04;
  onChange: (patch: Partial<DatosAnexo04>) => void;
  /** Identidad legal del CTP, para llenar la cabecera con lo registrado. */
  ficha?: { razonSocial?: string; representante?: string; representanteDni?: string } | null;
  onError?: (msg: string) => void;
}) {
  const [emisores, setEmisores] = useState<EmisorGuardado[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveTenant("emisores-"));
      if (raw) setEmisores(JSON.parse(raw) as EmisorGuardado[]);
    } catch { /* json corrupto → lista vacía */ }
  }, []);

  const persistirEmisores = (next: EmisorGuardado[]) => {
    setEmisores(next);
    try { localStorage.setItem(claveTenant("emisores-"), JSON.stringify(next)); } catch { /* quota */ }
  };

  /** Guarda (o actualiza por nombre) el firmante que está cargado ahora. */
  const guardarEmisor = () => {
    const nuevo: EmisorGuardado = { firmante: datos.firmante.trim(), documento: datos.documento.trim(), cargo: datos.cargo.trim() };
    if (!nuevo.firmante) { onError?.("Escribí el nombre del emisor antes de guardarlo."); return; }
    persistirEmisores([nuevo, ...emisores.filter((e) => e.firmante.toLowerCase() !== nuevo.firmante.toLowerCase())].slice(0, 8));
  };

  /** Sube logo, firma o sello: mismo camino (validar → reducir → guardar). */
  const subirImagen = async (file: File | undefined, campo: "logo" | "firma" | "sello", campoAspecto: "logoAspect" | "firmaAspect" | "selloAspect") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { onError?.("Tiene que ser una imagen."); return; }
    if (file.size > LOGO_MAX_BYTES) { onError?.("La imagen pesa demasiado (máx 5 MB)."); return; }
    try {
      const { src, aspect } = await leerLogo(file);
      onChange({ [campo]: src, [campoAspecto]: aspect } as Partial<DatosAnexo04>);
    } catch { onError?.("No se pudo leer la imagen."); }
  };

  return (
    <div className="space-y-2.5">
      {/* Logo + razón social */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>Logo y razón social del emisor</span>
          {ficha && (ficha.razonSocial || ficha.representante) && (
            <button
              type="button"
              onClick={() => onChange({
                ...(ficha.razonSocial ? { empresa: ficha.razonSocial } : {}),
                ...(ficha.representante ? { firmante: ficha.representante } : {}),
                ...(ficha.representanteDni ? { documento: ficha.representanteDni } : {}),
              })}
              title="Traer razón social, representante y DNI de la Ficha legal del CTP"
              className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:underline"
            >
              Traer de la ficha
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <ImagenCampo
            src={datos.logo}
            label="Logo"
            onArchivo={(f) => void subirImagen(f, "logo", "logoAspect")}
            onQuitar={() => onChange({ logo: undefined, logoAspect: undefined })}
          />
          <input value={datos.empresa} onChange={(e) => onChange({ empresa: e.target.value })} placeholder="Razón social" className={INPUT} />
        </div>
      </div>

      {/* (1) N° con correlativo automático + (2) GTF */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className={LABEL}>(1) N°</span>
          <div className="mt-1 flex gap-1.5">
            <input value={datos.numero} onChange={(e) => onChange({ numero: e.target.value })} placeholder="2-19-0461363" className={INPUT} />
            <button
              type="button"
              onClick={() => onChange({ numero: siguienteCorrelativo(datos.numero) })}
              disabled={!datos.numero}
              title="Siguiente correlativo (el N° avanza solo)"
              aria-label="Siguiente correlativo"
              className={`${MINI} w-10 justify-center px-0 disabled:opacity-40`}
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </label>
        <label className="block"><span className={LABEL}>(2) GTF N°</span>
          <input value={datos.gtf} onChange={(e) => onChange({ gtf: e.target.value })} placeholder="19-001-0000052" className={`mt-1 ${INPUT}`} />
        </label>
      </div>

      <label className="block"><span className={LABEL}>(12) Observaciones</span>
        <textarea value={datos.observaciones} onChange={(e) => onChange({ observaciones: e.target.value })} rows={2} placeholder="—" className="mt-1 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
      </label>

      {/* Firmante (13)-(16) + emisores guardados */}
      <label className="block"><span className={LABEL}>(14) Nombres y apellidos</span>
        <div className="mt-1 flex gap-1.5">
          <input value={datos.firmante} onChange={(e) => onChange({ firmante: e.target.value })} placeholder="Del emisor" className={INPUT} />
          <button type="button" onClick={guardarEmisor} title="Guardar este emisor para las próximas guías" className={MINI}>
            <UserPlus className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className={LABEL}>(15) Documento</span>
          <input value={datos.documento} onChange={(e) => onChange({ documento: e.target.value })} inputMode="numeric" placeholder="DNI" className={`mt-1 ${INPUT}`} />
        </label>
        <label className="block"><span className={LABEL}>(16) Cargo</span>
          <input value={datos.cargo} onChange={(e) => onChange({ cargo: e.target.value })} placeholder="Regente / Jefe de planta" className={`mt-1 ${INPUT}`} />
        </label>
      </div>

      {/* Firma escaneada y sello: se imprimen sobre la línea (13) */}
      <div>
        <span className={LABEL}>(13) Firma y sello escaneados</span>
        <div className="mt-1 flex items-center gap-2">
          <ImagenCampo
            src={datos.firma}
            label="Firma"
            alto="h-11 w-24"
            onArchivo={(f) => void subirImagen(f, "firma", "firmaAspect")}
            onQuitar={() => onChange({ firma: undefined, firmaAspect: undefined })}
          />
          <ImagenCampo
            src={datos.sello}
            label="Sello"
            onArchivo={(f) => void subirImagen(f, "sello", "selloAspect")}
            onQuitar={() => onChange({ sello: undefined, selloAspect: undefined })}
          />
          <span className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
            Salen impresos sobre la línea de firma. Mejor en PNG con fondo transparente.
          </span>
        </div>
      </div>

      {emisores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {emisores.map((e) => {
            const activo = e.firmante === datos.firmante && e.documento === datos.documento && e.cargo === datos.cargo;
            return (
              <span key={e.firmante} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[length:var(--ts-2xs)] font-bold transition ${activo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>
                <button type="button" onClick={() => onChange({ firmante: e.firmante, documento: e.documento, cargo: e.cargo })} title={`${e.cargo || "sin cargo"}${e.documento ? ` · ${e.documento}` : ""}`} className="max-w-[10rem] truncate">
                  {activo && <Check className="mr-1 inline h-3 w-3" />}{e.firmante}
                </button>
                <button type="button" onClick={() => persistirEmisores(emisores.filter((x) => x.firmante !== e.firmante))} aria-label={`Quitar ${e.firmante}`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Cómo se arma la hoja */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <label className="block"><span className={LABEL}>Columna (10) V</span>
          <select value={datos.unidadV} onChange={(e) => onChange({ unidadV: e.target.value as DatosAnexo04["unidadV"] })} className={`mt-1 ${INPUT}`}>
            <option value="pt">Pie tablar</option>
            <option value="m3">m³</option>
          </select>
        </label>
        <label className="block"><span className={LABEL}>Filas por bloque</span>
          <select value={datos.modo} onChange={(e) => onChange({ modo: e.target.value as DatosAnexo04["modo"] })} className={`mt-1 ${INPUT}`}>
            <option value="oficial">35 (oficial)</option>
            <option value="compacto">Solo las usadas</option>
          </select>
        </label>
      </div>
      <p className="text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">
        Un bloque por especie + tipo de producto, sin mezclarse. Si una combinación pasa de 35 piezas, sigue en el bloque siguiente.
      </p>
    </div>
  );
}
