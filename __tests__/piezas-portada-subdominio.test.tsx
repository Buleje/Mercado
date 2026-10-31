/**
 * ADR-457 · la portada hermana (subdominio / dominio propio → `TenantStoreHome`)
 * lleva el mismo enchufe `tienda.portada` que `/t/<slug>`:
 *  · sin piezas, NO se monta el enchufe (la portada sale igual que antes);
 *  · con piezas, el enchufe recibe el id y el slug REALES del negocio aunque el
 *    host traiga el slug (subdominio) o el id (sesión del panel);
 *  · sin negocio reconocible, la portada normal y nada más.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  ctx: { name: "Aserradero", tenantId: "aserradero", isTenant: true },
  slugAId: new Map<string, string>([["aserradero", "cid-aserradero-000000000001"]]),
  porId: new Map<string, { id: string; slug: string; name: string }>(),
  piezas: [] as unknown[],
}));

vi.mock("@/lib/store-metadata", () => ({
  resolveStoreContext: async () => H.ctx,
  getCachedSettings: async () => ({ logoUrl: null, slogan: "Madera seca" }),
}));
vi.mock("@/lib/resolve-tenant", () => ({
  resolveTenantSlug: async (crudo: string) => (crudo.startsWith("custom--") ? null : crudo),
  resolveTenantSlugToId: async (s: string) => H.slugAId.get(s) ?? s,
}));
vi.mock("@/lib/db/tenants.db", () => ({
  TenantsDB: { getBasicById: async (id: string) => H.porId.get(id) ?? null },
}));
vi.mock("@/lib/extensiones/resolver", () => ({
  resolverPiezas: vi.fn(async () => H.piezas),
}));
vi.mock("@/lib/extensiones/Enchufe", () => ({
  Enchufe: function Enchufe() {
    return null;
  },
}));

import TenantStoreHome from "@/components/store/TenantStoreHome";
import { Enchufe } from "@/lib/extensiones/Enchufe";
import { resolverPiezas } from "@/lib/extensiones/resolver";

type Props = {
  tenantId?: string;
  slug?: string;
  nombre?: string;
  modo?: string;
  fallback?: ReactNode;
};
const hijoDeMain = async (): Promise<ReactElement<Props>> => {
  const main = (await TenantStoreHome()) as ReactElement<{ children: ReactElement<Props> }>;
  expect(main.type).toBe("main");
  return main.props.children;
};

beforeEach(() => {
  vi.clearAllMocks();
  H.ctx = { name: "Aserradero", tenantId: "aserradero", isTenant: true };
  H.piezas = [];
  H.porId.clear();
});

describe("TenantStoreHome con el enchufe tienda.portada", () => {
  it("sin piezas: la sección de siempre, sin enchufe", async () => {
    const hijo = await hijoDeMain();
    expect(hijo.type).toBe("section");
    expect(resolverPiezas).toHaveBeenCalledWith("cid-aserradero-000000000001", "tienda.portada");
  });

  it("con piezas (subdominio = slug): enchufe con el id real, el slug y la portada normal de respaldo", async () => {
    H.piezas = [{ piezaId: "madera-disponible" }];
    const hijo = await hijoDeMain();
    expect(hijo.type).toBe(Enchufe);
    expect(hijo.props).toMatchObject({
      nombre: "tienda.portada",
      tenantId: "cid-aserradero-000000000001",
      slug: "aserradero",
    });
    expect(hijo.props.modo).toBeUndefined(); // reemplaza Y agrega
    expect(isValidElement(hijo.props.fallback) && (hijo.props.fallback as ReactElement).type).toBe(
      "section",
    );
  });

  it("con sesión del panel (llega el id): el slug sale de la base", async () => {
    H.ctx = { ...H.ctx, tenantId: "cid-aserradero-000000000001" };
    H.porId.set("cid-aserradero-000000000001", {
      id: "cid-aserradero-000000000001",
      slug: "aserradero",
      name: "A",
    });
    H.piezas = [{ piezaId: "pagina-por-bloques" }];
    const hijo = await hijoDeMain();
    expect(hijo.props).toMatchObject({
      tenantId: "cid-aserradero-000000000001",
      slug: "aserradero",
    });
  });

  it("dominio propio que no existe: portada normal, sin consultar piezas", async () => {
    H.ctx = { ...H.ctx, tenantId: "custom--www.nadie.pe" };
    const hijo = await hijoDeMain();
    expect(hijo.type).toBe("section");
    expect(resolverPiezas).not.toHaveBeenCalled();
  });
});
