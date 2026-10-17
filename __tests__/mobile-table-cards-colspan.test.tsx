/**
 * useMobileTableCards — colSpan en thead/tfoot (bug medido en el navegador,
 * QA 400px, «Lo ganado», 2026-09-14).
 *
 * Sin el arreglo, `applyMobileTableCards` rotula por ÍNDICE DE HIJO, no por
 * columna real: un `<th colSpan={4}>Total</th>` en el tfoot desplaza a todas
 * las celdas de esa fila, y «S/ 2,170.00» (la 5ª columna real) terminaba
 * mostrando en la tarjeta mobile el rótulo de la 2ª («Días»).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useMobileTableCards } from "@/app/admin/_hooks/useMobileTableCards";

function Harness({ children }: { children: React.ReactNode }) {
  useMobileTableCards(true, "test");
  return <div data-admin-shell="true">{children}</div>;
}

beforeEach(() => {
  // rAF sincrónico: el hook agenda `applyMobileTableCards` con
  // requestAnimationFrame y jsdom no lo corre solo.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useMobileTableCards — tfoot con colSpan", () => {
  it("una celda con colSpan propio no toma un rótulo prestado, y la celda real usa la columna que ocupa", async () => {
    render(
      <Harness>
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Días</th>
              <th>Horas</th>
              <th>Tarifa</th>
              <th>Ganado (referencia)</th>
              <th>Adelantos abiertos</th>
              <th>Avisos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ana</td>
              <td>22</td>
              <td>0</td>
              <td>S/ 60.00 (por día)</td>
              <td>S/ 1,320.00</td>
              <td>S/ 0.00</td>
              <td></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>Total</th>
              <th>S/ 2,170.00</th>
              <th colSpan={2}></th>
            </tr>
          </tfoot>
        </table>
      </Harness>,
    );

    const totalCell = (await screen.findByText("Total")).closest("th") as HTMLElement;
    const importeCell = screen.getByText("S/ 2,170.00").closest("th") as HTMLElement;
    const filaFooter = totalCell.parentElement as HTMLElement;
    const celdaVaciaConSpan = filaFooter.children[2] as HTMLElement;

    await waitFor(() => expect(importeCell.dataset.label).toBeDefined());

    // La celda que abarca 4 columnas («Total») no toma prestado el rótulo
    // de la primera columna («Persona») — su propio texto ya se explica.
    expect(totalCell.dataset.label).toBeUndefined();
    // «S/ 2,170.00» ocupa la 5ª columna REAL (después de las 4 que abarca
    // «Total») → tiene que rotularse «Ganado (referencia)», no «Días»
    // (que sería el rótulo por índice de hijo, índice 1).
    expect(importeCell.dataset.label).toBe("Ganado (referencia)");
    // La celda vacía con colSpan={2} tampoco toma un rótulo prestado.
    expect(celdaVaciaConSpan.dataset.label).toBeUndefined();
  });

  it("un <th> con autofiltro de cabecera rotula la card sólo con el título, no con la lista del popover (400px, 2026-09-22)", async () => {
    render(
      <Harness>
        <table>
          <thead>
            <tr>
              <th>
                <span className="block">Proveedor</span>
                <details>
                  <summary>Todos</summary>
                  <div role="group"><label>ZZ Prov Backfill (borrar) 3</label><label>Distribuidora Ucayali 2</label></div>
                </details>
              </th>
              <th data-label="Estado">
                <span className="block">Estado de la recepción</span>
                <select><option>Todos</option><option>En proceso</option></select>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Distribuidora Ucayali</td>
              <td>En proceso</td>
            </tr>
          </tbody>
        </table>
      </Harness>,
    );

    const proveedorCell = (await screen.findByText("Distribuidora Ucayali")).closest("td") as HTMLElement;
    const estadoCell = screen.getByText("En proceso", { selector: "td" }).closest("td") as HTMLElement;

    await waitFor(() => expect(proveedorCell.dataset.label).toBeDefined());

    expect(proveedorCell.dataset.label).toBe("Proveedor");
    // `data-label` explícito manda sobre el texto del <th>.
    expect(estadoCell.dataset.label).toBe("Estado");
  });

  it("una fila de tbody sin colSpan sigue rotulando cada celda por su columna (sin regresión)", async () => {
    render(
      <Harness>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ana</td>
              <td>Activo</td>
            </tr>
          </tbody>
        </table>
      </Harness>,
    );

    const nombreCell = (await screen.findByText("Ana")).closest("td") as HTMLElement;
    const estadoCell = screen.getByText("Activo").closest("td") as HTMLElement;

    await waitFor(() => expect(nombreCell.dataset.label).toBeDefined());

    expect(nombreCell.dataset.label).toBe("Nombre");
    expect(estadoCell.dataset.label).toBe("Estado");
  });
});
