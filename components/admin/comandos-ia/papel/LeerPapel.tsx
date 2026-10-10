"use client";

/**
 * Comandos IA › Lee un papel — el buzón universal. Arrastras, fotografías o
 * pegas (Ctrl+V) una foto, un PDF o el texto de una captura; el navegador lo
 * lee gratis, el servidor dice qué es y te propone qué hacer. Nada se guarda
 * sin pasar por la revisión.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ScanText, Upload, Camera, ClipboardPaste, AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { logger } from "@/lib/logger";
import { useLeerPapel } from "./use-leer-papel";
import { TarjetaPapel } from "./TarjetaPapel";
import RevisarPapelModal from "./RevisarPapelModal";
import { leerConVision, type SubComandos } from "./guardar-papel";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CAMPO, permite } from "./formato";

const ACEPTA = "image/*,application/pdf,text/plain";
/** Debajo de esto el OCR gratis probablemente leyó mal: se ofrece la IA de visión. */
const CONFIANZA_OCR_BAJA = 60;

function esCampoDeTexto(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export default function LeerPapel({ irA }: { irA: (sub: SubComandos) => void }) {
  const rol = useMiRol();
  const { papeles, agregarArchivos, agregarTexto, reintentar, releer, quitar, marcarGuardado } = useLeerPapel();
  const [encima, setEncima] = useState(false);
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState("");
  const [revisando, setRevisando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const idTexto = useId();

  const recibir = useCallback((archivos: File[]) => {
    const n = agregarArchivos(archivos);
    setAviso(n < archivos.length ? "Solo leo fotos, PDF y texto: lo demás quedó afuera." : null);
  }, [agregarArchivos]);

  /* Ctrl+V en cualquier parte de la vista: una captura o un texto copiado. */
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const archivos = Array.from(e.clipboardData?.files ?? []);
      if (archivos.length) { e.preventDefault(); recibir(archivos); return; }
      if (esCampoDeTexto(e.target)) return;
      const t = e.clipboardData?.getData("text/plain") ?? "";
      if (t.trim().length >= 3) { e.preventDefault(); agregarTexto(t); }
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [recibir, agregarTexto]);

  const enRevision = papeles.find((p) => p.id === revisando && p.resultado) ?? null;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); recibir(Array.from(e.dataTransfer.files)); }}
        className={`rounded-2xl border-2 border-dashed p-4 transition-colors sm:p-6 ${encima ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] bg-[var(--surface-sunken)]"}`}
      >
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <ScanText className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            {/* En línea (no flex): a 400 px el ⓘ queda pegado a la última palabra,
                no colgado en el borde. En el celular no se «suelta» nada: se sube. */}
            <p className="text-base font-semibold text-[var(--text-primary)]">
              <span className="sm:hidden">Sube una foto, un PDF o una captura</span>
              <span className="hidden sm:inline">Suelta aquí una foto, un PDF o una captura</span>{" "}
              <InfoTip
                title="Qué papeles lee"
                what="Facturas y boletas, capturas de Yape o Plin, listas de precios del proveedor. Lo demás se guarda en Documentos."
                affects="Lee en tu navegador sin costo; la IA solo entra si las reglas no alcanzan, y ves cuánto gastó."
                example="Ctrl+V de una captura de WhatsApp → «Leí: pago por Yape · S/ 25.00»."
                side="bottom"
                className="-mt-0.5"
              />
            </p>
            <p className="text-sm text-[var(--text-secondary)]"><span className="hidden sm:inline">o pega con Ctrl+V. </span>Nada se guarda sin que lo revises.</p>
          </div>
          {/* Celular: el primario a lo ancho y los otros dos en una fila (sin huérfano). */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button type="button" onClick={() => archivoRef.current?.click()} className={`${BOTON_PRIMARIO} col-span-2`}>
              <Upload className="h-4 w-4" aria-hidden /> Elegir archivo
            </button>
            <button type="button" onClick={() => camaraRef.current?.click()} className={`${BOTON_SECUNDARIO} sm:hidden`}>
              <Camera className="h-4 w-4" aria-hidden /> Tomar foto
            </button>
            <button type="button" onClick={() => setPegando((v) => !v)} aria-expanded={pegando} aria-controls={idTexto} className={BOTON_SECUNDARIO}>
              <ClipboardPaste className="h-4 w-4" aria-hidden /> Pegar texto
            </button>
          </div>
        </div>
        <input ref={archivoRef} type="file" accept={ACEPTA} multiple hidden
          onChange={(e) => { recibir(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { recibir(Array.from(e.target.files ?? [])); e.target.value = ""; }} />

        {pegando && (
          <form
            id={idTexto}
            className="mt-4 space-y-2"
            onSubmit={(e) => { e.preventDefault(); agregarTexto(texto); setTexto(""); setPegando(false); }}
          >
            <label htmlFor={`${idTexto}-t`} className="sr-only">Texto del papel</label>
            <textarea
              id={`${idTexto}-t`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={5}
              maxLength={12_000}
              placeholder="Pega aquí el texto de la factura, el Yape o la lista del proveedor"
              className={`${CAMPO} min-h-32 py-2`}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setPegando(false); setTexto(""); }} className={BOTON_SECUNDARIO}>Cancelar</button>
              <button type="submit" disabled={texto.trim().length < 3} className={BOTON_PRIMARIO}>Leer texto</button>
            </div>
          </form>
        )}
        {aviso && (
          <p role="status" className="mt-3 flex items-start gap-1.5 text-sm text-[var(--text-primary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden /> {aviso}
          </p>
        )}
      </div>

      {papeles.length === 0 ? (
        <p className="text-center text-sm text-[var(--text-secondary)]">Aún no hay papeles: empieza con la foto de una factura.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Papeles leídos">
          {papeles.map((p) => {
            const r = p.resultado;
            /* La visión es `/api/ocr/invoice` (admin/almacenero): al cajero no se le ofrece un 403. */
            const ofrecerVision = p.origen === "imagen" && !!p.archivo && !!r?.visionDisponible
              && (p.confianzaOcr ?? 100) < CONFIANZA_OCR_BAJA && permite(rol, "compra");
            return (
              <TarjetaPapel
                key={p.id}
                papel={p}
                rol={rol}
                onRevisar={() => setRevisando(p.id)}
                onQuitar={() => quitar(p.id)}
                onReintentar={() => reintentar(p.id)}
                onVision={ofrecerVision && p.archivo ? async () => {
                  try {
                    await releer(p.id, await leerConVision(p.archivo as File));
                  } catch (err) {
                    logger.warn("[comandos-ia/papel] visión falló", { err: String(err) });
                    setAviso(err instanceof Error ? err.message : "La IA de visión no pudo leer la foto.");
                  }
                } : null}
              />
            );
          })}
        </ul>
      )}

      {enRevision && (
        <RevisarPapelModal
          papel={enRevision}
          rol={rol}
          irA={irA}
          onCerrar={() => setRevisando(null)}
          onDescartar={() => { quitar(enRevision.id); setRevisando(null); }}
          onGuardado={(resumen) => { marcarGuardado(enRevision.id, resumen); setRevisando(null); }}
        />
      )}
    </div>
  );
}
