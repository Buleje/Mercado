/**
 * Un IndexedDB mínimo en memoria para probar la cola del patio
 * (`lib/forestal/patio-cola.ts`) y su caché (`patio-cache.ts`): una base por
 * nombre, un almacén con `keyPath`, pedidos asíncronos y transacciones que
 * terminan cuando no les queda operación. jsdom no trae IndexedDB y
 * `fake-indexeddb` no está instalado.
 *
 *   vi.stubGlobal("indexedDB", indexedDBEnMemoria());
 */

type Pedido = { result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };

interface Base {
  almacenes: Map<string, { keyPath: string; datos: Map<unknown, unknown> }>;
}

export function indexedDBEnMemoria() {
  const bases = new Map<string, Base>();

  const conexion = (base: Base) => ({
    objectStoreNames: { contains: (n: string) => base.almacenes.has(n) },
    createObjectStore: (n: string, o?: { keyPath?: string }) => {
      base.almacenes.set(n, { keyPath: o?.keyPath ?? "id", datos: new Map() });
    },
    transaction: (n: string) => {
      const almacen = base.almacenes.get(n);
      if (!almacen) throw new Error(`No existe el almacén ${n}`);
      let enCurso = 0;
      const tx: { oncomplete: (() => void) | null; onerror: (() => void) | null; objectStore: () => unknown } = {
        oncomplete: null,
        onerror: null,
        objectStore: () => api,
      };
      const op = (fn: () => unknown): Pedido => {
        const p: Pedido = { onsuccess: null, onerror: null };
        enCurso += 1;
        setTimeout(() => {
          p.result = fn();
          p.onsuccess?.();
          enCurso -= 1;
          setTimeout(() => {
            if (enCurso === 0) tx.oncomplete?.();
          }, 0);
        }, 0);
        return p;
      };
      const copia = <T>(v: T): T => structuredClone(v);
      const clave = (v: unknown) => (v as Record<string, unknown>)[almacen.keyPath];
      const api = {
        add: (v: unknown) => op(() => void almacen.datos.set(clave(v), copia(v))),
        put: (v: unknown) => op(() => void almacen.datos.set(clave(v), copia(v))),
        get: (k: unknown) => op(() => (almacen.datos.has(k) ? copia(almacen.datos.get(k)) : undefined)),
        getAll: () => op(() => [...almacen.datos.values()].map(copia)),
        delete: (k: unknown) => op(() => void almacen.datos.delete(k)),
      };
      return tx;
    },
  });

  return {
    /** Lo guardado en un almacén (para mirar desde el test). */
    datos: (base: string, almacen: string) => [...(bases.get(base)?.almacenes.get(almacen)?.datos.values() ?? [])],
    open: (nombre: string) => {
      const p: Pedido & { onupgradeneeded: (() => void) | null } = { onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => {
        const nueva = !bases.has(nombre);
        if (nueva) bases.set(nombre, { almacenes: new Map() });
        p.result = conexion(bases.get(nombre)!);
        if (nueva) p.onupgradeneeded?.();
        p.onsuccess?.();
      }, 0);
      return p;
    },
  };
}
