"use client";

/**
 * AdminSelect — wrapper sobre @radix-ui/react-select con estilos editoriales.
 *
 * Por qué: los <select> nativos del browser se ven inconsistentes entre
 * plataformas (Chrome vs Safari vs Firefox vs mobile), no se pueden
 * estilizar bien, y el list-box del native lookups pobre UX. Radix Select
 * da control total + keyboard nav + portal.
 *
 * Uso:
 *   <AdminSelect
 *     value={category}
 *     onValueChange={setCategory}
 *     placeholder="Categoría"
 *     options={[
 *       { value: "todos", label: "Todas las categorías" },
 *       { value: "abarrotes", label: "Abarrotes" },
 *       { value: "bebidas", label: "Bebidas", disabled: true },
 *     ]}
 *   />
 *
 * Con groups:
 *   <AdminSelect options={[
 *     { type: "group", label: "Frescos", items: [
 *       { value: "frutas", label: "Frutas" },
 *       { value: "verduras", label: "Verduras" },
 *     ]},
 *     { type: "group", label: "Secos", items: [...] },
 *   ]} />
 */

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface AdminSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Descripción pequeña debajo del label en la lista. */
  description?: string;
}

export interface AdminSelectGroup {
  type: "group";
  label: string;
  items: AdminSelectOption[];
}

type OptionOrGroup = AdminSelectOption | AdminSelectGroup;

interface Props {
  value?: string;
  onValueChange?: (value: string) => void;
  options: OptionOrGroup[];
  placeholder?: string;
  disabled?: boolean;
  /** ID para conectar con <label for=...>. */
  id?: string;
  /** aria-label si no hay label visible. */
  ariaLabel?: string;
  /** Clase extra en el trigger. */
  className?: string;
  /** Tamaño. Default "md". */
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-sm",
} as const;

function isGroup(opt: OptionOrGroup): opt is AdminSelectGroup {
  return "type" in opt && opt.type === "group";
}

export function AdminSelect({
  value,
  onValueChange,
  options,
  placeholder = "Seleccionar...",
  disabled = false,
  id,
  ariaLabel,
  className,
  size = "md",
}: Props) {
  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] font-medium text-[var(--text-primary)] transition-colors",
          "hover:border-[var(--rule-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          "data-[state=open]:border-[var(--accent)]",
          "data-[placeholder]:text-[var(--text-tertiary)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          SIZE_CLASSES[size],
          className,
        )}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown
            className="h-3.5 w-3.5 text-[var(--text-tertiary)] data-[state=open]:rotate-180 transition-transform"
            strokeWidth={2}
          />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[var(--radix-select-trigger-width)] max-h-[min(320px,var(--radix-select-content-available-height))]",
            "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-xl overflow-hidden",
            "data-[state=open]:animate-select-in",
          )}
        >
          <Select.ScrollUpButton className="flex items-center justify-center h-6 bg-[var(--surface-canvas)] text-[var(--text-tertiary)] cursor-default">
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
          </Select.ScrollUpButton>

          <Select.Viewport className="p-1.5">
            {options.map((opt, i) => {
              if (isGroup(opt)) {
                return (
                  <Select.Group key={`g-${i}`}>
                    <Select.Label className="px-2 py-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {opt.label}
                    </Select.Label>
                    {opt.items.map((item) => (
                      <AdminSelectItemInner key={item.value} item={item} />
                    ))}
                  </Select.Group>
                );
              }
              return <AdminSelectItemInner key={opt.value} item={opt} />;
            })}
          </Select.Viewport>

          <Select.ScrollDownButton className="flex items-center justify-center h-6 bg-[var(--surface-canvas)] text-[var(--text-tertiary)] cursor-default">
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>

      <style jsx global>{`
        @keyframes select-in {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        [data-radix-select-content][data-state="open"].animate-select-in {
          animation: select-in 140ms ease-out;
          transform-origin: top;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-select-content].animate-select-in {
            animation: none !important;
          }
        }
      `}</style>
    </Select.Root>
  );
}

function AdminSelectItemInner({ item }: { item: AdminSelectOption }) {
  return (
    <Select.Item
      value={item.value}
      disabled={item.disabled}
      className={cn(
        "relative flex items-center gap-2.5 px-2.5 py-2 rounded-md outline-none cursor-pointer",
        "data-[highlighted]:bg-[var(--surface-sunken)]",
        "data-[state=checked]:bg-[var(--accent-soft)]",
        "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
      )}
    >
      <Select.ItemIndicator className="absolute left-2.5 top-2 text-[var(--accent)]">
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </Select.ItemIndicator>
      <div className="ml-6 min-w-0 flex-1">
        <Select.ItemText>
          <span className="text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
        </Select.ItemText>
        {item.description && (
          <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{item.description}</div>
        )}
      </div>
    </Select.Item>
  );
}

export default AdminSelect;
