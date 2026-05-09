import type { Meta, StoryObj } from "@storybook/react";
import { ShoppingBag, TrendingUp, Users } from "lucide-react";
import { StatCard, ChartWrapper, DataTable, BadgeStatus } from "./data-display";

// ── StatCard ──────────────────────────────────────────────────────────────────

const statCardMeta: Meta<typeof StatCard> = {
  title: "Design System/StatCard",
  component: StatCard,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Tarjeta KPI canónica (data-display). Reemplaza KPITile custom. Soporta delta, sparkline SVG, densidad y emphasis semantico. Nunca hardcodear colores — usar emphasis.",
      },
    },
  },
  argTypes: {
    emphasis: { control: "select", options: ["neutral", "success", "warning", "error"] },
    trend: { control: "select", options: ["up", "down", "neutral"] },
    density: { control: "select", options: ["compact", "default", "comfortable"] },
  },
  tags: ["autodocs"],
};

export default statCardMeta;
type StatCardStory = StoryObj<typeof statCardMeta>;

/** Uso por defecto: KPI simple sin delta. */
export const Default: StatCardStory = {
  args: {
    label: "Ventas hoy",
    value: "S/ 1,200",
  },
};

/** KPI con delta positivo — trend inferido del signo. */
export const WithDeltaUp: StatCardStory = {
  args: {
    label: "Ventas mes",
    value: "S/ 14,800",
    delta: 12.5,
    deltaLabel: "vs mes anterior",
    emphasis: "success",
  },
};

/** KPI con delta negativo — trend inferido, emphasis error. */
export const WithDeltaDown: StatCardStory = {
  args: {
    label: "Devoluciones",
    value: "S/ 320",
    delta: -8.3,
    deltaLabel: "vs semana pasada",
    emphasis: "error",
  },
};

/** Con icono lateral y sub-valor adicional. */
export const WithIconAndSubValue: StatCardStory = {
  args: {
    label: "Clientes activos",
    value: "248",
    subValue: "23 nuevos esta semana",
    icon: Users,
    emphasis: "neutral",
  },
};

/** Densidad compact — para listas o sidebars. */
export const DensityCompact: StatCardStory = {
  args: {
    label: "Pedidos pendientes",
    value: "7",
    delta: 2.0,
    density: "compact",
  },
};

/** Con sparkline SVG inline (sin deps Recharts). */
export const WithSparkline: StatCardStory = {
  args: {
    label: "Ventas 7 dias",
    value: "S/ 4,520",
    delta: 8.1,
    deltaLabel: "vs semana anterior",
    emphasis: "success",
    sparkline: {
      data: [320, 410, 380, 450, 490, 420, 520],
      color: "var(--data-success)",
      height: 32,
    },
  },
};

/** Clickable — cuando el card abre un detalle. */
export const Clickable: StatCardStory = {
  args: {
    label: "Ticket promedio",
    value: "S/ 58.40",
    delta: 3.2,
    icon: TrendingUp,
    onClick: () => alert("Ver detalle"),
  },
};

/** Grid de 4 KPIs — patrón tipico del dashboard admin. */
export const KpiGrid: StatCardStory = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 max-w-2xl">
      <StatCard label="Ventas hoy" value="S/ 1,200" delta={5.2} emphasis="success" icon={ShoppingBag} />
      <StatCard label="Pedidos" value="34" delta={-2.1} emphasis="warning" />
      <StatCard label="Clientes" value="248" delta={12.0} emphasis="success" icon={Users} />
      <StatCard label="Devoluciones" value="S/ 80" delta={-15.0} emphasis="error" />
    </div>
  ),
};

// ── ChartWrapper ──────────────────────────────────────────────────────────────

export const ChartWrapperDefault: StoryObj = {
  render: () => (
    <ChartWrapper title="Ventas por dia" description="Ultimos 7 dias" className="max-w-lg">
      <div className="h-32 flex items-center justify-center text-[var(--text-tertiary)] text-sm border-2 border-dashed border-[var(--rule-base)] rounded-lg">
        Area del grafico (Recharts / SVG)
      </div>
    </ChartWrapper>
  ),
  name: "ChartWrapper — con header",
  parameters: {
    docs: {
      description: {
        story:
          "Contenedor canonico para graficos. Siempre usa surface-raised + rule-base. Los graficos internos deben leer colores con useChartTokens().",
      },
    },
  },
};

// ── DataTable ──────────────────────────────────────────────────────────────────

export const DataTableDefault: StoryObj = {
  render: () => (
    <DataTable className="max-w-xl">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Cant.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Arroz Costeño 1kg</td>
          <td>3</td>
          <td>S/ 15.00</td>
        </tr>
        <tr>
          <td>Aceite Primor 1L</td>
          <td>1</td>
          <td>S/ 8.50</td>
        </tr>
        <tr>
          <td>Azucar Rubia 1kg</td>
          <td>2</td>
          <td>S/ 6.00</td>
        </tr>
      </tbody>
    </DataTable>
  ),
  name: "DataTable — basica",
  parameters: {
    docs: {
      description: {
        story: "Tabla canonica. Aplica thead con surface-sunken + hover en rows. No reinventar estilos de tabla.",
      },
    },
  },
};

export const DataTableZebra: StoryObj = {
  render: () => (
    <DataTable zebra stickyHeader className="max-w-xl">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Cliente</th>
          <th>Estado</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {[
          { fecha: "09/05", cliente: "Ana Torres", estado: "Pagado", total: "S/ 45.00" },
          { fecha: "09/05", cliente: "Luis Mamani", estado: "Pendiente", total: "S/ 28.50" },
          { fecha: "08/05", cliente: "Rosa Quispe", estado: "Pagado", total: "S/ 72.00" },
          { fecha: "08/05", cliente: "Jorge Silva", estado: "Cancelado", total: "S/ 15.00" },
        ].map((row, i) => (
          <tr key={i}>
            <td>{row.fecha}</td>
            <td>{row.cliente}</td>
            <td>{row.estado}</td>
            <td>{row.total}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  ),
  name: "DataTable — zebra + stickyHeader",
};

// ── BadgeStatus ────────────────────────────────────────────────────────────────

export const BadgeStatusAllVariants: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <BadgeStatus variant="success" label="Pagado" dot />
      <BadgeStatus variant="warning" label="Pendiente" dot />
      <BadgeStatus variant="error" label="Rechazado" dot />
      <BadgeStatus variant="info" label="Informativo" dot />
      <BadgeStatus variant="neutral" label="Sin estado" dot />
      <BadgeStatus variant="pending" label="Procesando" dot pulse />
    </div>
  ),
  name: "BadgeStatus — todas las variantes",
  parameters: {
    docs: {
      description: {
        story:
          "Badge de estado canonico. Usar segun semantica: success=aprobado/activo, warning=revision, error=fallo, info=neutral, pending=en proceso (con pulse).",
      },
    },
  },
};

export const BadgeStatusSizes: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <BadgeStatus variant="success" label="Pagado (md)" size="md" dot />
      <BadgeStatus variant="success" label="Pagado (sm)" size="sm" dot />
    </div>
  ),
  name: "BadgeStatus — sm vs md",
};
