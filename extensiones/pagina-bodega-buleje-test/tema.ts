/**
 * La identidad de «Buleje Beauty»: la paleta vive SÓLO acá, en DOS niveles.
 *
 * 1. `CSS_TEMA` — encerrada en `[data-pagina="pagina-bodega-buleje-test"]`:
 *    lo que dibuja esta carpeta (portada, encabezado, pie, catálogo, bolsa).
 *    Los componentes usan `var(--bb-*)` y los tokens del DS (`--surface-*`,
 *    `--text-*`, `--rule-*`), re-teñidos a tonos cálidos en claro y oscuro.
 *    En oscuro el acento es rosa claro (sólo anillos de foco y detalles).
 * 2. `CSS_GLOBAL` (ADR-460) — en `:root`, y SÓLO en las páginas de la tienda
 *    de este negocio (la monta el marco): lo que NO es de esta carpeta
 *    (cuenta, pedidos, legales, ficha, checkout y sus modales en portal) toma
 *    los mismos neutros cálidos y un acento vino LEGIBLE CON TEXTO BLANCO en
 *    los dos temas, porque esas pantallas pintan `bg-[var(--accent)] text-white`.
 *    `--accent-ink` (el acento para TEXTO) va aparte: rosa claro en oscuro.
 *
 * Contraste medido con getComputedStyle (ver LEEME): `--bb-vino` y
 * `--text-tertiary` pasan AA sobre `--surface-canvas` y sobre `--bb-rubor`;
 * `--bb-rosa` y `--bb-oro` son SOLO decorativos (filetes, íconos grandes).
 * Acento global con blanco encima: 9,2:1 en claro (#7a2e3b) y 4,6:1 en oscuro
 * (#c14f63). Como texto sobre el lienzo oscuro ese acento da 4,1:1: para
 * texto está `--accent-ink` (11,4:1).
 */
export const ID_PAGINA = "pagina-bodega-buleje-test";

/*
 * Títulos: Fraunces (`--font-display-alt`), serif variable con eje óptico
 * (`opsz` 9-144) y pesos reales 100-900. El sitio YA la declara en
 * `app/layout.tsx` con `preload: false`: sólo se descarga en las páginas que la
 * pintan (67 KB, latín; sin cursiva ni ejes SOFT/WONK, que suman 54-81 KB más).
 * NO meter `next/font` acá: se probó Cormorant así y su hoja de @font-face
 * (7 KB, bloqueante) se colaba en TODAS las tiendas `/t/<negocio>` (medido
 * 01-10 en /t/mi-pollo), porque la ruta empaqueta lo que la pieza importa.
 * Sin cursiva cargada, los títulos van rectos (una cursiva falsa se ve rota).
 *
 * - `.bb-serif`: títulos chicos y medianos; el navegador elige la óptica según
 *   el tamaño (`font-optical-sizing: auto`).
 * - `.bb-display`: titulares grandes, tracking cerrado; la óptica crece sola con
 *   el tamaño (a 76 px, opsz 76: más contraste). Se probó forzar opsz 144 con
 *   peso 320 desde 768 px: la barra de la «e» desaparecía y «del» se leía «dcl»
 *   (captura 1280, 08-10). Peso 400 como piso.
 * - `.bb-num`: numerales de vitrina (precios, ranking, contadores); óptica
 *   automática: a 20 px la de 144 deja los trazos finos ilegibles (medido 08-10).
 * Cuerpo: la sans del sitio (Geist), siempre ≥ 16 px.
 */

const sel = `[data-pagina="${ID_PAGINA}"]`;

export const CSS_TEMA = `
${sel}{
--bb-papel:#fbf6f3;--bb-rubor:#f6e8e2;--bb-rubor-2:#edd6cd;--bb-salvia:#e6ece0;--bb-rosa:#c08a82;
--bb-vino:#7a2e3b;--bb-oro:#b08850;--bb-tinta:#1e1517;--bb-sobre-tinta:#f8efe9;--bb-sobre-tinta-2:#d9c6bf;
--surface-canvas:#fffdfb;--surface-raised:#ffffff;--surface-sunken:#f8f1ed;
--rule-soft:#f2e7e2;--rule-base:#e6d6cf;--rule-strong:#1e1517;
--text-primary:#1b1213;--text-secondary:#5b4a47;--text-tertiary:#6f5d59;
--accent:#7a2e3b;--accent-600:#5f222d;--accent-dark:#5f222d;--color-primary:#7a2e3b;
background:var(--surface-canvas);color:var(--text-primary);
}
.dark ${sel}{
--bb-papel:#1b1415;--bb-rubor:#2a1e20;--bb-rubor-2:#39292c;--bb-salvia:#1e2520;--bb-rosa:#d9a39b;
--bb-vino:#f2bcc0;--bb-oro:#d8b47a;--bb-tinta:#0f0b0c;--bb-sobre-tinta:#f8efe9;--bb-sobre-tinta-2:#cdb9b2;
--surface-canvas:#151011;--surface-raised:#1f1819;--surface-sunken:#1a1415;
--rule-soft:#2b2123;--rule-base:#3d2f32;--rule-strong:#f7efeb;
--text-primary:#f7efeb;--text-secondary:#d6c8c4;--text-tertiary:#b3a39f;
--accent:#f2bcc0;--accent-600:#f7d0d3;--accent-dark:#f7d0d3;--color-primary:#f2bcc0;
}
${sel} .bb-serif{font-family:var(--font-display-alt),Georgia,serif;font-weight:420;letter-spacing:-0.015em;font-optical-sizing:auto}
${sel} .bb-display{font-family:var(--font-display-alt),Georgia,serif;font-weight:400;letter-spacing:-0.022em;font-optical-sizing:auto}
${sel} .bb-num{font-family:var(--font-display-alt),Georgia,serif;font-weight:400;font-variant-numeric:lining-nums proportional-nums;letter-spacing:-0.01em;font-optical-sizing:auto}
${sel} .bb-sin-barra{scrollbar-width:none}
${sel} .bb-sin-barra::-webkit-scrollbar{display:none}
${sel} .bb-desvanecer{-webkit-mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent);mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent)}
@media (min-width:640px){${sel} .bb-desvanecer-sm{-webkit-mask-image:none;mask-image:none}}
@media (min-width:768px){${sel} .bb-desvanecer-movil{-webkit-mask-image:none;mask-image:none}}
${sel} .bb-puntos{flex:1;align-self:end;margin-bottom:.4em;height:2px;background-image:radial-gradient(circle,currentColor 1px,transparent 1.3px);background-size:6px 2px;background-repeat:repeat-x;opacity:.45}
${sel} .noise-texture-bg::after{opacity:.075}
.dark ${sel} .noise-texture-bg::after{opacity:.06;filter:invert(1);mix-blend-mode:screen}
@keyframes bb-girar{to{transform:rotate(1turn)}}
${sel} .bb-girar{animation:bb-girar 48s linear infinite}
@media (prefers-reduced-motion: reduce){${sel} *{transition-duration:.01ms!important;animation:none!important;scroll-behavior:auto!important}}
`;

/*
 * Nivel global (ADR-460). `:root:root` (especificidad 0,2,0) le gana al `:root`
 * y al `.dark` de globals.css sin depender del orden de las hojas. Van también
 * los `--color-*` heredados (card, popover, border…): la cuenta los usa y en
 * oscuro salían azul pizarra (#1c2230) entre los tonos vino. El título de
 * cada página (ficha, cuenta, legales) toma la serif del salón: con la
 * genérica la ficha parecía de otra tienda (revisión 02-10). En oscuro,
 * globals.css fuerza `--color-primary-dark` con !important a
 * `--color-primary-light`: por eso se define ese.
 *
 * TEXTO con el acento, en oscuro (revisión 02-10). Ningún vino sirve a la vez
 * de fondo con texto blanco (≥4,5 pide luminancia ≤0,18) y de texto sobre el
 * lienzo oscuro (≥4,5 pide ≥0,20): son dos tokens. `--accent` queda de FONDO
 * (blanco encima 4,6:1) y lo que pinta TEXTO con el acento —clases de
 * Tailwind y `style={{ color: "var(--color-primary…)" }}` de la cuenta, los
 * legales y el checkout, que no son de esta carpeta— pasa a la tinta
 * `--accent-ink` (#f2bcc0). La lista sale del censo de esas pantallas (02-10);
 * si una pantalla suma otra clase de acento como texto, va acá. `.text-muted`
 * viene horneado en gris (#6b7280, 3,6:1 en oscuro): pasa al terciario cálido.
 * En claro no cambia nada: la tinta y el acento son el mismo vino.
 */
export const TEXTO_CON_ACENTO = [
  ".text-\\[var\\(--accent\\)\\]",
  ".dark\\:text-\\[var\\(--accent\\)\\]",
  ".text-\\[var\\(--accent-dark\\)\\]",
  ".text-\\[var\\(--accent-600\\)\\]",
  ".text-\\[var\\(--color-primary\\)\\]",
  ".text-primary",
  ".text-primary-dark",
  ".text-primary\\/70",
  ".text-accent",
  ".hover\\:text-\\[var\\(--accent\\)\\]:hover",
  ".hover\\:text-primary:hover",
  ":where(.group):hover .group-hover\\:text-primary",
  ":where(.group):hover .group-hover\\:text-\\[var\\(--accent\\)\\]",
].join(",");

/** El color en línea de React llega como `color:var(…)` (servidor) o `color: var(…)` (navegador); nunca `background-color`. */
export const TEXTO_EN_LINEA_CON_ACENTO = ["--color-primary", "--accent", "--tenant-primary"]
  .flatMap((v) => [`[style^="color:var(${v}"]`, `[style^="color: var(${v}"]`, `[style*=";color:var(${v}"]`, `[style*="; color: var(${v}"]`])
  .join(",");

export const CSS_GLOBAL = `
:root:root{
--surface-canvas:#fffdfb;--surface-raised:#ffffff;--surface-sunken:#f8f1ed;
--rule-soft:#f2e7e2;--rule-base:#e6d6cf;--rule-strong:#1e1517;
--text-primary:#1b1213;--text-secondary:#5b4a47;--text-tertiary:#6f5d59;
--accent:#7a2e3b;--accent-600:#5f222d;--accent-dark:#5f222d;--accent-ink:#7a2e3b;
--accent-soft:rgb(122 46 59/.06);--accent-muted:rgb(122 46 59/.13);--accent-glow:rgb(122 46 59/.28);
--brand-accent:#7a2e3b;--color-primary:#7a2e3b;--color-primary-dark:#5f222d;--color-primary-light:#9b4152;
--color-background:#fffdfb;--color-foreground:#1b1213;
--color-surface:#f8f1ed;--color-card:#ffffff;--color-card-foreground:#1b1213;--color-card-border:#e6d6cf;
--color-popover:#ffffff;--color-popover-foreground:#1b1213;--color-border:#e6d6cf;--color-input:#e6d6cf;
--color-ring:#7a2e3b;--color-accent:#7a2e3b;--color-muted:#6f5d59;--color-muted-foreground:#6f5d59;
}
:root:root.dark{
--surface-canvas:#151011;--surface-raised:#1f1819;--surface-sunken:#1a1415;
--rule-soft:#2b2123;--rule-base:#3d2f32;--rule-strong:#f7efeb;
--text-primary:#f7efeb;--text-secondary:#d6c8c4;--text-tertiary:#b3a39f;
--accent:#c14f63;--accent-600:#9a3b4e;--accent-dark:#9a3b4e;--accent-ink:#f2bcc0;
--accent-soft:rgb(193 79 99/.12);--accent-muted:rgb(193 79 99/.22);--accent-glow:rgb(193 79 99/.3);
--brand-accent:#c14f63;--color-primary:#c14f63;--color-primary-light:#c14f63;
--color-background:#151011;--color-foreground:#f7efeb;
--color-surface:#1a1415;--color-card:#1f1819;--color-card-foreground:#f7efeb;--color-card-border:#3d2f32;
--color-popover:#1f1819;--color-popover-foreground:#f7efeb;--color-border:#3d2f32;--color-input:#3d2f32;
--color-ring:#c14f63;--color-accent:#c14f63;--color-muted:#b3a39f;--color-muted-foreground:#b3a39f;
}
[data-marco] h1{font-family:var(--font-display-alt),Georgia,serif;font-weight:400;letter-spacing:-0.015em}
:root:root.dark :is(${TEXTO_CON_ACENTO}){color:var(--accent-ink)}
:root:root.dark :is(${TEXTO_EN_LINEA_CON_ACENTO}){color:var(--accent-ink)!important}
:root:root .text-muted{color:var(--text-tertiary)}
`;
