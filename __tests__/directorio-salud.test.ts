/**
 * Salud de una ficha del Directorio: qué le falta y por qué importa.
 */

import { describe, it, expect } from "vitest";
import {
  pendientesDeFicha,
  completitud,
  tituloCubiertoPorPermisos,
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

describe("el origen legal puede estar en los permisos, no en el campo viejo", () => {
  // La misma ficha en los dos escenarios: lo único que cambia es el contexto.
  const proveedor = { roles: ["proveedor"], docNumero: "20156698963", telefono: "961000111" };

  it("sin permisos se sigue reclamando el título, como siempre", () => {
    const campos = pendientesDeFicha(proveedor).map((x) => x.campo);
    expect(campos).toContain("Título habilitante");
    // Y sin segundo argumento se comporta igual que con `{ permisos: 0 }`.
    expect(pendientesDeFicha(proveedor, { permisos: 0 })).toEqual(pendientesDeFicha(proveedor));
  });

  it("con un permiso cargado deja de pedirlo, y NADA más cambia", () => {
    const antes = pendientesDeFicha(proveedor);
    const despues = pendientesDeFicha(proveedor, { permisos: 1 });
    expect(despues.map((x) => x.campo)).not.toContain("Título habilitante");
    // El resto de la lista —campos, motivos, niveles y orden— es idéntico.
    expect(despues).toEqual(antes.filter((x) => x.campo !== "Título habilitante"));
  });

  it("sólo le toca al proveedor: al destinatario y al conductor no les mueve nada", () => {
    const otros = { roles: ["destinatario", "conductor"], docNumero: "45871236" };
    expect(pendientesDeFicha(otros, { permisos: 3 })).toEqual(pendientesDeFicha(otros));
  });

  it("un título escrito a mano sigue alcanzando aunque no haya permisos", () => {
    const conTitulo = { ...proveedor, tituloHabilitante: "PER-FMC-001" };
    expect(pendientesDeFicha(conTitulo).map((x) => x.campo)).not.toContain("Título habilitante");
  });

  it("la barra SUBE al atar el permiso: el denominador no encoge", () => {
    // Una ficha de proveedor pide 5 cosas; ésta tiene documento y teléfono.
    expect(pendientesDeFicha({ roles: ["proveedor"] })).toHaveLength(5);
    const sin = completitud(proveedor);
    const con = completitud(proveedor, { permisos: 2 });
    expect(sin).toBe(40); // 2 de 5
    expect(con).toBe(60); // 3 de 5 — el permiso cuenta como el origen legal
    expect(con).toBeGreaterThan(sin);
  });

  it("dice por qué dejó de pedirlo, en vez de borrarlo en silencio", () => {
    expect(tituloCubiertoPorPermisos(proveedor)).toBeNull();
    const motivo = tituloCubiertoPorPermisos(proveedor, { permisos: 2 });
    expect(motivo).toContain("origen legal");
    expect(motivo).toContain("2 cargados");
    // Si el campo viejo está escrito, no hay nada que explicar.
    expect(tituloCubiertoPorPermisos({ ...proveedor, tituloHabilitante: "PER-001" }, { permisos: 2 })).toBeNull();
    // Y a quien no es proveedor, tampoco.
    expect(tituloCubiertoPorPermisos({ roles: ["conductor"] }, { permisos: 2 })).toBeNull();
  });

  it("con un permiso, un solo cargado se dice en singular", () => {
    expect(tituloCubiertoPorPermisos(proveedor, { permisos: 1 })).toContain("1 cargado ");
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
