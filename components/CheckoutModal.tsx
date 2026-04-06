/**
 * components/CheckoutModal.tsx
 *
 * Re-export del CheckoutModal refactorizado. La implementación completa
 * vive ahora en `components/checkout/` distribuida en steps, hooks y
 * partes pequeñas.
 *
 * Histórico:
 *  - Antes: monolito de 1333 líneas con 55+ useState
 *  - Ahora: orquestador < 250 líneas con useReducer + hooks aislados
 *
 * Mantén este archivo como un simple re-export para preservar el path
 * de import (`@/components/CheckoutModal`) usado por StoreClientShell
 * y otros consumidores.
 */
export { default } from "./checkout/CheckoutModal";
