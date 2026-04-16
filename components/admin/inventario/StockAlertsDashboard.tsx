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
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
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
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{resumen.sinStockCount}</div>
          <div className="text-xs text-red-700 dark:text-red-400 font-medium">Sin stock</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{resumen.criticoCount}</div>
          <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">Stock critico</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-card-border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
            S/{resumen.sinMovimientoValor.toLocaleString('es-PE', { minimumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-gray-600 dark:text-muted font-medium">
            Sin movimiento ({resumen.sinMovimientoCount})
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">{resumen.porVencerCount}</div>
          <div className="text-xs text-orange-700 dark:text-orange-400 font-medium">Por vencer (7d)</div>
        </div>
      </div>

      {/* Section 1: SIN STOCK */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
        <button
          onClick={() => toggle('sinStock')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="font-bold text-gray-900 dark:text-foreground text-sm">SIN STOCK</span>
            <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full">
              {resumen.sinStockCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed.sinStock ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.sinStock && (
          <div className="px-4 pb-4">
            {data.sinStock.length === 0 ? (
              <p className="text-sm text-green-600 py-2">Todos los productos tienen stock</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-card-border">
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Producto</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Categoria</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Ultima venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sinStock.map(p => (
                      <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-2 text-gray-900 dark:text-foreground font-medium">{p.name}</td>
                        <td className="py-2 px-2 text-gray-500 dark:text-muted">{p.category}</td>
                        <td className="py-2 px-2 text-gray-500 dark:text-muted">{formatDate(p.lastSaleDate)}</td>
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
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
        <button
          onClick={() => toggle('critico')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="font-bold text-gray-900 dark:text-foreground text-sm">STOCK CRITICO</span>
            <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
              {resumen.criticoCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed.critico ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.critico && (
          <div className="px-4 pb-4">
            {data.stockCritico.length === 0 ? (
              <p className="text-sm text-green-600 py-2">Ningun producto en nivel critico</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-card-border">
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Producto</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Stock</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Minimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stockCritico.map(p => (
                      <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-2 text-gray-900 dark:text-foreground font-medium">{p.name}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-red-600 font-bold">{p.stock}</span>
                        </td>
                        <td className="py-2 px-2 text-center text-gray-500 dark:text-muted">{p.stockMin}</td>
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
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
        <button
          onClick={() => toggle('sinMovimiento')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gray-500" />
            <span className="font-bold text-gray-900 dark:text-foreground text-sm">SIN MOVIMIENTO (30+ dias)</span>
            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 px-2 py-0.5 rounded-full">
              {resumen.sinMovimientoCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed.sinMovimiento ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.sinMovimiento && (
          <div className="px-4 pb-4">
            {data.sinMovimiento.length === 0 ? (
              <p className="text-sm text-green-600 py-2">Todos los productos con stock tienen movimiento</p>
            ) : (
              <>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3 text-center">
                  <span className="text-lg font-bold text-red-600">
                    S/{resumen.sinMovimientoValor.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm text-red-700 dark:text-red-400 ml-2">de capital sin rotar</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-card-border">
                        <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Producto</th>
                        <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Stock</th>
                        <th className="text-right py-2 px-2 text-gray-600 dark:text-muted font-medium">Valor (S/)</th>
                        <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Ultima venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sinMovimiento.map(p => (
                        <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-2 text-gray-900 dark:text-foreground font-medium">{p.name}</td>
                          <td className="py-2 px-2 text-center text-gray-600 dark:text-muted">{p.stock}</td>
                          <td className="py-2 px-2 text-right text-red-600 font-medium">
                            S/{p.valorAtado.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-gray-500 dark:text-muted">{formatDate(p.lastSaleDate)}</td>
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
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
        <button
          onClick={() => toggle('porVencer')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="font-bold text-gray-900 dark:text-foreground text-sm">POR VENCER (7 dias)</span>
            <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-full">
              {resumen.porVencerCount}
            </span>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed.porVencer ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed.porVencer && (
          <div className="px-4 pb-4">
            {data.porVencer.length === 0 ? (
              <p className="text-sm text-green-600 py-2">Ningun producto proximo a vencer</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-card-border">
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Producto</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Lote</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Vence</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Cantidad</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porVencer.map(b => (
                      <tr key={b.batchId} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-2 text-gray-900 dark:text-foreground font-medium">{b.productName}</td>
                        <td className="py-2 px-2 text-gray-500 dark:text-muted">{b.lote}</td>
                        <td className="py-2 px-2 text-center text-gray-500 dark:text-muted">
                          {new Date(b.expiryDate).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-600 dark:text-muted">{b.quantity}</td>
                        <td className={`py-2 px-2 text-center font-bold ${b.daysToExpiry < 3 ? 'text-red-600' : 'text-orange-600'}`}>
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
