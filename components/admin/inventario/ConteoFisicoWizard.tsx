'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from "next/image";
import dynamic from 'next/dynamic';

const BarcodeScannerDynamic = dynamic(() => import('./BarcodeScanner'), { ssr: false });

type ConteoItem = {
  id: string;
  conteoId: string;
  productId: number;
  stockSistema: number;
  stockContado: number | null;
  diferencia: number | null;
  ajustado: boolean;
  product: {
    id: number;
    name: string;
    barcode: string | null;
    category: string;
    image: string;
    stock: number | null;
  } | null;
};

type Conteo = {
  id: string;
  tipo: string;
  status: string;
  totalItems: number;
};

export default function ConteoFisicoWizard() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [tipo, setTipo] = useState<'completo' | 'categoria'>('completo');
  const [categoria, setCategoria] = useState('');
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [items, setItems] = useState<ConteoItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resumen, setResumen] = useState<{ totalItems: number; contados: number; conDiferencia: number; ajustados: number } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [conteos, setConteos] = useState<Array<{ id: string; tipo: string; status: string; fechaInicio: string; _count: { items: number } }>>([]);

  // Load existing conteos
  useEffect(() => {
    fetch('/api/inventory/conteo')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setConteos(data); })
      .catch(() => {});
  }, []);

  // Start new conteo
  const iniciarConteo = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/inventory/conteo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, ...(tipo === 'categoria' ? { categoria } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear conteo');
      setConteo(data);
      await cargarItems(data.id);
      setPaso(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  // Resume existing conteo
  const reanudarConteo = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      setConteo({ id, tipo: '', status: '', totalItems: 0 });
      await cargarItems(id);
      setPaso(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const cargarItems = async (conteoId: string) => {
    const res = await fetch(`/api/inventory/conteo/${conteoId}/items`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cargar items');
    setItems(data.items || []);
    // Select first uncounted
    const firstUncounted = (data.items || []).findIndex((i: ConteoItem) => i.stockContado === null);
    setSelectedIdx(firstUncounted >= 0 ? firstUncounted : 0);
  };

  // Save count for current item
  const guardarConteo = async () => {
    if (!conteo || !items[selectedIdx]) return;
    const item = items[selectedIdx];
    const stockContado = parseInt(inputValue, 10);
    if (isNaN(stockContado) || stockContado < 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/conteo/${conteo.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, stockContado }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      const updated = await res.json();

      // Update local state
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updated } : i));
      setInputValue('');

      // Auto-advance to next uncounted
      const nextIdx = items.findIndex((i, idx) => idx > selectedIdx && i.stockContado === null);
      if (nextIdx >= 0) {
        setSelectedIdx(nextIdx);
      } else {
        // All counted, maybe move to step 3
        const remainingUncounted = items.filter((i, idx) => idx !== selectedIdx && i.stockContado === null);
        if (remainingUncounted.length === 0) {
          setPaso(3);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  // Close conteo
  const cerrarConteo = async () => {
    if (!conteo) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/conteo/${conteo.id}/close`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cerrar');
      setResumen(data.resumen);
      setPaso(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  // Toggle ajustado
  const toggleAjustado = (itemId: string) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ajustado: !i.ajustado } : i));
  };

  // Barcode scan handler
  const handleBarcodeScan = useCallback((barcode: string) => {
    setShowScanner(false);
    const idx = items.findIndex(i => i.product?.barcode === barcode);
    if (idx >= 0) {
      setSelectedIdx(idx);
      setSearch('');
    } else {
      setError(`Código "${barcode}" no encontrado en este conteo`);
      setTimeout(() => setError(''), 3000);
    }
  }, [items]);

  // Filtered items for search
  const filteredItems = search
    ? items.filter(i => i.product?.name.toLowerCase().includes(search.toLowerCase()) || i.product?.barcode?.includes(search))
    : items;

  const contados = items.filter(i => i.stockContado !== null).length;
  const totalItems = items.length;
  const pctContado = totalItems > 0 ? Math.round((contados / totalItems) * 100) : 0;

  const itemsConDiferencia = items.filter(i => i.stockContado !== null && i.diferencia !== null && i.diferencia !== 0);

  const selected = items[selectedIdx] ?? null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ═══ PASO 1: Iniciar Conteo ═══ */}
      {paso === 1 && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Nuevo Conteo Fisico</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-muted mb-2">Tipo de conteo</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setTipo('completo')}
                    className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      tipo === 'completo'
                        ? 'border-[#00B4A6] bg-[#00B4A6]/5 text-[#00B4A6]'
                        : 'border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:border-gray-300'
                    }`}
                  >
                    Completo
                  </button>
                  <button
                    onClick={() => setTipo('categoria')}
                    className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      tipo === 'categoria'
                        ? 'border-[#00B4A6] bg-[#00B4A6]/5 text-[#00B4A6]'
                        : 'border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:border-gray-300'
                    }`}
                  >
                    Por categoria
                  </button>
                </div>
              </div>

              {tipo === 'categoria' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-muted mb-1">Categoria</label>
                  <input
                    type="text"
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    placeholder="Ej: Abarrotes, Bebidas..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-card-border rounded-lg bg-white dark:bg-card text-gray-900 dark:text-foreground text-sm"
                  />
                </div>
              )}

              <button
                onClick={iniciarConteo}
                disabled={loading || (tipo === 'categoria' && !categoria.trim())}
                className="w-full py-3 bg-[#00B4A6] text-white rounded-lg font-medium hover:bg-[#009690] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creando...' : 'Iniciar Conteo'}
              </button>
            </div>
          </div>

          {/* Existing conteos */}
          {conteos.filter(c => c.status !== 'CERRADO').length > 0 && (
            <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6">
              <h4 className="text-sm font-bold text-gray-700 dark:text-muted mb-3">Conteos en progreso</h4>
              <div className="space-y-2">
                {conteos.filter(c => c.status !== 'CERRADO').map(c => (
                  <button
                    key={c.id}
                    onClick={() => reanudarConteo(c.id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-card-hover transition-colors text-left"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-foreground capitalize">{c.tipo}</span>
                      <span className="text-xs text-gray-500 dark:text-muted ml-2">
                        {new Date(c.fechaInicio).toLocaleDateString('es-PE')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-full">
                        {c.status}
                      </span>
                      <span className="text-xs text-gray-500">{c._count.items} items</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ PASO 2: Contar Productos ═══ */}
      {paso === 2 && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-muted">Progreso</span>
              <span className="text-sm font-bold text-[#00B4A6]">{contados}/{totalItems} ({pctContado}%)</span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-[#00B4A6] rounded-full transition-all" style={{ width: `${pctContado}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Search + list */}
            <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-card-border rounded-lg bg-white dark:bg-card text-gray-900 dark:text-foreground text-sm"
                />
                <button
                  onClick={() => setShowScanner(true)}
                  className="px-3 py-2 bg-[#00B4A6] text-white rounded-lg hover:bg-[#009690] transition-colors"
                  title="Escanear codigo"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-1">
                {filteredItems.map((item) => {
                  const realIdx = items.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setSelectedIdx(realIdx); setInputValue(''); }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-sm transition-colors ${
                        realIdx === selectedIdx
                          ? 'bg-[#00B4A6]/10 border border-[#00B4A6]/30'
                          : 'hover:bg-gray-50 dark:hover:bg-card-hover'
                      }`}
                    >
                      <span className="text-gray-900 dark:text-foreground truncate flex-1">
                        {item.product?.name ?? `Producto #${item.productId}`}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                        item.stockContado !== null
                          ? item.diferencia === 0
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {item.stockContado !== null
                          ? item.diferencia === 0 ? 'OK' : `${item.diferencia! > 0 ? '+' : ''}${item.diferencia}`
                          : 'Pendiente'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Selected product detail */}
            <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
              {selected ? (
                <div className="space-y-4">
                  {selected.product?.image && (
                    <div className="relative w-20 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden mx-auto">
                      <Image src={selected.product.image} alt={selected.product.name} fill className="object-cover" sizes="80px" />
                    </div>
                  )}
                  <div className="text-center">
                    <h4 className="font-bold text-gray-900 dark:text-foreground">
                      {selected.product?.name ?? `Producto #${selected.productId}`}
                    </h4>
                    {selected.product?.barcode && (
                      <p className="text-xs text-gray-500 dark:text-muted mt-1">Codigo: {selected.product.barcode}</p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-muted">{selected.product?.category}</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center">
                    <span className="text-sm text-gray-600 dark:text-muted">Stock sistema:</span>
                    <span className="text-2xl font-bold text-gray-900 dark:text-foreground ml-2">{selected.stockSistema}</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-muted mb-1">Contado:</label>
                    <input
                      type="number"
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') guardarConteo(); }}
                      min={0}
                      placeholder="Ingresa cantidad..."
                      className="w-full px-4 py-3 border-2 border-gray-300 dark:border-card-border rounded-xl bg-white dark:bg-card text-gray-900 dark:text-foreground text-2xl text-center font-bold focus:border-[#00B4A6] focus:outline-none"
                      autoFocus
                    />
                  </div>

                  {/* Preview difference */}
                  {inputValue && !isNaN(parseInt(inputValue)) && (
                    <div className="text-center">
                      {(() => {
                        const diff = parseInt(inputValue) - selected.stockSistema;
                        if (diff === 0) return <span className="text-green-600 font-bold text-lg">Igual</span>;
                        return (
                          <span className={`font-bold text-lg ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  <button
                    onClick={guardarConteo}
                    disabled={loading || !inputValue || isNaN(parseInt(inputValue))}
                    className="w-full py-3 bg-[#00B4A6] text-white rounded-lg font-medium hover:bg-[#009690] disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Guardando...' : 'Guardar y siguiente'}
                  </button>
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-muted py-12">
                  Selecciona un producto de la lista
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPaso(3)}
              className="px-4 py-2 bg-[#f97316] text-white rounded-lg font-medium hover:bg-[#e8964f] transition-colors"
            >
              Revisar diferencias ({itemsConDiferencia.length})
            </button>
          </div>
        </div>
      )}

      {/* ═══ PASO 3: Revisar Diferencias ═══ */}
      {paso === 3 && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Diferencias encontradas</h3>
              <span className="text-sm text-gray-500 dark:text-muted">
                {itemsConDiferencia.length} productos con diferencia
              </span>
            </div>

            {itemsConDiferencia.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-muted">
                No se encontraron diferencias. Todo coincide.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-card-border">
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-muted font-medium">Producto</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Sistema</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Contado</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Diferencia</th>
                      <th className="text-center py-2 px-2 text-gray-600 dark:text-muted font-medium">Ajustar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsConDiferencia.map(item => (
                      <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-2 text-gray-900 dark:text-foreground">
                          {item.product?.name ?? `#${item.productId}`}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-600 dark:text-muted">{item.stockSistema}</td>
                        <td className="py-2 px-2 text-center font-medium text-gray-900 dark:text-foreground">{item.stockContado}</td>
                        <td className={`py-2 px-2 text-center font-bold ${(item.diferencia ?? 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(item.diferencia ?? 0) > 0 ? '+' : ''}{item.diferencia}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={item.ajustado}
                            onChange={() => toggleAjustado(item.id)}
                            className="w-4 h-4 rounded border-gray-300 text-[#00B4A6] focus:ring-[#00B4A6]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPaso(2)}
              className="px-4 py-2 border border-gray-300 dark:border-card-border text-gray-700 dark:text-muted rounded-lg hover:bg-gray-50 dark:hover:bg-card-hover transition-colors"
            >
              Volver a contar
            </button>
            <button
              onClick={cerrarConteo}
              disabled={loading}
              className="flex-1 py-2 bg-[#00B4A6] text-white rounded-lg font-medium hover:bg-[#009690] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Cerrando...' : `Aplicar ${itemsConDiferencia.filter(i => i.ajustado).length} ajustes y cerrar`}
            </button>
          </div>
        </div>
      )}

      {/* ═══ PASO 4: Resumen Final ═══ */}
      {paso === 4 && resumen && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6 text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h3 className="text-xl font-bold text-gray-900 dark:text-foreground">Conteo Cerrado</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-foreground">{resumen.contados}</div>
              <div className="text-xs text-gray-500 dark:text-muted">Productos contados</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-foreground">{resumen.totalItems}</div>
              <div className="text-xs text-gray-500 dark:text-muted">Total items</div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
              <div className="text-2xl font-bold text-amber-600">{resumen.conDiferencia}</div>
              <div className="text-xs text-gray-500 dark:text-muted">Con diferencia</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{resumen.ajustados}</div>
              <div className="text-xs text-gray-500 dark:text-muted">Ajustes aplicados</div>
            </div>
          </div>

          <button
            onClick={() => { setPaso(1); setConteo(null); setItems([]); setResumen(null); }}
            className="px-6 py-3 bg-[#00B4A6] text-white rounded-lg font-medium hover:bg-[#009690] transition-colors"
          >
            Nuevo conteo
          </button>
        </div>
      )}

      {/* Barcode Scanner overlay */}
      {showScanner && (
        <BarcodeScannerDynamic onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
