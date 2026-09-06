/**
 * cacao-print.ts — impresión/compartir robustos para los comprobantes del módulo
 * Cacao. Reemplaza el `window.open + document.write` que fallaba SILENCIOSAMENTE
 * en el WebView de Capacitor y con bloqueadores de popup (ADR-128 / auditoría).
 *
 * Estrategia: iframe oculto (no lo bloquea el navegador ni el WebView) como método
 * primario; window.open como fallback; y aviso al usuario si ambos fallan — nunca
 * "no pasa nada" en silencio.
 */

function openInNewWindow(html: string): boolean {
  const w = window.open("", "_blank", "width=860,height=900");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    return true;
  }
  // Último recurso: blob URL (a veces sí abre donde window.open("") no).
  try {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const opened = window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (opened) return true;
  } catch {
    /* cae al alert */
  }
  if (typeof alert === "function")
    alert(
      "No se pudo abrir la impresión. Permití las ventanas emergentes para este sitio e intentá de nuevo.",
    );
  return false;
}

/**
 * Abre un documento HTML imprimible. El HTML debe incluir su propio
 * `window.onload = () => window.print()`. Devuelve false si no se pudo abrir
 * (para que el caller avise) — nunca falla en silencio.
 */
export function openPrintable(html: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return openInNewWindow(html);
    }
    doc.open();
    doc.write(html); // el <script> de print() del html corre en la ventana del iframe
    doc.close();
    // Limpieza diferida: dar tiempo al diálogo de impresión antes de remover.
    setTimeout(() => iframe.remove(), 60_000);
    return true;
  } catch {
    return openInNewWindow(html);
  }
}

/**
 * Comparte texto (ej. resumen de liquidación) por el share nativo del SO —
 * WhatsApp aparece ahí en móvil. Si no hay Web Share API, abre wa.me con el texto.
 * Devuelve true si usó el share nativo.
 */
export async function shareCacaoText(title: string, text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return true;
    } catch {
      // usuario canceló o el SO no lo permitió → fallback a wa.me
    }
  }
  if (typeof window !== "undefined")
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return false;
}
