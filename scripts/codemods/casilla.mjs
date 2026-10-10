#!/usr/bin/env node
/**
 * casilla — los checkbox nativos con clases propias (5 tamaños, 6 acentos)
 * pasan a `<Casilla>` del DS (components/ui-system/Casilla.tsx, ADR-489): un
 * solo tamaño (16 px) y el acento por token.
 *
 * - `<input type="checkbox" … />` → `<Casilla … />`: se va `type`, los demás
 *   props quedan tal cual (checked, onChange, disabled, aria-*, ref…).
 * - De `className="…"` literal se van tamaño, acento, borde, redondeo, color y
 *   foco; se quedan las de ubicación (mt-0.5, self-start…). Si no queda nada,
 *   se va el atributo.
 * - `className={…}` (cn, condicionales) queda «a revisar»: el tamaño podría
 *   ganarle al de la casilla.
 * - Los interruptores (`role="switch"`) van a mano: `Interruptor`.
 * - Un archivo con su propia `Casilla` (declarada o importada de otro lado) no se
 *   toca y sus checkbox van «a revisar»: el import chocaría y el `<input>` de esa
 *   `Casilla` local pasaría a `<Casilla>`, llamándose a sí misma
 *   (CtpEtiquetasTrozasModal, FilasDiferencia).
 *
 *   node scripts/codemods/casilla.mjs --seco [--carpeta components/admin/forestal] [--muestra 3]
 */
import { asegurarImport, correr, esPrincipal, filtrarClases, nombreOcupado } from "./_comun.mjs";

const MODULO = "@/components/ui-system/Casilla";

const CHECKBOX = /<input\b((?:[^<>]|=>)*?)\btype=(?:"checkbox"|'checkbox'|\{["']checkbox["']\})((?:[^<>]|=>)*?)\/>/g;
const SE_VA = /^(?:[a-z-]+:)*(?:h-|w-|size-|accent-|rounded|border|text-|bg-|ring|outline|focus|cursor-pointer$|shrink-0$|appearance-|checked:)/;

export function transformar(texto, rel = "x.tsx") {
  if (!rel.endsWith(".tsx")) return { texto, cambios: 0, revisar: 0 };
  let cambios = 0;
  let revisar = 0;
  const ejemplos = [];
  const nuevo = texto.replace(CHECKBOX, (todo, antes, despues) => {
    const attrs = `${antes} ${despues}`;
    if (/\bclassName=\{/.test(attrs)) {
      revisar++;
      return todo;
    }
    const limpiar = (s) =>
      s.replace(/\sclassName=(?:"([^"]*)"|'([^']*)')/, (_m, a, b) => {
        const quedan = filtrarClases(a ?? b ?? "", (t) => !SE_VA.test(t));
        return quedan ? ` className="${quedan}"` : "";
      });
    /* Sin tocar el resto del formato: dentro de un atributo puede haber un texto con espacios. */
    const salida = `<Casilla${limpiar(antes).replace(/\s+$/, "")}${limpiar(despues).replace(/\s+$/, "")} />`;
    cambios++;
    if (ejemplos.length < 2) ejemplos.push([todo, salida]);
    return salida;
  });
  if (cambios && nombreOcupado(texto, "Casilla", MODULO)) return { texto, cambios: 0, revisar: revisar + cambios, ejemplos: [] };
  return {
    texto: cambios ? asegurarImport(nuevo, "Casilla", MODULO) : texto,
    cambios,
    revisar,
    ejemplos,
  };
}

if (esPrincipal(import.meta.url)) {
  process.exit(correr({ nombre: "casilla", que: "<input type=\"checkbox\"> con clases propias → <Casilla>", transformar }));
}
