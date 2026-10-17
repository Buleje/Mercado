/**
 * Imprimir desde Pedidos (P12, 17-10): la lista y los tickets salen de un
 * portal hijo de `<body>`, con la receta de `PlanImprimible`.
 *
 * Por qué un portal: el `@media print` de `globals.css` esconde `.fixed` (el
 * diálogo de Radix lo es) y pone `body * { visibility: hidden }`. Los tickets
 * dentro del AdminModal salían en hoja blanca, y el resumen de la lista se
 * encimaba con lo que hubiera en `#print-content`. Acá cada impresión deja a
 * la vista SÓLO su portal (`body > *:not(#id)`), así que dos portales con esta
 * CSS no pueden estar montados a la vez: quien llama monta uno por vez.
 */
import { limaDateKey, limaWeekday } from "@/lib/utils";

/** Los colores de la hoja: papel blanco aunque el panel esté en oscuro. */
export function cssImpresion(id: string, pagina = "size: A4; margin: 12mm"): string {
  return `@media print {
  html, body { overflow: visible !important; height: auto !important; background: white !important; }
  body > *:not(#${id}) { display: none !important; }
  #${id} { display: block !important; position: static !important; color-scheme: light;
    --text-primary: black; --text-secondary: dimgray; --text-tertiary: gray;
    --rule-base: silver; --rule-soft: gainsboro; --rule-strong: gray;
    --surface-raised: transparent; --surface-sunken: transparent; color: black; }
  #${id}, #${id} * { visibility: visible !important; }
  @page { ${pagina}; }
}`;
}

/**
 * Imprime en claro: saca `.dark` del `<html>` mientras dura el diálogo de
 * impresión y pone el título que el navegador usa como nombre del PDF.
 * Lo devuelve todo como estaba al cerrar el diálogo.
 */
export function imprimirEnClaro(titulo: string, alTerminar?: () => void): void {
  const html = document.documentElement;
  const eraOscuro = html.classList.contains("dark");
  const esquema = html.style.colorScheme;
  const tituloAntes = document.title;
  html.classList.remove("dark");
  html.style.colorScheme = "light";
  document.title = titulo;
  window.addEventListener(
    "afterprint",
    () => {
      if (eraOscuro) html.classList.add("dark");
      html.style.colorScheme = esquema;
      document.title = tituloAntes;
      alTerminar?.();
    },
    { once: true },
  );
  window.print();
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** Perú no cambia la hora en el año: UTC−5 siempre. */
const LIMA_MS = 5 * 3_600_000;

const dos = (n: number) => String(n).padStart(2, "0");

/** «viernes 17/10 01:23» en hora de Lima: la hora de corte de lo impreso. */
export function horaDeCorte(d: Date): string {
  const [, m, dia] = limaDateKey(d).split("-");
  const lima = new Date(d.getTime() - LIMA_MS);
  return `${DIAS[limaWeekday(d)]} ${dia}/${m} ${dos(lima.getUTCHours())}:${dos(lima.getUTCMinutes())}`;
}

/** «pedidos-preparar-2026-10-17-0123»: nombre del PDF, sin espacios ni tildes. */
export function nombreDelPdf(variante: string, d: Date): string {
  const lima = new Date(d.getTime() - LIMA_MS);
  return `pedidos-${variante}-${limaDateKey(d)}-${dos(lima.getUTCHours())}${dos(lima.getUTCMinutes())}`;
}
