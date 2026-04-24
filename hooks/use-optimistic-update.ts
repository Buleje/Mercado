"use client";

/**
 * useOptimisticUpdate — Updates optimistas con rollback automatico.
 *
 * Cuando el user hace una accion (ej. add favorite, quantity+1), aplicamos
 * el cambio al estado local INMEDIATAMENTE y disparamos la mutation en
 * background. Si la mutation falla, revertimos + mostramos toast.
 *
 * Ventaja: UI responde en <16ms vs esperar 200-800ms de round-trip.
 *
 * API:
 *   const { value, update, isPending, error } = useOptimisticUpdate({
 *     initial: 5,
 *     mutate: async (next) => {
 *       const res = await fetch("/api/cart/qty", { method: "PATCH", body: JSON.stringify({ qty: next })});
 *       if (!res.ok) throw new Error("falló");
 *     },
 *   });
 *   update(6); // UI actualiza al toque; si falla, vuelve a 5.
 */

import { useCallback, useRef, useState } from "react";

interface Options<T> {
  /** Valor inicial (de DB, SSR, etc) */
  initial: T;
  /** Mutation async. Si rechaza, revertimos al valor previo. */
  mutate: (next: T, prev: T) => Promise<void>;
  /** Callback on error (además del rollback). Default silencioso */
  onError?: (err: unknown, attemptedValue: T, revertedTo: T) => void;
  /** Callback on success */
  onSuccess?: (committedValue: T) => void;
}

export function useOptimisticUpdate<T>({ initial, mutate, onError, onSuccess }: Options<T>) {
  const [value, setValue] = useState<T>(initial);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const prevRef = useRef<T>(initial);
  const pendingIdRef = useRef(0);

  const update = useCallback(
    async (next: T) => {
      const callId = ++pendingIdRef.current;
      const prev = value;
      prevRef.current = prev;
      setValue(next);
      setIsPending(true);
      setError(null);
      try {
        await mutate(next, prev);
        if (pendingIdRef.current === callId) {
          setIsPending(false);
          onSuccess?.(next);
        }
      } catch (err) {
        if (pendingIdRef.current === callId) {
          // Solo revertimos si no hubo otra llamada mientras tanto.
          setValue(prev);
          setIsPending(false);
          setError(err);
          onError?.(err, next, prev);
        }
      }
    },
    [value, mutate, onError, onSuccess],
  );

  const reset = useCallback((to: T) => {
    setValue(to);
    prevRef.current = to;
    setError(null);
    setIsPending(false);
  }, []);

  return { value, update, isPending, error, reset };
}

/**
 * useOptimisticList — Variante para colecciones. Add/remove/update items
 * con rollback si falla la mutation.
 */
interface ListOptions<T> {
  initial: T[];
  getId: (item: T) => string | number;
  onError?: (err: unknown) => void;
}

export function useOptimisticList<T>({ initial, getId, onError }: ListOptions<T>) {
  const [items, setItems] = useState<T[]>(initial);

  const addOptimistic = useCallback(
    async (item: T, mutate: () => Promise<void>) => {
      const snapshot = items;
      setItems((prev) => [item, ...prev]);
      try {
        await mutate();
      } catch (err) {
        setItems(snapshot);
        onError?.(err);
      }
    },
    [items, onError],
  );

  const removeOptimistic = useCallback(
    async (id: string | number, mutate: () => Promise<void>) => {
      const snapshot = items;
      setItems((prev) => prev.filter((i) => String(getId(i)) !== String(id)));
      try {
        await mutate();
      } catch (err) {
        setItems(snapshot);
        onError?.(err);
      }
    },
    [items, getId, onError],
  );

  const updateOptimistic = useCallback(
    async (id: string | number, patch: Partial<T>, mutate: () => Promise<void>) => {
      const snapshot = items;
      setItems((prev) =>
        prev.map((i) => (String(getId(i)) === String(id) ? { ...i, ...patch } : i)),
      );
      try {
        await mutate();
      } catch (err) {
        setItems(snapshot);
        onError?.(err);
      }
    },
    [items, getId, onError],
  );

  return { items, setItems, addOptimistic, removeOptimistic, updateOptimistic };
}
