/**
 * «Enviar por WhatsApp» los documentos del permiso (Brandon 08-10): el número
 * listo para wa.me, los contactos sin repetir y el mensaje con sus enlaces.
 */
import { describe, expect, it } from "vitest";
import {
  TOPE_CONTACTOS_GUARDADOS,
  diaConNombre,
  enlaceWhatsApp,
  envioSchema,
  guardadosVisibles,
  leerGuardados,
  mensajeDeEnvio,
  normalizarTelefono,
  recordarContacto,
  telefonoLegible,
  unirContactos,
  venceEl,
} from "@/lib/forestal/contactos-envio";

describe("el número", () => {
  it("celular peruano de 9 dígitos → con 51; con espacios o guiones también", () => {
    expect(normalizarTelefono("987 654 321")).toBe("51987654321");
    expect(normalizarTelefono("+51 987-654-321")).toBe("51987654321");
  });
  it("un DNI o un fijo corto no es celular", () => {
    expect(normalizarTelefono("48831805")).toBeNull();
    expect(normalizarTelefono("061 57 1234")).toBeNull();
    expect(normalizarTelefono("")).toBeNull();
    expect(normalizarTelefono(null)).toBeNull();
  });
  it("se lee con espacios", () => {
    expect(telefonoLegible("51987654321")).toBe("+51 987 654 321");
  });
});

describe("el número de afuera", () => {
  it("10 a 15 dígitos ya traen su código de país: no se les antepone 51", () => {
    expect(normalizarTelefono("+1 202 555 0123")).toBe("12025550123");
    expect(normalizarTelefono("51987654321")).toBe("51987654321");
    expect(enlaceWhatsApp("12025550123", "hola")).toBe("https://wa.me/12025550123?text=hola");
  });
});

describe("de dónde salió cada número usado (Ley 29733)", () => {
  const ahora = "2026-10-08T15:00:00.000Z";
  const almacenero = { puedeLeer: (f: string) => f !== "adelantos" && f !== "proveedor", adminODueno: false };
  const admin = { puedeLeer: () => true, adminODueno: true };
  it("una cuenta de Adelantos que eligió un admin no le vuelve a un almacenero; lo escrito a mano y el directorio sí", () => {
    let l = recordarContacto([], { telefono: "51911111111", nombre: "Cuenta", fuente: "adelantos" }, ahora);
    l = recordarContacto(l, { telefono: "51922222222", nombre: "Chofer", fuente: "directorio" }, ahora);
    l = recordarContacto(l, { telefono: "51933333333", nombre: "A mano", fuente: "manual" }, ahora);
    expect(guardadosVisibles(l, almacenero).map((c) => c.nombre).sort()).toEqual(["A mano", "Chofer"]);
    expect(guardadosVisibles(l, admin)).toHaveLength(3);
  });
  it("las fuentes se suman: escribir a mano un número de Adelantos no lo destapa; elegirlo de «Ya enviado» no cambia nada", () => {
    let l = recordarContacto([], { telefono: "51911111111", nombre: "Cuenta", fuente: "adelantos" }, ahora);
    l = recordarContacto(l, { telefono: "51911111111", fuente: "manual" }, ahora);
    l = recordarContacto(l, { telefono: "51911111111", fuente: "envio" }, ahora);
    expect(l[0].fuentes?.sort()).toEqual(["adelantos", "manual"]);
    expect(guardadosVisibles(l, almacenero)).toEqual([]);
  });
  it("un guardado de antes (sin fuente) sólo lo ven admin y dueño, y sigue así", () => {
    const viejo = leerGuardados([{ telefono: "51987654321", nombre: "Ya usado", usos: 1, ultimoUso: ahora }]);
    expect(guardadosVisibles(viejo, almacenero)).toEqual([]);
    expect(guardadosVisibles(viejo, admin)).toHaveLength(1);
    expect(recordarContacto(viejo, { telefono: "51987654321", fuente: "manual" }, ahora)[0].fuentes).toBeUndefined();
    /* La fuente se lee de vuelta de las preferencias; una inventada descarta el guardado. */
    expect(leerGuardados([{ ...viejo[0], fuentes: ["adelantos"] }])[0].fuentes).toEqual(["adelantos"]);
    expect(leerGuardados([{ ...viejo[0], fuentes: ["planilla"] }])).toEqual([]);
  });
});

describe("los contactos", () => {
  const ahora = "2026-10-08T15:00:00.000Z";
  it("recordar sube el número arriba, suma el uso y conserva el nombre", () => {
    const a = recordarContacto([], { telefono: "51987654321", nombre: "Osvaldo" }, ahora);
    const b = recordarContacto(a, { telefono: "51911111111" }, ahora);
    const c = recordarContacto(b, { telefono: "51987654321" }, "2026-10-09T10:00:00.000Z");
    expect(c.map((x) => [x.telefono, x.nombre, x.usos])).toEqual([
      ["51987654321", "Osvaldo", 2],
      ["51911111111", "", 1],
    ]);
  });
  it("recuerda hasta el tope", () => {
    let l = leerGuardados([]);
    for (let i = 0; i < TOPE_CONTACTOS_GUARDADOS + 5; i++) l = recordarContacto(l, { telefono: `519${String(i).padStart(8, "0")}` }, ahora);
    expect(l).toHaveLength(TOPE_CONTACTOS_GUARDADOS);
  });
  it("lo guardado que no se entiende se descarta", () => {
    expect(leerGuardados([{ telefono: "abc", nombre: "x", usos: 1, ultimoUso: ahora }, null, "x"])).toEqual([]);
    expect(leerGuardados("x")).toEqual([]);
  });
  it("un número en dos fuentes es un contacto: gana el ya usado; sin teléfono no entra", () => {
    const guardados = recordarContacto([], { telefono: "51987654321", nombre: "Osvaldo (enviado)" }, ahora);
    const todos = unirContactos(guardados, [
      { nombre: "Osvaldo Muñoz", telefono: "987654321", fuente: "adelantos" },
      { nombre: "Zoila", telefono: "912 345 678", fuente: "directorio" },
      { nombre: "Ana", telefono: "912345679", fuente: "proveedor" },
      { nombre: "Sin teléfono", telefono: null, fuente: "directorio" },
    ]);
    expect(todos.map((c) => [c.nombre, c.fuente])).toEqual([
      ["Osvaldo (enviado)", "envio"],
      ["Ana", "proveedor"],
      ["Zoila", "directorio"],
    ]);
  });
});

describe("el mensaje", () => {
  it("vence a los 7 días y lo dice con el día de la semana", () => {
    expect(venceEl("2026-10-08")).toBe("2026-10-15");
    expect(diaConNombre("2026-10-15")).toBe("jueves 15/10");
  });
  it("un enlace por documento, numerados", () => {
    const m = mensajeDeEnvio({
      asunto: "Documentos del permiso 19-SEC/REG-PLT-2025-096",
      enlaces: [
        { nombre: "Resolución.pdf", url: "https://x/d/a" },
        { nombre: "DNI.jpg", url: "https://x/d/b" },
      ],
      vence: "2026-10-15",
    });
    expect(m).toBe(
      "Documentos del permiso 19-SEC/REG-PLT-2025-096\n\n1. Resolución.pdf\nhttps://x/d/a\n2. DNI.jpg\nhttps://x/d/b\n\nLos enlaces vencen el jueves 15/10.",
    );
  });
  it("el cuerpo del envío pide al menos un documento", () => {
    expect(envioSchema.safeParse({ telefono: "987654321", documentos: [] }).success).toBe(false);
    expect(envioSchema.safeParse({ telefono: "987654321", documentos: ["d1"] }).success).toBe(true);
  });
});
