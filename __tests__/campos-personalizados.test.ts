import { describe, it, expect } from "vitest";
import {
  camposDelRegistro,
  claveDesdeNombre,
  esPermanente,
  motivoNombreInvalido,
  motivoValorInvalido,
  partirValor,
  reutilizables,
  textoDelValor,
  type CampoPersonalizado,
} from "@/lib/campos-personalizados";

/**
 * Campos personalizados (ADR-427): las preguntas que el negocio inventa.
 *
 * Lo que se prueba acá es lo que distingue esta función de un `Json` suelto:
 * que un campo temporal **no se filtre** al registro de al lado, que el
 * permanente aparezca en todos, y que un valor que no se puede convertir no se
 * invente.
 */

const campo = (x: Partial<CampoPersonalizado> = {}): CampoPersonalizado => ({
  id: x.id ?? "c1",
  formulario: x.formulario ?? "forestal.plan",
  clave: x.clave ?? "apuntador",
  nombre: x.nombre ?? "Apuntador",
  descripcion: x.descripcion ?? null,
  tipo: x.tipo ?? "texto",
  opciones: x.opciones ?? [],
  soloParaRegistroId: x.soloParaRegistroId ?? null,
  orden: x.orden ?? 0,
  activo: x.activo ?? true,
});

describe("claveDesdeNombre", () => {
  it("saca tildes, espacios y mayúsculas", () => {
    expect(claveDesdeNombre("Número de orden")).toBe("numero-de-orden");
    expect(claveDesdeNombre("  Color de la CINTA  ")).toBe("color-de-la-cinta");
  });

  it("dos nombres que sólo difieren en tildes son la MISMA pregunta", () => {
    expect(claveDesdeNombre("Camión")).toBe(claveDesdeNombre("camion"));
  });

  it("un nombre sin letras ni números no deja clave", () => {
    expect(claveDesdeNombre("¿¿¿ !!! ???")).toBe("");
  });
});

describe("motivoNombreInvalido", () => {
  it("avisa del duplicado nombrando el campo que ya existe", () => {
    const m = motivoNombreInvalido("apuntador", [{ clave: "apuntador", nombre: "Apuntador" }]);
    expect(m).toContain("Apuntador");
  });

  it("no deja un nombre de una letra ni uno vacío", () => {
    expect(motivoNombreInvalido("a", [])).not.toBeNull();
    expect(motivoNombreInvalido("   ", [])).not.toBeNull();
  });

  it("un nombre nuevo pasa", () => {
    expect(motivoNombreInvalido("Color de cinta", [{ clave: "apuntador", nombre: "Apuntador" }])).toBeNull();
  });
});

describe("partirValor", () => {
  it("el número queda además en su columna, para poder sumarlo", () => {
    expect(partirValor("numero", "12,5")).toEqual({ valor: "12,5", valorNum: 12.5, valorFecha: null });
  });

  it("un número mal escrito NO se inventa: queda sólo el texto", () => {
    expect(partirValor("numero", "doce")).toEqual({ valor: "doce", valorNum: null, valorFecha: null });
  });

  it("la fecha se guarda a las 00:00 UTC (las fechas del libro son date-only)", () => {
    expect(partirValor("fecha", "2026-03-04")).toEqual({
      valor: "2026-03-04",
      valorNum: null,
      valorFecha: "2026-03-04T00:00:00.000Z",
    });
  });

  it("vacío es vacío en las tres columnas, no un 0 ni una fecha de hoy", () => {
    expect(partirValor("numero", "   ")).toEqual({ valor: null, valorNum: null, valorFecha: null });
  });
});

describe("motivoValorInvalido", () => {
  it("nada es obligatorio: el vacío nunca es un error", () => {
    expect(motivoValorInvalido({ tipo: "numero", opciones: [] }, "")).toBeNull();
  });

  it("avisa cuando lo escrito no es del tipo que dice el campo", () => {
    expect(motivoValorInvalido({ tipo: "numero", opciones: [] }, "doce")).not.toBeNull();
    expect(motivoValorInvalido({ tipo: "fecha", opciones: [] }, "4 de marzo")).not.toBeNull();
  });

  it("una opción fuera de la lista se avisa; con lista vacía no se juzga", () => {
    expect(motivoValorInvalido({ tipo: "opcion", opciones: ["A", "B"] }, "C")).not.toBeNull();
    expect(motivoValorInvalido({ tipo: "opcion", opciones: [] }, "lo que sea")).toBeNull();
  });
});

describe("camposDelRegistro", () => {
  const permanente = campo({ id: "p", clave: "apuntador", orden: 1 });
  const temporalDeUno = campo({ id: "t1", clave: "nota-viaje", soloParaRegistroId: "reg-1", orden: 2 });
  const temporalDeOtro = campo({ id: "t2", clave: "nota-otra", soloParaRegistroId: "reg-2" });
  const todos = [permanente, temporalDeUno, temporalDeOtro];

  it("el temporal de OTRO registro no se filtra: es lo que separa esto de un Json suelto", () => {
    expect(camposDelRegistro(todos, "reg-1").map((c) => c.id)).toEqual(["p", "t1"]);
  });

  it("el permanente aparece en todos los registros, incluso en uno sin temporales", () => {
    expect(camposDelRegistro(todos, "reg-9").map((c) => c.id)).toEqual(["p"]);
  });

  it("sin registro (un alta) sólo van los permanentes", () => {
    expect(camposDelRegistro(todos, null).map((c) => c.id)).toEqual(["p"]);
  });

  it("los temporales van al final: la excepción no empuja lo que se pregunta siempre", () => {
    const permanenteTardio = campo({ id: "p2", clave: "otro", orden: 9 });
    const orden = camposDelRegistro([temporalDeUno, permanenteTardio, permanente], "reg-1").map((c) => c.id);
    expect(orden).toEqual(["p", "p2", "t1"]);
  });

  it("un campo apagado no se pinta", () => {
    expect(camposDelRegistro([campo({ id: "x", activo: false })], "reg-1")).toHaveLength(0);
  });
});

describe("reutilizables", () => {
  it("ofrece los permanentes de OTROS formularios y no los de éste", () => {
    const aca = campo({ id: "a", formulario: "forestal.plan", clave: "apuntador" });
    const alla = campo({ id: "b", formulario: "directorio.parte", clave: "color-cinta" });
    expect(reutilizables([aca, alla], "forestal.plan").map((c) => c.id)).toEqual(["b"]);
  });

  it("no ofrece una pregunta que este formulario ya tiene, aunque exista en otro", () => {
    const aca = campo({ id: "a", formulario: "forestal.plan", clave: "apuntador" });
    const alla = campo({ id: "b", formulario: "directorio.parte", clave: "apuntador" });
    expect(reutilizables([aca, alla], "forestal.plan")).toHaveLength(0);
  });

  it("no ofrece temporales: la excepción de un registro no se adopta en otra pantalla", () => {
    const temporal = campo({ id: "t", formulario: "directorio.parte", clave: "nota", soloParaRegistroId: "r" });
    expect(reutilizables([temporal], "forestal.plan")).toHaveLength(0);
  });

  it("la misma pregunta en dos formularios se ofrece una sola vez", () => {
    const uno = campo({ id: "1", formulario: "a", clave: "apuntador" });
    const dos = campo({ id: "2", formulario: "b", clave: "apuntador" });
    expect(reutilizables([uno, dos], "forestal.plan")).toHaveLength(1);
  });
});

describe("textoDelValor y esPermanente", () => {
  it("sin valor muestra «—», nunca un 0 ni un vacío que parezca dato", () => {
    expect(textoDelValor({ tipo: "texto" }, null)).toBe("—");
    expect(textoDelValor({ tipo: "numero" }, { valor: "  " })).toBe("—");
  });

  it("el sí/no se lee en castellano", () => {
    expect(textoDelValor({ tipo: "si_no" }, { valor: "si" })).toBe("Sí");
    expect(textoDelValor({ tipo: "si_no" }, { valor: "no" })).toBe("No");
  });

  it("la fecha se formatea en UTC (si no, en Lima se corre un día)", () => {
    expect(textoDelValor({ tipo: "fecha" }, { valor: "2026-03-04" })).toBe("04/03/2026");
  });

  it("permanente es el que no cuelga de un registro", () => {
    expect(esPermanente({ soloParaRegistroId: null })).toBe(true);
    expect(esPermanente({ soloParaRegistroId: "reg-1" })).toBe(false);
  });
});

/**
 * El tope de preguntas por formulario (hallazgo de la auditoría de seguridad:
 * 96 campos permanentes creados en 17 s con 120 POST). No es un límite técnico:
 * un modal con noventa preguntas inventadas no lo usa nadie, y no hay baja
 * masiva para deshacerlo.
 *
 * La regla vive en la DB class (`MAX_CAMPOS_POR_FORMULARIO`); acá se fija la
 * intención para que nadie la suba sin pensarlo: **los temporales no cuentan**,
 * porque viven en un registro y no le llenan la pantalla a los demás.
 */
describe("el tope de campos es de los permanentes, no de los temporales", () => {
  it("camposDelRegistro nunca mezcla los temporales de otros registros en la cuenta", () => {
    const permanentes = Array.from({ length: 3 }, (_, i) => campo({ id: `p${i}`, clave: `c${i}`, orden: i }));
    const temporalesDeOtros = Array.from({ length: 40 }, (_, i) =>
      campo({ id: `t${i}`, clave: `t${i}`, soloParaRegistroId: `otro-${i}` }),
    );
    expect(camposDelRegistro([...permanentes, ...temporalesDeOtros], "mio")).toHaveLength(3);
  });
});
