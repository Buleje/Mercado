import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import {
  OPERACIONES_KEY_PREFIX,
  nombreDeOperacionValido,
  slugDeOperacion,
  type GrupoOperaciones,
  type OperacionHermana,
} from "@/lib/forestal/ctp-operaciones";
import { logger } from "@/lib/logger";

/**
 * ForestCtpOperacionesDB — dos (o más) libros CTP para la misma planta (ADR-395).
 *
 * POR QUÉ ASÍ Y NO UNA COLUMNA. Cada libro se aísla por `tenantId` en 31 DB
 * classes, 63 endpoints y ~160 filtros sólo en `forest-ctp.db.ts`. Meter una
 * columna `operacionId` en diez modelos obligaba a tocar cada uno de esos
 * filtros, y el primero que se olvidara mezclaba dos libros en silencio — el
 * bug que el aislamiento por tenant existe para hacer imposible. Una operación
 * hermana ES un tenant: mismo plan, misma gente, la Ficha copiada, y un
 * `grupoId` en la Ficha que dice «somos la misma planta».
 *
 * DÓNDE VIVE EL GRUPO (sin migración): el `grupoId` va en la Ficha de cada libro
 * (KV `ctp-ficha:{tenantId}`) y un índice `ctp-operaciones:{grupoId}` lista los
 * libros del grupo. Mismo patrón que la Ficha: KV global por prefijo.
 *
 * QUIÉN PUEDE CAMBIAR. Sólo a un libro del MISMO grupo donde el usuario tenga
 * cuenta ACTIVA con el MISMO username. El cambio emite una sesión nueva para
 * ese tenant — igual que un login — y se audita en los dos libros.
 */

interface IndiceGrupo {
  tenants: { tenantId: string; slug: string; nombre: string }[];
}

const FLAG_CTP = "spec:forestal:ctp-libro";

export const ForestCtpOperacionesDB = {
  /** Cómo se llama este libro: el nombre de operación si tiene, si no el del negocio. */
  async identidad(tenantId: string): Promise<{ slug: string; nombre: string; enGrupo: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [t, ficha] = await Promise.all([
      prisma.tenant.findFirst({ where: { id: tenantId }, select: { slug: true, name: true } }),
      ForestCtpFichaDB.get(tenantId),
    ]);
    return {
      slug: t?.slug ?? tenantId,
      nombre: ficha.operacion?.nombre || t?.name || tenantId,
      enGrupo: Boolean(ficha.operacion?.grupoId),
    };
  },

  /** El grupo del libro, o `null` si es un libro único. */
  async grupoDe(tenantId: string, username: string): Promise<GrupoOperaciones | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const ficha = await ForestCtpFichaDB.get(tenantId);
    const grupoId = ficha.operacion?.grupoId;
    if (!grupoId) return null;
    const indice = (await PlatformSettingsDB.get<IndiceGrupo>(
      `${OPERACIONES_KEY_PREFIX}${grupoId}`,
    )) ?? { tenants: [] };
    const ids = indice.tenants.map((t) => t.tenantId);
    if (ids.length === 0) return { grupoId, operaciones: [] };
    /* Accesible = tenant activo, con el libro habilitado y con cuenta activa
       del usuario. Se resuelve en tres consultas, no en N. */
    const [tenants, cuentas, flags] = await Promise.all([
      prisma.tenant.findMany({
        where: { id: { in: ids }, active: true },
        select: { id: true, slug: true, name: true },
      }),
      prisma.adminUser.findMany({
        where: { tenantId: { in: ids }, username, active: true },
        select: { tenantId: true },
      }),
      prisma.tenantFeatureFlag.findMany({
        where: { tenantId: { in: ids }, flagKey: FLAG_CTP, enabled: true },
        select: { tenantId: true },
      }),
    ]);
    const conCuenta = new Set(cuentas.map((c) => c.tenantId));
    const conLibro = new Set(flags.map((f) => f.tenantId));
    const operaciones: OperacionHermana[] = tenants.map((t) => {
      const meta = indice.tenants.find((x) => x.tenantId === t.id);
      return {
        tenantId: t.id,
        slug: t.slug,
        nombre: meta?.nombre || t.name,
        accesible: conCuenta.has(t.id) && conLibro.has(t.id),
        actual: t.id === tenantId,
      };
    });
    operaciones.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return { grupoId, operaciones };
  },

  /**
   * Crea la operación hermana: un tenant nuevo con el mismo plan, la misma
   * gente (mismas credenciales), el libro habilitado y la Ficha copiada.
   *
   * Si este libro todavía no tiene grupo, se funda uno y el libro actual
   * entra en él con `nombreActual` (o el nombre del tenant).
   */
  async crearHermana(
    tenantId: string,
    input: { nombre: string; nombreActual?: string; user: string },
  ): Promise<{ tenantId: string; slug: string; nombre: string; grupoId: string }> {
    if (!tenantId) throw new Error("tenantId is required");
    const invalido = nombreDeOperacionValido(input.nombre);
    if (invalido) throw new CtpInvariantError(invalido, "VALIDACION");
    const nombre = input.nombre.trim();

    const actual = await prisma.tenant.findFirst({
      where: { id: tenantId, active: true },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        type: true,
        ownerEmail: true,
        ownerPhone: true,
        trialEndsAt: true,
        industry: true,
      },
    });
    if (!actual) throw new CtpInvariantError("Ese negocio no existe.", "LOTE_NO_ENCONTRADO");

    const ficha = await ForestCtpFichaDB.get(tenantId);
    const grupoId = ficha.operacion?.grupoId ?? `grp_${tenantId}`;
    const slug = slugDeOperacion(actual.slug, nombre);
    if (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
      throw new CtpInvariantError(
        `Ya existe una operación con ese nombre (${slug}).`,
        "VALIDACION",
      );
    }

    /* 1. El tenant, con el plan, el tipo y el vencimiento de prueba TAL CUAL
          están en el libro actual — `null` incluido: un libro pago no puede
          nacer «en prueba» y vencerse. Misma forma que `createTenant` del
          onboarding (tenant + su Store), sin su tipo que exige una fecha. */
    const nuevo = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          slug,
          name: `${actual.name} · ${nombre}`,
          plan: actual.plan,
          type: actual.type,
          active: true,
          ownerEmail: actual.ownerEmail,
          ownerPhone: actual.ownerPhone,
          trialEndsAt: actual.trialEndsAt,
          industry: actual.industry,
        },
      });
      if (actual.type === "store") {
        await tx.store.create({ data: { tenantId: t.id, slug, name: t.name, isPublished: false } });
      }
      return t;
    });

    /* 2. La misma gente, con las mismas credenciales (hash incluido) y su 2FA. */
    const gente = await prisma.adminUser.findMany({ where: { tenantId, active: true } });
    await prisma.$transaction([
      ...gente.map((u) =>
        prisma.adminUser.create({
          data: {
            tenantId: nuevo.id,
            username: u.username,
            passwordHash: u.passwordHash,
            role: u.role,
            name: u.name,
            active: true,
            onboardingCompletedAt: new Date(),
            totpSecret: u.totpSecret,
            totpEnabledAt: u.totpEnabledAt,
          },
        }),
      ),
      prisma.settings.create({
        data: {
          tenantId: nuevo.id,
          businessName: `${actual.name} · ${nombre}`,
          mode: "checkout",
          cashEnabled: true,
          yapeEnabled: false,
        },
      }),
      /* 3. Los mismos módulos forestales que tiene el libro actual. */
      ...(
        await prisma.tenantFeatureFlag.findMany({
          where: { tenantId, enabled: true, flagKey: { startsWith: "spec:forestal" } },
        })
      ).map((f) =>
        prisma.tenantFeatureFlag.create({
          data: { tenantId: nuevo.id, flagKey: f.flagKey, enabled: true },
        }),
      ),
    ]);

    /* 4. La Ficha copiada (misma planta, misma ARFFS, mismos títulos), con su
          nombre de operación; y el libro actual entra al grupo si no estaba. */
    await ForestCtpFichaDB.set(nuevo.id, { ...ficha, operacion: { grupoId, nombre } }, input.user);
    if (!ficha.operacion) {
      await ForestCtpFichaDB.set(
        tenantId,
        { ...ficha, operacion: { grupoId, nombre: input.nombreActual?.trim() || actual.name } },
        input.user,
      );
    }
    const key = `${OPERACIONES_KEY_PREFIX}${grupoId}`;
    const indice = (await PlatformSettingsDB.get<IndiceGrupo>(key)) ?? { tenants: [] };
    const tenants = indice.tenants.filter(
      (t) => t.tenantId !== tenantId && t.tenantId !== nuevo.id,
    );
    tenants.push({
      tenantId,
      slug: actual.slug,
      nombre: ficha.operacion?.nombre || input.nombreActual?.trim() || actual.name,
    });
    tenants.push({ tenantId: nuevo.id, slug, nombre });
    await PlatformSettingsDB.set(key, { tenants }, input.user);

    const detail = `Creó la operación hermana «${nombre}» (${slug}) del libro ${actual.slug}: mismo plan, misma gente, Ficha copiada`;
    auditCtp({
      tenantId,
      action: "ctp_operacion_crear",
      entity: "Tenant",
      entityId: nuevo.id,
      detail,
      user: input.user,
    });
    auditCtp({
      tenantId: nuevo.id,
      action: "ctp_operacion_crear",
      entity: "Tenant",
      entityId: nuevo.id,
      detail,
      user: input.user,
    });
    logger.info("[ctp-operaciones] hermana creada", { tenantId, nuevo: nuevo.id, slug, grupoId });
    return { tenantId: nuevo.id, slug, nombre, grupoId };
  },

  /**
   * Quita una hermana del grupo: la desactiva (no la borra — un libro con
   * asientos no se destruye desde el panel) y la saca del índice. Reversible
   * por el superadmin.
   */
  async quitarHermana(tenantId: string, slugHermana: string, user: string): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const ficha = await ForestCtpFichaDB.get(tenantId);
    const grupoId = ficha.operacion?.grupoId;
    if (!grupoId)
      throw new CtpInvariantError("Este libro no tiene operaciones hermanas.", "VALIDACION");
    const key = `${OPERACIONES_KEY_PREFIX}${grupoId}`;
    const indice = (await PlatformSettingsDB.get<IndiceGrupo>(key)) ?? { tenants: [] };
    const hermana = indice.tenants.find((t) => t.slug === slugHermana);
    if (!hermana)
      throw new CtpInvariantError("Esa operación no está en el grupo.", "LOTE_NO_ENCONTRADO");
    if (hermana.tenantId === tenantId)
      throw new CtpInvariantError("No se puede quitar el libro desde el que estás.", "VALIDACION");
    await prisma.tenant.update({ where: { id: hermana.tenantId }, data: { active: false } });
    await PlatformSettingsDB.set(
      key,
      { tenants: indice.tenants.filter((t) => t.tenantId !== hermana.tenantId) },
      user,
    );
    const detail = `Quitó la operación hermana «${hermana.nombre}» (${hermana.slug}): queda desactivada, no borrada`;
    auditCtp({
      tenantId,
      action: "ctp_operacion_quitar",
      entity: "Tenant",
      entityId: hermana.tenantId,
      detail,
      user,
    });
  },

  /**
   * A qué tenant puede cambiar este usuario: sólo a una hermana ACCESIBLE del
   * mismo grupo. Devuelve la cuenta del usuario en el destino (rol y nombre
   * de allá — puede ser cajero acá y admin allá).
   */
  async destinoDeCambio(
    tenantId: string,
    username: string,
    slugDestino: string,
  ): Promise<{ tenantId: string; slug: string; nombre: string; role: string; name: string }> {
    const grupo = await ForestCtpOperacionesDB.grupoDe(tenantId, username);
    const op = grupo?.operaciones.find((o) => o.slug === slugDestino);
    if (!op || !op.accesible || op.actual) {
      throw new CtpInvariantError(
        "No puedes cambiar a esa operación: no es del grupo o no tienes cuenta ahí.",
        "VALIDACION",
      );
    }
    const cuenta = await prisma.adminUser.findFirst({
      where: { tenantId: op.tenantId, username, active: true },
      select: { role: true, name: true },
    });
    if (!cuenta)
      throw new CtpInvariantError("No tienes cuenta activa en esa operación.", "VALIDACION");
    return {
      tenantId: op.tenantId,
      slug: op.slug,
      nombre: op.nombre,
      role: cuenta.role,
      name: cuenta.name,
    };
  },
};
