/**
 * «Acomodar trozas en su especie» (ADR-435) — la lógica pura.
 *
 * El caso que la motivó sale de Blas (sólo lectura, 2026-09-25): la GTF
 * 010-001-0000005 declara Cachimbo 5 pz / 11,810 m³, Shimbillo 1 / 2,991 y
 * Copal 1 / 1,752, pero sus 7 trozas colgaban TODAS de la fila Copal. La
 * simulación sobre las 21 filas del permiso 10-HUA mueve 29 de 46 trozas y deja
 * las 21 filas con trozas = piezas declaradas (antes, 0 de 21).
 */
import { describe, expect, it } from "vitest";
import {
  colocarAlCargar,
  filaDeEspecie,
  fraseDeColocacion,
  planearAcomodo,
  porQueNoSeMueve,
  type FilaAcomodar,
  type TrozaAcomodar,
} from "@/lib/forestal/acomodar-trozas";

const fila = (id: string, especie: string, over: Partial<FilaAcomodar> = {}): FilaAcomodar => ({
  id,
  guia: "|010-001-0000005",
  gtf: "010-001-0000005",
  libroNro: null,
  especie,
  cientifico: null,
  m3Declarado: 0,
  piezasDeclaradas: 0,
  traba: null,
  ...over,
});

const troza = (id: string, woodEntryId: string, especieComun: string | null, m3: number | null, over: Partial<TrozaAcomodar> = {}): TrozaAcomodar => ({
  id,
  woodEntryId,
  codigo: id,
  especieComun,
  especieCientifica: null,
  m3,
  madreId: null,
  consumida: false,
  despachada: false,
  corteEnMesCerrado: false,
  loteAbierto: null,
  ...over,
});

/** La GTF 0000005 de Blas tal como estaba el 25-09. */
const filas5 = [
  fila("cachimbo", "Cachimbo", { libroNro: 1, m3Declarado: 11.81, piezasDeclaradas: 5 }),
  fila("shimbillo", "Shimbillo", { libroNro: 2, m3Declarado: 2.991, piezasDeclaradas: 1 }),
  fila("copal", "Copal", { libroNro: 3, m3Declarado: 1.752, piezasDeclaradas: 1 }),
];
const trozas5 = [
  troza("115-A", "copal", "Cachimbo", 2.808),
  troza("115-B", "copal", "Cachimbo", 2.153),
  troza("115-C", "copal", "Cachimbo", 1.956),
  troza("116-B", "copal", "Shimbillo", 2.991),
  troza("226-B", "copal", "Cachimbo", 1.44),
  troza("233-A", "copal", "Cachimbo", 3.453),
  troza("215-X", "copal", "Copal", 1.752),
];

describe("filaDeEspecie — a qué fila de la guía pertenece una troza", () => {
  it("compara sin tildes, mayúsculas ni el binomio entre paréntesis", () => {
    const filas = [fila("a", "Azúcar huayo"), fila("b", "Tornillo (Cedrelinga catenaeformis)")];
    expect(filaDeEspecie({ especieComun: "AZUCAR HUAYO" }, filas).fila?.id).toBe("a");
    expect(filaDeEspecie({ especieComun: "tornillo" }, filas).fila?.id).toBe("b");
  });

  it("dos filas de la misma especie: desempata el nombre científico", () => {
    const filas = [
      fila("c1", "Cumala", { cientifico: "Virola sebifera" }),
      fila("c2", "Cumala", { cientifico: "Iryanthera juruensis" }),
    ];
    const d = filaDeEspecie({ especieComun: "Cumala", especieCientifica: "IRYANTHERA  JURUENSIS" }, filas);
    expect(d.fila?.id).toBe("c2");
  });

  it("dos filas de la misma especie y sin científico: no elige a ojo", () => {
    const filas = [fila("c1", "Cumala"), fila("c2", "Cumala")];
    const d = filaDeEspecie({ especieComun: "Cumala" }, filas);
    expect(d.fila).toBeNull();
    expect(d.motivo).toBe("dos_filas");
  });

  it("sin nombre común que coincida, cae al científico", () => {
    const filas = [fila("c1", "Cumala", { cientifico: "Virola sebifera" }), fila("x", "Copal")];
    expect(filaDeEspecie({ especieComun: "Cumala blanca", especieCientifica: "Virola sebifera" }, filas).fila?.id).toBe("c1");
  });

  it("especie sin fila en la guía, o troza sin especie", () => {
    expect(filaDeEspecie({ especieComun: "Lupuna" }, filas5).motivo).toBe("sin_fila");
    expect(filaDeEspecie({ especieComun: " " }, filas5).motivo).toBe("sin_especie");
  });
});

describe("planearAcomodo — lo que ya está cargado", () => {
  it("la GTF 0000005 de Blas: 6 trozas pasan de Copal a su especie y las 3 filas cuadran", () => {
    const plan = planearAcomodo(filas5, trozas5);
    const g = plan.guias[0]!;
    expect(g.mover).toHaveLength(6);
    expect(g.mover.filter((m) => m.hacia.id === "cachimbo")).toHaveLength(5);
    expect(g.mover.find((m) => m.trozaId === "116-B")?.hacia.especie).toBe("Shimbillo");
    expect(g.bienPuestas).toBe(1);

    const porId = new Map(g.filas.map((f) => [f.id, f]));
    // Antes: Copal con 7 trozas y 16,553 m³ contra 1 pieza y 1,752 m³ declarados.
    expect(porId.get("copal")!.antes).toMatchObject({ trozas: 7, m3: 16.553, piezasCuadran: false, cuadre: "sobran" });
    expect(porId.get("cachimbo")!.antes).toMatchObject({ trozas: 0, m3: null, cuadre: "sin-piezas" });
    // Después: cada fila con sus trozas, igual a lo que declara.
    expect(porId.get("cachimbo")!.despues).toMatchObject({ trozas: 5, m3: 11.81, piezasCuadran: true, cuadre: "cuadra" });
    expect(porId.get("shimbillo")!.despues).toMatchObject({ trozas: 1, m3: 2.991, cuadre: "cuadra" });
    expect(porId.get("copal")!.despues).toMatchObject({ trozas: 1, m3: 1.752, cuadre: "cuadra" });
    expect(plan.totales).toMatchObject({ mover: 6, m3Mover: 14.801, filasQueCuadranAntes: 0, filasQueCuadranDespues: 3 });
  });

  it("nunca pierde una troza: el total de trozas y de m³ de la guía no cambia", () => {
    const g = planearAcomodo(filas5, trozas5).guias[0]!;
    const suma = (k: "antes" | "despues") => g.filas.reduce((s, f) => s + f[k].trozas, 0);
    const m3 = (k: "antes" | "despues") => g.filas.reduce((s, f) => s + (f[k].m3 ?? 0), 0);
    expect(suma("despues")).toBe(suma("antes"));
    expect(m3("despues")).toBeCloseTo(m3("antes"), 6);
  });

  it("una guía de una sola especie no entra al plan", () => {
    expect(planearAcomodo([fila("solo", "Copal")], [troza("t", "solo", "Cachimbo", 1)]).guias).toEqual([]);
  });

  it("nunca cruza de guía aunque otra GTF tenga la fila de su especie", () => {
    const otra = fila("cachimbo-6", "Cachimbo", { guia: "|010-001-0000006", gtf: "010-001-0000006" });
    const otraCopal = fila("copal-6", "Copal", { guia: "|010-001-0000006", gtf: "010-001-0000006" });
    const plan = planearAcomodo([fila("copal", "Copal"), fila("shimbillo", "Shimbillo"), otra, otraCopal], [troza("t", "copal", "Cachimbo", 1)]);
    const g = plan.guias.find((x) => x.gtf === "010-001-0000005")!;
    expect(g.mover).toHaveLength(0);
    expect(g.sinFila[0]?.motivo).toBe("sin_fila");
  });

  it("lo bloqueado se queda y dice por qué", () => {
    const filas = [...filas5.slice(0, 2), fila("copal", "Copal", { traba: null })];
    const plan = planearAcomodo(filas, [
      troza("consumida", "copal", "Cachimbo", 1, { consumida: true }),
      troza("despachada", "copal", "Cachimbo", 1, { despachada: true }),
      troza("libre", "copal", "Cachimbo", 1),
    ]);
    const g = plan.guias[0]!;
    expect(g.mover.map((m) => m.trozaId)).toEqual(["libre"]);
    expect(g.quietas.map((q) => [q.trozaId, q.motivo])).toEqual([
      ["consumida", "consumida"],
      ["despachada", "despachada"],
    ]);
    expect(porQueNoSeMueve(g.quietas[0]!)).toMatch(/corrida/);
  });

  it("mes cerrado o costo congelado en la fila de origen o de destino: no se toca", () => {
    const cerradaOrigen = planearAcomodo(
      [fila("cachimbo", "Cachimbo"), fila("copal", "Copal", { traba: "mes_cerrado" })],
      [troza("t", "copal", "Cachimbo", 1)],
    ).guias[0]!;
    expect(cerradaOrigen.quietas[0]?.motivo).toBe("origen_mes_cerrado");
    expect(porQueNoSeMueve(cerradaOrigen.quietas[0]!)).toBe("la fila de Copal está en un mes cerrado");

    const congeladoDestino = planearAcomodo(
      [fila("cachimbo", "Cachimbo", { traba: "costo_congelado" }), fila("copal", "Copal")],
      [troza("t", "copal", "Cachimbo", 1)],
    ).guias[0]!;
    expect(congeladoDestino.quietas[0]?.motivo).toBe("destino_costo_congelado");
    expect(porQueNoSeMueve(congeladoDestino.quietas[0]!)).toBe("la fila de Cachimbo tiene el costo congelado");
  });

  it("una retrozada se mueve con TODOS sus pedazos; si un pedazo se consumió, la familia se queda", () => {
    const filas = [fila("cachimbo", "Cachimbo"), fila("copal", "Copal")];
    const libre = planearAcomodo(filas, [
      troza("madre", "copal", "Cachimbo", 2),
      troza("p1", "copal", "Cachimbo", 1, { madreId: "madre" }),
      troza("p2", "copal", "Cachimbo", 1, { madreId: "madre" }),
      troza("nieto", "copal", "Cachimbo", 0.5, { madreId: "p2" }),
    ]).guias[0]!;
    expect(libre.mover).toHaveLength(1);
    expect(libre.mover[0]!.pedazos.sort()).toEqual(["nieto", "p1", "p2"]);
    // El cuadre cuenta trozas de la guía, no pedazos.
    expect(libre.filas.find((f) => f.id === "cachimbo")!.despues.trozas).toBe(1);

    const conPedazoConsumido = planearAcomodo(filas, [
      troza("madre", "copal", "Cachimbo", 2),
      troza("p1", "copal", "Cachimbo", 1, { madreId: "madre", consumida: true }),
    ]).guias[0]!;
    expect(conPedazoConsumido.mover).toHaveLength(0);
    expect(conPedazoConsumido.quietas[0]?.motivo).toBe("consumida");

    const cortadaEnMesCerrado = planearAcomodo(filas, [
      troza("madre", "copal", "Cachimbo", 2),
      troza("p1", "copal", "Cachimbo", 1, { madreId: "madre", corteEnMesCerrado: true }),
    ]).guias[0]!;
    expect(cortadaEnMesCerrado.quietas[0]?.motivo).toBe("corte_en_mes_cerrado");
  });

  it("una troza en un lote ABIERTO no se mueve: el consumo del lote anota m³ y piezas en dos pasos", () => {
    const g = planearAcomodo(
      [fila("cachimbo", "Cachimbo"), fila("copal", "Copal")],
      [
        troza("en-lote", "copal", "Cachimbo", 1, { loteAbierto: "LA-2026-004" }),
        troza("madre", "copal", "Cachimbo", 2),
        troza("pedazo-en-lote", "copal", "Cachimbo", 1, { madreId: "madre", loteAbierto: "LA-2026-005" }),
        troza("libre", "copal", "Cachimbo", 1),
      ],
    ).guias[0]!;
    expect(g.mover.map((m) => m.trozaId)).toEqual(["libre"]);
    expect(g.quietas.map((q) => [q.trozaId, q.motivo, q.lote])).toEqual([
      ["en-lote", "en_lote", "LA-2026-004"],
      ["madre", "en_lote", "LA-2026-005"],
    ]);
    expect(porQueNoSeMueve(g.quietas[0]!)).toBe("está en el lote LA-2026-004, sin aserrar todavía");
  });

  it("una fila anulada no recibe, y sus propias piezas no se mencionan", () => {
    const plan = planearAcomodo(
      [fila("cachimbo", "Cachimbo", { traba: "anulada" }), fila("copal", "Copal"), fila("shimbillo", "Shimbillo")],
      [troza("t", "copal", "Cachimbo", 1), troza("propia", "cachimbo", "Cachimbo", 1)],
    );
    const g = plan.guias[0]!;
    expect(g.mover).toHaveLength(0);
    expect(g.sinFila.map((q) => q.trozaId)).toEqual(["t"]);
    expect(g.filas.map((f) => f.id)).not.toContain("cachimbo");
  });
});

describe("colocarAlCargar — al crear o completar la guía", () => {
  const filas = [
    { id: "cachimbo", especie: "Cachimbo", puedeRecibir: true },
    { id: "shimbillo", especie: "Shimbillo", puedeRecibir: false },
    { id: "copal", especie: "Copal", puedeRecibir: true },
  ];

  it("cada troza a la fila de su especie; lo que no tiene fila queda en la de la carga y se dice", () => {
    const r = colocarAlCargar(
      [
        { especieComun: "CACHIMBO", codificacion: "115-A" },
        { especieComun: "Copal", codificacion: "215" },
        { especieComun: "Lupuna", codificacion: "9" },
        { especieComun: null, codificacion: "sin" },
      ],
      filas,
      "copal",
    );
    expect(r.map((c) => [c.troza.codificacion, c.filaId, c.nota])).toEqual([
      ["115-A", "cachimbo", null],
      ["215", "copal", null],
      ["9", "copal", "sin_fila"],
      ["sin", "copal", null],
    ]);
  });

  it("si la fila de su especie no recibiría piezas por sí sola, se queda en la de la carga (como antes)", () => {
    const [c] = colocarAlCargar([{ especieComun: "Shimbillo" }], filas, "copal");
    expect(c).toMatchObject({ filaId: "copal", nota: "fila_no_recibe", filaDeSuEspecie: "shimbillo" });
  });

  it("guía de una sola fila: todo a esa fila; la troza de otra especie se avisa, la sin especie no", () => {
    const r = colocarAlCargar(
      [{ especieComun: "Lupuna" }, { especieComun: "COPAL" }, { especieComun: null }],
      [{ id: "a", especie: "Copal", puedeRecibir: true }],
      "a",
    );
    expect(r.map((c) => [c.filaId, c.nota])).toEqual([
      ["a", "sin_fila"],
      ["a", null],
      ["a", null],
    ]);
  });

  it("la frase del importador cuenta por especie y marca el AVISO", () => {
    const f = fraseDeColocacion(
      [
        { especie: "Cachimbo", agregadas: 5 },
        { especie: "Copal", agregadas: 2 },
      ],
      [{ especie: "Lupuna", nota: "sin_fila" }, { especie: "lupuna", nota: "sin_fila" }],
      "Copal",
    );
    expect(f).toBe(
      " · cada una en la fila de su especie (5 Cachimbo, 2 Copal) · AVISO: 2 trozas de Lupuna quedaron en la fila de Copal: la guía no tiene fila de su especie",
    );
  });
});
