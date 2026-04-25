/**
 * Re-export local de los primitives del admin layer.
 *
 * Evita duplicacion: los componentes viven en
 * `app/admin/_components/_shared/` y aqui solo damos un alias local
 * para que las sub-paginas de /superadmin importen desde una
 * ubicacion local cohesiva.
 *
 * Si en el futuro queremos un tercer consumidor (ej. /vendor),
 * mover los componentes a `components/admin-shell/` (ubicacion
 * neutral) y cambiar este re-export.
 */

export {
  ADMIN_TOKENS,
  AdminTabShell,
  AdminEmptyState,
  AdminButton,
  AdminField,
  AdminInput,
  AdminTextarea,
  AdminSelect,
} from "@/app/admin/_components/_shared";
