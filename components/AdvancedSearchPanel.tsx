'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, Clock, TrendingUp, Filter } from 'lucide-react';
import { useAdvancedSearch } from '@/hooks/use-advanced-search';

interface AdvancedSearchPanelProps<T extends Record<string, unknown>> {
  items: T[];
  fields: (keyof T)[];
  placeholder?: string;
  onResultSelect?: (result: T) => void;
  renderResult?: (result: T, score: number) => React.ReactNode;
  threshold?: number;
  showFilters?: boolean;
  filters?: FilterConfig[];
}

interface FilterConfig {
  field: string;
  label: string;
  type: 'range' | 'select' | 'boolean';
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
}

export function AdvancedSearchPanel<T extends Record<string, unknown>>({
  items,
  fields,
  placeholder = 'Buscar...',
  onResultSelect,
  renderResult,
  threshold = 0.3,
  showFilters = false,
  filters = [],
}: AdvancedSearchPanelProps<T>) {
  const { query, setQuery, results, recentSearches, saveRecentSearch, clearRecentSearches } =
    useAdvancedSearch(items, { fields, threshold });

  const [isOpen, setIsOpen] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter results based on active filters
  const filteredResults = results.filter((result) => {
    for (const [field, value] of Object.entries(activeFilters)) {
      const itemValue = result.item[field];

      if (value === undefined || value === null || value === '') continue;

      // Range filter
      if (typeof value === 'object' && 'min' in value && 'max' in value) {
        const numValue = Number(itemValue);
        const min = (value as { min?: number }).min;
        const max = (value as { max?: number }).max;
        if ((min !== undefined && numValue < min) || (max !== undefined && numValue > max)) {
          return false;
        }
      }
      // Boolean filter
      else if (typeof value === 'boolean') {
        if (itemValue !== value) return false;
      }
      // Select filter
      else {
        if (itemValue !== value) return false;
      }
    }
    return true;
  });

  const handleSearch = (value: string) => {
    setQuery(value);
    setIsOpen(true);
  };

  const handleResultClick = (result: T) => {
    saveRecentSearch(query);
    setIsOpen(false);
    onResultSelect?.(result);
  };

  const handleRecentSearchClick = (search: string) => {
    setQuery(search);
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleClearSearch = () => {
    setQuery('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleFilterChange = (field: string, value: unknown) => {
    setActiveFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const clearFilter = (field: string) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v !== undefined && v !== null && v !== ''
  ).length;

  return (
    <div ref={panelRef} className="relative w-full" role="search" aria-label="Panel de búsqueda avanzada">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-controls="search-results-panel"
          aria-expanded={isOpen}
          className="w-full pl-10 pr-20 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)] focus:border-transparent"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {showFilters && (
            <button
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              aria-label={showFiltersPanel ? "Ocultar filtros" : "Mostrar filtros"}
              aria-expanded={showFiltersPanel}
              aria-controls="filters-panel"
              className={`p-2 rounded-lg transition-colors ${
                showFiltersPanel
                  ? 'bg-emerald-100 text-[var(--data-success-600)]'
                  : 'hover:bg-gray-100 text-gray-400'
              }`}
            >
              <Filter className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--data-success-600)] text-white text-xs rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {query && (
            <button
              onClick={handleClearSearch}
              aria-label="Limpiar búsqueda"
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && showFiltersPanel && (
        <div id="filters-panel" className="absolute z-20 w-full mt-2 p-4 bg-white rounded-lg shadow-lg border border-gray-200" role="region" aria-label="Panel de filtros">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Filtros</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setActiveFilters({})}
                className="text-sm text-[var(--data-success-600)] hover:text-[var(--data-success-700)]"
              >
                Limpiar todo
              </button>
            )}
          </div>

          <div className="space-y-3">
            {filters.map((filter) => (
              <div key={filter.field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {filter.label}
                </label>

                {filter.type === 'range' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Mín"
                      min={filter.min}
                      max={filter.max}
                      value={
                        ((activeFilters[filter.field] as { min?: number })?.min ?? '') as number
                      }
                      onChange={(e) =>
                        handleFilterChange(filter.field, {
                          ...(activeFilters[filter.field] as object),
                          min: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]"
                    />
                    <input
                      type="number"
                      placeholder="Máx"
                      min={filter.min}
                      max={filter.max}
                      value={
                        ((activeFilters[filter.field] as { max?: number })?.max ?? '') as number
                      }
                      onChange={(e) =>
                        handleFilterChange(filter.field, {
                          ...(activeFilters[filter.field] as object),
                          max: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]"
                    />
                  </div>
                )}

                {filter.type === 'select' && (
                  <select
                    value={(activeFilters[filter.field] as string) ?? ''}
                    onChange={(e) => handleFilterChange(filter.field, e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]"
                  >
                    <option value="">Todos</option>
                    {filter.options?.map((option) => (
                      <option key={String(option.value)} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}

                {filter.type === 'boolean' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(activeFilters[filter.field] as boolean) ?? false}
                      onChange={(e) => handleFilterChange(filter.field, e.target.checked)}
                      className="w-4 h-4 text-[var(--data-success-600)] border-gray-300 rounded focus:ring-[var(--data-success-500)]"
                    />
                    <span className="text-sm text-gray-700">Activar</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Dropdown */}
      {isOpen && (
        <div id="search-results-panel" className="absolute z-10 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto" role="listbox" aria-label="Resultados de búsqueda">
          {/* Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Clock className="w-4 h-4" />
                  Búsquedas recientes
                </div>
                <button
                  onClick={clearRecentSearches}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecentSearchClick(search)}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          {query && (
            <div>
              {filteredResults.length > 0 ? (
                <div>
                  <div className="p-2 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <TrendingUp className="w-3 h-3" />
                      {filteredResults.length} resultado{filteredResults.length !== 1 && 's'}
                      {activeFilterCount > 0 && ` (${activeFilterCount} filtro${activeFilterCount !== 1 ? 's' : ''})`}
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {filteredResults.slice(0, 10).map((result, index) => (
                      <button
                        key={index}
                        onClick={() => handleResultClick(result.item)}
                        className="w-full p-3 hover:bg-gray-50 text-left transition-colors"
                      >
                        {renderResult ? (
                          renderResult(result.item, result.score)
                        ) : (
                          <div>
                            <div className="text-sm text-gray-900">
                              {String(result.item[fields[0]])}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-[var(--data-success-600)] h-1.5 rounded-full transition-all"
                                  style={{ width: `${result.score * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">
                                {Math.round(result.score * 100)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No se encontraron resultados</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Intenta con otros términos o ajusta los filtros
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!query && recentSearches.length === 0 && (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Comienza a escribir para buscar</p>
              <p className="text-sm text-gray-400 mt-1">
                Usa palabras clave, nombres o descripciones
              </p>
            </div>
          )}
        </div>
      )}

      {/* Active Filters Tags */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {Object.entries(activeFilters).map(([field, value]) => {
            if (value === undefined || value === null || value === '') return null;

            const filterConfig = filters.find((f) => f.field === field);
            if (!filterConfig) return null;

            let displayValue = String(value);
            if (filterConfig.type === 'range' && typeof value === 'object') {
              const min = (value as { min?: number }).min;
              const max = (value as { max?: number }).max;
              displayValue = `${min ?? '∞'} - ${max ?? '∞'}`;
            } else if (filterConfig.type === 'select') {
              const option = filterConfig.options?.find((o) => o.value === value);
              displayValue = option?.label ?? String(value);
            } else if (filterConfig.type === 'boolean') {
              displayValue = value ? 'Sí' : 'No';
            }

            return (
              <div
                key={field}
                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-[var(--data-success-700)] rounded-full text-sm"
              >
                <span className="font-medium">{filterConfig.label}:</span>
                <span>{displayValue}</span>
                <button
                  onClick={() => clearFilter(field)}
                  aria-label={`Quitar filtro ${filterConfig.label}`}
                  className="ml-1 hover:bg-emerald-200 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
