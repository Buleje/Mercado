/**
 * La letra de toda una hoja del talonario (16-10): A−/A+ mueven todos los
 * valores juntos sin perder sus diferencias, «Igualar» los empareja, nada sale
 * de 5-24 pt y cada hoja (guía y lista) es aparte.
 */
import { describe, expect, it } from "vitest";
import { hojaDeFabrica } from "@/lib/forestal/gtf-matricial-disposicion";
import { letraDeTodaLaHoja, letraMasUsada, letrasDeLaHoja, textoLetras } from "@/lib/forestal/gtf-matricial-letra";

function hojaConUnTitulo() {
  const h = hojaDeFabrica("lista");
  const [primero] = Object.keys(h.campos);
  h.campos[primero!] = { ...h.campos[primero!]!, visible: true, letraPt: 10 };
  return { h, primero: primero! };
}

describe("letra de toda la hoja", () => {
  it("A+ suma a todos (también a la tabla y a los ocultos) y conserva la diferencia", () => {
    const { h, primero } = hojaConUnTitulo();
    const n = letraDeTodaLaHoja(h, { sumar: 0.5 });
    expect(n.campos[primero]!.letraPt).toBe(10.5);
    expect(n.tabla.letraPt).toBe(h.tabla.letraPt + 0.5);
    for (const [k, c] of Object.entries(h.campos)) if (k !== primero) expect(n.campos[k]!.letraPt).toBe(c.letraPt + 0.5);
  });

  it("Igualar deja todo parejo y nada sale de 5-24 pt", () => {
    const { h } = hojaConUnTitulo();
    const iguales = { ...h, ...letraDeTodaLaHoja(h, { igual: 7.5 }) };
    expect(new Set(letrasDeLaHoja(iguales))).toEqual(new Set([7.5]));
    expect(letraDeTodaLaHoja(h, { sumar: -50 }).tabla.letraPt).toBe(5);
    expect(letraDeTodaLaHoja(h, { igual: 99 }).tabla.letraPt).toBe(24);
  });

  it("cuenta sólo lo que se imprime y lo muestra como rango", () => {
    const { h } = hojaConUnTitulo();
    const letras = letrasDeLaHoja(h);
    expect(Math.max(...letras)).toBe(10);
    expect(textoLetras([9, 10, 9])).toBe("9–10 pt");
    expect(textoLetras([8.5, 8.5])).toBe("8,5 pt");
    expect(letraMasUsada([9, 10, 9, 10, 8])).toBe(9);
  });

  it("es de la hoja: la guía no se toca al cambiar la lista", () => {
    const guia = hojaDeFabrica("guia");
    const antes = JSON.stringify(guia);
    letraDeTodaLaHoja(hojaDeFabrica("lista"), { sumar: 1 });
    expect(JSON.stringify(guia)).toBe(antes);
  });
});
