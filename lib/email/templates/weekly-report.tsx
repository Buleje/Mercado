import React from "react";

// ──────────────────────────────────────────────
//  Template: Reporte semanal al dueño de bodega
// ──────────────────────────────────────────────

export interface TopProduct {
  name: string;
  quantitySold: number;
  unit: string;
  revenue: number;
}

export interface LowStockItem {
  name: string;
  currentStock: number;
  unit: string;
  minStock: number;
}

export interface PendingFiado {
  customerName: string;
  amountOwed: number;
  daysOverdue: number;
}

export interface WeeklyReportProps {
  /** Nombre del dueño */
  ownerName: string;
  /** Nombre de la tienda */
  storeName: string;
  /** Slug del tenant para construir URLs */
  slug: string;
  /** Rango de fechas del reporte (ej. "7 – 13 de abril, 2026") */
  weekRange: string;
  /** Ventas totales de la semana */
  totalSales: number;
  /** Número de pedidos completados */
  ordersCount: number;
  /** Ticket promedio */
  averageTicket: number;
  /** Comparación con semana anterior (porcentaje, puede ser negativo) */
  salesChangePercent?: number;
  /** Top 5 productos más vendidos */
  topProducts: TopProduct[];
  /** Productos con stock bajo */
  lowStockItems: LowStockItem[];
  /** Fiados pendientes de cobro */
  pendingFiados: PendingFiado[];
  /** Total adeudado en fiados */
  totalFiadoOwed: number;
  /** URL base de la plataforma */
  baseUrl?: string;
}

const PRIMARY = "#00A0A0";
const SECONDARY = "#f97316";
const TEXT = "#111827";
const MUTED = "#6b7280";
const BG_LIGHT = "#f9fafb";
const BORDER = "#e5e7eb";
const SUCCESS = "#16a34a";
const DANGER = "#dc2626";
const WARNING = "#d97706";

function fmt(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function fmtNum(n: number) {
  return n.toLocaleString("es-PE");
}

export default function WeeklyReportEmail({
  ownerName,
  storeName,
  slug,
  weekRange,
  totalSales,
  ordersCount,
  averageTicket,
  salesChangePercent,
  topProducts,
  lowStockItems,
  pendingFiados,
  totalFiadoOwed,
  baseUrl = "https://buleje.pe",
}: WeeklyReportProps) {
  const dashboardUrl = `${baseUrl}/${slug}/admin`;
  const stockUrl = `${baseUrl}/${slug}/admin/inventory`;
  const fiadosUrl = `${baseUrl}/${slug}/admin/fiado`;

  const changePositive =
    salesChangePercent !== undefined && salesChangePercent >= 0;
  const changeColor = changePositive ? SUCCESS : DANGER;
  const changeIcon = changePositive ? "↑" : "↓";
  const changeAbs =
    salesChangePercent !== undefined ? Math.abs(salesChangePercent) : undefined;

  return (
    <div
      style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
        backgroundColor: "#ffffff",
        border: `1px solid ${BORDER}`,
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, #111827 0%, #1f2937 100%)`,
          padding: "32px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "10px" }}>📊</div>
        <h1
          style={{
            color: "#ffffff",
            margin: "0 0 6px",
            fontSize: "22px",
            fontWeight: "700",
          }}
        >
          Reporte semanal
        </h1>
        <p style={{ color: "#9ca3af", margin: "0 0 4px", fontSize: "14px" }}>
          {storeName}
        </p>
        <p
          style={{
            color: PRIMARY,
            margin: 0,
            fontSize: "13px",
            fontWeight: "600",
          }}
        >
          {weekRange}
        </p>
      </div>

      {/* Saludo */}
      <div style={{ padding: "24px 24px 0" }}>
        <p style={{ color: TEXT, fontSize: "15px", margin: "0 0 16px", lineHeight: "1.6" }}>
          Hola, <strong>{ownerName}</strong> 👋 Aquí está el resumen de tu semana en{" "}
          {storeName}.
        </p>
      </div>

      {/* KPIs principales */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          padding: "0 24px 24px",
          flexWrap: "wrap",
        }}
      >
        {/* Ventas totales */}
        <div
          style={{
            flex: "1 1 150px",
            background: "#ecfdf5",
            border: `1px solid #bbf7d0`,
            borderRadius: "10px",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontSize: "11px",
              fontWeight: "700",
              color: MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Ventas totales
          </p>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: "26px",
              fontWeight: "800",
              color: SUCCESS,
              letterSpacing: "-0.5px",
            }}
          >
            {fmt(totalSales)}
          </p>
          {changeAbs !== undefined && (
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: "600",
                color: changeColor,
              }}
            >
              {changeIcon} {changeAbs.toFixed(1)}% vs semana anterior
            </p>
          )}
        </div>

        {/* Pedidos */}
        <div
          style={{
            flex: "1 1 120px",
            background: BG_LIGHT,
            border: `1px solid ${BORDER}`,
            borderRadius: "10px",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontSize: "11px",
              fontWeight: "700",
              color: MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Pedidos
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "32px",
              fontWeight: "800",
              color: PRIMARY,
            }}
          >
            {fmtNum(ordersCount)}
          </p>
        </div>

        {/* Ticket promedio */}
        <div
          style={{
            flex: "1 1 120px",
            background: BG_LIGHT,
            border: `1px solid ${BORDER}`,
            borderRadius: "10px",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontSize: "11px",
              fontWeight: "700",
              color: MUTED,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Ticket prom.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "22px",
              fontWeight: "800",
              color: SECONDARY,
            }}
          >
            {fmt(averageTicket)}
          </p>
        </div>
      </div>

      {/* Top 5 productos */}
      {topProducts.length > 0 && (
        <div style={{ padding: "0 24px 24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <p
              style={{
                fontWeight: "700",
                fontSize: "14px",
                color: TEXT,
                margin: 0,
              }}
            >
              🏆 Productos más vendidos
            </p>
            <a
              href={dashboardUrl}
              style={{ fontSize: "12px", color: PRIMARY, textDecoration: "none" }}
            >
              Ver todos →
            </a>
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              border: `1px solid ${BORDER}`,
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <thead>
              <tr style={{ background: BG_LIGHT }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Producto
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Vendidos
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Ingreso
                </th>
              </tr>
            </thead>
            <tbody>
              {topProducts.slice(0, 5).map((product, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: idx < topProducts.length - 1 ? `1px solid ${BORDER}` : "none",
                    background: idx % 2 === 0 ? "#ffffff" : BG_LIGHT,
                  }}
                >
                  <td style={{ padding: "9px 10px", color: TEXT }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: idx === 0 ? "#fbbf24" : idx === 1 ? "#9ca3af" : idx === 2 ? "#c07850" : BG_LIGHT,
                        color: idx < 3 ? "#fff" : MUTED,
                        textAlign: "center",
                        lineHeight: "18px",
                        fontSize: "10px",
                        fontWeight: "700",
                        marginRight: "6px",
                      }}
                    >
                      {idx + 1}
                    </span>
                    {product.name}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      textAlign: "right",
                      color: MUTED,
                    }}
                  >
                    {fmtNum(product.quantitySold)} {product.unit}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      textAlign: "right",
                      fontWeight: "600",
                      color: SUCCESS,
                    }}
                  >
                    {fmt(product.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock bajo */}
      {lowStockItems.length > 0 && (
        <div style={{ padding: "0 24px 24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <p
              style={{
                fontWeight: "700",
                fontSize: "14px",
                color: TEXT,
                margin: 0,
              }}
            >
              ⚠️ Productos con stock bajo
            </p>
            <a
              href={stockUrl}
              style={{ fontSize: "12px", color: PRIMARY, textDecoration: "none" }}
            >
              Gestionar →
            </a>
          </div>
          <div
            style={{
              background: "#fffbeb",
              border: `1px solid #fde68a`,
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            {lowStockItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom:
                    idx < lowStockItems.length - 1 ? `1px solid #fde68a` : "none",
                }}
              >
                <span style={{ fontSize: "13px", color: TEXT }}>
                  {item.name}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    color: item.currentStock === 0 ? DANGER : WARNING,
                    background:
                      item.currentStock === 0 ? "#fef2f2" : "#fef9c3",
                    padding: "2px 8px",
                    borderRadius: "12px",
                  }}
                >
                  {item.currentStock === 0
                    ? "Sin stock"
                    : `${item.currentStock} ${item.unit} quedan`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fiados pendientes */}
      {pendingFiados.length > 0 && (
        <div style={{ padding: "0 24px 24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <p
              style={{
                fontWeight: "700",
                fontSize: "14px",
                color: TEXT,
                margin: 0,
              }}
            >
              💳 Fiados pendientes
            </p>
            <a
              href={fiadosUrl}
              style={{ fontSize: "12px", color: PRIMARY, textDecoration: "none" }}
            >
              Ver todos →
            </a>
          </div>

          {/* Total fiados */}
          <div
            style={{
              background: "#fef2f2",
              border: `1px solid #fecaca`,
              borderRadius: "8px",
              padding: "12px 14px",
              marginBottom: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "13px", color: MUTED }}>
              Total por cobrar ({pendingFiados.length} clientes)
            </span>
            <span
              style={{ fontSize: "16px", fontWeight: "800", color: DANGER }}
            >
              {fmt(totalFiadoOwed)}
            </span>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              border: `1px solid ${BORDER}`,
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <thead>
              <tr style={{ background: BG_LIGHT }}>
                <th
                  style={{
                    textAlign: "left",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Cliente
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Deuda
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "9px 10px",
                    color: MUTED,
                    fontWeight: "600",
                    fontSize: "11px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {pendingFiados.map((fiado, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom:
                      idx < pendingFiados.length - 1 ? `1px solid ${BORDER}` : "none",
                    background: idx % 2 === 0 ? "#ffffff" : BG_LIGHT,
                  }}
                >
                  <td style={{ padding: "9px 10px", color: TEXT }}>
                    {fiado.customerName}
                  </td>
                  <td
                    style={{
                      padding: "9px 10px",
                      textAlign: "right",
                      fontWeight: "700",
                      color: DANGER,
                    }}
                  >
                    {fmt(fiado.amountOwed)}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: fiado.daysOverdue > 0 ? DANGER : WARNING,
                        background: fiado.daysOverdue > 0 ? "#fef2f2" : "#fffbeb",
                        padding: "2px 7px",
                        borderRadius: "10px",
                      }}
                    >
                      {fiado.daysOverdue > 0
                        ? `${fiado.daysOverdue}d vencido`
                        : "Pendiente"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CTA */}
      <div style={{ padding: "0 24px 28px", textAlign: "center" }}>
        <a
          href={dashboardUrl}
          style={{
            display: "inline-block",
            background: PRIMARY,
            color: "#ffffff",
            padding: "13px 36px",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "700",
            fontSize: "15px",
          }}
        >
          Ver panel completo →
        </a>
      </div>

      {/* Footer */}
      <div
        style={{
          background: BG_LIGHT,
          padding: "16px 24px",
          textAlign: "center",
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <p style={{ margin: "0 0 4px", fontSize: "12px", color: MUTED }}>
          Buleje — Plataforma SaaS para bodegas y tiendas
        </p>
        <p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>
          Recibes este reporte cada lunes. Para dejar de recibirlo, ajusta tus{" "}
          <a href={`${baseUrl}/${slug}/admin/settings`} style={{ color: PRIMARY }}>
            preferencias
          </a>
          .
        </p>
      </div>
    </div>
  );
}
