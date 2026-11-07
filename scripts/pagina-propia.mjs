#!/usr/bin/env node
/**
 * scripts/pagina-propia.mjs — crea la «página propia» de un negocio (ADR-458).
 *
 *   npm run pagina-propia -- crear <id> "<nombre visible>"
 *
 * Crea `extensiones/<id>/` con:
 *   · manifest.ts  — enchufe `tienda.pagina`, opciones vacías `.strict()`.
 *   · servidor.tsx — `Pagina` que dibuja `<PaginaGeneral>`: arranca IDÉNTICA.
 *   · LEEME.md     — cómo cambiarla.
 * y suma sus líneas bajo el ancla «páginas propias» de `registro.servidor.ts`
 * y `registro.cliente.ts` (los dos registros hablan de las mismas piezas: lo
 * mide `__tests__/piezas-contrato.test.ts`).
 *
 * La página se CREA en el código; el superadmin sólo la prende o apaga para UN
 * negocio (la asignación a un segundo negocio da 409). El id del negocio nunca
 * va en estos archivos.
 *
 * `PAGINA_PROPIA_RAIZ` cambia la raíz del repo (lo usan los tests, sobre una copia).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = process.env.PAGINA_PROPIA_RAIZ
  ? path.resolve(process.env.PAGINA_PROPIA_RAIZ)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(RAIZ, "extensiones");
const REG_SERVIDOR = path.join(EXT, "registro.servidor.ts");
const REG_CLIENTE = path.join(EXT, "registro.cliente.ts");

const ANCLA_IMPORTS = "// ── páginas propias (imports) ──";
const ANCLA_LISTA = "// ── páginas propias ──";

/** kebab-case que empieza con letra (así el nombre en camelCase es un identificador válido). */
const ID_VALIDO = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function fallar(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

function ayuda() {
  console.log('Uso: npm run pagina-propia -- crear <id> "<nombre visible>"');
  console.log('  Ej.: npm run pagina-propia -- crear pagina-pollos-dorado "Pollería El Dorado"');
}

const aCamel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Palabras que no pueden ser un nombre en `import { manifiesto as <nombre> }`. */
const RESERVADAS = new Set(
  ("break case catch class const continue debugger default delete do else enum export extends false finally for " +
    "function if import in instanceof new null return super switch this throw true try typeof var void while with " +
    "yield let static implements interface package private protected public await").split(" "),
);

/**
 * Inserta `nuevas` al final del bloque que abre `ancla` (las líneas seguidas,
 * hasta la primera vacía, el cierre de la lista o la siguiente ancla).
 */
function insertarBajoAncla(texto, ancla, nuevas, archivo) {
  const lineas = texto.split("\n");
  const i = lineas.findIndex((l) => l.trim() === ancla);
  if (i === -1) fallar(`${path.relative(RAIZ, archivo)} no tiene el ancla «${ancla}».`);
  let j = i + 1;
  while (j < lineas.length) {
    const t = lineas[j].trim();
    if (t === "" || t === "];" || t === "};" || t.startsWith("// ──")) break;
    j++;
  }
  lineas.splice(j, 0, ...nuevas);
  return lineas.join("\n");
}

function manifiestoTs(id, nombre) {
  return `/**
 * Página propia ${JSON.stringify(nombre)} — manifiesto (ADR-458, enchufe \`tienda.pagina\`).
 *
 * La página pública ENTERA de \`/t/<negocio>\` para UN solo negocio: el
 * superadmin la prende en la ficha del negocio y nadie más puede tenerla. El
 * negocio NO se escribe acá (la asignación vive en la tabla \`TenantPieza\`).
 * Cómo cambiarla: LEEME.md de esta carpeta.
 */
import { z } from "zod";
import type { ManifiestoPieza } from "../_contrato";

/** Sin opciones: lo que cambia esta página se escribe en \`servidor.tsx\`. */
export const opciones = z.object({}).strict();

export type Opciones = z.output<typeof opciones>;

export const manifiesto = {
  id: ${JSON.stringify(id)},
  nombre: ${JSON.stringify(nombre)},
  descripcion:
    "Página pública propia de UN negocio: reemplaza su página entera (/t/<negocio>). " +
    "Arranca igual a la general y se cambia en el código. Si falla, se ve la general.",
  version: "1.0.0",
  enchufes: ["tienda.pagina"],
  opciones,
} as const satisfies ManifiestoPieza<typeof opciones>;
`;
}

function servidorTsx(nombre) {
  return `/**
 * Página propia ${JSON.stringify(nombre)} — la página entera (enchufe \`tienda.pagina\`, ADR-458).
 *
 * Arranca IDÉNTICA a la general: dibuja \`<PaginaGeneral>\`. Lo que el negocio
 * pida se cambia acá (ver LEEME.md).
 *
 * Qué pasa si falla: si \`Pagina\` tira o tarda más de 2 s en DEVOLVER, el
 * negocio ve la página general (y avisa a Sentry). Lo que se dibuja adentro no
 * tiene tope: si un componente hijo falla, el navegador recarga la general
 * (\`?sinPiezas=1\`); si tarda, tarda la página.
 *
 * \`ctx\` (el negocio) lo pone el sistema desde la URL; nunca lo elijas acá.
 */
import "server-only";
import { PaginaGeneral } from "@/components/store/pagina-publica/PaginaGeneral";
import type { PiezaPagina } from "../_contrato";
import type { Opciones } from "./manifest";

export const pagina: PiezaPagina<Opciones> = {
  Pagina({ ctx, searchParams }) {
    return <PaginaGeneral slug={ctx.slug} searchParams={searchParams} />;
  },
};
`;
}

function leeme(id, nombre) {
  return `# Página propia «${nombre}» (\`${id}\`)

La página pública **entera** (\`/t/<negocio>\`) de **un solo negocio** (ADR-458). Arranca idéntica a
la general: \`servidor.tsx\` dibuja \`<PaginaGeneral>\`. Lo que cambies acá lo ve sólo ese negocio.

## Prenderla
1. Publica el código (revisión + deploy, como cualquier cambio).
2. Superadmin → «Qué tiene cada negocio» → la fila del negocio → «Página propia» → prender.
   Es de un solo negocio: asignarla a otro da «Esta página es de …».

## Cambiarla, de menos a más
1. **Agregar arriba o abajo** (un aviso, una franja, una sección nueva): envuelve la general.
   \`\`\`tsx
   Pagina({ ctx, searchParams }) {
     return (
       <>
         <AvisoDeTemporada />
         <PaginaGeneral slug={ctx.slug} searchParams={searchParams} />
       </>
     );
   }
   \`\`\`
   Sigue recibiendo las mejoras de la general. Datos: por \`lib/db/*.db.ts\` con \`ctx.tenantId\`.
2. **Ajustar una sección** (sección por sección): cada una lleva \`data-pb\` (\`announcement\`, \`trust\`,
   \`promos\`, \`featured\`, \`info\`, \`custom:<id>\`). Envuelve la general en un \`<div data-pagina="${id}">\`
   y escribe estilos sólo para \`[data-pagina="${id}"] [data-pb="featured"]\`, con tokens del DS.
   Ocultar o reordenar secciones NO es código: el dueño lo hace en Mi Tienda.
3. **Cambio profundo**: copia \`components/store/pagina-publica/PaginaGeneral.tsx\` a esta carpeta y
   dibuja la copia. **La copia deja de recibir las mejoras de la general**: hazlo sólo si 1 y 2 no
   alcanzan. Las reglas de piezas valen para la copia (sin \`process.env\`, sin \`prisma\`): los
   \`process.env.NEXT_PUBLIC_*\` que trae van como constantes de un módulo fuera de \`extensiones/\`.

## Reglas
- Qué cubre el respaldo, exacto: si \`Pagina\` tira o tarda más de 2 s en **devolver** (sus \`await\` de
  arriba), se ve la general y avisa a Sentry. Lo que se dibuja **adentro** (componentes hijos) no tiene
  tope: si uno falla, el navegador recarga la general (\`?sinPiezas=1\`); si uno tarda, tarda la página.
  Lee los datos lentos arriba, en \`Pagina\`, para que el tope los cubra. Pruébala en \`main\`.
- Nada de ids ni slugs de negocios en el código; el negocio llega en \`ctx\`.
- Tokens del DS, sin hex; tuteo; misma revisión y tests que el resto.
`;
}

function crear(id, nombre) {
  if (!id || !ID_VALIDO.test(id) || id.length > 60) {
    fallar(`El id «${id ?? ""}» no sirve: kebab-case que empiece con letra (p. ej. pagina-pollos-dorado), hasta 60.`);
  }
  const visible = (nombre ?? "").trim();
  if (!visible) fallar('Falta el nombre visible: npm run pagina-propia -- crear <id> "<nombre visible>"');
  if (visible.length > 80) fallar("El nombre visible pasa de 80 letras.");

  const carpeta = path.join(EXT, id);
  if (existsSync(carpeta)) fallar(`Ya existe extensiones/${id}/: elige otro id.`);
  if (!existsSync(REG_SERVIDOR) || !existsSync(REG_CLIENTE)) fallar("No encuentro los registros de extensiones/.");

  const servidor = readFileSync(REG_SERVIDOR, "utf8");
  const cliente = readFileSync(REG_CLIENTE, "utf8");
  const camel = aCamel(id);
  if (RESERVADAS.has(camel)) fallar(`El id «${id}» es una palabra reservada de JavaScript: elige otro.`);
  for (const [archivo, txt] of [
    [REG_SERVIDOR, servidor],
    [REG_CLIENTE, cliente],
  ]) {
    if (txt.includes(`"./${id}/`)) fallar(`${path.relative(RAIZ, archivo)} ya nombra a «${id}».`);
    // Cualquier aparición, no sólo declaraciones: `pieza-servidor` → `piezaServidor` choca con la
    // función del registro (TS2300) aunque nadie la «declare» con ese nombre.
    if (new RegExp(`\\b${camel}\\b`).test(txt)) {
      fallar(`${path.relative(RAIZ, archivo)} ya usa el nombre «${camel}»: elige otro id.`);
    }
  }

  const nuevoServidor = insertarBajoAncla(
    insertarBajoAncla(
      servidor,
      ANCLA_IMPORTS,
      [`import { manifiesto as ${camel} } from "./${id}/manifest";`],
      REG_SERVIDOR,
    ),
    ANCLA_LISTA,
    // Perezosa: la página trae la general entera y sólo se carga para el negocio que la tiene.
    [`  piezaServidor(${camel}, { pagina: () => import("./${id}/servidor").then((m) => m.pagina) }),`],
    REG_SERVIDOR,
  );
  const nuevoCliente = insertarBajoAncla(
    insertarBajoAncla(cliente, ANCLA_IMPORTS, [`import { manifiesto as ${camel} } from "./${id}/manifest";`], REG_CLIENTE),
    ANCLA_LISTA,
    [`  [${camel}.id]: piezaCliente(${camel}),`],
    REG_CLIENTE,
  );

  mkdirSync(carpeta);
  try {
    writeFileSync(path.join(carpeta, "manifest.ts"), manifiestoTs(id, visible));
    writeFileSync(path.join(carpeta, "servidor.tsx"), servidorTsx(visible));
    writeFileSync(path.join(carpeta, "LEEME.md"), leeme(id, visible));
    writeFileSync(REG_SERVIDOR, nuevoServidor);
    writeFileSync(REG_CLIENTE, nuevoCliente);
  } catch (err) {
    // A medias no sirve: se deshace todo lo escrito.
    rmSync(carpeta, { recursive: true, force: true });
    writeFileSync(REG_SERVIDOR, servidor);
    writeFileSync(REG_CLIENTE, cliente);
    fallar(`No se pudo crear la página: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`✓ Página propia «${visible}» creada en extensiones/${id}/ (idéntica a la general).`);
  console.log("  Siguiente: cámbiala en servidor.tsx (LEEME.md), publícala y préndela para UN negocio desde el superadmin.");
}

const [comando, id, nombre] = process.argv.slice(2);
if (comando === "crear") crear(id, nombre);
else {
  ayuda();
  process.exit(comando ? 1 : 0);
}
