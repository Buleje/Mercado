import "server-only";
import { logger } from "@/lib/logger";
import { leerFotoDeCamara } from "@/lib/ai/camara-vision";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestFleteDB } from "@/lib/db/forest-flete.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import type { Camara, Captura, CrucesCaptura } from "./camaras";
import {
  cruzarChalecos,
  cruzarPlaca,
  dentroDeDias,
  diaDelRegistro,
  diaLima,
  fechaCortaDelRegistro,
  normalizarChalecos,
  normalizarPlacaCruce,
  sumarDias,
  type AsistenciaDelDia,
  type CandidatoPlaca,
} from "./cruces";
import { vigilarPila } from "./pila";
import { avisarSiCorresponde } from "./avisar";

/**
 * Lo que la foto encontró en los datos del negocio (ADR-456 §3-4): la placa
 * contra las guías, fletes y vehículos, y los chalecos contra el personal y su
 * asistencia de ESE día. Las reglas (qué es «parecida», qué día cuenta) están
 * en `cruces.ts`, puras y probadas; acá sólo se juntan los datos.
 *
 * Todo pasa por las DB classes con el `tenantId` de la cámara: la cámara de un
 * negocio nunca ve la guía de otro.
 */

/** Guías y fletes valen del día de la foto ±1: el camión llega antes o después de la fecha del papel. */
const DIAS_DE_HOLGURA = 1;

/**
 * Todo lo que lleva placa y pudo estar en el patio ese día: guías del Libro TH
 * (no anuladas), fletes del período y los vehículos del directorio (sin fecha:
 * el camión es el mismo cualquier día). Cada fuente por su lado — si una falla,
 * las otras igual cruzan.
 */
async function candidatosDePlaca(tenantId: string, dia: string): Promise<CandidatoPlaca[]> {
  const desde = new Date(`${sumarDias(dia, -DIAS_DE_HOLGURA)}T00:00:00.000Z`);
  const hasta = new Date(`${sumarDias(dia, DIAS_DE_HOLGURA + 1)}T12:00:00.000Z`);
  const [guias, fletes, vehiculos] = await Promise.allSettled([
    ForestGtfDB.list(tenantId),
    ForestFleteDB.listar(tenantId, { desde, hasta }),
    ForestDirectorioDB.listarVehiculos(tenantId, { incluirInactivos: true }),
  ]);
  const out: CandidatoPlaca[] = [];

  if (guias.status === "fulfilled") {
    for (const g of guias.value) {
      if (g.status === "anulada" || !g.placaVehiculo) continue;
      /* Sin fecha del documento, cuenta el día en que se anotó. */
      const fecha = g.gtfDate ?? g.createdAt;
      if (!dentroDeDias(diaDelRegistro(fecha), dia, DIAS_DE_HOLGURA)) continue;
      out.push({
        tipo: "gtf",
        refId: g.id,
        placa: g.placaVehiculo,
        etiqueta: `Guía ${g.gtfNumber} · ${fechaCortaDelRegistro(fecha)}`,
      });
    }
  } else {
    logger.error("[camaras.cruces] no se pudieron leer las guías", { error: String(guias.reason), tenantId });
  }

  if (fletes.status === "fulfilled") {
    for (const f of fletes.value) {
      if (!f.placa || !dentroDeDias(diaDelRegistro(f.fecha), dia, DIAS_DE_HOLGURA)) continue;
      const quien = f.transportistaNombre ?? f.conductorNombre;
      out.push({
        tipo: "flete",
        refId: f.id,
        placa: f.placa,
        etiqueta: `Flete de ${f.tipo === "despacho" ? "despacho" : "ingreso"} · ${fechaCortaDelRegistro(f.fecha)}${f.gtfNumber ? ` · guía ${f.gtfNumber}` : ""}${quien ? ` · ${quien}` : ""}`,
      });
    }
  } else {
    logger.error("[camaras.cruces] no se pudieron leer los fletes", { error: String(fletes.reason), tenantId });
  }

  if (vehiculos.status === "fulfilled") {
    for (const v of vehiculos.value) {
      const detalle = [v.tipo, v.marca].filter(Boolean).join(" ");
      const de = v.transportistaNombre ? ` de ${v.transportistaNombre}` : "";
      const baja = v.activo ? "" : " (dado de baja)";
      out.push({ tipo: "vehiculo", refId: v.id, placa: v.placa, etiqueta: `Vehículo ${detalle || "del directorio"}${de}${baja}` });
      /* La guía declara también el remolque, y la cámara del portón a veces
         sólo alcanza a ver la chapa de atrás. */
      if (v.placaRemolque) {
        out.push({ tipo: "vehiculo", refId: v.id, placa: v.placaRemolque, etiqueta: `Remolque del vehículo ${v.placa}${de}${baja}` });
      }
    }
  } else {
    logger.error("[camaras.cruces] no se pudieron leer los vehículos", { error: String(vehiculos.reason), tenantId });
  }
  return out;
}

/** Los chalecos leídos, con su dueño y la asistencia de ese día. */
async function crucesDeChalecos(tenantId: string, numeros: string[], dia: string) {
  const mapa = await CamarasDB.chalecos(tenantId);
  const ids = [...new Set(numeros.map((n) => mapa[n]).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return cruzarChalecos(numeros, mapa, new Map(), new Map());
  const [colaboradores, marcas] = await Promise.all([
    ColaboradoresDB.listar(tenantId, { incluirCesados: true }),
    AsistenciaDB.delPeriodo(tenantId, dia, dia, ids),
  ]);
  const nombres = new Map(colaboradores.map((c) => [c.id, c.nombre] as const));
  /* Una persona tiene UNA marca viva por día; si hubiera dos, vale la última. */
  const asistencias = new Map<string, AsistenciaDelDia>();
  for (const m of [...marcas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    asistencias.set(m.colaboradorId, { estado: m.estado, entradaMin: m.entradaMin, salidaMin: m.salidaMin });
  }
  return cruzarChalecos(numeros, mapa, nombres, asistencias);
}

/**
 * Los cruces de una lectura. `null` si la foto no trae ni placa ni chalecos:
 * no hay nada que cruzar y no se guarda una caja vacía en cada una de las 800
 * fotos del historial.
 */
export async function calcularCruces(
  tenantId: string,
  lectura: { placa: string | null; chalecos?: string[] } | null | undefined,
  at: string,
): Promise<CrucesCaptura | null> {
  if (!tenantId) throw new Error("tenantId is required");
  const placa = normalizarPlacaCruce(lectura?.placa);
  const numeros = normalizarChalecos(lectura?.chalecos ?? []);
  if (!placa && !numeros.length) return null;
  const dia = diaLima(at);
  const [placas, chalecos] = await Promise.all([
    placa ? candidatosDePlaca(tenantId, dia).then((c) => cruzarPlaca(placa, c)) : Promise.resolve([]),
    numeros.length ? crucesDeChalecos(tenantId, numeros, dia) : Promise.resolve([]),
  ]);
  return { placas, chalecos, calculadoEn: new Date().toISOString() };
}

/**
 * Todo lo que pasa con una foto DESPUÉS de contestarle a la cámara: leerla,
 * cruzarla, mirar la pila, guardarlo en UNA escritura y avisar.
 *
 * Nunca tira: cada paso tiene su `catch` con log, y que uno falle no se lleva
 * a los otros. La foto ya está guardada; esto sólo le agrega lo que se pudo.
 */
export async function procesarCapturaNueva(tenantId: string, camara: Camara, captura: Captura): Promise<void> {
  const [leido, pila] = await Promise.all([
    (async () => {
      let lectura: Captura["lectura"] = null;
      try {
        lectura = await leerFotoDeCamara(tenantId, captura.url);
      } catch (err) {
        logger.error("[camaras.analisis] no se pudo leer la foto con IA", { error: String(err), tenantId, capturaId: captura.id });
        return { lectura: null, cruces: null };
      }
      let cruces: CrucesCaptura | null = null;
      try {
        cruces = await calcularCruces(tenantId, lectura, captura.at);
      } catch (err) {
        logger.error("[camaras.analisis] no se pudieron calcular los cruces", { error: String(err), tenantId, capturaId: captura.id });
      }
      return { lectura, cruces };
    })(),
    camara.vigilaPila
      ? vigilarPila(tenantId, camara, captura).catch((err) => {
          logger.error("[camaras.analisis] no se pudo comparar la pila", { error: String(err), tenantId, capturaId: captura.id });
          return null;
        })
      : Promise.resolve(null),
  ]);

  try {
    const guardada = await CamarasDB.guardarAnalisis(tenantId, captura.id, { lectura: leido.lectura, cruces: leido.cruces, pila });
    if (!guardada) {
      logger.info("[camaras.analisis] la foto ya no estaba en el historial", { tenantId, capturaId: captura.id });
    }
  } catch (err) {
    logger.error("[camaras.analisis] no se pudo guardar el análisis", { error: String(err), tenantId, capturaId: captura.id });
  }

  /* Y si la foto muestra a alguien, el WhatsApp. Va después de guardar: el
     enlace del aviso lleva a una foto que ya tiene su lectura. */
  if (leido.lectura) {
    try {
      await avisarSiCorresponde(tenantId, camara, { id: captura.id, lectura: leido.lectura });
    } catch (err) {
      logger.error("[camaras.analisis] no se pudo avisar por WhatsApp", { error: String(err), tenantId, capturaId: captura.id });
    }
  }
}
