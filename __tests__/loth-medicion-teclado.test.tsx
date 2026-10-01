/**
 * Tests — moverse con el teclado entre las medidas (Brandon 28-09: «que se
 * pueda mover a los lados al poner la medida… con el teclado»).
 *
 *   - lo puro: el decimal que se acepta (coma → punto) y cuándo la flecha sale
 *     del campo (borde / todo seleccionado) o mueve el cursor adentro;
 *   - el bloque de medición montado, en sus dos formas: →/←/Enter/Shift+Enter
 *     pasan de campo, ↑/↓ van por POSICIÓN en pantalla, Enter nunca envía y en
 *     el último va a `alTerminar`;
 *   - los metros de un descuento se pueden tipear con decimales («0.» no se
 *     come el punto);
 *   - en «Nueva línea · Trozado» Enter en el largo lleva a «Registrar línea».
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import LothMedicionFuste from "@/components/admin/forestal/LothMedicionFuste";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";
import { olvidarArbolEnElLibro } from "@/components/admin/forestal/hooks/use-arbol-en-el-libro";
import { olvidarCensoDeTala } from "@/components/admin/forestal/hooks/use-censo-de-tala";
import { flechaSaleDelCampo, limpiarDecimal } from "@/lib/forestal/medida-decimal";
import { medidasVacias, type FormaMedicion, type MedidasTala } from "@/lib/forestal/loth-forma-medicion";

describe("lo puro", () => {
  it("limpiarDecimal: coma a punto, un solo separador, sin letras", () => {
    expect(limpiarDecimal("0,62")).toBe("0.62");
    expect(limpiarDecimal("1.2.3")).toBe("1.23");
    expect(limpiarDecimal("1a5 m")).toBe("15");
    expect(limpiarDecimal("0.")).toBe("0.");
    expect(limpiarDecimal("")).toBe("");
  });

  it("la flecha sale en el borde o con todo seleccionado; en el medio, mueve el cursor", () => {
    expect(flechaSaleDelCampo({ inicio: 4, fin: 4, largo: 4 }, "derecha")).toBe(true);
    expect(flechaSaleDelCampo({ inicio: 4, fin: 4, largo: 4 }, "izquierda")).toBe(false);
    expect(flechaSaleDelCampo({ inicio: 0, fin: 0, largo: 4 }, "izquierda")).toBe(true);
    expect(flechaSaleDelCampo({ inicio: 2, fin: 2, largo: 4 }, "derecha")).toBe(false);
    expect(flechaSaleDelCampo({ inicio: 0, fin: 4, largo: 4 }, "izquierda")).toBe(true);
    expect(flechaSaleDelCampo({ inicio: 1, fin: 3, largo: 4 }, "derecha")).toBe(false);
    expect(flechaSaleDelCampo({ inicio: 0, fin: 0, largo: 0 }, "derecha")).toBe(true);
    expect(flechaSaleDelCampo({ inicio: null, fin: null, largo: 3 }, "derecha")).toBe(true);
  });
});

function Bloque({ forma: inicial, seccion = "trozado", alTerminar }: { forma: FormaMedicion; seccion?: "tala" | "trozado"; alTerminar?: () => boolean }) {
  const [medidas, setMedidas] = useState<MedidasTala>(medidasVacias("despacho_trozas"));
  const [forma, setForma] = useState<FormaMedicion>(inicial);
  return (
    <form data-testid="form" onSubmit={(e) => e.preventDefault()}>
      <LothMedicionFuste medidas={medidas} onChange={setMedidas} forma={forma} onForma={setForma} seccion={seccion} alTerminar={alTerminar} />
      {/* Un ⓘ (abre algo): Enter lo salta, no abre su cartel encima del formulario. */}
      <button type="button" aria-expanded="false" aria-label="Información: ayuda">i</button>
      <button type="button">Después del bloque</button>
    </form>
  );
}

const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
/** Tipear dejando el cursor al final, como el navegador. */
const tipear = (el: HTMLInputElement, v: string) => {
  fireEvent.change(el, { target: { value: v } });
  el.setSelectionRange(el.value.length, el.value.length);
};

describe("el bloque de medición con el teclado", () => {
  it("«Varias medidas»: → al borde pasa al vecino con el valor seleccionado; en el medio, no", () => {
    render(<Bloque forma="cruzadas" />);
    const m1 = campo("Ø sección mayor — medida cruzada 1");
    const m2 = campo("Ø sección mayor — medida cruzada 2");
    m1.focus();
    tipear(m1, "0.62");
    // Cursor en el medio: la flecha es del campo.
    m1.setSelectionRange(2, 2);
    fireEvent.keyDown(m1, { key: "ArrowRight" });
    expect(document.activeElement).toBe(m1);
    // Al final: pasa al vecino.
    m1.setSelectionRange(4, 4);
    fireEvent.keyDown(m1, { key: "ArrowRight" });
    expect(document.activeElement).toBe(m2);
    tipear(m2, "0.58");
    m2.setSelectionRange(0, 0);
    fireEvent.keyDown(m2, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(m1);
    // Llega con el valor entero seleccionado: lo que se tipea lo reemplaza.
    expect([m1.selectionStart, m1.selectionEnd]).toEqual([0, 4]);
  });

  it("Enter recorre mayor → menor → largo (salta el «+») y nunca envía; Shift+Enter vuelve", () => {
    const enviar = vi.fn();
    render(<Bloque forma="cruzadas" />);
    screen.getByTestId("form").addEventListener("submit", enviar);
    const orden = [
      "Ø sección mayor — medida cruzada 1",
      "Ø sección mayor — medida cruzada 2",
      "Ø sección menor — medida cruzada 1",
      "Ø sección menor — medida cruzada 2",
      "Longitud de la troza (m)",
    ].map(campo);
    orden[0].focus();
    for (let i = 1; i < orden.length; i++) {
      const ev = fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
      expect(ev).toBe(false); // preventDefault: el formulario no se envía
      expect(document.activeElement).toBe(orden[i]);
    }
    fireEvent.keyDown(orden[4], { key: "Enter", shiftKey: true });
    expect(document.activeElement).toBe(orden[3]);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("Enter en el último: `alTerminar` decide; si no puede, sigue al bloque de abajo (saltando el ⓘ)", () => {
    const alTerminar = vi.fn(() => false);
    render(<Bloque forma="promedio" alTerminar={alTerminar} />);
    const d1 = campo("D1 · Ø sección mayor");
    fireEvent.keyDown(d1, { key: "Enter" });
    expect(document.activeElement).toBe(campo("D2 · Ø sección menor"));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    const largo = campo("Longitud de la troza (m)");
    expect(document.activeElement).toBe(largo);
    fireEvent.keyDown(largo, { key: "Enter" });
    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Después del bloque" }));
  });

  it("↑/↓ van al campo de la fila vecina más cercano en horizontal (por posición)", () => {
    render(<Bloque forma="promedio" />);
    const d1 = campo("D1 · Ø sección mayor");
    const d2 = campo("D2 · Ø sección menor");
    const largo = campo("Longitud de la troza (m)");
    // D1 | D2 arriba, el largo abajo a la izquierda (como a 1280).
    const caja = (el: HTMLElement, left: number, top: number) =>
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ left, top, width: 200, height: 40, right: left + 200, bottom: top + 40, x: left, y: top, toJSON: () => ({}) } as DOMRect);
    caja(d1, 0, 0);
    caja(d2, 220, 0);
    caja(largo, 0, 80);
    d2.focus();
    fireEvent.keyDown(d2, { key: "ArrowDown" });
    expect(document.activeElement).toBe(largo);
    fireEvent.keyDown(largo, { key: "ArrowUp" });
    expect(document.activeElement).toBe(d1);
    // Sin fila arriba: se queda.
    fireEvent.keyDown(d1, { key: "ArrowUp" });
    expect(document.activeElement).toBe(d1);
  });

  it("acepta la coma y los decimales; Ctrl/Shift+flecha no navegan", () => {
    render(<Bloque forma="promedio" />);
    const d1 = campo("D1 · Ø sección mayor");
    fireEvent.change(d1, { target: { value: "0,75" } });
    expect(d1.value).toBe("0.75");
    expect(d1.getAttribute("inputmode")).toBe("decimal");
    d1.focus();
    d1.setSelectionRange(4, 4);
    fireEvent.keyDown(d1, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(d1, { key: "ArrowRight", ctrlKey: true });
    expect(document.activeElement).toBe(d1);
  });

  it("Tala: los metros de un descuento admiten «0.5» y entran en el recorrido", () => {
    render(<Bloque forma="promedio" seccion="tala" />);
    fireEvent.click(screen.getByRole("button", { name: /Aletas/ }));
    const metros = screen.getByLabelText(/Metros descontados por/) as HTMLInputElement;
    fireEvent.change(metros, { target: { value: "0." } });
    expect(metros.value).toBe("0.");
    fireEvent.change(metros, { target: { value: "0.5" } });
    expect(metros.value).toBe("0.5");
    const total = campo("Longitud total (m)");
    total.focus();
    fireEvent.keyDown(total, { key: "Enter" });
    expect(document.activeElement).toBe(metros);
  });
});

// ─── En el formulario de verdad ─────────────────────────────────────────────

const linea = (x: Record<string, unknown>) => ({ entryDate: "2026-05-28T00:00:00.000Z", treeCode: null, trozaCode: null, status: "registrado", ...x });
const LIBRO_85 = [
  linea({ id: "l0", section: "tala", lineNo: 1, treeCode: "85-TOR", volumeM3: "5.0030" }),
  linea({ id: "l1", section: "trozado", lineNo: 1, treeCode: "85-TOR", trozaCode: "85-TOR-A", volumeM3: "1.4710" }),
];

function responder(url: string) {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  if (url.startsWith("/api/admin/forestal/plan?active=1")) return json({ active: { id: "p1" } });
  if (url.startsWith("/api/admin/forestal/plan?planId=")) return json({ species: [] });
  if (url === "/api/admin/forestal/plan") return json({ plans: [{ id: "p1", planType: "PO", planNumber: "12", titularName: "QA" }] });
  if (url.startsWith("/api/admin/forestal/plan/census?planId=")) return json({ trees: [], total: 0, truncado: false });
  if (url.startsWith("/api/admin/forestal/loth?usoCenso=1")) return json({ usos: [] });
  if (url.startsWith("/api/admin/forestal/loth?available=trozado"))
    return json({ items: [{ kind: "tala", code: "85-TOR", species: "Tornillo", scientific: null, cites: false, vol: 5.003 }] });
  if (url.startsWith("/api/admin/forestal/loth?search=85-TOR")) return json({ entries: LIBRO_85, total: LIBRO_85.length });
  if (url.startsWith("/api/admin/forestal/loth/poa")) return json({ config: { dmcOverrides: {}, semillerosPct: 10 } });
  return { ok: false, status: 404, json: async () => ({}) };
}

describe("«Nueva línea · Trozado»", () => {
  beforeEach(() => {
    window.localStorage.clear();
    olvidarArbolEnElLibro();
    olvidarCensoDeTala();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => responder(String(url))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Enter en el largo lleva a «Registrar línea» cuando ya se puede guardar", async () => {
    render(<LothEntryForm section="trozado" arbolInicial="85-TOR" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect((screen.getByPlaceholderText("1-MIS-A") as HTMLInputElement).value).toBe("85-TOR-B"));
    const largo = campo("Longitud de la troza (m)");
    // Sin medidas todavía: no puede guardar, sigue al bloque de abajo.
    fireEvent.keyDown(largo, { key: "Enter" });
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    expect(document.activeElement).not.toBe(registrar);
    fireEvent.change(campo("Ø sección mayor — medida cruzada 1"), { target: { value: "0.6" } });
    fireEvent.change(campo("Ø sección menor — medida cruzada 1"), { target: { value: "0.5" } });
    fireEvent.change(largo, { target: { value: "2" } });
    await waitFor(() => expect(registrar.disabled).toBe(false));
    fireEvent.keyDown(largo, { key: "Enter" });
    expect(document.activeElement).toBe(registrar);
  });
});
