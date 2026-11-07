// @vitest-environment node
/**
 * __tests__/cripto-secretos.test.ts
 *
 * La clave del usuario de la cámara Hikvision se guarda en el KV. Este archivo
 * fija el contrato del sobre cerrado: entra cifrada, sale igual que entró, y
 * cuando no se puede abrir devuelve `null` en vez de tirar — porque una clave
 * vieja de una `AUTH_SECRET` rotada no puede tumbar la pantalla de cámaras.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarSecreto, descifrarSecreto, estaCifrado, hayClaveDeCifrado } from "@/lib/cripto-secretos";

const SECRETO_A = "una-auth-secret-de-prueba-suficientemente-larga-1";
const SECRETO_B = "otra-auth-secret-distinta-para-probar-rotacion-2";

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRETO_A);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ida y vuelta", () => {
  it("devuelve exactamente el mismo texto", () => {
    for (const clave of ["Admin12345", "cla@ve/con:simbolos#raros", "ñandú Ó áéíóú", "", "x".repeat(2000)]) {
      expect(descifrarSecreto(cifrarSecreto(clave))).toBe(clave);
    }
  });

  it("el formato es v1:<iv>:<tag>:<datos> en base64url", () => {
    const partes = cifrarSecreto("Admin12345").split(":");
    expect(partes).toHaveLength(4);
    expect(partes[0]).toBe("v1");
    for (const p of partes.slice(1)) expect(p).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: sin + / =
    expect(Buffer.from(partes[1], "base64url")).toHaveLength(12); // IV de 12 bytes
    expect(Buffer.from(partes[2], "base64url")).toHaveLength(16); // tag de GCM
  });

  it("el texto en claro no aparece en el resultado", () => {
    const cifrado = cifrarSecreto("Hikvision2026");
    expect(cifrado).not.toContain("Hikvision2026");
    expect(Buffer.from(cifrado).toString("latin1")).not.toContain("Hikvision2026");
  });

  it("dos veces la misma clave dan cifrados distintos (IV aleatorio) y las dos abren", () => {
    const uno = cifrarSecreto("Admin12345");
    const dos = cifrarSecreto("Admin12345");
    expect(uno).not.toBe(dos);
    expect(descifrarSecreto(uno)).toBe("Admin12345");
    expect(descifrarSecreto(dos)).toBe("Admin12345");
  });
});

describe("lo que no se puede abrir devuelve null, nunca tira", () => {
  it("dato corrupto: un byte cambiado en los datos", () => {
    const partes = cifrarSecreto("Admin12345").split(":");
    const datos = Buffer.from(partes[3], "base64url");
    datos[0] = datos[0] ^ 0xff;
    partes[3] = datos.toString("base64url");
    expect(descifrarSecreto(partes.join(":"))).toBeNull();
  });

  it("tag manipulado (alguien editó el KV a mano)", () => {
    const partes = cifrarSecreto("Admin12345").split(":");
    partes[2] = Buffer.alloc(16, 7).toString("base64url");
    expect(descifrarSecreto(partes.join(":"))).toBeNull();
  });

  it("basura, texto plano, versión desconocida y vacío", () => {
    for (const malo of ["", "Admin12345", "v1:corto", "v2:a:b:c", "v1:::", "::::", "v1:%%%:%%%:%%%"]) {
      expect(descifrarSecreto(malo)).toBeNull();
    }
  });

  it("con otra AUTH_SECRET (rotación) devuelve null en vez de romper", () => {
    const cifrado = cifrarSecreto("Admin12345");
    vi.stubEnv("AUTH_SECRET", SECRETO_B);
    expect(descifrarSecreto(cifrado)).toBeNull();
    vi.stubEnv("AUTH_SECRET", SECRETO_A);
    expect(descifrarSecreto(cifrado)).toBe("Admin12345"); // vuelve a abrir con la de siempre
  });
});

describe("sin AUTH_SECRET", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "");
  });

  it("hayClaveDeCifrado() avisa que no se puede", () => {
    expect(hayClaveDeCifrado()).toBe(false);
  });

  it("cifrar tira un error claro en español: guardar en texto plano no es opción", () => {
    expect(() => cifrarSecreto("Admin12345")).toThrowError(/AUTH_SECRET/);
    expect(() => cifrarSecreto("Admin12345")).toThrowError(/texto plano/);
  });

  it("descifrar devuelve null (no tira) aunque el dato sea bueno", () => {
    expect(descifrarSecreto("v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA")).toBeNull();
  });

  it("con AUTH_SECRET presente sí hay clave", () => {
    vi.stubEnv("AUTH_SECRET", SECRETO_A);
    expect(hayClaveDeCifrado()).toBe(true);
  });
});

describe("estaCifrado", () => {
  it("distingue lo ya cifrado de lo que llega en claro", () => {
    expect(estaCifrado(cifrarSecreto("Admin12345"))).toBe(true);
    expect(estaCifrado("Admin12345")).toBe(false);
    expect(estaCifrado("")).toBe(false);
    expect(estaCifrado(null)).toBe(false);
    expect(estaCifrado(undefined)).toBe(false);
  });
});
