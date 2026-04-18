'use client'

import { CardTitle, SectionTitle } from "@buleje/design-system";

import { useState, useEffect, useCallback } from 'react'
import {
  Package,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  AlertCircle,
  RefreshCw,
  ArrowDownCircle,
  Clock,
  XCircle,
  BarChart3,
} from "@buleje/design-system/icons"
import { cn } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Batch {
  id: string
  batchCode?: string
  productId: string
  product?: { name: string; unit?: string }
  quantity: number
  costUnit: number
  expiryDate: string | null
  createdAt: string
}

interface Product {
  id: string
  name: string
  stock: number
  stockMin: number
  unit?: string
}

interface InventoryMovement {
  id: string
  type: string
  quantity: number
  productId: string
  product?: { name: string }
  createdAt: string
}

interface DashboardData {
  products?: Product[]
  orders?: unknown[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function daysUntilExpiry(expiryDate: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const CHART_COLORS = ['#00B4A6', '#f97316', '#e76f51', '#264653', '#2a9d8f', '#e9c46a']

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  ENTRY: 'Entrada',
  EXIT: 'Salida',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  TRANSFER: 'Transferencia',
  PURCHASE: 'Compra',
  SALE: 'Venta',
  LOSS: 'Merma',
  entry: 'Entrada',
  exit: 'Salida',
  adjustment: 'Ajuste',
  return: 'Devolución',
  transfer: 'Transferencia',
  purchase: 'Compra',
  sale: 'Venta',
  loss: 'Merma',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InventoryMetricsTab() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [batchesRes, dashboardRes, movementsRes] = await Promise.all([
        fetch('/api/batches'),
        fetch('/api/admin/dashboard'),
        fetch('/api/inventory-movements'),
      ])

      if (!batchesRes.ok || !dashboardRes.ok || !movementsRes.ok) {
        throw new Error('Error al obtener datos del servidor')
      }

      const batchesData = await batchesRes.json()
      const dashboardData: DashboardData = await dashboardRes.json()
      const movementsData = await movementsRes.json()

      setBatches(Array.isArray(batchesData) ? batchesData : batchesData.batches || batchesData.data || [])
      setProducts(
        Array.isArray(dashboardData.products)
          ? dashboardData.products
          : Array.isArray(dashboardData) ? dashboardData : []
      )
      setMovements(
        Array.isArray(movementsData) ? movementsData : movementsData.movements || movementsData.data || []
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── KPI Calculations ───────────────────────────────────────────────────────

  const now = new Date()

  const activeBatches = batches.filter((b) => b.quantity > 0)

  const expiringBatches = activeBatches.filter((b) => {
    if (!b.expiryDate) return false
    const days = daysUntilExpiry(b.expiryDate)
    return days > 0 && days <= 30
  })

  const expiredBatches = activeBatches.filter((b) => {
    if (!b.expiryDate) return false
    return new Date(b.expiryDate) < now
  })

  const totalInventoryValue = activeBatches.reduce(
    (sum, b) => sum + b.quantity * (b.costUnit || 0),
    0
  )

  const lowStockProducts = products.filter(
    (p) => typeof p.stock === 'number' && typeof p.stockMin === 'number' && p.stock < p.stockMin && p.stockMin > 0
  )

  // ─── Chart Data ──────────────────────────────────────────────────────────────

  // Movements by type
  const movementsByType = movements.reduce<Record<string, number>>((acc, m) => {
    const type = m.type || 'Otro'
    acc[type] = (acc[type] || 0) + Math.abs(m.quantity || 1)
    return acc
  }, {})

  const movementChartData = Object.entries(movementsByType)
    .map(([type, count]) => ({
      tipo: MOVEMENT_TYPE_LABELS[type] || type,
      cantidad: count,
    }))
    .sort((a, b) => b.cantidad - a.cantidad)

  // Top 5 products by rotation (sales in last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const salesByProduct = movements
    .filter(
      (m) =>
        ['EXIT', 'SALE', 'exit', 'sale'].includes(m.type) &&
        new Date(m.createdAt) >= thirtyDaysAgo
    )
    .reduce<Record<string, { name: string; quantity: number }>>((acc, m) => {
      const productName = m.product?.name || m.productId
      if (!acc[productName]) {
        acc[productName] = { name: productName, quantity: 0 }
      }
      acc[productName].quantity += Math.abs(m.quantity)
      return acc
    }, {})

  const topRotationProducts = Object.values(salesByProduct)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map((p) => ({ nombre: p.name, ventas: p.quantity }))

  // ─── Critical Batches Table (expired + expiring ≤7 days) ─────────────────

  const criticalBatches = activeBatches
    .filter((b) => {
      if (!b.expiryDate) return false
      const days = daysUntilExpiry(b.expiryDate)
      return days <= 7
    })
    .sort((a, b) => {
      const daysA = a.expiryDate ? daysUntilExpiry(a.expiryDate) : 999
      const daysB = b.expiryDate ? daysUntilExpiry(b.expiryDate) : 999
      return daysA - daysB
    })

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-[var(--data-success)] dark:text-[var(--data-success)]" />
        <p className="text-[var(--text-tertiary)] text-sm">
          Cargando métricas de inventario...
        </p>
      </div>
    )
  }

  // ─── Error State ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <AlertCircle className="h-10 w-10 text-[var(--data-error)]" />
        <p className="text-[var(--data-error)] dark:text-[var(--data-error)] font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm bg-[var(--accent-soft)] text-white rounded-lg hover:bg-[var(--accent-soft)] transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-base sm:text-xl font-bold text-[var(--text-primary)]">
            Métricas de Inventario
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            KPIs, rotación y lotes críticos
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {/* ─── KPI Cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
        {/* Total lotes activos */}
        <KPICard
          icon={<Package className="h-5 w-5" />}
          iconBg="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"
          iconColor="text-[var(--data-success)] dark:text-[var(--data-success)]"
          label="Lotes activos"
          value={activeBatches.length.toString()}
        />

        {/* Lotes por vencer */}
        <KPICard
          icon={<Clock className="h-5 w-5" />}
          iconBg="bg-amber-100 dark:bg-amber-900/40"
          iconColor="text-amber-600 dark:text-amber-400"
          label="Por vencer (≤30d)"
          value={expiringBatches.length.toString()}
          alert={expiringBatches.length > 0}
        />

        {/* Lotes vencidos */}
        <KPICard
          icon={<XCircle className="h-5 w-5" />}
          iconBg="bg-red-100 dark:bg-red-900/40"
          iconColor="text-red-600 dark:text-red-400"
          label="Vencidos"
          value={expiredBatches.length.toString()}
          alert={expiredBatches.length > 0}
          alertColor="red"
        />

        {/* Valor total inventario */}
        <KPICard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"
          iconColor="text-[var(--data-success)] dark:text-[var(--data-success)]"
          label="Valor inventario"
          value={formatCurrency(totalInventoryValue)}
        />

        {/* Stock bajo */}
        <KPICard
          icon={<AlertTriangle className="h-5 w-5" />}
          iconBg="bg-orange-100 dark:bg-orange-900/40"
          iconColor="text-orange-600 dark:text-orange-400"
          label="Stock bajo"
          value={lowStockProducts.length.toString()}
          alert={lowStockProducts.length > 0}
          alertColor="orange"
        />
      </div>

      {/* ─── Charts Section ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Movimientos por tipo */}
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-3 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-[var(--data-success)] dark:text-[var(--data-success)]" />
            <CardTitle className="font-semibold text-[var(--text-primary)]">
              Movimientos por tipo
            </CardTitle>
          </div>
          {movementChartData.length === 0 ? (
            <EmptyState message="No hay movimientos registrados" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={movementChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="tipo"
                  tick={{ fontSize: 12 }}
                  className="text-[var(--text-secondary)]"
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-bg, #fff)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <Bar dataKey="cantidad" fill="#00B4A6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 5 rotación */}
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-3 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-[var(--data-success)] dark:text-[var(--data-success)]" />
            <CardTitle className="font-semibold text-[var(--text-primary)]">
              Top 5 mayor rotación (30 días)
            </CardTitle>
          </div>
          {topRotationProducts.length === 0 ? (
            <EmptyState message="No hay datos de ventas en los últimos 30 días" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={topRotationProducts}
                  dataKey="ventas"
                  nameKey="nombre"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  label={({ name, value }) => {
                    const n = String(name ?? "");
                    return `${n.length > 15 ? n.slice(0, 15) + "…" : n}: ${value}`;
                  }}
                  labelLine
                >
                  {topRotationProducts.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${Number(value)} uds`, 'Ventas'] as [string, string]}
                  contentStyle={{
                    backgroundColor: 'var(--color-bg, #fff)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value: string) =>
                    value.length > 20 ? value.slice(0, 20) + '…' : value
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── Critical Batches Table ───────────────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error)] dark:text-[var(--data-error)]" />
          <CardTitle className="font-semibold text-[var(--text-primary)]">
            Lotes críticos
          </CardTitle>
          <span className="text-xs text-[var(--text-tertiary)] ml-1">
            (vencidos + por vencer ≤7 días)
          </span>
          {criticalBatches.length > 0 && (
            <span className="ml-auto inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40 text-[var(--data-error)] dark:text-[var(--data-error)] rounded-full">
              {criticalBatches.length}
            </span>
          )}
        </div>

        {criticalBatches.length === 0 ? (
          <EmptyState message="No hay lotes en estado crítico. ¡Bien!" icon="check" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)]">
                  <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)]">
                    Producto
                  </th>
                  <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)]">
                    Lote
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-[var(--text-tertiary)]">
                    Cantidad
                  </th>
                  <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)]">
                    Unidad
                  </th>
                  <th className="text-left py-2.5 px-3 font-medium text-[var(--text-tertiary)]">
                    Vence
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-[var(--text-tertiary)]">
                    Estado
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-[var(--text-tertiary)]">
                    Costo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {criticalBatches.map((batch) => {
                  const days = batch.expiryDate ? daysUntilExpiry(batch.expiryDate) : 999
                  const isExpired = days < 0
                  const isExpiredToday = days === 0

                  return (
                    <tr
                      key={batch.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium">
                        {batch.product?.name || `Producto ${batch.productId}`}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)] font-mono text-xs">
                        {batch.batchCode || batch.id.slice(0, 8)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--text-primary)] tabular-nums">
                        {batch.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                        {batch.product?.unit || 'und'}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                        {batch.expiryDate ? formatDate(batch.expiryDate) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40 text-[var(--data-error)] dark:text-[var(--data-error)] rounded-full">
                            <XCircle className="h-3 w-3" />
                            Vencido
                          </span>
                        ) : isExpiredToday ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40 text-[var(--data-error)] dark:text-[var(--data-error)] rounded-full">
                            <AlertCircle className="h-3 w-3" />
                            Vence hoy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/40 text-[var(--data-warning)] dark:text-[var(--data-warning)] rounded-full">
                            <Clock className="h-3 w-3" />
                            {days}d restantes
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--text-primary)] tabular-nums">
                        {formatCurrency(batch.quantity * (batch.costUnit || 0))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--rule-base)] dark:border-gray-600">
                  <td
                    colSpan={6}
                    className="py-2.5 px-3 text-right font-semibold text-[var(--text-secondary)]"
                  >
                    Valor total en riesgo:
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-[var(--data-error)] dark:text-[var(--data-error)] tabular-nums">
                    {formatCurrency(
                      criticalBatches.reduce((s, b) => s + b.quantity * (b.costUnit || 0), 0)
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KPICard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  alert = false,
  alertColor = 'amber',
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: string
  alert?: boolean
  alertColor?: 'amber' | 'red' | 'orange'
}) {
  const ringColors: Record<string, string> = {
    amber: "ring-[var(--data-warning)] dark:ring-[var(--data-warning)]",
    red: "ring-[var(--data-error)] dark:ring-[var(--data-error)]",
    orange: "ring-[var(--data-warning)] dark:ring-[var(--data-warning)]",
  }

  return (
    <div
      className={cn(
        'bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-4 flex flex-col gap-3 transition-shadow',
        alert && `ring-2 ${ringColors[alertColor] || ringColors.amber}`
      )}
    >
      <div className={cn('inline-flex items-center justify-center h-10 w-10 rounded-lg', iconBg)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] leading-tight">{value}</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({
  message,
  icon = 'info',
}: {
  message: string
  icon?: 'info' | 'check'
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      {icon === 'check' ? (
        <div className="h-10 w-10 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center mb-3">
          <Package className="h-5 w-5 text-[var(--data-success)] dark:text-[var(--data-success)]" />
        </div>
      ) : (
        <div className="h-10 w-10 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center mb-3">
          <ArrowDownCircle className="h-5 w-5 text-[var(--text-tertiary)]" />
        </div>
      )}
      <p className="text-sm text-[var(--text-tertiary)]">{message}</p>
    </div>
  )
}
