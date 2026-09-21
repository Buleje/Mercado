/**
 * Salud de una ficha del Directorio: qué le falta y por qué importa.
 */

import { describe, it, expect } from "vitest";
import {
  pendientesDeFicha,
  completitud,
  motivoCciInvalido,
  formatearCci,
  estadoTitulo,
  DIAS_AVISO_TITULO,
} from "@/lib/forestal/directorio-salud";

describe("pendientesDeFicha — cada papel pide lo suyo", () => {
  it("al destinatario la GTF le exige la dirección: es el punto de llegada", () => {
    const p = pendientesDeFicha({ roles: ["destinatario"], docNumero: "20156698963" });
    const campos = p.map((x) => x.campo);
    expect(campos).toContain("Dirección");
    expect(campos).toContain("Departamento, provincia y distrito");
  });

  it("al transportista, el registro MTC; al conductor, la licencia", () => {
    expect(pendientesDeFicha({ roles: ["transportista"] }).map((x) => x.campo)).toContain("Registro MTC");
    expect(pendientesDeFicha({ roles: ["conductor"] }).map((x) => x.campo)).toContain("Licencia de conducir");
  });

  it("al proveedor, con qué título extrae — es el origen legal de la madera", () => {
    const p = pendientesDeFicha({ roles: ["proveedor"] });
    const t = p.find((x) => x.campo === "Título habilitante");
    expect(t).toBeDefined();
    expect(t!.nivel).toBe("alto");
    expect(t!.porque).toContain("origen legal");
  });

  it("no le pide al conductor lo que es del destinatario", () => {
    const campos = pendientesDeFicha({ roles: ["conductor"], licencia: "Q-123" }).map((x) => x.campo);
    expect(campos).not.toContain("Dirección");
    expect(campos).not.toContain("Registro MTC");
  });

  it("cada pendiente explica qué se rompe, no sólo que falta", () => {
    for (const p of pendientesDeFicha({ roles: ["proveedor", "destinatario"] })) {
      expect(p.porque.length).toBeGreaterThan(15);
    }
  });

  it("teléfono o WhatsApp: alcanza con uno", () => {
    const soloWsp = pendientesDeFicha({ roles: ["proveedor"], whatsapp: "961000111" });
    expect(soloWsp.map((x) => x.campo)).not.toContain("Teléfono o WhatsApp");
  });

  it("la cuenta se pide una vez, no tres: con el CCI alcanza", () => {
    const conCci = pendientesDeFicha({ roles: ["proveedor"], cuentaCci: "00212345678901234567" });
    expect(conCci.map((x) => x.campo)).not.toContain("Cuenta para pagarle");
  });
});

describe("completitud", () => {
  it("una ficha vacía está en 0 y una completa en 100", () => {
    expect(completitud({ roles: ["conductor"] })).toBe(0);
    const completa = {
      roles: ["conductor"],
      docNumero: "45871236",
      licencia: "Q-12345678",
      telefono: "961000111",
    };
    expect(completitud(completa)).toBe(100);
  });

  it("mide contra lo que ESTA ficha necesita, no contra un ideal fijo", () => {
    // Un conductor con licencia, documento y teléfono está al 100 aunque no
    // tenga dirección: no es destinatario.
    const conductor = { roles: ["conductor"], docNumero: "45871236", licencia: "Q-1", telefono: "961" };
    expect(completitud(conductor)).toBe(100);
    // La MISMA ficha, si además es destinatario, baja: ahora le falta más.
    const tambienDestinatario = { ...conductor, roles: ["conductor", "destinatario"] };
    expect(completitud(tambienDestinatario)).toBeLessThan(100);
  });

  it("avanza a medida que se carga", () => {
    const a = completitud({ roles: ["proveedor"] });
    const b = completitud({ roles: ["proveedor"], docNumero: "20156698963" });
    const c = completitud({ roles: ["proveedor"], docNumero: "20156698963", tituloHabilitante: "PER-001" });
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe("CCI", () => {
  it("acepta 20 dígitos y dice cuántos escribiste si no", () => {
    expect(motivoCciInvalido("00212345678901234567")).toBeNull();
    expect(motivoCciInvalido("123")).toContain("3");
  });

  it("ignora guiones y espacios, como se copia del banco", () => {
    expect(motivoCciInvalido("002-123-456789012345-67")).toBeNull();
  });

  it("vacío es válido: la cuenta se carga después", () => {
    expect(motivoCciInvalido("")).toBeNull();
    expect(motivoCciInvalido(null)).toBeNull();
  });

  it("lo formatea como lo imprime el banco", () => {
    expect(formatearCci("00212345678901234567")).toBe("002-123-456789012345-67");
  });
});

describe("estadoTitulo — comprarle a un permiso vencido invalida tu GTF", () => {
  const HOY = new Date("2026-09-21T00:00:00.000Z");

  it("vencido lo dice con los días y en rojo", () => {
    const e = estadoTitulo("2026-09-01", HOY);
    expect(e.nivel).toBe("vencido");
    expect(e.tono).toBe("danger");
    expect(e.texto).toContain("20 días");
    expect(e.texto).toContain("no ampara");
  });

  it("avisa antes de que pase, con el umbral declarado", () => {
    const limite = new Date(HOY.getTime() + DIAS_AVISO_TITULO * 86_400_000);
    expect(estadoTitulo(limite, HOY).nivel).toBe("por_vencer");
    const masAlla = new Date(HOY.getTime() + (DIAS_AVISO_TITULO + 1) * 86_400_000);
    expect(estadoTitulo(masAlla, HOY).nivel).toBe("vigente");
  });

  it("sin fecha no dice «vigente»: dice que no se sabe", () => {
    expect(estadoTitulo(null, HOY).nivel).toBe("sin_dato");
    expect(estadoTitulo("cualquiera", HOY).nivel).toBe("sin_dato");
  });
});
