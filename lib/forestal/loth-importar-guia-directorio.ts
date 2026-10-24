/**
 * El directorio desde una guía que se importa al Libro TH (ADR-461, 02-10
 * noche). Brandon: «opción para poder guardar en el directorio si es dato o
 * permiso nuevo: RUC nuevo, razón social nueva, permiso nuevo → agregar al
 * directorio para luego reutilizar».
 *
 * La guía nombra hasta cuatro partes (titular, propietario del producto,
 * destinatario y transportista-conductor), un vehículo y un permiso. Esto los
 * arma desde la ficha y los cruza con el directorio del negocio:
 *
 *  - una parte se reconoce por su DOCUMENTO (tipo + número), como el alta del
 *    directorio (`ForestDirectorioDB.guardarParte`); sin documento, sólo por el
 *    nombre exacto (las mismas palabras) y nada más que para avisar: no se
 *    completa una ficha que no se pudo identificar;
 *  - el vehículo, por su placa normalizada; el permiso, por su código tramo a
 *    tramo (`claveTitulo`, como el importador);
 *  - el propio negocio (RUC de la Ficha del CTP) no se ofrece.
 *
 * Reglas que vienen de mediciones (memorias `providerdocument-serfor-…`,
 * `serfor-publica-texto-danado-muaoz`, `directorio-vs-providername-del-libro`):
 *  - `rucInstancia` es el RUC de la ATFFS que registró la guía, NUNCA el del
 *    titular. El del titular es el del propietario SÓLO si es la misma persona
 *    (`documentoDelTitular`); si no, la guía no lo publica y se dice.
 *  - El destinatario puede venir «RUC / DNI» en un campo (`separarDocumento`).
 *  - La ficha se repara antes («MUÃ?OZ»): sin eso, propietario y titular no
 *    serían la misma persona.
 *  - El directorio escribe a la comunidad distinto que la guía («COMUNIDAD
 *    NATIVA SANTA ROSA…» vs «COMUNIDAD SANTA ROSA…»): el mismo documento con
 *    otro nombre se avisa, no se pisa.
 *
 * PURO y client-safe.
 */

import type { GtfSerfor } from "./serfor-gtf";
import { separarDocumento } from "./serfor-gtf-campos";
import { documentoDelTitular, mismaPersona } from "./serfor-titular";
import { repararFichaSerfor } from "./serfor-texto-danado";
import { claveTitulo, placasDeLaGuia, sinRaya, tipoPlanDeLaGuia } from "./loth-importar-guia";
import { siglaDePlan } from "./loth-tipos-plan";
import { tipoDesdeCodigo } from "./contratos";
import {
  motivoDocInvalido,
  motivoPlacaVehiculo,
  nombresDelLibroQueCoinciden,
  normalizarDocumento,
  normalizarPlaca,
  type RolParte,
} from "./directorio";
import type {
  CampoParteGuia,
  ClaveParteGuia,
  DatosParteGuia,
  DirectorioDeLaGuia,
  ParteEnLaGuia,
  PermisoEnLaGuia,
  VehiculoEnLaGuia,
} from "./loth-importar-guia-tipos";

const txt = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
/** Vacío o con rayas («-») = sin dato. */
const dato = (v: string | null | undefined): string | null => sinRaya(v) || null;

// ── Lo que la guía trae ─────────────────────────────────────────────────────

/** Una parte de la guía, antes de mirar el directorio. */
export type ParteArmada = Omit<ParteEnLaGuia, "estado" | "existente" | "parecida">;
export type VehiculoArmado = Pick<VehiculoEnLaGuia, "placa" | "placaRemolque" | "tipo">;
export type PermisoArmado = Omit<PermisoEnLaGuia, "estado" | "existente" | "aviso">;

export interface DirectorioArmado {
  partes: ParteArmada[];
  vehiculo: VehiculoArmado | null;
  permiso: PermisoArmado | null;
}

const SIN_DATOS: DatosParteGuia = {
  direccion: null,
  region: null,
  provincia: null,
  distrito: null,
  licencia: null,
  tituloHabilitante: null,
  resolucion: null,
  planManejo: null,
  arffs: null,
  representante: null,
};

/** El documento de un casillero: 11 dígitos = RUC; 8 = DNI. Lo demás no se adivina. */
export function documentoDeCasillero(crudo: string | null | undefined): { docTipo: "RUC" | "DNI" | null; docNumero: string | null } {
  const { ruc, dni } = separarDocumento(crudo);
  if (ruc) return { docTipo: "RUC", docNumero: ruc };
  if (dni.length === 8) return { docTipo: "DNI", docNumero: dni };
  return { docTipo: null, docNumero: null };
}

/** Las partes, el vehículo y el permiso que nombra la guía. */
export function armarDirectorio(ficha: GtfSerfor): DirectorioArmado {
  const g = repararFichaSerfor(ficha);
  const partes: ParteArmada[] = [];
  const titular = dato(g.titular);
  const propietario = dato(g.propietario);
  const mismo = !!titular && !!propietario && mismaPersona(titular, propietario);

  if (titular) {
    const doc = documentoDelTitular(g);
    const codigo = dato(g.numeroTitulo);
    partes.push({
      clave: "titular",
      papel: mismo ? "Titular y propietario" : "Titular del permiso",
      roles: ["proveedor"],
      nombre: titular,
      docTipo: doc?.tipo ?? null,
      docNumero: doc?.numero ?? null,
      datos: {
        ...SIN_DATOS,
        /* Cuando es el mismo, el domicilio va ENTERO del propietario (16-19: la
           dirección con su ubigeo). El ubigeo de la guía (10-12) es el del ORIGEN
           del recurso, no el del domicilio: mezclarlo con la «dirección del
           titular» daba un domicilio que no existe. */
        direccion: mismo ? (dato(g.propietarioDireccion) ?? dato(g.direccionTitular)) : dato(g.direccionTitular),
        region: mismo ? dato(g.propietarioDepartamento) : null,
        provincia: mismo ? dato(g.propietarioProvincia) : null,
        distrito: mismo ? dato(g.propietarioDistrito) : null,
        tituloHabilitante: codigo,
        resolucion: dato(g.numeroResolucion),
        /* El plan lo decide el título (memoria `permisos-del-titular-adr425`). */
        planManejo: codigo ? siglaDePlan(tipoPlanDeLaGuia(g.origenRecurso, codigo)) : null,
        arffs: dato(g.instanciaRegistra),
        representante: dato(g.representanteLegal),
      },
      aviso: doc ? null : "La guía no publica el RUC ni el DNI del titular: escríbelo si lo tienes.",
    });
  }
  if (propietario && !mismo) {
    partes.push({
      clave: "propietario",
      papel: "Propietario del producto",
      roles: ["proveedor"],
      nombre: propietario,
      ...documentoDeCasillero(g.propietarioDoc),
      datos: {
        ...SIN_DATOS,
        direccion: dato(g.propietarioDireccion),
        region: dato(g.propietarioDepartamento),
        provincia: dato(g.propietarioProvincia),
        distrito: dato(g.propietarioDistrito),
      },
      aviso: null,
    });
  }
  const destinatario = dato(g.destinatario);
  if (destinatario) {
    partes.push({
      clave: "destinatario",
      papel: "Destinatario",
      roles: ["destinatario"],
      nombre: destinatario,
      ...documentoDeCasillero(g.destinatarioDoc),
      datos: {
        ...SIN_DATOS,
        direccion: dato(g.destinatarioDireccion),
        region: dato(g.destinatarioDepartamento),
        provincia: dato(g.destinatarioProvincia),
        distrito: dato(g.destinatarioDistrito),
      },
      aviso: null,
    });
  }
  const transportista = dato(g.transportista);
  if (transportista) {
    /* SERFOR lo publica como «TRANSPORTISTA» con su DNI y su licencia: es quien
       maneja (casillero 32). Se guarda con los dos papeles. */
    partes.push({
      clave: "transportista",
      papel: "Transportista y conductor",
      roles: ["transportista", "conductor"],
      nombre: transportista,
      ...documentoDeCasillero(g.transportistaDni),
      datos: { ...SIN_DATOS, licencia: dato(g.licenciaConducir) },
      aviso: null,
    });
  }

  const placas = placasDeLaGuia(g.placa);
  const vehiculo: VehiculoArmado | null = placas.placa
    ? { placa: placas.placa, placaRemolque: placas.remolque || null, tipo: dato(g.tipoVehiculo) }
    : null;

  const codigo = dato(g.numeroTitulo);
  const permiso: PermisoArmado | null = codigo
    ? {
        codigo,
        tipo: tipoDesdeCodigo(codigo),
        titularNombre: titular ?? "(por confirmar)",
        resolucionNumero: dato(g.numeroResolucion),
        arffs: dato(g.instanciaRegistra),
        region: dato(g.departamento),
        provincia: dato(g.provincia),
        distrito: dato(g.distrito),
      }
    : null;

  return { partes, vehiculo, permiso };
}

// ── Lo que el directorio ya tiene ───────────────────────────────────────────

/** Una ficha del directorio, en lo que hace falta para compararla (`Parte` encaja). */
export interface ParteDelDirectorio {
  id: string;
  nombre: string;
  roles: RolParte[];
  docTipo: string | null;
  docNumero: string | null;
  direccion: string | null;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  licencia: string | null;
  tituloHabilitante: string | null;
  resolucion: string | null;
  planManejo: string | null;
  arffs: string | null;
  representante: string | null;
}

export interface VehiculoDelDirectorio {
  id: string;
  placa: string;
  placaRemolque: string | null;
  tipo: string | null;
}

/** Un permiso (`ForestContrato`) vivo (`Contrato` encaja). */
export interface PermisoDelDirectorio {
  id: string;
  codigo: string;
  titularNombre: string;
  titularId: string | null;
  resolucionNumero: string | null;
  arffs: string | null;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  planId: string | null;
}

export interface ContextoDirectorio {
  /** Por `claveDocumento` («RUC:20605859438»). */
  partesPorDocumento: ReadonlyMap<string, ParteDelDirectorio>;
  /** Para reconocer por el nombre a quien la guía nombra sin documento. */
  partes: readonly ParteDelDirectorio[];
  /** Por placa normalizada. */
  vehiculos: ReadonlyMap<string, VehiculoDelDirectorio>;
  permisos: readonly PermisoDelDirectorio[];
  /** El RUC de la Ficha del CTP (sólo dígitos): el propio negocio no se ofrece. */
  rucPropio: string | null;
}

export const claveDocumento = (docTipo: string, docNumero: string) => `${docTipo}:${normalizarDocumento(docNumero)}`;

/** Los documentos y las placas que hay que buscar en el directorio para estas guías. */
export function aBuscar(armados: readonly DirectorioArmado[]): {
  documentos: { docTipo: "RUC" | "DNI"; docNumero: string }[];
  placas: string[];
  hayPartesSinDocumento: boolean;
} {
  const docs = new Map<string, { docTipo: "RUC" | "DNI"; docNumero: string }>();
  const placas = new Set<string>();
  let sinDoc = false;
  for (const a of armados) {
    for (const p of a.partes) {
      if (p.docTipo && p.docNumero) docs.set(claveDocumento(p.docTipo, p.docNumero), { docTipo: p.docTipo, docNumero: normalizarDocumento(p.docNumero) });
      else sinDoc = true;
    }
    if (a.vehiculo) placas.add(normalizarPlaca(a.vehiculo.placa));
  }
  return { documentos: [...docs.values()], placas: [...placas].filter(Boolean), hayPartesSinDocumento: sinDoc };
}

// ── El cruce ────────────────────────────────────────────────────────────────

const CAMPOS_PARTE: readonly CampoParteGuia[] = [
  "direccion",
  "region",
  "provincia",
  "distrito",
  "licencia",
  "tituloHabilitante",
  "resolucion",
  "planManejo",
  "arffs",
  "representante",
];

/** Cómo se lee cada dato que se completa («Se completa: dirección, licencia»). */
export const ETIQUETA_DATO: Record<string, string> = {
  direccion: "dirección",
  region: "departamento",
  provincia: "provincia",
  distrito: "distrito",
  licencia: "licencia",
  tituloHabilitante: "título habilitante",
  resolucion: "resolución",
  planManejo: "plan de manejo",
  arffs: "ARFFS",
  representante: "representante legal",
  tipo: "tipo de vehículo",
  placaRemolque: "placa del remolque",
  titular: "titular",
  titularNombre: "nombre del titular",
  resolucionNumero: "resolución",
};

/** La misma persona aunque se escriba distinto («COMUNIDAD NATIVA SANTA ROSA…» = «COMUNIDAD SANTA ROSA…»). */
export const mismoNombre = (a: string, b: string): boolean =>
  mismaPersona(a, b) || nombresDelLibroQueCoinciden(a, [b]).length > 0 || nombresDelLibroQueCoinciden(b, [a]).length > 0;

const vacio = (v: string | null | undefined) => !txt(v);
/** Un titular «por confirmar» (sembrado sin titular) no es un nombre escrito. */
const titularPorConfirmar = (v: string | null | undefined) => /^\(?\s*por confirmar\s*\)?$|^[—–\s-]*$/i.test(txt(v));

function cruzarParte(p: ParteArmada, ctx: ContextoDirectorio): ParteEnLaGuia {
  const num = normalizarDocumento(p.docNumero ?? "");
  if (num && ctx.rucPropio && num === ctx.rucPropio) {
    return { ...p, estado: "propio", existente: null, parecida: null, aviso: "Es tu negocio: no hace falta agregarlo." };
  }
  if (num && p.docTipo) {
    const d = ctx.partesPorDocumento.get(claveDocumento(p.docTipo, num));
    if (d) {
      const igual = mismoNombre(d.nombre, p.nombre);
      return {
        ...p,
        estado: "existe",
        existente: {
          id: d.id,
          nombre: d.nombre,
          por: "documento",
          mismoNombre: igual,
          faltan: CAMPOS_PARTE.filter((k) => p.datos[k] && vacio(d[k])),
          rolesQueFaltan: p.roles.filter((r) => !d.roles.includes(r)),
        },
        parecida: null,
        aviso: igual ? null : `En tu directorio este ${p.docTipo} figura como «${d.nombre}»: revisa que sea la misma antes de completarla.`,
      };
    }
    const motivo = motivoDocInvalido(p.docTipo, num);
    const parecida = ctx.partes.find((x) => mismaPersona(x.nombre, p.nombre) && normalizarDocumento(x.docNumero ?? "") !== num);
    return {
      ...p,
      estado: "nuevo",
      existente: null,
      parecida: parecida ? { id: parecida.id, nombre: parecida.nombre, docTipo: parecida.docTipo, docNumero: parecida.docNumero } : null,
      aviso: motivo
        ? `El ${p.docTipo} que trae la guía no sirve: ${motivo}`
        : parecida
          ? `Ya tienes a «${parecida.nombre}»${parecida.docNumero ? ` con ${parecida.docTipo ?? "documento"} ${parecida.docNumero}` : " sin documento"}: revisa si es la misma antes de agregarla.`
          : p.aviso,
    };
  }
  /* Sin documento: por el nombre exacto (las mismas palabras), sólo para avisar. */
  const porNombre = ctx.partes.find((x) => mismaPersona(x.nombre, p.nombre));
  if (porNombre) {
    return {
      ...p,
      estado: "existe",
      existente: { id: porNombre.id, nombre: porNombre.nombre, por: "nombre", mismoNombre: true, faltan: [], rolesQueFaltan: [] },
      parecida: null,
      aviso: "La guía no trae su documento: se reconoció por el nombre. Para completarla, búscala en el Directorio.",
    };
  }
  return { ...p, estado: "nuevo", existente: null, parecida: null };
}

function cruzarVehiculo(v: VehiculoArmado, ctx: ContextoDirectorio): VehiculoEnLaGuia {
  const d = ctx.vehiculos.get(normalizarPlaca(v.placa));
  if (d) {
    const faltan = [v.tipo && vacio(d.tipo) ? "tipo" : null, v.placaRemolque && vacio(d.placaRemolque) ? "placaRemolque" : null].filter(
      (x): x is string => !!x,
    );
    return {
      ...v,
      estado: "existe",
      existente: { id: d.id, nombre: d.placa, por: "placa", mismoNombre: true, faltan, rolesQueFaltan: [] },
      aviso: null,
    };
  }
  const invalida = motivoPlacaVehiculo({ placa: v.placa, placaRemolque: v.placaRemolque, tipo: v.tipo });
  return invalida
    ? { ...v, estado: "no_valido", existente: null, aviso: `La placa de la guía no se puede guardar: ${invalida.motivo}` }
    : { ...v, estado: "nuevo", existente: null, aviso: null };
}

function cruzarPermiso(p: PermisoArmado, ctx: ContextoDirectorio, hayTitular: boolean): PermisoEnLaGuia {
  const clave = claveTitulo(p.codigo);
  const d = clave ? ctx.permisos.find((c) => claveTitulo(c.codigo) === clave) : undefined;
  if (!d) return { ...p, estado: "nuevo", existente: null, aviso: null };
  const sinTitular = titularPorConfirmar(d.titularNombre);
  const faltan = [
    hayTitular && !d.titularId ? "titular" : null,
    sinTitular && !titularPorConfirmar(p.titularNombre) ? "titularNombre" : null,
    p.resolucionNumero && vacio(d.resolucionNumero) ? "resolucionNumero" : null,
    p.arffs && vacio(d.arffs) ? "arffs" : null,
    p.region && vacio(d.region) ? "region" : null,
    p.provincia && vacio(d.provincia) ? "provincia" : null,
    p.distrito && vacio(d.distrito) ? "distrito" : null,
  ].filter((x): x is string => !!x);
  const igual = sinTitular || mismoNombre(d.titularNombre, p.titularNombre);
  return {
    ...p,
    estado: "existe",
    existente: {
      id: d.id,
      nombre: d.codigo,
      por: "codigo",
      mismoNombre: igual,
      faltan,
      rolesQueFaltan: [],
      titularId: d.titularId,
      planId: d.planId,
    },
    aviso: igual ? null : `En tu directorio el permiso figura con el titular «${d.titularNombre}».`,
  };
}

/** Cada parte, el vehículo y el permiso de la guía frente al directorio. */
export function cruzarConDirectorio(armado: DirectorioArmado, ctx: ContextoDirectorio): DirectorioDeLaGuia {
  return {
    partes: armado.partes.map((p) => cruzarParte(p, ctx)),
    vehiculo: armado.vehiculo ? cruzarVehiculo(armado.vehiculo, ctx) : null,
    permiso: armado.permiso ? cruzarPermiso(armado.permiso, ctx, armado.partes.some((x) => x.clave === "titular")) : null,
  };
}

/** Lo que se guarda al COMPLETAR una parte: sólo los datos que le faltan (y sus papeles). */
export function datosParaCompletar(p: ParteEnLaGuia): Partial<Record<CampoParteGuia, string>> {
  const out: Partial<Record<CampoParteGuia, string>> = {};
  for (const k of p.existente?.faltan ?? []) {
    const v = p.datos[k as CampoParteGuia];
    if (v) out[k as CampoParteGuia] = v;
  }
  return out;
}

/** «dirección, licencia» — para el resumen de lo que se completa. */
export const listaDeDatos = (claves: readonly string[]) => claves.map((k) => ETIQUETA_DATO[k] ?? k).join(", ");

/** ¿Hay algo que completar en esta ficha? */
export const hayQueCompletar = (e: { faltan: readonly string[]; rolesQueFaltan: readonly string[] } | null | undefined) =>
  !!e && (e.faltan.length > 0 || e.rolesQueFaltan.length > 0);

/** Las partes de la guía en el orden en que se guardan: el titular primero (el permiso lo necesita). */
export const ORDEN_PARTES: readonly ClaveParteGuia[] = ["titular", "propietario", "destinatario", "transportista"];
