/**
 * Encadenar el ANEXO N° 04: cuál sigue después de cerrar uno.
 *
 * Se prueba acá y no en el navegador porque la única forma de llegar al caso
 * real sería emitir anexos de verdad — que son declaraciones juradas ante
 * SERFOR, no datos de prueba.
 */

import { describe, it, expect } from "vitest";
import { siguienteSinAnexo, type LineaDeAnexo } from "@/lib/forestal/anexo-encadenado";

const linea = (lineNo: number, status: LineaDeAnexo["status"] = "registrado"): LineaDeAnexo => ({
  id: `e${lineNo}`,
  lineNo,
  status,
});

describe("siguienteSinAnexo", () => {
  const libro = [linea(37), linea(42), linea(60), linea(12)];

  it("propone la primera que falta DESPUÉS de la que se cerró", () => {
    const r = siguienteSinAnexo(libro, { lineNo: 37 }, new Set(["e37"]));
    expect(r.siguiente?.lineNo).toBe(42);
    expect(r.pendientes).toBe(3);
  });

  it("vuelve al principio cuando la cerrada era la última", () => {
    const r = siguienteSinAnexo(libro, { lineNo: 60 }, new Set(["e60"]));
    expect(r.siguiente?.lineNo).toBe(12);
    expect(r.pendientes).toBe(3);
  });

  it("no queda ninguna cuando todas tienen su anexo", () => {
    const r = siguienteSinAnexo(libro, { lineNo: 60 }, new Set(["e37", "e42", "e60", "e12"]));
    expect(r.siguiente).toBeNull();
    expect(r.pendientes).toBe(0);
  });

  it("no empuja una guía anulada: el libro ya dio de baja ese viaje", () => {
    const conAnulada = [linea(37), linea(42, "anulado"), linea(60)];
    const r = siguienteSinAnexo(conAnulada, { lineNo: 37 }, new Set(["e37"]));
    expect(r.siguiente?.lineNo).toBe(60);
    expect(r.pendientes).toBe(1);
  });

  it("salta las que ya se emitieron en el medio", () => {
    const r = siguienteSinAnexo(libro, { lineNo: 12 }, new Set(["e12", "e37"]));
    expect(r.siguiente?.lineNo).toBe(42);
    expect(r.pendientes).toBe(2);
  });
});
