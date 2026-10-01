/**
 * Un ⓘ (`<InfoTip>`) nunca va DENTRO de un botón, un título, un `<label>` o un `<summary>`.
 *
 * El ⓘ es un `<button>`: adentro de otro botón, cada clic en el ícono también
 * pliega la sección (pasó en `LothPlanFormCosteo`, 2026-09-24); adentro de un
 * `<h3>` el lector anuncia «Por permiso Información: Por permiso»; adentro de
 * un `<summary>` abre y cierra el `<details>`. `check-html-nesting` mira el HTML
 * de páginas y no ve componentes, por eso este barrido estático sobre el JSX.
 *
 * Detector: para cada `<InfoTip`, la etiqueta prohibida más cercana hacia
 * arriba; si su cierre no aparece entre ella y el ⓘ, el ⓘ quedó adentro.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAICES = ["components/admin", "components/superadmin", "app/admin"];
/* `label`: adentro, el campo se anuncia «Total pagado Información: Total pagado»
   y buscarlo por su rótulo encuentra el ⓘ (rompió un test visual, 2026-09-24). */
const CONTENEDORES = ["button", "h1", "h2", "h3", "h4", "summary", "label", "CardTitle", "SectionTitle", "PageTitle"];

function archivos(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Posición de la última apertura `<tag` (no `</tag`, no `<tag.../>` de una línea) antes de `hasta`. */
function ultimaApertura(src: string, tag: string, hasta: number): number {
  const re = new RegExp(`<${tag}(?=[\\s>])`, "g");
  let pos = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && m.index < hasta) {
    const fin = src.indexOf(">", m.index);
    if (fin !== -1 && src[fin - 1] === "/") continue; // autocerrada
    pos = m.index;
  }
  return pos;
}

/** Los comentarios se vacían (conservando los saltos de línea para numerar bien):
 *  «un <button> del InfoTip no puede anidarse» en un comentario no es JSX. */
function sinComentarios(src: string): string {
  const blanco = (t: string) => t.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blanco).replace(/(^|[^:])\/\/[^\n]*/g, (m, pre: string) => pre + blanco(m.slice(pre.length)));
}

function infoTipsAnidados(fuente: string): string[] {
  const src = sinComentarios(fuente);
  const hallados: string[] = [];
  const re = /<InfoTip[\s/>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const tag of CONTENEDORES) {
      const abre = ultimaApertura(src, tag, m.index);
      if (abre === -1) continue;
      const entre = src.slice(abre, m.index);
      if (!entre.includes(`</${tag}>`)) {
        const linea = src.slice(0, m.index).split("\n").length;
        hallados.push(`línea ${linea}: <InfoTip> dentro de <${tag}>`);
      }
    }
  }
  return hallados;
}

describe("InfoTip no se anida en botones ni títulos", () => {
  it("el detector ve el caso malo y deja pasar el bueno", () => {
    expect(infoTipsAnidados(`<button onClick={x}>Plegar <InfoTip title="a" /></button>`)).toHaveLength(1);
    expect(infoTipsAnidados(`<CardTitle as="h3">X <InfoTip title="a" /></CardTitle>`)).toHaveLength(1);
    expect(infoTipsAnidados(`<div><CardTitle as="h3">X</CardTitle><InfoTip title="a" /></div>`)).toHaveLength(0);
    expect(infoTipsAnidados(`<button onClick={x}>Plegar</button><InfoTip title="a" />`)).toHaveLength(0);
    expect(infoTipsAnidados(`<div>{/* un <button> no va adentro */}<InfoTip title="a" /></div>`)).toHaveLength(0);
  });

  it("ningún ⓘ del panel está dentro de un botón, un título o un summary", () => {
    const malos: string[] = [];
    for (const raiz of RAICES) {
      for (const f of archivos(raiz)) {
        if (f.endsWith("InfoTip.tsx")) continue;
        const src = readFileSync(f, "utf8");
        if (!src.includes("<InfoTip")) continue;
        for (const h of infoTipsAnidados(src)) malos.push(`${f} ${h}`);
      }
    }
    expect(malos).toEqual([]);
  });
});
