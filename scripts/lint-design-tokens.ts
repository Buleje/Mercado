#!/usr/bin/env tsx
/**
 * lint-design-tokens.ts — Guardarail de ADR-068 (armonia estricta).
 *
 * Escanea components/admin y tienda publica por violaciones del sistema de diseno:
 * - Gradientes decorativos (bg-linear-to-* / bg-gradient-to-*) fuera de whitelist.
 * - Shadows coloridos (shadow-{color}-{num}).
 * - Clases inexistentes / deprecated (ej. bg-gradient-to-* en Tailwind v4).
 *
 * Whitelist de gradientes funcionales (NO decorativos):
 * - Scroll fade overlays (AdminTabBar)
 * - Image-over-text overlays (BannerEditor)
 *
 * Uso:
 *   tsx scripts/lint-design-tokens.ts                   # Full scan (admin + store)
 *   tsx scripts/lint-design-tokens.ts --staged          # Solo staged files
 *   tsx scripts/lint-design-tokens.ts --warn            # Emite warnings, no falla
 *   tsx scripts/lint-design-tokens.ts --design-strict   # ADR-075: reglas DS upgradean a error
 *
 * Exit codes: 0 = clean, 1 = violations found
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

const MODE_STAGED = process.argv.includes("--staged");
const MODE_WARN = process.argv.includes("--warn");
const MODE_DESIGN_STRICT = process.argv.includes("--design-strict");
const FILE_ARGS = process.argv.slice(2).filter((a) => !a.startsWith("--"));

type Rule = {
  id: string;
  pattern: RegExp;
  message: string;
  severity: "error" | "warning";
  /** Si true, la regla solo aplica a admin/** (no store/customer). */
  adminOnly?: boolean;
  /** Si se provee, la severidad se eleva a "error" cuando MODE_DESIGN_STRICT=true. */
  strictUpgrade?: boolean;
};

// ─── Tokens --data-* que NO existen ────────────────────────────────────────
//
// POR QUÉ ESTA REGLA:
// la paleta `--data-{success,warning,error,info}` es una escala SEMÁNTICA de 5
// pasos (50 bg-soft · 100 bg-soft-hover · 500 default · 600 hover · 700 pressed),
// NO una rampa Tailwind 50→900. Escribir `--data-success-900` no rompe el build
// ni el type-check: la `var()` simplemente no resuelve, la declaración se
// descarta y el elemento **hereda el color del padre**.
//
// En light suele pasar desapercibido (hereda texto oscuro sobre fondo claro).
// En DARK hereda texto claro sobre un fondo claro ⇒ ilegible. Así estuvieron los
// badges del Libro CTP (medido con getComputedStyle 2026-07-15: el color del
// badge era idéntico al del padre) y así siguen ~128 usos en el resto del repo.
//
// El linter daba 0 violaciones porque sólo miraba el FORMATO del token, nunca si
// existía. Los tonos válidos se leen de globals.css: si mañana se agrega uno, la
// regla lo acepta sola (single source, no una lista que se desincroniza).

/** Tonos realmente definidos, leídos de la fuente. */
function tonosDefinidos(): string[] {
  const cssPath = resolve(process.cwd(), "app/globals.css");
  if (!existsSync(cssPath)) return [];
  const css = readFileSync(cssPath, "utf8");
  const tonos = new Set<string>();
  for (const m of css.matchAll(/--data-(?:success|warning|error|info)-(\d+)\s*:/g)) {
    tonos.add(m[1]);
  }
  return [...tonos].sort((a, b) => Number(a) - Number(b));
}

const TONOS = tonosDefinidos();
/**
 * `--data-<tono>-<N>` con N no definido y SIN fallback.
 *
 * El `(?=\s*\))` es lo que separa roto de feo: `var(--data-x-900)` no resuelve y
 * hereda el color del padre (el bug), mientras que `var(--data-x-900, #a7f3d0)`
 * pinta el fallback y funciona. Eso último es un hex hardcodeado —otro problema,
 * de otras reglas—, no un color heredado. Sin esta distinción la regla gritaba
 * sobre 16 usos que renderizan bien.
 *
 * Sin tonos leídos (globals.css movido) → no matchea nada, no rompe el gate.
 */
const UNDEFINED_DATA_TOKEN = TONOS.length
  ? new RegExp(`--data-(?:success|warning|error|info)-(?!(?:${TONOS.join("|")})\\b)\\d+(?=\\s*\\))`, "g")
  : /(?!)/g;

const RULES: Rule[] = [
  {
    id: "ds-undefined-data-token",
    pattern: UNDEFINED_DATA_TOKEN,
    message:
      `Este token --data-* NO existe en globals.css (definidos: ${TONOS.join(", ") || "ninguno"}). ` +
      "La var() no resuelve y el elemento HEREDA el color del padre — en dark mode eso es texto claro " +
      "sobre fondo claro. La paleta es semántica, no una rampa Tailwind: 50=bg-soft · 100=bg-soft-hover · " +
      "500=default · 600=hover · 700=pressed. Mapeá al rol: texto oscuro → 700 · fondo tenue → 50/100 · " +
      "borde → 500. Para un hover sobre un botón -700 no hay tono más oscuro: usá hover:opacity-90.",
    severity: "error",
  },
  {
    id: "no-decorative-gradient",
    pattern: /bg-(linear|gradient)-to-[a-z]+\s+from-(indigo|purple|violet|pink|fuchsia|rose|emerald|cyan|teal|amber|orange|yellow|red|green|blue|sky|slate)-\d{2,3}/g,
    message: "Gradiente decorativo prohibido (ADR-068). Usa bg-[var(--surface-sunken)], bg-[var(--text-primary)], o tokens semanticos.",
    severity: "error",
  },
  {
    id: "no-legacy-gradient-prefix",
    pattern: /bg-gradient-to-[a-z]+/g,
    message: "bg-gradient-to-* es Tailwind v3. En v4 usa bg-linear-to-* (solo si es gradiente funcional whitelisted).",
    severity: "error",
  },
  {
    id: "no-colored-shadow",
    pattern: /shadow-(indigo|purple|violet|pink|fuchsia|rose|emerald|cyan|teal|amber|orange|yellow|blue|sky)-\d{2,3}/g,
    message: "Sombra colorida decorativa prohibida. Usa shadow-sm/shadow-md neutros.",
    severity: "error",
  },
  {
    id: "no-decorative-text-color",
    pattern: /\btext-(indigo|violet|purple|pink|fuchsia|rose)-\d{2,3}\b/g,
    message: "Color de texto decorativo violeta/rosa prohibido (ADR-068). Usa text-[var(--text-primary|secondary|tertiary)] o tokens semanticos.",
    severity: "error",
  },
  // ── Typography tokens (ADR-070) ──────────────────────────────────────────────
  {
    id: "no-arbitrary-text-size",
    pattern: /text-\[\d{1,2}(\.\d+)?px\](?!\w)/g,
    message: "Tamano de texto arbitrario prohibido (ADR-070). Usa text-[length:var(--ts-2xs|xs|sm|base|lg|xl|2xl|3xl)] o text-xs/sm/base/lg/xl/2xl/3xl. Display headlines (>= 100px) estan permitidos.",
    severity: "error",
  },
  {
    id: "no-arbitrary-tracking",
    pattern: /tracking-\[[^\]]*em\]/g,
    message: "Letter-spacing arbitrario prohibido (ADR-070). Usa tracking-[var(--ls-tight|normal|wide|wider)] o tokens tracking-tight/normal/wide/wider.",
    severity: "error",
  },
  // BUGFIX 2026-05-12: regla warn-font-extrabold tenia mensaje circular
  // ("font-extrabold prohibido — usa font-extrabold"). Eliminada hasta clarificar
  // intencion del ADR-070. El codemod migró font-black → font-extrabold consistentemente.
  // ── Motion tokens (ADR-071) ──────────────────────────────────────────────
  {
    id: "no-arbitrary-duration-ms",
    pattern: /duration-\[\d+ms\](?!\w)/g,
    message: "Duration arbitraria prohibida (ADR-071). Usa duration-[var(--dur-micro|fast|base|slow|slower)].",
    severity: "error",
  },
  {
    id: "warn-tailwind-duration",
    pattern: /(?<![\w:-])duration-(75|100|150|200|300|400|500|700|1000)\b/g,
    message: "Usa tokens semanticos (var(--dur-*)) en lugar de duration-Xms literales (ADR-071).",
    severity: "warning",
  },
  // ── Shadow tokens (ADR-072) ──────────────────────────────────────────────
  {
    id: "no-arbitrary-shadow",
    pattern: /shadow-\[0_\d+px_[^\]]+\](?!\w)/g,
    message: "Shadow arbitrario prohibido (ADR-072). Usa shadow-[var(--shadow-sm|md|lg|xl)] o escalas Tailwind estandar.",
    severity: "error",
  },
  {
    id: "warn-shadow-2xl",
    pattern: /(?<![\w-])shadow-2xl(?!\w)/g,
    message: "shadow-[var(--shadow-xl)] es excesivo. Usa shadow-[var(--shadow-xl)] (ADR-072).",
    severity: "warning",
  },
  // ── Neutral surfaces hardcoded (ADR-074) ───────────────────────────────────
  // Detecta pares light/dark gray/white que deberian usar surface-* tokens.
  {
    id: "warn-hardcoded-neutral-surface-pair",
    pattern: /bg-(white|gray-50|gray-100)\s+dark:bg-gray-(800|900|950)/g,
    message: "Pareja bg-white/gray + dark:bg-gray hardcoded (ADR-074). Usa bg-[var(--surface-canvas|sunken|raised)].",
    severity: "warning",
  },
  {
    id: "warn-hardcoded-neutral-border-pair",
    pattern: /border-gray-(100|200|300)\s+dark:border-gray-(700|800|900)/g,
    message: "Borde gray hardcoded (ADR-074). Usa border-[var(--rule-soft|base)].",
    severity: "warning",
  },
  {
    id: "warn-hardcoded-neutral-text-pair",
    pattern: /text-gray-(500|600|700|800|900)\s+dark:text-(white|gray-(100|200|300|400))/g,
    message: "Par text-gray hardcoded (ADR-074). Usa text-[var(--text-primary|secondary|tertiary)].",
    severity: "warning",
  },
  // ── DS Single Source of Truth (ADR-075) ────────────────────────────────────
  // Admin-only strict rules. En --design-strict estas suben a error.
  // ── Armonía del panel (Brandon 2026-09-07/08): lo que se limpió por codemod no vuelve ──
  // Estas tres son ERROR siempre (no dependen de --design-strict): el barrido dejó el admin
  // en 0 ocurrencias, así que el gate no rompe nada legítimo — sólo frena regresiones.
  {
    id: "ds-no-raw-neutral-admin",
    // Los neutros crudos que el barrido mapeó a tokens. `dark:`/`hover:` y `/NN` se excluyen a
    // propósito (los velos y los neutros de texto claro sobre fondos oscuros no tienen token).
    pattern:
      /(?<![\w:/-])(?:bg-white|bg-(?:gray|slate)-(?:50|100|200)|text-(?:gray|slate)-(?:400|500|600|700|800|900)|border-(?:gray|slate)-(?:100|200|300)|divide-(?:gray|slate)-(?:100|200))(?![\w/-])/g,
    message:
      "Neutro crudo en admin: usá el token (bg-[var(--surface-raised|sunken)], bg-[var(--rule-soft|base)], text-[var(--text-primary|secondary|tertiary)], border-[var(--rule-base|soft)]). El oscuro sale del token, sin dark:.",
    severity: "error",
    adminOnly: true,
    strictUpgrade: false,
  },
  {
    id: "ds-no-border-2-neutral-admin",
    // Un borde neutro de 2px al lado del token: el panel usa hairline (StatCard, AdminTabBar, campos).
    pattern: /(?<![\w:-])border-2 border-\[var\(--rule-(?:base|soft)\)\]/g,
    message: "Borde neutro de 2px en admin: usá `border border-[var(--rule-base)]` (un solo grosor en todo el panel). Los bordes de color (acento/error) sí pueden ir a 2px.",
    severity: "error",
    adminOnly: true,
    strictUpgrade: false,
  },
  {
    id: "ds-no-hex-in-class-admin",
    // Hex dentro de una clase arbitraria (text-[#2563EB], bg-[#00A0A0]…): siempre hay token.
    pattern: /(?<![\w:-])(?:bg|text|border|ring|from|to|via|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g,
    message: "Hex en clase en admin: usá var(--accent|--accent-ink|--rule-base|--data-*) o bg-primary/NN. (Quedan ~50 legítimos: WhatsApp #25D366, fondos de héroes oscuros — aviso hasta que tengan token.)",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-inline-date-format-admin",
    // Fecha/hora/número formateados a mano. Medido 2026-09-22: 864 llamadas en 427 archivos
    // con 98 variantes; 64 en UTC y 209 sin zona (el mismo registro mostraba dos días).
    // El canon vive en lib/format: formatDate/formatDateShort/formatTime/formatNumber…
    pattern: /\.toLocale(?:Date|Time)?String\(/g,
    message:
      "Fecha/hora/número a mano: usá formatDate/formatDateShort/formatDateNumeric/formatTime/formatDateTime/formatNumber de @/lib/format (zona Lima, 24 h, «—» sin dato; { soloFecha: true } para columnas DATE).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-tofixed-money-admin",
    // `S/${x.toFixed(2)}` no pone separador de miles: «S/ 12345.50» al lado de «S/ 12,345.50».
    pattern: /S\/\.?\s*(?:\$\{|\{)[^}]*\.toFixed\(\s*2\s*\)/g,
    message: "Monto a mano con toFixed(2): usá formatCurrency de @/lib/format («S/ 12,345.50», null-safe).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-text-gray-admin",
    // text-gray-{400..900} (monocromo — saltar 100-300 que se usan para dividers/placeholders)
    pattern: /(?<![\w:-])text-gray-(400|500|600|700|800|900)(?!\w)/g,
    message:
      "Usa text-[var(--text-primary|secondary|tertiary)] o <BodyText/Caption/Label> del DS (ADR-075).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-decorative-color-admin",
    // text/bg-{red,blue,emerald,green,amber,yellow,orange,purple,violet,pink,indigo,sky,cyan}-{400-700}
    pattern:
      /(?<![\w:-])(text|bg)-(red|blue|emerald|green|amber|yellow|orange|purple|violet|pink|indigo|sky|cyan)-(400|500|600|700)(?!\w)/g,
    message:
      "Usa --data-{success,warning,error,info} o <IconBadge intent=...>/StatCard emphasis=... del DS (ADR-075).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-direct-lucide-import",
    pattern: /from\s+["']lucide-react["']/g,
    message:
      "Import iconos desde '@buleje/design-system/icons' (ADR-075). El DS re-exporta todos los iconos necesarios con tree-shake.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-style-color-inline",
    // style={{ color: ..., background: ..., borderColor: ... }} — SOLO si el valor NO es var(--...)
    // (para no prohibir tokens CSS legitimos). Detectamos colores hex/rgb/rgba/hsl literales.
    pattern:
      /style=\{\{[^}]*\b(color|background|backgroundColor|borderColor)\s*:\s*["']?(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl)/g,
    message:
      "Usa className con tokens CSS (--text-*, --surface-*, --rule-*, --data-*) en lugar de style inline con literales (ADR-075).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-inline-alert-pattern",
    // bg-{yellow,red,green,blue,amber}-50 + border-{same}-{200,300} en la misma linea.
    pattern:
      /bg-(yellow|red|green|blue|amber)-(50|100)\s+[^"]*border-(yellow|red|green|blue|amber)-(200|300)/g,
    message:
      "Usa <InfoAlert/WarningAlert/ErrorAlert/SuccessAlert> del DS (ADR-075) en lugar del patron bg-{color}-50 + border-{color}-200 inline.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  // ── Sprint B4: typography/style/table/loader DS adoption (ADR-075) ───────
  {
    id: "ds-no-heading-with-design-class",
    // <h1|h2|h3 con text-*/font-*/leading-*/tracking-* en className → usar PageTitle/SectionTitle/CardTitle.
    pattern:
      /<h[1-3]\s+[^>]*className=(?:"[^"]*(?:\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)|\bfont-(?:thin|light|normal|medium|semibold|bold|extrabold|black)|\bleading-|\btracking-)[^"]*"|\{`[^`]*(?:\btext-|\bfont-|\bleading-|\btracking-)[^`]*`\})/g,
    message:
      "Usa <PageTitle/SectionTitle/CardTitle> del DS (ADR-075) en lugar de <h1/h2/h3> con clases de diseño.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    // ── Endurece la regla anterior: bloquea CUALQUIER <h1-h3 className=> en
    // components/admin/** y app/admin/**, no solo cuando tiene clases de diseño.
    // Razón: el panel admin sigue tipografía estándar del DS (PageTitle/
    // SectionTitle/CardTitle). Ver `docs/typography-system.md`.
    id: "ds-no-heading-raw-admin",
    pattern: /<h[1-3]\s+[^>]*className=/g,
    message:
      "Sin <h1/h2/h3 className=...> en admin: usa <PageTitle> (h1), <SectionTitle> (h2) o <CardTitle> (h3) del DS. Ver docs/typography-system.md.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-heading-h4-raw-admin",
    pattern: /<h4\s+[^>]*className=/g,
    message:
      "Sin <h4 className=...> en admin: usá <BlockTitle> del DS (subtítulo de bloque). Si es un rótulo en mayúsculas es <Kicker>, y si titula la tarjeta entera es <CardTitle>.",
    severity: "warning",
    adminOnly: true,
    /* Sin `strictUpgrade`: quedan 43 <h4> que son otro rol (rótulo o título
       grande) y hay que reclasificarlos de a uno, no convertirlos en errores. */
  },
  {
    id: "ds-no-style-inline-any-color",
    // style={{ color|backgroundColor|borderColor|fontSize: cualquier literal }} — incluye var(...) para forzar className.
    // Diferencia con ds-no-style-color-inline: éste incluye var(...) y fontSize.
    pattern:
      /style=\{\{[^}]*\b(color|backgroundColor|borderColor|fontSize)\s*:\s*["'](?:var\([^)]+\)|#[0-9a-fA-F]{3,8}|\d+)/g,
    message:
      "Usa className con tokens CSS (--text-*, --surface-*, --rule-*) o primitives del DS (ADR-075) — evitar style inline estático.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: false,
  },
  {
    id: "ds-no-raw-table-in-admin",
    // <table ...> sin className usando `overflow` cerca → sugerencia DataTable.
    // Detectamos <table> JSX directo (no HTML string dentro de template).
    pattern: /<table\s+className=/g,
    message:
      "Considera migrar a <DataTable> del DS (ADR-075) para tablas con estilo consistente. Si es un caso legítimo (cabeceras custom, spans), ignora esta regla.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: false,
  },
  // ── Canon de KPI cards (2026-09-22) ────────────────────────────────────────
  // `StatCard` (@buleje/design-system) es el único KPI card. Antes de esta
  // regla había 11 clones locales (`function KpiCard`/`KPICard`/`MetricCard`)
  // repitiendo el mismo layout con className armadas a mano — uno de ellos
  // (`ShrinkageTab`) escondía un color fuera de tokens (`bg-red-50
  // dark:bg-red-950/20`) que ninguna otra regla detectaba. Warning, no error:
  // hay excepciones legítimas (una pastilla de deuda que cuenta pendientes y
  // FILTRA una tabla no es un KPI — ver memoria `deuda-no-es-indicador`).
  {
    id: "ds-no-kpi-card-clone",
    pattern: /\b(?:function\s+(?:Kpi|KPI|Stat|Metric)Card\b|const\s+(?:Kpi|KPI|Stat|Metric)Card\s*=)/g,
    message:
      "Definición local de tarjeta de KPI fuera del DS. Usá <StatCard> de @buleje/design-system " +
      "(props: label/value/delta/deltaLabel/trend/deltaPolarity/icon/emphasis/subValue/density/" +
      "sparkline/highlight/accentBar/iconEmphasis/onClick). Si es una pastilla de deuda que cuenta " +
      "pendientes y su onClick FILTRA una tabla, no es un KPI — dejala, pero no la llames *Card.",
    severity: "warning",
  },
  {
    id: "ds-no-raw-loader-block-in-admin",
    // Loader2 de bloque (h-6 w-6 o mayor) con animate-spin → usar LoadingState.
    // Inline spinners en botones (h-3/h-4) son aceptables y NO disparan la regla.
    pattern: /<Loader2\s+[^>]*className=["'][^"']*\bh-(?:6|7|8|10|12|16)[^"']*animate-spin/g,
    message:
      "Usa <LoadingState> del DS (ADR-075) en lugar de <Loader2 animate-spin> a nivel bloque — unifica spinner y copy.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: false,
  },
  // ── Emoji como ícono en el panel (barrido 2026-09-22) ───────────────────────
  // Un emoji se dibuja distinto en Windows/Android/iOS y Chrome/Firefox: 306
  // ocurrencias censadas, 163 usadas COMO ÍCONO de la UI (⚠→AlertTriangle,
  // ✓→Check, ★→Star…). El resto es CONTENIDO real —el texto de un WhatsApp/
  // email/toast que el vecino o el dueño reciben tal cual, o un emoji-picker
  // donde el propio emoji es el dato (reacciones de chat, ícono de carpeta que
  // el dueño elige)— y ESE no se toca.
  //
  // Por qué el patrón exige emoji pegado a un `>`: un regateo sobre texto
  // crudo no distingue JSX de un objeto JS. Medido (cualquier emoji del
  // archivo, sin acotar): 103 falsos positivos SÓLO en 6 archivos de
  // contenido (`PromotionsTab.tsx` 25, `ChatTab/MessageComposer.tsx` 24,
  // `documentos/FolderBulkBar.tsx` 32, `PrestamosModule.tsx` 12,
  // `ChatTab/ConversationView.tsx` 6, `ChatTab/TemplatesPanel.tsx` 4) — todos
  // strings de `message:`/arrays de picker, nunca hijos de un elemento.
  // Exigir que el emoji sea el primer carácter no-espacio *después* de un `>`
  // (o de un `{` de expresión JSX) bajó eso a **0** sobre los mismos 6
  // archivos y a sólo 2 archivos reales en todo el repo (`ReportsTab.tsx` —
  // email, whitelisteado — y un bug real que encontró en
  // `forestal/loth-mapa-shared.ts`) — a costa de no cazar un emoji que
  // aparezca a mitad de una oración ya renderizada (residual conocido, igual
  // que el hex de `ds-no-hex-in-class-admin`).
  {
    id: "ds-no-emoji-icon-admin",
    pattern: /[>{]\s*["'`]?[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu,
    message:
      "Emoji como ícono de UI en vez de un componente del DS (@buleje/design-system/icons) — se dibuja distinto por SO/navegador. Mapeo semántico, no literal (⚠→AlertTriangle, ✓→Check, ★→Star, 🎉→PartyPopper…): grep del mismo emoji en una pantalla hermana antes de elegir. Si es CONTENIDO real (WhatsApp/email/toast que el cliente o el dueño reciben tal cual, o un emoji-picker donde el emoji ES el dato) agregá el archivo a WHITELIST_PATTERNS con una línea que diga por qué — no se silencia sin motivo.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  // ── z-index arbitrario en un overlay de pantalla completa (2026-09-22) ──────
  // app/globals.css §CAPAS define 6 nombres (z-dropdown/modal/modal-2/modal-3/
  // system/tour) con orden de abajo hacia arriba garantizado. El codemod que los
  // introdujo migró 96 archivos + AdminModal, pero SALTÓ a propósito los overlays
  // `fixed inset-0` con un `z-[N]`/`z-N` numérico crudo — ahí el número puede
  // significar "otro peldaño" (colisión real que hay que resolver a mano, ver
  // `CatalogOptionPicker`/`action-menu` — dos z distintos que colapsan al MISMO
  // nombre son seguros sólo si el de arriba va después en el DOM) y un regex no
  // puede decidir eso solo. Por eso esta regla es un WARNING que señala dónde
  // mirar, no un fix automático.
  //
  // Acotada a `fixed inset-0` (el patrón de velo/pantalla completa) para no
  // repetir `ds-no-kpi-card-clone`-style ruido sobre los z-index locales que NO
  // son overlays de panel entero (sticky thead z-[1], popovers z-[61] con
  // `fixed` sin `inset-0`, mapas Leaflet con capas propias) — esos van con otro
  // criterio y ya tienen su propio comentario in situ.
  //
  // Medido 2026-09-22 (`npx tsx scripts/lint-design-tokens.ts --warn`, full
  // scan — pasarle un directorio como arg no escanea nada: `getTargetFiles`
  // sólo acepta archivos sueltos que terminen en .ts/.tsx, gotcha del propio
  // script). Antes de tocar nada: 21 coincidencias en 7 archivos. Los 3 que
  // predijo el pedido estaban (POSView.tsx ×2 `z-50`, StoreCreativeMode.tsx
  // ×2 `z-[100]`/`z-[120]`, UbicacionDoc.tsx ×1 `z-30`), pero el censo real
  // era más grande. Tres eran arreglo directo (mismo overlay de un solo
  // peldaño, sin colisión que decidir) y se migraron a `z-modal` en esta
  // misma pasada: `ActivosModule.tsx` (×2), `SimpleExpiryTab.tsx` (×1),
  // `SimpleMovementsTab.tsx` (×1). Residuo final: **17 en 6 archivos**, todos
  // de OTRO agente en curso (fuera de este scope): `InventoryTab.tsx` ×5,
  // `FiadoModals.tsx` ×5, `POSView.tsx` ×3, `StoreCreativeMode.tsx` ×2,
  // `UbicacionDoc.tsx` ×1, `LothPlanForm.tsx` ×1 (este último ni estaba en la
  // lista predicha — apareció al medir con el scan completo).
  {
    id: "ds-no-z-arbitrary-admin",
    // `fixed inset-0` seguido, dentro de la misma clase, por z-[N] o z-N crudo.
    // El match cae sobre "fixed inset-0" (no sobre el z-) para que funcione
    // aunque el proyecto reordene las clases; el lookahead no exige que sea lo
    // próximo, sólo que esté en la misma cadena (tope de 120 chars ~ una clase
    // típica de overlay+velo).
    pattern: /\bfixed inset-0\b(?=[^"'`]{0,120}\bz-(?:\[\d+\]|\d+\b))/g,
    message:
      "Overlay `fixed inset-0` con z-index numérico crudo (no un nombre de app/globals.css §CAPAS: " +
      "z-dropdown/z-modal/z-modal-2/z-modal-3/z-system/z-tour). Antes de renombrar: si este overlay " +
      "vive con OTRO junto a él que también migraría al mismo nombre, verificá en el JSX que el que " +
      "debe quedar arriba va DESPUÉS en el DOM (memoria modales-anidados-z-index-radix) — si no se " +
      "puede garantizar el orden, no lo migres a ciegas.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
];

const WHITELIST_PATTERNS: Array<{ file: RegExp; allowedRules: string[] }> = [
  { file: /shared[\\/]AdminTabBar\.tsx$/, allowedRules: ["no-decorative-gradient"] },
  // (DesignTab borrado en ADR-299 fase 4 — su allowlist se fue con él.)
  // DS primitives — shared/ y packages/design-system/** pueden importar lucide-react directo.
  { file: /packages[\\/]design-system[\\/]/, allowedRules: ["ds-no-direct-lucide-import", "ds-no-style-color-inline"] },
  { file: /components[\\/]admin[\\/]shared[\\/]/, allowedRules: ["ds-no-direct-lucide-import"] },
  { file: /components[\\/]admin[\\/]layout[\\/]/, allowedRules: ["ds-no-direct-lucide-import"] },
  // Tenant branding (store-customizer) legitimamente usa style inline para preview de colores del tenant.
  { file: /StoreCustomizer\.tsx$/, allowedRules: ["ds-no-style-color-inline", "ds-no-style-inline-any-color"] },
  { file: /StoreCreativeMode\.tsx$/, allowedRules: ["ds-no-style-color-inline", "ds-no-style-inline-any-color"] },
  { file: /ThemeCustomizer\.tsx$/, allowedRules: ["ds-no-style-color-inline", "ds-no-style-inline-any-color"] },
  // Admin token catalog — las clases hardcodeadas ARE the data (single source of truth para todo /admin).
  // El errorBanner usa rose semantico (canonical danger color) que no tiene aun un --danger token.
  { file: /admin[\\/]_components[\\/]_shared[\\/]admin-tokens\.ts$/, allowedRules: ["no-decorative-text-color"] },
  // AdminSidebar usa colores categoriales (fuchsia, pink, sky, emerald) como
  // identificadores visuales de cada módulo del panel. NO son decorativos —
  // son la convención del DS para reconocer el módulo de un golpe de vista.
  { file: /admin[\\/]layout[\\/]AdminSidebar\.tsx$/, allowedRules: ["no-decorative-text-color"] },
  // Sidebar shadow custom — sombra de glass que tiene parámetros de blur
  // específicos no cubiertos por shadow-soft/medium/strong.
  { file: /admin[\\/]shared[\\/]SidebarConfigurator\.tsx$/, allowedRules: ["no-arbitrary-shadow"] },
  // Components con gradientes funcionales legítimos del DS:
  // - LivesAdminModule: badge LIVE rojo pulsante
  // - SocioMembersAdminModule, MemberProfileDrawer, GiftCardDetailsModal: badges de tier
  // - SidebarConfigPanel: previews de gradients custom para configurar
  // - ImageUploader: preview overlay
  // - TenantsGrowthRanking: barras de crecimiento en dashboard
  // - ApplicationDetailsDrawer: avatar gradient para vendor applications
  {
    file: /admin[\\/]unified[\\/](LivesAdminModule|SocioMembersAdminModule)\.tsx$|admin[\\/]unified[\\/](gift-cards-admin|socio-admin)[\\/]|superadmin[\\/](SidebarConfigPanel|vendor-applications[\\/]ApplicationDetailsDrawer)\.tsx$|superadmin[\\/]_shared[\\/]ImageUploader\.tsx$|superadmin[\\/]dashboard[\\/]TenantsGrowthRanking\.tsx$/,
    allowedRules: ["no-decorative-gradient", "no-legacy-gradient-prefix"],
  },
  // POSPaymentModal usa el morado de marca de Yape (text-purple-*) como
  // identificador del metodo de pago — NO es decorativo, es la convencion de
  // marca que el cajero reconoce de un vistazo (Yape=morado, Plin=cyan). Mismo
  // criterio que AdminSidebar con colores categoriales. Tambien tiene el mapa
  // de colores de billetes/monedas peruanos (S/200 indigo, S/100 verde, S/50
  // violeta, S/20 naranja, S/10 celeste, S/5 amarillo, S/.50 ambar) — imitan
  // el color real del billete/moneda a propósito, para que el cajero lo
  // reconozca de un vistazo; forzarlos a tokens semánticos (success/warning/
  // error/info) rompería ese mnemonico visual sin ganar nada.
  { file: /admin[\\/]pos[\\/]POSPaymentModal\.tsx$/, allowedRules: ["no-decorative-text-color", "ds-no-decorative-color-admin"] },
  // Colores por TIPO DE ARCHIVO (PDF=rojo/Adobe, Excel=verde, Word=azul,
  // PowerPoint=naranja, zip=ambar, audio=esmeralda, video=violeta,
  // imagen=rosa, correo=celeste) — imitan a propósito el color de marca real
  // de cada extensión para que el usuario reconozca el tipo de archivo de un
  // vistazo. NO son decorativos, son la convención categorial establecida en
  // todo el hub de Documentos (mismo criterio que POSPaymentModal arriba).
  { file: /admin[\\/]documentos[\\/]archivo-visual\.tsx$/, allowedRules: ["ds-no-decorative-color-admin"] },
  { file: /admin[\\/]unified[\\/]DocumentosModule\.tsx$/, allowedRules: ["ds-no-decorative-color-admin"] },
  { file: /admin[\\/]documentos[\\/]DocumentosModule\.tsx$/, allowedRules: ["ds-no-decorative-color-admin"] },
  // ZONE_PALETTE: hash determinístico zona→color de avatar (6 paletas) para
  // distinguir zonas de reparto de un vistazo — asignación categorial
  // arbitraria, no un estado semántico (success/warning/error/info).
  { file: /admin[\\/]delivery-partners[\\/]tabs[\\/]RepartidoresTab\.tsx$/, allowedRules: ["ds-no-decorative-color-admin"] },
  // PRESETS de StampModal: paleta de "elegí el color de tu sello" (RECIBIDO,
  // CONFIDENCIAL, BORRADOR, URGENTE, etc.) — 8 sellos necesitan 8 colores
  // distinguibles, más de los 4 tokens semánticos disponibles. Es un color
  // picker, no un badge de estado.
  { file: /admin[\\/]documentos[\\/]StampModal\.tsx$/, allowedRules: ["ds-no-decorative-color-admin"] },
  // ReportsTab arma el HTML de un EMAIL (Informe Mensual) que sale del panel —
  // es contenido que el dueño lee en su bandeja, no cromo de la UI, y el email
  // necesita hex inline porque los clientes de correo no resuelven CSS vars.
  { file: /admin[\\/]ReportsTab\.tsx$/, allowedRules: ["ds-no-emoji-icon-admin"] },
];

function isAdminPath(file: string): boolean {
  const p = file.replace(/\\/g, "/");
  return p.includes("/components/admin/") || p.includes("/app/admin/");
}

function isWhitelisted(file: string, ruleId: string): boolean {
  return WHITELIST_PATTERNS.some(
    (w) => w.file.test(file) && w.allowedRules.includes(ruleId),
  );
}

function walkDir(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkDir(full, acc);
    else if (st.isFile() && (full.endsWith(".tsx") || full.endsWith(".ts"))) acc.push(full);
  }
  return acc;
}

function isInScope(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  return (
    p.includes("components/admin") ||
    p.includes("components/superadmin") ||
    p.includes("components/store") ||
    p.includes("components/ui-system") ||
    p.includes("components/customer") ||
    p.includes("app/admin/") ||
    p.includes("app/superadmin/") ||
    p.includes("app/t/")
  );
}

function getTargetFiles(): string[] {
  if (FILE_ARGS.length > 0) {
    return FILE_ARGS
      .map((f) => resolve(process.cwd(), f))
      .filter((f) => existsSync(f) && (f.endsWith(".tsx") || f.endsWith(".ts")))
      .filter(isInScope);
  }
  if (MODE_STAGED) {
    try {
      const out = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" });
      return out
        .split("\n")
        .filter((f) => f && (f.endsWith(".tsx") || f.endsWith(".ts")))
        .filter(isInScope)
        .map((f) => resolve(process.cwd(), f))
        .filter((f) => existsSync(f));
    } catch {
      return [];
    }
  }
  const roots = [
    join(process.cwd(), "components", "admin"),
    join(process.cwd(), "components", "superadmin"),
    join(process.cwd(), "components", "store"),
    join(process.cwd(), "components", "ui-system"),
    join(process.cwd(), "components", "customer"),
    join(process.cwd(), "app", "admin"),
    join(process.cwd(), "app", "superadmin"),
    join(process.cwd(), "app", "t"),
  ];
  return roots.flatMap((r) => walkDir(r));
}

type Finding = {
  file: string;
  line: number;
  col: number;
  rule: Rule;
  match: string;
};

function scan(file: string): Finding[] {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  const findings: Finding[] = [];
  const fileIsAdmin = isAdminPath(file);
  for (const rawRule of RULES) {
    if (isWhitelisted(file, rawRule.id)) continue;
    if (rawRule.adminOnly && !fileIsAdmin) continue;
    // Strict mode upgrade: cuando corremos --design-strict, las reglas con
    // strictUpgrade=true se elevan a error (CI gate duro).
    const rule: Rule =
      MODE_DESIGN_STRICT && rawRule.strictUpgrade
        ? { ...rawRule, severity: "error" }
        : rawRule;
    lines.forEach((line, idx) => {
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        findings.push({ file, line: idx + 1, col: m.index + 1, rule, match: m[0] });
      }
    });
  }
  return findings;
}

function main(): void {
  const files = getTargetFiles();
  const all: Finding[] = [];
  for (const f of files) all.push(...scan(f));

  const errors = all.filter((f) => f.rule.severity === "error");
  const warnings = all.filter((f) => f.rule.severity === "warning");

  if (all.length === 0) {
    console.log(`Design tokens clean: 0 violations in ${files.length} files`);
    process.exit(0);
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of all) {
    const arr = byFile.get(f.file) ?? [];
    arr.push(f);
    byFile.set(f.file, arr);
  }

  for (const [file, list] of byFile) {
    const rel = file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
    console.log(`\n${rel}`);
    for (const f of list) {
      const prefix = f.rule.severity === "error" ? "ERROR" : "WARN ";
      console.log(`  [${prefix}] line ${f.line}:${f.col} — ${f.rule.id}`);
      console.log(`          match: ${f.match}`);
      console.log(`          ${f.rule.message}`);
    }
  }

  console.log("\n---");
  console.log(`Total: ${errors.length} errors, ${warnings.length} warnings, ${byFile.size} files`);

  if (MODE_WARN) process.exit(0);
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
