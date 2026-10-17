/**
 * La libreta de la guía (el Directorio visto desde un bloque de la GTF), sin
 * React: categorías, búsqueda, orden y la ficha que se muestra ANTES de usar.
 *
 * Brandon 16-10-2026: «tiene que estar mejor organizado, clasificado, ordenado
 * por categoría para usarlo mejor, y al seleccionarlo tendrá una vista de sus
 * datos que se guarda cada libreta para elegir mejor la información».
 *
 * La ficha separa lo que SALE en la hoja de la guía (con su casillero del
 * formato 2024, RDE D000014-2024-MIDAGRI-SERFOR-DE) de lo interno, que queda en
 * la libreta y en el sistema. Sólo se numeran los casilleros que el formato
 * 2024 numera para esos bloques: (17)-(20) partida y (21)-(24) destinatario.
 */

import {
  ROL_LABEL,
  claveBusqueda,
  direccionCompleta,
  esTipoEstablecimiento,
  faltantesParaGuia,
  formatearPlaca,
  motivoPlacaVehiculo,
  normalizarDocumento,
  normalizarNombre,
  normalizarPlaca,
  parteAInput,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
  type Vehiculo,
} from "./directorio";
import type { PartidaTraslado } from "./ctp-gtf-datos";
import { limaDateKey } from "@/lib/utils";

// ── Lo que la guía tiene escrito de una parte ──────────────────────────────

/** Los campos de un bloque de la guía que la libreta sabe leer y completar. */
export interface ValorParte {
  nombre: string;
  docTipo: DocTipo;
  docNumero: string;
  direccion: string;
  /** Ubigeo: (17)-(19) del propietario, (24) del destinatario, (20) de la partida. */
  departamento?: string;
  provincia?: string;
  distrito?: string;
  /** Transportista. */
  registroMtc?: string;
  /** Conductor. */
  licencia?: string;
  /** (18) del establecimiento de partida / (22) del destinatario → `codigoCtp` de la ficha. */
  autorizacion?: string;
  /** (19) del establecimiento de partida → `tipoEstablecimiento` de la ficha (ADR-493). */
  tipoEstablecimiento?: string;
  /** Internos del establecimiento de partida: no salen en la guía. */
  encargado?: string;
  telefono?: string;
  referencia?: string;
}

/**
 * «Guardar en la libreta» desde un bloque de la guía: TODO lo escrito, no sólo
 * nombre, documento y dirección (revisión 15-10-2026: se perdían el (18), el
 * encargado, el teléfono y la referencia, y al volver a elegirla la partida
 * quedaba con esos campos en blanco). Sin `id`: el Directorio une por documento
 * y escribe sólo lo que trae valor, así que lo vacío se omite.
 */
export function parteInputDesdeValor(v: ValorParte, rol: RolParte): ParteInput {
  /* «No aplica» es lo que se imprime en un casillero vacío, no un dato de la ficha. */
  const t = (x: string | undefined) => {
    const v = x?.trim();
    return v && !/^no aplica$/i.test(v) ? v : undefined;
  };
  const docNumero = normalizarDocumento(v.docNumero ?? "");
  const tipo = t(v.tipoEstablecimiento);
  const campos: Record<string, string | undefined> = {
    docNumero: docNumero || undefined,
    direccion: t(v.direccion),
    region: t(v.departamento),
    provincia: t(v.provincia),
    distrito: t(v.distrito),
    registroMtc: t(v.registroMtc),
    licencia: t(v.licencia),
    codigoCtp: t(v.autorizacion),
    /* Sólo un tipo de la lista: uno escrito a mano en una guía vieja haría que
       el Zod del Directorio rechazara el guardado entero. */
    tipoEstablecimiento: esTipoEstablecimiento(tipo) ? tipo : undefined,
    contactoNombre: t(v.encargado),
    telefono: t(v.telefono),
    acopioReferencia: t(v.referencia),
  };
  const conValor = Object.fromEntries(Object.entries(campos).filter(([, x]) => x !== undefined)) as Partial<ParteInput>;
  return { roles: [rol], nombre: normalizarNombre(v.nombre), docTipo: v.docTipo, ...conValor } as ParteInput;
}

/**
 * Lo que la libreta copia al bloque: nombre, documento, dirección y el ubigeo
 * en sus columnas (aplanado en `direccion` salía dos veces impreso y dejaba los
 * casilleros vacíos), más el registro MTC al transportista y el (18)/(19) del
 * establecimiento. Los internos (encargado, teléfono…) no: la partida los lee
 * de la ficha en `onElegir`.
 */
export function aLaGuia(v: ValorParte, rol: RolParte): Partial<ValorParte> {
  const { nombre, docTipo, docNumero, direccion, departamento = "", provincia = "", distrito = "", registroMtc = "" } = v;
  /* Un establecimiento recién dado de alta no pasa por `onElegir`: el (18) y el
     (19) elegidos en el alta van directo a la partida (sólo si traen valor). */
  const partida =
    rol === "establecimiento"
      ? { ...(v.autorizacion?.trim() ? { autorizacion: v.autorizacion.trim() } : {}), ...(v.tipoEstablecimiento?.trim() ? { tipoEstablecimiento: v.tipoEstablecimiento.trim() } : {}) }
      : {};
  return { nombre, docTipo, docNumero, direccion, departamento, provincia, distrito, ...(rol === "transportista" ? { registroMtc } : {}), ...partida };
}

/**
 * Lo que la ficha elegida trae a la partida además de nombre y dirección: el
 * (18) sale del código guardado y el (19) del tipo guardado (ADR-493). Sin tipo
 * en la ficha el (19) se limpia: el del establecimiento anterior no es el de éste.
 */
export function internosDePartida(p: Parte): Partial<PartidaTraslado> {
  return {
    modo: "establecimiento",
    tipoEstablecimiento: p.tipoEstablecimiento ?? "",
    autorizacion: p.codigoCtp ?? "",
    referencia: p.acopioReferencia ?? "",
    encargado: p.contactoNombre ?? "",
    telefono: p.contactoTelefono || p.telefono || "",
  };
}

/** Lo que le falta para ir en la guía con este papel, dicho al elegirla y no al imprimir. */
export function avisoDeFaltantes(p: Parte, rol: RolParte, prefijo: string): string {
  const faltan = faltantesParaGuia(p, rol);
  return faltan.length === 0 ? `${prefijo}.` : `${prefijo}, pero para la guía le falta ${faltan.join(" y ")}: complétalo en los campos de abajo.`;
}

// ── «Guardar en la libreta» sin pisar otra ficha (revisión 16-10) ──────────

/** El local que se iba a guardar choca con la ficha de su mismo RUC. */
export interface ChoqueDeLocal {
  existente: Parte;
  /** Lo que esa ficha ya tiene y se pisaría: su dirección, o su N° de autorización. */
  tiene: string;
}

/** El «Guardar en la libreta» de los bloques: con `aparte`, el local va como otra ficha. */
export type GuardarEnLibreta = (v: ValorParte, rol: RolParte, aparte?: boolean) => Promise<ChoqueDeLocal | void>;

export type PlanGuardado = { choque: ChoqueDeLocal } | { input: ParteInput & { id?: string } };

/** Nombre o dirección comparables: sin tildes, mayúsculas, puntos ni espacios dobles («Jr. Ucayali» = «JR UCAYALI»). */
const claveLocal = (x: string | null | undefined) =>
  claveBusqueda(x ?? "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

/**
 * Qué le manda «Guardar en la libreta» al Directorio. El servidor une por
 * documento y escribe lo que trae valor (`soloConValor`), así que:
 *
 *  - Un **establecimiento** cuyo RUC ya tiene ficha con OTRA dirección u otro
 *    N° de autorización no se guarda encima: el depósito le cambiaba el
 *    domicilio fiscal, el ubigeo, el (18) y el contacto a su empresa. Se
 *    pregunta (`choque`); con `aparte` va como otra ficha SIN documento (la
 *    libreta admite una sola por RUC) y con el RUC en las notas.
 *  - **Sin documento**, o un local que ya se guardó aparte: si hay una ficha sin
 *    documento con el mismo nombre y la misma dirección, se actualiza ésa (antes
 *    cada guardado de una partida sin RUC sumaba un duplicado).
 */
export function planGuardado(v: ValorParte, rol: RolParte, partes: readonly Parte[], aparte = false): PlanGuardado {
  const base = parteInputDesdeValor(v, rol);
  const doc = base.docNumero;
  const delDoc = doc ? partes.find((p) => p.docTipo === base.docTipo && p.docNumero === doc) : undefined;
  const sinDoc = { ...base, docTipo: undefined, docNumero: undefined };

  const nombre = claveLocal(v.nombre);
  const direccion = claveLocal(v.direccion);
  const local = partes.find((p) => !p.docNumero && claveLocal(p.nombre) === nombre && claveLocal(p.direccion) === direccion);
  /* Con otro papel y una ficha del documento, manda el documento: es la misma empresa. */
  if (local && (!delDoc || rol === "establecimiento")) {
    const nuevo = delDoc ? sinDoc : base;
    return { input: { ...parteAInput(local), ...nuevo, roles: [...new Set([...local.roles, rol])], activo: true } };
  }

  if (rol === "establecimiento" && delDoc) {
    const aut = base.codigoCtp ?? "";
    const otraDireccion = Boolean(direccion && delDoc.direccion && claveLocal(delDoc.direccion) !== direccion);
    const otraAutorizacion = Boolean(aut && delDoc.codigoCtp && claveLocal(delDoc.codigoCtp) !== claveLocal(aut));
    if (otraDireccion || otraAutorizacion) {
      if (!aparte) {
        const tiene = otraDireccion ? direccionCompleta(delDoc) : `N° de autorización ${delDoc.codigoCtp}`;
        return { choque: { existente: delDoc, tiene } };
      }
      return { input: { ...sinDoc, notas: `Local de ${delDoc.nombre} (${base.docTipo} ${doc}).` } };
    }
  }
  return { input: base };
}

// ── Categorías ─────────────────────────────────────────────────────────────

export type CategoriaLibreta =
  | "destinatarios"
  | "establecimientos"
  | "propietarios"
  | "transportistas"
  | "conductores"
  | "vehiculos"
  | "sinPapel";

interface DefCategoria {
  clave: CategoriaLibreta;
  rotulo: string;
  /** Los papeles que caen acá; el primero es el que se usa para leer la ficha. */
  roles: readonly RolParte[];
}

export const CATEGORIAS_LIBRETA: readonly DefCategoria[] = [
  { clave: "destinatarios", rotulo: "Destinatarios", roles: ["destinatario", "cliente"] },
  { clave: "establecimientos", rotulo: "Establecimientos", roles: ["establecimiento"] },
  { clave: "propietarios", rotulo: "Propietarios", roles: ["proveedor"] },
  { clave: "transportistas", rotulo: "Transportistas", roles: ["transportista"] },
  { clave: "conductores", rotulo: "Conductores", roles: ["conductor"] },
  { clave: "vehiculos", rotulo: "Vehículos", roles: [] },
  { clave: "sinPapel", rotulo: "Sin papel", roles: [] },
];

export const defCategoria = (c: CategoriaLibreta): DefCategoria => CATEGORIAS_LIBRETA.find((d) => d.clave === c) ?? CATEGORIAS_LIBRETA[0];

/** El bloque que abrió la libreta: una parte con su papel, o el vehículo. */
export type BloqueLibreta = { tipo: "parte"; rol: RolParte } | { tipo: "vehiculo" };

export function categoriaDelBloque(b: BloqueLibreta): CategoriaLibreta {
  if (b.tipo === "vehiculo") return "vehiculos";
  return CATEGORIAS_LIBRETA.find((d) => d.roles.includes(b.rol))?.clave ?? "destinatarios";
}

/** Una fila de la libreta: una parte o un vehículo, con lo que hace falta para ordenar. */
export type EntradaLibreta =
  | { tipo: "parte"; id: string; nombre: string; usos: number; ultimoUso: string | null; parte: Parte }
  | { tipo: "vehiculo"; id: string; nombre: string; usos: number; ultimoUso: string | null; vehiculo: Vehiculo };

const deParte = (p: Parte): EntradaLibreta => ({ tipo: "parte", id: p.id, nombre: p.nombre, usos: p.usos, ultimoUso: p.ultimoUso, parte: p });
const deVehiculo = (v: Vehiculo): EntradaLibreta => ({
  tipo: "vehiculo",
  id: v.id,
  nombre: formatearPlaca(v.placa),
  usos: v.usos,
  ultimoUso: v.ultimoUso,
  vehiculo: v,
});

/** Las filas de una categoría. Una parte con dos papeles sale en las dos. */
export function entradasDeCategoria(c: CategoriaLibreta, partes: readonly Parte[] | null, vehiculos: readonly Vehiculo[] | null): EntradaLibreta[] {
  if (c === "vehiculos") return (vehiculos ?? []).map(deVehiculo);
  const todas = partes ?? [];
  if (c === "sinPapel") return todas.filter((p) => !p.roles.some((r) => CATEGORIAS_LIBRETA.some((d) => d.roles.includes(r)))).map(deParte);
  const roles = defCategoria(c).roles;
  return todas.filter((p) => p.roles.some((r) => roles.includes(r))).map(deParte);
}

/**
 * Las categorías, con la del bloque primero. «Vehículos» sólo si quien abre la
 * libreta los pasa, y las de personas sólo si pasa las partes (`null` = esa
 * pantalla no las tiene a mano); «Sin papel» sólo si hay alguien así.
 */
export function categoriasVisibles(bloque: BloqueLibreta, partes: readonly Parte[] | null, vehiculos: readonly Vehiculo[] | null): CategoriaLibreta[] {
  const primera = categoriaDelBloque(bloque);
  const resto = CATEGORIAS_LIBRETA.map((d) => d.clave).filter((c) => {
    if (c === primera) return false;
    if (c === "vehiculos") return vehiculos !== null;
    if (partes === null) return false;
    if (c === "sinPapel") return entradasDeCategoria(c, partes, null).length > 0;
    return true;
  });
  return [primera, ...resto];
}

// ── Búsqueda ───────────────────────────────────────────────────────────────

/** Por nombre, RUC/DNI, dirección y ubigeo, N° de autorización, licencia, registro MTC; placa, marca, tipo. */
export function coincide(e: EntradaLibreta, q: string): boolean {
  const k = claveBusqueda(q);
  if (!k) return true;
  if (e.tipo === "vehiculo") {
    const v = e.vehiculo;
    const placa = normalizarPlaca(q);
    if (placa && [v.placa, v.placaRemolque].some((x) => normalizarPlaca(x ?? "").includes(placa))) return true;
    return [v.marca, v.tipo, v.transportistaNombre, v.configuracion].some((x) => claveBusqueda(x ?? "").includes(k));
  }
  const p = e.parte;
  if ((p.docNumero ?? "").toLowerCase().includes(k)) return true;
  return [p.nombre, direccionCompleta(p), p.zona, p.codigoCtp, p.tituloHabilitante, p.licencia, p.registroMtc, p.contactoNombre, p.acopioReferencia].some(
    (x) => claveBusqueda(x ?? "").includes(k),
  );
}

// ── Orden ──────────────────────────────────────────────────────────────────

export type OrdenLibreta = "recientes" | "usados" | "az";

export const ORDENES_LIBRETA: readonly { valor: OrdenLibreta; rotulo: string }[] = [
  { valor: "recientes", rotulo: "Recientes" },
  { valor: "usados", rotulo: "Más usados" },
  { valor: "az", rotulo: "A → Z" },
];

/** Marcas de «usado en esta guía» que guarda el navegador: id → fecha ISO. */
export type MarcasDeUso = Readonly<Record<string, string>>;

/**
 * La última vez que se usó: la del Directorio (se anota recién al registrar la
 * guía) o la del navegador (al tocar «Usar»), la más nueva de las dos.
 */
export function ultimaVez(e: Pick<EntradaLibreta, "id" | "ultimoUso">, marcas: MarcasDeUso): number {
  const a = e.ultimoUso ? Date.parse(e.ultimoUso) : 0;
  const b = marcas[e.id] ? Date.parse(marcas[e.id]) : 0;
  return Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0);
}

const porNombre = (a: EntradaLibreta, b: EntradaLibreta) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });

export function ordenarLibreta(lista: readonly EntradaLibreta[], orden: OrdenLibreta, marcas: MarcasDeUso): EntradaLibreta[] {
  return [...lista].sort((a, b) => {
    if (orden === "az") return porNombre(a, b);
    if (orden === "usados" && b.usos !== a.usos) return b.usos - a.usos;
    const t = ultimaVez(b, marcas) - ultimaVez(a, marcas);
    return t !== 0 ? t : porNombre(a, b);
  });
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «Usada 3 veces · la última, jueves 10/09» (el día en hora de Lima). */
export function textoDeUso(e: Pick<EntradaLibreta, "id" | "usos" | "ultimoUso">, marcas: MarcasDeUso): string {
  const t = ultimaVez(e, marcas);
  const veces = e.usos > 0 ? `Usada ${e.usos} ${e.usos === 1 ? "vez" : "veces"}` : "";
  if (!t) return veces || "Todavía sin usar en una guía";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limaDateKey(t));
  if (!m) return veces;
  const dia = DIAS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
  return `${veces || "Usada"} · la última, ${dia} ${m[3]}/${m[2]}`;
}

// ── La ficha ───────────────────────────────────────────────────────────────

/** Sale impreso en la hoja de la guía, o queda en la libreta y el sistema. */
export type Sello = "guia" | "interno";

export interface CampoFicha {
  clave: string;
  etiqueta: string;
  valor: string;
  sello: Sello;
  /** El casillero del formato 2024, cuando el formato lo numera: «(21)». */
  casillero?: string;
  mono?: boolean;
  /** Vacío y la guía lo pide. */
  falta?: boolean;
  /** Vacío y está bien: «No aplica» (un destinatario persona no tiene (22)). */
  noAplica?: boolean;
  /** Cuándo sale en la hoja, si no sale siempre: «solo si recibe un establecimiento». */
  condicion?: string;
}

export interface GrupoFicha {
  clave: "identificacion" | "direccion" | "autorizacion" | "internos";
  titulo: string;
  campos: CampoFicha[];
}

export interface FichaLibreta {
  grupos: GrupoFicha[];
  /** Lo que le falta para ir en la guía con ESTE papel, dicho como se lee. */
  faltan: string[];
}

type ReglaCampo = { sello: Sello; casillero?: string; pide?: boolean; noAplica?: boolean; condicion?: string };
type Reglas = Partial<Record<"nombre" | "documento" | "direccion" | "ubigeo" | "autorizacion" | "tipoEstablecimiento" | "licencia" | "registroMtc", ReglaCampo>>;

const G = (casillero?: string, pide = true): ReglaCampo => ({ sello: "guia", casillero, pide });
const INTERNO: ReglaCampo = { sello: "interno" };

/** Qué imprime la hoja de cada papel (`casillerosGtf`) y qué le pide la guía. */
function reglasDe(rol: RolParte): Reglas {
  switch (rol) {
    case "destinatario":
    case "cliente":
      /* (22), instructivo 2024: «En caso corresponda, consignar el número de
         autorización del establecimiento, de lo contrario colocar "No aplica"».
         La hoja lo imprime siempre (formato 2024, ADR-494). */
      return {
        nombre: G("(21)"),
        autorizacion: { sello: "guia", casillero: "(22)", noAplica: true, condicion: "solo si recibe un establecimiento" },
        documento: G("(23)"),
        direccion: G("(24)"),
        ubigeo: G("(24)"),
      };
    case "establecimiento":
      return { nombre: G("(17)"), autorizacion: G("(18)"), tipoEstablecimiento: G("(19)"), documento: INTERNO, direccion: G("(20)"), ubigeo: G("(20)") };
    case "proveedor":
      return { nombre: G(), documento: G(), direccion: G(), ubigeo: G() };
    case "conductor":
      return { nombre: G(), documento: G(), licencia: G(), direccion: INTERNO, ubigeo: INTERNO };
    case "transportista":
      /* La hoja no tiene casillero del transportista: todo es interno, pero el
         puesto de control pide su documento, así que se sigue pidiendo. */
      return { nombre: { sello: "interno", pide: true }, documento: { sello: "interno", pide: true }, registroMtc: INTERNO, direccion: INTERNO, ubigeo: INTERNO };
  }
}

const FALTA_TEXTO: Record<string, string> = {
  nombre: "el nombre",
  documento: "el documento",
  direccion: "la dirección",
  ubigeo: "el ubigeo (departamento, provincia y distrito)",
  autorizacion: "el N° de autorización",
  tipoEstablecimiento: "el tipo de establecimiento",
  licencia: "la licencia",
};

function campo(clave: string, etiqueta: string, valor: string | null | undefined, regla: ReglaCampo | undefined, mono = false): CampoFicha | null {
  const v = (valor ?? "").trim();
  const r = regla ?? INTERNO;
  if (!v && !regla) return null; // interno vacío: no se dibuja
  return {
    clave,
    etiqueta,
    valor: v,
    sello: r.sello,
    ...(r.casillero ? { casillero: r.casillero } : {}),
    ...(mono ? { mono } : {}),
    ...(!v && r.pide && !r.noAplica ? { falta: true } : {}),
    ...(!v && r.noAplica ? { noAplica: true } : {}),
    ...(r.condicion ? { condicion: r.condicion } : {}),
  };
}

const ubigeoDe = (p: Pick<Parte, "region" | "provincia" | "distrito">) =>
  p.region && p.provincia && p.distrito ? [p.distrito, p.provincia, p.region].join(", ") : [p.distrito, p.provincia, p.region].filter(Boolean).join(", ");

/** La ficha de una parte leída con un papel: el del bloque que abrió la libreta. */
export function fichaDeParte(p: Parte, rol: RolParte): FichaLibreta {
  const r = reglasDe(rol);
  const ubigeoCompleto = Boolean(p.region && p.provincia && p.distrito);
  const etiquetaAut = rol === "establecimiento" ? "N° de autorización (ARFFS)" : rol === "destinatario" || rol === "cliente" ? "N° de autorización" : "Código de CTP";
  const lista = (...cs: (CampoFicha | null)[]) => cs.filter((c): c is CampoFicha => c !== null);

  const ubigeo = campo("ubigeo", "Departamento, provincia y distrito", ubigeoCompleto ? ubigeoDe(p) : "", r.ubigeo);
  if (ubigeo && !ubigeoCompleto && ubigeoDe(p)) ubigeo.valor = `${ubigeoDe(p)} (incompleto)`;

  const grupos: GrupoFicha[] = [
    {
      clave: "identificacion",
      titulo: "Identificación",
      campos: lista(
        campo("nombre", "Nombre o razón social", p.nombre, r.nombre),
        campo("documento", rol === "conductor" ? "DNI" : "Documento", p.docNumero ? `${p.docTipo ?? ""} ${p.docNumero}`.trim() : "", r.documento, true),
        campo("representante", "Representante", p.representante, undefined),
      ),
    },
    {
      clave: "direccion",
      titulo: "Dirección",
      campos: lista(campo("direccion", "Dirección", p.direccion, r.direccion), ubigeo, campo("zona", "Sector o caserío", p.zona, undefined)),
    },
    {
      clave: "autorizacion",
      titulo: "Autorización y registros",
      campos: lista(
        campo("autorizacion", etiquetaAut, p.codigoCtp, r.autorizacion, true),
        campo("tipoEstablecimiento", "Tipo de establecimiento", p.tipoEstablecimiento, r.tipoEstablecimiento),
        campo("licencia", "Licencia de conducir", p.licencia, r.licencia, true),
        campo("registroMtc", "Registro MTC", p.registroMtc, r.registroMtc, true),
        campo("titulo", "Título habilitante", p.tituloHabilitante, undefined, true),
        campo("arffs", "ARFFS", p.arffs, undefined),
      ),
    },
    {
      clave: "internos",
      titulo: "Internos",
      campos: lista(
        campo("encargado", rol === "establecimiento" ? "Encargado" : "Contacto", p.contactoNombre, undefined),
        campo("telefono", "Teléfono", p.contactoTelefono || p.telefono, undefined),
        campo("whatsapp", "WhatsApp", p.whatsapp, undefined),
        campo("email", "Correo", p.email, undefined),
        campo("referencia", "Referencia", p.acopioReferencia, undefined),
        campo("notas", "Notas", p.notas, undefined),
      ),
    },
  ].filter((g) => g.campos.length > 0) as GrupoFicha[];

  const faltan: string[] = [];
  for (const g of grupos) for (const c of g.campos) if (c.falta) faltan.push(FALTA_TEXTO[c.clave] ?? c.etiqueta.toLowerCase());
  return { grupos, faltan };
}

/** La ficha de un vehículo: placa, remolque y tipo salen en la guía. */
export function fichaDeVehiculo(v: Vehiculo): FichaLibreta {
  const motivo = motivoPlacaVehiculo({ placa: v.placa, placaRemolque: v.placaRemolque, tipo: v.tipo }, null);
  const c = (clave: string, etiqueta: string, valor: string | null | undefined, regla: ReglaCampo | undefined, mono = false) =>
    campo(clave, etiqueta, valor, regla, mono);
  const lista = (...cs: (CampoFicha | null)[]) => cs.filter((x): x is CampoFicha => x !== null);
  const grupos: GrupoFicha[] = [
    {
      clave: "identificacion",
      titulo: "Vehículo",
      campos: lista(
        c("placa", "Placa", formatearPlaca(v.placa), G(), true),
        c("remolque", "Placa del remolque", v.placaRemolque ? formatearPlaca(v.placaRemolque) : "", v.placaRemolque ? G(undefined, false) : undefined, true),
        c("tipo", "Tipo", v.tipo, G()),
        c("marca", "Marca", v.marca, undefined),
        c("configuracion", "Configuración", v.configuracion, undefined),
        c("capacidad", "Capacidad", v.capacidadM3 != null ? `${v.capacidadM3.toLocaleString("es-PE")} m³` : "", undefined),
      ),
    },
    {
      clave: "internos",
      titulo: "Internos",
      campos: lista(c("transportista", "Transportista", v.transportistaNombre, undefined), c("notas", "Notas", v.notas, undefined)),
    },
  ].filter((g) => g.campos.length > 0) as GrupoFicha[];
  const faltan: string[] = [];
  if (motivo) faltan.push(motivo.motivo.charAt(0).toLowerCase() + motivo.motivo.slice(1));
  if (!v.tipo?.trim()) faltan.push("el tipo");
  return { grupos, faltan };
}

/** «Proveedor, Cliente»: los papeles de una parte, para la ficha. */
export const papelesDe = (p: Parte) => p.roles.map((r) => ROL_LABEL[r]).join(", ");

// ── Cómo se usa una entrada en el bloque que abrió la libreta ──────────────

/**
 * Con qué papel se lee la ficha: en la categoría del bloque, el del bloque
 * (así quedaría en ESTE bloque); en otra, el de la categoría (un transportista
 * se lee como transportista aunque la libreta se haya abierto desde la partida).
 */
export function rolParaFicha(bloque: BloqueLibreta, categoria: CategoriaLibreta): RolParte | null {
  const delBloque = bloque.tipo === "parte" ? bloque.rol : null;
  if (categoria === categoriaDelBloque(bloque)) return delBloque;
  return defCategoria(categoria).roles[0] ?? delBloque;
}

export interface UsoEnBloque {
  /** Se puede «Usar en este bloque». */
  usable: boolean;
  /** Usarla le suma el papel del bloque (está guardada con otro). */
  sumarRol: boolean;
  /** Una línea para la ficha cuando el uso no es el directo. */
  nota: string | null;
}

/** Un vehículo sólo va en el bloque del vehículo, y una persona en el de un papel. */
export function usoEnBloque(bloque: BloqueLibreta, e: EntradaLibreta, conPapel: ReadonlySet<string>): UsoEnBloque {
  if (bloque.tipo === "vehiculo") {
    return e.tipo === "vehiculo"
      ? { usable: true, sumarRol: false, nota: null }
      : { usable: false, sumarRol: false, nota: "Se usa desde el bloque de su papel en la guía (destinatario, transportista, conductor…)." };
  }
  if (e.tipo === "vehiculo") return { usable: false, sumarRol: false, nota: "Los vehículos se usan desde el bloque «Vehículo» de la misma guía." };
  if (conPapel.has(e.id)) return { usable: true, sumarRol: false, nota: null };
  return { usable: true, sumarRol: true, nota: `Al usarla acá queda también como ${ROL_LABEL[bloque.rol].toLowerCase()} en tu libreta.` };
}
