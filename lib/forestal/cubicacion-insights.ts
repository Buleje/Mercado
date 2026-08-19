/**
 * cubicacion-insights — lee el lote cubicado y dice EN CRIOLLO qué tiene.
 *
 * Las tablas ya muestran los números; esto responde lo que el maderero calcula
 * de cabeza y casi siempre mal: en qué se le fue el volumen, cuánto vale de
 * verdad su pie tablar, qué medida domina y qué parte del lote es producto de
 * bajo valor. Cada insight lleva el número que lo sostiene — nunca una frase
 * suelta.
 *
 * PURO: sin DOM. Se deriva de `agruparPor`, la misma fuente que las tablas, así
 * que un insight nunca puede contradecir lo que se ve arriba.
 */
import type { PiezaCubicada } from "./cubicacion";
import { toFeet } from "./cubicacion";
import { agruparPor, type PrecioPt } from "./cubicacion-resumen";
import { fmtPt as ptEntero, fmtSoles } from "./cubicacion-formato";
import { tipoDePieza } from "./cubicacion-tipo";

export type NivelInsight = "info" | "oportunidad" | "alerta";

export interface Insight {
  nivel: NivelInsight;
  /** Frase corta, en voz del aserradero. */ texto: string;
  /** El número que la sostiene (se muestra al lado). */ dato: string;
}

/** Tipos que valen menos por pie tablar: lo que conviene reducir. */
const BAJO_VALOR = new Set(["Corta", "Paquetería corta", "Otro"]);
/** Desde acá una especie "manda" en el lote. */
const CONCENTRACION = 0.6;
/** Desde acá el producto de bajo valor deja de ser normal y pasa a ser aviso. */
const BAJO_VALOR_ALERTA = 0.25;

const pct = (parte: number, total: number) => (total > 0 ? parte / total : 0);
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
/** El pie tablar de un insight se escribe igual que en las tablas: entero. */
const fmtPt = (v: number) => `${ptEntero(v)} PT`;

/**
 * Analiza el lote y devuelve los insights que aplican, los más accionables
 * primero (alerta → oportunidad → info). Lote vacío ⇒ lista vacía: no se
 * inventan lecturas sin datos.
 */
export function analizarLote(rows: PiezaCubicada[], precioDe?: PrecioPt): Insight[] {
  if (rows.length === 0) return [];
  const out: Insight[] = [];
  const precio: PrecioPt = precioDe ?? 0;

  const porEspecie = agruparPor(rows, "especie", precio);
  const porTipo = agruparPor(rows, "tipo", precio);
  const porMedida = agruparPor(rows, "medida", precio);
  const totalPt = porEspecie.total.pieTablar;
  const totalValor = porEspecie.total.valor;

  // 1. ¿Una especie manda? (la que define el precio del lote)
  const esp = porEspecie.grupos[0];
  if (esp) {
    const share = pct(esp.pieTablar, totalPt);
    out.push(share >= CONCENTRACION
      ? { nivel: "info", texto: `El lote es prácticamente de ${esp.label}: define el precio de todo.`, dato: `${fmtPct(share)} del PT` }
      : { nivel: "info", texto: `Lote mezclado: ${porEspecie.grupos.length} especies, encabeza ${esp.label}.`, dato: `${fmtPct(share)} del PT` });
  }

  // 2. Producto de bajo valor: lo que se paga peor por pie tablar
  const ptBajo = porTipo.grupos.filter((g) => BAJO_VALOR.has(g.label)).reduce((a, g) => a + g.pieTablar, 0);
  const shareBajo = pct(ptBajo, totalPt);
  if (shareBajo >= BAJO_VALOR_ALERTA) {
    out.push({
      nivel: "alerta",
      texto: "Buena parte del lote es corta o sin clasificar: es la madera que peor se paga.",
      dato: `${fmtPct(shareBajo)} · ${fmtPt(ptBajo)}`,
    });
  } else if (ptBajo > 0) {
    out.push({ nivel: "info", texto: "Poco producto corto: el lote está bien aprovechado.", dato: fmtPct(shareBajo) });
  }

  // 3. Piezas que no encajan en ninguna regla comercial (medidas para revisar)
  const otro = porTipo.grupos.find((g) => g.label === "Otro");
  if (otro && otro.cantidad > 0) {
    out.push({
      nivel: "alerta",
      texto: `Hay piezas que no caen en ningún tipo comercial: revisá esas medidas antes de vender.`,
      dato: `${otro.cantidad} pzas · ${fmtPt(otro.pieTablar)}`,
    });
  }

  // 4. Precio implícito: lo que REALMENTE está saliendo el pie tablar
  if (totalValor > 0 && totalPt > 0) {
    out.push({
      nivel: "info",
      texto: "Precio promedio real del lote, ya mezcladas todas las especies.",
      dato: `S/ ${fmtSoles(totalValor / totalPt)} por PT`,
    });
  }

  // 5. La medida estrella: lo que conviene ofrecer primero
  const medida = porMedida.grupos[0];
  if (medida && porMedida.grupos.length > 1) {
    out.push({
      nivel: "oportunidad",
      texto: `La medida ${medida.label} es la que más volumen tiene: ofrecela como lote cerrado.`,
      dato: `${medida.cantidad} pzas · ${fmtPct(pct(medida.pieTablar, totalPt))} del PT`,
    });
  }

  // 6. Cortas que ya casi llegan a 6 pies (donde se pierde valor por poco)
  const casiLargas = rows.filter((r) => {
    const l = toFeet(r.largo, r.uLargo);
    return l >= 4 && l < 6 && tipoDePieza(r) === "Corta";
  });
  if (casiLargas.length > 0) {
    const pt = casiLargas.reduce((a, r) => a + r.pieTablar, 0);
    out.push({
      nivel: "oportunidad",
      texto: "Hay piezas cortas de 4 a 6 pies: a 6' pasan a categoría larga y valen más.",
      dato: `${casiLargas.reduce((a, r) => a + r.cantidad, 0)} pzas · ${fmtPt(pt)}`,
    });
  }

  const orden: Record<NivelInsight, number> = { alerta: 0, oportunidad: 1, info: 2 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
