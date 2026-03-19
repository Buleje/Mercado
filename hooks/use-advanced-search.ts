import { useState, useCallback, useMemo, useEffect } from 'react';

/**
 * Search result with relevance score
 */
export interface SearchResult<T> {
  item: T;
  score: number;
  matches: Array<{
    field: string;
    indices: Array<[number, number]>;
  }>;
}

/**
 * Search options
 */
export interface SearchOptions<T> {
  /** Fields to search in */
  fields: Array<keyof T>;
  /** Threshold for fuzzy matching (0-1, lower is more strict) */
  threshold?: number;
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Minimum characters to trigger search */
  minLength?: number;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1, 1 is exact match)
 */
function calculateScore(query: string, text: string, caseSensitive: boolean = false): number {
  const q = caseSensitive ? query : query.toLowerCase();
  const t = caseSensitive ? text : text.toLowerCase();
  
  // Exact match
  if (t === q) return 1;
  
  // Starts with query
  if (t.startsWith(q)) return 0.9;
  
  // Contains query
  if (t.includes(q)) return 0.7;
  
  // Fuzzy match using Levenshtein distance
  const distance = levenshteinDistance(q, t);
  const maxLength = Math.max(q.length, t.length);
  const similarity = 1 - distance / maxLength;
  
  return similarity * 0.5; // Scale down fuzzy matches
}

/**
 * Search items with fuzzy matching
 */
export function fuzzySearch<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  options: SearchOptions<T>
): SearchResult<T>[] {
  const {
    fields,
    threshold = 0.3,
    caseSensitive = false,
    minLength = 1,
    limit = 50,
  } = options;
  
  // Return all items if query is too short
  if (query.length < minLength) {
    return items.map(item => ({ item, score: 1, matches: [] }));
  }
  
  const results: SearchResult<T>[] = [];
  
  for (const item of items) {
    let maxScore = 0;
    const matches: SearchResult<T>['matches'] = [];
    
    for (const field of fields) {
      const value = item[field];
      if (typeof value !== 'string') continue;
      
      const score = calculateScore(query, value, caseSensitive);
      
      if (score > maxScore) {
        maxScore = score;
      }
      
      if (score >= threshold) {
        matches.push({
          field: field as string,
          indices: [], // Simplified - could implement actual index finding
        });
      }
    }
    
    if (maxScore >= threshold) {
      results.push({ item, score: maxScore, matches });
    }
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  // Apply limit
  return results.slice(0, limit);
}

/**
 * Hook for advanced search with fuzzy matching and recent searches
 */
export function useAdvancedSearch<T extends Record<string, unknown>>(
  items: T[],
  options: SearchOptions<T>
) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce: update debouncedQuery 250ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('recent-searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  
  // Perform search using the debounced query to avoid blocking on every keystroke
  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return items.map(item => ({ item, score: 1, matches: [] }));
    return fuzzySearch(items, debouncedQuery, options);
  }, [items, debouncedQuery, options]);
  
  // Save to recent searches
  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setRecentSearches(prev => {
      const updated = [
        searchQuery,
        ...prev.filter(q => q !== searchQuery),
      ].slice(0, 10); // Keep last 10 searches
      
      try {
        localStorage.setItem('recent-searches', JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }
      
      return updated;
    });
  }, []);
  
  // Clear recent searches
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('recent-searches');
    } catch {
      // Ignore
    }
  }, []);
  
  return {
    query,
    setQuery,
    results,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
  };
}

/**
 * Highlight query matches in text
 */
export function highlightMatches(text: string, query: string, caseSensitive: boolean = false): string {
  if (!query) return text;
  
  const q = caseSensitive ? query : query.toLowerCase();
  const t = caseSensitive ? text : text.toLowerCase();
  
  const index = t.indexOf(q);
  if (index === -1) return text;
  
  return (
    text.substring(0, index) +
    '<mark>' +
    text.substring(index, index + query.length) +
    '</mark>' +
    text.substring(index + query.length)
  );
}
