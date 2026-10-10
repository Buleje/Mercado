#!/usr/bin/env node
/**
 * btn-constantes — las ~170 constantes de clase de botón del panel
 * (`const BTN = "inline-flex … h-10 px-4 rounded-xl bg-primary …"`) pasan a
 * `button({ variant, size })` del DS (ADR-489). El import sale de
 * `components/ui-system/button-variants.ts`, que NO es "use client": una constante
 * `BOTON = button({…})` se evalúa al cargar el módulo, y en un archivo que corre en
 * el servidor (TarjetaEstados ← app/admin/q/[id]/page.tsx) llamar a una función de
 * un módulo de cliente da error 500. Desde `Button.tsx` no se importa.
 *
 * - Variante por el fondo y el borde: rojo → danger, primary/accent sólido →
 *   accent, tinta → primary, borde neutro → secondary, sin fondo con hover →
 *   ghost, subrayado → link.
 * - Tamaño por el alto: h-7 → xs, h-8 (o py-1) → sm, cuadrado sin px → icon; el
 *   resto, el alto por defecto (`ALTURA_CONTROL` = 48 px, decisión de Brandon 09-10).
 * - Se quedan sólo las clases de ubicación (ml-auto, shrink-0, sm:w-auto…);
 *   `w-full` pasa a `fullWidth: true`. Lo demás lo pone `button()`.
 * - A revisar (no se tocan): template con `${…}`, un fondo que no se reconoce
 *   (tintes como bg-primary/10), o un texto que no es una lista de clases. Un
 *   archivo que ya tiene su propio `button` (declarado o importado de otro lado)
 *   queda entero «a revisar».
 *
 *   node scripts/codemods/btn-constantes.mjs --seco [--carpeta components/admin/pos] [--muestra 3]
 *   node scripts/codemods/btn-constantes.mjs --carpeta components/admin/pos
 */
import { asegurarImport, correr, esPrincipal, nombreOcupado } from "./_comun.mjs";

/** Sin "use client" (ver arriba). */
const MODULO = "@/components/ui-system/button-variants";

const NOMBRE = /^(BTN\w*|\w+_BTN\w*|btn\w*|\w+Btn\w*|BOTON\w*|boton\w*|\w*BUTTON\w*)$/;
const DECLARACION = /(^|\n)([ \t]*(?:export\s+)?const\s+)([A-Za-z_]\w*)(\s*(?::\s*string\s*)?=\s*)("([^"\n]*)"|'([^'\n]*)'|`([^`]*)`)(\s*as\s+const)?/g;
const PARECE_CLASE = /^(?:[a-z-]+:)*(?:px-|py-|h-|min-h-|rounded|bg-|text-|border|inline-flex|flex|items-|justify-|font-|gap-|transition)/;
const UBICACION = /^(?:w-|min-w-|max-w-|flex-1$|flex-none$|flex-auto$|shrink|grow|self-|ml-|mr-|mt-|mb-|mx-|my-|order-|col-span|row-span|hidden$|block$|inline-block$|truncate$)/;

/** `{ variant, size, fullWidth, className }` para una lista de clases, o null si no se reconoce. */
export function variantesDe(clases) {
  const tk = clases.split(/\s+/).filter(Boolean);
  const base = tk.filter((t) => !t.includes(":"));
  const tiene = (re) => base.some((t) => re.test(t));
  let variant = null;
  if (tiene(/^bg-(red|rose)-(5|6|7)00$|^bg-\[var\(--data-error-(5|6|7)00\)\]$/)) variant = "danger";
  else if (tiene(/^bg-primary$|^bg-\[var\(--accent(-600|-dark)?\)\]$|^bg-(teal|cyan)-(500|600|700)$/)) variant = "accent";
  else if (tiene(/^bg-(gray|neutral|zinc|slate|stone)-(800|900|950)$|^bg-black$|^bg-\[var\(--text-primary\)\]$/)) variant = "primary";
  else if (
    tiene(/^border$|^border-\[var\(--rule-(soft|base|strong)\)\]$|^border-(gray|neutral|slate|zinc)-\d+$/) &&
    !tiene(/^bg-(?!\[var\(--surface-(raised|canvas)\)\]$|white$|transparent$)/)
  )
    variant = "secondary";
  else if (tiene(/^underline$/) || tk.includes("hover:underline")) variant = "link";
  else if ((!tiene(/^bg-/) || tiene(/^bg-transparent$/)) && tk.some((t) => /^hover:bg-/.test(t))) variant = "ghost";
  if (!variant) return null;

  const alto = base.find((t) => /^(min-)?h-\d+(\.\d+)?$/.test(t));
  const n = alto ? Number(alto.replace(/^(min-)?h-/, "")) : null;
  const ancho = base.find((t) => /^w-\d+(\.\d+)?$/.test(t));
  let size;
  if (alto && ancho && alto.replace(/^(min-)?h-/, "") === ancho.slice(2) && !tiene(/^px-/)) size = "icon";
  else if (n !== null && n <= 7) size = "xs";
  else if (n !== null && n <= 8) size = "sm";
  else if (n === null && tiene(/^py-(0|0\.5|1|1\.5)$/)) size = "sm";

  const fullWidth = base.includes("w-full");
  const quedan = tk.filter((t) => t !== "w-full" && UBICACION.test(t.replace(/^(?:sm|md|lg|xl):/, "")) && !(size === "icon" && t === ancho));
  return { variant, size, fullWidth, className: quedan.join(" ") };
}

export function llamada({ variant, size, fullWidth, className }) {
  const partes = [`variant: "${variant}"`];
  if (size) partes.push(`size: "${size}"`);
  if (fullWidth) partes.push("fullWidth: true");
  if (className) partes.push(`className: "${className}"`);
  return `button({ ${partes.join(", ")} })`;
}

export function transformar(texto) {
  let cambios = 0;
  let revisar = 0;
  const ejemplos = [];
  const nuevo = texto.replace(DECLARACION, (todo, ini, decl, nombre, igual, literal, d, s, b) => {
    if (!NOMBRE.test(nombre)) return todo;
    const clases = d ?? s ?? b ?? "";
    const tk = clases.split(/\s+/).filter(Boolean);
    if (tk.filter((t) => PARECE_CLASE.test(t)).length < 2) return todo; // un rótulo, no clases
    if (b !== undefined && b.includes("${")) {
      revisar++;
      return todo;
    }
    const v = variantesDe(clases);
    if (!v) {
      revisar++;
      return todo;
    }
    cambios++;
    const salida = `${ini}${decl}${nombre}${igual}${llamada(v)}`;
    if (ejemplos.length < 2) ejemplos.push([`${nombre} = ${literal}`, `${nombre} = ${llamada(v)}`]);
    return salida;
  });
  if (cambios && nombreOcupado(texto, "button", MODULO)) return { texto, cambios: 0, revisar: revisar + cambios, ejemplos: [] };
  return {
    texto: cambios ? asegurarImport(nuevo, "button", MODULO) : texto,
    cambios,
    revisar,
    ejemplos,
  };
}

if (esPrincipal(import.meta.url)) {
  process.exit(correr({ nombre: "btn-constantes", que: "constantes BTN/BOTON → button({ variant, size })", transformar }));
}
