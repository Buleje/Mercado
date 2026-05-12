"use client";

import { useState } from "react";
import { Keyboard, Search, ShoppingCart, Home, User, Package, Moon, HelpCircle } from "@buleje/design-system/icons";
import { Modal, ModalHeader, ModalBody } from "./Modal";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";

interface ShortcutItem {
  icon: React.ComponentType<{ className?: string }>;
  keys: string[];
  description: string;
  category: "navigation" | "actions" | "general";
}

const SHORTCUTS: ShortcutItem[] = [
  // Navigation
  {
    icon: Home,
    keys: ["⌘", "H"],
    description: "Ir a inicio",
    category: "navigation",
  },
  {
    icon: User,
    keys: ["⌘", "U"],
    description: "Ir a mi cuenta",
    category: "navigation",
  },
  {
    icon: Package,
    keys: ["⌘", "O"],
    description: "Ver mis pedidos",
    category: "navigation",
  },
  
  // Actions
  {
    icon: Search,
    keys: ["⌘", "K"],
    description: "Abrir búsqueda",
    category: "actions",
  },
  {
    icon: Search,
    keys: ["/"],
    description: "Enfocar búsqueda",
    category: "actions",
  },
  {
    icon: ShoppingCart,
    keys: ["⌘", "B"],
    description: "Abrir carrito",
    category: "actions",
  },
  {
    icon: Moon,
    keys: ["⌘", "D"],
    description: "Cambiar tema",
    category: "actions",
  },
  
  // General
  {
    icon: HelpCircle,
    keys: ["Shift", "?"],
    description: "Mostrar atajos",
    category: "general",
  },
  {
    icon: Keyboard,
    keys: ["Esc"],
    description: "Cerrar modal",
    category: "general",
  },
];

const CATEGORIES = {
  navigation: "Navegación",
  actions: "Acciones",
  general: "General",
};

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className={cn(
      "inline-flex items-center justify-center",
      "min-w-7 h-7 px-2",
      "text-xs font-semibold",
      "bg-gray-100 dark:bg-surface",
      "border border-gray-300 dark:border-gray-600",
      "rounded-md shadow-[var(--shadow-sm)]",
      "text-gray-700 dark:text-[var(--text-primary)]"
    )}>
      {children}
    </kbd>
  );
}

/**
 * Keyboard Shortcuts Help Modal
 * 
 * Displays all available keyboard shortcuts in the app
 * Opens with Shift+? or can be controlled externally
 */
export function KeyboardShortcutsModal({
  isOpen: externalIsOpen,
  onClose: externalOnClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  // Use external state if provided, otherwise use internal
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const onClose = externalOnClose || (() => setInternalIsOpen(false));
  
  // Register Shift+? shortcut to open the modal
  useKeyboardShortcut({
    key: "?",
    modifiers: ["shift"],
    callback: () => {
      if (externalIsOpen === undefined) {
        setInternalIsOpen(true);
      }
    },
    description: "Mostrar atajos de teclado",
    enabled: externalIsOpen === undefined, // Only enable if not externally controlled
  });
  
  // Group shortcuts by category
  const groupedShortcuts = SHORTCUTS.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Atajos de Teclado"
      size="lg"
      animation="scale"
    >
      <ModalHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Keyboard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted">
              Usa estos atajos para navegar más rápido
            </p>
          </div>
        </div>
      </ModalHeader>
      
      <ModalBody>
        <div className="space-y-6">
          {(Object.keys(groupedShortcuts) as Array<keyof typeof CATEGORIES>).map((category) => (
            <div key={category}>
              <h3 className="text-sm font-bold text-gray-500 dark:text-muted uppercase tracking-wider mb-3">
                {CATEGORIES[category]}
              </h3>
              <div className="space-y-2">
                {groupedShortcuts[category].map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <shortcut.icon className="h-4 w-4 text-gray-400 dark:text-muted" />
                      <span className="text-sm text-gray-700 dark:text-[var(--text-primary)]">
                        {shortcut.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <KeyBadge key={keyIndex}>{key}</KeyBadge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <p className="text-xs text-[var(--data-success-700)] dark:text-emerald-300">
            <span className="font-semibold">Tip:</span> En Windows/Linux, usa <KeyBadge>Ctrl</KeyBadge> en lugar de <KeyBadge>⌘</KeyBadge>
          </p>
        </div>
      </ModalBody>
    </Modal>
  );
}

/**
 * Floating keyboard hint for discoverability
 * Shows a subtle hint that keyboard shortcuts are available
 */
export function KeyboardShortcutHint() {
  const [isHintVisible, setIsHintVisible] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  if (!isHintVisible) return null;
  
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={cn(
          "fixed bottom-4 right-4 z-30",
          "flex items-center gap-2 px-3 py-2",
          "bg-[var(--surface-raised)]",
          "border border-[var(--rule-base)]",
          "rounded-full shadow-[var(--shadow-lg)]",
          "text-xs text-gray-600 dark:text-muted",
          "hover:shadow-[var(--shadow-xl)] hover:scale-105",
          "transition-all duration-200",
          "group"
        )}
        aria-label="Ver atajos de teclado"
      >
        <Keyboard className="h-4 w-4 text-gray-400 group-hover:text-primary transition-colors" />
        <span className="hidden sm:inline">Atajos</span>
        <KeyBadge>?</KeyBadge>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsHintVisible(false);
          }}
          className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-[var(--text-primary)]"
          aria-label="Cerrar hint"
        >
          ×
        </button>
      </button>
      
      <KeyboardShortcutsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
