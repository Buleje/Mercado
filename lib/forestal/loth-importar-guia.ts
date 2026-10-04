/**
 * Importar al Libro TH una guía que YA se despachó (ADR-461, 02-10-2026).
 *
 * Brandon: «subir guías o poner guías que ya se despacharon; de acuerdo a esa
 * guía se identifica a qué permiso pertenece […] según la lista de trozas
 * ponerse en la sección trozas y en la tala (en plantación no es obligatorio)
 * pero si es DEMA o POA que en la tala se ponga referencial según el código de
 * trozas: 12A 6 m, 12B 3 m → tala 12, 9 m, D1 50 y el otro 45».
 *
 * Esto arma, desde la ficha de SERFOR, lo que el libro asentaría —permiso,
 * trozados, talas referenciales y el despacho— y lo revisa contra lo que el
 * libro YA tiene. La vista previa y la importación usan la MISMA revisión
 * (`revisarGuia`): la pantalla no puede prometer algo que el servidor no haga.
 *
 * Reglas que no se ven en el código de un vistazo:
 *  - El volumen de cada troza es el de la GUÍA (declaración jurada), no se recalcula.
 *  - Una troza sin código («-», 49 de 160 en Blas) NO es un código repetido:
 *    queda `SC-<registro>-<n>` y no se ata a ningún árbol.
 *  - La tala referencial = la suma de TODAS las trozas registradas del árbol en
 *    ese plan (las de esta guía y las que ya estaban): así T4 («trozado ≤ tala»)
 *    cierra exacto aunque el árbol venga en dos guías (Blas: 173-A/B/C en la
 *    GTF 7 y 173-D en la 8). Si el árbol ya tiene una tala referencial, se
 *    AMPLÍA; si tiene una medida en campo, se respeta.
 *  - `treeCode` y `trozaCode` son únicos en TODO el negocio (T3/T4 del libro):
 *    un árbol o una troza de otro permiso es un choque, no se adivina.
 *
 * PURO y client-safe.
 */

import type { GtfSerfor } from "./serfor-gtf";
import { claveOrigen, estadoGtf, partirDimensiones, separarDocumento } from "./serfor-gtf-campos";
import { claveNumeroGtf, mismoNumeroGtf } from "./gtf-talonario";
import { claveEspecie } from "./loth-constants";
import { especieEnRegistro, type EspecieRegistrada } from "./loth-plan-especie";
import { chocanEnElLibro } from "./loth-talonario";
import { closedPeriodOf, type LothCierrePeriodo } from "./loth-cierre-types";
import { esPlanDePlantacion } from "./loth-poa";
import { componerPunto, gtfDatosSchema, gtfDatosVacio, type GtfDatos } from "./ctp-gtf-datos";
import { fichaParaMostrar } from "./loth-importar-guia-ficha";
import type { DespachoT6 } from "./loth-t6";
import type {
  AvisoImportacion,
  EstadoVistaPrevia,
  FuenteImportarGuia,
  GuiaResumen,
  GuiaVistaPrevia,
  PermisoCandidato,
  PermisoDetectado,
  PlanNuevoPropuesto,
  TalaReferencial,
  TipoPlanImportado,
  TrozaImportada,
} from "./loth-importar-guia-tipos";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const txt = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const oNull = (v: string | null | undefined) => txt(v) || null;

/** Diferencia que se tolera entre la suma de las trozas y lo que declara la guía: 10 litros. */
export const TOLERANCIA_VOLUMEN_M3 = 0.01;

// ── Códigos ─────────────────────────────────────────────────────────────────

/**
 * La LLAVE del código de un título habilitante: mayúsculas, tramos separados por
 * cualquier signo, los numéricos sin ceros a la izquierda.
 * «10-HUA-PUE/PER-FMP-2026-007» ≡ «10 HUA PUE PER FMP 2026 7» → `10-HUA-PUE-PER-FMP-2026-7`.
 */
export function claveTitulo(codigo: string | null | undefined): string | null {
  const tramos = txt(codigo)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t));
  return tramos.length ? tramos.join("-") : null;
}

/** ¿La codificación es «sin código»? Vacía o sólo guiones, rayas o puntos (memoria `trozas-codificacion-guion-es-sin-codigo`). */
export function esSinCodigo(codificacion: string | null | undefined): boolean {
  return !/[A-Za-z0-9]/.test(codificacion ?? "");
}

/**
 * El árbol de una troza según cómo se marcó: «186A» → «186», «173-D» → «173»,
 * «84/A (0000005)» → «84», «85-TOR-A» → «85-TOR». Un código sin sufijo de
 * pieza («35», «001-BOL») ES el árbol. `null` = sin código.
 *
 * Distinto de `arbolDeTroza` (loth-censo-uso), que sólo entiende el guion: el
 * «186A» pegado de las guías de SERFOR lo dejaba como su propio árbol.
 */
export function arbolDeCodificacion(codificacion: string | null | undefined): string | null {
  if (esSinCodigo(codificacion)) return null;
  const c = txt((codificacion ?? "").replace(/\([^)]*\)/g, " "));
  if (!c) return null;
  const separado = /^(.*?[A-Za-z0-9])\s*[-/ ]\s*([A-Za-z]{1,2})$/.exec(c);
  if (separado) return separado[1];
  const pegado = /^(\d+)([A-Za-z]{1,2})$/.exec(c);
  if (pegado) return pegado[1];
  return c;
}

/** El código con que entra al libro una troza sin código: `SC-<registro>-<n>` (n = su lugar en la guía). */
export function codigoSinCodigo(base: string, indice: number): string {
  const b = txt(base).replace(/\s+/g, "") || "GTF";
  return `SC-${b}-${indice}`;
}

/** «07/09/2026» → «2026-09-07». También acepta «2026-09-07». `null` si no es una fecha. */
export function fechaIsoDeSerfor(texto: string | null | undefined): string | null {
  const t = txt(texto);
  let a: number, m: number, d: number;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (dmy) [d, m, a] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (ymd) [a, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** La fecha del libro de un «AAAA-MM-DD»: mediodía UTC (medianoche caería en el mes anterior para el cierre). */
export const fechaDelLibro = (iso: string): Date => new Date(`${iso}T12:00:00.000Z`);

// ── Lo que trae la guía ─────────────────────────────────────────────────────

/** Una troza de la guía lista para el libro, antes de mirar el libro. */
export type TrozaArmada = Omit<TrozaImportada, "estado" | "detalle">;

/** Con qué se nombran las trozas sin código: el N° de registro, o el de la guía. */
export const baseSinCodigo = (g: Pick<GtfSerfor, "numeroRegistro" | "gtfNumber">): string =>
  txt(g.numeroRegistro) || txt(g.gtfNumber) || "GTF";

/** Las trozas de la lista de la guía, con su árbol y sus medidas en metros. */
export function trozasDeLaGuia(g: GtfSerfor): TrozaArmada[] {
  const base = baseSinCodigo(g);
  return (g.trozas ?? []).map((x, i) => {
    const sinCodigo = esSinCodigo(x.codificacion);
    const { d1Cm, d2Cm, largoM } = partirDimensiones(x.dimensiones);
    /* La columna del libro es «sección mayor / menor»: SERFOR a veces publica el
       menor primero (Blas: «56.0 X 61.0 X 3.9»). */
    const diams = [d1Cm, d2Cm].filter((n): n is number => n != null && n > 0);
    const vol = typeof x.volumen === "number" && Number.isFinite(x.volumen) && x.volumen > 0 ? r4(x.volumen) : null;
    return {
      indice: i + 1,
      codificacionGuia: oNull(x.codificacion),
      trozaCode: sinCodigo ? codigoSinCodigo(base, i + 1) : txt(x.codificacion),
      treeCode: sinCodigo ? null : arbolDeCodificacion(x.codificacion),
      sinCodigo,
      speciesCommon: oNull(x.comun),
      speciesScientific: oNull(x.cientifico),
      diamMayorM: diams.length ? r3(Math.max(...diams) / 100) : null,
      diamMenorM: diams.length ? r3(Math.min(...diams) / 100) : null,
      lengthM: largoM != null && largoM > 0 ? r2(largoM) : null,
      volumeM3: vol,
    };
  });
}

/** El tipo de plan que se propone: por el origen del recurso y el código del título. */
export function tipoPlanDeLaGuia(origen: string | null | undefined, codigo: string | null | undefined): TipoPlanImportado {
  const c = txt(codigo).toUpperCase().replace(/\s+/g, "");
  if (/plantaci/i.test(origen ?? "") || c.includes("REG-PLT")) return "PLANTACION";
  if (c.includes("PER-FMC")) return "DEMA";
  if (c.includes("PER-FMP")) return "PMFI";
  return "PO";
}

/** Los datos del plan que se crearía con esta guía. */
export function propuestaDePlan(g: GtfSerfor, contratoId: string | null = null): PlanNuevoPropuesto {
  const codigo = oNull(g.numeroTitulo);
  const planType = tipoPlanDeLaGuia(g.origenRecurso, codigo);
  return {
    planType,
    planNumber: planType === "PLANTACION" ? codigo : null,
    tituloHabilitante: planType === "PLANTACION" ? null : codigo,
    titularName: txt(g.titular) || txt(g.representanteLegal) || txt(g.propietario) || "(titular por confirmar)",
    representanteLegal: oNull(g.representanteLegal),
    resolucionNumber: oNull(g.numeroResolucion),
    region: oNull(g.departamento),
    provincia: oNull(g.provincia),
    distrito: oNull(g.distrito),
    arffs: oNull(g.instanciaRegistra),
    contratoId,
  };
}

// ── El permiso ──────────────────────────────────────────────────────────────

/** Un plan vivo del negocio, con lo que hace falta para reconocerlo. */
export interface PlanDelLibro {
  id: string;
  planType: string;
  planNumber: string | null;
  tituloHabilitante: string | null;
  titularName: string;
  contratoId: string | null;
  especies: EspecieRegistrada[];
}

/** Un permiso (`ForestContrato`) vivo. */
export interface ContratoDelLibro {
  id: string;
  codigo: string;
  planId: string | null;
}

const candidato = (p: PlanDelLibro, via: "plan" | "contrato", clave: string): PermisoCandidato => ({
  planId: p.id,
  planType: p.planType,
  codigo: [p.planNumber, p.tituloHabilitante].find((c) => claveTitulo(c) === clave) ?? p.planNumber ?? p.tituloHabilitante ?? null,
  titularName: p.titularName,
  via,
  especies: p.especies.map((e) => e.speciesCommon),
});

/**
 * ¿A qué permiso va la guía? Por el código del título (tramo a tramo) contra el
 * N° y el título de cada plan, y contra los permisos (`ForestContrato`) atados a
 * un plan. El titular NO decide: dos titulares pueden escribirse distinto y el
 * código es el que se cruza ante SERFOR.
 */
export function detectarPermiso(
  g: GtfSerfor,
  planes: readonly PlanDelLibro[],
  contratos: readonly ContratoDelLibro[],
): PermisoDetectado {
  const clave = claveTitulo(g.numeroTitulo);
  const delCodigo = clave ? contratos.filter((c) => claveTitulo(c.codigo) === clave) : [];
  /* Un permiso con ese código y sin plan: el plan nuevo se ata a él. */
  const libre = delCodigo.filter((c) => !c.planId || !planes.some((p) => p.id === c.planId));
  const propuesta = propuestaDePlan(g, libre.length === 1 ? libre[0].id : null);
  if (!clave) return { estado: "nuevo", propuesta };

  const encontrados = new Map<string, PermisoCandidato>();
  for (const p of planes) {
    if (claveTitulo(p.planNumber) === clave || claveTitulo(p.tituloHabilitante) === clave) {
      encontrados.set(p.id, candidato(p, "plan", clave));
    }
  }
  for (const p of planes) {
    if (encontrados.has(p.id)) continue;
    if (delCodigo.some((c) => c.planId === p.id || (p.contratoId != null && c.id === p.contratoId))) {
      encontrados.set(p.id, candidato(p, "contrato", clave));
    }
  }
  const lista = [...encontrados.values()];
  if (lista.length === 1) return { estado: "existente", plan: lista[0] };
  if (lista.length > 1) return { estado: "ambiguo", candidatos: lista, propuesta };
  return { estado: "nuevo", propuesta };
}

// ── El cuerpo de la guía (GtfDatos) ─────────────────────────────────────────

const corto = (v: string | null | undefined, max: number) => txt(v).slice(0, max);

/** Un casillero que SERFOR publica con rayas («-», «---------») es un casillero vacío. */
export const sinRaya = (v: string | null | undefined): string => (/[A-Za-z0-9]/.test(v ?? "") ? txt(v) : "");

/**
 * La placa del camión y la del remolque, del casillero (31): SERFOR publica
 * «V2H-901 / -» o «W2D-853 /» (la del remolque después de la barra, con una
 * raya si no hay). Como se lee en el papel; el directorio la normaliza.
 */
export function placasDeLaGuia(crudo: string | null | undefined): { placa: string; remolque: string } {
  const [a = "", b = ""] = txt(crudo).split("/");
  const limpia = (v: string) => sinRaya(v).replace(/^[-\s]+|[-\s]+$/g, "");
  return { placa: limpia(a), remolque: limpia(b) };
}

/**
 * El cuerpo de la guía para `ForestGtf.gtfDatos`, desde la ficha. Cada texto se
 * corta al largo del esquema: un nombre de 201 letras haría fallar el
 * `safeParse` entero y la guía quedaría sin cuerpo.
 *
 * 02-10 noche: la partida y la llegada van también desarmadas (como las pide
 * la guía del TH desde el 29-09), la placa del remolque en su casillero y lo
 * que SERFOR publica con rayas («-») queda vacío en vez de «guía de remisión -».
 */
export function gtfDatosDesdeFicha(g: GtfSerfor): GtfDatos {
  const fecha = fechaIsoDeSerfor(g.fechaExpedicion) ?? "";
  const vence = fechaIsoDeSerfor(g.fechaVencimiento) ?? "";
  const docs = (crudo: string | null | undefined) => {
    const { ruc, dni } = separarDocumento(crudo);
    return ruc ? { docTipo: "RUC" as const, docNumero: ruc } : { docTipo: "DNI" as const, docNumero: dni };
  };
  const parte = (
    nombre: string | null,
    doc: string | null,
    direccion: string | null,
    dep: string | null,
    prov: string | null,
    dist: string | null,
  ) => ({
    nombre: corto(nombre, 200),
    ...docs(doc),
    direccion: corto(direccion, 250),
    departamento: corto(dep, 80),
    provincia: corto(prov, 80),
    distrito: corto(dist, 80),
    zona: "",
  });
  const publico = /p[uú]blic/i.test(g.tipoTransporte ?? "");
  const placas = placasDeLaGuia(g.placa);
  const remision = sinRaya(g.guiaRemision);
  /* La partida es el origen del recurso (casilleros 10-12); la llegada, el destinatario (25-28). */
  const partida = { direccion: "", departamento: corto(g.departamento, 80), provincia: corto(g.provincia, 80), distrito: corto(g.distrito, 80) };
  const llegada = {
    direccion: corto(g.destinatarioDireccion, 200),
    departamento: corto(g.destinatarioDepartamento, 80),
    provincia: corto(g.destinatarioProvincia, 80),
    distrito: corto(g.destinatarioDistrito, 80),
  };
  const crudo = {
    propietario: {
      ...parte(g.propietario, g.propietarioDoc, g.propietarioDireccion, g.propietarioDepartamento, g.propietarioProvincia, g.propietarioDistrito),
      esElCtp: false,
    },
    destinatario: parte(
      g.destinatario, g.destinatarioDoc, g.destinatarioDireccion,
      g.destinatarioDepartamento, g.destinatarioProvincia, g.destinatarioDistrito,
    ),
    vehiculo: {
      modo: "terrestre" as const,
      placa: corto(placas.placa, 15),
      placaRemolque: corto(placas.remolque, 15),
      marca: "",
      tipo: corto(sinRaya(g.tipoVehiculo), 40),
      embarcacion: "",
      /* La ficha publica al «transportista» con su DNI y su brevete: es quien
         maneja (igual que `insumosDesdeSerfor`). */
      conductor: corto(sinRaya(g.transportista), 120),
      conductorDni: corto(sinRaya(g.transportistaDni), 15),
      licencia: corto(sinRaya(g.licenciaConducir), 30),
      tipoTransporte: publico ? ("publico" as const) : ("privado" as const),
    },
    traslado: {
      puntoPartida: corto(componerPunto(partida), 250),
      puntoLlegada: corto(componerPunto(llegada), 250),
      ruta: "",
      fechaInicio: fecha,
      fechaFin: vence,
      partida,
      llegada,
    },
    titulos: txt(g.numeroTitulo) ? [corto(g.numeroTitulo, 80)] : [],
    comprobante: { tipo: remision ? ("guia_remision" as const) : ("ninguno" as const), numero: corto(remision, 40) },
    guia: {
      autoridad: corto(g.instanciaRegistra, 120),
      planManejoTipo: "",
      guiaRemisionNro: corto(remision, 40),
      listaTrozasNro: corto(sinRaya(g.listaTrozas), 40),
      gtfOrigenNro: "",
      origenRecurso: corto(claveOrigen(g.origenRecurso), 40),
      resolucion: corto(g.numeroResolucion, 120),
      representanteLegal: corto(g.representanteLegal, 200),
      departamento: corto(g.departamento, 80),
      provincia: corto(g.provincia, 80),
      distrito: corto(g.distrito, 80),
    },
    observaciones: "",
  };
  const r = gtfDatosSchema.safeParse(crudo);
  if (r.success) return r.data;
  const vacio = gtfDatosVacio();
  return { ...vacio, titulos: crudo.titulos };
}

/**
 * Lo que se guarda en `ForestGtf.gtfDatos` de una guía importada: los
 * casilleros (`gtfDatosDesdeFicha`) y, en su llave aparte, la ficha entera
 * (`fichaSerfor`, ver `loth-importar-guia-ficha`). Lo arma SÓLO el servidor.
 */
export type GtfDatosImportados = GtfDatos & {
  /** = `LLAVE_FICHA_SERFOR`. */
  fichaSerfor: GtfSerfor;
  /** = `LLAVE_FICHA_VERIFICADA`. */
  fichaSerforVerificada: boolean;
};

export function gtfDatosConFicha(g: GtfSerfor, verificada: boolean): GtfDatosImportados {
  return { ...gtfDatosDesdeFicha(g), fichaSerfor: fichaParaMostrar(g), fichaSerforVerificada: verificada };
}

// ── Lo que el libro ya tiene ────────────────────────────────────────────────

/** Una línea viva (registrada) de Tala o Trozado del libro. */
export interface LineaDelLibro {
  id: string;
  lineNo: number;
  section: "tala" | "trozado";
  planId: string | null;
  treeCode: string | null;
  trozaCode: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumeM3: number | null;
  /** `AAAA-MM-DD`. */
  fecha: string;
  /** Si la tala es referencial (ADR-461): de qué guías (N° y registro SERFOR) y trozas salió. */
  referencial: { gtfs: string[]; registros: string[]; trozas: string[] } | null;
  /**
   * Sólo en las líneas que todavía no existen (`libroDespuesDe`: las que dejaría
   * otra guía de la MISMA tanda, con `lineNo` 0): la guía que las trae, para
   * nombrarla en el aviso en vez de un «línea #0».
   */
  gtfNumber?: string | null;
}

/** Una salida viva (despacho o consumo) de una troza. */
export interface SalidaDelLibro {
  trozaCode: string;
  section: "despacho_troza" | "consumo_troza";
  lineNo: number;
  gtfNumber: string | null;
}

/** Una guía del Libro TH con el mismo N° (o que cita el mismo registro). */
export interface GuiaDelLibro {
  id: string;
  gtfNumber: string;
  status: string;
  titularName: string | null;
  tituloHabilitante: string | null;
  planId: string | null;
  observations: string | null;
}

export interface LibroDeLaGuia {
  /** Trozados vivos con un código de la guía, o de un árbol de la guía. */
  trozados: LineaDelLibro[];
  /** Talas vivas de los árboles de la guía. */
  talas: LineaDelLibro[];
  salidas: SalidaDelLibro[];
  guias: GuiaDelLibro[];
  cierres: LothCierrePeriodo[];
}

/** A qué plan va: `planId` real, o la llave de un plan que se va a crear (`nuevo:<título>`). */
export interface DestinoDeLaGuia {
  planId: string;
  /** El plan todavía no existe (se crea al importar). */
  nuevo: boolean;
  plantacion: boolean;
  /** Especies del registro/autorización. Vacío = T7 no juzga. */
  especies: EspecieRegistrada[];
  /** Cómo se nombra el plan en los mensajes. */
  nombre: string;
}

/** La llave del plan que se crearía: dos guías del mismo título nuevo van al MISMO plan. */
export const llavePlanNuevo = (g: Pick<GtfSerfor, "numeroTitulo" | "titular">): string =>
  `nuevo:${claveTitulo(g.numeroTitulo) ?? txt(g.titular).toUpperCase()}`;

/** La marca que se guarda en `medicionCruda` de una tala referencial. */
export interface MarcaReferencial {
  forma: "promedio";
  mayor: number[];
  menor: number[];
  totalM: number | null;
  descuentos: { tipo: string; metros: number }[];
  referencial: { gtfs: string[]; registros: string[]; trozas: string[] };
}

/** Lee la marca de tala referencial de `medicionCruda` (o `null`). */
export function leerReferencial(cruda: unknown): { gtfs: string[]; registros: string[]; trozas: string[] } | null {
  if (!cruda || typeof cruda !== "object") return null;
  const r = (cruda as { referencial?: unknown }).referencial;
  if (!r || typeof r !== "object") return null;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const ref = r as { gtfs?: unknown; registros?: unknown; trozas?: unknown };
  return { gtfs: lista(ref.gtfs), registros: lista(ref.registros), trozas: lista(ref.trozas) };
}

// ── La revisión ─────────────────────────────────────────────────────────────

/** ¿La observación de una guía cita ESTE N° de registro? («1-10-047463» no es «1-10-0474633»). */
export function citaElRegistro(observacion: string | null | undefined, registro: string): boolean {
  const r = txt(registro);
  if (!r) return false;
  const esc = r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`registro SERFOR ${esc}(?![0-9A-Za-z-])`).test(observacion ?? "");
}

/**
 * ¿La guía ya está en el Libro TH? Una guía VIGENTE con el mismo N° (tramo a
 * tramo) del mismo dueño —titular, título o plan; si a una le falta el titular,
 * por las dudas sí (`chocanEnElLibro`)—, o una que cita el mismo N° de registro
 * SERFOR. Las anuladas no cuentan: anular es decir «esta guía no está».
 */
export function guiaYaEnElLibro(
  g: Pick<GtfSerfor, "gtfNumber" | "numeroRegistro" | "titular" | "numeroTitulo">,
  guias: readonly GuiaDelLibro[],
  planId: string | null,
): GuiaDelLibro | null {
  const num = txt(g.gtfNumber);
  const registro = txt(g.numeroRegistro);
  const dueno = { titular: txt(g.titular) || null, permiso: txt(g.numeroTitulo) || null, planId };
  return (
    guias.find(
      (x) =>
        x.status !== "anulada" &&
        ((num !== "" &&
          mismoNumeroGtf(x.gtfNumber, num) &&
          chocanEnElLibro(dueno, { titular: x.titularName, permiso: x.tituloHabilitante, planId: x.planId })) ||
          (registro !== "" && citaElRegistro(x.observations, registro))),
    ) ?? null
  );
}


export interface RevisionDeGuia {
  trozas: TrozaImportada[];
  talas: TalaReferencial[];
  avisos: AvisoImportacion[];
  /** Ya está en el libro (mismo N° y mismo dueño vigente, o el mismo registro). */
  yaImportada: GuiaDelLibro | null;
  fecha: string | null;
}

const mismaEspecieDeTroza = (a: { speciesCommon: string | null; speciesScientific: string | null }, b: typeof a) => {
  const ka = claveEspecie(a.speciesCommon);
  const kb = claveEspecie(b.speciesCommon);
  if (ka && kb) return ka === kb || (claveEspecie(a.speciesScientific) !== "" && claveEspecie(a.speciesScientific) === claveEspecie(b.speciesScientific));
  return true; // a uno le falta: no objeta
};

/**
 * Cómo se nombra una línea en un aviso: «línea #12». Lo que todavía no existe
 * —lo que dejaría otra guía de la MISMA vista previa (`libroDespuesDe`), con
 * `lineNo` 0— no tiene N°: se nombra la guía que lo trae («la de la GTF 7, en
 * esta tanda»). Sin N° ni guía, «una tala ya registrada» (nunca «línea #0»).
 */
export function queLinea(
  l: { lineNo: number | null | undefined; gtfNumber?: string | null; referencial?: { gtfs: string[] } | null },
  cosa: "tala" | "trozado" | "salida",
): string {
  if (l.lineNo != null && l.lineNo > 0) return `línea #${l.lineNo}`;
  const gtf = txt(l.gtfNumber) || txt(l.referencial?.gtfs[l.referencial.gtfs.length - 1]);
  if (gtf) return `la de la GTF ${gtf}, en esta tanda`;
  return cosa === "tala" ? "una tala ya registrada" : cosa === "trozado" ? "un trozado ya registrado" : "una salida ya registrada";
}

const listaCodigos = (cods: readonly string[], max = 6) =>
  cods.length <= max ? cods.join(", ") : `${cods.slice(0, max).join(", ")} y ${cods.length - max} más`;

/**
 * Revisa la guía contra el libro para un destino. La MISMA función decide la
 * vista previa y la importación (dentro de la transacción, con lo leído bajo
 * el candado del N°).
 */
export function revisarGuia(
  g: GtfSerfor,
  destino: DestinoDeLaGuia,
  libro: LibroDeLaGuia,
  opts: {
    verificada: boolean;
    /** T8: árbol del censo del plan → el error de «bajo el DMC» (`ForestLothDB.arbolesBajoDmc`). */
    bajoDmc?: ReadonlyMap<string, string>;
  },
): RevisionDeGuia {
  const avisos: AvisoImportacion[] = [];
  const num = txt(g.gtfNumber);
  const fecha = fechaIsoDeSerfor(g.fechaExpedicion);

  if (!num) avisos.push({ nivel: "bloquea", codigo: "sin_numero", mensaje: "La guía no trae su N° de GTF: no se puede anotar en el libro." });
  if (!fecha) {
    avisos.push({ nivel: "bloquea", codigo: "sin_fecha", mensaje: `La fecha de expedición «${txt(g.fechaExpedicion) || "—"}» no se entiende: el despacho necesita su fecha.` });
  }
  const est = estadoGtf(g);
  if (est.anulada) {
    avisos.push({ nivel: "bloquea", codigo: "anulada", mensaje: `SERFOR declara esta guía ${est.texto.toUpperCase()}: no ampara movilización y no se anota.` });
  }
  if (!opts.verificada) {
    avisos.push({ nivel: "atencion", codigo: "no_verificada", mensaje: "Leída de una foto o PDF: no está verificada en SERFOR. Revisa los números antes de importarla." });
  }

  const yaImportada = guiaYaEnElLibro(g, libro.guias, destino.nuevo ? null : destino.planId);
  const anuladaAntes = libro.guias.find((x) => x.status === "anulada" && num && mismoNumeroGtf(x.gtfNumber, num));
  if (!yaImportada && anuladaAntes) {
    avisos.push({ nivel: "info", codigo: "ya_importada", mensaje: `Esta guía estuvo en el libro y se anuló: se vuelve a anotar.` });
  }

  if (fecha) {
    const cerrado = closedPeriodOf(libro.cierres, fechaDelLibro(fecha));
    if (cerrado) {
      avisos.push({ nivel: "bloquea", codigo: "mes_cerrado", mensaje: `El período ${cerrado.label} está cerrado: reábrelo para anotar esta guía.` });
    }
  }

  const armadas = trozasDeLaGuia(g);
  if (armadas.length === 0) {
    avisos.push({
      nivel: "bloquea",
      codigo: "sin_trozas",
      mensaje: "La guía no trae lista de trozas: no es un despacho de trozas (la madera aserrada va en Despacho de productos).",
    });
  }
  const sinCodigo = armadas.filter((t) => t.sinCodigo);
  if (sinCodigo.length) {
    avisos.push({
      nivel: "atencion",
      codigo: "sin_codigo",
      mensaje: `${sinCodigo.length} troza(s) sin código en la guía: entran como ${sinCodigo[0].trozaCode}… y no se atan a un árbol.`,
    });
  }
  const incompletas = armadas.filter((t) => t.volumeM3 == null || t.lengthM == null || t.diamMayorM == null);
  if (incompletas.length) {
    avisos.push({
      nivel: "atencion",
      codigo: "medidas_incompletas",
      mensaje: `${incompletas.length} troza(s) sin medidas o sin volumen en la guía (${listaCodigos(incompletas.map((t) => t.trozaCode))}): entran como vienen.`,
    });
  }
  const sumaTrozas = r4(armadas.reduce((a, t) => a + (t.volumeM3 ?? 0), 0));
  if (g.volumenTotal != null && armadas.length && Math.abs(sumaTrozas - g.volumenTotal) > TOLERANCIA_VOLUMEN_M3) {
    avisos.push({
      nivel: "atencion",
      codigo: "volumen_distinto",
      mensaje: `La lista de trozas suma ${sumaTrozas.toFixed(3)} m³ y la guía declara ${g.volumenTotal.toFixed(3)} m³: cada troza entra con el suyo.`,
    });
  }

  // T7 — especie fuera del registro/autorización del plan (sólo si el plan tiene especies).
  if (destino.especies.length) {
    const fuera = [...new Set(armadas.filter((t) => t.speciesCommon && !especieEnRegistro(destino.especies, t.speciesCommon, t.speciesScientific)).map((t) => t.speciesCommon as string))];
    if (fuera.length) {
      avisos.push({
        nivel: "bloquea",
        codigo: "especie_fuera_del_plan",
        mensaje: `${fuera.join(", ")} no ${fuera.length > 1 ? "están" : "está"} en ${destino.plantacion ? "el registro" : "las especies autorizadas"} de ${destino.nombre}: agrégala${fuera.length > 1 ? "s" : ""} al plan antes de importar.`,
      });
    }
  } else if (destino.nuevo) {
    avisos.push({
      nivel: "info",
      codigo: "plan_nuevo_sin_especies",
      mensaje: `Se crea ${destino.nombre} sin especies: carga lo ${destino.plantacion ? "registrado" : "autorizado"} para que el saldo descuente.`,
    });
  }

  // ── Trozas ────────────────────────────────────────────────────────────────
  const salidaDe = new Map(libro.salidas.map((s) => [s.trozaCode, s]));
  const trozadoDe = new Map(libro.trozados.filter((t) => t.trozaCode).map((t) => [t.trozaCode as string, t]));
  const repetidas = new Set<string>();
  const vistas = new Set<string>();
  for (const t of armadas) {
    if (vistas.has(t.trozaCode)) repetidas.add(t.trozaCode);
    else vistas.add(t.trozaCode);
  }

  const trozas: TrozaImportada[] = armadas.map((t) => {
    if (repetidas.has(t.trozaCode)) {
      return { ...t, estado: "conflicto", detalle: `La guía trae dos veces la troza ${t.trozaCode}.` };
    }
    const salida = salidaDe.get(t.trozaCode);
    if (salida && !(num && salida.gtfNumber && mismoNumeroGtf(salida.gtfNumber, num) && yaImportada)) {
      const donde = salida.lineNo > 0 && salida.gtfNumber ? `${queLinea(salida, "salida")}, GTF ${salida.gtfNumber}` : queLinea(salida, "salida");
      const que = salida.section === "despacho_troza" ? `despachada (${donde})` : `consumida (${donde})`;
      return { ...t, estado: "conflicto", detalle: `La troza ${t.trozaCode} ya salió: está ${que}.` };
    }
    const tz = trozadoDe.get(t.trozaCode);
    if (tz) {
      if (tz.planId !== destino.planId) {
        const deQuien = tz.planId ? "de otro permiso" : "sin permiso (átala primero con «Atarlas»)";
        return { ...t, estado: "conflicto", detalle: `La troza ${t.trozaCode} ya está en el Trozado (${queLinea(tz, "trozado")}) ${deQuien}.` };
      }
      if (!mismaEspecieDeTroza(tz, t)) {
        return { ...t, estado: "conflicto", detalle: `La troza ${t.trozaCode} ya está en el Trozado (${queLinea(tz, "trozado")}) como ${tz.speciesCommon}, y la guía dice ${t.speciesCommon}.` };
      }
      return { ...t, estado: "ya_trozada", detalle: `Ya está en el Trozado (${queLinea(tz, "trozado")}): se usa esa línea.` };
    }
    return { ...t, estado: "nueva", detalle: null };
  });

  const enConflicto = trozas.filter((t) => t.estado === "conflicto");
  if (enConflicto.length) {
    avisos.push({
      nivel: "bloquea",
      codigo: "conflicto_troza",
      mensaje: `${enConflicto.length} troza(s) chocan con el libro: ${enConflicto.slice(0, 3).map((t) => t.detalle).join(" ")}${enConflicto.length > 3 ? " …" : ""}`,
    });
  }

  // ── Talas referenciales ───────────────────────────────────────────────────
  const talas = armarTalas(trozas, destino, libro, opts.bajoDmc ?? new Map());
  for (const tala of talas.filter((x) => x.estado === "conflicto")) {
    avisos.push({
      nivel: "bloquea",
      codigo: "conflicto_tala",
      mensaje: tala.detalle ?? `El árbol ${tala.treeCode} choca con el libro.`,
      soloConTala: tala.soloConTala === true,
    });
  }

  return { trozas, talas, avisos, yaImportada, fecha };
}

/** Una troza del árbol, para armar su tala referencial. */
export interface PiezaDeTala {
  code: string;
  d1: number | null;
  d2: number | null;
  l: number | null;
  v: number | null;
}

/**
 * Las medidas de la tala referencial de un árbol, desde TODAS sus trozas en el
 * plan: largo = Σ largos, D1 = el mayor, D2 = el menor (o el D1 si la troza no
 * trae D2), m³ = Σ volúmenes — así T4 («trozado ≤ tala») cierra exacto. Una
 * sola regla para armarla al importar y para reducirla al deshacer otra guía.
 */
export function medidasDeTala(piezas: readonly PiezaDeTala[]): {
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumeM3: number | null;
} {
  const ds1 = piezas.map((p) => p.d1).filter((n): n is number => n != null);
  const ds2 = piezas.map((p) => p.d2 ?? p.d1).filter((n): n is number => n != null);
  const ls = piezas.map((p) => p.l).filter((n): n is number => n != null);
  const vs = piezas.map((p) => p.v).filter((n): n is number => n != null);
  return {
    diamMayorM: ds1.length ? Math.max(...ds1) : null,
    diamMenorM: ds2.length ? Math.min(...ds2) : null,
    lengthM: ls.length ? r2(ls.reduce((a, b) => a + b, 0)) : null,
    volumeM3: vs.length ? r4(vs.reduce((a, b) => a + b, 0)) : null,
  };
}

/**
 * Las talas referenciales por árbol. El volumen, el largo y los diámetros salen
 * de TODAS las trozas del árbol en el plan: las de esta guía que entran y las
 * que el libro ya tiene (vivas, del mismo plan).
 */
function armarTalas(
  trozas: readonly TrozaImportada[],
  destino: DestinoDeLaGuia,
  libro: LibroDeLaGuia,
  bajoDmc: ReadonlyMap<string, string>,
): TalaReferencial[] {
  const porArbol = new Map<string, TrozaImportada[]>();
  for (const t of trozas) {
    if (!t.treeCode) continue;
    const l = porArbol.get(t.treeCode) ?? [];
    l.push(t);
    porArbol.set(t.treeCode, l);
  }
  const talaDe = new Map(libro.talas.filter((t) => t.treeCode).map((t) => [t.treeCode as string, t]));
  const out: TalaReferencial[] = [];
  for (const [treeCode, deLaGuia] of porArbol) {
    const primera = deLaGuia[0];
    const delArbol = libro.trozados.filter((x) => x.treeCode === treeCode);
    const deOtroPlan = delArbol.filter((x) => x.planId !== destino.planId);
    const yaEnElPlan = delArbol.filter((x) => x.planId === destino.planId);
    const nuevas = deLaGuia.filter((t) => t.estado === "nueva");
    // Lo que suma el árbol en el plan después de importar: lo que ya estaba + lo nuevo.
    const piezas: PiezaDeTala[] = [
      ...yaEnElPlan.map((x) => ({ code: x.trozaCode ?? "", d1: x.diamMayorM, d2: x.diamMenorM, l: x.lengthM, v: x.volumeM3 })),
      ...nuevas.map((t) => ({ code: t.trozaCode, d1: t.diamMayorM, d2: t.diamMenorM, l: t.lengthM, v: t.volumeM3 })),
    ];
    const medidas = medidasDeTala(piezas);
    const suma = medidas.volumeM3;
    const base: TalaReferencial = {
      treeCode,
      trozas: piezas.map((p) => p.code).filter(Boolean),
      speciesCommon: primera.speciesCommon,
      speciesScientific: primera.speciesScientific,
      ...medidas,
      estado: "nueva",
      talaExistente: null,
      detalle: null,
    };
    const existente = talaDe.get(treeCode);
    if (existente) {
      const resumen = { lineNo: existente.lineNo, volumeM3: existente.volumeM3, planId: existente.planId };
      if (existente.planId !== destino.planId) {
        out.push({ ...base, estado: "conflicto", talaExistente: resumen, detalle: `El árbol ${treeCode} ya tiene tala (${queLinea(existente, "tala")}) en otro permiso: sus trozas no pueden ir a ${destino.nombre}.` });
        continue;
      }
      const cerrado = closedPeriodOf(libro.cierres, fechaDelLibro(existente.fecha));
      // Lo que el libro tendrá trozado del árbol (en TODO el negocio: T4 suma por código de árbol).
      const trozadoTotal = r4(delArbol.reduce((a, x) => a + (x.volumeM3 ?? 0), 0) + nuevas.reduce((a, t) => a + (t.volumeM3 ?? 0), 0));
      if (existente.referencial) {
        const agregar = nuevas.length > 0 || r4(existente.volumeM3 ?? 0) < r4(suma ?? 0);
        if (!agregar) {
          out.push({ ...base, estado: "existente", talaExistente: resumen, detalle: `Ya tiene su tala referencial (${queLinea(existente, "tala")}).` });
          continue;
        }
        if (cerrado) {
          out.push({ ...base, estado: "conflicto", talaExistente: resumen, detalle: `La tala referencial del árbol ${treeCode} (${queLinea(existente, "tala")}) está en ${cerrado.label}, que está cerrado: reábrelo para sumarle estas trozas.` });
          continue;
        }
        if (deOtroPlan.length) {
          out.push({ ...base, estado: "conflicto", talaExistente: resumen, detalle: `El árbol ${treeCode} también tiene trozas en otro permiso (${listaCodigos(deOtroPlan.map((x) => x.trozaCode ?? "—"))}).` });
          continue;
        }
        out.push({
          ...base,
          estado: "ampliar",
          talaExistente: resumen,
          detalle: `Su tala referencial (${queLinea(existente, "tala")}) pasa de ${(existente.volumeM3 ?? 0).toFixed(3)} a ${(suma ?? 0).toFixed(3)} m³ con ${listaCodigos(nuevas.map((t) => t.trozaCode))}.`,
        });
        continue;
      }
      // Tala medida en campo: se respeta; T4 tiene que cerrar con lo que entra.
      if (existente.volumeM3 != null && trozadoTotal > r4(existente.volumeM3)) {
        out.push({
          ...base,
          estado: "conflicto",
          talaExistente: resumen,
          detalle: `El árbol ${treeCode} se taló con ${existente.volumeM3.toFixed(3)} m³ (${queLinea(existente, "tala")}) y con estas trozas tendría ${trozadoTotal.toFixed(3)} m³ trozados: corrige la tala antes de importar.`,
        });
        continue;
      }
      out.push({ ...base, estado: "existente", talaExistente: resumen, detalle: `Se usa la tala medida en campo (${queLinea(existente, "tala")}).` });
      continue;
    }
    if (deOtroPlan.length) {
      out.push({
        ...base,
        estado: "conflicto",
        soloConTala: true,
        detalle: `El árbol ${treeCode} ya tiene trozas en otro permiso (${listaCodigos(deOtroPlan.map((x) => x.trozaCode ?? "—"))}): no se le arma tala acá.`,
      });
      continue;
    }
    const dmc = bajoDmc.get(treeCode);
    if (dmc) {
      out.push({
        ...base,
        estado: "conflicto",
        soloConTala: true,
        detalle: `${dmc} El importador no justifica: impórtala sin tala referencial o registra esa tala a mano con su motivo.`,
      });
      continue;
    }
    out.push({
      ...base,
      detalle: `Referencial: ${base.lengthM != null ? `${base.lengthM.toFixed(2)} m` : "largo —"} · ${(suma ?? 0).toFixed(3)} m³ de ${listaCodigos(base.trozas)}.`,
    });
  }
  return out;
}

/** ¿Este aviso cuenta con el interruptor de talas en `crearTala`? */
export const avisoAplica = (a: AvisoImportacion, crearTala: boolean): boolean => crearTala || !a.soloConTala;

/**
 * Qué talas se escriben con el interruptor como esté: `ampliar` SIEMPRE (si no,
 * las trozas nuevas del árbol pasan su tala referencial y T4 las frena); las
 * `nueva` sólo si se pidió crear talas. Apagado o prendido, cada `ampliar`
 * que crece pasa por T9 (`cupoAlAmpliarTalaEnTx`) y la vista previa lo avisa
 * en `sobreCupo.sinTala` (`cupoDeLaGuia`).
 */
export function talasAEscribir(talas: readonly TalaReferencial[], crearTala: boolean): TalaReferencial[] {
  return talas.filter((t) => t.estado === "ampliar" || (crearTala && t.estado === "nueva"));
}

/** Los avisos que dependen del plan elegido (con otro plan, pueden desaparecer). */
const DEPENDEN_DEL_PLAN = new Set<AvisoImportacion["codigo"]>(["conflicto_troza", "conflicto_tala", "especie_fuera_del_plan"]);

/**
 * El estado de la guía con el interruptor de talas como esté. Orden: ya está →
 * lo que bloquea por la guía misma (anulada, mes cerrado…) → falta elegir el
 * permiso → lo que bloquea contra el plan → lista.
 */
export function estadoDeLaRevision(
  rev: Pick<RevisionDeGuia, "avisos" | "yaImportada">,
  permiso: PermisoDetectado | null,
  crearTala: boolean,
  destinoElegido: boolean,
): EstadoVistaPrevia {
  if (rev.yaImportada) return "ya_importada";
  const bloquean = rev.avisos.filter((a) => a.nivel === "bloquea" && avisoAplica(a, crearTala));
  if (bloquean.some((a) => !DEPENDEN_DEL_PLAN.has(a.codigo))) return "bloqueada";
  if (permiso?.estado === "ambiguo" && !destinoElegido) return "elegir_permiso";
  return bloquean.length ? "bloqueada" : "lista";
}

/** La observación de la línea de Trozado importada. */
export function observacionTrozado(t: Pick<TrozaImportada, "sinCodigo">, gtfNumber: string, registro: string): string {
  const de = `Importada de la GTF ${gtfNumber}${registro ? ` (registro SERFOR ${registro})` : ""}`;
  return t.sinCodigo ? `${de}. Sin código en la guía.` : `${de}.`;
}

/** La observación de la tala referencial («Referencial desde la GTF … (trozas 12A, 12B)»). */
export function observacionTala(gtfs: readonly string[], trozas: readonly string[]): string {
  return `Referencial desde la GTF ${gtfs.join(", ")} (trozas ${listaCodigos([...trozas], 40)}). Medidas armadas de las trozas, no medidas en campo.`.slice(0, 2000);
}

/** La observación de la guía importada: de dónde vino. El N° de registro es lo que reconoce una reimportación. */
export function observacionGuia(registro: string, verificada: boolean): string {
  const r = registro ? ` · registro SERFOR ${registro}` : "";
  return verificada
    ? `Importada al Libro TH desde SERFOR${r} (ADR-461).`
    : `Importada al Libro TH desde una foto o PDF de la guía${r}, sin verificar en SERFOR (ADR-461).`;
}

/**
 * La nota del plan que crea la importación. Deshacer la reconoce (ADR-461 §12):
 * un plan creado por una importación que queda sin nada se da de baja.
 */
export function notaPlanImportado(gtfNumber: string, registro: string): string {
  return `Creado al importar la GTF ${gtfNumber}${registro ? ` (registro SERFOR ${registro})` : ""} (ADR-461).`;
}

/** La marca de `medicionCruda` de una tala referencial. */
export function marcaReferencial(
  tala: Pick<TalaReferencial, "lengthM" | "trozas">,
  gtfs: readonly string[],
  registros: readonly string[],
): MarcaReferencial {
  return {
    forma: "promedio",
    mayor: [],
    menor: [],
    totalM: tala.lengthM,
    descuentos: [],
    referencial: { gtfs: [...new Set(gtfs.filter(Boolean))], registros: [...new Set(registros.filter(Boolean))], trozas: [...tala.trozas] },
  };
}

// ── Resumen y clave ─────────────────────────────────────────────────────────

/** La identidad de la guía para la pantalla. */
export function resumenDeGuia(g: GtfSerfor, verificada: boolean): GuiaResumen {
  const est = estadoGtf(g);
  const trozas = trozasDeLaGuia(g);
  const declarado = g.volumenTotal ?? ((g.productos ?? []).reduce((a, p) => a + (Number(p.volumen) || 0), 0) || null);
  return {
    numeroRegistro: oNull(g.numeroRegistro),
    gtfNumber: oNull(g.gtfNumber),
    fecha: fechaIsoDeSerfor(g.fechaExpedicion),
    estadoSerfor: oNull(g.estado),
    anulada: est.anulada,
    titular: oNull(g.titular),
    representanteLegal: oNull(g.representanteLegal),
    numeroTitulo: oNull(g.numeroTitulo),
    origenRecurso: oNull(g.origenRecurso),
    destinatario: oNull(g.destinatario),
    volumenDeclaradoM3: declarado != null ? r4(declarado) : null,
    volumenTrozasM3: r4(trozas.reduce((a, t) => a + (t.volumeM3 ?? 0), 0)),
    piezas: trozas.length,
    especies: [...new Set(trozas.map((t) => t.speciesCommon).filter((s): s is string => !!s))],
    verificadaEnSerfor: verificada,
  };
}

/** La clave estable de una fuente (la pantalla empareja vista previa y resultado con ella). */
export function claveDeFuente(f: FuenteImportarGuia, indice: number): string {
  if (f.tipo === "serfor") return `serfor:${txt(f.numeroRegistro)}`;
  if (f.tipo === "ctp") return `ctp:${f.woodEntryId}`;
  return `ficha:${txt(f.ficha.numeroRegistro) || txt(f.ficha.gtfNumber) || indice}`;
}

/** Orden en que se importan: por fecha, después por N° (el árbol que viene en dos guías se arma en orden). */
export function ordenDeImportacion<T>(items: readonly T[], fechaDe: (x: T) => string | null, numeroDe: (x: T) => string | null): number[] {
  return items
    .map((x, i) => ({ i, f: fechaDe(x) ?? "9999-99-99", n: claveNumeroGtf(numeroDe(x)) ?? "" }))
    .sort((a, b) => a.f.localeCompare(b.f) || a.n.localeCompare(b.n, "es", { numeric: true }) || a.i - b.i)
    .map((x) => x.i);
}

/**
 * Lo que una guía deja en el libro, para que la siguiente de la MISMA tanda lo
 * vea en la vista previa (las dos del árbol 173, dos guías del mismo título nuevo).
 */
export function libroDespuesDe(
  libro: LibroDeLaGuia,
  g: GtfSerfor,
  destino: DestinoDeLaGuia,
  rev: RevisionDeGuia,
  crearTala: boolean,
): LibroDeLaGuia {
  const fecha = rev.fecha ?? "1970-01-01";
  const num = txt(g.gtfNumber);
  const trozados: LineaDelLibro[] = rev.trozas
    .filter((t) => t.estado === "nueva")
    .map((t, i) => ({
      id: `virtual:${num}:${i}`,
      lineNo: 0,
      section: "trozado",
      planId: destino.planId,
      treeCode: t.treeCode,
      trozaCode: t.trozaCode,
      speciesCommon: t.speciesCommon,
      speciesScientific: t.speciesScientific,
      diamMayorM: t.diamMayorM,
      diamMenorM: t.diamMenorM,
      lengthM: t.lengthM,
      volumeM3: t.volumeM3,
      fecha,
      referencial: null,
      gtfNumber: num,
    }));
  const escritas = talasAEscribir(rev.talas, crearTala);
  const talas = libro.talas.map((x) => {
    const amp = escritas.find((t) => t.estado === "ampliar" && t.treeCode === x.treeCode);
    return amp
      ? {
          ...x,
          volumeM3: amp.volumeM3,
          lengthM: amp.lengthM,
          referencial: { gtfs: [...(x.referencial?.gtfs ?? []), num], registros: [...(x.referencial?.registros ?? []), txt(g.numeroRegistro)], trozas: amp.trozas },
        }
      : x;
  });
  for (const t of escritas.filter((x) => x.estado === "nueva")) {
    talas.push({
      id: `virtual:${num}:tala:${t.treeCode}`,
      lineNo: 0,
      section: "tala",
      planId: destino.planId,
      treeCode: t.treeCode,
      trozaCode: null,
      speciesCommon: t.speciesCommon,
      speciesScientific: t.speciesScientific,
      diamMayorM: t.diamMayorM,
      diamMenorM: t.diamMenorM,
      lengthM: t.lengthM,
      volumeM3: t.volumeM3,
      fecha,
      referencial: { gtfs: [num], registros: [txt(g.numeroRegistro)], trozas: t.trozas },
      gtfNumber: num,
    });
  }
  return {
    ...libro,
    trozados: [...libro.trozados, ...trozados],
    talas,
    salidas: [
      ...libro.salidas,
      ...rev.trozas.map((t) => ({ trozaCode: t.trozaCode, section: "despacho_troza" as const, lineNo: 0, gtfNumber: num })),
    ],
    guias: [
      ...libro.guias,
      {
        id: `virtual:${num}`,
        gtfNumber: num,
        status: "emitida",
        titularName: txt(g.titular) || null,
        tituloHabilitante: txt(g.numeroTitulo) || null,
        planId: destino.nuevo ? null : destino.planId,
        observations: observacionGuia(txt(g.numeroRegistro), true),
      },
    ],
  };
}

// ── La vista previa de una tanda ────────────────────────────────────────────

/** «PMFI 10-HUA-PUE/PER-FMP-2026-007 · PEREZ MUÑOZ JUAN CARLOS». */
export function nombreDelPlan(p: { planType: string; planNumber: string | null; tituloHabilitante: string | null; titularName: string }): string {
  const codigo = txt(p.planNumber) || txt(p.tituloHabilitante);
  return [`${txt(p.planType)}${codigo ? ` ${codigo}` : ""}`, txt(p.titularName)].filter(Boolean).join(" · ");
}

/** A qué plan va la guía: el elegido, el detectado, o el que se crearía. */
export function destinoDe(
  g: GtfSerfor,
  permiso: PermisoDetectado,
  planElegido: string | null,
  planes: readonly PlanDelLibro[],
): { destino: DestinoDeLaGuia; elegido: boolean; error: string | null } {
  const desdePlan = (p: PlanDelLibro): DestinoDeLaGuia => ({
    planId: p.id,
    nuevo: false,
    plantacion: esPlanDePlantacion(p),
    especies: p.especies,
    nombre: nombreDelPlan(p),
  });
  const propuesta = permiso.estado === "existente" ? propuestaDePlan(g) : permiso.propuesta;
  const nuevo: DestinoDeLaGuia = {
    planId: llavePlanNuevo(g),
    nuevo: true,
    plantacion: propuesta.planType === "PLANTACION",
    especies: [],
    nombre: nombreDelPlan(propuesta),
  };
  if (planElegido) {
    const p = planes.find((x) => x.id === planElegido);
    return p
      ? { destino: desdePlan(p), elegido: true, error: null }
      : { destino: nuevo, elegido: false, error: "El plan elegido no existe en este negocio o está dado de baja: elige otro." };
  }
  if (permiso.estado === "existente") {
    const p = planes.find((x) => x.id === permiso.plan.planId);
    if (p) return { destino: desdePlan(p), elegido: true, error: null };
  }
  return { destino: nuevo, elegido: permiso.estado === "nuevo", error: null };
}

/** Una guía de la tanda, ya resuelta su fuente. */
export interface GuiaParaRevisar {
  clave: string;
  fuente: FuenteImportarGuia;
  ficha: GtfSerfor | null;
  verificada: boolean;
  /** SERFOR no la encontró / no respondió, o el ingreso no existe. */
  falla: { estado: "no_encontrada" | "sin_respuesta"; mensaje: string } | null;
  /** El plan que eligió la persona (o `null` = el detectado). */
  planElegido: string | null;
}

export interface ContextoImportacion {
  planes: PlanDelLibro[];
  contratos: ContratoDelLibro[];
  libro: LibroDeLaGuia;
  /** planId → (árbol → error de T8). Sólo de planes que existen. */
  bajoDmc: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

/**
 * Lo que la guía despacharía para T6: cada troza con la especie y el volumen
 * de SU línea de Trozado — la nueva, la de la guía; la que ya estaba, la del
 * libro (es la que mide el despacho). Las que chocan no salen.
 */
function despachoDeLaGuia(trozas: readonly TrozaImportada[], libro: LibroDeLaGuia, planId: string): DespachoT6[] {
  return trozas.flatMap((t): DespachoT6[] => {
    if (t.estado === "nueva") return [{ speciesCommon: t.speciesCommon, speciesScientific: t.speciesScientific, volumeM3: t.volumeM3 }];
    if (t.estado !== "ya_trozada") return [];
    const tz = libro.trozados.find((x) => x.trozaCode === t.trozaCode && x.planId === planId);
    return tz ? [{ speciesCommon: tz.speciesCommon, speciesScientific: tz.speciesScientific, volumeM3: tz.volumeM3 }] : [];
  });
}

/** La línea de la guía según su estado (también la usa `rehacerTanda`). */
export function mensajeDelEstado(
  estado: EstadoVistaPrevia,
  rev: Pick<RevisionDeGuia, "avisos" | "yaImportada">,
  permiso: PermisoDetectado,
  crearTala: boolean,
): string | null {
  if (estado === "ya_importada") {
    const y = rev.yaImportada;
    return y ? `Ya está en el libro: GTF ${y.gtfNumber}.` : "Ya está en el libro.";
  }
  if (estado === "bloqueada") {
    return rev.avisos.find((a) => a.nivel === "bloquea" && avisoAplica(a, crearTala))?.mensaje ?? null;
  }
  if (estado === "elegir_permiso" && permiso.estado === "ambiguo") {
    return `Hay ${permiso.candidatos.length} permisos con el código ${permiso.candidatos[0]?.codigo ?? ""}: elige a cuál va.`;
  }
  return null;
}

/**
 * La vista previa de varias guías. Se revisan en el orden en que se
 * importarían (por fecha) y cada una ve lo que dejan las anteriores de la
 * tanda; las respuestas salen en el orden pedido.
 *
 * Sale la revisión BASE (con `base`): T6 y T9 dependen de qué guías de la
 * tanda van marcadas, así que los suma `rehacerTanda`
 * (`loth-importar-guia-tanda`), que corre el servidor con todas y la pantalla
 * con las marcadas.
 */
export function vistaPreviaDeTanda(guias: readonly GuiaParaRevisar[], ctx: ContextoImportacion): GuiaVistaPrevia[] {
  const out: GuiaVistaPrevia[] = new Array(guias.length);
  let libro = ctx.libro;
  const orden = ordenDeImportacion(
    guias,
    (x) => (x.ficha ? fechaIsoDeSerfor(x.ficha.fechaExpedicion) : null),
    (x) => x.ficha?.gtfNumber ?? null,
  );
  for (const i of orden) {
    const x = guias[i];
    const vacio = { permiso: null, trozas: [], talas: [], crearTalaPorDefecto: false, avisos: [], ficha: null, directorio: null };
    if (x.falla || !x.ficha) {
      const estado = x.falla?.estado ?? "no_encontrada";
      out[i] = {
        clave: x.clave,
        fuente: x.fuente,
        estado,
        estadoSinTala: estado,
        mensaje: x.falla?.mensaje ?? "No hay ficha de la guía.",
        guia: null,
        ...vacio,
      };
      continue;
    }
    const g = x.ficha;
    const permiso = detectarPermiso(g, ctx.planes, ctx.contratos);
    const { destino, elegido, error } = destinoDe(g, permiso, x.planElegido, ctx.planes);
    const crearTala = !destino.plantacion;
    const rev = revisarGuia(g, destino, libro, {
      verificada: x.verificada,
      bajoDmc: destino.nuevo ? undefined : ctx.bajoDmc.get(destino.planId),
    });
    if (error) rev.avisos.unshift({ nivel: "bloquea", codigo: "ambiguo", mensaje: error });
    if (permiso.estado === "ambiguo" && !elegido) {
      rev.avisos.unshift({
        nivel: "atencion",
        codigo: "ambiguo",
        mensaje: `Hay ${permiso.candidatos.length} permisos con este código (${permiso.candidatos.map((c) => c.titularName).join(" / ")}): elige a cuál va.`,
      });
    }
    const estado = estadoDeLaRevision(rev, permiso, crearTala, elegido);
    const estadoSinTala = estadoDeLaRevision(rev, permiso, false, elegido);
    out[i] = {
      clave: x.clave,
      fuente: x.fuente,
      estado,
      estadoSinTala,
      mensaje: mensajeDelEstado(estado, rev, permiso, crearTala),
      guia: resumenDeGuia(g, x.verificada),
      permiso,
      trozas: rev.trozas,
      talas: rev.talas,
      crearTalaPorDefecto: crearTala,
      avisos: rev.avisos,
      /* Todos los datos de la guía, para mirarlos antes de importar (sin la lista: va en `trozas`). */
      ficha: fichaParaMostrar(g),
      /* Lo llena el servidor después, con el directorio del negocio (`ForestLothImportarDirectorioDB`). */
      directorio: null,
      sobreCupo: null,
      sobreAutorizado: null,
      base: {
        planId: destino.nuevo ? null : destino.planId,
        plantacion: destino.plantacion,
        elegido,
        yaImportada: rev.yaImportada != null,
        avanzaLibro: estado === "lista",
        avisos: [...rev.avisos],
        talas: rev.talas,
        despachoT6: destino.nuevo ? [] : despachoDeLaGuia(rev.trozas, libro, destino.planId),
      },
    };
    if (estado === "lista") libro = libroDespuesDe(libro, g, destino, rev, crearTala);
  }
  return out;
}
