"use client";

/**
 * PlantacionDocumentoModal — el Formato N°01 del RNPF, en grande, para
 * ver/imprimir/descargar/guardar antes de presentarlo. Hermano simplificado
 * de `TramiteDocumentoModal` (mismo fit-to-width + hoja blanca fija) pero de
 * SÓLO LECTURA: acá no hay editor, el papel ya salió de `PlantacionPasoRevision`.
 *
 * El PDF real (para "Descargar" y "Guardar en el Drive") reusa el mismo
 * camino que ya usa `TramiteFormulario` para sus propios documentos: un
 * iframe offscreen (`TramiteArchivadorOffscreen`, genérico — no depende de
 * nada específico de "trámites") + `tramiteDocumentoAPdf` (fotografía el
 * `<body>` y lo pagina a A4; no exige la grilla `.doc-hoja` del sistema de
 * guías GTF, que es más pesado de lo que hace falta acá).
 */
import { useEffect, useRef, useState } from "react";
import { Download, FileText, Printer, Save, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { archivarEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import { buildPlantacionHtml, imprimirPlantacion, PLANTACION_PREVIEW_CSS } from "@/lib/forestal/plantacion-print";
import { nombreTitular, type PlantacionInput } from "@/lib/forestal/plantacion-tramite";
import { nombreArchivoTramite, tramiteDocumentoAPdf } from "@/lib/forestal/tramites-documento-pdf";
import TramiteArchivadorOffscreen, { type TramiteArchivadorHandle } from "./TramiteArchivadorOffscreen";

/** Mismo ancho "de papel" que `TramiteDocumentoModal` — el CSS de impresión ya limita el contenido a 900px. */
const ANCHO_PAPEL = 1000;
const ESCALA_MIN = 0.42;
/** Carpeta del Drive donde vive el expediente del RNPF. */
const CARPETA = "Plantaciones forestales (RNPF)";

export default function PlantacionDocumentoModal({
  open,
  onClose,
  datos,
  codigoInterno,
}: {
  open: boolean;
  onClose: () => void;
  datos: PlantacionInput;
  codigoInterno: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const archivadorRef = useRef<TramiteArchivadorHandle>(null);
  const [altoNatural, setAltoNatural] = useState<number | null>(null);
  const [escala, setEscala] = useState(1);
  const [descargando, setDescargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const html = open
    ? `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>${PLANTACION_PREVIEW_CSS}
  html{background:#fff}
  body{background:#fff;margin:0;padding:40px 46px;border-radius:0}
</style></head><body>${buildPlantacionHtml({ datos, codigoInterno })}</body></html>`
    : "";

  // Fit-to-width: usa TODO el ancho disponible, nunca agranda (máx 1×).
  useEffect(() => {
    const calcular = () => {
      const pane = paneRef.current;
      if (!pane) return;
      const s = Math.min(pane.clientWidth / ANCHO_PAPEL, 1);
      setEscala(Math.max(s, ESCALA_MIN));
    };
    calcular();
    window.addEventListener("resize", calcular);
    return () => window.removeEventListener("resize", calcular);
  }, [altoNatural]);

  useEffect(() => {
    if (!open) {
      setAltoNatural(null);
      setEscala(1);
      setAviso(null);
    }
  }, [open]);

  function onLoad() {
    const doc = iframeRef.current?.contentDocument;
    const h = doc?.documentElement?.scrollHeight;
    if (h) setAltoNatural(h);
  }

  const nombreArchivo = () => nombreArchivoTramite(`Formato RNPF — ${nombreTitular(datos)} — ${codigoInterno}`);

  async function descargarPdf() {
    setDescargando(true);
    setAviso(null);
    try {
      const doc = await archivadorRef.current?.capturar(html);
      if (!doc) throw new Error("El documento todavía no terminó de dibujarse.");
      const pdf = await tramiteDocumentoAPdf(doc);
      const url = URL.createObjectURL(pdf);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo armar el PDF.");
    } finally {
      setDescargando(false);
    }
  }

  async function guardarEnDrive() {
    setGuardando(true);
    setAviso(null);
    try {
      const doc = await archivadorRef.current?.capturar(html);
      if (!doc) throw new Error("El documento todavía no terminó de dibujarse.");
      const pdf = await tramiteDocumentoAPdf(doc);
      await archivarEnDrive({
        archivo: pdf,
        nombreArchivo: nombreArchivo(),
        carpeta: CARPETA,
        etiquetas: ["forestal", "rnpf", datos.tipoTramite],
        descripcion: `Formato RNPF — ${nombreTitular(datos)} — ${codigoInterno}.`,
      });
      setAviso(`Guardado en el Drive · carpeta "${CARPETA}".`);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo guardar en el Drive.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={`Formato RNPF · ${codigoInterno}`}
      icon={FileText}
      variant="fullscreen"
      footer={
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          {aviso && <span className="mr-auto text-xs font-bold text-[var(--text-secondary)]">{aviso}</span>}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <X className="h-4 w-4" /> Cerrar
          </button>
          <button
            type="button"
            onClick={() => imprimirPlantacion({ datos, codigoInterno })}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button
            type="button"
            onClick={() => void descargarPdf()}
            disabled={descargando}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {descargando ? "Armando…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            onClick={() => void guardarEnDrive()}
            disabled={guardando}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      }
    >
      <div ref={paneRef} className="min-h-full bg-[var(--surface-sunken)] p-3 sm:p-5">
        <div
          className="mx-auto border border-[#d3d9d5] shadow-[var(--shadow-lg)]"
          style={{ width: ANCHO_PAPEL * escala, height: altoNatural ? altoNatural * escala : undefined }}
        >
          <div style={{ width: ANCHO_PAPEL, transform: `scale(${escala})`, transformOrigin: "top left" }}>
            <iframe
              ref={iframeRef}
              title={`Documento: Formato RNPF ${codigoInterno}`}
              srcDoc={html}
              sandbox="allow-same-origin"
              onLoad={onLoad}
              style={{ width: ANCHO_PAPEL, height: altoNatural ?? 1400, border: 0, display: "block", background: "#fff" }}
            />
          </div>
        </div>
      </div>
      <TramiteArchivadorOffscreen handleRef={archivadorRef} />
    </AdminModal>
  );
}
