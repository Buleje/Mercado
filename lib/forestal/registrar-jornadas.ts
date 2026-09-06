import type { Jornada } from "./consumo-en-jornadas";

/**
 * registrar-jornadas — escribir N corridas sin dejar el libro a medias (ADR-373).
 *
 * Registrar una jornada son DOS actos: consumir las trozas (que abre la corrida)
 * y declararle la producción. Con cinco jornadas eso son diez escrituras, y
 * cualquiera puede fallar — el mes se cerró, una troza ya se consumió desde otra
 * tablet, la producción pasa el tope de rendimiento.
 *
 * Lo que NO se puede hacer es tratar «falló» como un único desenlace. Hay tres,
 * y cada uno se arregla distinto:
 *
 * | Qué pasó | Qué quedó en el libro | Qué hace el operador |
 * |---|---|---|
 * | Ambos actos bien | corrida declarada | nada |
 * | Consumió y no declaró | **corrida abierta con su materia prima** | declararla desde la tabla |
 * | No consumió | nada | revisar el motivo y reintentar ese día |
 *
 * Por eso el resultado nombra el N° de las corridas que quedaron abiertas: sin
 * eso, esa madera queda consumida y sin producción, y nadie sabe cuál es.
 *
 * El transporte entra por parámetro: acá vive la POLÍTICA, no el fetch.
 */

export interface ResultadoJornada {
  dia: number;
  fecha: string;
  estado: "declarada" | "corrida-abierta" | "no-consumio";
  /** N° de línea del libro, cuando llegó a existir. */
  lineNo?: number;
  detalle?: string;
}

export interface ResumenJornadas {
  resultados: ResultadoJornada[];
  declaradas: number;
  abiertas: number;
  fallidas: number;
  /** Frase lista para mostrar: dice qué quedó, no sólo si «salió bien». */
  mensaje: string;
}

export interface TransporteJornadas {
  consumir: (j: Jornada) => Promise<{ id: string; lineNo: number }>;
  declarar: (corridaId: string, j: Jornada) => Promise<void>;
  onAvance?: (hechas: number, total: number) => void;
}

/**
 * Dos fallos seguidos de consumo por el MISMO motivo y se corta.
 *
 * Si el mes está cerrado, las cinco jornadas van a fallar igual: insistir sólo
 * agrega cinco líneas rojas idénticas y cinco viajes al servidor.
 */
const FALLOS_PARA_CORTAR = 2;

const texto = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function registrarJornadas(
  jornadas: readonly Jornada[],
  io: TransporteJornadas,
): Promise<ResumenJornadas> {
  const resultados: ResultadoJornada[] = [];
  let ultimoMotivo: string | null = null;
  let seguidos = 0;

  for (const [i, j] of jornadas.entries()) {
    io.onAvance?.(i, jornadas.length);

    let corrida: { id: string; lineNo: number };
    try {
      corrida = await io.consumir(j);
    } catch (e) {
      const motivo = texto(e);
      seguidos = motivo === ultimoMotivo ? seguidos + 1 : 1;
      ultimoMotivo = motivo;
      resultados.push({ dia: j.dia, fecha: j.fecha, estado: "no-consumio", detalle: motivo });
      if (seguidos >= FALLOS_PARA_CORTAR) {
        for (const resto of jornadas.slice(i + 1)) {
          resultados.push({
            dia: resto.dia,
            fecha: resto.fecha,
            estado: "no-consumio",
            detalle: `No se intentó: los días anteriores fallaron por lo mismo (${motivo}).`,
          });
        }
        break;
      }
      continue;
    }

    seguidos = 0;
    ultimoMotivo = null;
    try {
      await io.declarar(corrida.id, j);
      resultados.push({ dia: j.dia, fecha: j.fecha, estado: "declarada", lineNo: corrida.lineNo });
    } catch (e) {
      resultados.push({
        dia: j.dia,
        fecha: j.fecha,
        estado: "corrida-abierta",
        lineNo: corrida.lineNo,
        detalle: texto(e),
      });
    }
  }
  io.onAvance?.(jornadas.length, jornadas.length);

  const declaradas = resultados.filter((r) => r.estado === "declarada").length;
  const abiertas = resultados.filter((r) => r.estado === "corrida-abierta");
  const fallidas = resultados.filter((r) => r.estado === "no-consumio").length;

  const partes = [`${declaradas} de ${jornadas.length} jornada${jornadas.length === 1 ? "" : "s"} declarada${declaradas === 1 ? "" : "s"}`];
  if (abiertas.length > 0) {
    /* Los números de línea, siempre: es lo único con lo que se encuentra esa
       madera consumida que quedó sin producción. */
    partes.push(
      `${abiertas.length} corrida${abiertas.length === 1 ? "" : "s"} quedó${abiertas.length === 1 ? "" : "aron"} ` +
        `abierta${abiertas.length === 1 ? "" : "s"} con su materia prima (N° ${abiertas.map((a) => a.lineNo ?? "?").join(", ")}): ` +
        `declarales la producción desde la tabla`,
    );
  }
  if (fallidas > 0) partes.push(`${fallidas} no se pudo${fallidas === 1 ? "" : "ieron"} registrar`);

  return { resultados, declaradas, abiertas: abiertas.length, fallidas, mensaje: partes.join(" · ") };
}
