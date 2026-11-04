/**
 * El texto libre no guarda claves (ADR-524 §4.3): red, no cofre.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pareceClave, respuestaInvalida, textoSinClave } from "@/lib/admin/sin-claves";

describe("pareceClave", () => {
  it.each([
    "clave SOL: ABCD1234",
    "Clave sol=miclave99",
    "contraseña: Drucila2026",
    "contrasena=hunter22",
    "password: hunter22",
    "pass: 12345678",
    "PIN: 4321",
    "usuario SOL: BRANDON7",
    "su usuario sol BRANDON7 y lo demás",
    "SOL ABCDEFGH",
  ])("rechaza «%s»", (t) => {
    expect(pareceClave(t)).toBe(true);
  });

  it.each([
    "la clave SOL la tiene Brandon",
    "La clave SOL se creó el 30-10, la guarda Brandon",
    "hace sol, mañana llevamos los papeles",
    "trámite SOL para el DNI 80186494",
    "El banco pidió el PIN de la tarjeta",
    "Pidieron la contraseña del correo (la tiene Drucila)",
    "",
    null,
    undefined,
  ])("deja pasar «%s»", (t) => {
    expect(pareceClave(t)).toBe(false);
  });
});

describe("respuestaInvalida", () => {
  const schema = z.object({ notas: textoSinClave(500).nullable().optional(), monto: z.number().positive() });

  it("una clave → 422 parece_clave con el campo", () => {
    const r = schema.safeParse({ notas: "clave sol: ABCD1234", monto: 1 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const res = respuestaInvalida(r.error);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "parece_clave", campo: "notas" });
  });

  it("otro error → 400 invalid_body", () => {
    const r = schema.safeParse({ notas: "ok", monto: -1 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const res = respuestaInvalida(r.error);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });
});
