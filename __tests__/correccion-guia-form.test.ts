/**
 * Pedir corrección de una guía emitida (ADR-512): la lógica pura del
 * formulario. Qué filas cuentan, qué errores salen por fila y el body que
 * viaja al servidor (validado con el MISMO schema que la ruta).
 */
import { describe, expect, it } from "vitest";
import { armarPedido, lineaDeLaClave, MAX_CAMBIOS, type LineaCambio } from "@/components/admin/forestal/correccion-guia/correccion-form";
import { diaDeLaGuia, diaDelPedido } from "@/components/admin/forestal/correccion-guia/fecha";
import type { OpcionCorregible } from "@/components/admin/forestal/correccion-guia/opciones-de-la-guia";

const OPCIONES: OpcionCorregible[] = [
  { donde: "casillero", clave: "28", etiqueta: "(28) Placa", dice: "AHX-812" },
  { donde: "casillero", clave: "22", etiqueta: "(22) Destinatario", dice: null },
  { donde: "item", clave: "T-014", etiqueta: "Troza T-014", dice: "Cumala · 3,20 m" },
];

const fila = (id: string, opcion = "", correcto = ""): LineaCambio => ({ id, opcion, correcto });
const base = { entityType: "loth_gtf" as const, entityId: "gtf1", opciones: OPCIONES, motivo: "El chofer cambió de camión." };

describe("armarPedido", () => {
  it("arma el body con los cambios elegidos y descarta las filas en blanco", () => {
    const r = armarPedido({
      ...base,
      lineas: [fila("a", "casillero:28", " AHX-821 "), fila("b"), fila("c", "item:T-014", "Cumala · 3,40 m")],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({
      entityType: "loth_gtf",
      entityId: "gtf1",
      cambios: [
        { donde: "casillero", clave: "28", correcto: "AHX-821" },
        { donde: "item", clave: "T-014", correcto: "Cumala · 3,40 m" },
      ],
      motivo: "El chofer cambió de camión.",
    });
  });

  it("la única fila en blanco sí cuenta: pide elegir y escribir", () => {
    const r = armarPedido({ ...base, lineas: [fila("a")] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.lineas.a).toEqual({ opcion: "Elige el casillero o la troza", correcto: "Escribe lo que debería decir" });
  });

  it("marca la fila repetida, la que repite lo que dice hoy y la que no eligió", () => {
    const r = armarPedido({
      ...base,
      lineas: [fila("a", "casillero:28", "AHX-821"), fila("b", "casillero:28", "AHX-999"), fila("c", "casillero:28x", "x"), fila("d", "item:T-014", "Cumala · 3,20 m")],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores.lineas.a).toBeUndefined();
    expect(r.errores.lineas.b?.opcion).toBe("Ya está en otra fila de este pedido");
    expect(r.errores.lineas.c?.opcion).toBe("Elige el casillero o la troza");
    expect(r.errores.lineas.d?.correcto).toBe("Es lo mismo que dice hoy");
  });

  it("un casillero sin vista previa (dice null) acepta cualquier texto", () => {
    const r = armarPedido({ ...base, lineas: [fila("a", "casillero:22", "Maderera Ucayali SAC")] });
    expect(r.ok).toBe(true);
  });

  it("pide el motivo y le pone tope", () => {
    const corto = armarPedido({ ...base, motivo: " mal ", lineas: [fila("a", "casillero:28", "AHX-821")] });
    const largo = armarPedido({ ...base, motivo: "x".repeat(1001), lineas: [fila("a", "casillero:28", "AHX-821")] });
    expect(!corto.ok && corto.errores.motivo).toBe("Cuenta en una frase por qué hay que corregirla");
    expect(!largo.ok && largo.errores.motivo).toBe("Hasta 1000 letras");
  });

  it("tope de texto por cambio y de cambios por pedido", () => {
    const texto = armarPedido({ ...base, lineas: [fila("a", "casillero:28", "x".repeat(301))] });
    expect(!texto.ok && texto.errores.lineas.a?.correcto).toBe("Hasta 300 letras");
    const muchas = Array.from({ length: MAX_CAMBIOS + 1 }, (_, i) => fila(`f${i}`, "casillero:28", `P-${i}`));
    const tope = armarPedido({ ...base, lineas: muchas });
    expect(!tope.ok && tope.errores.general).toMatch(/Hasta 20 cambios/);
  });

  it("la evidencia viaja sin repetidos y sin el campo si no hay", () => {
    const con = armarPedido({ ...base, lineas: [fila("a", "casillero:28", "AHX-821")], documentoIds: ["d1", "d1", "d2"] });
    const sin = armarPedido({ ...base, lineas: [fila("a", "casillero:28", "AHX-821")], documentoIds: [] });
    expect(con.ok && con.body.documentoIds).toEqual(["d1", "d2"]);
    expect(sin.ok && "documentoIds" in sin.body && sin.body.documentoIds !== undefined).toBe(false);
  });
});

describe("lineaDeLaClave (400 casillero_desconocido / item_desconocido)", () => {
  const lineas = [fila("a", "casillero:28", "x"), fila("b", "item:T-014", "y")];
  it("encuentra la fila aunque el servidor normalice la clave", () => {
    expect(lineaDeLaClave(lineas, "item", "t-014")).toBe("b");
    expect(lineaDeLaClave(lineas, "casillero", "(28)")).toBe("a");
  });
  it("no confunde un casillero con una troza de la misma clave ni inventa filas", () => {
    expect(lineaDeLaClave(lineas, "item", "28")).toBeNull();
    expect(lineaDeLaClave(lineas, undefined, "NO-EXISTE")).toBeNull();
  });
});

describe("fechas del pedido", () => {
  it("la fecha de la guía (date-only) no se corre un día", () => {
    expect(diaDeLaGuia("2026-09-10")).toBe("jueves 10/09");
  });
  it("el pedido se fecha en Lima: 22:00 del jueves sigue siendo jueves", () => {
    expect(diaDelPedido("2026-09-11T03:00:00.000Z")).toBe("jueves 10/09");
  });
});
