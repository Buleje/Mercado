"use client";
/**
 * Vista previa de «Escríbelo por mí» (ventana ancha; hoja abajo en el celular).
 * Se edita a la izquierda y se ve a la derecha: hoja A4, globo de WhatsApp o
 * aviso de tienda. La hoja es SIEMPRE clara, como sale impresa.
 * Pie: [Copiar] [Imprimir] [Abrir WhatsApp]. No guarda nada.
 *
 * Imprimir usa un iframe propio con su @page A4: solo sale el cartel, sin el
 * panel ni los estilos del tema (el papel es blanco y negro aunque el panel
 * esté en oscuro).
 */
import { useState } from "react";
import { Check, Copy, FileText, MessageCircle, Printer, Send, Store } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { cn } from "@/lib/utils";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, costoTexto, type Escrito } from "./use-mensajes";

const TITULO = { whatsapp: "Mensaje de WhatsApp", cartel: "Cartel A4", tienda: "Texto para la tienda" } as const;
const ICONO = { whatsapp: MessageCircle, cartel: FileText, tienda: Store } as const;

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** HTML del cartel para el iframe de impresión (A4, solo blanco y negro). */
export function htmlDelCartel(titulo: string, texto: string, pie: string[]): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo || "Cartel")}</title><style>
@page { size: A4; margin: 16mm; }
html, body { margin: 0; color: black; background: white; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.hoja { min-height: calc(297mm - 32mm); display: flex; flex-direction: column; justify-content: center; text-align: center; gap: 14mm; }
h1 { font-size: 56pt; line-height: 1.05; margin: 0; font-weight: 800; letter-spacing: -0.5pt; }
p { font-size: 26pt; line-height: 1.35; margin: 0; white-space: pre-line; }
footer { margin-top: auto; padding-top: 6mm; border-top: 2pt solid black; font-size: 14pt; line-height: 1.5; }
</style></head><body><div class="hoja">${titulo ? `<h1>${escapar(titulo)}</h1>` : ""}<p>${escapar(texto)}</p>${
    pie.length ? `<footer>${pie.map(escapar).join(" · ")}</footer>` : ""
  }</div></body></html>`;
}

function imprimir(html: string) {
  document.querySelectorAll("iframe[data-cartel-impresion]").forEach((f) => f.remove());
  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-cartel-impresion", "");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

export default function CartelVistaPrevia({ escrito, onCerrar }: { escrito: Escrito; onCerrar: () => void }) {
  const [titulo, setTitulo] = useState(escrito.titulo);
  const [texto, setTexto] = useState(escrito.texto);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { salida, pie } = escrito;
  // En WhatsApp el título no se ve ni se edita: se copia solo el texto.
  const completo = salida === "whatsapp" ? texto.trim() : [titulo.trim(), texto.trim()].filter(Boolean).join("\n\n");
  const max = salida === "whatsapp" ? 600 : 1200;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(completo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      setError("Tu navegador no dejó copiar: selecciona el texto y cópialo a mano.");
    }
  };

  const campo = "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

  return (
    <AdminModal
      open
      onClose={onCerrar}
      variant="info"
      title={TITULO[salida]}
      icon={ICONO[salida]}
      footer={
        <ModalFooter error={error} nota={`Escrito con IA · ${costoTexto(escrito.costoIaUsd)} · no se guarda`}>
          {/* La acción principal depende de a dónde va: el cartel se imprime, el mensaje se
              manda y el texto de la tienda se copia. Imprimir sólo existe para el cartel. */}
          <button type="button" onClick={copiar} className={salida === "tienda" ? `${BOTON_PRIMARIO} max-sm:w-full` : `${BOTON_SECUNDARIO} max-sm:flex-1`} data-copiar>
            {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(completo)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={salida === "whatsapp" ? `${BOTON_PRIMARIO} max-sm:w-full` : `${BOTON_SECUNDARIO} max-sm:flex-1`}
            data-wa-enlace
          >
            <Send className="h-4 w-4" aria-hidden /> Abrir WhatsApp
          </a>
          {salida === "cartel" && (
            <button type="button" onClick={() => imprimir(htmlDelCartel(titulo.trim(), texto.trim(), pie))} className={`${BOTON_PRIMARIO} max-sm:w-full`} data-imprimir>
              <Printer className="h-4 w-4" aria-hidden /> Imprimir
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`grid w-full gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] ${MODAL_BODY}`}>
        <div className="space-y-3">
          {salida !== "whatsapp" && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Título</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Opcional" className={`${campo} h-11 placeholder:text-[var(--text-tertiary)]`} data-cartel-titulo />
            </label>
          )}
          <label className="block">
            <span className="mb-1 flex justify-between text-xs font-semibold text-[var(--text-secondary)]">
              Texto <span className="tabular-nums font-normal text-[var(--text-tertiary)]">{texto.length}/{max}</span>
            </span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={max} rows={salida === "cartel" ? 6 : 9} className={`${campo} resize-y py-2.5 leading-relaxed`} data-cartel-texto />
          </label>
        </div>

        <div className="flex justify-center rounded-2xl bg-[var(--surface-sunken)] p-3 sm:p-5" role="group" aria-label="Vista previa">
          {salida === "cartel" ? (
            <div className="flex aspect-[210/297] w-full max-w-[16rem] flex-col sm:max-w-[24rem] justify-center gap-5 rounded-sm border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center text-[var(--text-primary)] shadow-[var(--shadow-md)] dark:bg-[var(--text-primary)] dark:text-[var(--surface-canvas)]" data-cartel-hoja>
              {titulo.trim() && <div className="text-3xl font-extrabold leading-tight break-words">{titulo}</div>}
              <div className="whitespace-pre-line text-base leading-snug break-words">{texto}</div>
              {pie.length > 0 && <div className="mt-auto border-t-2 border-[var(--text-primary)] pt-2 text-xs dark:border-[var(--surface-canvas)]">{pie.join(" · ")}</div>}
            </div>
          ) : (
            <div
              className={cn(
                "w-full max-w-md self-start rounded-2xl p-3 text-sm leading-relaxed text-[var(--text-primary)] shadow-[var(--shadow-sm)]",
                // WhatsApp = globo que sale (a la derecha, con el tinte del acento); tienda = tarjeta.
                salida === "whatsapp" ? "ml-auto rounded-tr-sm bg-[var(--accent-soft)]" : "bg-[var(--surface-raised)]",
              )}
              data-escrito-vista
            >
              {titulo.trim() && salida === "tienda" && <div className="mb-1 font-bold">{titulo}</div>}
              <div className="whitespace-pre-line break-words">{texto}</div>
            </div>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
