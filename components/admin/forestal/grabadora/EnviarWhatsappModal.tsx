"use client";

/**
 * Mandar una grabación por WhatsApp: el número (los últimos usados a un toque),
 * el enlace público del Archivo (se reusa si sigue vivo; si no, uno que vence
 * en 7 días) y `wa.me` con el nombre y el enlace. En el celular, «Compartir el
 * archivo» adjunta el audio mismo con el menú de compartir del sistema.
 */
import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Share2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Button } from "@/components/ui-system/Button";
import type { DbDocument } from "@/lib/types/documents";
import { telefonoLegible } from "@/lib/forestal/contactos-envio";
import { bajarArchivo, enlacePublico } from "@/lib/grabadora/archivo";
import {
  DIAS_ENLACE,
  leerNumerosRecientes,
  mensajeGrabacion,
  numeroParaWhatsapp,
  recordarNumero,
  urlWhatsappGrabacion,
} from "@/lib/grabadora/whatsapp";
import { CAMPO, TEXTO_META } from "./compartido";

/** ¿Este navegador puede adjuntar un audio al menú de compartir? (celulares sí; la mayoría de PCs no). */
function puedeCompartirArchivos(): boolean {
  try {
    const prueba = new File([new Uint8Array(1)], "prueba.webm", { type: "audio/webm" });
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [prueba] });
  } catch {
    return false;
  }
}

export function EnviarWhatsappModal({
  doc,
  contexto,
  onCerrar,
}: {
  doc: DbDocument;
  contexto?: string;
  onCerrar: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [recientes, setRecientes] = useState<string[]>([]);
  const [compartible, setCompartible] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    setRecientes(leerNumerosRecientes());
    const se = puedeCompartirArchivos();
    setCompartible(se);
    if (!se) return;
    // Se baja YA: el menú de compartir exige abrirse dentro del toque, sin esperar la red.
    const ac = new AbortController();
    bajarArchivo(doc)
      .then((f) => {
        if (!ac.signal.aborted) setArchivo(f);
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, [doc]);

  const telefono = numeroParaWhatsapp(numero);

  async function abrirWhatsapp() {
    if (!telefono || enviando) return;
    // La pestaña se abre dentro del clic: después de esperar el enlace, el navegador la bloquearía.
    const pestana = window.open("", "_blank");
    setEnviando(true);
    setError(null);
    try {
      const enlace = await enlacePublico(doc.id);
      const url = urlWhatsappGrabacion(telefono, doc.name, enlace, contexto);
      if (!url) throw new Error("Ese número no parece un celular.");
      setRecientes(recordarNumero(telefono));
      setListo(url);
      if (pestana) pestana.location.href = url;
    } catch (err) {
      pestana?.close();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  async function compartirArchivo() {
    if (!archivo) return;
    setError(null);
    try {
      await navigator.share({ files: [archivo], title: doc.name, text: contexto?.trim() || doc.name });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // lo cerró sin elegir
      setError("No se pudo abrir el menú de compartir. Usa «Abrir WhatsApp».");
    }
  }

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Enviar por WhatsApp"
      description={doc.name}
      icon={MessageCircle}
      size="sm"
      aboveModals
      footer={
        <ModalFooter error={error}>
          {compartible && (
            <Button variant="secondary" onClick={() => void compartirArchivo()} disabled={!archivo} data-accion="compartir-archivo">
              {archivo ? <Share2 className="h-5 w-5" aria-hidden /> : <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden />}
              Compartir el archivo
            </Button>
          )}
          <Button onClick={() => void abrirWhatsapp()} disabled={!telefono || enviando} data-accion="abrir-whatsapp">
            {enviando ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden /> : <MessageCircle className="h-5 w-5" aria-hidden />}
            Abrir WhatsApp
          </Button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <label className="block space-y-1">
          <span className={TEXTO_META}>Celular</span>
          <input
            className={`${CAMPO} text-base tabular-nums`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="987 654 321"
            value={numero}
            autoFocus
            onChange={(e) => {
              setNumero(e.target.value);
              setListo(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void abrirWhatsapp();
            }}
            data-whatsapp-numero
          />
          {numero.trim() && !telefono && (
            <span className="text-xs text-[var(--data-warning-ink)]">Escribe los 9 dígitos del celular (o el número con su código de país).</span>
          )}
        </label>

        {recientes.length > 0 && (
          <div className="space-y-1">
            <span className={TEXTO_META}>Últimos números</span>
            <div className="flex flex-wrap gap-2">
              {recientes.map((n) => (
                <Button key={n} variant={telefono === n ? "primary" : "secondary"} size="md" onClick={() => setNumero(n)} className="tabular-nums">
                  {telefonoLegible(n)}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <span className={TEXTO_META}>Mensaje</span>
          <p className="whitespace-pre-line rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-primary)]">
            {mensajeGrabacion(doc.name, `(enlace que vence en ${DIAS_ENLACE} días)`, contexto)}
          </p>
        </div>

        {listo && (
          <p className="text-sm text-[var(--text-primary)]" role="status">
            Se abrió WhatsApp. ¿No apareció?{" "}
            <a href={listo} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent-dark)] underline" data-wa-url>
              Ábrelo aquí
            </a>
          </p>
        )}
      </div>
    </AdminModal>
  );
}
