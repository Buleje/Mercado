'use client';

import { useState, useEffect, useCallback } from 'react';

type AlertData = {
  sinStock: { id: number; name: string; category: string; lastSaleDate: string | null }[];
  stockCritico: { id: number; name: string; stock: number; stockMin: number; category: string }[];
  sinMovimiento: { id: number; name: string; stock: number; costPrice: number; valorAtado: number; category: string; lastSaleDate: string | null }[];
  porVencer: { batchId: string; productName: string; lote: string; productId: number | null; expiryDate: string; quantity: number; daysToExpiry: number }[];
  resumen: {
    sinStockCount: number;
    criticoCount: number;
    sinMovimientoCount: number;
    sinMovimientoValor: number;
    porVencerCount: number;
  };
};

export default function StockAlertsDashboard() {
  const [data, setData] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/stock-alerts');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Refresh on focus
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') fetchAlerts();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [fetchAlerts]);

  const toggle = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'Nunca';
    return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { resumen } = data;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-[var(--data-error-500)]">{resumen.sinStockCount}</div>
          <div className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">Sin stock</div>
        </div>
        <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-[var(--data-warning-500)]">{resumen.criticoCount}</div>
          <div className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">Stock critico</div>
        </div>
        <div className="bg-[var(--surface-sunken)]/50 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-[var(--text-secondary)]">
            S/{resumen.sinMovimientoValor.toLocaleString('es-PE', { minimumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-[var(--text-secondary)] dark:text-muted font-medium">
            Sin movimiento ({resumen.sinMovimientoCount})
          </div>
        </div>
        <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-[var(--data-warning-500)]">{resumen.porVencerCount}</div>
          <div className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">Por vencer (7d)</div>
        </div>
      </div>

      {/* Section 1: SIN STOCK */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
        <button
          onClick={() => toggle('sinStock')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[var(--data-error-500)]" />
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">SIN STOCK</span>
            <span className="text-xs bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-2 py-0.5 rounded-full">
              {resumen.sinStockCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform ${collapsed.sinStock ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.sinStock && (
          <div className="px-4 pb-4">
            {data.sinStock.length === 0 ? (
              <p className="text-sm text-[var(--data-success-500)] py-2">Todos los productos tienen stock</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Producto</th>
                      <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Categoria</th>
                      <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Última venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sinStock.map(p => (
                      <tr key={p.id} className="border-b border-[var(--rule-base)]">
                        <td className="py-2 px-2 text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{p.name}</td>
                        <td className="py-2 px-2 text-[var(--text-secondary)] dark:text-muted">{p.category}</td>
                        <td className="py-2 px-2 text-[var(--text-secondary)] dark:text-muted">{formatDate(p.lastSaleDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: STOCK CRÍTICO */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
        <button
          onClick={() => toggle('critico')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[var(--data-warning-500)]" />
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">STOCK CRITICO</span>
            <span className="text-xs bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] px-2 py-0.5 rounded-full">
              {resumen.criticoCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform ${collapsed.critico ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.critico && (
          <div className="px-4 pb-4">
            {data.stockCritico.length === 0 ? (
              <p className="text-sm text-[var(--data-success-500)] py-2">Ningun producto en nivel critico</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Producto</th>
                      <th className="text-center py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Stock</th>
                      <th className="text-center py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Mínimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stockCritico.map(p => (
                      <tr key={p.id} className="border-b border-[var(--rule-base)]">
                        <td className="py-2 px-2 text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{p.name}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-[var(--data-error-500)] font-bold">{p.stock}</span>
                        </td>
                        <td className="py-2 px-2 text-center text-[var(--text-secondary)] dark:text-muted">{p.stockMin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: SIN MOVIMIENTO */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
        <button
          onClick={() => toggle('sinMovimiento')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gray-500" />
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">SIN MOVIMIENTO (30+ dias)</span>
            <span className="text-xs bg-[var(--surface-sunken)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">
              {resumen.sinMovimientoCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform ${collapsed.sinMovimiento ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.sinMovimiento && (
          <div className="px-4 pb-4">
            {data.sinMovimiento.length === 0 ? (
              <p className="text-sm text-[var(--data-success-500)] py-2">Todos los productos con stock tienen movimiento</p>
            ) : (
              <>
                <div className="bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] rounded-lg p-3 mb-3 text-center">
                  <span className="text-lg font-bold text-[var(--data-error-500)]">
                    S/{resumen.sinMovimientoValor.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] ml-2">de capital sin rotar</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                        <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Producto</th>
                        <th className="text-center py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Stock</th>
                        <th className="text-right py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Valor (S/)</th>
                        <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Última venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sinMovimiento.map(p => (
                        <tr key={p.id} className="border-b border-[var(--rule-base)]">
                          <td className="py-2 px-2 text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{p.name}</td>
                          <td className="py-2 px-2 text-center text-[var(--text-secondary)] dark:text-muted">{p.stock}</td>
                          <td className="py-2 px-2 text-right text-[var(--data-error-500)] font-medium">
                            S/{Number(p.valorAtado).toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-[var(--text-secondary)] dark:text-muted">{formatDate(p.lastSaleDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 4: POR VENCER */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
        <button
          onClick={() => toggle('porVencer')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[var(--data-warning-500)]" />
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">POR VENCER (7 dias)</span>
            <span className="text-xs bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] px-2 py-0.5 rounded-full">
              {resumen.porVencerCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform ${collapsed.porVencer ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.porVencer && (
          <div className="px-4 pb-4">
            {data.porVencer.length === 0 ? (
              <p className="text-sm text-[var(--data-success-500)] py-2">Ningun producto próximo a vencer</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Producto</th>
                      <th className="text-left py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Lote</th>
                      <th className="text-center py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Vence</th>
                      <th className="text-center py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Cantidad</th>
                      <th className="text-center py-2 px-2 text-[var(--text-secondary)] dark:text-muted font-medium">Dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porVencer.map(b => (
                      <tr key={b.batchId} className="border-b border-[var(--rule-base)]">
                        <td className="py-2 px-2 text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{b.productName}</td>
                        <td className="py-2 px-2 text-[var(--text-secondary)] dark:text-muted">{b.lote}</td>
                        <td className="py-2 px-2 text-center text-[var(--text-secondary)] dark:text-muted">
                          {new Date(b.expiryDate).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="py-2 px-2 text-center text-[var(--text-secondary)] dark:text-muted">{b.quantity}</td>
                        <td className={`py-2 px-2 text-center font-bold ${b.daysToExpiry < 3 ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-500)]"}`}>
                          {b.daysToExpiry}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
