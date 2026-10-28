/**
 * Papel, WhatsApp y GTF de UN viaje de una cubicación guardada (Brandon 28-10):
 *  · el saldo de la constancia cuenta los viajes HASTA ese (por orden de la lista);
 *  · el aviso de WhatsApp dice lo que salió y lo que queda DESPUÉS, sin enviar nada;
 *  · la guía llena SÓLO placa/chofer/destino vacíos y «Deshacer» no pisa lo escrito después.
 */
import { describe, it, expect } from "vitest";
import { cubicarPieza, m3DesdePt, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { codigoDeConstancia, htmlDeConstanciaDeSalida, saldoDespuesDelViaje, totalDelViaje, type CubicacionConViajes } from "@/lib/forestal/cubicacion-salida-papel";
import { llenarViajeDesdeGuia, revertirViaje } from "@/lib/forestal/cubicacion-salida-desde-guia";
import { cuandoSalio, enQueSalio, textoWhatsAppDeSalida } from "@/lib/forestal/cubicacion-salida-whatsapp";
import { celularDelComprador, enlaceWhatsApp } from "@/lib/forestal/cubicacion-whatsapp";
import type { SalidaCubicacion } from "@/lib/forestal/cubicacion-salidas";

const pieza = (id: string, cantidad: number, espesor: number, ancho: number, largo: number, especie: string): PiezaCubicada =>
  ({ id, cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie, ...cubicarPieza({ cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" }) }) as PiezaCubicada;

const piezas = [pieza("a", 10, 1, 8, 10, "Tornillo"), pieza("b", 4, 2, 8, 10, "Tornillo")];

const viaje = (id: string, fecha: string, lineas: SalidaCubicacion["lineas"], extra: Partial<SalidaCubicacion> = {}): SalidaCubicacion =>
  ({ id, fecha, completo: false, lineas, registradoAt: `${fecha}T15:00:00.000Z`, ...extra });

const c = (salidas: SalidaCubicacion[]): CubicacionConViajes => ({ nombre: "Lote <QA>", piezas, salidas, precioPt: 1, cliente: "Maderera Sol" });
const V1 = viaje("v1", "2026-10-26", [{ especie: "Tornillo", tipo: "Tabla", piezas: 4, pt: 26.67 }]);
const V2 = viaje("v2", "2026-10-28", [{ especie: "Tornillo", tipo: "Tabla", piezas: 6, pt: 40 }], { vehiculo: "Camión", placa: "ABC-123" });

describe("saldo después de cada viaje", () => {
  it("el primero descuenta sólo el primero; el segundo, los dos", () => {
    const cub = c([V1, V2]);
    const tabla = (i: number) => saldoDespuesDelViaje(cub, i).grupos.find((g) => g.tipo === "Tabla")!;
    expect(tabla(0).queda.piezas).toBe(6);
    expect(tabla(0).salio.pt).toBeCloseTo(26.67, 2);
    expect(tabla(1).queda.piezas).toBe(0);
    expect(saldoDespuesDelViaje(cub, 1).salio.piezas).toBe(10);
  });
  it("el total del viaje saca el m³ del PT ÷ 424", () => {
    const t = totalDelViaje(V2);
    expect(t.m3).toBe(m3DesdePt(40));
    expect(t.piezas).toBe(6);
  });
});

describe("constancia (HTML)", () => {
  const html = htmlDeConstanciaDeSalida({ c: c([V1, V2]), salida: V2, indice: 1, codigoCubicacion: "MA-7K3QX", fechaTexto: "miércoles 28/10", negocio: "Aserradero <Blas>" });
  it("lleva código, fecha, vehículo, firmas y el saldo", () => {
    expect(codigoDeConstancia("MA-7K3QX", 1)).toBe("MA-7K3QX-V2");
    for (const t of ["MA-7K3QX-V2", "miércoles 28/10", "ABC-123", "Entrega", "Recibe", "Chofer", "Cubicado", "Salió hasta hoy", "Queda"]) expect(html).toContain(t);
  });
  it("escapa lo escrito por la gente", () => {
    expect(html).not.toContain("<QA>");
    expect(html).toContain("Lote &lt;QA&gt;");
    expect(html).toContain("Aserradero &lt;Blas&gt;");
  });
});

describe("texto de WhatsApp", () => {
  it("dice qué salió, en qué y cuánto queda DESPUÉS de ese viaje", () => {
    const t = textoWhatsAppDeSalida(c([V1, V2]), V2, 1, "miércoles 28/10", "2026-10-28");
    expect(t).toMatch(/^Hoy 28\/10 salieron 6 pzas de Tornillo Tabla \(0[.,]094 m³, 40 PT\) en el camión ABC-123\./);
    const antes = textoWhatsAppDeSalida(c([V1, V2]), V1, 0, "lunes 26/10", "2026-10-28");
    expect(antes.startsWith("El lunes 26/10 salieron 4 pzas")).toBe(true);
    expect(antes).toContain("quedan");
    expect(antes).toContain("(10 pzas)"); // 6 tablas + 4 comerciales
  });
  it("sin vehículo ni placa no inventa; con todo salido lo dice", () => {
    expect(enQueSalio({})).toBe("");
    expect(enQueSalio({ placa: "XYZ-1" })).toBe(" en el vehículo XYZ-1");
    expect(enQueSalio({ vehiculo: "Camioneta", placa: "A-1" })).toBe(" en la camioneta A-1");
    const todo = viaje("t", "2026-10-28", [{ especie: "Tornillo", tipo: "Tabla", piezas: 10, pt: 66.67 }, { especie: "Tornillo", tipo: "Comercial", piezas: 4, pt: 53.33 }]);
    expect(textoWhatsAppDeSalida(c([todo]), todo, 0, "x", "2026-10-28")).toContain("Con esto salió toda tu madera.");
  });
  it("cuandoSalio: hoy o la fecha escrita", () => {
    expect(cuandoSalio("2026-10-28", "miércoles 28/10", "2026-10-28")).toBe("Hoy 28/10");
    expect(cuandoSalio("2026-09-10", "jueves 10/09", "2026-10-28")).toBe("El jueves 10/09");
  });
  it("el enlace abre wa.me con el número del comprador del Directorio, o sin número", () => {
    const partes = [{ id: "p1", nombre: "Maderera Sol", activo: true, whatsapp: "987 654 321" }];
    const n = celularDelComprador(partes, { nombre: "maderera sol" });
    expect(n).toBe("51987654321");
    expect(enlaceWhatsApp("hola", n).startsWith("https://wa.me/51987654321?text=")).toBe(true);
    expect(celularDelComprador(partes, { nombre: "Otro" })).toBeNull();
    expect(enlaceWhatsApp("hola", null).startsWith("https://wa.me/?text=")).toBe(true);
  });
});

describe("la GTF llena el viaje", () => {
  const guia = { gtfNumber: "0001-123", titularName: "CCNN X", tituloHabilitante: "P-1", placaVehiculo: "abc-123", conductor: "Juan Pérez", destino: "Lima" };
  it("llena sólo lo vacío y nunca pisa lo escrito", () => {
    const r = llenarViajeDesdeGuia({ placa: "", chofer: "Pedro", destino: "" }, guia);
    expect(r.campos).toEqual(["placa", "destino"]);
    expect(r.patch).toEqual({ placa: "ABC-123", destino: "Lima" });
  });
  it("si todo está escrito, no llena nada", () => {
    expect(llenarViajeDesdeGuia({ placa: "A", chofer: "B", destino: "C" }, guia).campos).toEqual([]);
  });
  it("deshacer quita lo que puso la guía y deja lo que se escribió después", () => {
    const { patch } = llenarViajeDesdeGuia({ placa: "", chofer: "", destino: "" }, guia);
    const lleno = { placa: "ABC-123", chofer: "Juan Pérez", destino: "Lima de noche" };
    expect(revertirViaje({ ...lleno }, patch)).toEqual({ placa: "", chofer: "", destino: "Lima de noche" });
  });
});
