/**
 * ADR-457 · pieza `madera-disponible`: de «Productos disponibles» del libro a
 * una página PÚBLICA. Lo que no puede pasar nunca: que un costo, un proveedor,
 * un permiso, una guía o el nombre de quien apartó algo llegue a la portada, o
 * que se ofrezca madera que no es del centro o que ya tiene dueño.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/db/store-page.db", () => ({ StorePageDB: {} }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: {} }));

import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { opcionesMaderaDisponible } from "@/extensiones/madera-disponible/manifest";
import {
  legible,
  maderaPublica,
  type CorridaDelLibro,
} from "@/extensiones/madera-disponible/proyeccion";
import { VistaMaderaDisponible } from "@/extensiones/madera-disponible/vista";

const paquete = (id: string, m3: number, piezas: number, extra: Record<string, unknown> = {}) => ({
  id,
  codigo: `PQ-${id}`,
  producto: null,
  presentacion: null,
  cantidad: piezas,
  volumenM3: m3,
  espesorCm: 5,
  anchoCm: 20,
  largoM: 3.05,
  observations: "nota interna del patio",
  apartado: null,
  precioVentaPt: 4.5,
  ...extra,
});

const corrida = (
  id: string,
  especie: string,
  disponible: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  lineNo: 12,
  fecha: "2026-09-20T00:00:00.000Z",
  especie,
  especieCientifica: "Cedrelinga cateniformis",
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: null,
  unidad: "m3",
  lote: "LOTE-SECRETO",
  duenoMadera: "propia",
  titularNombre: "COMUNIDAD NATIVA SANTA ROSA",
  titularOrigen: ["17-PUC/P-MAD-A-001-21"],
  gtfOrigen: ["019-001-0000123"],
  usadoAt: null,
  producido: disponible,
  despachado: 0,
  reprocesado: 0,
  disponible,
  apartado: null,
  aserrioImporte: 777.77,
  costoConsumos: [
    {
      volumeM3: 3,
      costoUnitarioSnap: 999.99,
      costoTotalGuia: 5555.55,
      volumenGuiaM3: 10,
      gtfNumber: "019-001-0000123",
      maderaDeTercero: false,
    },
  ],
  costoPorGtf: [
    { gtfNumber: "019-001-0000123", costoTotal: 5555.55, volumeM3: 10, maderaDeTercero: false },
  ],
  paquetes: [] as ReturnType<typeof paquete>[],
  ...extra,
});

/** El libro de un patio con todo lo que NO tiene que salir. */
const LIBRO = [
  // Tornillo propio, dos paquetes contados (1,0 + 0,5 m³; 50 + 20 piezas).
  corrida("c1", "TORNILLO", 1.5, { paquetes: [paquete("p1", 1.0, 50), paquete("p2", 0.5, 20)] }),
  // Tornillo sin paquete: suma m³, pero sus piezas no se saben.
  corrida("c2", "Tornillo", 0.4, { producto: "MADERA ASERRADA T9" }),
  // Cumala: un paquete apartado para un cliente y uno libre.
  corrida("c3", "Cumala", 1.0, {
    paquetes: [
      paquete("p3", 0.8, 40, {
        apartado: {
          id: "a1",
          para: "Juan Pérez",
          hasta: null,
          nota: "paga el lunes",
          creadoAt: "2026-09-21",
        },
      }),
      paquete("p4", 0.2, 10),
    ],
  }),
  // Aserrado por encargo: no es del centro.
  corrida("c4", "Cachimbo", 13.254, {
    duenoMadera: "tercero",
    paquetes: [paquete("p5", 13.254, 221)],
  }),
  // Guía de servicio (ADR-437): tampoco.
  corrida("c5", "Lupuna", 2, {
    costoPorGtf: [
      { gtfNumber: "019-001-0000999", costoTotal: null, volumeM3: 2, maderaDeTercero: true },
    ],
  }),
  // La corrida entera apartada.
  corrida("c6", "Capirona", 0.7, {
    apartado: {
      id: "a2",
      para: "Maderera El Sol",
      hasta: null,
      nota: null,
      creadoAt: "2026-09-21",
    },
  }),
];

const TOMADA = new Date("2026-10-01T23:42:00.000Z"); // jueves 01/10 18:42 en Lima

describe("maderaPublica — qué sale a la portada", () => {
  const r = maderaPublica(LIBRO as CorridaDelLibro[], TOMADA);

  it("sólo lo libre y propio, por especie, más volumen primero", () => {
    expect(r.especies.map((e) => e.nombre)).toEqual(["Tornillo", "Cumala"]);
  });

  it("pt = m³ × 424 desde el saldo del libro; piezas sólo si TODAS se saben", () => {
    const [tornillo, cumala] = r.especies;
    expect(tornillo.m3).toBe(1.9);
    expect(tornillo.pt).toBe(pieTablarDe(1.9));
    expect(tornillo.piezas).toBeNull(); // la corrida c2 no tiene paquete
    expect(cumala.m3).toBe(0.2);
    expect(cumala.piezas).toBe(10); // el apartado (40 piezas) no cuenta
    expect(r.total.m3).toBe(2.1);
    expect(r.total.pt).toBe(pieTablarDe(2.1));
    expect(r.total.piezas).toBeNull();
  });

  it("los productos se leen como frase y los códigos con número no se tocan", () => {
    expect(r.especies[0].productos.map((p) => p.nombre).sort()).toEqual([
      "Madera aserrada (comercial)",
      "Madera aserrada T9",
    ]);
  });

  it("nada interno viaja: ni costos, ni titulares, ni permisos, ni guías, ni a quién se apartó", () => {
    const json = JSON.stringify(r);
    for (const prohibido of [
      "999.99",
      "5555.55",
      "777.77",
      "4.5",
      "SANTA ROSA",
      "17-PUC",
      "019-001",
      "LOTE-SECRETO",
      "Juan",
      "paga el lunes",
      "El Sol",
      "PQ-",
      "nota interna",
      "Cedrelinga",
    ]) {
      expect(json, prohibido).not.toContain(prohibido);
    }
    expect(Object.keys(r).sort()).toEqual(["especies", "tomadaAt", "total"]);
  });

  it("un patio con todo de terceros queda vacío (Blas al 01-10: 13,254 m³ de WASACO)", () => {
    expect(maderaPublica([LIBRO[3]] as CorridaDelLibro[], TOMADA).especies).toEqual([]);
  });
});

describe("legible", () => {
  it.each([
    ["TORNILLO", "Tornillo"],
    ["MADERA ASERRADA (PAQUETERIA LARGA)", "Madera aserrada (paqueteria larga)"],
    ["MADERA ASERRADA Z3", "Madera aserrada Z3"],
    ["Shihuahuaco", "Shihuahuaco"],
    ["  CUMALA  ", "Cumala"],
  ])("%s → %s", (de, a) => expect(legible(de)).toBe(a));
});

describe("<VistaMaderaDisponible>", () => {
  const ctx = { tenantId: "t1", slug: "aserradero", enchufe: "tienda.portada" as const };
  const opciones = opcionesMaderaDisponible.parse({});
  const contacto = { negocio: "Aserradero Prueba", whatsapp: "987654321" };

  it("pt primero, m³, la hora de la foto y el WhatsApp con el 51 adelante", () => {
    const datos = { madera: maderaPublica(LIBRO as CorridaDelLibro[], TOMADA), contacto };
    render(<VistaMaderaDisponible ctx={ctx} opciones={opciones} datos={datos} />);
    expect(screen.getByRole("heading", { level: 2, name: "Madera disponible hoy" })).toBeTruthy();
    expect(screen.getByText(/contado el jueves 01\/10 a las 18:42/)).toBeTruthy();
    const pedir = screen.getByRole("link", { name: "Pedir Tornillo por WhatsApp" });
    expect(pedir.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
    expect(decodeURIComponent(pedir.getAttribute("href") ?? "")).toContain("Tornillo");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Tornillo",
      "Cumala",
    ]);
  });

  it("maxEspecies resume el resto en una línea", () => {
    const datos = { madera: maderaPublica(LIBRO as CorridaDelLibro[], TOMADA), contacto };
    render(
      <VistaMaderaDisponible ctx={ctx} opciones={{ ...opciones, maxEspecies: 1 }} datos={datos} />,
    );
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.getByText(/Y 1 especie más .*Cumala/)).toBeTruthy();
  });

  it("sin madera: aviso corto para encargar; sin madera y sin WhatsApp: nada", () => {
    const vacia = maderaPublica([], TOMADA);
    const { container, unmount } = render(
      <VistaMaderaDisponible ctx={ctx} opciones={opciones} datos={{ madera: vacia, contacto }} />,
    );
    expect(screen.getByRole("link", { name: /Encargar por WhatsApp/ })).toBeTruthy();
    unmount();
    const sinWa = render(
      <VistaMaderaDisponible
        ctx={ctx}
        opciones={opciones}
        datos={{ madera: vacia, contacto: { ...contacto, whatsapp: null } }}
      />,
    );
    expect(sinWa.container.innerHTML).toBe("");
    expect(container).toBeTruthy();
  });
});
