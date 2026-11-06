import { describe, expect, it } from "vitest";
import { decidirEntidad, etiquetaDeEntidad, leerCartero, type EntidadCartero } from "@/lib/documentos/cartero";

// El cartero de papeles (06-11): ¿de qué cliente o proveedor es este papel?
const ENTIDADES: EntidadCartero[] = [
  { tipo: "cliente", id: "987654321", nombre: "Ronal Pérez" },
  { tipo: "proveedor", id: "sup-info", nombre: "Inforhuay", alias: ["Maderera Inforhuay S.A.C.", "20601234567"] },
  { tipo: "proveedor", id: "sup-cope", nombre: "COPESA", alias: ["Corporación Peruana de Servicios"] },
  { tipo: "cliente", id: "999111222", nombre: "Rosa" },
];

describe("decidirEntidad", () => {
  it("el nombre del archivo nombra a una sola entidad → seguro (sin tildes ni mayúsculas)", () => {
    const r = decidirEntidad("2026-11-05_CUBICACION_RONAL-PEREZ.pdf", "", ENTIDADES);
    expect(r.estado).toBe("seguro");
    expect(r.candidatos[0]).toMatchObject({ tipo: "cliente", id: "987654321", nombre: "Ronal Pérez" });
  });

  it("el nombre del archivo nombra a dos → duda con los dos", () => {
    const r = decidirEntidad("Liquidacion Inforhuay y Copesa.pdf", "", ENTIDADES);
    expect(r.estado).toBe("duda");
    expect(r.candidatos.map((c) => c.id).sort()).toEqual(["sup-cope", "sup-info"]);
  });

  it("el contenido nombra 2 veces a una sola → seguro; 1 vez → duda", () => {
    const dos = decidirEntidad("scan_0001.pdf", "Recibí de Ronal Pérez la suma de S/ 500. Firma: RONAL PEREZ", ENTIDADES);
    expect(dos.estado).toBe("seguro");
    expect(dos.candidatos[0]).toMatchObject({ id: "987654321", veces: 2 });
    const una = decidirEntidad("scan_0001.pdf", "Recibí de Ronal Pérez la suma de S/ 500.", ENTIDADES);
    expect(una.estado).toBe("duda");
  });

  it("dos en el contenido pero una domina (3+ y el triple) → seguro; la razón social no cuenta doble", () => {
    const texto =
      "MADERERA INFORHUAY S.A.C. RUC 20601234567. Entrega a Ronal Perez 12 m3. Guía de Inforhuay. Recibido por Inforhuay.";
    const r = decidirEntidad("guia.pdf", texto, ENTIDADES);
    expect(r.estado).toBe("seguro");
    expect(r.candidatos[0]).toMatchObject({ id: "sup-info", veces: 4 });
    expect(r.candidatos[1]).toMatchObject({ id: "987654321", veces: 1 });
  });

  it("un alias corto (1 palabra, <7 letras) en el contenido NO cuenta; en el nombre del archivo sí", () => {
    expect(decidirEntidad("papel.pdf", "Copesa Copesa Copesa entregó a Rosa", ENTIDADES).estado).toBe("nadie");
    const enNombre = decidirEntidad("copesa.pdf", "", ENTIDADES);
    expect(enNombre.estado).toBe("seguro");
    expect(enNombre.candidatos[0].id).toBe("sup-cope");
  });

  it("nadie nombrado (ni dentro de otra palabra) → nadie", () => {
    const r = decidirEntidad("factura.pdf", "Venta de clavos 2 kg a Inforhuayano", ENTIDADES);
    expect(r).toEqual({ estado: "nadie", candidatos: [], motivo: expect.any(String) });
  });
});

describe("leerCartero / etiquetaDeEntidad", () => {
  it("lee lo guardado y descarta basura", () => {
    expect(leerCartero(null)).toBeNull();
    expect(leerCartero({ cartero: { estado: "raro" } })).toBeNull();
    const c = leerCartero({
      cartero: {
        estado: "seguro",
        candidatos: [{ tipo: "cliente", id: "1", nombre: "A", veces: 2 }, { tipo: "x" }],
        motivo: "m",
        decidido: { tipo: "cliente", id: "1", nombre: "A", por: "usuario", at: "2026-11-06T00:00:00.000Z" },
      },
    });
    expect(c?.candidatos).toHaveLength(1);
    expect(c?.decidido?.por).toBe("usuario");
    expect(etiquetaDeEntidad("  Ronal   Pérez ")).toBe("👤 Ronal Pérez");
  });
});
