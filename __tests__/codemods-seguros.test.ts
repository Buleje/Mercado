/**
 * Los codemods del contrato de diseño (ADR-489) se aplican en la ola 5 sobre
 * cientos de archivos del panel: no pueden romper una pantalla que hoy anda.
 * Dos trampas que ni tsc ni vitest ven (revisión de O1-K3, 2026-10-09):
 *
 * 1. Un VALOR importado de un módulo "use client" (`button()`, `DURATION.fast`)
 *    en un archivo que corre en el servidor es una referencia de cliente:
 *    llamarla o leerle una propiedad al cargar el módulo da error 500. Caso
 *    real: `BOTON_PRIMARIO = button({…})` en TarjetaEstados, que importa la
 *    página del QR de la troza (`app/admin/q/[id]/page.tsx`, de servidor).
 * 2. Un archivo con su propia `Casilla` (CtpEtiquetasTrozasModal,
 *    FilasDiferencia): el import del DS choca con ella y el `<input>` de esa
 *    `Casilla` pasa a `<Casilla>`, que se llama a sí misma.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { esDeCliente, nombreOcupado } from "../scripts/codemods/_comun.mjs";
import { transformar as btn } from "../scripts/codemods/btn-constantes.mjs";
import { transformar as casilla } from "../scripts/codemods/casilla.mjs";
import { transformar as kicker } from "../scripts/codemods/kicker.mjs";
import { transformar as datatable } from "../scripts/codemods/datatable.mjs";
import { transformar as motion } from "../scripts/codemods/motion.mjs";

const RAIZ = join(__dirname, "..");

/** `@/components/x` → el texto del archivo del repo. */
function fuenteDe(modulo: string): string {
  const base = join(RAIZ, modulo.replace(/^@\//, ""));
  const archivo = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(
    (c) => existsSync(c) && statSync(c).isFile(),
  );
  if (!archivo) throw new Error(`no existe el módulo ${modulo}`);
  return readFileSync(archivo, "utf8");
}

/** De qué módulo trae `nombre` el texto (`import { … nombre … } from "…"`), o null. */
function moduloDe(texto: string, nombre: string, palabra = "import"): string | null {
  const re = new RegExp(`${palabra}\\s*\\{([^}]*)\\}\\s*from\\s*["']([^"']+)["']`, "g");
  for (const m of texto.matchAll(re)) {
    const nombres = m[1].split(",").map((s) => s.trim().replace(/^type\s+/, ""));
    if (nombres.includes(nombre)) return m[2];
  }
  return null;
}

const BOTON = "inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-white font-semibold";
/* Como TarjetaEstados: sin "use client", la constante se evalúa al cargar el módulo. */
const DE_SERVIDOR = `import Link from "next/link";

const BOTON_PRIMARIO = "${BOTON}";

export function Acciones() {
  return <Link className={BOTON_PRIMARIO} href="/admin">Ver</Link>;
}
`;

describe("valores de un módulo de cliente en un archivo de servidor (error 500)", () => {
  it('btn-constantes trae button() de un archivo SIN "use client"', () => {
    const r = btn(DE_SERVIDOR);
    expect(r.cambios).toBe(1);
    const modulo = moduloDe(r.texto, "button");
    expect(modulo).toBe("@/components/ui-system/button-variants");
    expect(esDeCliente(fuenteDe(modulo ?? ""))).toBe(false);
  });

  it('el barril de ui-system exporta button y ALTURA_CONTROL desde un archivo sin "use client"', () => {
    const barril = fuenteDe("@/components/ui-system/index.ts");
    for (const nombre of ["button", "ALTURA_CONTROL"]) {
      const relativo = moduloDe(barril, nombre, "export");
      expect(relativo, nombre).not.toBeNull();
      const fuente = fuenteDe(`@/components/ui-system/${(relativo ?? "").replace(/^\.\//, "")}`);
      expect(esDeCliente(fuente), nombre).toBe(false);
    }
  });

  it('Button.tsx es "use client" y por eso no reexporta button(): nadie lo trae de ahí por error', () => {
    const fuente = fuenteDe("@/components/ui-system/Button.tsx");
    expect(esDeCliente(fuente)).toBe(true);
    expect(moduloDe(fuente, "button", "export")).toBeNull();
  });

  it('motion: un archivo de framer sin "use client" deja las cifras «a revisar» (motion.ts es de cliente)', () => {
    const T = `import type { Transition } from "framer-motion";

export const ENTRADA: Transition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] };
`;
    expect(esDeCliente(fuenteDe("@/components/ui-system/motion"))).toBe(true);
    const sin = motion(T);
    expect(sin.cambios).toBe(0);
    expect(sin.texto).toBe(T);
    expect(sin.revisar).toBe(2);
    /* Control: con "use client" el mismo archivo sí cambia (la regla no es vacía). */
    const con = motion(`"use client";\n\n${T}`);
    expect(con.cambios).toBe(2);
    expect(con.texto).toContain("duration: DURATION.base");
    expect(moduloDe(con.texto, "EASE")).toBe("@/components/ui-system/motion");
  });

  it("motion: las clases de Tailwind se cambian igual en un archivo sin \"use client\" (no importan nada)", () => {
    const r = motion(`export const X = "transition-opacity duration-150";\n`);
    expect(r.cambios).toBe(1);
    expect(r.texto).toContain("duration-[var(--dur-fast)]");
    expect(r.texto).not.toContain("import");
  });
});

describe("nombre ya ocupado en el archivo (choque del import y recursión)", () => {
  it("casilla deja en 0 cambios un archivo con su propia Casilla y la cuenta «a revisar»", () => {
    const local = `function Casilla(){return <input type="checkbox" className="h-5"/>}`;
    const r = casilla(local, "x.tsx");
    expect(r.cambios).toBe(0);
    expect(r.texto).toBe(local);
    expect(r.revisar).toBe(1);
    /* Control: el mismo checkbox en otro componente sí pasa a <Casilla>. */
    const otro = casilla(`function Fila(){return <input type="checkbox" className="h-5"/>}`, "x.tsx");
    expect(otro.cambios).toBe(1);
    expect(otro.texto).toContain("<Casilla />");
    expect(moduloDe(otro.texto, "Casilla")).toBe("@/components/ui-system/Casilla");
  });

  it("casilla tampoco toca un archivo que trae otra Casilla de otro módulo", () => {
    const t = `import { Casilla } from "./propia";\nexport function X(){return <input type="checkbox" className="h-4 w-4"/>}`;
    const r = casilla(t, "x.tsx");
    expect(r.cambios).toBe(0);
    expect(r.texto).toBe(t);
  });

  it("kicker, datatable, btn-constantes y motion: la misma guarda, con su control", () => {
    const rotulo = `export function X(){return <p className="text-xs uppercase tracking-wide text-gray-500">Hola</p>}`;
    expect(kicker(rotulo).cambios).toBe(1);
    expect(kicker(`function Kicker(p){return <span {...p}/>}\n${rotulo}`).cambios).toBe(0);

    const tabla = `<table className="w-full"><tbody></tbody></table>`;
    expect(datatable(`function Tabla(){return ${tabla}}`, "x.tsx").cambios).toBe(1);
    const propia = datatable(`function DataTable(){return ${tabla}}`, "x.tsx");
    expect(propia.cambios).toBe(0);
    expect(propia.revisar).toBe(1);

    const constante = `const BTN = "${BOTON}";\n`;
    expect(btn(constante).cambios).toBe(1);
    const conPropio = btn(`import { button } from "./estilos";\n${constante}`);
    expect(conPropio.cambios).toBe(0);
    expect(conPropio.revisar).toBe(1);

    const framer = `"use client";\nimport { m } from "framer-motion";\nexport const X = () => <m.div transition={{ duration: 0.2 }} />;\n`;
    expect(motion(framer).cambios).toBe(1);
    expect(motion(framer.replace('import { m }', "const DURATION = 0.3;\nimport { m }")).cambios).toBe(0);
  });

  it("nombreOcupado: declaraciones e imports que chocan, y los que no", () => {
    const M = "@/components/ui-system/Casilla";
    const choca = [
      "function Casilla() {}",
      "export const Casilla = 1;",
      "  class Casilla {}",
      "type Casilla = { a: 1 };",
      'import Casilla from "./x";',
      'import * as Casilla from "./x";',
      'import { Otra as Casilla } from "./x";',
      'import {\n  Algo,\n  Casilla,\n} from "@/components/ui-system";',
    ];
    for (const t of choca) expect(nombreOcupado(t, "Casilla", M), t).toBe(true);
    const libre = [
      `import { Casilla } from "${M}";`,
      'import { Casilla as Vieja } from "./x";',
      "interface CasillaProps {}",
      "const casillas = [];",
      "<Casilla />",
    ];
    for (const t of libre) expect(nombreOcupado(t, "Casilla", M), t).toBe(false);
  });

  it('esDeCliente: "use client" después de comentarios sí; después de un import no', () => {
    expect(esDeCliente('"use client";\nimport x from "y";')).toBe(true);
    expect(esDeCliente("// cabecera\n\n'use client'\n")).toBe(true);
    expect(esDeCliente('/**\n * doc\n */\n"use client";')).toBe(true);
    expect(esDeCliente('import x from "y";\n"use client";')).toBe(false);
    expect(esDeCliente("export const a = 1;")).toBe(false);
  });
});
