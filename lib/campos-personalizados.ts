/**
 * Campos personalizados — las preguntas que el negocio inventa (ADR-427).
 *
 * Brandon (2026-09-21): «que se puedan crear campos de forma personalizada, con
 * la opción de ponerlo temporal para ese modal o permanente para ese modal y
 * otros registros; crear personalizado y reutilizar campos, ponerle nombre y
 * para qué es».
 *
 * ## Por qué existe
 *
 * Ningún formulario alcanza para siempre: aparece un dato que este negocio
 * necesita y el sistema no previó —el nombre del apuntador, el color de la
 * cinta, el número de una orden interna—. Hasta hoy eso terminaba en el campo
 * «Observaciones», donde no se puede buscar, ni sumar, ni saber qué se esperaba
 * ahí seis meses después.
 *
 * ## Las dos vidas de un campo
 *
 * · **Temporal** — vale sólo para ESE registro. Sirve para la excepción («este
 *   ingreso vino con una observación del transportista»). No ensucia el
 *   formulario de los demás.
 * · **Permanente** — queda en ese formulario y aparece en todos los registros
 *   que se carguen después. Es una pregunta que el negocio adoptó.
 *
 * La diferencia es UNA columna (`soloParaRegistroId`), y se elige al crear el
 * campo: quien lo inventa sabe si es la excepción o la regla.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import type { AdminRole } from "@/lib/session";

// ── Tipos de campo ──────────────────────────────────────────────────────────

/**
 * Seis tipos, no veinte. Cada uno existe porque cambia cómo se escribe el dato
 * y qué se puede hacer con él después; un catálogo más largo sólo haría elegir
 * mal.
 */
export const TIPOS_CAMPO = ["texto", "numero", "fecha", "opcion", "si_no", "nota"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export const TIPO_CAMPO_LABEL: Record<TipoCampo, string> = {
  texto: "Texto corto",
  numero: "Número",
  fecha: "Fecha",
  opcion: "Elegir de una lista",
  si_no: "Sí o no",
  nota: "Texto largo",
};

/** Qué se gana con cada tipo, para que la elección no sea a ciegas. */
export const TIPO_CAMPO_AYUDA: Record<TipoCampo, string> = {
  texto: "Un nombre, un código, una referencia corta",
  numero: "Se puede sumar y ordenar después",
  fecha: "Se puede ordenar y comparar con otras fechas",
  opcion: "Elegir es más rápido que tipear, y no se escribe distinto cada vez",
  si_no: "Una marca: se cumplió o no",
  nota: "Varias líneas, para lo que no entra en una",
};

export function esTipoCampo(v: string): v is TipoCampo {
  return (TIPOS_CAMPO as readonly string[]).includes(v);
}

// ── La definición y su valor ────────────────────────────────────────────────

export interface CampoPersonalizado {
  id: string;
  formulario: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoCampo;
  opciones: string[];
  /** `null` = permanente. Con id, el campo vive sólo en ese registro. */
  soloParaRegistroId: string | null;
  orden: number;
  activo: boolean;
}

export interface ValorDeCampo {
  campoId: string;
  valor: string | null;
  valorNum: number | null;
  valorFecha: string | null;
}

/** Un campo permanente aparece en todos los registros de su formulario. */
export const esPermanente = (c: Pick<CampoPersonalizado, "soloParaRegistroId">): boolean =>
  c.soloParaRegistroId == null;

// ── Qué formulario es cuál ──────────────────────────────────────────────────

/**
 * Los formularios que ya usan campos personalizados, con su nombre en pantalla.
 *
 * El id (`forestal.plan`) es estable y va a la base; el nombre es lo que lee una
 * persona. Sin esto, «reutilizar un campo de otro formulario» mostraría
 * `directorio.parte` y nadie sabría de dónde viene la pregunta.
 *
 * Es un catálogo abierto a propósito: un formulario que todavía no está acá
 * funciona igual (se muestra su id), así que sumar un modal nuevo no obliga a
 * tocar este archivo antes de probar.
 */
export const FORMULARIOS: Record<string, string> = {
  "forestal.plan": "Plan de manejo (Libro TH)",
  "directorio.parte": "Ficha del Directorio",
  "forestal.ingreso": "Ingreso de madera",
  "forestal.permiso": "Permiso / contrato",
  "forestal.despacho": "Despacho y guía",
  "forestal.lote": "Lote de aserrío",
  "adelantos.adelanto": "Adelanto",
};

/** El nombre del formulario, o su id si todavía no está en el catálogo. */
export const nombreDelFormulario = (id: string): string => FORMULARIOS[id] ?? id;

// ── Quién puede ver y llenar cada formulario ────────────────────────────────

/**
 * De qué módulo sale cada formulario, y qué roles pueden verlo y llenarlo.
 *
 * Hasta el 2026-09-21 los roles eran UNA lista global en las dos rutas del API:
 * quien podía contestar un campo los podía contestar TODOS. La auditoría lo
 * probó — un `cajero` leyó «DNI del titular» de `forestal.plan`, un formulario
 * de un módulo que ni siquiera puede abrir. La pregunta correcta no es «¿este
 * rol usa campos personalizados?» sino «¿este rol entra al módulo de ESTE
 * formulario?».
 *
 * Cada entrada es el **espejo del `allowedRoles`** que la ruta dueña del
 * registro le pasa a `requireAdmin` (mismo criterio que
 * `lib/auth/roles-rutas-panel.ts`, que ya hace esto para las rutas del panel).
 * Un campo personalizado no puede ser una puerta más ancha que el formulario
 * del que cuelga.
 *
 * **Un formulario que no está acá NO queda bloqueado**: ver `puedeLeerFormulario`.
 */
export interface ModuloDeFormulario {
  /** El módulo dueño del registro. Es lo que se nombra en el 403. */
  modulo: string;
  /** Espejo del `allowedRoles` del GET de la ruta dueña. */
  rolesLectura: readonly AdminRole[];
  /** Espejo del `allowedRoles` del POST/PUT/PATCH de la ruta dueña. */
  rolesEscritura: readonly AdminRole[];
}

export const MODULO_POR_FORMULARIO: Record<string, ModuloDeFormulario> = {
  // app/api/admin/forestal/plan/route.ts:70 (GET) · :114/:138/:165 (escritura)
  "forestal.plan": {
    modulo: "Plan de manejo (Libro TH)",
    rolesLectura: ["admin", "almacenero", "owner"],
    rolesEscritura: ["admin", "owner"],
  },
  // app/api/admin/forestal/directorio/route.ts:33 (GET) · :78 (POST/PUT)
  "directorio.parte": {
    modulo: "Directorio",
    rolesLectura: ["admin", "almacenero", "owner"],
    rolesEscritura: ["admin", "almacenero", "owner"],
  },
  // app/api/admin/forestal/wood-entries/route.ts:192 (GET) · :383 (escritura)
  "forestal.ingreso": {
    modulo: "Ingresos del Libro CTP",
    rolesLectura: ["admin", "almacenero", "owner"],
    rolesEscritura: ["admin", "almacenero", "owner"],
  },
  // app/api/admin/forestal/contratos/route.ts:60 (GET) · :90 (POST)
  "forestal.permiso": {
    modulo: "Permisos y contratos",
    rolesLectura: ["admin", "almacenero", "owner"],
    rolesEscritura: ["admin", "owner"],
  },
  // app/api/admin/forestal/gtf/route.ts:63 (GET) · :101/:128 (escritura)
  "forestal.despacho": {
    modulo: "Despacho y guías",
    rolesLectura: ["admin", "almacenero", "owner"],
    rolesEscritura: ["admin", "owner"],
  },
  // app/api/admin/forestal/lotes-aserrio/route.ts:253 (`guard`, mismo default
  // para GET, POST y PATCH).
  "forestal.lote": {
    modulo: "Lotes de aserrío",
    rolesLectura: ["admin", "almacenero", "owner"],
    rolesEscritura: ["admin", "almacenero", "owner"],
  },
  /* `adelantos.adelanto` NO está acá a propósito: app/api/adelantos/route.ts:53
     llama `requireAdmin(req)` **sin** lista de roles, o sea que el módulo se
     abre para cualquier rol del panel. Inventarle una lista acá haría el campo
     personalizado más estricto que el adelanto del que cuelga, y dejaría afuera
     a quien sí puede editar el registro. Si mañana esa ruta se acota, esta
     entrada se agrega con los mismos roles. */
};

/** Espejo de `managementTier` en lib/require-admin.ts — no reordenar sin mirar ahí. */
const MANAGEMENT_TIER: readonly AdminRole[] = ["admin", "owner", "manager"];

/**
 * ¿Este rol puede ver / llenar los campos de este formulario?
 *
 * Tres reglas, en orden:
 *
 * 1. **Management tier pasa siempre** (admin/owner/manager), igual que en
 *    `requireAdmin`: si acá fuera más estricto, el dueño vería huecos en
 *    pantalla que el servidor sí le contesta.
 * 2. **Formulario sin entrada = se permite.** Es el default elegido a
 *    conciencia: el motor se va cableando modal por modal (ADR-427, 174
 *    candidatos) y exigir mapa convertiría cada pantalla nueva en un 403 que
 *    nadie entiende. El costo de permitir es acotado —el `campoId` ya se valida
 *    contra el tenant y el rol ya pasó por `requireAdmin`—; el costo de
 *    bloquear es romper lo que hoy anda.
 * 3. Con entrada, manda la lista del módulo dueño.
 */
function puedeEnFormulario(
  rol: AdminRole | null | undefined,
  formulario: string,
  accion: "leer" | "escribir",
): boolean {
  if (!rol) return false;
  if (MANAGEMENT_TIER.includes(rol)) return true;
  const modulo = MODULO_POR_FORMULARIO[formulario];
  if (!modulo) return true;
  const roles = accion === "leer" ? modulo.rolesLectura : modulo.rolesEscritura;
  return roles.includes(rol);
}

export const puedeLeerFormulario = (rol: AdminRole | null | undefined, formulario: string): boolean =>
  puedeEnFormulario(rol, formulario, "leer");

export const puedeEscribirFormulario = (rol: AdminRole | null | undefined, formulario: string): boolean =>
  puedeEnFormulario(rol, formulario, "escribir");

// ── Claves ──────────────────────────────────────────────────────────────────

/**
 * El slug con el que se lee por código: minúsculas, sin tildes, con guiones.
 *
 * Se deriva del nombre para que nadie tenga que inventarlo, y es estable: si
 * después se renombra el campo en pantalla, la clave no cambia y lo guardado
 * sigue encontrándose.
 */
export function claveDesdeNombre(nombre: string): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Qué está mal con el nombre propuesto, o `null` si sirve.
 *
 * Dos campos con el mismo nombre en el mismo formulario harían elegir al azar
 * entre dos preguntas iguales, así que se avisa antes de crear.
 */
export function motivoNombreInvalido(
  nombre: string,
  existentes: readonly Pick<CampoPersonalizado, "clave" | "nombre">[],
): string | null {
  const limpio = (nombre ?? "").trim();
  if (limpio.length < 2) return "Ponele un nombre de al menos dos letras: es lo que se va a ver en el formulario.";
  if (limpio.length > 60) return "El nombre es muy largo para una etiqueta: usá hasta 60 caracteres.";
  const clave = claveDesdeNombre(limpio);
  if (!clave) return "Ese nombre no deja ninguna letra ni número para identificarlo.";
  if (existentes.some((c) => c.clave === clave)) {
    return `Ya existe un campo «${existentes.find((c) => c.clave === clave)?.nombre}» en este formulario.`;
  }
  return null;
}

// ── Valores ─────────────────────────────────────────────────────────────────

/**
 * Lo escrito, partido en las tres columnas que guarda la base.
 *
 * El texto se guarda SIEMPRE (es lo que se muestra tal cual). El número y la
 * fecha se guardan además en su columna tipada, para poder sumarlos y
 * ordenarlos sin parsear texto en cada consulta. Un valor que no se puede
 * convertir **no se inventa**: queda sólo como texto, y quien lo lea sabrá que
 * ese registro no tiene número.
 */
export function partirValor(tipo: TipoCampo, crudo: string | null | undefined): Omit<ValorDeCampo, "campoId"> {
  const texto = (crudo ?? "").trim();
  if (!texto) return { valor: null, valorNum: null, valorFecha: null };
  if (tipo === "numero") {
    const n = Number(texto.replace(",", "."));
    return { valor: texto, valorNum: Number.isFinite(n) ? n : null, valorFecha: null };
  }
  if (tipo === "fecha") {
    const ok = /^\d{4}-\d{2}-\d{2}/.test(texto);
    return { valor: texto, valorNum: null, valorFecha: ok ? `${texto.slice(0, 10)}T00:00:00.000Z` : null };
  }
  return { valor: texto, valorNum: null, valorFecha: null };
}

/**
 * Qué está mal con lo que se escribió, o `null` si está bien.
 *
 * **Nada es obligatorio**: un campo personalizado que bloquea el guardado
 * convertiría una ayuda en una traba, y el registro de verdad —el ingreso, el
 * plan— importa más que la pregunta que alguien agregó. Sólo se avisa cuando lo
 * escrito no es lo que el tipo dice.
 */
export function motivoValorInvalido(campo: Pick<CampoPersonalizado, "tipo" | "opciones">, crudo: string): string | null {
  const texto = (crudo ?? "").trim();
  if (!texto) return null;
  if (campo.tipo === "numero" && !Number.isFinite(Number(texto.replace(",", ".")))) {
    return "Eso no es un número.";
  }
  if (campo.tipo === "fecha" && !/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return "La fecha va como año-mes-día.";
  }
  if (campo.tipo === "opcion" && campo.opciones.length > 0 && !campo.opciones.includes(texto)) {
    return "Elegí una de las opciones de la lista.";
  }
  return null;
}

/** Cómo se lee un valor en pantalla cuando sólo se muestra (no se edita). */
export function textoDelValor(campo: Pick<CampoPersonalizado, "tipo">, v: Pick<ValorDeCampo, "valor"> | null | undefined): string {
  const texto = v?.valor?.trim();
  if (!texto) return "—";
  if (campo.tipo === "si_no") return texto === "si" ? "Sí" : texto === "no" ? "No" : texto;
  if (campo.tipo === "fecha" && /^\d{4}-\d{2}-\d{2}/.test(texto)) {
    /* Dos dígitos, como el resto del libro (`fmtFechaCorta` de contratos-ui):
       «4/3/2026» y «04/03/2026» en la misma pantalla se leen como dos formatos
       distintos del mismo dato. Y en UTC, porque las fechas del libro son
       date-only y en Lima se correrían un día. */
    return new Date(`${texto.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString("es-PE", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return texto;
}

// ── Qué campos se muestran en un registro ───────────────────────────────────

/**
 * Los campos que van en ESTE registro, en orden: los permanentes del formulario
 * más los temporales de este registro. Los temporales van al final, porque son
 * la excepción y no deberían empujar hacia abajo lo que se pregunta siempre.
 */
export function camposDelRegistro(
  todos: readonly CampoPersonalizado[],
  registroId: string | null | undefined,
): CampoPersonalizado[] {
  const vivos = todos.filter((c) => c.activo);
  const permanentes = vivos.filter(esPermanente);
  const temporales = registroId ? vivos.filter((c) => c.soloParaRegistroId === registroId) : [];
  const porOrden = (a: CampoPersonalizado, b: CampoPersonalizado) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es");
  return [...permanentes.sort(porOrden), ...temporales.sort(porOrden)];
}

/**
 * Los campos de OTROS formularios que se pueden reutilizar acá.
 *
 * Reutilizar es copiar la pregunta, no compartir la respuesta: cada formulario
 * guarda lo suyo. Se ofrecen sólo los permanentes —un campo temporal es la
 * excepción de un registro y no tiene sentido adoptarlo en otra pantalla— y se
 * deduplica por clave para no ofrecer dos veces la misma pregunta.
 */
export function reutilizables(
  todos: readonly CampoPersonalizado[],
  formularioActual: string,
): CampoPersonalizado[] {
  const yaEstan = new Set(todos.filter((c) => c.formulario === formularioActual).map((c) => c.clave));
  const vistos = new Set<string>();
  return todos
    .filter((c) => c.activo && esPermanente(c) && c.formulario !== formularioActual && !yaEstan.has(c.clave))
    .filter((c) => (vistos.has(c.clave) ? false : (vistos.add(c.clave), true)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
