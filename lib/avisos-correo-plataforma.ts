import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { AvisosCorreoDB, type TiendaAvisosCorreo } from "@/lib/db/avisos-correo.db";
import { armarResumenAvisos, claveAvisosCorreo, leerAvisosGuardados } from "@/lib/avisos-correo";
import {
  CORREO_PLATAFORMA_INFO,
  TIPOS_CORREO_PLATAFORMA,
  type CorreosPlataformaDetalle,
  type CorreosPlataformaGuardado,
  type CorreosPlataformaPatch,
  type TipoCorreoPlataforma,
  type TiendaCorreoEstado,
} from "@/lib/avisos-correo-plataforma-tipos";

/**
 * lib/avisos-correo-plataforma.ts — el interruptor de los correos de la PLATAFORMA (23-10).
 *
 * Los que no van al dueño de una tienda: precio del cacao, carritos, reposición, resumen
 * diario, cierre de caja, copias de stock/pedidos y alertas del sistema. Mismo patrón que
 * `avisoCorreoActivo`: PlatformSetting `avisos-correo:plataforma`, sin fila = todo encendido,
 * fail-open (si no se puede leer, el correo sale), caché de 5 min por instancia.
 */

export const CLAVE_AVISOS_CORREO_PLATAFORMA = "avisos-correo:plataforma";
const CORREO_CACAO_POR_DEFECTO = "bulejelauea@gmail.com";

export function correosPlataformaPorDefecto(): CorreosPlataformaGuardado {
  return { pausado: false, apagados: [] };
}

const GuardadoSchema = z.object({ pausado: z.boolean(), apagados: z.array(z.string()) });

/** Body del PATCH: o el general, o un tipo. */
export const CorreosPlataformaPatchSchema = z.union([
  z.object({ pausado: z.boolean() }).strict(),
  z.object({ tipo: z.enum(TIPOS_CORREO_PLATAFORMA), activo: z.boolean() }).strict(),
]);

export function leerCorreosPlataformaGuardados(valor: unknown): CorreosPlataformaGuardado {
  if (valor === null || valor === undefined) return correosPlataformaPorDefecto();
  const parsed = GuardadoSchema.safeParse(valor);
  if (!parsed.success) {
    logger.warn("[avisos-correo-plataforma] estado guardado inválido: se usa el de por defecto", {
      issues: parsed.error.issues.map((i) => i.message).slice(0, 3),
    });
    return correosPlataformaPorDefecto();
  }
  const apagados = new Set(parsed.data.apagados);
  return { pausado: parsed.data.pausado, apagados: TIPOS_CORREO_PLATAFORMA.filter((t) => apagados.has(t)) };
}

export function correoPlataformaSale(guardado: CorreosPlataformaGuardado, tipo: TipoCorreoPlataforma): boolean {
  return !guardado.pausado && !guardado.apagados.includes(tipo);
}

/** Preguntar ANTES de mandar un correo a la plataforma. Fail-open. */
export async function avisoCorreoPlataformaActivo(tipo: TipoCorreoPlataforma): Promise<boolean> {
  try {
    const valor = await PlatformSettingsDB.getCacheandoAusencia<unknown>(CLAVE_AVISOS_CORREO_PLATAFORMA);
    return correoPlataformaSale(leerCorreosPlataformaGuardados(valor), tipo);
  } catch (err) {
    logger.warn("[avisos-correo-plataforma] no se pudo leer el interruptor: el correo sale igual", {
      tipo,
      error: String(err).slice(0, 200),
    });
    return true;
  }
}

/** A qué correo llega hoy cada tipo (lo que hacen los envíos con las variables de entorno). */
export function destinoCorreoPlataforma(tipo: TipoCorreoPlataforma, env: NodeJS.ProcessEnv = process.env): string | null {
  const smtp = env.SMTP_USER?.trim() || null;
  const notify = env.NOTIFY_EMAIL?.trim() || smtp;
  if (tipo === "cacao") return env.CACAO_DIGEST_EMAIL?.trim() || CORREO_CACAO_POR_DEFECTO;
  if (tipo === "superadmin") return env.SUPERADMIN_NOTIFY_EMAIL?.trim() || smtp;
  return notify;
}

/** Puro: arma el detalle a partir del estado guardado y las tiendas ya resueltas. */
export function armarDetalleCorreosPlataforma(
  guardado: CorreosPlataformaGuardado,
  consulta: string | null,
  tiendas: TiendaCorreoEstado[],
  meta: { cambiadoPor: string | null; cambiadoEn: string | null },
  env: NodeJS.ProcessEnv = process.env,
): CorreosPlataformaDetalle {
  const tipos = TIPOS_CORREO_PLATAFORMA.map((tipo) => ({
    tipo,
    nombre: CORREO_PLATAFORMA_INFO[tipo].nombre,
    descripcion: CORREO_PLATAFORMA_INFO[tipo].descripcion,
    activo: !guardado.apagados.includes(tipo),
    destino: destinoCorreoPlataforma(tipo, env),
  }));
  const buscado = consulta?.trim().toLowerCase() || null;
  return {
    pausado: guardado.pausado,
    tipos,
    consulta: buscado,
    tiposALaConsulta: buscado ? tipos.filter((t) => t.destino?.toLowerCase() === buscado).map((t) => t.tipo) : [],
    tiendas,
    cambiadoPor: meta.cambiadoPor,
    cambiadoEn: meta.cambiadoEn,
  };
}

async function tiendasConEstado(tiendas: TiendaAvisosCorreo[]): Promise<TiendaCorreoEstado[]> {
  if (tiendas.length === 0) return [];
  const filas = await AvisosCorreoDB.filas(tiendas.map((t) => claveAvisosCorreo(t.id)));
  const porClave = new Map(filas.map((f) => [f.key, f.value]));
  return tiendas.map((t) => {
    const r = armarResumenAvisos(t.ownerEmail, leerAvisosGuardados(porClave.get(claveAvisosCorreo(t.id)), t.id), false, 0);
    return { id: t.id, slug: t.slug, name: t.name, correo: r.correo, pausado: r.pausado, activos: r.activos, total: r.total };
  });
}

/** Estado + «¿qué le llega a este correo?». Sin `correo`, se consulta el de la plataforma. */
export async function detalleCorreosPlataforma(correo?: string | null): Promise<CorreosPlataformaDetalle> {
  const consulta = correo?.trim() || destinoCorreoPlataforma("cacao");
  const [filas, tiendas] = await Promise.all([
    AvisosCorreoDB.filas([CLAVE_AVISOS_CORREO_PLATAFORMA]),
    consulta ? AvisosCorreoDB.tiendasPorCorreo(consulta) : Promise.resolve([]),
  ]);
  const fila = filas[0];
  return armarDetalleCorreosPlataforma(leerCorreosPlataformaGuardados(fila?.value), consulta, await tiendasConEstado(tiendas), {
    cambiadoPor: fila?.updatedBy ?? null,
    cambiadoEn: fila?.updatedAt ? fila.updatedAt.toISOString() : null,
  });
}

/** Aplica el cambio bajo el candado de la clave (invalida la caché al escribir). */
export async function guardarCorreosPlataforma(cambio: CorreosPlataformaPatch, por: string): Promise<CorreosPlataformaGuardado> {
  return PlatformSettingsDB.actualizar<unknown, CorreosPlataformaGuardado>(
    CLAVE_AVISOS_CORREO_PLATAFORMA,
    (actual) => {
      const g = leerCorreosPlataformaGuardados(actual);
      const nuevo: CorreosPlataformaGuardado =
        "pausado" in cambio
          ? { ...g, pausado: cambio.pausado }
          : {
              ...g,
              apagados: TIPOS_CORREO_PLATAFORMA.filter((t) => (t === cambio.tipo ? !cambio.activo : g.apagados.includes(t))),
            };
      return { valor: nuevo, resultado: nuevo };
    },
    por,
  );
}
