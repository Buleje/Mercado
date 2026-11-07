"use client";

/**
 * Elegir una imagen del Archivo como ícono de una carpeta (como «Cambiar
 * icono» de Windows, pero con una foto: la carpeta de un cliente con su
 * logo, la del camión con su foto). Se guarda en `folder.icon` como
 * `doc:<id>`; la imagen sigue siendo un archivo normal del Archivo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ImageOff, Search, Upload } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { esImagenConvertible, esImagenRenderizable } from "@/lib/documents/tipos-archivo";
import { docDeIconoCarpeta } from "../folder-visuals";

interface Props {
  carpeta: DbDocumentFolder;
  onElegir: (docId: string) => Promise<void>;
  onQuitar: () => Promise<void>;
  /** Sube la imagen a esta carpeta y devuelve el archivo creado. */
  onSubir: (file: File) => Promise<DbDocument | undefined>;
  onClose: () => void;
}

const POR_TANDA = 48;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esImagen = (d: DbDocument) => esImagenRenderizable(d.name, d.mimeType) || esImagenConvertible(d.name, d.mimeType);

function Miniatura({ doc, elegida, onElegir, onUsar }: { doc: DbDocument; elegida: boolean; onElegir: () => void; onUsar: () => void }) {
  const [fallo, setFallo] = useState(false);
  return (
    <button
      type="button"
      onClick={onElegir}
      onDoubleClick={onUsar}
      aria-pressed={elegida}
      title={doc.name}
      className={cn(
        "group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 bg-[var(--surface-sunken)] transition-colors",
        elegida ? "border-primary ring-2 ring-primary" : "border-[var(--rule-soft)] hover:border-primary/50",
      )}
    >
      {fallo ? (
        <ImageOff className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlMiniatura(doc.id)} alt={doc.name} loading="lazy" onError={() => setFallo(true)} className="h-full w-full object-cover" />
      )}
      {elegida && (
        <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
          <Check className="h-4 w-4" aria-hidden />
        </span>
      )}
    </button>
  );
}

function Grupo({ titulo, docs, elegido, onElegir, onUsar }: { titulo: string; docs: DbDocument[]; elegido: string | null; onElegir: (id: string) => void; onUsar: (id: string) => void }) {
  const [visibles, setVisibles] = useState(POR_TANDA);
  if (docs.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {titulo} <span className="tabular-nums">({docs.length})</span>
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {docs.slice(0, visibles).map((d) => (
          <Miniatura key={d.id} doc={d} elegida={elegido === d.id} onElegir={() => onElegir(d.id)} onUsar={() => onUsar(d.id)} />
        ))}
      </div>
      {docs.length > visibles && (
        <button type="button" onClick={() => setVisibles((n) => n + POR_TANDA)} className={button({ variant: "secondary" })}>
          Ver más ({docs.length - visibles})
        </button>
      )}
    </section>
  );
}

export default function ElegirImagenCarpeta({ carpeta, onElegir, onQuitar, onSubir, onClose }: Props) {
  const actual = docDeIconoCarpeta(carpeta.icon);
  const [imagenes, setImagenes] = useState<DbDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(actual);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/documents", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { documents?: DbDocument[] };
      setImagenes((data.documents ?? []).filter(esImagen));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const { deAca, delResto } = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    const lista = (imagenes ?? []).filter((d) => !q || sinTildes(d.name).includes(q));
    return {
      deAca: lista.filter((d) => d.folderId === carpeta.id),
      delResto: lista.filter((d) => d.folderId !== carpeta.id),
    };
  }, [imagenes, busqueda, carpeta.id]);

  const correr = async (fn: () => Promise<void>) => {
    if (guardando) return;
    setGuardando(true);
    try {
      await fn();
      onClose();
    } finally {
      setGuardando(false);
    }
  };
  const usar = (id: string | null) => { if (id) void correr(() => onElegir(id)); };

  const subir = async (file: File | undefined) => {
    if (!file || guardando) return;
    setGuardando(true);
    try {
      const doc = await onSubir(file);
      if (doc) {
        await onElegir(doc.id);
        onClose();
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Imagen de ícono · ${carpeta.name}`}
      size="lg"
      claveVentana="carpeta-imagen"
      footer={
        <ModalFooter>
          {actual && (
            <button type="button" onClick={() => void correr(onQuitar)} disabled={guardando} className={cn(button({ variant: "secondary" }), "mr-auto")}>
              <ImageOff className="h-4 w-4" aria-hidden /> Quitar imagen
            </button>
          )}
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cancelar</button>
          <button
            type="button"
            onClick={() => usar(elegido)}
            disabled={guardando || !elegido || elegido === actual}
            className={button({ variant: "primary" })}
          >
            <Check className="h-4 w-4" aria-hidden /> Usar de ícono
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-4", MODAL_BODY)}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar imagen por nombre</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar imagen…"
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
            />
          </label>
          <button type="button" onClick={() => archivoRef.current?.click()} disabled={guardando} className={button({ variant: "secondary" })}>
            <Upload className="h-4 w-4" aria-hidden /> Subir una imagen
          </button>
          <input
            ref={archivoRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => { void subir(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>

        {error ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 p-3 text-sm text-[var(--text-primary)]">
            No pude traer las imágenes ({error}).
            <button type="button" onClick={() => void cargar()} className={button({ variant: "secondary" })}>Reintentar</button>
          </div>
        ) : imagenes === null ? (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--text-tertiary)]">
            <LoadingSpinner size={32} /> Trayendo las imágenes del Archivo…
          </div>
        ) : deAca.length + delResto.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
            {busqueda ? "Ninguna imagen con ese nombre." : "Todavía no hay imágenes en el Archivo: sube una."}
          </p>
        ) : (
          <>
            <Grupo titulo="De esta carpeta" docs={deAca} elegido={elegido} onElegir={setElegido} onUsar={usar} />
            <Grupo titulo="Del resto del Archivo" docs={delResto} elegido={elegido} onElegir={setElegido} onUsar={usar} />
          </>
        )}
        {guardando && <p className="text-sm text-[var(--text-tertiary)]">Guardando…</p>}
      </div>
    </AdminModal>
  );
}
