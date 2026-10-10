/**
 * Tests — `clasificarFuente` de `scripts/barrido-portales-en-dialogos.mjs`.
 *
 * Hermano de prueba de `check-html-nesting.test.ts`: un detector que no se
 * probó contra el bug real que debía encontrar es indistinguible de uno roto.
 * El caso real acá es `action-menu.tsx` (2026-09-14): `createPortal(menu,
 * document.body)` se veía pero no recibía clics con un `AdminModal` (Radix)
 * abierto encima, porque Radix le pone `pointer-events: none` al `<body>`. El
 * fix cambió el destino del portal a `portalARef.current ?? document.body`,
 * resuelto vía `.closest('[role="dialog"]')`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clasificarFuente } from "../scripts/barrido-portales-en-dialogos.mjs";

const BARRIDO = "scripts/barrido-portales-en-dialogos.mjs";

describe("clasificarFuente — createPortal", () => {
  it("marca ⚠ un portal literal a document.body (el bug real de action-menu.tsx)", () => {
    const r = clasificarFuente(`
      export default function ActionMenu() {
        return typeof document !== "undefined" && menu
          ? createPortal(menu, document.body)
          : null;
      }
    `);
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toHaveLength(1);
    expect(r.hallazgos[0].elegido).toBe(false);
  });

  it("marca OK el fallback elegido en runtime (el fix real: ref.current ?? document.body)", () => {
    const r = clasificarFuente(`
      export default function ActionMenu() {
        const portalARef = useRef(null);
        return createPortal(menu, portalARef.current ?? document.body);
      }
    `);
    expect(r.ok).toBe(true);
    expect(r.hallazgos[0].elegido).toBe(true);
  });

  it("marca OK aunque la llamada puntual sea literal, si el archivo resuelve el ancestro con closest()", () => {
    const r = clasificarFuente(`
      function ubicar() {
        const dialogo = ancla.closest('[role="dialog"]');
        portalARef.current = dialogo;
      }
      function Render() {
        return createPortal(menu, document.body);
      }
    `);
    expect(r.ok).toBe(true);
    expect(r.resuelveAncestro).toBe(true);
  });

  it("marca OK aunque la llamada puntual sea literal, si el archivo usa marcoDeFixed", () => {
    const r = clasificarFuente(`
      const marco = marcoDeFixed(dialogo);
      return createPortal(menu, document.body);
    `);
    expect(r.ok).toBe(true);
  });

  it("ignora un portal que nunca apunta a body (otro contenedor cualquiera)", () => {
    const r = clasificarFuente(`return createPortal(children, contenedorRef.current);`);
    expect(r.hallazgos).toHaveLength(0);
    expect(r.ok).toBe(true);
  });

  it("no confunde un aria-label con paréntesis dentro del JSX con el cierre de la llamada", () => {
    // Regresión: el extractor de "cuerpo balanceado" debe ignorar `(` y `)`
    // que viven dentro de un string/template literal (ej. un texto con
    // paréntesis), no sólo los que están afuera.
    const r = clasificarFuente(`
      return createPortal(
        <div aria-label={\`Chat (soporte)\`}>hola</div>,
        document.body,
      );
    `);
    expect(r.ok).toBe(false);
    expect(r.hallazgos[0].tipo).toBe("createPortal");
  });
});

describe("clasificarFuente — document.body.appendChild", () => {
  it("marca ⚠ un overlay que se queda esperando clics reales", () => {
    const r = clasificarFuente(`
      function abrirMenu() {
        const el = document.createElement("div");
        el.className = "menu-flotante";
        document.body.appendChild(el);
      }
    `);
    expect(r.ok).toBe(false);
    expect(r.hallazgos[0].tipo).toBe("appendChild");
  });

  it("ignora la descarga programática (.click() sintético, no necesita hit-testing)", () => {
    const r = clasificarFuente(`
      function descargar(url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = "reporte.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    `);
    expect(r.hallazgos).toHaveLength(0);
  });

  it("ignora el iframe oculto para imprimir", () => {
    const r = clasificarFuente(`
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(iframe);
    `);
    expect(r.hallazgos).toHaveLength(0);
  });

  it("ignora lo decorativo (pointer-events-none) y lo no interactivo (sr-only)", () => {
    const confetti = clasificarFuente(`
      container.style.cssText = "position:fixed;pointer-events:none;z-index:80;";
      document.body.appendChild(container);
    `);
    expect(confetti.hallazgos).toHaveLength(0);

    const liveRegion = clasificarFuente(`
      region.className = "sr-only";
      document.body.appendChild(region);
    `);
    expect(liveRegion.hallazgos).toHaveLength(0);
  });

  it("marca OK el fallback elegido con paréntesis: (ref.current ?? document.body).appendChild(...)", () => {
    const r = clasificarFuente(`
      (portalARef.current ?? document.body).appendChild(overlay);
    `);
    expect(r.ok).toBe(true);
    expect(r.hallazgos[0].elegido).toBe(true);
  });
});

/**
 * Tests del GRAFO. Dos rondas de revisión, 2026-09-14:
 *
 *   1. Falso negativo: no seguía `dynamic(() => import(...))`/`lazy(...)` —
 *      `CtpEntriesView` → `Anexo04Modal` entra así (74 archivos de admin usan
 *      `next/dynamic`).
 *
 *   2. Falso positivo (segunda ronda, midiendo la salida de la primera): una
 *      raíz definida como "quién IMPORTA, transitivo, a alguien con un
 *      diálogo" marcó `MarketplaceContent.tsx` como raíz y le colgó 3 ⚠ que
 *      no eran ciertos — el diálogo real (`RecipeModal`, un `Dialog.Content`)
 *      estaba 2 saltos adentro en UNA sección (`MarketplaceRecipesWidget`),
 *      mientras los "hallazgos" eran secciones HERMANAS sin relación
 *      (`FlyToCartProvider` en la raíz de la página). "Importa" ≠ "dibuja".
 *      Ahora una raíz es el archivo cuyo PROPIO JSX usa `<Dialog.Content`,
 *      `<AlertDialog.Content` o `<AdminModal` — sin propagar ese estado hacia
 *      arriba por el grafo de imports.
 *
 * Corren el CLI de verdad (`execFileSync`, mismo patrón que
 * `check-html-nesting.test.ts`) sobre un directorio temporal con SÓLO imports
 * relativos — el resolver de `@/` apunta al repo real, no al fixture.
 */
function correr(args: string[]): { salida: string; code: number } {
  try {
    const salida = execFileSync("node", [BARRIDO, ...args], { encoding: "utf8" });
    return { salida, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { salida: err.stdout ?? "", code: err.status ?? 1 };
  }
}

describe("barrido-portales-en-dialogos — grafo (CLI)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "portales-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("llega a un portal-a-body detrás de un dynamic() (no sólo import estático)", () => {
    writeFileSync(
      join(dir, "RaizDialogo.tsx"),
      `import * as Dialog from "@radix-ui/react-dialog";
      import dynamic from "next/dynamic";
      const Perezoso = dynamic(() => import("./Perezoso"), { ssr: false });
      export default function X() {
        return <Dialog.Root><Dialog.Content><Perezoso /></Dialog.Content></Dialog.Root>;
      }`,
    );
    writeFileSync(
      join(dir, "Perezoso.tsx"),
      `import { createPortal } from "react-dom";
      export default function Perezoso() { return createPortal(<div />, document.body); }`,
    );
    const { salida, code } = correr([dir]);
    expect(code).toBe(1);
    expect(salida).toMatch(/⚠ PORTAL A BODY\s+RaizDialogo\.tsx → Perezoso\.tsx/);
    rmSync(join(dir, "RaizDialogo.tsx"));
    rmSync(join(dir, "Perezoso.tsx"));
  });

  it("una raíz de alert-dialog encuentra su portal SIN nombres a mano (el alias sale del import)", () => {
    // El alias es "Alerta", no "AlertDialog" — si el detector tuviera el
    // nombre escrito a mano, esto fallaría.
    writeFileSync(
      join(dir, "DialogoReal.tsx"),
      `import * as Alerta from "@radix-ui/react-alert-dialog";
      import MenuDeFila from "./MenuDeFila";
      export default function DialogoReal() {
        return <Alerta.Root><Alerta.Content><MenuDeFila /></Alerta.Content></Alerta.Root>;
      }`,
    );
    writeFileSync(
      join(dir, "MenuDeFila.tsx"),
      `import { createPortal } from "react-dom";
      export default function MenuDeFila() { return createPortal(<div />, document.body); }`,
    );
    const { salida, code } = correr([dir]);
    expect(code).toBe(1);
    expect(salida).toMatch(/⚠ PORTAL A BODY\s+DialogoReal\.tsx → MenuDeFila\.tsx/);
    rmSync(join(dir, "DialogoReal.tsx"));
    rmSync(join(dir, "MenuDeFila.tsx"));
  });

  it("NO marca una página por tener, 2 saltos adentro en OTRA sección, un diálogo real (el bug de MarketplaceContent)", () => {
    // Calca la forma real: un diálogo de verdad vive adentro de UNA sección
    // (`SeccionConDialogo`), y una página arriba monta esa sección Y otra
    // completamente aparte (`OverlaySinRelacion`) como hermanas. La página no
    // dibuja el diálogo — sólo lo importa transitivamente — así que no debe
    // heredar sus hallazgos.
    writeFileSync(
      join(dir, "DialogoDeVerdad.tsx"),
      `import * as Dialog from "@radix-ui/react-dialog";
      export default function DialogoDeVerdad() {
        return <Dialog.Root><Dialog.Content>hola</Dialog.Content></Dialog.Root>;
      }`,
    );
    writeFileSync(
      join(dir, "SeccionConDialogo.tsx"),
      `import DialogoDeVerdad from "./DialogoDeVerdad";
      export default function SeccionConDialogo() { return <DialogoDeVerdad />; }`,
    );
    writeFileSync(
      join(dir, "OverlaySinRelacion.tsx"),
      `import { createPortal } from "react-dom";
      export default function OverlaySinRelacion() { return createPortal(<div />, document.body); }`,
    );
    writeFileSync(
      join(dir, "PaginaConMuchasSecciones.tsx"),
      `import SeccionConDialogo from "./SeccionConDialogo";
      import OverlaySinRelacion from "./OverlaySinRelacion";
      export default function PaginaConMuchasSecciones() {
        return <><SeccionConDialogo /><OverlaySinRelacion /></>;
      }`,
    );
    const { salida } = correr([dir]);
    expect(salida).not.toContain("PaginaConMuchasSecciones");
    expect(salida).not.toContain("OverlaySinRelacion");
    expect(salida).not.toContain("SeccionConDialogo");
    rmSync(join(dir, "DialogoDeVerdad.tsx"));
    rmSync(join(dir, "SeccionConDialogo.tsx"));
    rmSync(join(dir, "OverlaySinRelacion.tsx"));
    rmSync(join(dir, "PaginaConMuchasSecciones.tsx"));
  });
});
