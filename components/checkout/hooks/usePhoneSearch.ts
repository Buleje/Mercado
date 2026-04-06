import { useState, useCallback } from "react";
import type { Customer } from "@/contexts/customer-context";

/**
 * usePhoneSearch — busca un cliente por teléfono usando la función
 * `findByPhone` que provee el customer-context. Mantiene su propio
 * estado local porque la búsqueda inicial vive en el paso "cuenta",
 * antes del wizard principal.
 */

type Args = {
  findByPhone: (phone: string) => Promise<Customer | null>;
};

export type PhoneSearchState = {
  query: string;
  searching: boolean;
  found: Customer | null;
  notFound: boolean;
};

export type UsePhoneSearchResult = PhoneSearchState & {
  setQuery: (q: string) => void;
  search: () => Promise<Customer | null>;
  reset: () => void;
};

export function usePhoneSearch({ findByPhone }: Args): UsePhoneSearchResult {
  const [query, setQueryState] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Customer | null>(null);
  const [notFound, setNotFound] = useState(false);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setNotFound(false);
  }, []);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return null;
    setSearching(true);
    setNotFound(false);
    try {
      const customer = await findByPhone(q);
      if (customer) {
        setFound(customer);
        return customer;
      }
      setNotFound(true);
      return null;
    } finally {
      setSearching(false);
    }
  }, [query, findByPhone]);

  const reset = useCallback(() => {
    setQueryState("");
    setFound(null);
    setNotFound(false);
    setSearching(false);
  }, []);

  return { query, searching, found, notFound, setQuery, search, reset };
}
