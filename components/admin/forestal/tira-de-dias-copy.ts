/**
 * Cómo se llama lo que un día «ya tiene» en la tira de días del registro
 * (`CtpSemanaDeRegistro`), según la sección. Lo leen la tira, cada casillero y
 * los avisos de abajo: el mismo nombre en los tres.
 */
import type { SeccionDeJornada } from "./hooks/use-jornadas-produccion";

export interface NombreDeLaTira {
  uno: string;
  varios: string;
  titulo: string;
  aviso: string;
  /** El día sin nada, con la concordancia del sustantivo («corridas anotadas», «consumos anotados»). */
  ninguno: string;
}

export const NOMBRE_DE_LA_TIRA: Record<SeccionDeJornada, NombreDeLaTira> = {
  produccion: {
    uno: "corrida",
    varios: "corridas",
    titulo: "Día del registro",
    ninguno: "sin corridas anotadas",
    aviso: "Si es otro turno u otra sierra, sigue; si es la misma, la estarías cargando dos veces.",
  },
  consumo: {
    uno: "consumo",
    varios: "consumos",
    titulo: "Día del consumo",
    ninguno: "sin consumos anotados",
    aviso:
      "Si entró otra tanda a la sierra ese día, sigue; si es la misma, la madera se contaría dos veces.",
  },
  despacho: {
    uno: "despacho",
    varios: "despachos",
    titulo: "Día del despacho",
    ninguno: "sin despachos anotados",
    aviso: "Si salió otro camión ese día, sigue; si es la misma guía, estaría duplicada.",
  },
};

/** `"2 corridas"`, `"1 consumo"`. */
export const cuantos = (n: number, nombre: Pick<NombreDeLaTira, "uno" | "varios">) =>
  `${n} ${n === 1 ? nombre.uno : nombre.varios}`;
