// Yape → caja, lado PC (04-11-2026): lectura del aviso de Yape del celular y llaves de contenido contra repetidos.
// El aviso que no se entiende (formato nuevo, monto dudoso, «Yapeaste») tiene que dar null: el procesador lo deja pendiente.
import { describe, expect, it } from "vitest";
import { atrasado, bloqueDe, centimosDe, leerAviso, llavesDe, momentoDe } from "../tools/mcp-buleje/yape-caja.mjs";

describe("leerAviso", () => {
  it.each([
    ["Yape", "JUAN PEREZ te envió un pago por S/ 10", { montoCentimos: 1000, pagador: "JUAN PEREZ" }],
    ["Yape", "Maria Quispe R. te envió un pago por S/ 10.50", { montoCentimos: 1050, pagador: "Maria Quispe R." }],
    ["Yape", "Yape! LUIS ROJAS te envió un pago por S/ 1,250.00", { montoCentimos: 125000, pagador: "LUIS ROJAS" }],
    ["Yape", "Ana Torres te envió un pago por S/ 25. El cód. de seguridad es: 482", { montoCentimos: 2500, pagador: "Ana Torres", codigo: "482" }],
    ["Yape", "Pedro Díaz te envió un pago por S/ 8.00 N° de operación 12345678", { montoCentimos: 800, pagador: "Pedro Díaz", nroOperacion: "12345678" }],
    ["¡Yape!", "Recibiste un pago. ROSA L. te ha enviado un pago de S/. 3.5", { montoCentimos: 350, pagador: "ROSA L." }],
    ["CARLOS D'ANGELO te envió un pago por S/ 40", "", { montoCentimos: 4000, pagador: "CARLOS D'ANGELO" }],
  ])("lee «%s / %s»", (titulo, texto, esperado) => {
    expect(leerAviso(titulo, texto)).toEqual(esperado);
  });

  it.each([
    ["Yape", "Yapeaste S/ 10 a JUAN PEREZ"],
    ["Yape", "¡Gana S/ 50 con Yape! Invita a tus amigos"],
    ["Yape", "JUAN PEREZ te envió un pago por S/ 10,50"], // coma decimal = dudoso
    ["Yape", "JUAN PEREZ te envió un pago por S/ 0.00"],
    ["Yape", "Tienes un mensaje nuevo"],
    ["", ""],
    ["Yape", "te envió un pago por S/ 10"], // sin nombre
  ])("no inventa: «%s / %s» → null", (titulo, texto) => {
    expect(leerAviso(titulo, texto)).toBeNull();
  });

  it("céntimos con números enteros (sin errores de float)", () => {
    expect(centimosDe("0.29")).toBe(29);
    expect(centimosDe("19.9")).toBe(1990);
    expect(centimosDe("1.250,00")).toBeNull();
  });
});

describe("llaves de contenido", () => {
  const aviso = { montoCentimos: 1050, pagador: "Juan Pérez" };
  // 10:03 hora Lima del 04-11-2026 = 15:03 UTC
  const t = Date.UTC(2026, 10, 4, 15, 3, 0);

  it("son estables y no dependen de tildes ni mayúsculas", () => {
    const a = llavesDe(aviso, t);
    expect(a.actual).toMatch(/^[a-f0-9]{64}$/);
    expect(llavesDe({ montoCentimos: 1050, pagador: "JUAN  PEREZ" }, t + 60_000).actual).toBe(a.actual);
    expect(llavesDe({ ...aviso, montoCentimos: 1000 }, t).actual).not.toBe(a.actual);
    expect(llavesDe({ ...aviso, codigo: "482" }, t).actual).not.toBe(a.actual);
  });

  it("bloque de 10 min en hora Lima: el aviso de las 10:09:59 y el de las 10:10:01 se ven (anterior/siguiente)", () => {
    const antes = Date.UTC(2026, 10, 4, 15, 9, 59), despues = Date.UTC(2026, 10, 4, 15, 10, 1);
    expect(bloqueDe(despues)).toBe(bloqueDe(antes) + 1);
    const a = llavesDe(aviso, antes), b = llavesDe(aviso, despues);
    expect(b.actual).not.toBe(a.actual);
    expect(b.anterior).toBe(a.actual);
    expect(a.siguiente).toBe(b.actual);
    expect(b.vecinas).toContain(a.actual);
  });

  it("con n.º de operación la llave es op:<nro>, sin vecinas", () => {
    const a = llavesDe({ ...aviso, nroOperacion: "12345678" }, t);
    expect(a.actual).toBe(llavesDe({ montoCentimos: 1, pagador: "otro", nroOperacion: "12345678" }, t + 86_400_000).actual);
    expect(a.vecinas).toEqual([]);
  });

  it("la hora del aviso es la del celular salvo que sea absurda", () => {
    expect(momentoDe({ envio: t, llego: t + 5_000 })).toBe(t);
    expect(momentoDe({ envio: t + 600_000, llego: t })).toBe(t); // reloj del celular adelantado
    expect(momentoDe({ envio: 1, llego: t })).toBe(t);
  });
});

describe("atrasado (tope de 24 h)", () => {
  const ahora = Date.UTC(2026, 10, 4, 17, 0, 0);
  const h = 3600_000;
  it("a tiempo: llegó hace 1 min y se pagó 1 min antes", () => expect(atrasado({ llego: ahora - 60_000, envio: ahora - 120_000 }, ahora)).toBe(false));
  it("el celular lo mandó 25 h después del pago", () => expect(atrasado({ llego: ahora, envio: ahora - 25 * h }, ahora)).toBe(true));
  it("llegó a tiempo pero se procesa 25 h después (respaldo del buzón)", () => expect(atrasado({ llego: ahora - 25 * h, envio: ahora - 25 * h }, ahora)).toBe(true));
  it("sin horas en la entrada: no se marca", () => expect(atrasado({}, ahora)).toBe(false));
});
