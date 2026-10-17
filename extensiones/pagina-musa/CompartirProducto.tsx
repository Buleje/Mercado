"use client";

/**
 * «Compártelo con una amiga» en la ficha: Musa se vende de boca en boca por
 * WhatsApp. En el celular abre el menú de compartir del teléfono (WhatsApp,
 * Instagram, Facebook…); en la compu, WhatsApp con el mensaje listo para elegir
 * el chat. El enlace es el de la página que se está viendo (el dominio real), y
 * al pegarlo sale la tarjeta del producto (`compartir.ts` → `metadatosFicha`).
 * Si el teléfono cancela, no pasa nada; si el menú falla, cae a WhatsApp.
 */
import { Share2 } from "@buleje/design-system/icons";

const BOTON =
  "mu-foco inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-semibold text-[var(--text-primary)] underline-offset-4 transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-nude-claro)]";

export function CompartirProducto({ nombre, texto }: { nombre: string; texto: string }) {
  const compartir = async () => {
    const url = `${location.origin}${location.pathname}`;
    const porWhatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`, "_blank", "noopener,noreferrer");
    if (typeof navigator.share !== "function") return porWhatsapp();
    try {
      await navigator.share({ title: nombre, text: texto, url });
    } catch (err) {
      // Cerrar el menú del teléfono no es un error; cualquier otro, WhatsApp directo.
      if (!(err instanceof DOMException && err.name === "AbortError")) porWhatsapp();
    }
  };
  return (
    <button type="button" onClick={compartir} className={BOTON}>
      <Share2 className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" /> Compártelo con una amiga
    </button>
  );
}
