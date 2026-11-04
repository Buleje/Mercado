import "server-only";
import { Suspense } from "react";
import Link from "next/link";
import { CardTitle, DataTable, StatCard } from "@buleje/design-system";
import { Percent } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { ComisionesPlataformaDB, type ResumenComisiones } from "@/lib/db/comisiones-plataforma.db";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SuperAdminModuleTabs, MARKETPLACE_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { EstadoComisionBadge, TIPO_COMISION } from "./etiquetas";
import { TarjetaMovimiento, TarjetaNegocio } from "./tarjetas";

export const metadata = {
  title: "Comisiones — Buleje Superadmin",
  description:
    "Lo que la plataforma cobró en comisiones del marketplace, por negocio y por movimiento.",
  robots: { index: false, follow: false },
};

/**
 * /superadmin/marketplace/commissions — SOLO LECTURA (04-11 noche). Antes la tarjeta del hub
 * decía «Próximamente» con 62 movimientos guardados. Configurar porcentajes y pagar a vendors
 * sigue fuera de acá (zona de peligro: `lib/db/commissions.db.ts`).
 */
export default async function ComisionesPage() {
  await requirePlatformPage();
  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={Percent}
        title="Comisiones"
        kicker="Marketplace · Ingresos"
        info={{
          title: "Comisiones del marketplace",
          what: "Lo que la plataforma se queda de cada venta hecha por el marketplace, por negocio y por movimiento.",
          affects: "Solo para mirar: aquí no se cambian porcentajes ni se paga a nadie.",
          example:
            "Una venta de S/ 100 con 5 % deja S/ 5 «por liquidar»; el cierre automático la pasa a «liquidada».",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={MARKETPLACE_TABS} />}
      />
      <div className={`${SUPERADMIN_CONTENT} space-y-6`}>
        <Suspense
          fallback={<div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />}
        >
          <Cuerpo />
        </Suspense>
      </div>
    </div>
  );
}

const movimientos = (n: number) => `${n} ${n === 1 ? "movimiento" : "movimientos"}`;

function totalDe(r: ResumenComisiones, estado: string) {
  return r.porEstado.find((f) => f.estado === estado) ?? { movimientos: 0, total: 0 };
}

async function Cuerpo() {
  const r = await ComisionesPlataformaDB.resumen(30);
  const porLiquidar = totalDe(r, "pending");
  const liquidado = totalDe(r, "settled");
  const devuelto = totalDe(r, "refunded");
  const neto = r.porNegocio.reduce((s, f) => s + f.neto, 0);

  if (r.porNegocio.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Todavía no hay comisiones: aparecen con la primera venta del marketplace.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Para la plataforma"
          value={formatCurrency(neto)}
          subValue={`${r.porNegocio.length} negocios`}
          emphasis="success"
        />
        <StatCard
          label="Por liquidar"
          value={formatCurrency(porLiquidar.total)}
          subValue={movimientos(porLiquidar.movimientos)}
          emphasis={porLiquidar.total > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Liquidadas"
          value={formatCurrency(liquidado.total)}
          subValue={movimientos(liquidado.movimientos)}
        />
        <StatCard
          label="Devueltas"
          value={formatCurrency(devuelto.total)}
          subValue={movimientos(devuelto.movimientos)}
        />
      </div>

      {r.reglas === 0 && (
        <p className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
          Sin reglas propias: todas usan el porcentaje de cada tienda.
          <InfoTip
            title="Reglas de comisión"
            what="Una regla cambia el porcentaje por categoría, por plan o por tienda. Hoy no hay ninguna."
            example="Sin reglas, una tienda con 5 % paga 5 % en todas sus ventas."
          />
        </p>
      )}

      <section className="space-y-3">
        <CardTitle>Por negocio</CardTitle>
        <div className="hidden md:block">
          <DataTable>
            <thead>
              <tr>
                <th>Negocio</th>
                <th className="text-right">Movimientos</th>
                <th className="text-right">Por liquidar</th>
                <th className="text-right">Liquidado</th>
                <th className="text-right">Devuelto</th>
                <th className="text-right">Para la plataforma</th>
                <th>Último</th>
              </tr>
            </thead>
            <tbody>
              {r.porNegocio.map((f) => (
                <tr key={f.tenantId}>
                  <td>
                    {f.slug ? (
                      <Link
                        href={`/superadmin/tenants/${encodeURIComponent(f.slug)}`}
                        className="font-semibold hover:underline"
                      >
                        {f.negocio}
                      </Link>
                    ) : (
                      f.negocio
                    )}
                  </td>
                  <td className="text-right tabular-nums">{f.movimientos}</td>
                  <td className="text-right tabular-nums">{formatCurrency(f.porLiquidar)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(f.liquidado)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(f.devuelto)}</td>
                  <td className="text-right font-semibold tabular-nums">
                    {formatCurrency(f.neto)}
                  </td>
                  <td className="whitespace-nowrap">
                    {f.ultimo ? formatDateShort(f.ultimo) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        <ul className="space-y-2 md:hidden">
          {r.porNegocio.map((f) => (
            <TarjetaNegocio key={f.tenantId} f={f} />
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <CardTitle>Últimos {r.ultimos.length} movimientos</CardTitle>
        <div className="hidden md:block">
          <DataTable>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Negocio</th>
                <th>Tienda</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th className="text-right">Tasa</th>
                <th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {r.ultimos.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatDateShort(m.creado)}</td>
                  <td>{m.negocio}</td>
                  <td>{m.tienda ?? "—"}</td>
                  <td>{TIPO_COMISION[m.tipo] ?? m.tipo}</td>
                  <td>
                    <EstadoComisionBadge estado={m.estado} />
                  </td>
                  <td className="text-right tabular-nums">
                    {m.tasa
                      ? `${m.tasa.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`
                      : "—"}
                  </td>
                  <td className="text-right font-semibold tabular-nums">
                    {formatCurrency(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        <ul className="space-y-2 md:hidden">
          {r.ultimos.map((m) => (
            <TarjetaMovimiento key={m.id} m={m} />
          ))}
        </ul>
      </section>
    </>
  );
}
