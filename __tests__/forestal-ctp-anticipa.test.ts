/**
 * Lo que el libro ve venir.
 *
 * Estas proyecciones existen para avisar UN DÍA ANTES de que algo sea
 * irreversible. Un aviso que llega tarde no sirve, y uno que llega cuando no
 * pasa nada enseña a ignorar la lista entera: las dos cosas se prueban acá.
 */
import { describe, expect, it } from "vitest";
import {
  HORIZONTE_DOCUMENTO_DIAS,
  avisosQueVienen,
  diasPara,
  type DatosAnticipa,
} from "@/lib/forestal/ctp-anticipa";
import { TROZAS_VARADAS_DIAS } from "@/lib/forestal/ctp-pendientes";

/** Un miércoles, para que restar días hábiles no cruce el fin de semana. */
const AHORA = Date.parse("2026-09-02T15:00:00Z");
const diaMenos = (n: number) => new Date(AHORA - n * 86_400_000).toISOString().slice(0, 10);
const diaMas = (n: number) => new Date(AHORA + n * 86_400_000).toISOString().slice(0, 10);

const base = (over: Partial<DatosAnticipa> = {}): DatosAnticipa => ({
  ingresos: [],
  documentos: [],
  patioM3: 0,
  consumidoM3: 0,
  consumoDias: 30,
  ...over,
});

const claves = (d: DatosAnticipa) => avisosQueVienen(d, AHORA).map((a) => a.clave);

describe("plazo de registro SERFOR", () => {
  it("avisa la guía que vence el plazo mañana, no la que recién entró", () => {
    const r = avisosQueVienen(
      base({
        ingresos: [
          // 1 día hábil usado ⇒ queda 1: entra
          { gtfNumber: "GTF-1", entryDate: diaMenos(1), registrado: false },
          // 0 días usados ⇒ quedan 2: todavía no urge
          { gtfNumber: "GTF-2", entryDate: diaMenos(0), registrado: false },
        ],
      }),
      AHORA,
    );
    expect(r).toHaveLength(1);
    // El título cuenta; los números de guía van en el detalle.
    expect(r[0].titulo).toBe("1 guía vence el plazo mañana");
    expect(r[0].detalle).toContain("GTF-1");
    expect(r[0].detalle).not.toContain("GTF-2");
  });

  it("lo YA vencido no entra: eso ya lo dice el score y no se puede corregir", () => {
    expect(claves(base({ ingresos: [{ gtfNumber: "GTF-V", entryDate: diaMenos(10), registrado: false }] }))).toEqual([]);
  });

  it("un asiento ya registrado no corre plazo", () => {
    expect(claves(base({ ingresos: [{ gtfNumber: "GTF-R", entryDate: diaMenos(1), registrado: true }] }))).toEqual([]);
  });

  it("agrupa las guías que vencen el mismo día en un solo aviso", () => {
    const r = avisosQueVienen(
      base({
        ingresos: [
          { gtfNumber: "A", entryDate: diaMenos(1), registrado: false },
          { gtfNumber: "B", entryDate: diaMenos(1), registrado: false },
          { gtfNumber: "C", entryDate: diaMenos(1), registrado: false },
        ],
      }),
      AHORA,
    );
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toContain("3 guías");
  });
});

describe("trozas por varar", () => {
  it("dice cuántas y cuántos m³ cruzan el umbral esta semana", () => {
    // Banda real medida en el tenant: 9 piezas ≥53 días − 7 ≥60 = 2 / 3.61 m³
    const r = avisosQueVienen(base({ trozasPorVarar: { piezas: 2, m3: 3.6135, ventanaDias: 7 } }), AHORA);
    expect(r[0].clave).toBe("trozas-por-varar");
    expect(r[0].titulo).toBe(`2 trozas cruzan los ${TROZAS_VARADAS_DIAS} días esta semana`);
    expect(r[0].detalle).toContain("3.61 m³");
  });

  it("una banda vacía no genera aviso — un aviso de cero enseña a ignorar la lista", () => {
    expect(claves(base({ trozasPorVarar: { piezas: 0, m3: 0, ventanaDias: 7 } }))).toEqual([]);
    expect(claves(base())).toEqual([]);
  });

  it("sin m³ medidos igual avisa: la pieza existe aunque no se sepa su volumen", () => {
    const r = avisosQueVienen(base({ trozasPorVarar: { piezas: 1, m3: 0, ventanaDias: 7 } }), AHORA);
    expect(r[0].titulo).toContain("1 troza cruza");
    expect(r[0].detalle).not.toContain("m³");
  });
});

describe("documentos que vencen con el patio cargado", () => {
  const conPatio = (over = {}) => base({ patioM3: 78.509, ...over });

  it("avisa el título que vence, y dice cuánta materia prima queda colgando", () => {
    const r = avisosQueVienen(
      conPatio({ documentos: [{ label: "PMF-2024-001", vencimiento: diaMas(10) }] }),
      AHORA,
    );
    expect(r[0].titulo).toBe("PMF-2024-001 vence en 10 días");
    // El m³ es el del PATIO ENTERO y se dice así: el libro no guarda saldo por título.
    expect(r[0].detalle).toContain("79 m³ de materia prima en el patio");
  });

  it("con el patio vacío un vencimiento es un trámite, no una alerta del libro", () => {
    expect(claves(base({ patioM3: 0, documentos: [{ label: "X", vencimiento: diaMas(5) }] }))).toEqual([]);
  });

  it("sin fecha cargada NO se inventa un vencimiento", () => {
    expect(claves(conPatio({ documentos: [{ label: "X", vencimiento: "" }] }))).toEqual([]);
    expect(claves(conPatio({ documentos: [{ label: "X", vencimiento: "cuando toque" }] }))).toEqual([]);
  });

  it("lo ya vencido y lo muy lejano quedan afuera", () => {
    expect(claves(conPatio({ documentos: [{ label: "X", vencimiento: diaMenos(3) }] }))).toEqual([]);
    expect(
      claves(conPatio({ documentos: [{ label: "X", vencimiento: diaMas(HORIZONTE_DOCUMENTO_DIAS + 1) }] })),
    ).toEqual([]);
  });

  it("a una semana o menos es urgente", () => {
    expect(avisosQueVienen(conPatio({ documentos: [{ label: "X", vencimiento: diaMas(5) }] }), AHORA)[0].gravedad).toBe("urgente");
    expect(avisosQueVienen(conPatio({ documentos: [{ label: "X", vencimiento: diaMas(20) }] }), AHORA)[0].gravedad).toBe("proximo");
  });
});

describe("cuánto dura el patio", () => {
  it("proyecta con el consumo REAL, no con una capacidad teórica", () => {
    // 90 m³ en 30 días = 3 m³/día; 45 m³ de patio ⇒ 15 días
    const r = avisosQueVienen(base({ patioM3: 45, consumidoM3: 90, consumoDias: 30 }), AHORA);
    expect(r[0].clave).toBe("patio-se-acaba");
    expect(r[0].titulo).toBe("El patio da para 15 días más");
    expect(r[0].detalle).toContain("3 m³/día");
  });

  it("con patio de sobra no dice nada", () => {
    expect(claves(base({ patioM3: 3000, consumidoM3: 90, consumoDias: 30 }))).toEqual([]);
  });

  it("sin consumo no se divide por cero ni se proyecta el infinito", () => {
    expect(claves(base({ patioM3: 500, consumidoM3: 0, consumoDias: 30 }))).toEqual([]);
    expect(claves(base({ patioM3: 500, consumidoM3: 90, consumoDias: 0 }))).toEqual([]);
  });

  it("a una semana o menos es urgente", () => {
    const r = avisosQueVienen(base({ patioM3: 15, consumidoM3: 90, consumoDias: 30 }), AHORA);
    expect(r[0].gravedad).toBe("urgente");
  });
});

describe("orden y vacío", () => {
  it("lo más cerca va arriba", () => {
    const r = avisosQueVienen(
      base({
        ingresos: [{ gtfNumber: "A", entryDate: diaMenos(1), registrado: false }], // 1 día
        documentos: [{ label: "T", vencimiento: diaMas(20) }], // 20 días
        patioM3: 30,
        consumidoM3: 90,
        consumoDias: 30, // 10 días
      }),
      AHORA,
    );
    expect(r.map((a) => a.dias)).toEqual([1, 10, 20]);
  });

  it("sin nada a la vista devuelve lista vacía", () => {
    expect(avisosQueVienen(base(), AHORA)).toEqual([]);
  });
});

describe("diasPara", () => {
  it("cuenta días de calendario y rechaza lo que no es una fecha", () => {
    expect(diasPara(diaMas(5), AHORA)).toBe(5);
    expect(diasPara(diaMenos(2), AHORA)).toBe(-2);
    expect(diasPara("", AHORA)).toBeNull();
    expect(diasPara("2026-13-45", AHORA)).toBeNull();
  });
});
