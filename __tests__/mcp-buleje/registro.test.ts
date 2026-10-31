// @ts-nocheck — importa .mjs del MCP
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anotar, redactar, ultimas, archivoDelMes } from "../../tools/mcp-buleje/src/registro.mjs";

describe("registro", () => {
  it("redacta clave, token, cookie, authorization, dni, teléfono (también anidados y en rutas)", () => {
    const r = redactar({ clave: "a", password: "b", cookie: "c", authorization: "d", dni: "12345678", telefono: "987654321", cuerpo: { token: "zzz", ok: 1 }, ruta: "/api/customers/987654321", n: 5 });
    expect(r).toEqual({ clave: "***", password: "***", cookie: "***", authorization: "***", dni: "***", telefono: "***", cuerpo: { token: "***", ok: 1 }, ruta: "/api/customers/***", n: 5 });
  });

  it("escribe una línea jsonl por llamada, token a 6 caracteres, archivo chmod 600", () => {
    const dir = mkdtempSync(join(tmpdir(), "bmcp-"));
    const ahora = () => new Date(2026, 9, 29, 10, 0, 0);
    anotar({ herramienta: "adelanto_dar", tipo: "confirmar", negocio: "blas", metodo: "POST", ruta: "/api/adelantos", status: 200, ms: 12, seco: false, token: "ABCDEFGHIJKL", clave: "secreta" }, { dir, ahora });
    anotar({ herramienta: "x", status: 404 }, { dir, ahora });
    const f = archivoDelMes(ahora(), dir);
    expect(f).toContain("llamadas-2026-10.jsonl");
    const lineas = readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ herramienta: "adelanto_dar", token: "ABCDEF", clave: "***" });
    expect(JSON.stringify(lineas)).not.toContain("secreta");
    expect(statSync(f).mode & 0o777).toBe(0o600);
    expect(ultimas(1, { dir, ahora })).toHaveLength(1);
  });

  it("nunca lanza aunque el directorio sea inválido", () => {
    const dir = mkdtempSync(join(tmpdir(), "bmcp-"));
    const archivo = join(dir, "archivo");
    writeFileSync(archivo, "x");
    expect(() => anotar({ a: 1 }, { dir: join(archivo, "sub") })).not.toThrow();
  });
});
