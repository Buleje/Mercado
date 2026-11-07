/**
 * lib/superadmin/health-negocios.ts — lógica PURA del monitor de integridad por negocio
 * (`/api/superadmin/health`, pantalla Salud del superadmin). Sin base ni red: la ruta trae los
 * conteos con `HealthDB` / `SaludNegocioDB` y acá se arman las tarjetas y el estado general.
 *
 * Todo cruza `Tenant.id` con `*.tenantId` (id con id, nunca el slug: 04-11 otra pantalla comparaba
 * contra el slug y todo negocio distinto de `main` salía en cero).
 *
 * Un aserradero (Blas) casi no tiene productos ni pedidos: su trabajo está en el libro CTP, las
 * trozas y las ventas del POS. Por eso cada tarjeta suma también `operations30d` (pedidos + ventas
 * + libro CTP + trozas, de `SaludNegocioDB.senalesDeUso`); un negocio con operaciones no es «vacío».
 *
 * Sin `server-only` a propósito: el panel importa los tipos (se borran al compilar).
 */

export type EstadoSalud = "healthy" | "warning" | "critical";

export type IsolationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type TenantHealth = {
  tenantId: string;
  slug: string;
  name: string;
  status: EstadoSalud;
  checks: IsolationCheck[];
  stats: {
    products: number;
    orders: number;
    customers: number;
    ordersLast24h: number;
    errorsLast24h: number;
    /** Pedidos + ventas POS + libro CTP + trozas de los últimos 30 días; null = no se pudo medir. */
    operations30d: number | null;
    /** ISO de la última operación (sin límite de ventana); null = nunca o no medido. */
    lastOperationAt: string | null;
  };
};

export type HealthResponse = {
  overall: EstadoSalud;
  tenants: TenantHealth[];
  isolationTests: IsolationCheck[];
  checkedAt: string;
};

/** Las 5 sondas globales de aislamiento (una consulta cada una en `HealthDB.sondasDeAislamiento`). */
export type SondaAislamiento =
  | "pedidosHuerfanos"
  | "productosHuerfanos"
  | "clientesHuerfanos"
  | "itemsCruzados"
  | "adminsHuerfanos";

const TEXTOS_SONDA: Record<SondaAislamiento, { name: string; ok: string; mal: (n: number) => string }> = {
  pedidosHuerfanos: {
    name: "Pedidos sin tenant válido",
    ok: "Todos los pedidos pertenecen a un tenant existente",
    mal: (n) => `${n} pedido(s) con tenantId huérfano`,
  },
  productosHuerfanos: {
    name: "Productos sin tenant válido",
    ok: "Todos los productos pertenecen a un tenant existente",
    mal: (n) => `${n} producto(s) con tenantId huérfano`,
  },
  clientesHuerfanos: {
    name: "Clientes sin tenant válido",
    ok: "Todos los clientes pertenecen a un tenant existente",
    mal: (n) => `${n} cliente(s) con tenantId huérfano`,
  },
  itemsCruzados: {
    name: "Items de pedido cross-tenant",
    ok: "Ningún pedido contiene productos de otro tenant",
    mal: (n) => `⚠️ ${n} item(s) de pedido referencian productos de otro tenant`,
  },
  adminsHuerfanos: {
    name: "Admins sin tenant válido",
    ok: "Todos los admins pertenecen a un tenant existente",
    mal: (n) => `${n} admin(s) con tenantId huérfano`,
  },
};

/** Orden en que se muestran las pruebas globales (el mismo de siempre). */
export const ORDEN_SONDAS: readonly SondaAislamiento[] = [
  "pedidosHuerfanos",
  "productosHuerfanos",
  "clientesHuerfanos",
  "itemsCruzados",
  "adminsHuerfanos",
];

/** Convierte lo que contó cada sonda en las tarjetas «Pruebas de aislamiento global». null = falló la consulta. */
export function chequeosDeAislamiento(cuentas: Record<SondaAislamiento, number | null>): IsolationCheck[] {
  return ORDEN_SONDAS.map((clave) => {
    const t = TEXTOS_SONDA[clave];
    const n = cuentas[clave];
    if (n === null) return { name: t.name, passed: false, detail: "Error al verificar" };
    return { name: t.name, passed: n === 0, detail: n === 0 ? t.ok : t.mal(n) };
  });
}

export interface NegocioBasico {
  id: string;
  slug: string;
  name: string | null;
}

export interface ConteosDeNegocios {
  productos: ReadonlyMap<string, number>;
  pedidos: ReadonlyMap<string, number>;
  clientes: ReadonlyMap<string, number>;
  pedidos24h: ReadonlyMap<string, number>;
  /** Items de pedido que apuntan a un producto de OTRO negocio, por negocio del pedido. */
  itemsCruzados: ReadonlyMap<string, number>;
}

export interface OperacionesDeNegocio {
  total30d: number;
  ultima: Date | null;
}

/** Una tarjeta por negocio. Un conteo ausente = 0; `operaciones` ausente = no medido (null). */
export function armarSaludDeNegocios(
  negocios: readonly NegocioBasico[],
  c: ConteosDeNegocios,
  operaciones: ReadonlyMap<string, OperacionesDeNegocio>,
): TenantHealth[] {
  return negocios.map((t) => {
    const products = c.productos.get(t.id) ?? 0;
    const orders = c.pedidos.get(t.id) ?? 0;
    const customers = c.clientes.get(t.id) ?? 0;
    const ordersLast24h = c.pedidos24h.get(t.id) ?? 0;
    const crossItems = c.itemsCruzados.get(t.id) ?? 0;
    const ops = operaciones.get(t.id);

    const propios = `${products} productos, ${orders} pedidos, ${customers} clientes`;
    const checks: IsolationCheck[] = [
      {
        name: "Datos propios",
        // Informativa: los conteos nunca son negativos; sólo muestra qué tiene el negocio.
        passed: true,
        detail: ops ? `${propios}, ${ops.total30d} operaciones (30 d)` : propios,
      },
      {
        name: "Sin items cross-tenant",
        passed: crossItems === 0,
        detail:
          crossItems === 0
            ? "Todos los items pertenecen a esta tienda"
            : `⚠️ ${crossItems} items referencian productos de otro tenant`,
      },
    ];

    const status: EstadoSalud =
      crossItems > 0 ? "critical" : checks.every((k) => k.passed) ? "healthy" : "warning";

    return {
      tenantId: t.id,
      slug: t.slug,
      name: t.name || t.slug,
      status,
      checks,
      stats: {
        products,
        orders,
        customers,
        ordersLast24h,
        errorsLast24h: 0, // Podría integrarse con la API de Sentry más adelante
        operations30d: ops ? ops.total30d : null,
        lastOperationAt: ops?.ultima ? ops.ultima.toISOString() : null,
      },
    };
  });
}

/** critical si alguna prueba global falla o algún negocio está crítico; healthy sólo si todo está sano. */
export function estadoGeneral(tenants: readonly TenantHealth[], pruebas: readonly IsolationCheck[]): EstadoSalud {
  const pruebasOk = pruebas.every((p) => p.passed);
  if (!pruebasOk || tenants.some((t) => t.status === "critical")) return "critical";
  return tenants.every((t) => t.status === "healthy") ? "healthy" : "warning";
}
