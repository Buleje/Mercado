import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import {
  camposDelRegistro,
  claveDesdeNombre,
  esTipoCampo,
  nombreDelFormulario,
  partirValor,
  reutilizables as reutilizablesPuros,
  type CampoPersonalizado,
  type TipoCampo,
  type ValorDeCampo,
} from "@/lib/campos-personalizados";

/**
 * CamposPersonalizadosDB — la capa de datos de los campos que inventa el
 * negocio (ADR-427).
 *
 * `tenantId` SIEMPRE 1er parámetro y SIEMPRE en el WHERE: un campo temporal
 * lleva el id de un registro que este módulo no conoce (`soloParaRegistroId`
 * no tiene FK, el campo puede colgar de cualquier modelo), así que el id solo
 * NUNCA alcanza para decidir si algo es de este negocio.
 *
 * ## Qué decide esta clase y qué no
 *
 * La forma de la pregunta (clave, orden, qué campos ve un registro) la decide
 * `lib/campos-personalizados.ts`, que es puro y está testeado aparte. Acá sólo
 * se traduce a filas: se consulta acotado al tenant, se ordena con la función
 * pura y se guarda lo que ella partió. Reimplementar `claveDesdeNombre` o
 * `partirValor` acá haría que la pantalla y la base derivaran distinto del
 * mismo nombre — y lo guardado dejaría de encontrarse.
 *
 * ## Auditoría
 *
 * Usa `logActivity` (el audit genérico del repo, tabla `ActivityLog`): estos
 * campos cuelgan de cualquier módulo, así que no corresponde el vocabulario
 * cerrado de `ctp-audit`, que es del Libro CTP. Los valores se auditan **por
 * tanda**, no por celda: una guardada de formulario es UN evento.
 */

const CACHE_PREFIX = "campos-personalizados";
/** Las definiciones cambian cuando alguien inventa un campo: no son hot data. */
const TTL_DEFINICIONES = 60;

/** Tope defensivo: un formulario con más de esto ya no es un formulario. */
const MAX_CAMPOS = 500;

/**
 * Cuántas preguntas soporta un formulario antes de dejar de ser un formulario.
 *
 * No es un límite técnico: es de diseño. La auditoría de seguridad metió **96
 * campos permanentes** en `forestal.plan` con 120 POST en 17 segundos, y cada
 * uno lo ve TODO el tenant en TODOS los registros. Un modal con noventa
 * preguntas inventadas no lo usa nadie, y no hay baja masiva para deshacerlo.
 *
 * Los temporales no cuentan contra este tope: viven en un registro y se van con
 * él, así que no ensucian la pantalla de los demás.
 */
const MAX_CAMPOS_POR_FORMULARIO = 50;

/** El formulario ya tiene todas las preguntas permanentes que soporta. */
export class DemasiadosCamposError extends Error {
  constructor(public readonly cuantos: number) {
    super(
      `Este formulario ya tiene ${cuantos} campos personalizados, que es el máximo. Apagá o dá de baja alguno antes de agregar otro.`,
    );
    this.name = "DemasiadosCamposError";
  }
}

/**
 * La misma pregunta, dos veces, en el mismo formulario.
 *
 * La ruta la traduce a **409 con el nombre del que ya está**, no a un 500: es
 * un dato repetido, no una falla. El chequeo es más estricto que el índice
 * único de la base (`tenantId, formulario, clave, soloParaRegistroId`) a
 * propósito: un campo temporal con la clave de un permanente no choca en
 * Postgres, pero en pantalla serían dos etiquetas iguales en el mismo registro.
 */
export class ClaveDuplicadaError extends Error {
  constructor(public readonly existente: { id: string; nombre: string }) {
    super(`Ya existe un campo «${existente.nombre}» en este formulario.`);
    this.name = "ClaveDuplicadaError";
  }
}

/**
 * El `registroId` no existe en este negocio.
 *
 * La auditoría de seguridad del 2026-09-21 escribió cinco valores contra
 * `qasec-bomba-0..4` —ids inventados— y el servidor respondió 200 las cinco
 * veces: filas colgando de registros que no existen, sin techo. No era una
 * filtración (la fila nace con su `tenantId`), pero un dato que no se puede
 * atar a nada es basura que nadie va a poder limpiar.
 */
export class RegistroDesconocidoError extends Error {
  constructor(
    public readonly formulario: string,
    public readonly registroId: string,
  ) {
    super(`No hay ningún registro «${registroId}» de ${formulario} en este negocio.`);
    this.name = "RegistroDesconocidoError";
  }
}

/**
 * Cómo se verifica que un `registroId` existe, según de qué formulario viene.
 *
 * El `formulario` dice de qué pantalla es el campo, y de ahí sale a qué tabla
 * pertenece el id. No hay FK: `registroId` cuelga de cualquier modelo (por eso
 * es un String suelto), así que la única forma de saber si el id es real es
 * preguntarle a la tabla dueña — siempre **con `tenantId` en el WHERE**, que es
 * lo que hace que el id de otro negocio tampoco valga.
 *
 * `count` y no `findFirst`: no se necesita la fila, sólo si está.
 *
 * **No se filtra por `deletedAt`** a propósito: la pregunta es «¿esta fila
 * existe en este negocio?», no «¿está activa?». Varios módulos dan de baja
 * lógica y siguen dejando abrir la ficha (el Directorio, sin ir más lejos);
 * exigir que esté viva rompería ese camino sin cerrar ningún hueco.
 */
const EXISTE_REGISTRO: Record<string, (tenantId: string, registroId: string) => Promise<boolean>> = {
  "forestal.plan": async (tenantId, id) => (await prisma.forestPlan.count({ where: { id, tenantId } })) > 0,
  "directorio.parte": async (tenantId, id) => (await prisma.forestParty.count({ where: { id, tenantId } })) > 0,
  "forestal.ingreso": async (tenantId, id) => (await prisma.woodEntry.count({ where: { id, tenantId } })) > 0,
  "forestal.permiso": async (tenantId, id) => (await prisma.forestContrato.count({ where: { id, tenantId } })) > 0,
  "forestal.lote": async (tenantId, id) => (await prisma.forestLoteAserrio.count({ where: { id, tenantId } })) > 0,
  /* Sin entrada, a propósito (2026-09-21):
     · `forestal.despacho` — «despacho y guía» puede ser un `ForestGtf` o el
       asiento de salida del CTP (`ForestCtpEntry`); el modal todavía no está
       cableado y adivinar la tabla equivocada rechazaría guardados legítimos.
     · `adelantos.adelanto` — falta saber si el registro es el `Adelanto` o el
       `AdelantoBeneficiario` de la ficha.
     Cuando se cablee cada modal se agrega su línea acá: es UNA línea. */
};

/**
 * ¿Ese registro existe en este negocio?
 *
 * **Un formulario sin entrada en el mapa NO se bloquea.** Es el default
 * elegido: el motor se cablea modal por modal (ADR-427, 174 candidatos) y
 * exigir mapa haría que el primer guardado de cada pantalla nueva rebotara con
 * un error que nadie sabría leer — se rompería lo que hoy anda para tapar un
 * hueco que no filtra nada. Queda el aviso en el log, que es lo que después
 * dice qué formulario falta mapear.
 */
async function registroExiste(
  tenantId: string,
  formulario: string,
  registroId: string,
): Promise<boolean> {
  const verificar = EXISTE_REGISTRO[formulario];
  if (!verificar) {
    logger.warn("[campos-personalizados] formulario sin verificación de registro — se guarda sin comprobar", {
      formulario,
      tenantId,
    });
    return true;
  }
  return verificar(tenantId, registroId);
}

export interface CampoNuevo {
  formulario: string;
  nombre: string;
  descripcion?: string | null;
  tipo: TipoCampo;
  opciones?: string[];
  /** Con id = temporal (vive sólo en ese registro). `null`/ausente = permanente. */
  soloParaRegistroId?: string | null;
}

export interface CampoPatch {
  nombre?: string;
  descripcion?: string | null;
  opciones?: string[];
  orden?: number;
  activo?: boolean;
}

export interface ValorEntrante {
  campoId: string;
  valor: string | null;
}

// ── Mapeo fila → tipo del módulo puro ───────────────────────────────────────

type CampoRow = {
  id: string;
  formulario: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  opciones: string[];
  soloParaRegistroId: string | null;
  orden: number;
  activo: boolean;
};

/** `tipo` es un String en la base; si llegara algo desconocido se lee como
 *  texto en vez de romper la pantalla entera por una fila. */
function aCampo(r: CampoRow): CampoPersonalizado {
  return {
    id: r.id,
    formulario: r.formulario,
    clave: r.clave,
    nombre: r.nombre,
    descripcion: r.descripcion,
    tipo: esTipoCampo(r.tipo) ? r.tipo : "texto",
    opciones: r.opciones,
    soloParaRegistroId: r.soloParaRegistroId,
    orden: r.orden,
    activo: r.activo,
  };
}

const SELECT_CAMPO = {
  id: true,
  formulario: true,
  clave: true,
  nombre: true,
  descripcion: true,
  tipo: true,
  opciones: true,
  soloParaRegistroId: true,
  orden: true,
  activo: true,
} as const;

function aValor(r: {
  campoId: string;
  valor: string | null;
  valorNum: Prisma.Decimal | null;
  valorFecha: Date | null;
}): ValorDeCampo {
  return {
    campoId: r.campoId,
    valor: r.valor,
    valorNum: r.valorNum == null ? null : Number(r.valorNum),
    valorFecha: r.valorFecha == null ? null : r.valorFecha.toISOString(),
  };
}

function invalidar(tenantId: string): void {
  try {
    invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
  } catch (err) {
    logger.error("[campos-personalizados] no se pudo invalidar la caché tras el write", {
      error: String(err),
      tenantId,
    });
  }
}

function auditar(
  tenantId: string,
  action: string,
  detail: string,
  entityId: string,
  usuario: string,
): void {
  logActivity(action, "CampoPersonalizado", detail, entityId, usuario, undefined, tenantId).catch(
    (err: unknown) =>
      logger.error("[campos-personalizados] no se pudo auditar", {
        error: String(err),
        action,
        tenantId,
      }),
  );
}

// ── API ─────────────────────────────────────────────────────────────────────

// ── Ley 29733: los campos personalizados de UNA persona ─────────────────────

/**
 * De qué **tabla** es el `registroId` de cada formulario.
 *
 * `EXISTE_REGISTRO` (arriba) contesta «¿ese id existe?» para poder rechazar un
 * guardado; esto contesta la pregunta inversa, que es la que necesita
 * cumplimiento: **«¿de quién es ese registro?»**. Son dos preguntas distintas
 * sobre el mismo par formulario→tabla, y al cablear un modal nuevo hay que
 * sumar la línea en los dos lugares. Lo que falte acá no filtra nada: sale
 * declarado en `fueraDeAlcance`.
 *
 * El valor es el nombre del modelo de Prisma, que es como el que llama agrupa
 * los ids que ya sabe de esta persona (`{ order: [...], sale: [...] }`).
 */
export type OrigenDeRegistro =
  // Los que una persona (un `Customer`) tiene como propios.
  | "customer"
  | "order"
  | "sale"
  | "fiado"
  | "prestamo"
  | "sunatInvoice"
  | "savedLocation"
  | "customerNotification"
  // Los del libro forestal: cuelgan de un predio, un plan o una parte del
  // Directorio, no de un cliente de la bodega.
  | "forestPlan"
  | "forestParty"
  | "woodEntry"
  | "forestContrato"
  | "forestLoteAserrio";

export const ORIGEN_DEL_FORMULARIO: Readonly<Record<string, OrigenDeRegistro>> = {
  "forestal.plan": "forestPlan",
  "directorio.parte": "forestParty",
  "forestal.ingreso": "woodEntry",
  "forestal.permiso": "forestContrato",
  "forestal.lote": "forestLoteAserrio",
  /* `forestal.despacho` y `adelantos.adelanto` quedan afuera por la misma razón
     que en `EXISTE_REGISTRO`: todavía no está decidido de qué tabla es su id, y
     declarar la tabla equivocada acá sería peor que no declararla — metería en
     el export de alguien el dato de otro. Sin línea = sale en `fueraDeAlcance`. */
};

/** Los ids que el que llama YA sabe de esta persona, agrupados por tabla. */
export type RegistrosDeUnaPersona = Partial<Record<OrigenDeRegistro, readonly string[]>>;

/** Una respuesta de esta persona, con la pregunta al lado (sin la pregunta, el valor no dice nada). */
export interface ValorDeUnaPersona {
  formulario: string;
  formularioNombre: string;
  origen: OrigenDeRegistro;
  registroId: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  valor: string | null;
  valorNum: number | null;
  valorFecha: string | null;
  /** La pregunta se apagó o se dio de baja después; lo contestado sigue siendo suyo. */
  preguntaDadaDeBaja: boolean;
  createdAt: Date;
}

/** Un formulario cuyas respuestas NO se pudieron atribuir a esta persona, y por qué. */
export interface FueraDeAlcance {
  formulario: string;
  formularioNombre: string;
  motivo: string;
  /** Cuántas respuestas suyas colgaban de un id de esta persona sin poder atribuirse. */
  valores?: number;
}

export interface ValoresDeUnaPersona {
  valores: ValorDeUnaPersona[];
  fueraDeAlcance: FueraDeAlcance[];
  registrosConsultados: number;
  registrosTruncados: boolean;
}

export interface BorradoDeUnaPersona {
  borrados: number;
  porFormulario: Array<{ formulario: string; formularioNombre: string; valores: number }>;
  fueraDeAlcance: FueraDeAlcance[];
  registrosTruncados: boolean;
}

/** Sirve tanto el cliente normal como el `tx` de una transacción. */
type ClienteDb = Pick<Prisma.TransactionClient, "campoPersonalizado" | "campoPersonalizadoValor">;

/** Tope de ids cruzados en una pasada: un `IN` no puede crecer sin límite. */
const MAX_REGISTROS_PERSONA = 5_000;
/** Tope de respuestas leídas en una pasada. */
const MAX_VALORES_PERSONA = 5_000;

interface CampoDeValor {
  id: string;
  formulario: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  activo: boolean;
  deletedAt: Date | null;
}

interface ValorResuelto {
  id: string;
  registroId: string;
  valor: string | null;
  valorNum: Prisma.Decimal | null;
  valorFecha: Date | null;
  createdAt: Date;
  campo: CampoDeValor;
  origen: OrigenDeRegistro;
}

interface ResolucionDePersona {
  /** Los valores que son de esta persona: id en la lista Y formulario de esa misma tabla. */
  propios: ValorResuelto[];
  /** formulario → cuántos valores cayeron en un id suyo sin poder atribuirse. */
  sinAtribuir: Map<string, number>;
  origenes: Map<OrigenDeRegistro, Set<string>>;
  consultados: number;
  truncado: boolean;
}

/**
 * El cruce que decide qué respuesta es de esta persona.
 *
 * Dos consultas, las dos con `tenantId` en el WHERE:
 *
 * 1. las respuestas que cuelgan de alguno de sus ids;
 * 2. la **pregunta** de cada una, otra vez acotada al tenant — un `campoId` de
 *    otro negocio no vuelve de acá, así que su valor no se exporta ni se borra.
 *
 * El filtro final no es un `if` de cortesía: un valor entra sólo si su
 * formulario declara la MISMA tabla en la que estaba su id. Así un id que
 * coincide de casualidad (el id de un `Customer` es su teléfono) no arrastra el
 * dato de otro.
 */
async function resolverValoresDePersona(
  db: ClienteDb,
  tenantId: string,
  registros: RegistrosDeUnaPersona,
): Promise<ResolucionDePersona> {
  const origenes = new Map<OrigenDeRegistro, Set<string>>();
  for (const [origen, ids] of Object.entries(registros) as Array<
    [OrigenDeRegistro, readonly string[] | undefined]
  >) {
    const limpios = (ids ?? []).filter((id) => typeof id === "string" && id.length > 0);
    if (limpios.length > 0) origenes.set(origen, new Set(limpios));
  }
  const todos = [...new Set([...origenes.values()].flatMap((s) => [...s]))];
  const truncado = todos.length > MAX_REGISTROS_PERSONA;
  const consultados = truncado ? todos.slice(0, MAX_REGISTROS_PERSONA) : todos;
  const sinAtribuir = new Map<string, number>();
  const vacio: ResolucionDePersona = {
    propios: [],
    sinAtribuir,
    origenes,
    consultados: consultados.length,
    truncado,
  };
  if (consultados.length === 0) return vacio;

  const filas = await db.campoPersonalizadoValor.findMany({
    where: { tenantId, registroId: { in: consultados } },
    select: {
      id: true,
      campoId: true,
      registroId: true,
      valor: true,
      valorNum: true,
      valorFecha: true,
      createdAt: true,
    },
    take: MAX_VALORES_PERSONA,
  });
  if (filas.length === 0) return vacio;

  /* Sin `deletedAt: null`: una pregunta dada de baja se lleva su definición,
     no lo que la persona escribió. Filtrarla acá dejaría ese texto afuera del
     export y vivo después de la supresión. */
  const campos = await db.campoPersonalizado.findMany({
    where: { tenantId, id: { in: [...new Set(filas.map((f) => f.campoId))] } },
    select: {
      id: true,
      formulario: true,
      clave: true,
      nombre: true,
      descripcion: true,
      tipo: true,
      activo: true,
      deletedAt: true,
    },
  });
  const porId = new Map(campos.map((c) => [c.id, c]));

  const propios: ValorResuelto[] = [];
  for (const fila of filas) {
    const campo = porId.get(fila.campoId);
    if (!campo) {
      // La fila tiene el tenant de esta persona pero su pregunta no: dato
      // inconsistente. No se exporta (sería de otro negocio) y se avisa.
      logger.warn("[campos-personalizados] valor con su campo fuera del negocio", {
        tenantId,
        campoId: fila.campoId,
        registroId: fila.registroId,
      });
      continue;
    }
    const origen = ORIGEN_DEL_FORMULARIO[campo.formulario];
    const esSuyo = origen != null && (origenes.get(origen)?.has(fila.registroId) ?? false);
    if (!esSuyo) {
      sinAtribuir.set(campo.formulario, (sinAtribuir.get(campo.formulario) ?? 0) + 1);
      continue;
    }
    propios.push({ ...fila, campo, origen });
  }
  return { propios, sinAtribuir, origenes, consultados: consultados.length, truncado };
}

/**
 * Qué formularios quedaron afuera y por qué.
 *
 * Es la parte honesta del export: el cruce de arriba sólo puede incluir lo que
 * está declarado, así que lo no declarado se **dice**, en vez de desaparecer.
 * Entran los formularios que tienen campos vivos en este negocio y cuya tabla
 * no es ninguna de las que el que llama sabe de esta persona, más los que
 * dejaron valores en un id suyo sin poder atribuirse.
 */
async function formulariosFueraDeAlcance(
  db: ClienteDb,
  tenantId: string,
  cubiertos: ReadonlySet<OrigenDeRegistro>,
  sinAtribuir: ReadonlyMap<string, number>,
): Promise<FueraDeAlcance[]> {
  const rows = await db.campoPersonalizado.findMany({
    where: { tenantId, deletedAt: null },
    select: { formulario: true },
    distinct: ["formulario"],
    take: MAX_CAMPOS,
  });
  const formularios = new Set(rows.map((r) => r.formulario));
  for (const f of sinAtribuir.keys()) formularios.add(f);

  const fuera: FueraDeAlcance[] = [];
  for (const formulario of formularios) {
    const origen = ORIGEN_DEL_FORMULARIO[formulario];
    if (origen != null && cubiertos.has(origen)) continue;
    fuera.push({
      formulario,
      formularioNombre: nombreDelFormulario(formulario),
      motivo:
        origen == null
          ? "No está declarado de qué tabla es el registro de este formulario (ORIGEN_DEL_FORMULARIO), así que no se puede saber si le pertenece a esta persona."
          : `Sus respuestas cuelgan de registros de «${origen}», que no son de los que esta ruta atribuye a una persona.`,
      valores: sinAtribuir.get(formulario),
    });
  }
  return fuera.sort((a, b) => a.formulario.localeCompare(b.formulario));
}

export const CamposPersonalizadosDB = {
  /**
   * Los campos que van en ESTE registro: los permanentes del formulario más
   * los temporales de este registro, en el orden de la función pura.
   *
   * Sin `registroId` (formulario en blanco, todavía sin fila) sólo hay
   * permanentes.
   *
   * **Los apagados vuelven también, al final.** Apagar no es dar de baja: el
   * campo sigue existiendo y la pantalla ofrece volver a mostrarlo. Si la
   * consulta los filtrara, apagar un campo sería un viaje de ida — y sus
   * respuestas quedarían invisibles sin que nadie pueda revertirlo. Quién se
   * pinta y quién no lo decide `camposDelRegistro`, que ya descarta los
   * inactivos.
   */
  async listar(
    tenantId: string,
    formulario: string,
    registroId?: string | null,
  ): Promise<CampoPersonalizado[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!formulario) throw new Error("formulario is required");
    const registro = registroId?.trim() || null;
    // Dos consultas y no una con OR, a propósito: los permanentes son los
    // mismos para todo el formulario y se cachean con UNA clave; cachear por
    // registro daría una clave por fila del negocio y desalojaría el resto.
    const [permanentes, temporales] = await Promise.all([
      getOrSet<CampoRow[]>(`${CACHE_PREFIX}:${tenantId}:form:${formulario}`, TTL_DEFINICIONES, () =>
        prisma.campoPersonalizado.findMany({
          where: { tenantId, formulario, deletedAt: null, soloParaRegistroId: null },
          select: SELECT_CAMPO,
          orderBy: [{ orden: "asc" }, { nombre: "asc" }],
          take: MAX_CAMPOS,
        }),
      ),
      // El `soloParaRegistroId` del WHERE es lo que impide que el campo
      // temporal de OTRO registro aparezca acá — no un filtro posterior.
      registro
        ? prisma.campoPersonalizado.findMany({
            where: { tenantId, formulario, deletedAt: null, soloParaRegistroId: registro },
            select: SELECT_CAMPO,
            orderBy: [{ orden: "asc" }, { nombre: "asc" }],
            take: MAX_CAMPOS,
          })
        : Promise.resolve([] as CampoRow[]),
    ]);
    const todos = [...permanentes, ...temporales].map(aCampo);
    const apagados = todos.filter((c) => !c.activo);
    return [...camposDelRegistro(todos, registro), ...apagados];
  },

  /**
   * Los campos permanentes de OTROS formularios, para ofrecerlos como
   * reutilizables. Deduplicar por clave y descartar los que ya están acá lo
   * hace la función pura; la consulta sólo acota al tenant.
   */
  async reutilizables(tenantId: string, formulario: string): Promise<CampoPersonalizado[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!formulario) throw new Error("formulario is required");
    const key = `${CACHE_PREFIX}:${tenantId}:reutilizables:${formulario}`;
    const rows = await getOrSet<CampoRow[]>(key, TTL_DEFINICIONES, () =>
      prisma.campoPersonalizado.findMany({
        where: { tenantId, deletedAt: null, activo: true, soloParaRegistroId: null },
        select: SELECT_CAMPO,
        orderBy: [{ nombre: "asc" }],
        take: MAX_CAMPOS,
      }),
    );
    return reutilizablesPuros(rows.map(aCampo), formulario);
  },

  /** Lo contestado en un registro, acotado a los campos que se están mostrando. */
  async valores(
    tenantId: string,
    registroId: string,
    campoIds: readonly string[],
  ): Promise<ValorDeCampo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!registroId || campoIds.length === 0) return [];
    const rows = await prisma.campoPersonalizadoValor.findMany({
      where: { tenantId, registroId, campoId: { in: [...campoIds] } },
      select: { campoId: true, valor: true, valorNum: true, valorFecha: true },
    });
    return rows.map(aValor);
  },

  /**
   * Inventa un campo. La clave se deriva del nombre con la función pura, así
   * que quien lo crea no tiene que pensarla y renombrarlo después no rompe lo
   * ya guardado.
   */
  async crear(tenantId: string, input: CampoNuevo, usuario: string): Promise<CampoPersonalizado> {
    if (!tenantId) throw new Error("tenantId is required");
    const formulario = input.formulario.trim();
    const nombre = input.nombre.trim();
    const clave = claveDesdeNombre(nombre);
    if (!clave) throw new Error("nombre is required");
    const soloParaRegistroId = input.soloParaRegistroId?.trim() || null;

    /* Un campo TEMPORAL cuelga de un registro: si ese registro no existe, la
       pregunta no la va a ver nunca nadie y queda como basura. Mismo chequeo
       que en `guardarValores`, una sola consulta. El permanente no se toca:
       vive en el formulario, no en una fila. */
    if (soloParaRegistroId && !(await registroExiste(tenantId, formulario, soloParaRegistroId))) {
      throw new RegistroDesconocidoError(formulario, soloParaRegistroId);
    }

    // Choca contra lo que se vería en el MISMO registro: los permanentes del
    // formulario y, si es temporal, los temporales de ese registro.
    const existente = await prisma.campoPersonalizado.findFirst({
      where: {
        tenantId,
        formulario,
        clave,
        deletedAt: null,
        OR: [
          { soloParaRegistroId: null },
          ...(soloParaRegistroId ? [{ soloParaRegistroId }] : []),
        ],
      },
      select: { id: true, nombre: true },
    });
    if (existente) throw new ClaveDuplicadaError(existente);

    /* Un formulario no puede crecer sin techo. Sólo se cuentan los PERMANENTES:
       el temporal vive en un registro y no le llena la pantalla a nadie más. */
    if (!soloParaRegistroId) {
      const cuantos = await prisma.campoPersonalizado.count({
        where: { tenantId, formulario, deletedAt: null, soloParaRegistroId: null },
      });
      if (cuantos >= MAX_CAMPOS_POR_FORMULARIO) throw new DemasiadosCamposError(cuantos);
    }

    // Orden: al final de lo que ya hay, para que el campo nuevo no se cuele
    // arriba de lo que el formulario venía preguntando.
    const ultimo = await prisma.campoPersonalizado.aggregate({
      where: { tenantId, formulario, deletedAt: null },
      _max: { orden: true },
    });

    try {
      const row = await prisma.campoPersonalizado.create({
        data: {
          tenantId,
          formulario,
          clave,
          nombre,
          descripcion: input.descripcion?.trim() || null,
          tipo: input.tipo,
          opciones: input.opciones?.map((o) => o.trim()).filter(Boolean) ?? [],
          soloParaRegistroId,
          orden: (ultimo._max.orden ?? 0) + 1,
          createdBy: usuario,
        },
        select: SELECT_CAMPO,
      });
      invalidar(tenantId);
      auditar(
        tenantId,
        "campo_personalizado_crear",
        `Creó el campo «${nombre}» (${input.tipo}) en ${formulario}` +
          (soloParaRegistroId ? ` — temporal del registro ${soloParaRegistroId}` : " — permanente"),
        row.id,
        usuario,
      );
      return aCampo(row);
    } catch (err) {
      // Para un campo TEMPORAL el índice único es el árbitro real contra dos
      // altas simultáneas. Para un PERMANENTE **no**: `soloParaRegistroId` es
      // NULL y Postgres trata cada NULL como distinto, así que el índice ni se
      // entera (medido en `main` el 2026-09-21: dos permanentes con la misma
      // clave entraron). Ahí el único guard es la lectura de arriba, que deja
      // una ventana de carrera. Cerrarla pide un índice parcial
      // `(tenantId, formulario, clave) WHERE "soloParaRegistroId" IS NULL AND
      // "deletedAt" IS NULL` — migración, no código.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ClaveDuplicadaError({ id: "", nombre });
      }
      throw err;
    }
  },

  /**
   * Edita la etiqueta, la ayuda, las opciones o el orden. **La clave no se
   * toca**: es el identificador estable con el que lo guardado se encuentra.
   *
   * `updateMany` con `tenantId` en el WHERE: un id de otro negocio no escribe
   * nada y devuelve `null` (la ruta lo traduce a 404), sin un `if` posterior.
   */
  async actualizar(
    tenantId: string,
    id: string,
    patch: CampoPatch,
    usuario: string,
  ): Promise<CampoPersonalizado | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    const data: Prisma.CampoPersonalizadoUpdateManyMutationInput = {};
    if (patch.nombre !== undefined) data.nombre = patch.nombre.trim();
    if (patch.descripcion !== undefined) data.descripcion = patch.descripcion?.trim() || null;
    if (patch.opciones !== undefined) data.opciones = patch.opciones.map((o) => o.trim()).filter(Boolean);
    if (patch.orden !== undefined) data.orden = patch.orden;
    if (patch.activo !== undefined) data.activo = patch.activo;
    if (Object.keys(data).length === 0) {
      const actual = await prisma.campoPersonalizado.findFirst({
        where: { tenantId, id, deletedAt: null },
        select: SELECT_CAMPO,
      });
      return actual ? aCampo(actual) : null;
    }

    const { count } = await prisma.campoPersonalizado.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
    if (count === 0) return null;

    const row = await prisma.campoPersonalizado.findFirst({
      where: { tenantId, id },
      select: SELECT_CAMPO,
    });
    invalidar(tenantId);
    auditar(
      tenantId,
      "campo_personalizado_editar",
      `Editó el campo «${row?.nombre ?? id}»: ${Object.keys(data).join(", ")}`,
      id,
      usuario,
    );
    return row ? aCampo(row) : null;
  },

  /**
   * Baja **lógica**: `deletedAt` + `activo:false`. Nunca un delete físico —
   * los valores que cuelgan del campo son lo que alguien escribió, y borrarlos
   * dejaría registros con un dato menos sin que nadie sepa qué se preguntó.
   */
  async eliminar(tenantId: string, id: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    const campo = await prisma.campoPersonalizado.findFirst({
      where: { tenantId, id, deletedAt: null },
      select: { id: true, nombre: true, formulario: true },
    });
    if (!campo) return false;

    const { count } = await prisma.campoPersonalizado.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), activo: false },
    });
    if (count === 0) return false;

    invalidar(tenantId);
    auditar(
      tenantId,
      "campo_personalizado_baja",
      `Dio de baja el campo «${campo.nombre}» de ${campo.formulario}`,
      id,
      usuario,
    );
    return true;
  },

  /**
   * Guarda lo contestado en UN registro, en UNA tanda.
   *
   * Tres cosas que no son obvias:
   *
   * 1. **Se cargan los campos primero** porque el tipo decide cómo se parte el
   *    valor (`partirValor`), y porque esa consulta —acotada al tenant— es la
   *    que descarta un `campoId` de otro negocio: lo que no vuelve de ahí no
   *    se escribe. Un `upsert` a ciegas crearía una fila con el campo ajeno.
   * 2. **Un campo temporal de OTRO registro se ignora**: su pregunta no existe
   *    en esta fila.
   * 3. **Vaciar borra la respuesta** en vez de dejar una fila de nulos: «no
   *    contestado» y «contestado con nada» son lo mismo para quien lee.
   * 4. **El registro tiene que existir en este negocio** (`registroExiste`).
   *    Una consulta por FORMULARIO, no por valor: un modal manda todas sus
   *    respuestas juntas y todas cuelgan del mismo registro, así que verificar
   *    una vez alcanza. Lo rechazado vuelve contado aparte de lo ignorado:
   *    «esa pregunta no es de acá» (ignorado) y «ese registro no existe»
   *    (rechazado) se arreglan de maneras distintas.
   */
  async guardarValores(
    tenantId: string,
    registroId: string,
    entradas: readonly ValorEntrante[],
    usuario: string,
  ): Promise<{ guardados: number; borrados: number; ignorados: number; rechazados: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!registroId) throw new Error("registroId is required");
    if (entradas.length === 0) return { guardados: 0, borrados: 0, ignorados: 0, rechazados: 0 };

    const ids = [...new Set(entradas.map((e) => e.campoId))];
    const campos = await prisma.campoPersonalizado.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      select: { id: true, tipo: true, nombre: true, soloParaRegistroId: true, formulario: true },
    });
    const porId = new Map(campos.map((c) => [c.id, c]));

    /* En la práctica es UNA consulta: un modal es un formulario. El `Set` está
       por si una tanda mezclara campos de dos pantallas — igual sería una por
       formulario, nunca una por valor. */
    const verificados = await Promise.all(
      [...new Set(campos.map((c) => c.formulario))].map(
        async (f) => [f, await registroExiste(tenantId, f, registroId)] as const,
      ),
    );
    const registroOk = new Map(verificados);

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let guardados = 0;
    let borrados = 0;
    let ignorados = 0;
    let rechazados = 0;

    for (const campoId of ids) {
      const campo = porId.get(campoId);
      // Ajeno, dado de baja, o temporal de otro registro: no es una pregunta
      // de esta fila.
      if (!campo || (campo.soloParaRegistroId != null && campo.soloParaRegistroId !== registroId)) {
        ignorados += 1;
        continue;
      }
      const crudo = entradas.find((e) => e.campoId === campoId)?.valor ?? null;
      const partido = partirValor(esTipoCampo(campo.tipo) ? campo.tipo : "texto", crudo);

      /* Vaciar se puede SIEMPRE, exista o no el registro: borrar no crea
         basura, la saca. Si el chequeo de abajo tapara también el borrado, una
         respuesta que quedó colgando de un registro que ya no está no se
         podría limpiar por ningún lado. */
      if (partido.valor == null) {
        borrados += 1;
        ops.push(
          prisma.campoPersonalizadoValor.deleteMany({ where: { tenantId, campoId, registroId } }),
        );
        continue;
      }

      // Escribir sí necesita un registro real: si el id no existe en este
      // negocio, la respuesta no colgaría de nada.
      if (!registroOk.get(campo.formulario)) {
        rechazados += 1;
        continue;
      }
      guardados += 1;
      const escrito = {
        valor: partido.valor,
        valorNum: partido.valorNum == null ? null : new Prisma.Decimal(partido.valorNum),
        valorFecha: partido.valorFecha == null ? null : new Date(partido.valorFecha),
      };
      ops.push(
        prisma.campoPersonalizadoValor.upsert({
          // El unique `(tenantId, campoId, registroId)` es lo que hace que
          // guardar dos veces actualice en vez de duplicar.
          where: { tenantId_campoId_registroId: { tenantId, campoId, registroId } },
          create: { tenantId, campoId, registroId, createdBy: usuario, ...escrito },
          update: escrito,
        }),
      );
    }

    if (ops.length > 0) await prisma.$transaction(ops);
    invalidar(tenantId);
    if (guardados > 0 || borrados > 0) {
      auditar(
        tenantId,
        "campo_personalizado_valores",
        `Guardó ${guardados} campo(s) personalizado(s) del registro ${registroId}` +
          (borrados > 0 ? ` y vació ${borrados}` : ""),
        registroId,
        usuario,
      );
    }
    return { guardados, borrados, ignorados, rechazados };
  },

  /**
   * De qué formularios son estos campos (distintos, y sólo los de este
   * negocio). Lo usa la ruta para decidir el permiso ANTES de escribir: el
   * formulario que manda es el que dice la base, no el que diga el cliente.
   *
   * Una consulta, con `distinct`: no se necesita la fila, sólo de qué pantalla
   * viene cada pregunta.
   */
  async formulariosDeCampos(tenantId: string, campoIds: readonly string[]): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (campoIds.length === 0) return [];
    const rows = await prisma.campoPersonalizado.findMany({
      where: { tenantId, id: { in: [...new Set(campoIds)] }, deletedAt: null },
      select: { formulario: true },
      distinct: ["formulario"],
    });
    return rows.map((r) => r.formulario);
  },

  /**
   * Lo contestado en campos personalizados por los registros de UNA persona —
   * el derecho de acceso de la Ley 29733 (art. 18-20).
   *
   * **Por qué hace falta un mapa y no alcanza con el id.** `registroId` es un id
   * libre: no dice de qué tabla salió. Quien llama pasa los ids que ya sabe de
   * esta persona agrupados por tabla (`{ order: [...], sale: [...] }`), y
   * `ORIGEN_DEL_FORMULARIO` dice de qué tabla es el registro de cada
   * formulario. Un valor entra sólo cuando **coinciden las dos cosas**: su id
   * está en la lista Y su formulario declara esa misma tabla. Cruzar sólo por
   * id metería en el export el dato de otro — el id de un `Customer` es su
   * **teléfono**, que es corto y bien puede repetirse como código en otra
   * tabla.
   *
   * **Lo que no entra no desaparece**: vuelve en `fueraDeAlcance` con el
   * motivo. Un formulario sin declarar es un dato que no sale en el export; es
   * preferible que se vea a que se pierda en silencio.
   */
  async valoresDeUnaPersona(
    tenantId: string,
    registros: RegistrosDeUnaPersona,
  ): Promise<ValoresDeUnaPersona> {
    if (!tenantId) throw new Error("tenantId is required");
    const resuelto = await resolverValoresDePersona(prisma, tenantId, registros);
    const fueraDeAlcance = await formulariosFueraDeAlcance(
      prisma,
      tenantId,
      new Set(resuelto.origenes.keys()),
      resuelto.sinAtribuir,
    );
    return {
      valores: resuelto.propios.map((p) => ({
        formulario: p.campo.formulario,
        formularioNombre: nombreDelFormulario(p.campo.formulario),
        origen: p.origen,
        registroId: p.registroId,
        clave: p.campo.clave,
        nombre: p.campo.nombre,
        descripcion: p.campo.descripcion,
        tipo: p.campo.tipo,
        valor: p.valor,
        valorNum: p.valorNum == null ? null : Number(p.valorNum),
        valorFecha: p.valorFecha == null ? null : p.valorFecha.toISOString(),
        // La pregunta pudo apagarse o darse de baja después; lo contestado
        // sigue siendo un dato personal de esta persona y se exporta igual.
        preguntaDadaDeBaja: p.campo.deletedAt != null || !p.campo.activo,
        createdAt: p.createdAt,
      })),
      fueraDeAlcance,
      registrosConsultados: resuelto.consultados,
      registrosTruncados: resuelto.truncado,
    };
  },

  /**
   * Borra las respuestas de campos personalizados de los registros de UNA
   * persona — el derecho de supresión (Ley 29733 art. 21).
   *
   * Tres decisiones, con su razón:
   *
   * 1. **Se borra el valor, no la pregunta.** «Apagar, no borrar» (ADR-427) es
   *    para la definición: el campo sigue existiendo para los demás registros.
   *    Lo que esta persona escribió no tiene obligación tributaria que lo
   *    retenga (no es un monto ni un comprobante), así que se elimina de
   *    verdad — igual que `SavedLocation` y `CustomerNotification` en esta
   *    misma ruta, y a diferencia de `Sale`/`SunatInvoice`, que se anonimizan.
   * 2. **Recibe el `tx`** para que la supresión sea una sola operación: si algo
   *    falla después, estos borrados también se deshacen.
   * 3. **No invalida caché ni audita acá.** La caché de esta clase guarda sólo
   *    definiciones (`listar`/`reutilizables`), que no cambian; los valores
   *    nunca se cachearon. Y la auditoría la escribe la ruta DESPUÉS del
   *    commit: auditar adentro dejaría constancia de un borrado que la
   *    transacción todavía puede deshacer.
   */
  async borrarValoresDeUnaPersonaEnTx(
    tx: ClienteDb,
    tenantId: string,
    registros: RegistrosDeUnaPersona,
  ): Promise<BorradoDeUnaPersona> {
    if (!tenantId) throw new Error("tenantId is required");
    const resuelto = await resolverValoresDePersona(tx, tenantId, registros);
    const fueraDeAlcance = await formulariosFueraDeAlcance(
      tx,
      tenantId,
      new Set(resuelto.origenes.keys()),
      resuelto.sinAtribuir,
    );

    const porFormulario = new Map<string, number>();
    for (const p of resuelto.propios) {
      porFormulario.set(p.campo.formulario, (porFormulario.get(p.campo.formulario) ?? 0) + 1);
    }

    let borrados = 0;
    if (resuelto.propios.length > 0) {
      // `tenantId` otra vez en el WHERE aunque los ids ya salieron de una
      // consulta acotada: el aislamiento se cierra en el WHERE, no con un `if`.
      const r = await tx.campoPersonalizadoValor.deleteMany({
        where: { tenantId, id: { in: resuelto.propios.map((p) => p.id) } },
      });
      borrados = r.count;
    }

    return {
      borrados,
      porFormulario: [...porFormulario].map(([formulario, valores]) => ({
        formulario,
        formularioNombre: nombreDelFormulario(formulario),
        valores,
      })),
      fueraDeAlcance,
      registrosTruncados: resuelto.truncado,
    };
  },
};
