/**
 * Visitantes más exactos con el id de seguimiento del detector (`seg`, 10-10).
 *
 * A 40-80 px la ropa no distingue: la misma persona de frente y de costado da
 * más lejos que dos personas distintas. El detector del mosaico ya la sigue
 * cuadro a cuadro (`seguimiento.ts`); desde el 10-10 manda ese id con cada
 * caja de la foto y `visitantes.ts` junta por él antes que por el lugar y la
 * ropa. Casos reales: las fotos de la Entrada de Blas del 10-10 a las 07:57
 * (las mismas de `camaras-visitantes-duplicados`, ids y cámaras anonimizados),
 * con los `seg` que el detector les habría puesto según lo visto a ojo:
 * camisa blanca, polo oscuro y camisa celeste.
 */
import { describe, expect, it, vi } from "vitest";
import { SEG_VALIDO, leerCajasDelFormulario, leerCajasGuardadas, type CajaGuardada } from "@/lib/camaras/apariencia";
import { firmarCajas } from "@/lib/camaras/apariencia.server";
import { crearSeguimiento, nuevaSesionSeguimiento, segDeDetecciones, seguir } from "@/lib/camaras/seguimiento";
import { agruparPersonasDelDia, type FotoConCajas } from "@/lib/camaras/visitantes";
import { cajasEnFraccion } from "@/components/admin/forestal/camaras/subir-foto-persona";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

type Fila = [x: number, y: number, ancho: number, alto: number, confianza: number, firma: string | null, seg?: string];
const cajas = (filas: Fila[]): CajaGuardada[] =>
  filas.map(([x, y, ancho, alto, confianza, firma, seg]) => ({
    x,
    y,
    ancho,
    alto,
    confianza,
    firma,
    chaleco: false,
    ...(seg ? { seg } : {}),
  }));
const foto = (docId: string, at: string, filas: Fila[], camara = "entrada"): FotoConCajas => ({
  docId,
  at,
  camaraId: `cam-${camara}`,
  camaraNombre: camara,
  cajas: cajas(filas),
});
const sinSeg = (fotos: FotoConCajas[]): FotoConCajas[] =>
  fotos.map((f) => ({ ...f, cajas: f.cajas!.map((c) => ({ ...c, seg: undefined })) }));
const grupoCon = (r: ReturnType<typeof agruparPersonasDelDia>, docId: string, caja: number) =>
  r.grupos.find((g) => g.fotos.some((f) => f.docId === docId && f.caja === caja));

/* Blas, Entrada, 10-10 07:57 (Lima). `seg` de una sesión del detector «mgk3x9ab». */
const ENTRADA_0757: FotoConCajas[] = [
  foto("e1", "2026-10-10T12:57:28.047Z", [
    [0.8673, 0.4186, 0.0759, 0.2774, 0.8, "23004f000134020004309f00", "mgk3x9ab-1"], // celeste
    [0.8211, 0.3407, 0.0436, 0.1949, 0.71, "0000000026f1ef00000017dd", "mgk3x9ab-2"], // polo oscuro
    [0.744, 0.291, 0.0494, 0.1324, 0.69, "14000000001f5f0000001369", "mgk3x9ab-3"], // camisa blanca
    [0.7409, 0.3107, 0.0217, 0.1134, 0.53, "22000000011f13000000022f", "mgk3x9ab-4"], // blanca, repetida
  ]),
  foto("e2", "2026-10-10T12:57:39.163Z", [
    [0.5721, 0.27, 0.0435, 0.1725, 0.7, "00000000000fbf000000018f", "mgk3x9ab-3"], // camisa blanca (caminó)
    [0.7771, 0.3994, 0.0634, 0.2568, 0.68, "5f0002003765670011007fba", "mgk3x9ab-2"], // polo oscuro
    [0.6923, 0.4611, 0.0592, 0.2961, 0.64, "01000000112ffe000001bf7d", "mgk3x9ab-1"], // celeste, ahora de costado
    [0.803, 0.4013, 0.0333, 0.1324, 0.63, "3400151015fa73001301afb3", "mgk3x9ab-5"], // polo, repetida
    [0.6974, 0.4333, 0.0512, 0.1348, 0.62, "4c001810223f01000000002f", "mgk3x9ab-6"], // celeste, repetida
  ]),
];

describe("visitantes por el seg del detector — Blas, Entrada 10-10 07:57", () => {
  it("sin seg (fotos de antes): 4 visitantes; la celeste de frente y de costado sale como dos", () => {
    const r = agruparPersonasDelDia("2026-10-10", sinSeg(ENTRADA_0757));
    expect(r.visitantes).toBe(4);
    expect(grupoCon(r, "e1", 0)).not.toBe(grupoCon(r, "e2", 2));
  });

  it("con seg: 3 visitantes, cada uno con sus dos fotos", () => {
    const r = agruparPersonasDelDia("2026-10-10", ENTRADA_0757);
    expect(r.visitantes).toBe(3);
    expect(r.repetidasEnFoto).toBe(3);
    expect(grupoCon(r, "e1", 0)).toBe(grupoCon(r, "e2", 2)); // celeste
    expect(grupoCon(r, "e1", 1)).toBe(grupoCon(r, "e2", 1)); // polo oscuro
    expect(grupoCon(r, "e1", 2)).toBe(grupoCon(r, "e2", 0)); // camisa blanca
    for (const g of r.grupos) expect(g.fotos.map((f) => f.docId)).toEqual(["e1", "e2"]);
  });

  it("una sola foto con sus tres personas sigue dando tres (cada una con su seg)", () => {
    expect(agruparPersonasDelDia("2026-10-10", [ENTRADA_0757[0]]).visitantes).toBe(3);
  });
});

const ROJA = "7f0000000000000000000000";
const AZUL = "00000000007f000000000000";

describe("reglas del seg", () => {
  it("une aunque la ropa y el lugar digan otra cosa (se acercó: 2× más grande y lejos de donde estaba)", () => {
    const fotos = [
      foto("f1", "2026-10-10T14:00:00Z", [[0.1, 0.2, 0.03, 0.1, 0.7, ROJA, "abcd1234-7"]]),
      foto("f2", "2026-10-10T14:00:20Z", [[0.6, 0.4, 0.07, 0.25, 0.8, AZUL, "abcd1234-7"]]),
    ];
    expect(agruparPersonasDelDia("2026-10-10", sinSeg(fotos)).visitantes).toBe(2);
    const r = agruparPersonasDelDia("2026-10-10", fotos);
    expect(r.visitantes).toBe(1);
    expect(r.grupos[0].fotos.map((f) => f.docId)).toEqual(["f1", "f2"]);
  });

  it("nunca dos cajas de la MISMA foto, aunque traigan el mismo seg", () => {
    const r = agruparPersonasDelDia("2026-10-10", [
      foto("f1", "2026-10-10T14:00:00Z", [
        [0.1, 0.2, 0.03, 0.1, 0.7, ROJA, "abcd1234-7"],
        [0.7, 0.2, 0.03, 0.1, 0.7, AZUL, "abcd1234-7"],
      ]),
    ]);
    expect(r.visitantes).toBe(2);
  });

  it("el mismo seg en OTRA cámara no une", () => {
    const r = agruparPersonasDelDia("2026-10-10", [
      foto("f1", "2026-10-10T14:00:00Z", [[0.1, 0.2, 0.03, 0.1, 0.7, ROJA, "abcd1234-7"]], "entrada"),
      foto("f2", "2026-10-10T14:00:20Z", [[0.6, 0.4, 0.07, 0.25, 0.8, AZUL, "abcd1234-7"]], "patio"),
    ]);
    expect(r.visitantes).toBe(2);
  });

  it("la figura lejana sin firma con el mismo seg es su llegada (no queda «sin agrupar»)", () => {
    const fotos = [
      foto("f1", "2026-10-10T14:00:00Z", [[0.05, 0.1, 0.008, 0.03, 0.55, null, "abcd1234-9"]]),
      foto("f2", "2026-10-10T14:00:30Z", [[0.5, 0.4, 0.06, 0.2, 0.8, ROJA, "abcd1234-9"]]),
    ];
    expect(agruparPersonasDelDia("2026-10-10", sinSeg(fotos)).sinAgrupar).toBe(1);
    const r = agruparPersonasDelDia("2026-10-10", fotos);
    expect(r.sinAgrupar).toBe(0);
    expect(r.visitantes).toBe(1);
    expect(r.grupos[0].desde).toBe("2026-10-10T14:00:00.000Z");
  });

  it("una tira de antes que se le suma después no le cambia la clave (las uniones a mano no se pierden)", () => {
    const g = foto("g", "2026-10-10T14:00:00Z", [[0.5, 0.4, 0.06, 0.2, 0.8, ROJA, "abcd1234-2"]]);
    const lejana = foto("t", "2026-10-10T13:59:50Z", [[0.05, 0.1, 0.008, 0.03, 0.55, null, "abcd1234-3"]]);
    // 30 s después: la misma persona y, metida en su caja, la detección que venía de lejos.
    const despues = foto("d", "2026-10-10T14:00:30Z", [
      [0.5, 0.4, 0.06, 0.2, 0.8, ROJA, "abcd1234-2"],
      [0.51, 0.45, 0.04, 0.1, 0.6, null, "abcd1234-3"],
    ]);
    const antes = agruparPersonasDelDia("2026-10-10", [lejana, g]);
    const r = agruparPersonasDelDia("2026-10-10", [lejana, g, despues]);
    expect(r.visitantes).toBe(1);
    expect(r.sinAgrupar).toBe(0);
    expect(r.grupos[0].clave).toBe(antes.grupos[0].clave);
    expect(r.grupos[0].clave).toBe("g#0");
    expect(r.grupos[0].desde).toBe("2026-10-10T13:59:50.000Z");
  });

  it("si una de sus fotos vio el chaleco, es personal", () => {
    const fotos = [
      foto("f1", "2026-10-10T14:00:00Z", [[0.1, 0.2, 0.03, 0.1, 0.7, ROJA, "abcd1234-7"]]),
      foto("f2", "2026-10-10T14:00:20Z", [[0.6, 0.4, 0.07, 0.25, 0.8, AZUL, "abcd1234-7"]]),
    ];
    fotos[1].cajas = fotos[1].cajas!.map((c) => ({ ...c, chaleco: true }));
    const r = agruparPersonasDelDia("2026-10-10", fotos);
    expect(r.personas).toBe(1);
    expect(r.conChaleco).toBe(1);
  });
});

describe("seg del seguimiento del detector", () => {
  const det = (x: number, confianza = 0.8) => ({ x, y: 0.4, ancho: 0.05, alto: 0.2, confianza });

  it("no se repite aunque el número vuelva a 1 con el cuadro vacío", () => {
    const s = crearSeguimiento("mgk3x9ab");
    const [a] = seguir(s, [det(0.3)], 0);
    expect(seguir(s, [det(0.31)], 1_000)[0].seg).toBe(a.seg);
    expect(seguir(s, [], 20_000)).toEqual([]);
    const [b] = seguir(s, [det(0.3)], 21_000);
    expect(b.id).toBe(a.id);
    expect(b.seg).not.toBe(a.seg);
    expect([a.seg, b.seg]).toEqual(["mgk3x9ab-1", "mgk3x9ab-2"]);
  });

  it("cada detección de la mirada recibe el seg de su persona, en orden; la estimada no", () => {
    const s = crearSeguimiento("mgk3x9ab");
    seguir(s, [det(0.1), det(0.7)], 0);
    const quedan = [det(0.71, 0.6), det(0.11, 0.9)];
    const vivo = seguir(s, quedan, 1_000);
    expect(segDeDetecciones(vivo, quedan)).toEqual(["mgk3x9ab-2", "mgk3x9ab-1"]);
    const sola = [det(0.12)];
    expect(segDeDetecciones(seguir(s, sola, 2_000), sola)).toEqual(["mgk3x9ab-1"]);
  });

  it("la sesión nueva cumple el formato que acepta la ruta", () => {
    for (const ahora of [0, Date.parse("2026-10-10T15:00:00Z"), Date.parse("2099-12-31T23:59:59Z")]) {
      expect(`${nuevaSesionSeguimiento(ahora)}-999999`).toMatch(SEG_VALIDO);
    }
    expect(seguir(crearSeguimiento(), [det(0.3)], 0)[0].seg).toMatch(SEG_VALIDO);
  });
});

describe("seg de punta a punta: formulario → firma → metadata", () => {
  const una = { x: 0.1, y: 0.2, ancho: 0.05, alto: 0.2, confianza: 0.8 };

  it("el formulario lo acepta opcional y rechaza uno mal formado", () => {
    expect(leerCajasDelFormulario(JSON.stringify([{ ...una, seg: "mgk3x9ab-12" }]))).toEqual({
      ok: true,
      cajas: [{ ...una, seg: "mgk3x9ab-12" }],
    });
    expect(leerCajasDelFormulario(JSON.stringify([una]))).toEqual({ ok: true, cajas: [una] });
    for (const malo of ["", "MGK-1", "mgk3x9ab", "mgk3x9ab-", "a-1", "<script>-1", "mgk3x9ab-1234567"]) {
      expect(leerCajasDelFormulario(JSON.stringify([{ ...una, seg: malo }]))).toEqual({ ok: false });
    }
  });

  it("el servidor lo guarda tal cual y la metadata lo devuelve", async () => {
    // Imagen ilegible: las cajas quedan sin firma, pero con su seg.
    const guardadas = await firmarCajas(Buffer.from("no es una imagen"), [{ ...una, seg: "mgk3x9ab-12" }, una]);
    expect(guardadas.map((c) => c.seg)).toEqual(["mgk3x9ab-12", undefined]);
    expect(leerCajasGuardadas({ cajas: guardadas })?.map((c) => c.seg)).toEqual(["mgk3x9ab-12", undefined]);
  });

  it("el cliente lo manda con la caja en fracciones", () => {
    const fr = cajasEnFraccion(
      [
        { x: 64, y: 72, ancho: 32, alto: 144, confianza: 0.6, seg: "mgk3x9ab-3" },
        { x: 320, y: 72, ancho: 32, alto: 144, confianza: 0.9 },
      ],
      640,
      360,
    );
    expect(fr.map((c) => c.seg)).toEqual([undefined, "mgk3x9ab-3"]);
  });
});
