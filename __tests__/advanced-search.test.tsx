import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook, act } from '@testing-library/react';
import {
  useAdvancedSearch,
  levenshteinDistance,
  highlightMatches,
} from '@/hooks/use-advanced-search';
import { AdvancedSearchPanel } from '@/components/AdvancedSearchPanel';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

interface TestProduct extends Record<string, unknown> {
  id: number;
  name: string;
  category: string;
  price: number;
  inStock: boolean;
}

const testProducts: TestProduct[] = [
  { id: 1, name: 'Manzana Roja', category: 'Frutas', price: 3.5, inStock: true },
  { id: 2, name: 'Manzana Verde', category: 'Frutas', price: 3.0, inStock: true },
  { id: 3, name: 'Plátano', category: 'Frutas', price: 2.5, inStock: true },
  { id: 4, name: 'Naranja', category: 'Frutas', price: 4.0, inStock: false },
  { id: 5, name: 'Leche Entera', category: 'Lácteos', price: 5.5, inStock: true },
  { id: 6, name: 'Yogurt Natural', category: 'Lácteos', price: 4.5, inStock: true },
  { id: 7, name: 'Pan Integral', category: 'Panadería', price: 6.0, inStock: true },
  { id: 8, name: 'Pan Blanco', category: 'Panadería', price: 5.0, inStock: false },
];

describe('Advanced Search Utilities', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('test', 'test')).toBe(0);
    });

    it('should return correct distance for different strings', () => {
      expect(levenshteinDistance('cat', 'hat')).toBe(1);
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'test')).toBe(4);
      expect(levenshteinDistance('test', '')).toBe(4);
      expect(levenshteinDistance('', '')).toBe(0);
    });

    it('should be case-sensitive by default', () => {
      expect(levenshteinDistance('Test', 'test')).toBe(1);
    });
  });

  describe('highlightMatches', () => {
    it('should wrap matches in <mark> tags', () => {
      const result = highlightMatches('Hello World', 'world', false);
      expect(result).toContain('<mark>');
      expect(result).toContain('</mark>');
    });

    it('should be case-insensitive by default', () => {
      const result = highlightMatches('Hello World', 'HELLO', false);
      expect(result).toContain('<mark>Hello</mark>');
    });

    it('should respect case-sensitive option', () => {
      const result = highlightMatches('Hello World', 'hello', true);
      expect(result).not.toContain('<mark>');
    });

    it('should handle multiple matches', () => {
      const result = highlightMatches('test test test', 'test', false);
      const markCount = (result.match(/<mark>/g) || []).length;
      expect(markCount).toBe(3);
    });

    it('should escape special regex characters', () => {
      const result = highlightMatches('Price: $10.50', '$10', false);
      expect(result).toContain('<mark>$10</mark>');
    });
  });
});

describe('useAdvancedSearch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty query and no recent searches', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    expect(result.current.query).toBe('');
    expect(result.current.recentSearches).toEqual([]);
    expect(result.current.results).toHaveLength(testProducts.length);
  });

  it('should update query when setQuery is called', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    act(() => {
      result.current.setQuery('manzana');
    });

    expect(result.current.query).toBe('manzana');
  });

  it('should filter results based on query', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    act(() => {
      result.current.setQuery('manzana');
    });
    // Advance past debounce timer
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results.length).toBeLessThan(testProducts.length);
    expect(result.current.results.every((r) => r.item.name.toLowerCase().includes('manzana'))).toBe(
      true
    );
  });

  it('should prioritize exact matches with higher scores', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    act(() => {
      result.current.setQuery('Manzana Roja');
    });

    expect(result.current.results[0].item.name).toBe('Manzana Roja');
    expect(result.current.results[0].score).toBeGreaterThan(0.9);
  });

  it('should handle fuzzy matching', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'], threshold: 0.3 })
    );

    act(() => {
      result.current.setQuery('manzna'); // typo
    });

    const hasResults = result.current.results.some((r) =>
      r.item.name.toLowerCase().includes('manzana')
    );
    expect(hasResults).toBe(true);
  });

  it('should search across multiple fields', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    act(() => {
      result.current.setQuery('frutas');
    });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results.every((r) => r.item.category === 'Frutas')).toBe(true);
  });

  it('should save recent searches to localStorage', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    act(() => {
      result.current.setQuery('manzana');
      result.current.saveRecentSearch('manzana');
    });

    expect(result.current.recentSearches).toContain('manzana');
    expect(localStorage.getItem('recent-searches')).toContain('manzana');
  });

  it('should limit recent searches to 10', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.saveRecentSearch(`search${i}`);
      }
    });

    expect(result.current.recentSearches.length).toBe(10);
  });

  it('should clear recent searches', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name', 'category'] })
    );

    act(() => {
      result.current.saveRecentSearch('test');
      result.current.clearRecentSearches();
    });

    expect(result.current.recentSearches).toEqual([]);
    expect(localStorage.getItem('recent-searches')).toBeNull();
  });

  it('should respect threshold option', () => {
    const { result: lowThreshold } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name'], threshold: 0.1 })
    );

    const { result: highThreshold } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name'], threshold: 0.9 })
    );

    act(() => {
      lowThreshold.current.setQuery('xyz');
      highThreshold.current.setQuery('xyz');
    });

    expect(lowThreshold.current.results.length).toBeGreaterThanOrEqual(
      highThreshold.current.results.length
    );
  });

  it('should handle case-sensitive search', () => {
    const { result } = renderHook(() =>
      useAdvancedSearch(testProducts, { fields: ['name'], caseSensitive: true })
    );

    act(() => {
      result.current.setQuery('manzana');
    });
    act(() => { vi.advanceTimersByTime(300); });

    // Should not match 'Manzana' (capital M) in case-sensitive mode
    expect(result.current.results.length).toBe(0);
  });
});

describe('AdvancedSearchPanel Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render search input', () => {
    render(
      <AdvancedSearchPanel
        items={testProducts}
        fields={['name', 'category']}
        placeholder="Buscar productos..."
      />
    );

    expect(screen.getByPlaceholderText('Buscar productos...')).toBeInTheDocument();
  });

  it('should show results dropdown when typing', async () => {
    const user = userEvent.setup();
    render(<AdvancedSearchPanel items={testProducts} fields={['name', 'category']} />);

    const input = screen.getByPlaceholderText('Buscar...');
    await user.type(input, 'manzana');

    await waitFor(() => {
      expect(screen.getByText(/resultado/i)).toBeInTheDocument();
    });
  });

  it('should call onResultSelect when clicking a result', async () => {
    const user = userEvent.setup();
    const onResultSelect = vi.fn();
    render(
      <AdvancedSearchPanel
        items={testProducts}
        fields={['name', 'category']}
        onResultSelect={onResultSelect}
      />
    );

    const input = screen.getByPlaceholderText('Buscar...');
    await user.type(input, 'manzana');

    await waitFor(() => {
      expect(screen.getByText(/resultado/i)).toBeInTheDocument();
    });

    const firstResult = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('%'));
    if (firstResult) {
      await user.click(firstResult);
      expect(onResultSelect).toHaveBeenCalledTimes(1);
    }
  });

  it('should show recent searches when input is focused but empty', async () => {
    const user = userEvent.setup();
    localStorage.setItem('recent-searches', JSON.stringify(['manzana', 'leche']));

    render(<AdvancedSearchPanel items={testProducts} fields={['name', 'category']} />);

    const input = screen.getByPlaceholderText('Buscar...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Búsquedas recientes')).toBeInTheDocument();
      expect(screen.getByText('manzana')).toBeInTheDocument();
      expect(screen.getByText('leche')).toBeInTheDocument();
    });
  });

  it('should clear search when clicking X button', async () => {
    const user = userEvent.setup();
    render(<AdvancedSearchPanel items={testProducts} fields={['name', 'category']} />);

    const input = screen.getByPlaceholderText('Buscar...') as HTMLInputElement;
    await user.type(input, 'manzana');

    expect(input.value).toBe('manzana');

    const clearButton = screen.getByLabelText('Limpiar búsqueda');
    await user.click(clearButton);

    expect(input.value).toBe('');
  });

  it('should show filters panel when filter button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <AdvancedSearchPanel
        items={testProducts}
        fields={['name', 'category']}
        showFilters={true}
        filters={[
          {
            field: 'price',
            label: 'Precio',
            type: 'range',
            min: 0,
            max: 10,
          },
        ]}
      />
    );

    const filterButton = screen.getByLabelText('Mostrar filtros');
    await user.click(filterButton);

    await waitFor(() => {
      expect(screen.getByText('Filtros')).toBeInTheDocument();
      expect(screen.getByText('Precio')).toBeInTheDocument();
    });
  });

  it('should filter results based on range filter', async () => {
    const user = userEvent.setup();
    render(
      <AdvancedSearchPanel
        items={testProducts}
        fields={['name', 'category']}
        showFilters={true}
        filters={[
          {
            field: 'price',
            label: 'Precio',
            type: 'range',
            min: 0,
            max: 10,
          },
        ]}
      />
    );

    // Open filters
    const filterButton = screen.getByLabelText('Mostrar filtros');
    await user.click(filterButton);

    // Set price range
    const minInput = screen.getByPlaceholderText('Mín');
    const maxInput = screen.getByPlaceholderText('Máx');

    await user.type(minInput, '3');
    await user.type(maxInput, '4');

    // Type search query
    const searchInput = screen.getByPlaceholderText('Buscar...');
    await user.type(searchInput, 'manzana');

    // Should only show products in price range
    await waitFor(() => {
      const resultsText = screen.getByText(/resultado/i).textContent;
      expect(resultsText).toMatch(/[12] resultado/); // 1 or 2 results
    });
  });

  it('should show no results message when no matches found', async () => {
    const user = userEvent.setup();
    render(<AdvancedSearchPanel items={testProducts} fields={['name', 'category']} />);

    const input = screen.getByPlaceholderText('Buscar...');
    await user.type(input, 'xyz123nonexistent');

    await waitFor(() => {
      expect(screen.getByText('No se encontraron resultados')).toBeInTheDocument();
    });
  });

  it('should render custom result with renderResult prop', async () => {
    const user = userEvent.setup();
    const renderResult = (result: TestProduct) => <div>Custom: {result.name}</div>;

    render(
      <AdvancedSearchPanel
        items={testProducts}
        fields={['name', 'category']}
        renderResult={renderResult}
      />
    );

    const input = screen.getByPlaceholderText('Buscar...');
    await user.type(input, 'manzana');

    await waitFor(() => {
      expect(screen.getAllByText(/Custom: Manzana/).length).toBeGreaterThan(0);
    });
  });

  it('should close dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <AdvancedSearchPanel items={testProducts} fields={['name', 'category']} />
        <button>Outside Button</button>
      </div>
    );

    const input = screen.getByPlaceholderText('Buscar...');
    await user.type(input, 'manzana');

    await waitFor(() => {
      expect(screen.getByText(/resultado/i)).toBeInTheDocument();
    });

    const outsideButton = screen.getByText('Outside Button');
    await user.click(outsideButton);

    await waitFor(() => {
      expect(screen.queryByText(/resultado/i)).not.toBeInTheDocument();
    });
  });

  it('should show active filter count badge', async () => {
    const user = userEvent.setup();
    render(
      <AdvancedSearchPanel
        items={testProducts}
        fields={['name', 'category']}
        showFilters={true}
        filters={[
          {
            field: 'category',
            label: 'Categoría',
            type: 'select',
            options: [
              { value: 'Frutas', label: 'Frutas' },
              { value: 'Lácteos', label: 'Lácteos' },
            ],
          },
        ]}
      />
    );

    // Open filters
    const filterButton = screen.getByLabelText('Mostrar filtros');
    await user.click(filterButton);

    // Select a category
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'Frutas');

    // Should show filter count badge
    await waitFor(() => {
      const badge = filterButton.querySelector('span');
      expect(badge?.textContent).toBe('1');
    });
  });
});
