/**
 * La identidad de «Buleje Beauty»: la paleta vive SÓLO acá, como variables
 * encerradas en `[data-pagina="pagina-bodega-buleje-test"]`. Los componentes
 * usan `var(--bb-*)` y los tokens del DS (`--surface-*`, `--text-*`,
 * `--rule-*`), que esta página re-tiñe a tonos cálidos en claro y en oscuro.
 *
 * Contraste medido con getComputedStyle (ver LEEME): `--bb-vino` y
 * `--text-tertiary` pasan AA sobre `--surface-canvas` y sobre `--bb-rubor`;
 * `--bb-rosa` y `--bb-oro` son SOLO decorativos (filetes, íconos grandes).
 */
export const ID_PAGINA = "pagina-bodega-buleje-test";

/*
 * Títulos: Instrument Serif (`--font-display`), la serif editorial que el sitio
 * YA carga y precarga en todas las páginas — cero descarga extra. Se probó
 * Cormorant con `next/font` dentro de la pieza: su hoja de @font-face (7 KB,
 * bloqueante) se colaba en TODAS las tiendas `/t/<negocio>` (medido 01-10 en
 * /t/mi-pollo), porque la ruta empaqueta lo que la pieza importa. Instrument
 * Serif sólo tiene peso 400: los títulos van sin `font-semibold` (negrita falsa).
 * Cuerpo: la sans del sitio (Geist).
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
${sel} .bb-serif{font-family:var(--font-display),Georgia,serif;font-weight:400;letter-spacing:-0.01em}
${sel} .bb-sin-barra{scrollbar-width:none}
${sel} .bb-sin-barra::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion: reduce){${sel} *{transition-duration:.01ms!important;animation:none!important;scroll-behavior:auto!important}}
`;
