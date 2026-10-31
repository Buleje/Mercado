"use client";

/**
 * admin-shortcuts-context — los atajos que aporta el módulo abierto.
 *
 * El admin ya tiene UNA hoja de ayuda (`?` → `KeyboardShortcutsHelp`) con los
 * atajos globales. Cuando un módulo trae los suyos —el Libro CTP tiene doce
 * vistas navegables y acciones por vista— la salida fácil es abrir una segunda
 * hoja: dos modales de atajos superpuestos, cada uno contando una mitad.
 *
 * Acá el módulo REGISTRA sus secciones y la hoja global las muestra debajo de
 * las suyas. Una sola tecla, una sola hoja, y lo que dice depende de dónde estás.
 *
 * El registro se limpia al desmontar el módulo: si el operador se va del Libro,
 * la hoja deja de prometer atajos que ya no existen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ShortcutItem {
  keys: string[];
  description: string;
}

export interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

interface Ctx {
  /** Secciones aportadas por el módulo activo (vacío si no hay ninguno). */
  sections: ShortcutSection[];
  /** Registra/reemplaza las secciones de un módulo. */
  register: (id: string, sections: ShortcutSection[]) => void;
  unregister: (id: string) => void;
  /** Abrir la hoja desde un botón (no todos usan el teclado). */
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const noop = () => {};
const AdminShortcutsContext = createContext<Ctx>({
  sections: [],
  register: noop,
  unregister: noop,
  open: noop,
  close: noop,
  isOpen: false,
});

export function AdminShortcutsProvider({ children }: { children: ReactNode }) {
  const [porModulo, setPorModulo] = useState<Record<string, ShortcutSection[]>>({});
  const [isOpen, setIsOpen] = useState(false);

  const register = useCallback((id: string, sections: ShortcutSection[]) => {
    setPorModulo((prev) => {
      // Comparación por contenido: los módulos re-registran en cada render de la
      // vista activa, y un `setState` con el mismo valor re-renderiza el árbol
      // del admin entero (el bug de "Maximum update depth" del contexto de tabs).
      const antes = prev[id];
      if (antes && JSON.stringify(antes) === JSON.stringify(sections)) return prev;
      return { ...prev, [id]: sections };
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setPorModulo((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _fuera, ...resto } = prev;
      return resto;
    });
  }, []);

  const sections = useMemo(() => Object.values(porModulo).flat(), [porModulo]);

  const value = useMemo<Ctx>(
    () => ({
      sections,
      register,
      unregister,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      isOpen,
    }),
    [sections, register, unregister, isOpen],
  );

  return <AdminShortcutsContext.Provider value={value}>{children}</AdminShortcutsContext.Provider>;
}

export function useAdminShortcuts(): Ctx {
  return useContext(AdminShortcutsContext);
}

/**
 * Registra las secciones del módulo mientras esté montado. `sections` tiene que
 * venir memoizada por el caller (o al menos ser estable en contenido): el
 * provider compara por valor, así que un array nuevo con lo mismo no re-renderiza.
 */
export function useRegisterShortcuts(id: string, sections: ShortcutSection[]): void {
  const { register, unregister } = useAdminShortcuts();
  useEffect(() => {
    register(id, sections);
    return () => unregister(id);
  }, [id, sections, register, unregister]);
}
