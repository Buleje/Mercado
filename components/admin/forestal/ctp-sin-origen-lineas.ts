/**
 * Las líneas de «¿De qué trozas salió?» (ADR-447): una por arreglo, con lo que
 * frena a sus corridas en una frase, el botón que abre el modal que YA existe
 * y lo que deja hecho (la `simulacion` del servidor, nunca una cuenta de acá).
 *
 * Lo que depende del dueño —otra corrida tomó la madera, la madera es de otro
 * permiso, una especie de nombre parecido— sale como DECISIÓN: la línea muestra
 * los dos caminos y nada se aplica solo.
 *
 * PURO y client-safe: lo usan la bandeja y su test.
 */
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { SimulacionDeArreglos } from "@/lib/forestal/origen-en-tanda";
import {
  MOTIVOS_SIN_ORIGEN,
  type DiagnosticoCorrida,
  type DiagnosticoSinOrigen,
  type GuiaDelArreglo,
  type MotivoSinOrigen,
  type TomadaPor,
} from "@/lib/forestal/vincular-trozas";
import { agrupar, ddmm, de, enLista, especiesDe, guiasUnicas, ptDe, r1, sumaM3 } from "./ctp-sin-origen-comun";



/** Qué hace el botón de la línea. Cada uno abre el arreglo que ya existe. */
export type AccionDeArreglo =
  | { tipo: "vincular" }
  | { tipo: "corregir_llegada"; guias: GuiaDelArreglo[] }
  | { tipo: "recibir_guia"; guias: GuiaDelArreglo[]; corregirTambien: GuiaDelArreglo[] }
  | { tipo: "acomodar_trozas"; woodEntryIds: string[]; guias: string[] }
  | { tipo: "declarar_apertura" }
  | { tipo: "ir_a_ingresos"; pendiente: boolean }
  | { tipo: "soltar_corrida"; tomadora: TomadaPor; especie: string; juntasPct: number | null }
  | {
      tipo: "corregir_permiso";
      actual: string | null;
      propuesto: { codigo: string; trozas: number; m3: number } | null;
    }
  | { tipo: "corregir_especie"; actual: string; propuesta: string | null; trozas: number; m3: number }
  | { tipo: "ninguna" };

export interface LineaDeArreglo {
  clave: string;
  motivo: MotivoSinOrigen;
  corridas: DiagnosticoCorrida[];
  /** m³ de producto de sus corridas. */
  m3: number;
  /** Lo que la frena, en una frase. */
  texto: string;
  /** El porqué, para el ⓘ. */
  ayuda: string;
  /** `null` = no hay nada que apretar (esperar la madera, el mes cerrado). */
  boton: string | null;
  accion: AccionDeArreglo;
  /** Decide el dueño: se muestran los dos caminos, nunca se aplica solo. */
  decision: boolean;
  /** Lo que deja el arreglo, medido por el servidor: «deja 11 para vincular». */
  deja: string | null;
}

export interface ResumenSinOrigen {
  corridas: number;
  m3: number;
  pt: number;
}

export function resumenSinOrigen(d: DiagnosticoSinOrigen): ResumenSinOrigen {
  const m3 = sumaM3(d.corridas);
  return { corridas: d.corridas.length, m3, pt: ptDe(m3) };
}

const base = (motivo: MotivoSinOrigen, clave: string, corridas: DiagnosticoCorrida[]) => ({
  clave,
  motivo,
  corridas,
  m3: sumaM3(corridas),
  decision: false,
  deja: null,
});

function lineasDeLista(cs: DiagnosticoCorrida[]): LineaDeArreglo[] {
  const abiertas = cs.filter((c) => !c.mesCerrado);
  const cerradas = cs.filter((c) => c.mesCerrado);
  const out: LineaDeArreglo[] = [];
  if (abiertas.length > 0) {
    out.push({
      ...base("lista", "lista", abiertas),
      texto: `${de(abiertas.length, "corrida lista", "corridas listas")} para vincular`,
      ayuda: "Hay trozas de su especie y su permiso en el patio. Revisa la propuesta de cada una y confirma: nada se vincula solo.",
      boton: "Revisar y vincular",
      accion: { tipo: "vincular" },
    });
  }
  if (cerradas.length > 0) {
    out.push({
      ...base("lista", "lista-mes-cerrado", cerradas),
      texto: `${de(cerradas.length, "corrida", "corridas")} con el mes cerrado`,
      ayuda: `Tienen trozas, pero ${enLista([...new Set(cerradas.map((c) => c.mesCerrado ?? ""))])} está cerrado. Reábrelo para vincular.`,
      boton: null,
      accion: { tipo: "ninguna" },
    });
  }
  return out;
}

function lineaDeLlegada(cs: DiagnosticoCorrida[], sim: SimulacionDeArreglos | null): LineaDeArreglo {
  const guias = guiasUnicas(cs.flatMap((c) => (c.arreglo.tipo === "corregir_llegada" ? c.arreglo.guias : [])));
  const gana = sim ? sim.trasLlegada.listas - sim.hoy.listas : 0;
  return {
    ...base("llegada_posterior", "llegada", cs),
    texto: `${de(cs.length, "corrida figura", "corridas figuran")} antes de que llegue su madera`,
    ayuda:
      "Sus trozas figuran recibidas después del día de la corrida, pero su guía dice que salieron antes. Se propone la fecha de cada guía y confirmas con un motivo.",
    boton: guias.length > 0 ? `Corregir la llegada de ${de(guias.length, "guía", "guías")}` : "Ir a Ingresos",
    accion: guias.length > 0 ? { tipo: "corregir_llegada", guias } : { tipo: "ir_a_ingresos", pendiente: false },
    deja: sim && gana > 0 ? `deja ${sim.trasLlegada.listas} para vincular` : null,
  };
}

function lineaDeAcomodar(cs: DiagnosticoCorrida[]): LineaDeArreglo {
  const gs = cs.flatMap((c) => (c.arreglo.tipo === "acomodar_trozas" ? c.arreglo.guias : []));
  const ids = [...new Set(gs.flatMap((g) => g.woodEntryIds))];
  const gtfs = [...new Set(gs.map((g) => g.gtfNumber))].sort();
  return {
    ...base("fila_de_otra_especie", "acomodar", cs),
    texto: `${de(cs.length, "corrida tiene", "corridas tienen")} sus trozas en la fila de otra especie`,
    ayuda: "Su guía trae varias especies y sus trozas cuelgan de la fila de otra. Se ven antes de mover y se acomodan con un clic.",
    boton: ids.length > 0 ? `Acomodar las trozas de ${de(gtfs.length, "guía", "guías")}` : "Ir a Ingresos",
    accion: ids.length > 0 ? { tipo: "acomodar_trozas", woodEntryIds: ids, guias: gtfs } : { tipo: "ir_a_ingresos", pendiente: false },
  };
}

function lineaDeRecibir(cs: DiagnosticoCorrida[], sim: SimulacionDeArreglos | null): LineaDeArreglo {
  const arreglos = cs.flatMap((c) => (c.arreglo.tipo === "recibir_guia" ? [c.arreglo] : []));
  const guias = guiasUnicas(arreglos.flatMap((a) => a.guias));
  const tambien = guiasUnicas(arreglos.flatMap((a) => a.corregirTambien ?? []));
  const espera = cs.length === 1 ? "1 corrida espera" : `${cs.length} corridas esperan`;
  return {
    ...base("guia_sin_recibir", "recibir", cs),
    texto: guias.length === 1 ? `${espera} la guía ${guias[0]!.gtfNumber}, sin recibir` : `${espera} ${guias.length} guías sin recibir`,
    ayuda: `Sus trozas son de una guía que todavía no se recibió. Se propone la fecha de la guía.${
      tambien.length > 0 ? ` Además hay que corregir la llegada de ${enLista(tambien.map((g) => g.gtfNumber))}.` : ""
    }`,
    boton: guias.length === 0 ? "Recibir en Ingresos" : guias.length === 1 ? "Recibir la guía" : `Recibir ${guias.length} guías`,
    accion: guias.length > 0 ? { tipo: "recibir_guia", guias, corregirTambien: tambien } : { tipo: "ir_a_ingresos", pendiente: true },
    deja: sim && sim.trasRecibir.listas > sim.trasLlegada.listas ? `con las llegadas, deja ${sim.trasRecibir.listas}` : null,
  };
}

function lineasDeTomada(cs: DiagnosticoCorrida[]): LineaDeArreglo[] {
  const conTomadora = cs.filter((c) => c.arreglo.tipo === "soltar_corrida" && c.arreglo.corridas.length > 0);
  const sueltas = cs.filter((c) => !conTomadora.includes(c));
  const out = agrupar(conTomadora, (c) => (c.arreglo.tipo === "soltar_corrida" ? c.arreglo.corridas[0]!.corridaId : "")).map(
    ([clave, grupo]): LineaDeArreglo => {
      const t = (grupo[0]!.arreglo as { corridas: TomadaPor[] }).corridas[0]!;
      const especie = enLista(especiesDe(grupo));
      const m3 = sumaM3(grupo);
      /* Si todas salieron de esas trozas, junto con la que las tiene: la misma
         cuenta que `sumadasPct` del servidor, con las N corridas a la vez. */
      const juntasPct = t.m3 > 0 ? r1(((m3 + (t.m3Producido ?? 0)) / t.m3) * 100) : null;
      return {
        ...base("tomada_por_otra_corrida", `tomada-${clave}`, grupo),
        texto: `La N.º ${t.lineNo ?? "—"} del ${ddmm(t.fecha)}${t.abierta ? ", abierta," : ""} tiene la madera de ${de(grupo.length, "corrida", "corridas")} de ${especie}`,
        ayuda: `Sus ${de(t.trozas, "troza", "trozas")} (${fmtM3(t.m3)} m³) ya entraron a la N.º ${t.lineNo ?? "—"}. Decide de cuál salió esa madera: nada se mueve solo.`,
        boton: "Ver y decidir",
        accion: { tipo: "soltar_corrida", tomadora: t, especie, juntasPct },
        decision: true,
      };
    },
  );
  if (sueltas.length > 0) {
    out.push({
      ...base("tomada_por_otra_corrida", "tomada-sin-dato", sueltas),
      texto: `${de(sueltas.length, "corrida", "corridas")}: su madera la tiene otra corrida`,
      ayuda: "Sus trozas ya entraron a otra corrida. Revisa cuál de las dos salió de esa madera.",
      boton: null,
      accion: { tipo: "ninguna" },
    });
  }
  return out;
}

function lineasDePermiso(cs: DiagnosticoCorrida[]): LineaDeArreglo[] {
  const propuestoDe = (c: DiagnosticoCorrida) =>
    c.arreglo.tipo === "corregir_corrida" && c.arreglo.campo === "permiso" ? (c.arreglo.propuestos[0] ?? null) : null;
  return agrupar(cs, (c) => `${c.especie}|${propuestoDe(c)?.codigo ?? ""}`).map(([clave, grupo]) => {
    const p = propuestoDe(grupo[0]!);
    const especie = grupo[0]!.especie;
    const actual = grupo[0]!.permiso;
    return {
      ...base("permiso_distinto", `permiso-${clave}`, grupo),
      texto: `${de(grupo.length, "corrida", "corridas")} de ${especie}: la madera del patio es de otro permiso`,
      ayuda: p
        ? `La corrida dice ${actual ?? "sin permiso"}; las ${de(p.trozas, "troza", "trozas")} de ${especie} del patio (${fmtM3(p.m3)} m³) son del ${p.codigo}.`
        : "Las trozas de su especie son de otro permiso.",
      boton: "Ver y decidir",
      accion: { tipo: "corregir_permiso", actual, propuesto: p ? { codigo: p.codigo, trozas: p.trozas, m3: p.m3 } : null },
      decision: true,
    };
  });
}

function lineasDeEspecie(cs: DiagnosticoCorrida[]): LineaDeArreglo[] {
  const de_ = (c: DiagnosticoCorrida) =>
    c.arreglo.tipo === "corregir_corrida" && c.arreglo.campo === "especie" ? c.arreglo : null;
  return agrupar(cs, (c) => `${c.especie}|${de_(c)?.propuesta ?? ""}`).map(([clave, grupo]) => {
    const a = de_(grupo[0]!);
    const actual = grupo[0]!.especie;
    const propuesta = a?.propuesta ?? null;
    return {
      ...base("especie_parecida", `especie-${clave}`, grupo),
      texto: `${de(grupo.length, "corrida", "corridas")} de ${actual}: en el patio sólo hay ${propuesta ?? "una especie parecida"}`,
      ayuda: propuesta
        ? `Hay ${de(a?.trozas ?? 0, "troza", "trozas")} de ${propuesta} (${fmtM3(a?.m3 ?? 0)} m³). Si es la misma madera, corrige la especie de la corrida: el sistema nunca las junta solo.`
        : "En el patio hay una especie de nombre parecido. Si es la misma, corrige la especie de la corrida.",
      boton: "Ver y decidir",
      accion: { tipo: "corregir_especie", actual, propuesta, trozas: a?.trozas ?? 0, m3: a?.m3 ?? 0 },
      decision: true,
    };
  });
}

function lineaDeCargarGuia(cs: DiagnosticoCorrida[]): LineaDeArreglo {
  const arr = cs.flatMap((c) => (c.arreglo.tipo === "cargar_guia" ? [c.arreglo] : []));
  const sinGuia = [...new Set(arr.filter((a) => a.guias.length === 0).map((a) => a.permiso ?? "sin permiso"))].sort();
  const conGuia = [...new Map(arr.flatMap((a) => a.guias).map((g) => [g.gtfNumber, g])).values()];
  const partes = [
    sinGuia.length > 0 ? `${sinGuia.length === 1 ? "Permiso" : "Permisos"} sin guía: ${enLista(sinGuia)}.` : "",
    conGuia.length > 0
      ? `Guía sin su lista de trozas: ${enLista(conGuia.map((g) => `${g.gtfNumber}${g.recibida ? "" : " (sin recibir)"}`))}.`
      : "",
    "Cárgalas en Ingresos.",
  ];
  return {
    ...base("guia_sin_trozas", "cargar-guia", cs),
    texto: `${de(cs.length, "corrida", "corridas")} de ${enLista(especiesDe(cs))} sin guía o sin lista de trozas`,
    ayuda: partes.filter(Boolean).join(" "),
    boton: "Ir a Ingresos",
    accion: { tipo: "ir_a_ingresos", pendiente: sinGuia.length === 0 && conGuia.some((g) => !g.recibida) },
  };
}

function lineasDelMotivo(motivo: MotivoSinOrigen, cs: DiagnosticoCorrida[], sim: SimulacionDeArreglos | null): LineaDeArreglo[] {
  switch (motivo) {
    case "lista":
      return lineasDeLista(cs);
    case "llegada_posterior":
      return [lineaDeLlegada(cs, sim)];
    case "fila_de_otra_especie":
      return [lineaDeAcomodar(cs)];
    case "guia_sin_recibir":
      return [lineaDeRecibir(cs, sim)];
    case "tomada_por_otra_corrida":
      return lineasDeTomada(cs);
    case "permiso_distinto":
      return lineasDePermiso(cs);
    case "especie_parecida":
      return lineasDeEspecie(cs);
    case "guia_sin_trozas":
      return [lineaDeCargarGuia(cs)];
    case "apertura":
      return [
        {
          ...base("apertura", "apertura", cs),
          texto: `${de(cs.length, "corrida salió", "corridas salieron")} de madera de antes del libro`,
          ayuda: "Salieron de un lote de inventario o de madera que ya estaba antes del libro. Se declaran como apertura, una por una.",
          boton: "Declarar apertura",
          accion: { tipo: "declarar_apertura" },
        },
      ];
    case "sin_trozas_de_la_especie":
      return [
        {
          ...base("sin_trozas_de_la_especie", "sin-madera", cs),
          texto: `${de(cs.length, "corrida", "corridas")} sin madera de su especie: ${enLista(especiesDe(cs))}`,
          ayuda: "No entró madera de esa especie y ese permiso. Quedan sin origen hasta que llegue su guía.",
          boton: null,
          accion: { tipo: "ninguna" },
        },
      ];
  }
}

/** Todas las líneas, en el orden en que se resuelven: lo que ya se vincula, primero. */
export function lineasDeArreglo(d: DiagnosticoSinOrigen, sim: SimulacionDeArreglos | null = null): LineaDeArreglo[] {
  return MOTIVOS_SIN_ORIGEN.flatMap((motivo) => {
    const cs = d.corridas.filter((c) => c.motivo === motivo);
    return cs.length > 0 ? lineasDelMotivo(motivo, cs, sim) : [];
  });
}
