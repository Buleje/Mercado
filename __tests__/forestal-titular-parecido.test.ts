/**
 * La misma comunidad escrita de varias formas (`titular-parecido`). El caso
 * real de Blas: «CCNN SAN LUIS DE CHINCHIGUANI» en una GTF y «COMUNIDAD NATIVA
 * SAN LUIS DE CHINCHIHUANI» en el Directorio.
 */
import { describe, expect, it } from "vitest";
import { claveDeTitular, distanciaEdicion, mismoTitular, titularParecido } from "@/lib/forestal/titular-parecido";

const DIRECTORIO = [
  { id: "a", nombre: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI" },
  { id: "b", nombre: "Comunidad Nativa Callería" },
  { id: "c", nombre: "Inversiones Agroforestales Blas S.A.C." },
];

describe("claveDeTitular", () => {
  it("quita la forma de la organización, tildes y mayúsculas", () => {
    const k = "san luis de chinchihuani";
    expect(claveDeTitular("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI")).toBe(k);
    expect(claveDeTitular("CCNN San Luis de Chinchihuani")).toBe(k);
    expect(claveDeTitular("C.N. San Luis de Chinchihuani")).toBe(k);
    expect(claveDeTitular("CC.NN. San Luis de Chinchihuani")).toBe(k);
    expect(claveDeTitular("Comunidad Nativa de San Luis de Chinchihuani")).toBe(k);
    expect(claveDeTitular("Calleria")).toBe(claveDeTitular("C.C. Callería"));
  });

  it("no se come palabras que empiezan igual", () => {
    expect(claveDeTitular("Cnel. Portillo")).toBe("cnel portillo");
    expect(claveDeTitular("Ccochaccasa")).toBe("ccochaccasa");
  });
});

describe("distanciaEdicion", () => {
  it("cuenta y corta en el tope", () => {
    expect(distanciaEdicion("chinchiguani", "chinchihuani")).toBe(1);
    expect(distanciaEdicion("abc", "abc")).toBe(0);
    expect(distanciaEdicion("abcdef", "uvwxyz", 2)).toBe(3);
  });
});

describe("mismoTitular / titularParecido", () => {
  it("el caso de Blas se junta", () => {
    expect(mismoTitular("CCNN SAN LUIS DE CHINCHIGUANI", "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI")).toBe(true);
    const p = titularParecido("CCNN SAN LUIS DE CHINCHIGUANI", DIRECTORIO, (d) => d.nombre);
    expect(p?.item.id).toBe("a");
    expect(p?.identico).toBe(false);
    expect(p?.distancia).toBe(1);
  });

  it("escrito igual: lo encuentra y dice que es idéntico (no hay nada que sugerir)", () => {
    const p = titularParecido("Comunidad Nativa Callería", DIRECTORIO, (d) => d.nombre);
    expect(p).toMatchObject({ distancia: 0, identico: true });
  });

  it("nombres distintos no se juntan", () => {
    expect(mismoTitular("Comunidad Nativa Callería", "Comunidad Nativa Caimito")).toBe(false);
    expect(titularParecido("Maderera Ucayali", DIRECTORIO, (d) => d.nombre)).toBeNull();
    expect(titularParecido("CN", DIRECTORIO, (d) => d.nombre)).toBeNull();
  });

  it("M4: no junta de más — palabra por palabra, género y forma", () => {
    // Una palabra de hasta 4 letras va exacta.
    expect(mismoTitular("CN Santa Rosa", "CN Santa Rita")).toBe(false);
    // Nativa y campesina son comunidades distintas.
    expect(mismoTitular("Comunidad Nativa Pampa Verde", "Comunidad Campesina Pampa Verde")).toBe(false);
    expect(mismoTitular("CCNN Pampa Verde", "C.C. Pampa Verde")).toBe(false);
    // Sólo el género (o el número) cambia: es otro nombre.
    expect(mismoTitular("Puerto Nuevo", "Puerto Nueva")).toBe(false);
    expect(mismoTitular("CN Puerto Nuevo", "CN Puerto Nuevos")).toBe(false);
    // La letra cambiada en una palabra larga sí se junta, y la forma que falta no estorba.
    expect(mismoTitular("CCNN San Luis de Chinchiguani", "Comunidad Nativa San Luis de Chinchihuani")).toBe(true);
    expect(mismoTitular("San Luis de Chinchiguani", "C.N. San Luis de Chinchihuani")).toBe(true);
    // Dos letras en la misma palabra ya no.
    expect(mismoTitular("CN Chinchiguana", "CN Chinchihuani")).toBe(false);
    expect(titularParecido("C.C. San Luis de Chinchihuani", DIRECTORIO, (d) => d.nombre)).toBeNull();
  });

  it("nombres cortos piden igualdad exacta", () => {
    expect(mismoTitular("Lima", "Lisa")).toBe(false);
    expect(mismoTitular("LIMA", "lima")).toBe(true);
  });
});
