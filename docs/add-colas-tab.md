# Agregar Tab "Colas" al Panel Admin

## 1. Agregar dynamic import en app/admin/page.tsx

Buscar la sección de dynamic imports (líneas ~50-200) y agregar:

```typescript
const ColasTab = dynamic(() => import("@/components/admin/ColasTab"), { loading: () => <TabSpinner /> });
```

## 2. Agregar a la lista de tabs

En la constante VALID_TABS agregar "colas":

```typescript
const VALID_TABS: Tab[] = [...existingTabs, "colas"];
```

## 3. Agregar al menú lateral

En la sección del menú, agregar un item para "Colas":

```tsx
{ id: "colas", label: "Colas", icon: Activity }
```

Asegurarse de importar `Activity` de `lucide-react` si no está ya importado.

## 4. Agregar al switch de renderizado

En el switch/conditional que renderiza tabs, agregar:

```tsx
{tab === "colas" && <ColasTab />}
```

## Notas

- El tab solo es visible para el rol `admin` (la API route valida esto).
- Si no hay Redis configurado (`REDIS_URL`), el tab mostrará un mensaje informativo indicando que las colas están deshabilitadas.
- El componente hace auto-refresh cada 10 segundos y tiene botón de refresco manual.
