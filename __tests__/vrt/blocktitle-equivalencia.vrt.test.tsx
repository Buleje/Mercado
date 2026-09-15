/**
 * `BlockTitle` tiene que pintar EXACTAMENTE lo que pintaba el `<h4>` suelto.
 *
 * Los 39 subtítulos de bloque del panel se migraron al primitivo nuevo. La
 * promesa fue «migrar no mueve un pixel», y eso no se comprueba mirando una
 * captura: se comprueba leyendo el estilo calculado de los dos, uno al lado del
 * otro, en el mismo navegador.
 *
 * Correr con `npm run test:vrt`.
 */
import "@/app/globals.css";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { BlockTitle } from "@buleje/design-system";

/** Las clases que llevaba el caso dominante antes de migrar (45 de 83). */
const CLASES_VIEJAS = "text-sm font-bold text-[var(--text-primary)]";

function medir(el: Element) {
  const cs = getComputedStyle(el);
  return {
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    color: cs.color,
    lineHeight: cs.lineHeight,
    fontFamily: cs.fontFamily,
  };
}

for (const tema of ["light", "dark"] as const) {
  test(`BlockTitle pinta igual que el <h4> que reemplaza — ${tema}`, async () => {
    document.documentElement.classList.toggle("dark", tema === "dark");
    render(
      <div>
        <h4 className={CLASES_VIEJAS}>Movimientos del turno</h4>
        <BlockTitle>Movimientos del turno</BlockTitle>
      </div>,
    );

    /* Los dos son <h4>: el primero el de antes, el segundo el del primitivo. */
    await vi.waitFor(() => expect(document.querySelectorAll("h4").length).toBe(2));
    const [viejo, nuevo] = [...document.querySelectorAll("h4")];
    if (!viejo || !nuevo) throw new Error("no se montaron los dos títulos");

    /* Tamaño, peso, color y familia: idénticos, y así tiene que quedar. */
    const { lineHeight: lhViejo, ...restoViejo } = medir(viejo);
    const { lineHeight: lhNuevo, ...restoNuevo } = medir(nuevo);
    expect(restoNuevo).toEqual(restoViejo);

    /* El interlineado SÍ cambia, y el número va escrito para que nadie lo
       descubra de casualidad: el h4 suelto tomaba el 20px que Tailwind le da a
       `text-sm`, y el primitivo usa `leading-snug` como el resto del DS →
       19.6px. Son 0.4px por línea: se acepta a cambio de que el interlineado
       deje de depender de lo que herede cada pantalla. Si algún día se va de
       un pixel, este test lo frena. */
    expect(lhViejo).toBe("20px");
    expect(lhNuevo).toBe("19.6px");
    expect(Math.abs(parseFloat(lhNuevo) - parseFloat(lhViejo))).toBeLessThan(1);
  });
}
