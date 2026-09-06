/**
 * Sexta ronda del bug más caro del libro: comparar nombres de especie a mano.
 *
 * `[[loth-especie-normalizacion-triplicada]]` ya lo migró en cinco focos del
 * LO-TH y del CTP. Quedaron afuera CUATRO comparaciones que no muestran un
 * número sino que **BLOQUEAN una operación**, y por eso duelen más:
 *
 *  1. `forest-gtf.db` — especies autorizadas por el POA. Es el peor: rechaza la
 *     emisión de la guía **acusando que la especie está fuera del plan**. Una
 *     infracción forestal que no ocurrió, con la guía trabada.
 *  2. `forest-lote-aserrio` — rechaza meter una troza al lote «porque es de otra
 *     especie», con un motivo que se lee idéntico al del lote.
 *  3. `forest-lote-aserrio` — bloquea sumar la corrida al lote.
 *  4. `forest-ctp-despacho` — bloquea atribuir la corrida al despacho.
 *
 * Los dos casos que se dan de verdad no son exóticos: el plan escribe
 * «TORNILLO (Cedrelinga cateniformis)» y la troza «TORNILLO», o alguien tipeó
 * «Ishpíngo» con tilde. Ninguna de las dos es otra madera.
 *
 * Acá se fija el PREDICADO. Las queries son de Prisma y no se testean acá.
 */
import { describe, expect, it } from "vitest";

import { claveEspecie } from "@/lib/forestal/loth-constants";

/** Lo que hacían los cuatro focos antes. */
const aMano = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
/** Lo que hacen ahora. */
const canonico = (a: string | null | undefined, b: string | null | undefined) =>
  claveEspecie(a) === claveEspecie(b);

describe("los dos casos que se dan de verdad", () => {
  it("el plan trae el científico entre paréntesis y la troza no", () => {
    const plan = "TORNILLO (Cedrelinga cateniformis)";
    const troza = "TORNILLO";
    expect(aMano(plan, troza)).toBe(false); // ← acusaba «fuera del POA»
    expect(canonico(plan, troza)).toBe(true);
  });

  it("una tilde de diferencia", () => {
    expect(aMano("Ishpíngo", "Ishpingo")).toBe(false);
    expect(canonico("Ishpíngo", "Ishpingo")).toBe(true);
  });

  it("lo que ya andaba sigue andando: espacios y mayúsculas", () => {
    expect(aMano("  Tornillo ", "tornillo")).toBe(true);
    expect(canonico("  Tornillo ", "tornillo")).toBe(true);
  });
});

describe("no afloja de más: dos especies distintas siguen siendo distintas", () => {
  it("tornillo no es capirona", () => {
    expect(canonico("TORNILLO", "CAPIRONA")).toBe(false);
  });

  it("ni shihuahuaco es shihuahuaco amarillo", () => {
    expect(canonico("SHIHUAHUACO", "SHIHUAHUACO AMARILLO")).toBe(false);
  });

  it("una especie contra vacío nunca matchea", () => {
    expect(canonico("TORNILLO", "")).toBe(false);
    expect(canonico("TORNILLO", null)).toBe(false);
  });
});

/**
 * ⚠️ El producto NO usa `claveEspecie`, y esto lo fija.
 *
 * Escribiendo estos tests apareció una regresión introducida en el mismo
 * cambio: `claveEspecie` ignora lo que va entre paréntesis, así que «MADERA
 * ASERRADA (COMERCIAL)» y «MADERA ASERRADA (CORTA)» pasaban a ser el mismo
 * producto — y se podía atribuir una corrida de corta a un despacho de
 * comercial. Son dos productos distintos del catálogo oficial.
 *
 * El tipo de producto sale de un `<select>`, no se tipea: no tiene el problema
 * de tildes que sí tiene la especie. Por eso se compara crudo.
 */
describe("el producto se compara CRUDO, no con claveEspecie", () => {
  it("claveEspecie borraría la diferencia entre comercial y corta", () => {
    expect(canonico("MADERA ASERRADA (COMERCIAL)", "MADERA ASERRADA (CORTA)")).toBe(true);
    // Por eso el despacho NO la usa para el producto:
    expect(aMano("MADERA ASERRADA (COMERCIAL)", "MADERA ASERRADA (CORTA)")).toBe(false);
  });

  it("y crudo sigue tolerando mayúsculas y espacios, que es lo único que varía", () => {
    expect(aMano("  MADERA ASERRADA (COMERCIAL) ", "madera aserrada (comercial)")).toBe(true);
  });

  it("la unidad tampoco se normaliza: m³ y pt son magnitudes, no variantes", () => {
    // El predicado real del despacho, con las unidades como strings sueltos
    // (comparar dos literales distintos directo lo flagea `tsc` como inútil).
    const mismaUnidad = (a: string | null, b: string | null) => (a ?? "") === (b ?? "");
    expect(mismaUnidad("m3", "pt")).toBe(false);
    expect(mismaUnidad("m3", "m3")).toBe(true);
    // Y no se "arregla" con minúsculas: son cosas distintas, no escrituras.
    expect(mismaUnidad("M3", "m3")).toBe(false);
  });
});
