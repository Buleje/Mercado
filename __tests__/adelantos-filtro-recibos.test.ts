import { describe, expect, it } from "vitest";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import type { EstadoRecibos } from "@/lib/adelantos/recibo-whatsapp";
import { avisoCelular, celularParaRecibo } from "@/lib/adelantos/recibo-whatsapp";
import { contarRecibos, leerFiltroRecibos, pasaFiltroRecibos } from "@/lib/adelantos/filtro-recibos";

const adl = (id: string, extra: Partial<DbAdelanto> = {}) => ({ id, status: "ABIERTO", ...extra }) as DbAdelanto;
const ISO = "2026-10-23T15:00:00.000Z";
const envio = { en: ISO, nueve: "987654321", por: "Ana", via: "whatsapp" as const };

const lista = [
  adl("a"), // sin nada
  adl("b"), // firma
  adl("c"), // huella
  adl("d", { firmas: { firma: true, huella: false } }), // firma que la lista ya sabe
  adl("e"), // enviado
  adl("f", { status: "CANCELADO" }), // anulado
  adl("g"), // firma y enviado
];
const estados: EstadoRecibos = {
  b: { firma: ISO, huella: null, envio: null },
  c: { firma: null, huella: ISO, envio: null },
  e: { firma: null, huella: null, envio },
  g: { firma: ISO, huella: null, envio },
};
const ids = (f: { sinFirma: boolean; sinEnviar: boolean }) => lista.filter((a) => pasaFiltroRecibos(a, estados, f)).map((a) => a.id);

describe("filtros de recibo de Adelantos", () => {
  it("sin filtro pasa todo", () => expect(ids({ sinFirma: false, sinEnviar: false })).toHaveLength(7));
  it("Sin firma = sin firma NI huella; anulados fuera", () => expect(ids({ sinFirma: true, sinEnviar: false })).toEqual(["a", "e"]));
  it("Sin enviar: sin envío; anulados fuera", () => expect(ids({ sinFirma: false, sinEnviar: true })).toEqual(["a", "b", "c", "d"]));
  it("combinados = ambos a la vez", () => expect(ids({ sinFirma: true, sinEnviar: true })).toEqual(["a"]));
  it("el contador dice cuántos quedan al sumar el otro chip", () => {
    expect(contarRecibos(lista, estados, { sinFirma: false, sinEnviar: false })).toEqual({ sinFirma: 2, sinEnviar: 4 });
    expect(contarRecibos(lista, estados, { sinFirma: true, sinEnviar: false })).toEqual({ sinFirma: 2, sinEnviar: 1 });
  });
  it("lo guardado en el navegador se lee sin confiar", () => {
    expect(leerFiltroRecibos('{"sinFirma":true,"sinEnviar":"si"}')).toEqual({ sinFirma: true, sinEnviar: false });
    expect(leerFiltroRecibos("{roto")).toEqual({ sinFirma: false, sinEnviar: false });
    expect(leerFiltroRecibos(null)).toEqual({ sinFirma: false, sinEnviar: false });
  });
});

describe("aviso del campo Celular de la persona", () => {
  it("vacío no avisa: es opcional", () => {
    expect(avisoCelular("")).toBeNull();
    expect(avisoCelular("   ")).toBeNull();
  });
  it("un celular que sirve al envío no avisa (con o sin 51, con espacios)", () => {
    for (const v of ["987654321", "987 654 321", "+51 987-654-321"]) {
      expect(celularParaRecibo(v).ok).toBe(true);
      expect(avisoCelular(v)).toBeNull();
    }
  });
  it("avisa con la misma regla del envío", () => {
    for (const v of ["98765", "787654321", "9876543210"]) {
      expect(celularParaRecibo(v).ok).toBe(false);
      expect(avisoCelular(v)).toMatch(/WhatsApp/);
    }
  });
});
