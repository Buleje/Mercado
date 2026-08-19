"use client";

/**
 * Los papeles que viajan con el despacho, en una sola tanda (ADR-371).
 *
 * Un camión sale con una carpeta: la GTF, su lista de productos, la guía de
 * remisión, la factura, las guías de origen, la resolución del título. Hoy eso
 * llega como PDFs y fotos de celular con nombres tipo `IMG_20260808.jpg`, se
 * guarda en la máquina del que imprimió y cuando aparece una fiscalización no
 * está en ningún lado.
 *
 * Acá se arrastran todos juntos, el sistema **propone qué es cada uno**
 * (`clasificarDocumento`: por el contenido cuando puede leerlo, por el nombre
 * cuando no) y se suben al expediente del Drive con su etiqueta y un nombre con
 * el que se los va a encontrar dentro de seis meses.
 *
 * ⚠️ La clasificación **propone, no decide**: cada archivo muestra su tipo en un
 * selector y la confianza con la que se eligió. Un papel mal etiquetado en un
 * expediente es un papel perdido, así que abajo del umbral se marca «revisá».
 */

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Trash2, Upload } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { archivarEnDrive } from "@/lib/forestal/ctp-archivar-documento";
import {
  TIPOS_DOCUMENTO_DESPACHO,
  clasificarDocumento,
  esConfiable,
  nombreDeArchivo,
  type Clasificacion,
  type TipoDocumentoDespacho,
} from "@/lib/forestal/documento-clasificar";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";

interface Papel {
  id: string;
  archivo: File;
  clasificacion: Clasificacion & { fuente?: string; caracteres?: number };
  tipo: TipoDocumentoDespacho;
  /**
   * El número del documento, editable.
   *
   * Cuando sale de la **capa de texto** es el número exacto que imprimió el
   * sistema que emitió el papel. Cuando sale de **visión** es una lectura a ojo:
   * medido con un escaneo real, el modelo devolvió `001-000025` donde el papel
   * decía `001-0000025` — un cero de menos. Ese número va al nombre del archivo
   * en el Drive y es por el que se busca el papel en una fiscalización, así que
   * cuando se leyó mirando se muestra para confirmar, no como dato firme.
   */
  numero: string;
  estado: "leyendo" | "pendiente" | "subiendo" | "listo" | "error";
  detalle?: string;
}

/**
 * Qué es este papel, según el SERVIDOR (ADR-372).
 *
 * El navegador sólo puede leer texto plano; el servidor abre la capa de texto
 * del PDF y, si viene vacía —o sea, es un escaneo—, lo MIRA con visión. Por eso
 * la clasificación de verdad se pide allá y acá sólo se muestra.
 *
 * Si el servidor no contesta se clasifica en el acto por el nombre: perder la
 * subida porque el clasificador está caído sería cambiar lo importante por lo
 * accesorio.
 */
async function clasificarEnServidor(f: File): Promise<Clasificacion & { fuente?: string; caracteres?: number }> {
  try {
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/admin/forestal/documentos/clasificar", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
      body: fd,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Clasificacion & { fuente?: string; caracteres?: number };
  } catch {
    return clasificarDocumento(f.name);
  }
}

export default function CtpPapelesDespachoModal({
  gtfNumber,
  despachoId,
  onClose,
  onListo,
}: {
  /** N° de la guía: entra al nombre del archivo para poder buscarlo por ella. */
  gtfNumber?: string | null;
  despachoId?: string | null;
  onClose: () => void;
  onListo: (mensaje: string) => void;
}) {
  const [papeles, setPapeles] = useState<Papel[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agregar = useCallback(async (files: FileList | File[]) => {
    /* Entran YA, con la etiqueta del nombre: leer el contenido de cinco PDFs
       tarda, y una lista en blanco mientras tanto se lee como que no pasó nada. */
    const entrantes = Array.from(files).map((archivo, i) => {
      const previa = clasificarDocumento(archivo.name);
      return {
        id: `${archivo.name}-${archivo.size}-${Date.now()}-${i}`,
        archivo,
        clasificacion: previa,
        tipo: previa.tipo,
        numero: previa.numero ?? "",
        estado: "leyendo" as const,
      };
    });
    setPapeles((prev) => [...prev, ...entrantes]);

    for (const p of entrantes) {
      const clasificacion = await clasificarEnServidor(p.archivo);
      setPapeles((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                clasificacion,
                /* Sólo se pisa el tipo si el operador todavía no lo tocó: su
                   corrección vale más que la lectura del modelo. */
                tipo: x.estado === "leyendo" ? clasificacion.tipo : x.tipo,
                /* Mismo criterio para el número: lo que el operador escribió
                   gana sobre lo que el modelo creyó leer. */
                numero: x.estado === "leyendo" ? (clasificacion.numero ?? x.numero) : x.numero,
                estado: "pendiente" as const,
              }
            : x,
        ),
      );
    }
  }, []);

  async function subir() {
    if (papeles.length === 0) return;
    setSubiendo(true);
    setError(null);
    let ok = 0;
    for (const p of papeles) {
      if (p.estado === "listo") continue;
      setPapeles((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado: "subiendo" } : x)));
      try {
        const clasif: Clasificacion = { ...p.clasificacion, tipo: p.tipo, numero: p.numero.trim() || undefined };
        await archivarEnDrive({
          archivo: p.archivo,
          nombreArchivo: nombreDeArchivo(clasif, gtfNumber, p.archivo.name),
          carpeta: "Papeles de despacho (CTP)",
          /* Las etiquetas son con lo que después se filtra el expediente: el
             tipo, la guía y el despacho del que salió. */
          etiquetas: [p.tipo, gtfNumber ? `GTF ${gtfNumber}` : null, despachoId ? `Despacho ${despachoId.slice(-6)}` : null]
            .filter((x): x is string => Boolean(x)),
          descripcion:
            `${p.tipo}${clasif.numero ? ` ${clasif.numero}` : ""}` +
            (gtfNumber ? ` · adjunto de la GTF ${gtfNumber}` : "") +
            ` · clasificado ${esConfiable(clasif) ? "automáticamente" : "a mano"}.`,
        });
        ok += 1;
        setPapeles((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado: "listo" } : x)));
      } catch (e) {
        const detalle = e instanceof Error ? e.message : String(e);
        setPapeles((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado: "error", detalle } : x)));
      }
    }
    setSubiendo(false);
    if (ok > 0) {
      onListo(
        `${ok} papel${ok === 1 ? "" : "es"} archivado${ok === 1 ? "" : "s"} en el expediente` +
          (ok < papeles.length ? ` · ${papeles.length - ok} falló(aron), mirá el detalle` : ""),
      );
    } else {
      setError("Ningún papel se pudo archivar. Mirá el detalle de cada uno.");
    }
  }

  const dudosos = papeles.filter((p) => !esConfiable({ ...p.clasificacion, tipo: p.tipo })).length;

  return (
    <AdminModal
      open
      onClose={subiendo ? () => {} : onClose}
      variant="info"
      icon={FileText}
      title="Papeles del despacho"
      description={
        gtfNumber
          ? `Todo lo que viaja con la GTF ${gtfNumber}: se archiva junto y etiquetado`
          : "Todo lo que viaja con el camión: se archiva junto y etiquetado"
      }
      footer={
        <ModalFooter
          error={error}
          nota={
            <span>
              {papeles.length} archivo{papeles.length === 1 ? "" : "s"}
              {dudosos > 0 && <span className="ml-2 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{dudosos} sin confirmar</span>}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={subiendo}>Cerrar</Btn>
          <Btn
            variant="primary"
            disabled={papeles.length === 0 || subiendo || papeles.some((p) => p.estado === "leyendo")}
            onClick={() => void subir()}
          >
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Archivar {papeles.length > 0 ? `${papeles.length} papel${papeles.length === 1 ? "" : "es"}` : ""}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {/* La zona de arrastre: se sueltan todos juntos, PDF y fotos mezclados. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) void agregar(e.dataTransfer.files);
          }}
          className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-[var(--rule-base)] px-4 py-6 text-center transition-colors hover:border-[var(--accent)]"
        >
          <Upload className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
          <span className="text-sm font-bold text-[var(--text-primary)]">
            Arrastrá los papeles o hacé clic para elegirlos
          </span>
          <span className="text-sm text-[var(--text-secondary)]">
            PDF, fotos del celular, escaneos — todos juntos o de a uno
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/*,.txt,.xml,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void agregar(e.target.files);
            e.target.value = "";
          }}
        />

        {papeles.length > 0 && (
          <ul className="space-y-2">
            {papeles.map((p) => {
              const clasif = { ...p.clasificacion, tipo: p.tipo, numero: p.numero.trim() || undefined };
              /* Leído mirando el papel: el número se confirma, no se asume. */
              const leidoAOjo = String(p.clasificacion.fuente ?? "").startsWith("vision");
              const confiable = esConfiable(clasif);
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">{p.archivo.name}</p>
                    <p className="truncate text-xs text-[var(--text-tertiary)]">
                      {(p.archivo.size / 1024).toFixed(0)} KB ·{" "}
                      {p.estado === "leyendo" ? "Leyendo el contenido…" : p.clasificacion.motivo}
                      {!leidoAOjo && p.numero ? ` · N° ${p.numero}` : ""}
                      {p.clasificacion.fuente === "vision-pdf" && " · leído con visión (escaneo)"}
                      {p.clasificacion.fuente === "vision-imagen" && " · leído con visión (foto)"}
                    </p>
                    {leidoAOjo && p.estado !== "listo" && (
                      <label className="mt-1 flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">N° del documento</span>
                        <input
                          type="text"
                          value={p.numero}
                          onChange={(e) =>
                            setPapeles((prev) => prev.map((x) => (x.id === p.id ? { ...x, numero: e.target.value } : x)))
                          }
                          placeholder="Confirmá el número"
                          className="h-8 w-44 rounded-lg border-2 border-[var(--data-warning-500)] bg-[var(--surface-base)] px-2 font-mono text-xs text-[var(--text-primary)]"
                        />
                        <span className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                          se leyó de la imagen: confirmalo
                        </span>
                      </label>
                    )}
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Tipo de {p.archivo.name}</span>
                    <select
                      value={p.tipo}
                      onChange={(e) =>
                        setPapeles((prev) =>
                          prev.map((x) =>
                            x.id === p.id ? { ...x, tipo: e.target.value as TipoDocumentoDespacho } : x,
                          ),
                        )
                      }
                      className={`h-10 rounded-xl border-2 px-2 text-sm font-bold ${
                        confiable
                          ? "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                          : "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      }`}
                    >
                      {TIPOS_DOCUMENTO_DESPACHO.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <span
                    className="w-24 shrink-0 text-right text-xs font-bold"
                    title={`Confianza de la clasificación: ${p.clasificacion.confianza} %`}
                  >
                    {p.estado === "leyendo" ? (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                    ) : p.estado === "listo" ? (
                      <span className="inline-flex items-center gap-1 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                        <Check className="h-4 w-4" /> archivado
                      </span>
                    ) : p.estado === "subiendo" ? (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                    ) : p.estado === "error" ? (
                      <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">falló</span>
                    ) : confiable ? (
                      <span className="text-[var(--text-tertiary)]">{p.clasificacion.confianza} %</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                        <AlertTriangle className="h-4 w-4" /> revisá
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPapeles((prev) => prev.filter((x) => x.id !== p.id))}
                    aria-label={`Quitar ${p.archivo.name}`}
                    disabled={subiendo}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-700)] disabled:opacity-40 dark:hover:text-[var(--data-error-500)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {p.detalle && (
                    <p className="w-full text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      {p.detalle}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="px-1 text-sm text-[var(--text-tertiary)]">
          El tipo sale del <b>contenido</b>: la capa de texto del PDF y, si viene vacía (un escaneo) o es una foto,
          el sistema lo <b>mira</b> y transcribe lo que se lee. Cuando ni así se puede, cae al nombre del archivo y
          se marca «revisá». Se archiva en el Drive, en «Papeles de despacho (CTP)», con su etiqueta y la GTF, que
          es como se lo busca después.
        </p>
      </ModalBody>
    </AdminModal>
  );
}
