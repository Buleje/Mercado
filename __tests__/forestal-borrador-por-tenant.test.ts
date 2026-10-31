/**
 * El borrador del formulario de ingreso no puede cruzar de negocio.
 *
 * El borrador se auto-guarda en CADA tecla y se auto-restaura al montar, y
 * transporta N° de GTF, proveedor con su RUC/DNI, título habilitante y volumen.
 * Hasta 2026-09-05 vivía en una clave GLOBAL: abrir el formulario en otro
 * negocio lo pre-llenaba con los datos del anterior.
 *
 * `clearAllTenantCache()` tampoco lo limpiaba, y la razón es una letra: borra
 * por una lista de prefijos donde está `"buleje-admin-"` (con guion) y la clave
 * empezaba con `"buleje:"` (dos puntos). Ese detalle se fija abajo con el
 * predicado real, porque es el tipo de cosa que se "arregla" sin querer.
 *
 * Acá se prueba la MECÁNICA (clave + sello), no el componente: montarlo
 * arrastraría medio módulo forestal. Lo que se protege es la regla.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { tenantCacheKey, getActiveTenantSlug } = await import("@/lib/tenant-cache");

const DRAFT_BASE = "buleje:ctp-wood-entry-draft";

/** Un almacén en memoria que se comporta como localStorage. */
function almacenFalso() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    claves: () => [...m.keys()],
  };
}

let store: ReturnType<typeof almacenFalso>;

/**
 * Pone el negocio "activo" como lo hace la app: en la COOKIE
 * `active-tenant-slug`, no en localStorage. Ese detalle importa —
 * `getActiveTenantSlug()` lee `document.cookie`, y probarlo con localStorage
 * daba un falso rojo que parecía un bug del arreglo.
 */
function entrarA(slug: string) {
  vi.stubGlobal("document", { cookie: `active-tenant-slug=${slug}` });
}

beforeEach(() => {
  store = almacenFalso();
  vi.stubGlobal("localStorage", store);
  vi.stubGlobal("document", { cookie: "" });
});

// ── Las dos operaciones, tal como quedaron en el componente ──────────────────

const draftKey = () => tenantCacheKey(DRAFT_BASE);

function guardar(datos: Record<string, unknown>) {
  localStorage.setItem(draftKey(), JSON.stringify({ ...datos, __tenant: getActiveTenantSlug() }));
}

function leer(): Record<string, unknown> | null {
  const raw = localStorage.getItem(draftKey());
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Record<string, unknown> & { __tenant?: string };
  const esDeEsteNegocio = Boolean(parsed.__tenant) && parsed.__tenant === getActiveTenantSlug();
  if (!esDeEsteNegocio) {
    localStorage.removeItem(draftKey());
    return null;
  }
  return parsed;
}

const GTF_DE_BLAS = { gtfNumber: "GTF-000123", providerName: "Maderera Blas", providerDocument: "20601234567" };

describe("la clave lleva el negocio", () => {
  it("dos negocios escriben en claves distintas", () => {
    entrarA("blas");
    guardar(GTF_DE_BLAS);
    entrarA("otra-bodega");
    guardar({ gtfNumber: "GTF-999" });

    expect(store.claves().filter((k) => k.startsWith(DRAFT_BASE))).toHaveLength(2);
  });
});

describe("🚨 el borrador de un negocio no aparece en otro", () => {
  it("el GTF y el RUC de Blas no pre-llenan el formulario de otra bodega", () => {
    entrarA("blas");
    guardar(GTF_DE_BLAS);

    entrarA("otra-bodega");
    expect(leer()).toBeNull();
  });

  it("volviendo al negocio original, su borrador sigue ahí", () => {
    entrarA("blas");
    guardar(GTF_DE_BLAS);
    entrarA("otra-bodega");
    leer();

    entrarA("blas");
    expect(leer()).toMatchObject({ gtfNumber: "GTF-000123", providerDocument: "20601234567" });
  });
});

describe("segunda defensa: el sello dentro del payload", () => {
  it("un borrador con el sello de otro negocio se descarta aunque la clave coincida", () => {
    entrarA("blas");
    // Simula el caso en que la clave quedó pelada (slug sin resolver al escribir)
    // y después otro negocio lee esa misma clave.
    localStorage.setItem(draftKey(), JSON.stringify({ ...GTF_DE_BLAS, __tenant: "otra-bodega" }));
    expect(leer()).toBeNull();
  });

  it("un borrador VIEJO sin sello se descarta: puede ser de cualquiera", () => {
    entrarA("blas");
    localStorage.setItem(draftKey(), JSON.stringify(GTF_DE_BLAS));
    expect(leer()).toBeNull();
  });

  it("descartarlo además lo BORRA, para que no vuelva a proponerse", () => {
    entrarA("blas");
    localStorage.setItem(draftKey(), JSON.stringify(GTF_DE_BLAS));
    leer();
    expect(localStorage.getItem(draftKey())).toBeNull();
  });
});

describe("por qué el guard de tenant nunca lo limpió (la letra que importa)", () => {
  it("«buleje:» no matchea el prefijo «buleje-admin-»", () => {
    const PREFIJOS = ["poc-", "admin-", "dashboard-data-", "buleje-admin-", "morning-summary-", "arqueo-"];
    expect(PREFIJOS.some((p) => DRAFT_BASE.startsWith(p))).toBe(false);
  });
});
