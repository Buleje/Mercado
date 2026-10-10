/**
 * A dónde lleva cada cosa del panel: UNA tabla para todos los hipervínculos.
 *
 * «Todo nombre de una cosa lleva a su ficha» (Brandon, 09-10). Antes cada
 * pantalla armaba su URL a mano (o no la armaba): la misma troza se escribía de
 * tres formas y la mayoría de los nombres eran texto muerto. Acá vive la
 * dirección de la ficha de cada cosa; `<EnlacePanel cosa="troza" id={…}>`
 * (`components/admin/shared/EnlacePanel.tsx`) la convierte en un enlace que
 * navega sin recargar, y `irAEnlace` (`components/admin/shared/ir-a-enlace.ts`)
 * hace lo mismo desde un botón.
 *
 * REGLA DEL EXPLORADOR: una cosa con `abre: false` no abre (aunque ya tenga
 * su `destino` planeado) y `hrefDe` devuelve `null`; `EnlacePanel` la deja
 * como texto. `abre: true` SÓLO cuando el `lector` ya lee su parámetro: un
 * enlace que lleva a la puerta del módulo y no abre nada es peor que no tener
 * enlace.
 *
 * CÓMO SE AGREGA UNA COSA (o se prende una con `abre: false`):
 *  1. La pantalla destino lee su `?<param>=` y abre la ficha (`useFichaEnUrl`
 *     de `hooks/use-ficha-en-url.ts`; el «atrás» la cierra solo).
 *  2. El param va a `PARAMS_DE_VISTA` (`hooks/use-vista-modulo.ts`) para que no
 *     quede pegado al cambiar de módulo.
 *  3. Acá: `tab` y `vista` REALES (TabRouter + `lib/admin/subvistas-modulos`),
 *     `params`, `abre: true`, y su caso en `__tests__/lib/enlaces-panel.test.ts`.
 *
 * Sin `window` ni React: lo puede usar el servidor (un aviso, el Resultado del
 * negocio) para armar el mismo destino que usa la pantalla.
 */

/** Todas las cosas que tienen (o van a tener) ficha en el panel. */
export type CosaDelPanel =
  /* Forestal */
  | "permiso"
  | "troza"
  | "arbol"
  | "ingreso"
  | "parte"
  | "lote"
  /* Gente y plata */
  | "colaborador"
  | "cuenta-adelantos"
  | "turno"
  /* Bodega */
  | "pedido"
  | "cliente"
  | "producto"
  | "proveedor"
  | "oc"
  /* Documentos y cámaras */
  | "carpeta"
  | "personas-camaras"
  /* Todavía sin ficha direccionable: quedan como texto. */
  | "gasto"
  | "tarea"
  | "activo"
  | "adelanto";

/** El destino en la forma de `EnlaceOrigen` (`lib/finance/resultado-del-negocio`): pestaña + parámetros. */
export interface DestinoPanel {
  tab: string;
  params: Record<string, string>;
}

interface FilaDeCosa {
  /** ¿La pantalla destino abre la ficha al leer la URL? Si no, la cosa queda como texto. */
  abre: boolean;
  /** Pestaña y parámetros de la ficha de ESA cosa. Ausente = sin destino todavía. */
  destino?: (id: string) => DestinoPanel;
  /** `false` = la cosa no lleva id (una galería): `hrefDe` no lo exige. */
  pideId?: boolean;
  /** Quién lee el parámetro (para el que la mantenga). */
  lector: string;
}

const CTP = "ctp-libro-operaciones";
const d = (tab: string, params: Record<string, string>): DestinoPanel => ({ tab, params });

/**
 * La tabla. Cada `lector` es el archivo que abre la ficha al leer la URL; si se
 * mueve o deja de leerla, esta fila miente: actualizarla en el mismo cambio.
 */
export const COSAS_DEL_PANEL: Readonly<Record<CosaDelPanel, FilaDeCosa>> = {
  permiso: {
    abre: true,
    destino: (id) => d(CTP, { vista: "contratos", contrato: id }),
    lector: "components/admin/forestal/ficha-del-permiso-url.ts (ADR-432)",
  },
  troza: {
    abre: true,
    destino: (id) => d(CTP, { vista: "trozas", troza: id }),
    lector: "lib/forestal/ctp-troza-url.ts → CtpTrozasView (ADR-436)",
  },
  arbol: {
    abre: true,
    /* El id es el CÓDIGO del árbol en el censo, no su cuid. */
    destino: (codigo) => d("loth-libro-operaciones", { vista: "mapa", arbol: codigo }),
    lector: "lib/forestal/tarjeta-troza.ts urlDelArbolEnElMapa → mapa del LO-TH",
  },
  ingreso: {
    abre: true,
    destino: (id) => d(CTP, { vista: "ingresos", ingreso: id }),
    lector: "components/admin/forestal/hooks/use-guia-de-ingreso-en-url.ts → CtpIngresosView",
  },
  parte: {
    abre: true,
    destino: (id) => d(CTP, { vista: "directorio", parte: id }),
    lector: "components/admin/forestal/hooks/use-parte-en-url.ts → CtpDirectorioView",
  },
  lote: {
    abre: true,
    destino: (id) => d("forestal-lotes", { lote: id }),
    lector: "components/admin/forestal/ForestLotesModule.tsx (useFichaEnUrl de `lote`)",
  },
  colaborador: {
    abre: true,
    destino: (id) => d("rrhh", { vista: "personal", persona: id }),
    lector: "components/admin/rrhh/personal/PersonalView.tsx (también el QR del fotocheck, ADR-416)",
  },
  "cuenta-adelantos": {
    abre: true,
    /* El id es la `clave` de la cuenta unificada (`benef:<id>` / `parte:<id>`) o cualquiera de sus dos ids. */
    destino: (clave) => d("plata", { vista: "adelantos", accion: "liquidar", persona: clave }),
    lector: "components/admin/adelantos/cuentas/liquidar-por-url.ts",
  },
  turno: {
    abre: true,
    destino: (id) => d("ventas-caja", { vista: "arqueo", turno: id }),
    lector: "components/admin/unified/POSCajaModule.tsx → Cuadrar caja",
  },
  pedido: {
    abre: true,
    destino: (id) => d("pedidos", { pedido: id }),
    lector: "components/admin/OrdersTab/hooks/useOrdersData.ts (trae por id el archivado)",
  },
  cliente: {
    abre: true,
    /* El CRM abre la ficha por TELÉFONO: ese es el id. */
    destino: (telefono) => d("clientes", { vista: "crm", cliente: telefono }),
    lector: "components/admin/crm/use-crm-clientes.ts (por teléfono; fiados y pedidos lo pasan)",
  },
  producto: {
    abre: true,
    destino: (id) => d("inventario", { producto: id }),
    lector: "components/admin/inventario/hooks/use-inventario-estado.ts + use-inventario-carga.ts",
  },
  proveedor: {
    abre: true,
    destino: (id) => d("compras", { vista: "proveedores", proveedor: id }),
    lector: "components/admin/proveedores/use-ficha-proveedor-url.ts → SuppliersTab",
  },
  oc: {
    abre: true,
    destino: (id) => d("compras", { vista: "ordenes-compra", oc: id }),
    lector: "components/admin/ordenes-compra/hooks/use-oc-estado.ts",
  },
  carpeta: {
    abre: true,
    destino: (id) => d("documentos", { sub: "folder", carpeta: id }),
    lector: "components/admin/documentos/DocumentosModule.tsx (= enlaceAlDrive)",
  },
  "personas-camaras": {
    abre: true,
    pideId: false,
    destino: () => d("camaras", { vista: "personas" }),
    lector: "components/admin/forestal/camaras/VistaPersonas.tsx",
  },
  gasto: { abre: false, lector: "HistorialGastosTab: la ficha vive sólo en el estado" },
  tarea: { abre: false, lector: "TasksTab: la ficha vive sólo en el estado" },
  activo: { abre: false, lector: "ActivosModule: la ficha vive sólo en el estado" },
  adelanto: { abre: false, lector: "Adelantos: sin ficha de UN adelanto por URL" },
};

/** ¿Esa cosa ya abre su ficha por enlace? */
export function abreLaFicha(cosa: CosaDelPanel): boolean {
  const fila = COSAS_DEL_PANEL[cosa];
  return fila.abre && !!fila.destino;
}

/** Pestaña + parámetros de la ficha, o `null` si la cosa no abre todavía o falta el id. */
export function destinoDe(cosa: CosaDelPanel, id?: string | null): DestinoPanel | null {
  const fila = COSAS_DEL_PANEL[cosa];
  if (!fila.abre || !fila.destino) return null;
  const limpio = id?.trim() ?? "";
  if (!limpio && fila.pideId !== false) return null;
  return fila.destino(limpio);
}

/** La ruta (sin origen) de un destino: `/admin?tab=…&…`. */
export function hrefDeDestino(destino: DestinoPanel): string {
  const q = new URLSearchParams({ tab: destino.tab, ...destino.params });
  return `/admin?${q.toString()}`;
}

/**
 * A dónde lleva el nombre de esa cosa: `/admin?tab=…` o `null` (= dejarlo como
 * texto). Ruta sin origen, para que el enlace quede en el tenant en que se está.
 */
export function hrefDe(cosa: CosaDelPanel, id?: string | null): string | null {
  const destino = destinoDe(cosa, id);
  return destino ? hrefDeDestino(destino) : null;
}
