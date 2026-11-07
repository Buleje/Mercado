/**
 * Los contratos de «Registrar producción»: lo que entra (el material y las
 * props de la ventana) y lo que sale (`ProduccionRegistrada`, que los padres
 * convierten en el cuerpo de la PATCH). Se movieron tal cual desde
 * `CtpRegistrarProduccionModal.tsx`, que los vuelve a exportar.
 */
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { DetalleProduccionSniffs } from "@/lib/forestal/sniffs-produccion-parse";
import type { OrigenMateriaPrima, PaqueteBorrador } from "@/lib/forestal/produccion-paquetes";
import type { PaquetePrevio } from "../CtpMaterialPanel";

/** Lo que se va a consumir: las piezas elegidas del lote. */
export interface MaterialAConsumir {
  especie: string;
  especieCientifica?: string | null;
  piezas: number;
  volumenM3: number;
  /** Los títulos habilitantes que amparan esa madera — el (6) del origen. */
  permisos: string[];
  /**
   * Cuánta materia prima puso cada título habilitante (ADR-358).
   *
   * Un lote junta trozas de dos permisos y el paquete que sale de la sierra es
   * madera de los dos: no hay forma física de saber qué tabla vino de qué árbol,
   * pero sí en qué proporción entró cada uno, y eso es lo que la trazabilidad
   * pide poder afirmar.
   */
  origenes?: OrigenMateriaPrima[];
}

export interface ProduccionRegistrada {
  fecha: string;
  lineaProduccion: string;
  observaciones: string | null;
  paquetes: PaqueteBorrador[];
  volumen: number;
  /**
   * A quién se le asierra y a qué precio (ADR-412). Contrato de la PATCH
   * (revisión adversarial, corregido): `undefined`/ausente = no toca el cobro
   * que la corrida ya tenía (el servidor recotiza con el dueño existente si lo
   * hay); `{ duenoParteId: null }` = dejar de cobrar; `precioManualPt` ausente
   * = mantiene el trato actual, `null` = usar la tarifa, número = precio a
   * mano. `duenoParteId` ausente = mantiene el dueño actual (ADR-412,
   * replanteo tras revisión adversarial): los flujos que no conocen el dueño
   * de antemano (producción de lote, declarar desde SNIFFS) no pueden pisarlo
   * sólo por tocar el precio.
   */
  aserrio?: { duenoParteId?: string | null; precioManualPt?: number | null };
}

/** Lo que recibe la ventana. */
export interface RegistrarProduccionProps {
  /**
   * Opcional: una CORRIDA que ya consumió también declara acá (ADR-349), y su
   * lote puede estar consumido o no existir. El formulario es el mismo —
   * duplicarlo para la otra puerta daría dos formas de declarar lo mismo.
   */
  lote?: LoteAserrio | null;
  material: MaterialAConsumir;
  /** Día sugerido para la producción, `AAAA-MM-DD`. */
  fecha: string;
  guardando: boolean;
  error: string | null;
  /** Encabezados propios cuando no se entra por el lote. */
  titulo?: string;
  descripcion?: string;
  /**
   * Lo que esta MISMA corrida ya declaró en tandas anteriores (ADR-361/365).
   *
   * Con esto el formulario es el mismo para declarar y para ampliar: el tope, el
   * margen y el rendimiento se miden sobre el acumulado —dos tandas del 40 % son
   * 80 % entre las dos— y no sobre lo que se está cargando ahora.
   */
  yaDeclaradoM3?: number;
  /**
   * Lo que la corrida ya declaró, con sus medidas: se muestra en una solapa —
   * «¿qué códigos usé?» y «¿con qué medidas?» son las dos preguntas de quien
   * vuelve a cargar— y de ahí salen los códigos que no se pueden repetir.
   */
  paquetesPrevios?: readonly PaquetePrevio[];
  /** El botón de guardar dice qué hace: «Guardar» ≠ «Agregar a la corrida». */
  ctaLabel?: string;
  /**
   * La madera que entró a la sierra, pieza por pieza.
   *
   * Se despliega bajo pedido: declarar es mirar la pila y anotar lo que salió, y
   * tener la lista a mano —con su código de planta y su GTF— evita salir del
   * modal para responder «¿de qué troza salió esto?». Es la MISMA tabla del
   * LO-CTP, en sólo lectura: esas piezas ya son un hecho registrado.
   */
  trozas?: TrozaConsumible[];
  /**
   * Con qué producto arranca el primer paquete (modo inventario, ADR-?): el
   * paso 1 ya preguntó "qué va a salir" y repetir la elección acá sería
   * ignorar lo que el operador ya contestó. Sigue siendo editable.
   */
  productoInicial?: string | null;
  /**
   * La pantalla del SNIFFS que ya se pegó en el paso 1 del lote (ADR-398): la
   * zona «Traer del SNIFFS» arranca en la revisión con esos productos.
   */
  sniffsInicial?: DetalleProduccionSniffs | null;
  /**
   * Lo que se acaba de leer del SNIFFS, para que quien abrió el modal lo guarde
   * con el lote y pueda cotejarlo después (ADR-398). Se avisa al AGREGAR, no al
   * leer: leer y descartar no es haberlo declarado.
   */
  onSniffsLeido?: (detalle: DetalleProduccionSniffs) => void;
  /**
   * El dueño que esta corrida YA tiene, si existe (ADR-412). El bloque de
   * cobro arranca ahí — no en «Madera del centro» — para que "no toqué nada"
   * y "elegí que no tenga dueño" no se confundan (ALTO, revisión adversarial:
   * ampliar sin tocar el bloque le seguía cobrando de más al dueño viejo
   * porque en verdad no se le seguía cobrando NADA, ver `confirmar`).
   */
  cobroInicial?: {
    duenoParteId: string | null;
    precioManualPt?: number | null;
    nombreGuardado?: string | null;
  };
  /**
   * La fecha REAL e inmutable de una corrida que YA EXISTE. `declarar_produccion`
   * / `ampliar_produccion` no reescriben `entryDate` — el `día` de abajo es sólo
   * un dato del asiento, no algo que declarar cambie — así que cotizar el
   * aserrío con él mostraría una tarifa distinta de la que el servidor aplica
   * de verdad. Ausente = la corrida todavía NO existe y el `día` editado ACÁ
   * es el que se va a usar para crearla (`CtpProduccionDeLote`).
   */
  fechaCorridaFija?: string;
  onConfirmar: (datos: ProduccionRegistrada) => void;
  onClose: () => void;
  /**
   * Se anuló un día desde la tira del modal (2026-09-23): el libro cambió sin
   * declarar nada. Quien lo pasa relee su tabla; el modal sigue abierto.
   */
  onCambioEnElLibro?: () => void;
}
