/**
 * SIRE RVIE (tramo 1): del libro de trabajo 14.1 al TXT de 33 campos. Los casos salen de la
 * ficha `.claude/autonomo/noche-04-11/sire-formato.md` §8: factura, boleta < y ≥ S/ 700, nota
 * de crédito con referencia, anulado en ceros, texto con «|», venta sin serie → bloqueo y el
 * nombre exacto del archivo. Las filas pasan por `armarRegistroVentas` (las claves reales).
 */
import { describe, expect, it } from "vitest";
import { armarRegistroVentas, type ComprobanteEmitido, type EntradaRegistroVentas } from "@/lib/contabilidad/libros/registro-ventas";
import { armarSireRvie, MOTIVO_SIRE, montoSire, nombreArchivoRvie, resumirBloqueos, rucValido } from "@/lib/contabilidad/libros/sire-rvie";
import type { FilaLibro } from "@/lib/contabilidad/libros/comun";

const RUC = "20100066603";
const NEGOCIO = { ruc: RUC, razonSocial: "BODEGA SAN MARTIN S.A.C.", periodo: "2026-10" };
const dia = (d: number) => new Date(Date.UTC(2026, 9, d, 15, 0, 0)); // 10:00 en Lima

function comprobante(p: Partial<ComprobanteEmitido> & Pick<ComprobanteEmitido, "id" | "tipo" | "serie" | "numero">): ComprobanteEmitido {
  return { clienteDoc: null, clienteNombre: "", subtotal: 100, igv: 18, total: 118, estado: "accepted", emitidoEn: dia(10), pedidoId: null, ...p };
}

function libro(c: ComprobanteEmitido[], extra: Partial<EntradaRegistroVentas> = {}): FilaLibro[] {
  return armarRegistroVentas({
    periodo: "2026-10",
    comprobantes: c,
    ventasPos: [],
    pedidos: [],
    notasCredito: [],
    pedidosSinEntregar: 0,
    pedidosConComprobante: [],
    devoluciones: [],
    ...extra,
  }).filas;
}

function generar(filas: FilaLibro[]) {
  const r = armarSireRvie(filas, NEGOCIO);
  if (!r.ok) throw new Error(r.error);
  const lineas = r.contenidoTxt.split("\r\n").filter(Boolean);
  return { ...r, campos: lineas.map((l) => l.split("|")) };
}

describe("SIRE RVIE — nombre y formato", () => {
  it("nombre exacto: LE + RUC + AAAAMM + 00 + 140400 + 02 + 1 + 1 + 1 + 2", () => {
    expect(nombreArchivoRvie(RUC, "202610", true)).toBe("LE2010006660320261000140400021112.txt");
    expect(nombreArchivoRvie(RUC, "202610", false)).toBe("LE2010006660320261000140400021012.txt");
    const r = generar(libro([comprobante({ id: "f1", tipo: "factura", serie: "F001", numero: 1, clienteDoc: "20131312955", clienteNombre: "SUNAT" })]));
    expect(r.nombreArchivo).toBe("LE2010006660320261000140400021112.txt");
    expect(r.nombreZip).toBe("LE2010006660320261000140400021112.zip");
  });

  it("montos con punto y 2 decimales, sin miles; negativos con guion", () => {
    expect(montoSire(1234567.5)).toBe("1234567.50");
    expect(montoSire(-18)).toBe("-18.00");
    expect(montoSire(null)).toBe("0.00");
    expect(montoSire(-0.001)).toBe("0.00");
  });

  it("RUC con dígito verificador", () => {
    expect(rucValido("20100066603")).toBe(true);
    expect(rucValido("20100066604")).toBe(false);
  });

  it("negocio sin RUC → error claro, sin archivo", () => {
    const r = armarSireRvie([], { ...NEGOCIO, ruc: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no tiene RUC/);
  });

  it("mes sin ventas → archivo «sin información» (posición 31 = 0)", () => {
    const r = generar([]);
    expect(r.nombreArchivo).toBe("LE2010006660320261000140400021012.txt");
    expect(r.contenidoTxt).toBe("");
  });
});

describe("SIRE RVIE — filas", () => {
  it("factura: 33 campos + «|» final, campos 1-3 del negocio, CAR vacío, PEN e ICBPER 0.00", () => {
    const r = generar(libro([comprobante({ id: "f1", tipo: "factura", serie: "F001", numero: 7, clienteDoc: "20131312955", clienteNombre: "SUNAT" })]));
    expect(r.bloqueos).toEqual([]);
    const c = r.campos[0];
    expect(c).toHaveLength(34); // 33 campos + el vacío después del «|» final
    expect(c.slice(0, 13)).toEqual([RUC, "BODEGA SAN MARTIN S.A.C.", "202610", "", "10/10/2026", "", "01", "F001", "7", "", "6", "20131312955", "SUNAT"]);
    expect(c[14]).toBe("100.00"); // 15 base gravada
    expect(c[16]).toBe("18.00"); // 17 IGV
    expect(c[23]).toBe("0.00"); // 24 ICBPER
    expect(c[25]).toBe("118.00"); // 26 total
    expect(c[26]).toBe("PEN"); // 27 moneda
    expect(c.slice(27, 33)).toEqual(["", "", "", "", "", ""]); // 28 tipo de cambio, 29-32 referencia, 33
  });

  it("boleta < S/ 700 sin documento del cliente entra con los campos 11-12 vacíos", () => {
    const r = generar(libro([comprobante({ id: "b1", tipo: "boleta", serie: "B001", numero: 3, subtotal: 50, igv: 9, total: 59 })]));
    expect(r.bloqueos).toEqual([]);
    expect(r.campos[0].slice(6, 12)).toEqual(["03", "B001", "3", "", "", ""]);
  });

  it("boleta ≥ S/ 700: sin documento se bloquea; con DNI entra", () => {
    const grande = { tipo: "boleta", serie: "B001", subtotal: 600, igv: 108, total: 708 } as const;
    const r = generar(
      libro([comprobante({ id: "b1", numero: 4, ...grande }), comprobante({ id: "b2", numero: 5, clienteDoc: "45678912", clienteNombre: "PEREZ ROJAS ANA", ...grande })]),
    );
    expect(r.bloqueos).toEqual([{ fila: 1, comprobante: "B001-4", motivo: MOTIVO_SIRE.boletaSinDoc }]);
    expect(r.campos).toHaveLength(1);
    expect(r.campos[0].slice(8, 13)).toEqual(["5", "", "1", "45678912", "PEREZ ROJAS ANA"]);
  });

  it("nota de crédito con referencia: negativa y con los campos 29-32", () => {
    const fila: FilaLibro = {
      correlativo: 1,
      fechaEmision: "20/10/2026",
      tipo: "07",
      serie: "FC01",
      numero: "0002",
      baseGravada: -50,
      igv: -9,
      total: -59,
      refFecha: "05/10/2026",
      refTipo: "01",
      refSerie: "f001",
      refNumero: "00012",
      estado: "aceptado por SUNAT",
    };
    const c = generar([fila]).campos[0];
    expect(c.slice(6, 9)).toEqual(["07", "FC01", "2"]);
    expect([c[14], c[16], c[25]]).toEqual(["-50.00", "-9.00", "-59.00"]);
    expect(c.slice(28, 32)).toEqual(["05/10/2026", "01", "F001", "12"]);
  });

  it("nota de crédito interna (sin serie) y nota sin referencia se bloquean", () => {
    const filas = libro([comprobante({ id: "nc", tipo: "nota_credito", serie: "FC01", numero: 9 })], {
      notasCredito: [{ id: "ni", numero: "NC-3", fecha: dia(12), igv: 0, total: 20, motivo: "devolución", referencia: null }],
    });
    const r = generar(filas);
    expect(r.campos).toHaveLength(0);
    expect(r.bloqueos.map((b) => b.motivo).sort()).toEqual([MOTIVO_SIRE.notaInterna, MOTIVO_SIRE.sinReferencia].sort());
  });

  it("anulado: la fila va con todos los importes en cero", () => {
    const r = generar(libro([comprobante({ id: "a1", tipo: "boleta", serie: "B001", numero: 8, estado: "voided", subtotal: 900, igv: 162, total: 1062 })]));
    expect(r.bloqueos).toEqual([]);
    expect(r.campos[0].slice(13, 26).every((m) => m === "0.00")).toBe(true);
  });

  it("texto con «|», «/» y «\\» se limpia (y no lleva el apóstrofo anti-Excel)", () => {
    const r = generar(
      libro([comprobante({ id: "f1", tipo: "factura", serie: "F001", numero: 1, clienteDoc: "20131312955", clienteNombre: "-ACME | SAC/Perú \\ norte" })]),
    );
    expect(r.campos[0][12]).toBe("-ACME SAC Perú norte");
    expect(r.contenidoTxt.split("|")).toHaveLength(34); // 33 campos + «|» final (el último pedazo es el fin de línea)
  });

  it("venta sin serie, ticket del POS y venta sin desglose se bloquean y lo dicen", () => {
    const filas = libro([], {
      ventasPos: [
        { id: "v1", fecha: dia(3), total: 10, comprobanteTipo: "boleta", comprobanteNumero: "123", comprobanteDoc: null, clienteNombre: null, clienteDoc: null, clienteTipoDoc: null, lineas: [{ nombre: "Arroz", cantidad: 1, precio: 10, taxType: "gravado" }] },
        { id: "v2", fecha: dia(4), total: 5, comprobanteTipo: null, comprobanteNumero: null, comprobanteDoc: null, clienteNombre: null, clienteDoc: null, clienteTipoDoc: null, lineas: [{ nombre: "Pan", cantidad: 1, precio: 5, taxType: "gravado" }] },
        { id: "v3", fecha: dia(5), total: 30, comprobanteTipo: "boleta", comprobanteNumero: "B002-7", comprobanteDoc: null, clienteNombre: null, clienteDoc: null, clienteTipoDoc: null, lineas: [] },
      ],
    });
    const r = generar(filas);
    expect(r.campos).toHaveLength(0);
    expect(r.bloqueos.map((b) => b.motivo)).toEqual([MOTIVO_SIRE.sinSerie, MOTIVO_SIRE.sinComprobante, MOTIVO_SIRE.sinDesglose]);
    expect(r.bloqueos[1].comprobante).toBe("Venta POS del 04/10/2026");
    expect(r.avisos.some((a) => a.startsWith("3 ventas no entraron"))).toBe(true);
    expect(resumirBloqueos(r.lineas, r.bloqueos).motivos).toHaveLength(3);
  });

  it("el mismo comprobante dos veces: el segundo se bloquea", () => {
    const f = { tipo: "boleta", serie: "B001", numero: 2 } as const;
    const r = generar(libro([comprobante({ id: "x1", ...f }), comprobante({ id: "x2", ...f })]));
    expect(r.campos).toHaveLength(1);
    expect(r.bloqueos.map((b) => b.motivo)).toEqual([MOTIVO_SIRE.repetido]);
  });
});

// ── Pendientes de la revisión del commit 3c0bae319 ─────────────────────────

const nota = (extra: Partial<ComprobanteEmitido> = {}) =>
  comprobante({ id: "nc1", tipo: "nota_credito", serie: "BC01", numero: 2, emitidoEn: dia(20), subtotal: 50, igv: 9, total: 59, pedidoId: "p1", ...extra });
const boletaOriginal = (extra: Partial<ComprobanteEmitido> = {}) =>
  comprobante({ id: "b12", tipo: "boleta", serie: "B001", numero: 12, emitidoEn: dia(5), pedidoId: "p1", ...extra });

describe("SIRE RVIE — nota de crédito electrónica con su comprobante (M1)", () => {
  it("la boleta del mismo pedido llena los campos 29-32 (fecha, tipo, serie, número)", () => {
    const r = generar(libro([boletaOriginal(), nota()]));
    expect(r.bloqueos).toEqual([]);
    const c = r.campos.find((f) => f[6] === "07");
    expect(c?.slice(28, 32)).toEqual(["05/10/2026", "03", "B001", "12"]);
    expect([c?.[14], c?.[16], c?.[25]]).toEqual(["-50.00", "-9.00", "-59.00"]);
  });

  it("el original de otro mes (comprobantesOriginales) también sirve", () => {
    const septiembre = boletaOriginal({ emitidoEn: new Date(Date.UTC(2026, 8, 20, 15, 0, 0)) });
    const r = generar(libro([nota()], { comprobantesOriginales: [septiembre] }));
    expect(r.bloqueos).toEqual([]);
    expect(r.campos[0].slice(28, 32)).toEqual(["20/09/2026", "03", "B001", "12"]);
  });

  it("de varios del pedido gana el aceptado sobre el anulado, aunque el anulado sea más viejo; el rechazado no cuenta", () => {
    const anulada = boletaOriginal({ id: "b10", numero: 10, emitidoEn: dia(2), estado: "voided" });
    const rechazada = boletaOriginal({ id: "b11", numero: 11, emitidoEn: dia(3), estado: "rejected" });
    const aceptada = boletaOriginal({ id: "b13", numero: 13, emitidoEn: dia(6) });
    const c = generar(libro([anulada, rechazada, aceptada, nota()])).campos.find((f) => f[6] === "07");
    expect(c?.slice(28, 32)).toEqual(["06/10/2026", "03", "B001", "13"]);
  });

  it("sin boleta o factura del pedido: no entra, y el libro y el aviso lo dicen", () => {
    const entrada: EntradaRegistroVentas = {
      periodo: "2026-10",
      comprobantes: [nota(), boletaOriginal({ id: "otro", pedidoId: "p9" })],
      ventasPos: [],
      pedidos: [],
      notasCredito: [],
      pedidosSinEntregar: 0,
      pedidosConComprobante: [],
      devoluciones: [],
    };
    const libroVentas = armarRegistroVentas(entrada);
    expect(libroVentas.notas.some((n) => n.startsWith("1 nota de crédito electrónica sale sin el comprobante que corrige"))).toBe(true);
    const r = generar(libroVentas.filas);
    expect(r.bloqueos).toEqual([{ fila: 2, comprobante: "BC01-2", motivo: MOTIVO_SIRE.sinReferencia }]);
    expect(r.avisos.some((a) => a.startsWith("1 nota de crédito no entró: no se encontró la boleta o factura que corrige"))).toBe(true);
  });
});

describe("SIRE RVIE — comprobante pendiente en SUNAT va en cero (M2)", () => {
  it("pendiente: todos los importes en 0.00 en el archivo, no suma como venta válida y se avisa", () => {
    const filas = libro([
      comprobante({ id: "ok", tipo: "boleta", serie: "B001", numero: 1 }),
      comprobante({ id: "pe", tipo: "boleta", serie: "B001", numero: 2, estado: "pending", emitidoEn: dia(11) }),
    ]);
    const r = generar(filas);
    expect(r.bloqueos).toEqual([]);
    expect(r.campos).toHaveLength(2);
    expect(r.campos[0][25]).toBe("118.00");
    expect(r.campos[1].slice(13, 26).every((m) => m === "0.00")).toBe(true);
    expect(r.campos.reduce((suma, c) => suma + Number(c[25]), 0)).toBe(118);
    expect(r.avisos.some((a) => a.startsWith("1 comprobante sigue pendiente en SUNAT: va en cero"))).toBe(true);
    // El libro de trabajo 14.1 sí conserva el monto real del pendiente: solo el archivo SIRE lo pone en cero.
    expect(filas.find((f) => f.numero === "2")?.total).toBe(118);
  });

  it("pendiente de S/ 700 o más sin DNI entra en cero (no se pide el documento de lo que va sin importe)", () => {
    const r = generar(libro([comprobante({ id: "pe", tipo: "boleta", serie: "B001", numero: 3, estado: "pending", subtotal: 600, igv: 108, total: 708 })]));
    expect(r.bloqueos).toEqual([]);
    expect(r.campos[0][25]).toBe("0.00");
  });

  it("varios pendientes: aviso en plural", () => {
    const f = { tipo: "boleta", serie: "B001", estado: "pending" } as const;
    const r = generar(libro([comprobante({ id: "p1", numero: 1, ...f }), comprobante({ id: "p2", numero: 2, ...f })]));
    expect(r.avisos.some((a) => a.startsWith("2 comprobantes siguen pendientes en SUNAT: van en cero"))).toBe(true);
  });
});

describe("SIRE RVIE — empate POS contra comprobante electrónico", () => {
  const ventaPos = (fecha: Date) => ({
    id: "vpos",
    fecha,
    total: 50,
    comprobanteTipo: "boleta",
    comprobanteNumero: "B001-5",
    comprobanteDoc: null,
    clienteNombre: null,
    clienteDoc: null,
    clienteTipoDoc: null,
    lineas: [{ nombre: "Arroz", cantidad: 1, precio: 50, taxType: "gravado" }],
  });

  it.each([
    ["el POS es más antiguo", dia(3)],
    ["el POS es más nuevo", dia(20)],
  ])("mismo B001-5 anotado en el POS y emitido: gana el electrónico (%s)", (_caso, fechaPos) => {
    const filas = libro([comprobante({ id: "e5", tipo: "boleta", serie: "B001", numero: 5 })], { ventasPos: [ventaPos(fechaPos)] });
    const r = generar(filas);
    expect(r.campos).toHaveLength(1);
    expect(r.campos[0][25]).toBe("118.00"); // el importe que SUNAT recibió, no el del POS (50.00)
    expect(r.bloqueos).toEqual([{ fila: expect.any(Number), comprobante: "B001-5", motivo: MOTIVO_SIRE.repetido }]);
  });
});

describe("SIRE RVIE — DNI 00000000 («clientes varios»), no confirmado en la ficha", () => {
  it("boleta < S/ 700 con 00000000: entra con los campos 11-12 vacíos", () => {
    const r = generar(libro([comprobante({ id: "b1", tipo: "boleta", serie: "B001", numero: 6, clienteDoc: "00000000", clienteNombre: "CLIENTES VARIOS" })]));
    expect(r.bloqueos).toEqual([]);
    expect(r.campos[0].slice(10, 13)).toEqual(["", "", "CLIENTES VARIOS"]);
  });

  it("boleta ≥ S/ 700 con 00000000: se bloquea pidiendo el DNI real, no «mal escrito»", () => {
    const r = generar(libro([comprobante({ id: "b2", tipo: "boleta", serie: "B001", numero: 7, clienteDoc: "00000000", subtotal: 600, igv: 108, total: 708 })]));
    expect(r.bloqueos.map((b) => b.motivo)).toEqual([MOTIVO_SIRE.boletaSinDoc]);
  });
});

describe("SIRE RVIE — singular y plural de los avisos", () => {
  it("una venta bloqueada: «1 venta no entró … Está en la lista»", () => {
    const r = generar(libro([comprobante({ id: "n1", tipo: "nota_credito", serie: "BC01", numero: 9 })]));
    const aviso = r.avisos.find((a) => a.includes("no entr"));
    expect(aviso?.startsWith("1 venta no entró al archivo")).toBe(true);
    expect(aviso).toContain("Está en la lista.");
  });
});
