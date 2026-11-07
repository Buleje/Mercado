/**
 * Lecturas que el panel y la portada piden en CADA carga, cacheadas en el
 * servidor (16-10, carril velocidad: ~120 ms por ida desde la PC de Brandon).
 *
 * Cada caché tiene que (1) ahorrar la ida también cuando la respuesta es
 * «no existe» (getOrSet no guarda `null`: se envuelve), (2) separar negocios y
 * (3) volver a leer apenas alguien escribe. Estos casos fijan las tres cosas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  tenantFindFirst: vi.fn(),
  flagFindMany: vi.fn(),
  flagUpsert: vi.fn(),
  settingFindUnique: vi.fn(),
  settingUpsert: vi.fn(),
  settingDelete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => db.queryRaw(...a),
    tenant: { findFirst: (...a: unknown[]) => db.tenantFindFirst(...a) },
    tenantFeatureFlag: {
      findMany: (...a: unknown[]) => db.flagFindMany(...a),
      upsert: (...a: unknown[]) => db.flagUpsert(...a),
    },
    platformSetting: {
      findUnique: (...a: unknown[]) => db.settingFindUnique(...a),
      upsert: (...a: unknown[]) => db.settingUpsert(...a),
      delete: (...a: unknown[]) => db.settingDelete(...a),
    },
  },
}));

import { invalidateAll } from "@/lib/cache";
import { DesignSystemActivoDB } from "@/lib/db/design-system-activo.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { TenantFeatureFlagDB } from "@/lib/db/tenant-feature-flag.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import {
  isSpecializationEnabled,
  listEnabledSpecializations,
  setSpecialization,
} from "@/lib/specializations";

beforeEach(() => {
  vi.clearAllMocks();
  invalidateAll();
  db.flagUpsert.mockResolvedValue({});
  db.settingUpsert.mockResolvedValue({});
  db.settingDelete.mockResolvedValue({});
});

describe("Tema activo (GET /api/design-system/active)", () => {
  it("el global y el de cada negocio se leen una vez; «sin tema propio» también se recuerda", async () => {
    db.queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
      sql.join("?").includes("DesignSystemConfig")
        ? [{ activePresetSlug: "oficial", customTokensJson: null, savedPresetsJson: [] }]
        : [],
    );
    await DesignSystemActivoDB.global();
    expect(await DesignSystemActivoDB.global()).toMatchObject({ activePresetSlug: "oficial" });
    expect(await DesignSystemActivoDB.deTenant("t1")).toBeNull();
    expect(await DesignSystemActivoDB.deTenant("t1")).toBeNull();
    expect(db.queryRaw).toHaveBeenCalledTimes(2);

    // Otro negocio no comparte la caja.
    await DesignSystemActivoDB.deTenant("t2");
    expect(db.queryRaw).toHaveBeenCalledTimes(3);
  });

  it("olvidar() (lo llama el superadmin al guardar) vuelve a leer todo", async () => {
    db.queryRaw.mockResolvedValue([]);
    await DesignSystemActivoDB.global();
    await DesignSystemActivoDB.deTenant("t1");
    DesignSystemActivoDB.olvidar();
    await DesignSystemActivoDB.global();
    await DesignSystemActivoDB.deTenant("t1");
    expect(db.queryRaw).toHaveBeenCalledTimes(4);
  });
});

describe("Negocio público (portada /t/<x> y /api/tenants/resolve)", () => {
  const fila = {
    id: "c1",
    slug: "bodega",
    name: "Bodega",
    plan: "free",
    active: true,
    ownerPhone: null,
    customDomain: null,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    industry: null,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
  };

  it("una ida por slug, la fecha vuelve como Date y un slug inexistente tampoco vuelve a la base", async () => {
    db.tenantFindFirst.mockImplementation(async (a: { where: { OR?: { slug: string }[] } }) =>
      a.where.OR?.[1]?.slug === "bodega" ? fila : null,
    );
    await TenantsDB.publicoPorSlugOId("bodega");
    const t = await TenantsDB.publicoPorSlugOId("bodega");
    expect(t?.createdAt).toBeInstanceOf(Date);
    expect(t?.createdAt.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(await TenantsDB.publicoPorSlugOId("no-existe")).toBeNull();
    expect(await TenantsDB.publicoPorSlugOId("no-existe")).toBeNull();
    expect(db.tenantFindFirst).toHaveBeenCalledTimes(2);
  });

  it("dominio propio busca por customDomain; olvidarPublico() vuelve a leer", async () => {
    db.tenantFindFirst.mockResolvedValue(fila);
    await TenantsDB.publicoPorSlugOId("custom--bodega.pe");
    expect(db.tenantFindFirst.mock.calls[0][0].where).toEqual({ customDomain: "bodega.pe" });
    TenantsDB.olvidarPublico();
    await TenantsDB.publicoPorSlugOId("custom--bodega.pe");
    expect(db.tenantFindFirst).toHaveBeenCalledTimes(2);
  });
});

describe("Especializaciones del negocio (sidebar y gates)", () => {
  it("la lista y las preguntas sueltas salen de UNA ida por negocio", async () => {
    db.flagFindMany.mockResolvedValue([{ flagKey: "spec:forestal:ctp-libro" }, { flagKey: "spec:inventada" }]);
    expect(await listEnabledSpecializations("t1")).toEqual(["spec:forestal:ctp-libro"]);
    expect(await isSpecializationEnabled("t1", "spec:forestal:ctp-libro")).toBe(true);
    expect(await isSpecializationEnabled("t1", "spec:forestal:lotes")).toBe(false);
    expect(db.flagFindMany).toHaveBeenCalledTimes(1);
    expect(db.flagFindMany.mock.calls[0][0].where).toMatchObject({ tenantId: "t1", enabled: true });
  });

  it("setSpecialization y TenantFeatureFlagDB.set limpian sólo ese negocio", async () => {
    db.flagFindMany.mockResolvedValue([]);
    await listEnabledSpecializations("t1");
    await listEnabledSpecializations("t2");
    await setSpecialization("t1", "spec:forestal:lotes", true, "sa");
    db.flagFindMany.mockResolvedValue([{ flagKey: "spec:forestal:lotes" }]);
    expect(await isSpecializationEnabled("t1", "spec:forestal:lotes")).toBe(true);
    await listEnabledSpecializations("t2"); // sigue en caché
    expect(db.flagFindMany).toHaveBeenCalledTimes(3);

    await TenantFeatureFlagDB.set("t1", "spec:forestal:lotes", false);
    db.flagFindMany.mockResolvedValue([]);
    expect(await isSpecializationEnabled("t1", "spec:forestal:lotes")).toBe(false);
    expect(db.flagFindMany).toHaveBeenCalledTimes(4);
  });

  it("un error de base no se cachea y falla cerrado", async () => {
    db.flagFindMany.mockRejectedValueOnce(new Error("P1001"));
    expect(await isSpecializationEnabled("t1", "spec:forestal:lotes")).toBe(false);
    db.flagFindMany.mockResolvedValue([{ flagKey: "spec:forestal:lotes" }]);
    expect(await isSpecializationEnabled("t1", "spec:forestal:lotes")).toBe(true);
  });
});

describe("Ajuste de módulos por negocio (GET /api/platform/admin-template)", () => {
  it("la AUSENCIA se recuerda y set/delete la limpian", async () => {
    db.settingFindUnique.mockResolvedValue(null);
    expect(await PlatformSettingsDB.getCacheandoAusencia("admin-template:tenant:t1")).toBeNull();
    expect(await PlatformSettingsDB.getCacheandoAusencia("admin-template:tenant:t1")).toBeNull();
    expect(db.settingFindUnique).toHaveBeenCalledTimes(1);

    await PlatformSettingsDB.set("admin-template:tenant:t1", { overrides: {} });
    db.settingFindUnique.mockResolvedValue({ value: { overrides: {} } });
    expect(await PlatformSettingsDB.getCacheandoAusencia("admin-template:tenant:t1")).toEqual({ overrides: {} });
    expect(db.settingFindUnique).toHaveBeenCalledTimes(2);

    await PlatformSettingsDB.delete("admin-template:tenant:t1");
    db.settingFindUnique.mockResolvedValue(null);
    expect(await PlatformSettingsDB.getCacheandoAusencia("admin-template:tenant:t1")).toBeNull();
    expect(db.settingFindUnique).toHaveBeenCalledTimes(3);
  });
});
