#!/usr/bin/env node
/**
 * limpiar-ordenes-cruzadas.mjs — órdenes de compra con proveedor o productos de
 * OTRO negocio (10-10).
 *
 * Por qué: el cron de reposición buscaba el proveedor por NOMBRE en toda la
 * base y 34 órdenes de `main` quedaron con proveedor (`sup-demo-4`) y producto
 * (Atún 1252621) de `demo`. El código ya no las crea; esto lista las que
 * quedaron y propone qué hacer con cada una.
 *
 * Uso:
 *   node scripts/limpiar-ordenes-cruzadas.mjs                    # dry-run (no escribe), todos los negocios
 *   node scripts/limpiar-ordenes-cruzadas.mjs --tenant main      # dry-run de un negocio (id o slug)
 *   node scripts/limpiar-ordenes-cruzadas.mjs --aplicar --tenant main
 *
 * Qué propone, por orden cruzada:
 *   · abierta (pendiente / auto_generated / parcial) → CANCELAR en el negocio
 *     donde está, con `cancelReason` que dice de quién eran proveedor/productos;
 *   · recibida → revisar a mano (no se toca);
 *   · stock movido en el negocio AJENO (InventoryMovement `OC-<id>` sobre un
 *     producto de otro negocio, o movimiento con tenantId distinto al de su
 *     producto) → se lista con sus filas para revertir A MANO: el script nunca
 *     toca stock;
 *   · cuentas por pagar ligadas → se listan (no se tocan).
 *
 * Garantías: sin `--aplicar` corre en `BEGIN READ ONLY … ROLLBACK`. `--aplicar`
 * exige `--tenant`, sólo cancela órdenes de ESE negocio, en una transacción, con
 * `status` abierto en el WHERE (idempotente: la segunda corrida no cambia nada)
 * y deja una fila en ActivityLog por orden. Parámetros siempre `$1 $2`. Nunca
 * `SET SESSION` (el pooler lo pega en conexiones de producción).
 */
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
process.env.TZ = "UTC";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const iTenant = args.indexOf("--tenant");
const tenantArg = iTenant >= 0 ? args[iTenant + 1] : undefined;
if (aplicar && !tenantArg) {
  console.error("--aplicar exige --tenant <id|slug>: se limpia un negocio por vez.");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL (.env.local).");
  process.exit(2);
}

const ABIERTOS = ["pendiente", "auto_generated", "parcial"];

const SQL_CRUZADAS = `
  select po.id, po."tenantId", t.slug as tenant_slug, po.status::text as status, po.total::numeric as total,
         po."createdAt", po."supplierId", s."tenantId" as sup_tenant, ts.slug as sup_slug,
         coalesce((select sum(pi.quantity * pi."unitCost") from "PurchaseItem" pi where pi."purchaseOrderId" = po.id), 0)::numeric as suma_lineas,
         coalesce((select json_agg(json_build_object('productId', pi."productId", 'tenant', p."tenantId", 'nombre', p.name))
                     from "PurchaseItem" pi join "Product" p on p.id = pi."productId"
                    where pi."purchaseOrderId" = po.id and p."tenantId" <> po."tenantId"), '[]'::json) as productos_ajenos,
         coalesce((select json_agg(gr.ref order by gr."createdAt") from "GoodsReceipt" gr where gr."purchaseOrderId" = po.id), '[]'::json) as recepciones,
         coalesce((select json_agg(json_build_object('id', pa.id, 'tenant', pa."tenantId", 'monto', pa.amount, 'estado', pa.status))
                     from "Payable" pa where pa."purchaseOrderId" = po.id), '[]'::json) as cuentas
    from "PurchaseOrder" po
    join "Tenant" t on t.id = po."tenantId"
    left join "Supplier" s on s.id = po."supplierId"
    left join "Tenant" ts on ts.id = s."tenantId"
   where ($1::text is null or po."tenantId" = $1)
     and ( s."tenantId" <> po."tenantId"
           or exists (select 1 from "PurchaseItem" pi join "Product" p on p.id = pi."productId"
                       where pi."purchaseOrderId" = po.id and p."tenantId" <> po."tenantId") )
   order by po."tenantId", po."createdAt"`;

/** Stock tocado en un negocio que no es el del producto, por orden o por movimiento cruzado. */
const SQL_STOCK_AJENO = `
  select im.id, im."tenantId" as mov_tenant, p."tenantId" as prod_tenant, im."productId", p.name, im.type,
         im.quantity, im."previousStock", im."newStock", im.reference, im."createdBy", im."createdAt"
    from "InventoryMovement" im join "Product" p on p.id = im."productId"
   where ($1::text is null or im."tenantId" = $1 or p."tenantId" = $1)
     and ( im."tenantId" <> p."tenantId"
           or (im.reference like 'OC-%' and exists (
                 select 1 from "PurchaseOrder" po where po.id = substr(im.reference, 4) and po."tenantId" <> p."tenantId")) )
   order by im."createdAt"`;

const fmt = (n) => Number(n).toFixed(2);
const fecha = (d) => new Date(d).toISOString().slice(0, 16).replace("T", " ");

function propuesta(o) {
  if (o.status === "cancelado") return "nada (ya cancelada)";
  if (ABIERTOS.includes(o.status)) return `CANCELAR en ${o.tenant_slug}`;
  return "REVISAR A MANO (recibida: no se toca)";
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let codigo = 0;
try {
  await c.query(aplicar ? "BEGIN" : "BEGIN READ ONLY");
  let tenantId = null;
  if (tenantArg) {
    const t = await c.query(`select id, slug from "Tenant" where id = $1 or slug = $1`, [tenantArg]);
    if (t.rows.length !== 1) throw new Error(`Negocio «${tenantArg}» no encontrado (o ambiguo)`);
    tenantId = t.rows[0].id;
  }

  const { rows: ordenes } = await c.query(SQL_CRUZADAS, [tenantId]);
  const { rows: stock } = await c.query(SQL_STOCK_AJENO, [tenantId]);

  console.log(`\n${aplicar ? "APLICAR" : "DRY-RUN (no escribe)"} · negocio: ${tenantArg ?? "todos"} · ${new Date().toISOString()}\n`);
  console.log(`Órdenes cruzadas: ${ordenes.length}`);

  const resumen = new Map();
  for (const o of ordenes) {
    const k = `${o.tenant_slug} ← ${o.sup_slug ?? "?"} · ${o.status}`;
    const r = resumen.get(k) ?? { n: 0, total: 0, lineas: 0, desde: o.createdAt, hasta: o.createdAt, propuesta: propuesta(o) };
    r.n++; r.total += Number(o.total); r.lineas += Number(o.suma_lineas);
    if (o.createdAt < r.desde) r.desde = o.createdAt;
    if (o.createdAt > r.hasta) r.hasta = o.createdAt;
    resumen.set(k, r);
  }
  console.table([...resumen].map(([k, r]) => ({
    "negocio ← dueño del proveedor · estado": k, ordenes: r.n, "total guardado": fmt(r.total), "Σ líneas": fmt(r.lineas),
    desde: fecha(r.desde), hasta: fecha(r.hasta), propuesta: r.propuesta,
  })));

  console.log("Detalle:");
  console.table(ordenes.map((o) => ({
    id: o.id, negocio: o.tenant_slug, estado: o.status, proveedor: `${o.supplierId} (${o.sup_slug ?? "?"})`,
    "productos ajenos": o.productos_ajenos.map((p) => p.productId).join(",") || "-",
    total: fmt(o.total), "Σ líneas": fmt(o.suma_lineas), creada: fecha(o.createdAt),
    recepciones: o.recepciones.join(",") || "-", cuentas: o.cuentas.map((x) => `${x.id}:${x.estado}`).join(",") || "-",
    propuesta: propuesta(o),
  })));

  console.log(`\nStock movido sobre productos de otro negocio: ${stock.length} fila(s)`);
  if (stock.length > 0) {
    console.table(stock.map((m) => ({
      id: m.id, "mov en": m.mov_tenant, "producto de": m.prod_tenant, producto: `${m.productId} ${m.name}`, tipo: m.type,
      cant: m.quantity, antes: m.previousStock, despues: m.newStock, ref: m.reference, por: m.createdBy, cuando: fecha(m.createdAt),
    })));
    console.log("→ Propuesta: revertir A MANO cada fila (ajuste inverso en el negocio dueño del producto). El script no toca stock.");
    codigo = 3;
  } else {
    console.log("→ Nada que revertir: ninguna recepción ni orden cruzada movió stock de otro negocio.");
  }

  const cuentas = ordenes.flatMap((o) => o.cuentas.map((x) => ({ orden: o.id, ...x })));
  console.log(`\nCuentas por pagar ligadas a órdenes cruzadas: ${cuentas.length}`);
  if (cuentas.length > 0) console.table(cuentas);

  const aCancelar = ordenes.filter((o) => ABIERTOS.includes(o.status));
  if (!aplicar) {
    console.log(`\nCon --aplicar --tenant <negocio> se cancelarían ${aCancelar.length} orden(es) abiertas de ese negocio. Nada se escribió.`);
    await c.query("ROLLBACK");
  } else {
    let canceladas = 0;
    for (const o of aCancelar) {
      const dueno = o.sup_tenant !== o.tenantId ? o.sup_slug : (o.productos_ajenos[0]?.tenant ?? "otro negocio");
      const motivo = `Orden cruzada entre negocios: proveedor/productos de ${dueno}. Limpieza ${new Date().toISOString().slice(0, 10)}.`;
      const r = await c.query(
        `update "PurchaseOrder" set status = 'cancelado'::"PurchaseStatus", "cancelReason" = $3, "updatedAt" = now()
          where id = $1 and "tenantId" = $2 and status::text = any($4::text[])`,
        [o.id, tenantId, motivo, ABIERTOS],
      );
      if (r.rowCount === 1) {
        canceladas++;
        await c.query(
          `insert into "ActivityLog" (id, action, entity, "entityId", detail, "user", "tenantId", "createdAt")
           values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now())`,
          ["Cancelar", "compra", o.id, motivo, "script:limpiar-ordenes-cruzadas", tenantId],
        );
      }
    }
    await c.query("COMMIT");
    console.log(`\nCanceladas: ${canceladas} de ${aCancelar.length} (las demás ya no estaban abiertas).`);
  }
} catch (e) {
  await c.query("ROLLBACK").catch(() => undefined);
  console.error("Error:", e instanceof Error ? e.message : String(e));
  codigo = 1;
} finally {
  await c.end();
}
process.exit(codigo);
