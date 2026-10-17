/**
 * El informe de una plantación del Libro TH (ADR-459, ronda 3).
 *
 * Lo que tiene que decir: los datos del REGISTRO y, por especie, dónde está hoy
 * el volumen —la misma cascada que la pantalla—. Lo que no puede decir: «autorizado»,
 * pago por derecho ni un «Resumen del censo» vacío. Y nada de lo que alguien tipeó
 * puede llegar como HTML vivo a la ventana (mismo origen que el panel).
 */
import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import { informePlantacionHtml, type DatosInformePlantacion } from "@/lib/forestal/loth-informe-plantacion";

const base = (over: Partial<DatosInformePlantacion> = {}): DatosInformePlantacion => ({
  plan: {
    planType: "PLANTACION",
    planNumber: "QA-459-INFORME",
    tituloHabilitante: null,
    resolucionNumber: "CONST-001-2024",
    resolucionDate: "2024-03-15T00:00:00.000Z",
    titularName: "Agroforestal QA SAC",
    regenteName: "Ing. Rosa Ríos",
    regenteRegistro: "R-123",
    arffs: "GERFOR Ucayali",
    region: "Ucayali",
    provincia: "Coronel Portillo",
    distrito: "Callería",
    areaHa: "12.5",
    vigenciaDesde: null,
    vigenciaHasta: null,
    propietarioNombre: "Juan Pérez",
    propietarioDocTipo: "DNI",
    propietarioDoc: "12345678",
  },
  species: [
    { speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", cites: false, volumenAutorizadoM3: "120", arbolesAutorizados: 400, anioInstalacion: 2018, superficieHa: "8" },
    { speciesCommon: "Capirona", speciesScientific: "Calycophyllum spruceanum", cites: false, volumenAutorizadoM3: "80", arbolesAutorizados: 200, anioInstalacion: 2019, superficieHa: "4.5" },
  ],
  balance: {
    rows: [
      { species: "Bolaina", cites: false, autorizado: 120, talado: 2.553, trozado: 2.4, movilizado: 1.2, movilizadoTroza: 1.2, consumido: 0 },
      { species: "Capirona", cites: false, autorizado: 80, talado: 0, trozado: 0, movilizado: 0, movilizadoTroza: 0, consumido: 0 },
    ],
    sinRegistrar: [],
  },
  censo: [],
  movimientos: [
    { section: "trozado", count: 2, totalVolumeM3: 2.4 },
    { section: "tala", count: 1, totalVolumeM3: 2.553 },
  ],
  emitido: new Date("2026-10-02T15:00:00Z"),
  ...over,
});

const m3 = (v: number) => formatNumber(v, 3);

describe("informe del registro de plantación", () => {
  it("habla del registro y no del plan de manejo", () => {
    const { title, body } = informePlantacionHtml(base());
    expect(title).toBe("Informe de la plantación QA-459-INFORME");
    expect(body).toContain("Informe del registro de plantación");
    for (const k of ["Constancia:", "CONST-001-2024", "Inscrito el:", "15/03/2024", "12.50 ha", "Juan Pérez — DNI 12345678", "Ing. Rosa Ríos — registro R-123", "Ucayali · Coronel Portillo · Callería"]) {
      expect(body).toContain(k);
    }
    expect(body).not.toMatch(/autorizad/i);
    expect(body).not.toMatch(/Pago por/);
    expect(body).not.toMatch(/Resumen del censo/);
    // Sin árboles marcados no sale la sección.
    expect(body).not.toContain("Árboles marcados");
  });

  it("por especie, la cascada de la pantalla: registrado → talado → en pie → sin trozar → patio → despachado, con ≈ pt", () => {
    const { body } = informePlantacionHtml(base());
    const bolaina = body.slice(body.indexOf("<b>Bolaina</b>"), body.indexOf("<b>Capirona</b>"));
    for (const v of [m3(120), m3(2.553), m3(117.447), m3(0.153), m3(1.2)]) expect(bolaina).toContain(v);
    expect(bolaina).toContain("Guazuma crinita");
    expect(bolaina).toContain("2018");
    expect(bolaina).toContain(`≈ ${formatNumber(ptAserrableDeRolliza(120), 0)} pt`);
    // Total del plan: registrado 200, en pie 197,447.
    const pie = body.slice(body.indexOf("<tfoot>"));
    expect(pie).toContain(m3(200));
    expect(pie).toContain(m3(197.447));
    expect(pie).toContain("600"); // árboles
    // Los movimientos van en el orden del libro: tala antes que trozado.
    expect(body.indexOf("<td>Tala</td>")).toBeLessThan(body.indexOf("<td>Trozado</td>"));
  });

  it("árboles marcados sólo si hay; lo talado fuera del registro sale aparte", () => {
    const { body } = informePlantacionHtml(
      base({
        censo: [{ estado: "en_pie", count: 3, volumenEstimadoM3: 1.5 }, { estado: "talado", count: 0, volumenEstimadoM3: 0 }],
        balance: { ...base().balance!, sinRegistrar: [{ species: "Copaiba", taladoM3: 4.951, trozadoM3: 0, movilizadoM3: 0 }] },
      }),
    );
    expect(body).toContain("Árboles marcados");
    expect(body).toContain("<td>En pie</td>");
    expect(body).not.toContain("<td>Talado</td><td class=\"num\">0</td>");
    expect(body).toContain("Movimientos de especies que no están en el registro");
    expect(body).toContain("<td>Copaiba</td>");
  });

  it("sin el libro avisa en vez de mostrar ceros como dato; sin especies, dice dónde cargarlas", () => {
    expect(informePlantacionHtml(base({ balance: null, movimientos: null })).body).toContain("No se pudo leer el Libro TH");
    expect(informePlantacionHtml(base({ balance: null, movimientos: null })).body).toContain("No se pudieron leer los movimientos");
    expect(informePlantacionHtml(base({ species: [], balance: { rows: [] } })).body).toContain("El registro no tiene especies cargadas");
  });

  it("todo lo tipeado se escapa: especie, titular, código, regente, ubicación", () => {
    const x = "<img src=x onerror=alert(1)>";
    const { title, body } = informePlantacionHtml(
      base({
        plan: { ...base().plan, planNumber: x, titularName: x, regenteName: x, distrito: x, resolucionNumber: x, alias: x, propietarioNombre: x },
        species: [{ ...base().species[0], speciesCommon: `Bolaina${x}`, speciesScientific: x }],
        balance: { rows: [{ ...base().balance!.rows[0], species: `Bolaina${x}` }], sinRegistrar: [{ species: x, taladoM3: 1, trozadoM3: 0, movilizadoM3: 0 }] },
      }),
    );
    expect(body).not.toContain("<img");
    expect(body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // El título pasa por `esc` dentro de `openCtpReport`; acá sólo se arma.
    expect(title).toContain(x);
  });
});
