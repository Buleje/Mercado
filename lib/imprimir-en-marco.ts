/**
 * lib/imprimir-en-marco.ts — imprime una hoja HTML completa desde un iframe
 * oculto: sin ventana emergente (el navegador no la bloquea) y sin las reglas
 * de impresión del panel (`globals.css` esconde `.fixed` y los modales al
 * imprimir). El marco queda en el DOM hasta la siguiente impresión: los tests
 * y el QA leen su HTML.
 *
 * La hoja trae su propio `@page` (80 mm, 58 mm o A4) y su `<title>`, que el
 * navegador usa como nombre del PDF al guardar.
 */

const MARCO_ID = "imprimir-en-marco";

/** Imprime `html` en un iframe oculto. `nombre` describe el marco para lectores de pantalla. */
export function imprimirHtml(html: string, nombre = "Impresión"): void {
  if (typeof document === "undefined") return;
  document.getElementById(MARCO_ID)?.remove();
  const iframe = document.createElement("iframe");
  iframe.id = MARCO_ID;
  iframe.title = nombre;
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) return;
    // La letra tiene que estar cargada antes de fotografiar la hoja.
    (win.document.fonts?.ready ?? Promise.resolve())
      .then(() => {
        win.focus();
        win.print();
      })
      .catch((err: unknown) => console.warn("[imprimir-en-marco] no se pudo imprimir", err));
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
