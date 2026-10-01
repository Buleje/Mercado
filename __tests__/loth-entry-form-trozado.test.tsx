/**
 * Tests — «Nueva línea · Trozado» con la ficha lateral y las dos formas de
 * anotar el diámetro (28-09), por el camino del usuario: el formulario montado
 * con la red simulada por URL.
 *
 *   - la ficha trae la línea de tala del árbol (fecha, medidas, motosierrista,
 *     hora, GPS), sus 4 trozas y lo que queda por trozar con su ≈ pt;
 *   - el código de troza pasa solo a la primera letra libre (85-TOR-E);
 *   - una troza que se pasa de lo talado se avisa;
 *   - «D1 y D2 promediados» se fija en el equipo (Tala abre igual) y al guardar
 *     la medición cruda lleva la forma, sin medidas cruzadas inventadas;
 *   - la ficha de la tala muestra lo que queda del árbol y de la especie.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import LothEntryForm from "@/components/admin/forestal/LothEntryForm";
import { olvidarArbolEnElLibro } from "@/components/admin/forestal/hooks/use-arbol-en-el-libro";
import { olvidarCensoDeTala } from "@/components/admin/forestal/hooks/use-censo-de-tala";
import { CLAVE_FORMA_MEDICION } from "@/components/admin/forestal/hooks/use-forma-medicion";

const ARBOLES = [
  { id: "t1", treeCode: "85-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", speciesNative: null, cites: false, dapM: "0.800", alturaComercialM: "13.00", volumenEstimadoM3: "4.2474", utmZona: "18L", utmX: "545120.00", utmY: "9012340.00", condicion: null, notes: null, estado: "en_pie" },
  { id: "t2", treeCode: "111", speciesCommon: "Copaiba", speciesScientific: "Copaifera reticulata Ducke", speciesNative: "Coubé", cites: false, dapM: "0.950", alturaComercialM: "21.00", volumenEstimadoM3: "9.6750", utmZona: null, utmX: "521961.00", utmY: "8918254.00", condicion: "Aprovechable", notes: null, estado: "en_pie" },
  { id: "t3", treeCode: "106", speciesCommon: "Copaiba", speciesScientific: "Copaifera reticulata Ducke", speciesNative: "Coubé", cites: false, dapM: "0.900", alturaComercialM: "20.00", volumenEstimadoM3: "8.1000", utmZona: null, utmX: "521970.00", utmY: "8918200.00", condicion: "Aprovechable", notes: null, estado: "en_pie" },
];
const USOS = [{ treeCode: "85-TOR", tala: { lineNo: 1, fecha: "2026-05-28", volumeM3: 5.003 }, trozas: 4, trozasM3: 4.887, despachadas: 2, consumidas: 0 }];

const linea = (x: Record<string, unknown>) => ({ entryDate: "2026-05-28T00:00:00.000Z", treeCode: null, trozaCode: null, status: "registrado", ...x });
const LIBRO_85 = [
  linea({ section: "tala", lineNo: 1, treeCode: "85-TOR", volumeM3: "5.0030", diamMayorM: "0.800", diamMenorM: "0.600", lengthM: "13.00", motosierrista: "Juan Pérez", horaTala: "09:30", gpsOrigen: "censo" }),
  linea({ section: "trozado", lineNo: 1, treeCode: "85-TOR", trozaCode: "85-TOR-A", volumeM3: "1.4710" }),
  linea({ section: "trozado", lineNo: 2, treeCode: "85-TOR", trozaCode: "85-TOR-B", volumeM3: "1.2900" }),
  linea({ section: "trozado", lineNo: 3, treeCode: "85-TOR", trozaCode: "85-TOR-C", volumeM3: "0.9950" }),
  linea({ section: "trozado", lineNo: 4, treeCode: "85-TOR", trozaCode: "85-TOR-D", volumeM3: "1.1310" }),
].map((l, i) => ({ id: `l${i}`, ...l }));

let posts: Record<string, unknown>[] = [];
/** Líneas de más que devuelve la búsqueda del libro (otra carátula, etc.). */
let extra: Record<string, unknown>[] = [];

function responder(url: string, init?: RequestInit) {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  if (init?.method === "POST" && url.startsWith("/api/admin/forestal/loth")) {
    const body = JSON.parse(String(init.body));
    posts.push(body);
    // Lo asentado aparece en la próxima lectura del libro, como en la base.
    extra.push({ ...linea({ section: body.section, lineNo: 90 + posts.length, treeCode: body.treeCode, trozaCode: body.trozaCode, volumeM3: String(body.volumeM3) }), id: `post-${posts.length}` });
    return json({ entry: { id: "nueva" } });
  }
  if (url.startsWith("/api/admin/forestal/plan?active=1")) return json({ active: { id: "p1" } });
  if (url.startsWith("/api/admin/forestal/plan?planId=")) return json({ species: [] });
  if (url === "/api/admin/forestal/plan") return json({ plans: [{ id: "p1", planType: "PO", planNumber: "12", titularName: "Maderera El Aguajal SAC" }] });
  if (url.startsWith("/api/admin/forestal/plan/census?planId=")) return json({ trees: ARBOLES, total: ARBOLES.length, truncado: false });
  if (url.startsWith("/api/admin/forestal/loth?usoCenso=1")) return json({ usos: USOS });
  if (url.startsWith("/api/admin/forestal/loth?available=trozado")) return json({ items: [{ kind: "tala", code: "85-TOR", species: "Tornillo", scientific: null, cites: false, vol: 5.003 }] });
  if (url.startsWith("/api/admin/forestal/loth?search=85-TOR")) return json({ entries: [...LIBRO_85, ...extra], total: LIBRO_85.length + extra.length });
  if (url.startsWith("/api/admin/forestal/loth/poa")) return json({ config: { dmcOverrides: {}, semillerosPct: 10 } });
  if (url.startsWith("/api/rrhh/colaboradores")) return json({ colaboradores: [] });
  return { ok: false, status: 404, json: async () => ({}) };
}

beforeEach(() => {
  posts = [];
  extra = [];
  window.localStorage.clear();
  olvidarArbolEnElLibro();
  olvidarCensoDeTala();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => responder(String(url), init)));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const codigoTroza = () => screen.getByPlaceholderText("1-MIS-A") as HTMLInputElement;
const ficha = () => document.querySelector('[data-ficha-trozado="85-TOR"]') as HTMLElement;
const cambiar = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Trozado · la ficha con el detalle de la tala", () => {
  it("trae la línea de tala, las 4 trozas, la letra libre y lo que queda con su pt", async () => {
    const errores = vi.spyOn(console, "error");
    render(<LothEntryForm section="trozado" arbolInicial="85-TOR" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-E"));
    const f = ficha();
    const tala = f.querySelector('[data-tala-linea="1"]') as HTMLElement;
    expect(within(tala).getByText("Línea N° 1")).toBeTruthy();
    expect(tala.textContent).toMatch(/jueves 28\/05/);
    expect(tala.textContent).toMatch(/09:30/);
    expect(tala.textContent).toMatch(/0\.800 \/ 0\.600 m/);
    expect(tala.textContent).toMatch(/5\.003 m³/);
    expect(within(tala).getByText("Juan Pérez")).toBeTruthy();
    expect(within(tala).getByText("copiado del censo")).toBeTruthy();
    for (const c of ["85-TOR-A", "85-TOR-B", "85-TOR-C", "85-TOR-D"]) expect(within(f).getByText(c)).toBeTruthy();
    const resta = f.querySelector('[data-restante="Lo que queda por trozar"]') as HTMLElement;
    const queda = within(resta).getByRole("rowheader", { name: /Queda/ }).closest("tr") as HTMLElement;
    // 5.003 − 4.887 = 0.116 m³ ≈ 28 pt (0.116 × 0.56 × 424)
    expect(queda.textContent).toMatch(/0\.116/);
    expect(queda.textContent).toMatch(/≈ 28/);
    // Del censo también: la cabecera del árbol.
    expect(within(f).getByText("Tornillo")).toBeTruthy();
    expect(errores.mock.calls.filter((c) => String(c[0]).includes("same key"))).toHaveLength(0);
  });

  it("el N° de línea repetido entre carátulas no rompe la lista (clave por id)", async () => {
    // Medido 28-09 en QA: la troza nueva de otra carátula salió «línea N° 1», como 85-TOR-A.
    extra = [{ ...linea({ section: "trozado", lineNo: 1, treeCode: "85-TOR", trozaCode: "85-TOR-E", volumeM3: "0.0500" }), id: "otra-caratula" }];
    const errores = vi.spyOn(console, "error");
    render(<LothEntryForm section="trozado" arbolInicial="85-TOR" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-F"));
    expect(within(ficha()).getByText("85-TOR-E")).toBeTruthy();
    expect(errores.mock.calls.filter((c) => String(c[0]).includes("same key"))).toHaveLength(0);
  });

  it("una troza que se pasa de lo talado se avisa mientras se mide", async () => {
    render(<LothEntryForm section="trozado" arbolInicial="85-TOR" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-E"));
    cambiar("Ø sección mayor — medida cruzada 1", "0.6");
    cambiar("Ø sección menor — medida cruzada 1", "0.5");
    cambiar("Longitud de la troza (m)", "3");
    const f = ficha();
    await waitFor(() => expect(within(f).getByRole("rowheader", { name: /Se pasa/ })).toBeTruthy());
    expect(f.textContent).toMatch(/el libro no lo acepta/);
  });

  it("un código ya asentado frena el guardado y ofrece la letra libre", async () => {
    render(<LothEntryForm section="trozado" arbolInicial="85-TOR" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-E"));
    fireEvent.change(codigoTroza(), { target: { value: "85-TOR-B" } });
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    await waitFor(() => expect(registrar.getAttribute("title")).toMatch(/ya está en la línea N° 2/));
    expect(registrar.disabled).toBe(true);
    fireEvent.click(within(ficha()).getByRole("button", { name: "Usar 85-TOR-E" }));
    expect(codigoTroza().value).toBe("85-TOR-E");
  });
});

describe("Trozado · «Guardar y otro» sigue con el mismo árbol", () => {
  it("guarda, deja el árbol, pasa a la letra siguiente y la ficha suma la troza asentada", async () => {
    render(<LothEntryForm section="trozado" arbolInicial="85-TOR" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-E"));
    cambiar("Ø sección mayor — medida cruzada 1", "0.30");
    cambiar("Ø sección menor — medida cruzada 1", "0.25");
    cambiar("Longitud de la troza (m)", "1.5");
    const otro = screen.getByRole("button", { name: /Guardar y otro/ }) as HTMLButtonElement;
    await waitFor(() => expect(otro.disabled).toBe(false));
    fireEvent.click(otro);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ trozaCode: "85-TOR-E", medicionCruda: { forma: "cruzadas", mayor: [0.3], menor: [0.25] } });
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-F"));
    expect((screen.getByPlaceholderText("1-MIS") as HTMLInputElement).value).toBe("85-TOR");
    // La medición vuelve a cero con el volumen: no quedan números viejos a la vista.
    expect((screen.getByLabelText("Ø sección mayor — medida cruzada 1") as HTMLInputElement).value).toBe("");
    const f = ficha();
    await waitFor(() => expect(within(f).getByText("85-TOR-E")).toBeTruthy());
    const resta = f.querySelector('[data-restante="Lo que queda por trozar"]') as HTMLElement;
    expect(within(resta).getByRole("rowheader", { name: /Trozado \(5\)/ })).toBeTruthy();
  });

  it("duplicar una troza propone la letra libre, no la de la línea de origen", async () => {
    const plantilla = { ...LIBRO_85[2], section: "trozado", speciesCommon: "Tornillo" } as unknown as import("@/lib/forestal/loth-constants").LothEntryDTO;
    render(<LothEntryForm section="trozado" plantilla={plantilla} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-E"));
  });

  it("sin árbol tipeado, sale del código de troza", async () => {
    render(<LothEntryForm section="trozado" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(codigoTroza(), { target: { value: "85-TOR-E" } });
    fireEvent.blur(codigoTroza());
    await waitFor(() => expect((screen.getByPlaceholderText("1-MIS") as HTMLInputElement).value).toBe("85-TOR"));
    await waitFor(() => expect(ficha().querySelector('[data-tala-linea="1"]')).toBeTruthy());
  });
});

describe("Medición en dos formas, fijada en el equipo", () => {
  it("«D1 y D2 promediados» se recuerda, Tala abre igual y se guarda con su forma", async () => {
    const onSaved = vi.fn();
    render(<LothEntryForm section="trozado" arbolInicial="85-TOR" onClose={() => {}} onSaved={onSaved} />);
    await waitFor(() => expect(codigoTroza().value).toBe("85-TOR-E"));
    fireEvent.click(screen.getByRole("radio", { name: "D1 y D2 promediados" }));
    expect(window.localStorage.getItem(CLAVE_FORMA_MEDICION)).toBe('"promedio"');
    expect(screen.queryByLabelText("Ø sección mayor — medida cruzada 1")).toBeNull();
    cambiar("D1 · Ø sección mayor", "0.5");
    cambiar("D2 · Ø sección menor", "0.4");
    cambiar("Longitud de la troza (m)", "0.5");
    const registrar = screen.getByRole("button", { name: /Registrar línea/ }) as HTMLButtonElement;
    await waitFor(() => expect(registrar.disabled).toBe(false));
    fireEvent.click(registrar);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      section: "trozado",
      treeCode: "85-TOR",
      trozaCode: "85-TOR-E",
      diamMayorM: 0.5,
      diamMenorM: 0.4,
      lengthM: 0.5,
      medicionCruda: { forma: "promedio", mayor: [], menor: [], totalM: 0.5, descuentos: [] },
    });
    cleanup();

    // Otra apertura, en Tala: abre en la forma fijada.
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    expect((screen.getByRole("radio", { name: "D1 y D2 promediados" }) as HTMLElement).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("D1 · Ø sección mayor")).toBeTruthy();
  });

  it("volver a «Varias medidas por Ø» también queda fijado", async () => {
    window.localStorage.setItem(CLAVE_FORMA_MEDICION, '"promedio"');
    render(<LothEntryForm section="tala" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Varias medidas por Ø" }));
    expect(window.localStorage.getItem(CLAVE_FORMA_MEDICION)).toBe('"cruzadas"');
    expect(screen.getByLabelText("Ø sección mayor — medida cruzada 1")).toBeTruthy();
  });
});

describe("Tala · lo que queda del árbol y de la especie", () => {
  it("censo − medido, y la especie en el plan, con su ≈ pt", async () => {
    render(<LothEntryForm section="tala" arbolInicial="111" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect((screen.getByPlaceholderText("1-MIS") as HTMLInputElement).value).toBe("111"));
    cambiar("Ø sección mayor — medida cruzada 1", "0.95");
    cambiar("Ø sección menor — medida cruzada 1", "0.80");
    const resta = await waitFor(() => document.querySelector('[data-restante="Lo que queda"]') as HTMLElement);
    expect(within(resta).getByText("Este árbol")).toBeTruthy();
    // Censo 9.675 m³ ≈ 2 297 pt
    const censo = within(resta).getByRole("rowheader", { name: /Censo \(estimado\)/ }).closest("tr") as HTMLElement;
    expect(censo.textContent).toMatch(/9\.675/);
    expect(censo.textContent).toMatch(/≈ 2,297/);
    // 2 Copaibas en el censo: 9.675 + 8.100 = 17.775
    expect(within(resta).getByText(/Copaiba en el plan · 2 árboles/)).toBeTruthy();
    expect(resta.textContent).toMatch(/17\.775/);
  });
});
