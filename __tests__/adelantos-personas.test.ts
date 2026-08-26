import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, mensajeRecordatorio, telefonoWhatsApp } from "@/lib/adelantos/contacto";
import {
  avisoDeDuplicado,
  buscarDuplicado,
  revisarDocumento,
  revisarTelefono,
} from "@/lib/adelantos/persona-validacion";
import { cumpleFiltro, ordenarPersonas, type PersonaOrdenable } from "@/lib/adelantos/ordenar-personas";

const p = (x: Partial<PersonaOrdenable> & { nombre: string }): PersonaOrdenable => ({
  totalAdelantado: {},
  saldoPendiente: {},
  totalEntregado: {},
  saldoAFavor: {},
  adelantosAbiertos: 0,
  adelantosLiquidados: 0,
  adelantosCancelados: 0,
  ultimoAdelanto: null,
  ...x,
});
/** Atajo para los tests: un saldo/monto que siempre es en soles. */
const pen = (n: number): Record<string, number> => ({ PEN: n });
const nombres = (xs: PersonaOrdenable[]) => xs.map((x) => x.nombre);

describe("telefonoWhatsApp", () => {
  it("le pone el 51 a los nueve dígitos peruanos", () => {
    expect(telefonoWhatsApp("988888888")).toBe("51988888888");
  });

  it("respeta el número que ya trae código de país", () => {
    expect(telefonoWhatsApp("51988888888")).toBe("51988888888");
  });

  it("ignora espacios, guiones y paréntesis", () => {
    expect(telefonoWhatsApp("(988) 888-888")).toBe("51988888888");
  });

  it("devuelve null si no hay número usable — un wa.me sin destino abre la nada", () => {
    expect(telefonoWhatsApp(null)).toBeNull();
    expect(telefonoWhatsApp("")).toBeNull();
    expect(telefonoWhatsApp("123")).toBeNull();
    expect(telefonoWhatsApp("sin teléfono")).toBeNull();
  });
});

describe("mensajeRecordatorio", () => {
  it("nombra el saldo exacto cuando hay deuda", () => {
    expect(mensajeRecordatorio("Juan", 1250.5)).toContain("S/ 1,250.50");
  });

  it("a quien está al día lo saluda, no le cobra S/ 0.00", () => {
    expect(mensajeRecordatorio("Ana", 0)).toBe("Hola Ana, ¿cómo estás?");
    expect(mensajeRecordatorio("Ana", -50)).not.toContain("pendiente");
  });

  it("usa el símbolo de la moneda del adelanto", () => {
    expect(mensajeRecordatorio("Ana", 100, "USD")).toContain("$ 100.00");
  });
});

describe("enlaceWhatsApp", () => {
  it("arma el enlace con el texto ya escapado", () => {
    const url = enlaceWhatsApp("988888888", "Juan", 50)!;
    expect(url.startsWith("https://wa.me/51988888888?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("Juan");
  });

  it("sin teléfono no hay enlace", () => {
    expect(enlaceWhatsApp(null, "Juan", 50)).toBeNull();
  });
});

describe("revisarDocumento", () => {
  it("acepta un DNI de 8 y un RUC válido de 11", () => {
    expect(revisarDocumento("12345678")).toBeNull();
    expect(revisarDocumento("20123456789")).toBeNull();
    expect(revisarDocumento("10123456789")).toBeNull();
  });

  it("marca los largos imposibles", () => {
    expect(revisarDocumento("1234567")).toMatch(/8 dígitos/);
    expect(revisarDocumento("123456789")).toMatch(/8 dígitos/);
  });

  it("marca un RUC que no arranca como RUC", () => {
    expect(revisarDocumento("99123456789")).toMatch(/arranca con/);
  });

  it("marca las letras", () => {
    expect(revisarDocumento("1234567A")).toMatch(/sólo números/);
  });

  it("vacío no es un error: el documento es opcional", () => {
    expect(revisarDocumento("")).toBeNull();
    expect(revisarDocumento("   ")).toBeNull();
  });
});

describe("revisarTelefono", () => {
  it("acepta un celular peruano", () => {
    expect(revisarTelefono("988888888")).toBeNull();
    expect(revisarTelefono("988 888 888")).toBeNull();
  });

  it("avisa si los nueve dígitos no empiezan con 9", () => {
    expect(revisarTelefono("488888888")).toMatch(/empieza con 9/);
  });

  it("deja pasar un fijo con código y no se mete con lo que no conoce", () => {
    expect(revisarTelefono("5161234567")).toBeNull();
  });

  it("vacío no es un error", () => {
    expect(revisarTelefono("")).toBeNull();
  });
});

describe("buscarDuplicado", () => {
  const existentes = [
    { id: "1", nombre: "José Pérez", documento: "12345678", telefono: "988888888" },
    { id: "2", nombre: "María Gómez", documento: null, telefono: null },
  ];

  it("el documento repetido es la señal más fuerte", () => {
    const d = buscarDuplicado({ nombre: "Otro Nombre", documento: "12345678" }, existentes);
    expect(d).toMatchObject({ motivo: "documento", persona: { id: "1" } });
  });

  it("el teléfono repetido también, aunque venga con guiones", () => {
    const d = buscarDuplicado({ nombre: "Otro", telefono: "988-888-888" }, existentes);
    expect(d?.motivo).toBe("telefono");
  });

  it("el nombre se compara sin tildes ni mayúsculas", () => {
    // «jose perez» y «José Pérez» son el mismo señor cargado dos veces.
    expect(buscarDuplicado({ nombre: "jose perez" }, existentes)?.motivo).toBe("nombre");
    expect(buscarDuplicado({ nombre: "  MARIA GOMEZ " }, existentes)?.motivo).toBe("nombre");
  });

  it("al editar, la persona no es duplicado de sí misma", () => {
    expect(buscarDuplicado({ nombre: "José Pérez", documento: "12345678" }, existentes, "1")).toBeNull();
  });

  it("no inventa duplicados", () => {
    expect(buscarDuplicado({ nombre: "Carlos Ruiz", documento: "87654321" }, existentes)).toBeNull();
    expect(buscarDuplicado({ nombre: "" }, existentes)).toBeNull();
  });

  it("el aviso nombra a quién ya está cargado", () => {
    const d = buscarDuplicado({ nombre: "x", documento: "12345678" }, existentes)!;
    expect(avisoDeDuplicado(d)).toContain("José Pérez");
  });
});

describe("ordenarPersonas", () => {
  const lista = [
    p({ nombre: "Ana", saldoPendiente: pen(100), totalAdelantado: pen(1000), totalEntregado: pen(900), limiteCredito: 5000, ultimoAdelanto: "2026-01-01T00:00:00.000Z" }),
    p({ nombre: "Beto", saldoPendiente: pen(400), totalAdelantado: pen(500), totalEntregado: pen(100), limiteCredito: 500, ultimoAdelanto: "2026-06-01T00:00:00.000Z" }),
    p({ nombre: "Carla", saldoPendiente: pen(900), totalAdelantado: pen(900), totalEntregado: pen(0), ultimoAdelanto: "2026-03-01T00:00:00.000Z" }),
  ];

  it("no muta el arreglo original", () => {
    const copia = [...lista];
    ordenarPersonas(lista, "nombre");
    expect(lista).toEqual(copia);
  });

  it("por saldo, primero quien más debe", () => {
    expect(nombres(ordenarPersonas(lista, "saldo"))).toEqual(["Carla", "Beto", "Ana"]);
  });

  it("por riesgo NO es lo mismo que por saldo: manda la proporción del tope", () => {
    // Beto debe 400 de 500 (80%); Ana debe 100 de 5.000 (2%); Carla no tiene
    // tope, así que no hay nada que medir y va al final.
    expect(nombres(ordenarPersonas(lista, "riesgo"))).toEqual(["Beto", "Ana", "Carla"]);
  });

  it("por cumplimiento, primero quien menos devolvió", () => {
    expect(nombres(ordenarPersonas(lista, "cumplimiento"))).toEqual(["Carla", "Beto", "Ana"]);
  });

  it("quien nunca sacó nada no encabeza el ranking de incumplidores", () => {
    const conNovato = [...lista, p({ nombre: "Novato" })];
    expect(nombres(ordenarPersonas(conNovato, "cumplimiento")).at(-1)).toBe("Novato");
  });

  it("por último adelanto, lo más reciente primero y los que nunca sacaron al final", () => {
    const conNovato = [...lista, p({ nombre: "Novato" })];
    expect(nombres(ordenarPersonas(conNovato, "reciente"))).toEqual(["Beto", "Carla", "Ana", "Novato"]);
  });

  it("desempata alfabéticamente: dos saldos iguales no bailan entre renders", () => {
    const empate = [p({ nombre: "Zoila", saldoPendiente: pen(50) }), p({ nombre: "Ana", saldoPendiente: pen(50) })];
    expect(nombres(ordenarPersonas(empate, "saldo"))).toEqual(["Ana", "Zoila"]);
    expect(nombres(ordenarPersonas([...empate].reverse(), "saldo"))).toEqual(["Ana", "Zoila"]);
  });
});

describe("cumpleFiltro", () => {
  const deudor = p({ nombre: "Deudor", saldoPendiente: pen(300), limiteCredito: 300 });
  const alDia = p({ nombre: "Al día", saldoPendiente: {}, limiteCredito: 1000 });

  it("«deben» y «al día» parten la cartera sin dejar a nadie afuera", () => {
    expect(cumpleFiltro(deudor, "deben")).toBe(true);
    expect(cumpleFiltro(alDia, "deben")).toBe(false);
    expect(cumpleFiltro(alDia, "al-dia")).toBe(true);
    expect(cumpleFiltro(deudor, "al-dia")).toBe(false);
  });

  it("«sin margen» agarra a quien llegó a su tope", () => {
    expect(cumpleFiltro(deudor, "riesgo")).toBe(true);
    expect(cumpleFiltro(alDia, "riesgo")).toBe(false);
  });

  it("«todas» no filtra nada", () => {
    expect(cumpleFiltro(deudor, "todas")).toBe(true);
    expect(cumpleFiltro(alDia, "todas")).toBe(true);
  });

  /**
   * El tope es en soles (el form lo rotula "S/") — deuda en dólares no cuenta
   * para "sin margen", igual que el guard del backend (auditoría de esta
   * sesión). "deben" sí ve la deuda en cualquier moneda: ahí no hay tope que
   * mezclar, sólo la pregunta de si debe algo.
   */
  it("«sin margen» sólo mira la deuda en soles — dólares no cuentan para un tope en soles", () => {
    const soloDolares = p({ nombre: "Solo USD", saldoPendiente: { USD: 500 }, limiteCredito: 300 });
    expect(cumpleFiltro(soloDolares, "riesgo")).toBe(false);
    expect(cumpleFiltro(soloDolares, "deben")).toBe(true);
  });
});
