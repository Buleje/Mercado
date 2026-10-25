/**
 * Qué pregunta «Vaciar» antes de borrar (Brandon 24-10: «cuando se da en
 * Vaciar lote quiero una modal de confirmar para eliminar ese lote, para
 * evitar presionar botones sin querer»).
 *
 * La pregunta dice cuánto se va y qué queda a salvo, con los números del
 * cubicador tal cual (llegan ya formateados: acá no se suma nada). Lo que más
 * importa decir es si lo borrado existe en otro lado: sin guardar, se pierde.
 */
import { formatNumber } from "@/lib/format";

export interface AvisoVaciar {
  title: string;
  description: string;
  intent: "danger";
  confirmLabel: string;
}

const cuenta = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

/** Vaciar el lote del cubicador de madera aserrada. */
export function avisoVaciarLote(d: {
  piezas: number;
  /** El pie tablar del lote, ya formateado. */
  pt: string;
  /** El nombre de la cubicación guardada que está abierta, o `null`. */
  guardada: string | null;
  cambiosSinGuardar: boolean;
  /** El lote ya se registró en el Libro CTP (producción). */
  enElLibro?: boolean;
}): AvisoVaciar {
  const queda: string[] = [];
  if (d.enElLibro) queda.push("Lo registrado en el Libro no se toca.");
  if (d.guardada) {
    queda.push(
      d.cambiosSinGuardar
        ? `La guardada «${d.guardada}» no se toca, pero lo que cambiaste sin guardar se pierde.`
        : `La guardada «${d.guardada}» no se toca.`,
    );
  } else if (!d.enElLibro) {
    queda.push("No está guardado: se pierde.");
  }
  return {
    title: "¿Vaciar el lote?",
    description: [`Se borran sus ${cuenta(d.piezas, "pieza", "piezas")} (${d.pt} PT) de la pantalla.`, ...queda].join(" "),
    intent: "danger",
    confirmLabel: "Sí, vaciar",
  };
}

/** Vaciar el patio del cubicador de trozas: vive sólo en este dispositivo. */
export function avisoVaciarPatio(d: { trozas: number; volumen: string; unidad: string }): AvisoVaciar {
  return {
    title: "¿Vaciar el patio?",
    description: `Se borran sus ${cuenta(d.trozas, "troza", "trozas")} (${d.volumen} ${d.unidad}) de este dispositivo. No se puede deshacer.`,
    intent: "danger",
    confirmLabel: "Sí, vaciar",
  };
}

/**
 * Vaciar la trasera del camión: las piezas sólo se sacan del dibujo de la
 * carga, siguen en el lote. Decirlo evita que alguien no se anime a usarlo.
 */
export function avisoVaciarTrasera(d: { piezas: number; pt: string }): AvisoVaciar {
  return {
    title: "¿Vaciar la trasera?",
    description: `${d.piezas === 1 ? "Se quita su pieza" : `Se quitan sus ${cuenta(d.piezas, "pieza", "piezas")}`} (${d.pt} PT) de la trasera del camión. ${d.piezas === 1 ? "La pieza sigue" : "Las piezas siguen"} en el lote.`,
    intent: "danger",
    confirmLabel: "Sí, vaciar",
  };
}

/**
 * Vaciar la lista del escáner de trozas (ráfaga): son las lecturas de esta
 * pantalla; las trozas del libro no se tocan. Lo que sí se pierde es la lista.
 */
export function avisoVaciarLecturas(d: { trozas: number; m3: string }): AvisoVaciar {
  return {
    title: "¿Vaciar la lista?",
    description: `${d.trozas === 1 ? "Se borra la troza leída" : `Se borran las ${cuenta(d.trozas, "troza leída", "trozas leídas")}`} (${d.m3} m³) de esta lista. Las trozas del libro no se tocan; bájala en CSV antes si la necesitas.`,
    intent: "danger",
    confirmLabel: "Sí, vaciar",
  };
}
