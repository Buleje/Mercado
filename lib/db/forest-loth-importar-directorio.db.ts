/**
 * ForestLothImportarDirectorioDB — el directorio desde las guías que se
 * importan al Libro TH (ADR-461, 02-10 noche).
 *
 * Dos momentos:
 *  - VISTA PREVIA (`anotarVistaPrevia`): quién de cada guía ya está en el
 *    directorio y quién es nuevo. Sólo lee; si el directorio no se puede mirar,
 *    la vista previa sale igual (sin la sección).
 *  - DESPUÉS de anotar la guía (`guardar`): agrega o completa lo que la
 *    persona marcó. Fuera de la transacción de la guía a propósito: la guía es
 *    lo que se declara, y una ficha del directorio que no se pudo guardar no
 *    puede tumbar el asiento. Cada uno informa su resultado.
 *
 * El navegador sólo dice QUÉ guardar (y, al agregar, el nombre y el documento
 * corregidos): los datos salen otra vez de la ficha y el directorio se vuelve a
 * mirar justo antes de escribir. Las escrituras van por las clases de siempre
 * (`ForestDirectorioDB.guardarParte`/`guardarVehiculo`, `ForestContratoDB.crear`/
 * `actualizar`), que auditan e invalidan la caché.
 *
 * tenantId 1er parámetro.
 */
import "server-only";
import { logger } from "@/lib/logger";
import { ForestDirectorioDB, PlacaDuplicadaError, PlacaInvalidaError } from "@/lib/db/forest-directorio.db";
import { ForestContratoDB, PlanAjenoError, PlanOcupadoError } from "@/lib/db/forest-contrato.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { GuiaThAlCtpDB } from "@/lib/db/guia-th-al-ctp.db";
import {
  ROL_LABEL,
  formatearPlaca,
  motivoDocInvalido,
  normalizarDocumento,
  normalizarPlaca,
  parteInputSchema,
  vehiculoInputSchema,
  type ParteInput,
} from "@/lib/forestal/directorio";
import { TIPOS_CONTRATO, type Contrato, type ContratoInput, type TipoContrato } from "@/lib/forestal/contratos";
import { nombreDelPlan, type GuiaParaRevisar } from "@/lib/forestal/loth-importar-guia";
import {
  ORDEN_PARTES,
  aBuscar,
  armarDirectorio,
  claveDocumento,
  cruzarConDirectorio,
  datosParaCompletar,
  hayQueCompletar,
  listaDeDatos,
  mismoNombre,
  type ContextoDirectorio,
  type DirectorioArmado,
  type ParteDelDirectorio,
  type VehiculoDelDirectorio,
} from "@/lib/forestal/loth-importar-guia-directorio";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import type {
  CampoParteGuia,
  DirectorioDeLaGuia,
  GuiaVistaPrevia,
  ParteEnLaGuia,
  PedidoDirectorio,
  PedidoDirectorioParte,
  PermisoEnLaGuia,
  ResultadoDirectorio,
  VehiculoEnLaGuia,
} from "@/lib/forestal/loth-importar-guia-tipos";

const txt = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** El largo de cada campo en el alta del directorio (`parteInputSchema`): un dato largo no tumba el alta entera. */
const TOPE: Record<CampoParteGuia, number> = {
  direccion: 250,
  region: 80,
  provincia: 80,
  distrito: 80,
  licencia: 30,
  tituloHabilitante: 80,
  resolucion: 120,
  planManejo: 120,
  arffs: 120,
  representante: 160,
};

function recortados(datos: Partial<Record<CampoParteGuia, string | null>>): Partial<Record<CampoParteGuia, string>> {
  const out: Partial<Record<CampoParteGuia, string>> = {};
  for (const [k, v] of Object.entries(datos) as [CampoParteGuia, string | null][]) {
    const t = txt(v);
    if (t) out[k] = t.slice(0, TOPE[k]);
  }
  return out;
}

const resultado = (
  clave: ResultadoDirectorio["clave"],
  nombre: string,
  estado: ResultadoDirectorio["estado"],
  mensaje: string,
  id: string | null = null,
): ResultadoDirectorio => ({ clave, nombre, estado, mensaje, id });

const FALLO_GENERICO = "No se pudo guardar por un error del servidor: agrégalo desde el Directorio.";

export class ForestLothImportarDirectorioDB {
  /** Lo que el directorio tiene de estas guías: las partes por documento, los vehículos por placa, los permisos y el RUC propio. */
  static async contexto(tenantId: string, armados: readonly DirectorioArmado[]): Promise<ContextoDirectorio> {
    if (!tenantId) throw new Error("tenantId is required");
    const { documentos, placas } = aBuscar(armados);
    const [porDocumento, partes, porPlaca, permisos, planta] = await Promise.all([
      /* «¿Este RUC ya lo tengo?»: el mismo camino del autocompletado del directorio. */
      Promise.all(documentos.map((d) => ForestDirectorioDB.buscarPorDocumento(tenantId, d.docTipo, d.docNumero))),
      /* Para reconocer por el nombre (sin documento) y avisar de un parecido con otro documento. */
      ForestDirectorioDB.listarPartes(tenantId, { incluirInactivos: true }),
      Promise.all(placas.map((p) => ForestDirectorioDB.listarVehiculos(tenantId, { q: p, incluirInactivos: true }))),
      ForestContratoDB.list(tenantId, { incluirInactivos: true }),
      GuiaThAlCtpDB.rucPropio(tenantId),
    ]);
    const partesPorDocumento = new Map<string, ParteDelDirectorio>();
    for (const p of porDocumento) if (p?.docTipo && p.docNumero) partesPorDocumento.set(claveDocumento(p.docTipo, p.docNumero), p);
    const vehiculos = new Map<string, VehiculoDelDirectorio>();
    for (const v of porPlaca.flat()) {
      const n = normalizarPlaca(v.placa);
      if (placas.includes(n) && !vehiculos.has(n)) vehiculos.set(n, v);
    }
    return { partesPorDocumento, partes, vehiculos, permisos, rucPropio: normalizarDocumento(planta.ruc ?? "") || null };
  }

  /** La sección «Directorio» de cada guía de la vista previa. No tira: sin directorio, la vista previa sale igual. */
  static async anotarVistaPrevia(
    tenantId: string,
    guias: readonly GuiaParaRevisar[],
    vista: readonly GuiaVistaPrevia[],
  ): Promise<GuiaVistaPrevia[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const armados = guias.map((g) => (g.ficha ? armarDirectorio(g.ficha) : null));
    const conFicha = armados.filter((a): a is DirectorioArmado => !!a);
    if (conFicha.length === 0) return [...vista];
    try {
      const ctx = await ForestLothImportarDirectorioDB.contexto(tenantId, conFicha);
      return vista.map((v, i) => {
        const a = armados[i];
        return a ? { ...v, directorio: cruzarConDirectorio(a, ctx) } : v;
      });
    } catch (err) {
      logger.error("[forest-loth-importar-directorio] no se pudo mirar el directorio", { error: String(err), tenantId });
      return [...vista];
    }
  }

  /**
   * Agrega o completa lo marcado, DESPUÉS de anotar la guía. El titular va
   * primero: el permiso nuevo se ata a él. Nunca tira: cada uno vuelve con
   * su resultado («Agregado al directorio», «Ya existía», «No se pudo: …»).
   */
  static async guardar(
    tenantId: string,
    input: {
      ficha: GtfSerfor;
      pedido: PedidoDirectorio;
      /** El plan del Libro TH al que fue la guía: un permiso nuevo se ata a él si está libre. */
      planId: string | null;
      /** El plan lo creó ESTA importación: sólo entonces se le ata el permiso nuevo. */
      planCreado?: boolean;
      /** La ficha vino de SERFOR o del CTP (no de una foto ni corregida a mano). */
      verificada?: boolean;
      gtfNumber: string;
      registro: string;
      createdBy: string;
    },
  ): Promise<ResultadoDirectorio[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const armado = armarDirectorio(input.ficha);
    let dir: DirectorioDeLaGuia;
    try {
      dir = cruzarConDirectorio(armado, await ForestLothImportarDirectorioDB.contexto(tenantId, [armado]));
    } catch (err) {
      logger.error("[forest-loth-importar-directorio] no se pudo mirar el directorio al guardar", { error: String(err), tenantId });
      return [
        ...input.pedido.partes.map((p) => resultado(p.clave, p.nombre ?? "—", "fallo", FALLO_GENERICO)),
        ...(input.pedido.vehiculo ? [resultado("vehiculo", input.pedido.vehiculo.placa ?? "—", "fallo", FALLO_GENERICO)] : []),
        ...(input.pedido.permiso ? [resultado("permiso", "—", "fallo", FALLO_GENERICO)] : []),
      ];
    }
    /* La nota dice de dónde vino el dato: sólo es «de SERFOR» si la ficha se verificó (revisión 02-10). */
    const origen = input.verificada
      ? `la GTF ${input.gtfNumber}${input.registro ? ` (registro SERFOR ${input.registro})` : ""}`
      : `la GTF ${input.gtfNumber} (datos leídos de una foto o escritos a mano, sin verificar en SERFOR)`;
    const user = input.createdBy;
    const salida: ResultadoDirectorio[] = [];

    const titular = dir.partes.find((p) => p.clave === "titular");
    /* Sólo un titular reconocido por DOCUMENTO se ata al permiso: el cruce por nombre es para avisar
       (un homónimo se llevaría el permiso — revisión 02-10). */
    let titularId = titular?.estado === "existe" && titular.existente?.por === "documento" ? (titular.existente.id ?? null) : null;
    const pedidas = new Map(input.pedido.partes.map((p) => [p.clave, p]));
    for (const clave of ORDEN_PARTES) {
      const pedido = pedidas.get(clave);
      if (!pedido) continue;
      const r = await ForestLothImportarDirectorioDB.guardarParte(tenantId, dir.partes.find((p) => p.clave === clave) ?? null, pedido, origen, user);
      salida.push(r);
      if (clave === "titular" && r.id && r.estado !== "fallo" && r.estado !== "omitido") titularId = r.id;
    }
    if (input.pedido.vehiculo) {
      salida.push(await ForestLothImportarDirectorioDB.guardarVehiculo(tenantId, dir.vehiculo, input.pedido.vehiculo, origen, user));
    }
    if (input.pedido.permiso) {
      salida.push(
        await ForestLothImportarDirectorioDB.guardarPermiso(
          tenantId,
          dir.permiso,
          input.pedido.permiso,
          { titularId, titular: titular ?? null, planId: input.planCreado ? input.planId : null },
          origen,
          user,
        ),
      );
    }
    return salida;
  }

  private static async guardarParte(
    tenantId: string,
    p: ParteEnLaGuia | null,
    pedido: PedidoDirectorioParte,
    origen: string,
    user: string,
  ): Promise<ResultadoDirectorio> {
    const nombre = p?.nombre || txt(pedido.nombre) || "—";
    if (!p) return resultado(pedido.clave, nombre, "omitido", "La guía no trae esa parte.");
    if (p.estado === "propio") return resultado(pedido.clave, nombre, "omitido", "Es tu negocio: no se agrega.");
    try {
      if (pedido.accion === "completar") {
        const e = p.existente;
        if (p.estado !== "existe" || !e) return resultado(pedido.clave, nombre, "omitido", "No está en el directorio: no hay qué completar.");
        if (e.por !== "documento") {
          return resultado(pedido.clave, e.nombre, "omitido", "Se reconoció sólo por el nombre: complétala desde el Directorio.", e.id);
        }
        if (!hayQueCompletar(e)) return resultado(pedido.clave, e.nombre, "ya_existia", "Ya estaba en el directorio, completa.", e.id);
        const que = [...e.faltan.map((k) => listaDeDatos([k])), ...e.rolesQueFaltan.map((r) => `papel de ${ROL_LABEL[r].toLowerCase()}`)].join(", ");
        /* Sin `id`: el directorio reconoce la ficha por su documento, SUMA los
           papeles y escribe sólo lo que viene (lo que faltaba). El nombre va el
           del directorio: completar no renombra a nadie. */
        const v = parteInputSchema.safeParse({
          roles: p.roles,
          nombre: e.nombre,
          docTipo: p.docTipo ?? undefined,
          docNumero: p.docNumero ?? undefined,
          ...recortados(datosParaCompletar(p)),
          nuevaNota: `Completada con ${origen}: ${que}.`.slice(0, 500),
        } satisfies ParteInput);
        if (!v.success) return resultado(pedido.clave, e.nombre, "fallo", `No se pudo completar: ${v.error.issues[0]?.message ?? "dato inválido"}.`, e.id);
        const g = await ForestDirectorioDB.guardarParte(tenantId, v.data, user);
        return resultado(pedido.clave, g.nombre, "completado", `Se completó: ${que}.`, g.id);
      }

      // agregar
      if (p.estado === "existe" && p.existente) {
        const e = p.existente;
        return resultado(pedido.clave, e.nombre, "ya_existia", `Ya estaba en el directorio${e.mismoNombre ? "" : ` como «${e.nombre}»`}.`, e.id);
      }
      const nombreFinal = txt(pedido.nombre) || p.nombre;
      const docTipo = pedido.docTipo !== undefined ? pedido.docTipo : p.docTipo;
      const docNumero = normalizarDocumento((pedido.docNumero !== undefined ? pedido.docNumero : p.docNumero) ?? "");
      if (docNumero && !docTipo) return resultado(pedido.clave, nombreFinal, "fallo", "No se pudo: elige si el documento es RUC o DNI.");
      if (docNumero && docTipo) {
        const motivo = motivoDocInvalido(docTipo, docNumero);
        if (motivo) return resultado(pedido.clave, nombreFinal, "fallo", `No se pudo: ${motivo}`);
        /* Lo corregido en la pantalla puede ser alguien que ya está: no se pisa su ficha. */
        const ya = await ForestDirectorioDB.buscarPorDocumento(tenantId, docTipo, docNumero);
        if (ya) {
          const como = mismoNombre(ya.nombre, nombreFinal) ? "" : ` como «${ya.nombre}»`;
          /* La misma guía la nombra dos veces (propietario y transportista con
             el mismo RUC): sólo se le suma el papel que le falta, nada más. */
          const roles = p.roles.filter((r) => !ya.roles.includes(r));
          if (roles.length === 0) return resultado(pedido.clave, ya.nombre, "ya_existia", `Ya estaba en el directorio con ese ${docTipo}${como}.`, ya.id);
          const g = await ForestDirectorioDB.guardarParte(tenantId, { roles, nombre: ya.nombre, docTipo, docNumero }, user);
          const papeles = roles.map((r) => ROL_LABEL[r].toLowerCase()).join(" y ");
          return resultado(pedido.clave, g.nombre, "completado", `Ya estaba en el directorio${como}: se le sumó el papel de ${papeles}.`, g.id);
        }
      }
      const v = parteInputSchema.safeParse({
        roles: p.roles,
        nombre: nombreFinal.slice(0, 200),
        ...(docNumero && docTipo ? { docTipo, docNumero } : {}),
        ...recortados(p.datos),
        notas: `Agregado desde ${origen} al importarla al Libro TH.`.slice(0, 500),
      } satisfies ParteInput);
      if (!v.success) return resultado(pedido.clave, nombreFinal, "fallo", `No se pudo: ${v.error.issues[0]?.message ?? "dato inválido"}.`);
      const g = await ForestDirectorioDB.guardarParte(tenantId, v.data, user);
      const papeles = p.roles.map((r) => ROL_LABEL[r].toLowerCase()).join(" y ");
      return resultado(pedido.clave, g.nombre, "agregado", `Agregado al directorio como ${papeles}.`, g.id);
    } catch (err) {
      logger.error("[forest-loth-importar-directorio] parte", { error: String(err), tenantId, clave: pedido.clave });
      return resultado(pedido.clave, nombre, "fallo", FALLO_GENERICO);
    }
  }

  private static async guardarVehiculo(
    tenantId: string,
    v: VehiculoEnLaGuia | null,
    pedido: NonNullable<PedidoDirectorio["vehiculo"]>,
    origen: string,
    user: string,
  ): Promise<ResultadoDirectorio> {
    const nombre = v?.placa || txt(pedido.placa) || "—";
    if (!v) return resultado("vehiculo", nombre, "omitido", "La guía no trae placa.");
    try {
      if (pedido.accion === "completar") {
        const e = v.existente;
        if (v.estado !== "existe" || !e) return resultado("vehiculo", nombre, "omitido", "No está en el directorio: no hay qué completar.");
        if (e.faltan.length === 0) return resultado("vehiculo", e.nombre, "ya_existia", "Ya estaba en el directorio, completo.", e.id);
        /* Sin `id`: el directorio lo reconoce por la placa y escribe sólo lo que viene. */
        const g = await ForestDirectorioDB.guardarVehiculo(
          tenantId,
          {
            placa: e.nombre,
            ...(e.faltan.includes("tipo") && v.tipo ? { tipo: v.tipo.slice(0, 40) } : {}),
            ...(e.faltan.includes("placaRemolque") && v.placaRemolque ? { placaRemolque: v.placaRemolque.slice(0, 15) } : {}),
          },
          user,
        );
        return resultado("vehiculo", formatearPlaca(g.placa), "completado", `Se completó: ${listaDeDatos(e.faltan)}.`, g.id);
      }
      if (v.estado === "existe" && v.existente) return resultado("vehiculo", v.existente.nombre, "ya_existia", "Ya estaba en el directorio.", v.existente.id);
      const placa = txt(pedido.placa) || v.placa;
      if (placa !== v.placa) {
        const n = normalizarPlaca(placa);
        const ya = (await ForestDirectorioDB.listarVehiculos(tenantId, { q: n, incluirInactivos: true })).find((x) => normalizarPlaca(x.placa) === n);
        if (ya) return resultado("vehiculo", ya.placa, "ya_existia", "Ya estaba en el directorio.", ya.id);
      }
      const datos = vehiculoInputSchema.safeParse({
        placa,
        ...(v.placaRemolque ? { placaRemolque: v.placaRemolque } : {}),
        ...(v.tipo ? { tipo: v.tipo.slice(0, 40) } : {}),
        notas: `Agregado desde ${origen} al importarla al Libro TH.`.slice(0, 500),
      });
      if (!datos.success) return resultado("vehiculo", placa, "fallo", `No se pudo: ${datos.error.issues[0]?.message ?? "placa inválida"}.`);
      const g = await ForestDirectorioDB.guardarVehiculo(tenantId, datos.data, user);
      return resultado("vehiculo", formatearPlaca(g.placa), "agregado", "Agregado al directorio.", g.id);
    } catch (err) {
      if (err instanceof PlacaInvalidaError || err instanceof PlacaDuplicadaError) return resultado("vehiculo", nombre, "fallo", `No se pudo: ${err.message}`);
      logger.error("[forest-loth-importar-directorio] vehículo", { error: String(err), tenantId });
      return resultado("vehiculo", nombre, "fallo", FALLO_GENERICO);
    }
  }

  private static async guardarPermiso(
    tenantId: string,
    p: PermisoEnLaGuia | null,
    pedido: NonNullable<PedidoDirectorio["permiso"]>,
    ctx: { titularId: string | null; titular: ParteEnLaGuia | null; planId: string | null },
    origen: string,
    user: string,
  ): Promise<ResultadoDirectorio> {
    if (!p) return resultado("permiso", "—", "omitido", "La guía no trae el código del título habilitante.");
    try {
      if (pedido.accion === "completar") {
        const e = p.existente;
        if (p.estado !== "existe" || !e) return resultado("permiso", p.codigo, "omitido", "No está en el directorio: no hay qué completar.");
        const patch: Partial<ContratoInput> = {};
        const hechos: string[] = [];
        const poner = <K extends keyof ContratoInput>(clave: string, campo: K, valor: ContratoInput[K] | null | undefined) => {
          if (!e.faltan.includes(clave) || valor == null || valor === "") return;
          patch[campo] = valor;
          hechos.push(clave);
        };
        poner("titular", "titularId", ctx.titularId);
        poner("titularNombre", "titularNombre", p.titularNombre);
        poner("resolucionNumero", "resolucionNumero", p.resolucionNumero);
        poner("arffs", "arffs", p.arffs);
        poner("region", "region", p.region);
        poner("provincia", "provincia", p.provincia);
        poner("distrito", "distrito", p.distrito);
        if (hechos.length === 0) {
          const sinTitular = e.faltan.includes("titular") && !ctx.titularId;
          return resultado(
            "permiso",
            e.nombre,
            "ya_existia",
            sinTitular ? "Ya estaba en el directorio; para atarlo al titular, agrega primero al titular." : "Ya estaba en el directorio, completo.",
            e.id,
          );
        }
        const c = await ForestContratoDB.actualizar(tenantId, e.id, patch, user);
        if (!c) return resultado("permiso", e.nombre, "fallo", "No se pudo: el permiso ya no está en el directorio.");
        return resultado("permiso", c.codigo, "completado", `Se completó: ${listaDeDatos(hechos)}.`, c.id);
      }

      if (p.estado === "existe" && p.existente) return resultado("permiso", p.existente.nombre, "ya_existia", "Ya estaba en el directorio.", p.existente.id);
      const doc = ctx.titular && ctx.titular.estado !== "propio" ? normalizarDocumento(ctx.titular.docNumero ?? "") : "";
      const tipo = (TIPOS_CONTRATO as readonly string[]).includes(p.tipo) ? (p.tipo as TipoContrato) : null;
      const datos: ContratoInput = {
        codigo: p.codigo,
        titularNombre: p.titularNombre,
        titularId: ctx.titularId,
        titularDoc: doc || null,
        titularDocTipo: doc ? (ctx.titular?.docTipo ?? null) : null,
        resolucionNumero: p.resolucionNumero,
        tipo,
        arffs: p.arffs,
        region: p.region,
        provincia: p.provincia,
        distrito: p.distrito,
        notas: `Agregado desde ${origen} al importarla al Libro TH.`,
      };
      /* Se ata al plan del Libro TH SÓLO si lo creó esta importación y todavía no tiene permiso: un
         plan que ya existía sin permiso no se adueña del primero que llega (revisión 02-10). */
      const plan = ctx.planId ? await ForestPlanDB.getPlan(tenantId, ctx.planId) : null;
      let creado: Contrato | null = null;
      let atado = false;
      if (plan && !plan.contratoId) {
        try {
          creado = await ForestContratoDB.crear(tenantId, { ...datos, planId: plan.id }, user);
          atado = true;
        } catch (err) {
          if (!(err instanceof PlanOcupadoError) && !(err instanceof PlanAjenoError)) throw err;
        }
      }
      creado ??= await ForestContratoDB.crear(tenantId, datos, user);
      if (atado && plan) {
        try {
          await ForestPlanDB.updatePlan(tenantId, plan.id, { contratoId: creado.id });
        } catch (err) {
          logger.error("[forest-loth-importar-directorio] no se pudo atar el plan al permiso", { error: String(err), tenantId, planId: plan.id });
        }
      }
      return resultado(
        "permiso",
        creado.codigo,
        "agregado",
        atado && plan ? `Agregado al directorio y atado al plan ${nombreDelPlan(plan)}.` : "Agregado al directorio.",
        creado.id,
      );
    } catch (err) {
      logger.error("[forest-loth-importar-directorio] permiso", { error: String(err), tenantId });
      return resultado("permiso", p.codigo, "fallo", FALLO_GENERICO);
    }
  }
}
