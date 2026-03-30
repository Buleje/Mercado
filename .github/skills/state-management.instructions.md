---
applyTo: "**/contexts/**,**/hooks/use*,**/cart*"
---

# State Management — Buleje

## Contextos disponibles

```typescript
// Importar desde sus archivos respectivos en contexts/
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { usePromotions } from "@/contexts/promotions-context";
import { useTheme } from "@/contexts/theme-context";
import { useToast } from "@/contexts/toast-context";
import { useReviews } from "@/contexts/reviews-context";
import { useFavorites } from "@/contexts/favorites-context";
import { useCompare } from "@/contexts/compare-context";
```

## CartContext — el más crítico

```typescript
const {
  items,           // CartItem[]
  addItem,         // (product, quantity) => void
  removeItem,      // (productId) => void
  updateQuantity,  // (productId, quantity) => void
  clearCart,       // () => void
  total,           // number (calculado)
  itemCount,       // number
} = useCart();
```

## BroadcastChannel — sincronización multi-tab

```typescript
// cart-context.tsx usa BroadcastChannel para sincronizar el carrito
// entre múltiples pestañas del mismo navegador.

// El canal se llama "cart-sync"
// Eventos: "cart-updated", "cart-cleared"

// Patrón actual (NO modificar sin entender el sync):
const channel = new BroadcastChannel("cart-sync");
channel.postMessage({ type: "cart-updated", cart: newCart });

channel.onmessage = (e) => {
  if (e.data.type === "cart-updated") setCart(e.data.cart);
};
```

## localStorage — persistencia del carrito

```typescript
// El carrito persiste en localStorage bajo la clave "bsm-cart"
// Al montar CartContext, se inicializa desde localStorage
// Al actualizar, se sincroniza a localStorage Y via BroadcastChannel
const CART_KEY = "bsm-cart";
```

## Cuándo usar Context vs Server State

| Dato | Dónde vive | Por qué |
|------|-----------|---------|
| Carrito | CartContext | Necesita ser accesible globalmente + multi-tab sync |
| Usuario autenticado | Session cookie + requireAdmin | Auth server-side |
| Configuración del tenant | SettingsContext | Cargada una vez, usada en toda la app |
| Productos (catálogo) | SWR / fetch | Server state — no duplicar en contexto |
| Órdenes del admin | SWR / fetch | Datos frecuentemente mutados |
| Tema (dark/light) | ThemeContext | Preferencia del usuario en localStorage |

## Custom hooks disponibles

```
hooks/
  use-cart.ts           — Wrapper de CartContext
  use-debounce.ts       — Debounce para search inputs
  use-local-storage.ts  — Wrapper seguro de localStorage
  use-media-query.ts    — Responsive hooks
  use-toast.ts          — Notifications toast
  use-infinite-scroll.ts — Scroll infinito para catálogo
```

## Patrón para SWR (datos del servidor)

```typescript
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

function useProducts() {
  const { data, error, isLoading, mutate } = useSWR("/api/products", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30000, // 30s
  });
  return { products: data ?? [], error, isLoading, mutate };
}
```

## Gotchas

- **BroadcastChannel no funciona entre orígenes distintos** — solo mismo dominio
- **`clearCart()` al confirmar orden** — debe llamarse desde el handleSubmit del checkout
- **No duplicar estado del servidor en Context** — products, orders van en SWR, no en Context
- **ThemeContext y localStorage** — la clave es `"theme"` (configurar `darkMode: 'class'` en Tailwind)
- **BroadcastChannel cleanup** — el contexto debe llamar `channel.close()` en el cleanup del useEffect
- **SSR + localStorage** — siempre verificar `typeof window !== "undefined"` antes de acceder a localStorage

## Anti-patrones

- NO poner estado del servidor (productos, órdenes) en Context — usar SWR/fetch
- NO mutar el carrito directamente — usar las funciones del contexto
- NO skipear el BroadcastChannel al hacer clearCart — dejará tabs desincronizados
- NO acceder a localStorage en SSR sin guardia `typeof window !== "undefined"`
