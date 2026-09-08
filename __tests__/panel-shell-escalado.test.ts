/**
 * Guardas de la sección «PANEL SHELL — escalado por resolución» de globals.css.
 *
 * Por qué un test que lee CSS con regex en vez de renderizar: lo que puede
 * romperse acá no es un componente, es la relación entre escalones que viven
 * en cuatro media queries distintas. Los dos accidentes que este archivo
 * previene son concretos y ya casi pasan solos:
 *
 *  1. Que la escala tipográfica del panel se escape a `:root` pelado y termine
 *     agrandando el storefront y el marketplace, que tienen su propio sistema
 *     (fluid `--fs-*`) y sus baselines de regresión visual.
 *  2. Que el superadmin pierda su piso de 12px en `--ts-2xs`. Ese piso salió
 *     de la auditoría 2026-05-19 («10px es subliminal») y al introducir los
 *     escalones es fácil dejar que herede un valor MENOR que el que tenía
 *     sin escalar.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** Recorta la sección del panel shell (desde su banner hasta el fin del archivo). */
const seccion = css.slice(css.indexOf("PANEL SHELL — escalado por resolución"));

/** Todos los bloques `@media (...) { ... }` de la sección, con su contenido. */
function bloquesMedia(texto: string): { query: string; cuerpo: string }[] {
  const out: { query: string; cuerpo: string }[] = [];
  const re = /@media ([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    // Balanceo de llaves desde la apertura del @media.
    let depth = 1;
    let i = re.lastIndex;
    while (i < texto.length && depth > 0) {
      if (texto[i] === "{") depth++;
      else if (texto[i] === "}") depth--;
      i++;
    }
    out.push({ query: m[1].trim(), cuerpo: texto.slice(re.lastIndex, i - 1) });
  }
  return out;
}

const medias = bloquesMedia(seccion);

function valorToken(cuerpo: string, token: string): string | null {
  const m = cuerpo.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

function px(valor: string | null): number | null {
  if (!valor) return null;
  const m = valor.match(/^([\d.]+)px$/);
  return m ? Number(m[1]) : null;
}

function rem(valor: string | null): number | null {
  if (!valor) return null;
  const m = valor.match(/^([\d.]+)rem$/);
  return m ? Number(m[1]) * 16 : null;
}

describe("panel shell — tokens de ancho", () => {
  it("define los tokens base en :root", () => {
    const base = seccion.slice(seccion.indexOf(":root {"), seccion.indexOf("}", seccion.indexOf(":root {")));
    for (const token of ["--panel-max", "--panel-gutter", "--admin-sidebar-w", "--sa-sidebar-w"]) {
      expect(base, `falta ${token} en :root`).toContain(token);
    }
  });

  it("--panel-max sólo crece a medida que sube el min-width", () => {
    const escalones = medias
      .map((b) => ({
        min: Number(b.query.match(/min-width:\s*(\d+)px/)?.[1] ?? NaN),
        max: px(valorToken(b.cuerpo, "--panel-max")),
      }))
      .filter((e): e is { min: number; max: number } => Number.isFinite(e.min) && e.max !== null)
      .sort((a, b) => a.min - b.min);

    expect(escalones.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < escalones.length; i++) {
      expect(
        escalones[i].max,
        `en ${escalones[i].min}px el ancho (${escalones[i].max}) no supera al de ${escalones[i - 1].min}px`,
      ).toBeGreaterThan(escalones[i - 1].max);
    }
  });

  it("el gutter y el sidebar acompañan al ancho, nunca al revés", () => {
    // No hace falta comparar --panel-max contra el min-width del breakpoint:
    // el <main> es `w-full` con `max-width`, así que el tope nunca produce
    // scroll horizontal (verificado en 1280/1366/1920/2560: overflowX false).
    // Lo que sí puede quedar feo es un escalón donde el contenido crece y el
    // aire se queda igual — o peor, un sidebar que se achica al agrandarse
    // la pantalla.
    const escalones = medias
      .map((b) => ({
        min: Number(b.query.match(/min-width:\s*(\d+)px/)?.[1] ?? NaN),
        gutter: px(valorToken(b.cuerpo, "--panel-gutter")),
        sidebar: px(valorToken(b.cuerpo, "--admin-sidebar-w")),
      }))
      .filter((e) => Number.isFinite(e.min) && e.min >= 1600)
      .sort((a, b) => a.min - b.min);

    let gutterPrevio = 24; // el valor de :root
    let sidebarPrevio = 276;
    for (const e of escalones) {
      if (e.gutter !== null) {
        expect(e.gutter, `el gutter se achica en ${e.min}px`).toBeGreaterThanOrEqual(gutterPrevio);
        gutterPrevio = e.gutter;
      }
      if (e.sidebar !== null) {
        expect(e.sidebar, `el sidebar se achica en ${e.min}px`).toBeGreaterThanOrEqual(sidebarPrevio);
        sidebarPrevio = e.sidebar;
      }
    }
    expect(sidebarPrevio, "el sidebar nunca crece en monitores grandes").toBeGreaterThan(276);
  });
});

describe("panel shell — densidad tipográfica", () => {
  /** Los bloques que tocan la escala --ts-*. */
  const densidad = medias.filter((b) => b.cuerpo.includes("--ts-sm:"));

  it("hay al menos dos escalones de densidad", () => {
    expect(densidad.length).toBeGreaterThanOrEqual(2);
  });

  it("nunca escala fuera del panel — cada regla exige un data-area de panel", () => {
    for (const b of densidad) {
      // Selectores del bloque: todo lo que precede a un `{`.
      const selectores = [...b.cuerpo.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
      expect(selectores.length).toBeGreaterThan(0);
      for (const sel of selectores) {
        expect(
          sel,
          `«${sel}» escalaría también el storefront/marketplace: falta acotar a [data-area="admin"|"superadmin"]`,
        ).toMatch(/\[data-area="(admin|superadmin)"\]/);
      }
    }
  });

  it("--ts-sm crece escalón a escalón y arranca por encima de los 14px base", () => {
    // Cada breakpoint aparece DOS veces a propósito: una en `:root` (para los
    // modales, que van por portal a <body>) y otra en `[data-area=…]` (para el
    // panel, donde hay que ganarle al estilo inline de DesignTokensProvider).
    // Se compara un valor por breakpoint, no las dos copias.
    const porBreakpoint = new Map<number, number>();
    for (const b of densidad) {
      const min = Number(b.query.match(/min-width:\s*(\d+)px/)?.[1] ?? NaN);
      const sm = rem(valorToken(b.cuerpo, "--ts-sm"));
      if (!Number.isFinite(min) || sm === null) continue;
      const previo = porBreakpoint.get(min);
      expect(
        previo === undefined || previo === sm,
        `el breakpoint ${min}px declara --ts-sm con dos valores distintos (${previo} y ${sm}): ` +
          "las copias de :root y de [data-area] tienen que decir lo mismo",
      ).toBe(true);
      porBreakpoint.set(min, sm);
    }

    const vals = [...porBreakpoint.entries()].sort((a, b) => a[0] - b[0]);
    expect(vals.length).toBeGreaterThanOrEqual(2);
    expect(vals[0][1]).toBeGreaterThan(14);
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i][1], `--ts-sm no crece en ${vals[i][0]}px`).toBeGreaterThan(vals[i - 1][1]);
    }
  });

  it("el panel recibe la escala DENTRO del provider de tokens, no sólo en :root", () => {
    // DesignTokensProvider pone los --ts-* del preset como estilo inline en un
    // <div> que envuelve el shell. Un estilo inline en un ancestro le gana a
    // cualquier regla de `:root`, así que sin una declaración sobre
    // [data-area=…] —descendiente de ese div— la escala del panel no cambia:
    // la celda de tabla medía 14px tanto en 1920 como en 2560.
    const base = seccion.match(/\n\[data-area="admin"\],\n\[data-area="superadmin"\] \{[^}]*\}/);
    expect(base, "falta la escala base del panel sobre [data-area]").not.toBeNull();
    expect(base![0], "la escala base del panel tiene que fijar --ts-sm").toContain("--ts-sm");
    expect(base![0], "la escala base del panel tiene que fijar --ts-3xl").toContain("--ts-3xl");
    // Y cada escalón por ancho también, o el panel se queda en el valor base.
    for (const bp of [1728, 2400]) {
      const bloque = densidad.find((b) => b.query.includes(`${bp}px`) && /\[data-area="admin"\]/.test(b.cuerpo));
      expect(bloque, `el escalón de ${bp}px no llega al panel (falta [data-area])`).toBeDefined();
    }
  });

  it("el superadmin conserva su piso de 12px en --ts-2xs en TODOS los escalones", () => {
    // Auditoría 2026-05-19: bajo ese piso los kickers y badges dejan de leerse.
    // Al escalar, el valor del superadmin tiene que ir por encima del genérico,
    // nunca por debajo del piso original.
    for (const b of densidad) {
      const bloqueSA = b.cuerpo.slice(b.cuerpo.indexOf('[data-area="superadmin"]', b.cuerpo.indexOf("--ts-sm:")));
      const val = rem(valorToken(bloqueSA, "--ts-2xs"));
      expect(val, `el escalón «${b.query}» no redefine --ts-2xs para superadmin`).not.toBeNull();
      expect(val!, `--ts-2xs del superadmin cae a ${val}px en «${b.query}»`).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("panel — encabezado del módulo en la misma banda que las pestañas", () => {
  // Piloto acordado con Brandon (2026-09-07) sobre Análisis, para replicar
  // después al resto. Medido a 1363x677 antes del cambio: título, regla,
  // pestañas, subtítulo, regla y pestañas otra vez gastaban 232px hasta el
  // primer número — el 34% de la pantalla. Con el título dentro de la barra
  // y sin el subtítulo redundante quedó en 224px con los KPIs y el gráfico
  // adentro (antes el gráfico no llegaba a verse).
  const hub = readFileSync(join(process.cwd(), "components/admin/unified/AnalisisHubModule.tsx"), "utf8");
  const bi = readFileSync(join(process.cwd(), "components/admin/unified/AnalyticsBIModule.tsx"), "utf8");

  /** Los hubs migrados al patrón (2026-09-07). */
  const HUBS = [
    "AnalisisHubModule", "AsistenteIAHubModule", "CRMClientesModule", "CatalogoTiendaModule",
    "ComprasModule", "CrecimientoHubModule", "DocumentosHubModule", "EquipoHubModule",
    "FacturacionModule", "MensajesHubModule", "MetasLogrosModule", "MiTiendaHubModule",
    "POSCajaModule", "RendimientoModule", "SistemaHubModule", "SugerenciasIAModule",
    // Segunda tanda (misma fecha, «todo lo demás»): los que traían acciones en
    // el header (actualizar, reporte bancario, etiquetas, rango de fechas) y
    // las pasan por `heading.actions`.
    "FinanzasModule", "InventarioAlmacenesModule", "VendorDashboardModule",
    "MarketplaceModule", "DeliveryPartnersModule",
  ];

  it("los hubs pasan el título por `heading`, no como header aparte", () => {
    for (const n of HUBS) {
      const src = readFileSync(join(process.cwd(), `components/admin/unified/${n}.tsx`), "utf8");
      expect(src, `${n} no usa la banda unificada`).toContain("heading={{");
      expect(
        src,
        `${n} volvió a apilar <AdminModuleHeader> encima de las pestañas: son los dos caminos para lo mismo`,
      ).not.toContain("<AdminModuleHeader");
    }
  });

  it("con muchas pestañas el título se lleva una fila propia", () => {
    // El tablist envuelve por dentro, así que con 6+ pestañas es un ítem flex
    // de dos filas de alto y el título —alineado al fondo— aparecía DEBAJO de
    // la primera fila, como un pie. Pasó en Compras (8 pestañas).
    const bar = readFileSync(join(process.cwd(), "components/admin/shared/AdminTabBar.tsx"), "utf8");
    // El tope depende de si hay acciones en la banda: con ellas baja (medido
    // en Inventario, 4 pestañas + 2 acciones: las pestañas envolvían y el
    // título quedaba junto a la segunda fila).
    expect(bar, "se perdió el criterio de cuándo el título entra en línea").toMatch(
      /const tituloEnLinea = Boolean\(heading\) && tabs\.length <= \(heading\?\.actions \? \d+ : \d+\);/,
    );
    // Y en línea el riel no envuelve por dentro: la clase de wrap sólo se
    // aplica cuando el título tiene su fila.
    expect(bar, "el riel volvió a envolver con el título en línea").toContain("wrap && !tituloEnLinea");
    expect(bar, "sin `basis-full` el título no se lleva su fila").toContain("basis-full");
  });

  it("el segundo nivel no repite en prosa lo que dicen sus pestañas", () => {
    expect(
      bi,
      "volvió el encabezado «Métricas del negocio» encima de las pestañas Resumen/Ventas/Productos/…",
    ).not.toContain("<AdminModuleHeader");
  });

  it("`heading` no convive con la regla propia del tablist", () => {
    // Dos reglas horizontales pegadas leen como un borde doble: con heading,
    // la dibuja la banda de afuera y el tablist cede la suya.
    const bar = readFileSync(join(process.cwd(), "components/admin/shared/AdminTabBar.tsx"), "utf8");
    expect(bar, "AdminTabBar no acepta `heading`").toContain("heading?:");
    // Dos comprobaciones en vez de un regex sobre el ternario entero, que se
    // rompe cada vez que cambia el formato de la rama verdadera:
    // (1) la clase base del tablist no lleva regla…
    expect(bar, "el tablist volvió a dibujar su regla siempre").toContain(
      '"-mx-1 flex gap-0.5 px-1 sm:gap-1"',
    );
    // (2) …y la regla vive en la rama SIN heading.
    expect(bar, "la regla del tablist dejó de ser condicional al heading").toContain(
      ': "border-b border-[var(--rule-base)]"',
    );
  });
});

describe("panel shell — logins", () => {
  it("el aire vertical depende de la altura del viewport, no de un valor fijo", () => {
    // La falla que esto previene está medida: con márgenes fijos el login medía
    // 957px en una pantalla de 768 y se cortaba el pie legal.
    for (const token of ["--login-pad-y", "--login-gap-lg", "--login-gap-xl", "--login-gap-sm"]) {
      const val = valorToken(seccion, token);
      expect(val, `falta ${token}`).not.toBeNull();
      expect(val!, `${token} tiene que escalar con vh`).toMatch(/clamp\([^)]*vh[^)]*\)/);
    }
  });

  it("la columna del arte no puede estirar el documento", () => {
    // El mockup del repartidor apila filas de alto fijo: achicarle el ancho
    // no le baja el alto (medido: 508px de ancho, 781 de alto en 1366x768).
    // Sin tope de altura, una ilustración decorativa mandaba scroll a un
    // login cuyo formulario entra en 704px.
    const paginas = [
      "app/admin/login/page.tsx",
      "app/superadmin/login/page.tsx",
      "app/delivery-app/login/page.tsx",
    ];
    for (const p of paginas) {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      const columnaArte = src.match(/className="relative hidden lg:flex[^"]*"/)?.[0] ?? "";
      expect(columnaArte, `${p}: no encontré la columna del arte`).not.toBe("");
      expect(columnaArte, `${p}: la columna del arte puede crecer más que la pantalla`).toContain("lg:max-h-dvh");
      expect(columnaArte, `${p}: sin overflow-hidden el tope de altura no recorta`).toContain("overflow-hidden");
    }
  });

  it("las tres pantallas de login declaran data-area=\"login\"", () => {
    const paginas = [
      "app/admin/login/page.tsx",
      "app/superadmin/login/page.tsx",
      "app/delivery-app/login/page.tsx",
    ];
    for (const p of paginas) {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src, `${p} no activa los tokens --login-*`).toContain('data-area="login"');
      // `min-h-screen` en el contenedor raíz deja el botón bajo el pliegue en
      // mobile con la barra del navegador visible. Se busca en className, no
      // en el archivo entero: el comentario que explica el cambio nombra la
      // clase vieja y haría fallar un `toContain` a secas.
      const enClases = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
      expect(
        enClases.filter((c) => /\bmin-h-screen\b/.test(c)),
        `${p} todavía tiene min-h-screen en un className`,
      ).toEqual([]);
    }
  });
});
