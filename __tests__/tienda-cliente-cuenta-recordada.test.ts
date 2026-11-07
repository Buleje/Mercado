// @vitest-environment node
/**
 * La cuenta de Google que la tienda recuerda en este equipo (17-10): sólo
 * nombre, correo ENMASCARADO, foto de Google (https, *.googleusercontent.com) y la pista para Google; nunca un
 * token ni el correo entero. «Olvidar» la borra (Ley 29733).
 */
import { describe, expect, it } from "vitest";
import {
  CLAVE_CUENTA_RECORDADA,
  enmascararCorreo,
  fotoDeGoogle,
  leerCuentaRecordada,
  marcarSalida,
  marcarSinSesion,
  olvidarCuenta,
  recordarCuenta,
} from "@/lib/tienda-cliente/cuenta-recordada";

function almacen() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const CLIENTE = {
  nombre: "Brandon Buleje",
  email: "brandon.buleje@gmail.com",
  avatar: "https://lh3.googleusercontent.com/a/foto",
  proveedor: "google" as const,
};

describe("cuenta recordada", () => {
  it("enmascara el correo", () => {
    expect(enmascararCorreo("brandon@gmail.com")).toBe("br•••@gmail.com");
    expect(enmascararCorreo("ana@gmail.com")).toBe("a•••@gmail.com");
    expect(enmascararCorreo(null)).toBeNull();
  });

  it("guarda sólo lo de mostrar: sin correo entero ni tokens", () => {
    const a = almacen();
    recordarCuenta(CLIENTE, "110248495921238986420", a);
    const crudo = a.m.get(CLAVE_CUENTA_RECORDADA) ?? "";
    expect(crudo).not.toContain("brandon.buleje@gmail.com");
    expect(crudo).not.toMatch(/token|eyJ/i);
    expect(Object.keys(JSON.parse(crudo)).sort()).toEqual(["autoEntrar", "conectado", "correo", "foto", "nombre", "pista", "v"]);
    expect(leerCuentaRecordada(a)).toEqual({
      nombre: "Brandon Buleje",
      correo: "br•••@gmail.com",
      foto: "https://lh3.googleusercontent.com/a/foto",
      pista: "110248495921238986420",
      conectado: true,
      autoEntrar: true,
    });
  });

  it("Salir: se sigue recordando, pero ni conectado ni entra solo", () => {
    const a = almacen();
    recordarCuenta(CLIENTE, "1102", a);
    marcarSalida(a);
    expect(leerCuentaRecordada(a)).toMatchObject({ nombre: "Brandon Buleje", conectado: false, autoEntrar: false });
  });

  it("sesión vencida: vuelve el globito y puede entrar solo", () => {
    const a = almacen();
    recordarCuenta(CLIENTE, "1102", a);
    marcarSinSesion(a);
    expect(leerCuentaRecordada(a)).toMatchObject({ conectado: false, autoEntrar: true });
  });

  it("Olvidar borra todo rastro", () => {
    const a = almacen();
    recordarCuenta(CLIENTE, "1102", a);
    olvidarCuenta(a);
    expect(a.m.size).toBe(0);
    expect(leerCuentaRecordada(a)).toBeNull();
  });

  it("sin pista nueva reusa la de la misma cuenta; de otra cuenta, no", () => {
    const a = almacen();
    recordarCuenta(CLIENTE, "1102", a);
    recordarCuenta(CLIENTE, null, a);
    expect(leerCuentaRecordada(a)?.pista).toBe("1102");
    recordarCuenta({ ...CLIENTE, nombre: "Drucila", email: "drucila@gmail.com" }, null, a);
    expect(leerCuentaRecordada(a)?.pista).toBeNull();
  });

  it("foto que no es https y JSON roto no se aceptan", () => {
    const a = almacen();
    recordarCuenta({ ...CLIENTE, avatar: "javascript:alert(1)" }, null, a);
    expect(leerCuentaRecordada(a)?.foto).toBeNull();
    a.m.set(CLAVE_CUENTA_RECORDADA, "{no es json");
    expect(leerCuentaRecordada(a)).toBeNull();
    a.m.set(CLAVE_CUENTA_RECORDADA, JSON.stringify({ v: 1, nombre: "x", token: "eyJ..." }));
    expect(leerCuentaRecordada(a)).toBeNull();
  });

  it("foto sólo de *.googleusercontent.com (otra https se descarta, también la ya guardada)", () => {
    expect(fotoDeGoogle("https://lh3.googleusercontent.com/a/x")).toBe("https://lh3.googleusercontent.com/a/x");
    expect(fotoDeGoogle("https://rastreo.pe/pixel.png")).toBeNull();
    expect(fotoDeGoogle("https://googleusercontent.com.rastreo.pe/a")).toBeNull();
    expect(fotoDeGoogle(`https://lh3.googleusercontent.com/${"a".repeat(500)}`)).toBeNull();
    const a = almacen();
    recordarCuenta({ ...CLIENTE, avatar: "https://rastreo.pe/pixel.png" }, null, a);
    expect(leerCuentaRecordada(a)?.foto).toBeNull();
    recordarCuenta(CLIENTE, null, a);
    const guardada = JSON.parse(a.m.get(CLAVE_CUENTA_RECORDADA) ?? "{}") as Record<string, unknown>;
    a.m.set(CLAVE_CUENTA_RECORDADA, JSON.stringify({ ...guardada, foto: "https://rastreo.pe/pixel.png" }));
    expect(leerCuentaRecordada(a)?.foto).toBeNull();
  });
});
