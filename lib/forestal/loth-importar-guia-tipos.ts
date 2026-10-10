/**
 * Tipos de «Importar guías ya despachadas al Libro TH» (ADR-461, 02-10-2026).
 *
 * El CONTRATO entre el servidor y la pantalla: la vista previa
 * (`POST /api/admin/forestal/loth/importar-guia/vista-previa`), la importación
 * (`POST /api/admin/forestal/loth/importar-guia`) y las candidatas
 * (`GET /api/admin/forestal/loth/importar-guia/candidatas`) responden con estas
 * formas. Si alguno cambia, se anota acá arriba con la fecha.
 *
 * PURO y client-safe: sólo tipos (y una constante).
 *
 * Cambios:
 *  - 02-10 (1ª versión + 30 min): `AvisoImportacion.soloConTala`, `TalaReferencial.soloConTala`,
 *    `GuiaVistaPrevia.estadoSinTala` y los pedidos (`PedidoVistaPrevia`,
 *    `PedidoImportar`, `IMPORTAR_GUIAS_POR_PEDIDO`). Todo AGREGADO; nada cambió de forma.
 *  - 02-10 (tarde): `IMPORTAR_SERFOR_POR_PEDIDO`, `RespuestaCandidatas.ilegibles` y
 *    «Deshacer la importación» (`DeshacerImportacion`, `RespuestaDeshacer`,
 *    `GET|POST …/importar-guia/deshacer`). Todo AGREGADO.
 *  - 02-10 (noche, Brandon: «se importará también los datos […] y opción para
 *    guardar en el directorio»): `GuiaVistaPrevia.ficha` (la ficha entera,
 *    reparada, sin la lista de trozas que ya va en `trozas`) y
 *    `GuiaVistaPrevia.directorio` (cada parte, el vehículo y el permiso frente
 *    al directorio); `ItemImportarGuia.directorio` (qué guardar) y
 *    `ResultadoImportarGuia.directorio` (qué pasó con cada uno). Todo AGREGADO
 *    y opcional: un cliente de antes sigue funcionando igual.
 *  - 04-10 (T9 al importar): `GuiaVistaPrevia.sobreCupo` (lo que la guía deja
 *    por encima del cupo de cada especie, con y sin talas nuevas) e
 *    `ItemImportarGuia.motivoSobreCupo` (el motivo para pasar lo AUTORIZADO;
 *    el rol lo decide el servidor por el JWT). Todo AGREGADO y opcional.
 *  - 04-10 (T6 al importar): `GuiaVistaPrevia.sobreAutorizado` (lo que la guía
 *    DESPACHA por encima de lo autorizado; sin motivo posible) y el aviso
 *    `exceso_autorizado`, que bloquea la guía. Todo AGREGADO.
 *  - 04-10 (tanda): `GuiaVistaPrevia.base` (la revisión ANTES de T6/T9) y
 *    `RespuestaVistaPrevia.tanda` (lo que el servidor leyó por plan): con eso
 *    la pantalla rehace T6/T9 con las guías MARCADAS (`rehacerTanda`, la misma
 *    función que corre el servidor) al desmarcar o cambiar el interruptor.
 *    Aviso nuevo `especie_distinta_al_censo`. Todo AGREGADO y opcional.
 *  - 04-10 (T6 con motivo, ADR-468): `GuiaVistaPrevia.t6ConMotivo` (la guía
 *    VERIFICADA en SERFOR que pasa T6 y quien mira es admin/dueño: pide el
 *    motivo en vez de bloquearse) y `ContextoTanda.puedePasarT6`. El motivo es
 *    el mismo `ItemImportarGuia.motivoSobreCupo`. Todo AGREGADO y opcional.
 *  - 07-10 (código único por guía, ADR-474): estado de troza `renombrada`, aviso
 *    `troza_renombrada` e `ItemImportarGuia.confirmaRenombres` (los códigos
 *    únicos que la persona confirmó como trozas DISTINTAS). Todo AGREGADO: un
 *    cliente de antes no confirma y la guía con renombres vuelve rechazada.
 *  - 08-10 (ADR-477, reemplaza §2 de ADR-474): `trozaCode` es SIEMPRE el código
 *    único `12A-0001`; `renombrada` = «su código de guía ya salió con OTRA guía
 *    de este permiso» (pide casilla); `TrozaImportada.repiteGuia` (opcional).
 */

import type { GtfSerfor } from "./serfor-gtf";
import type { EntradaCupo } from "./loth-cupo-especie";
import type { EspecieReconocible } from "./loth-constants";
import type { RolParte } from "./directorio";

// ── De dónde sale la guía ───────────────────────────────────────────────────

/**
 * Una guía para importar, por su fuente:
 *  - `serfor`: el N° de REGISTRO de la GTF (con guiones, `1-10-0474633`); el
 *    servidor la consulta en el SNIFFS (caché: 10 min lo encontrado, 60 s un «no encontrada»).
 *  - `ctp`: un ingreso del Libro CTP que guardó la ficha de SERFOR
 *    (`WoodEntry.serforGtf`). Cualquier asiento de la guía sirve (hay uno por especie).
 *  - `ficha`: la ficha ya leída (foto o PDF con el lector IA). NO está
 *    verificada en SERFOR: la guía queda anotada como «leída de un documento».
 */
export type FuenteImportarGuia =
  | { tipo: "serfor"; numeroRegistro: string }
  | { tipo: "ctp"; woodEntryId: string }
  | { tipo: "ficha"; ficha: GtfSerfor };

/** Cuántas guías por pedido de VISTA PREVIA. */
export const IMPORTAR_GUIAS_MAX = 30;

/**
 * Cuántas guías por pedido de IMPORTAR. Cada guía es una transacción con
 * decenas de consultas (una de 7 trozas ≈ 20 s desde la PC por el pooler; una
 * de 49 ≈ 100 s): la pantalla las manda de a una o de a pocas y muestra el
 * avance, en vez de esperar minutos un solo pedido.
 */
export const IMPORTAR_GUIAS_POR_PEDIDO = 10;

/**
 * Cuántas guías por N° de registro (fuente `serfor`) en UN pedido: cada una es
 * una consulta al SNIFFS, un servicio del Estado. Se cobran además al mismo
 * límite que la consulta suelta (`forestal:gtf-serfor`).
 */
export const IMPORTAR_SERFOR_POR_PEDIDO = 10;

// ── El permiso ──────────────────────────────────────────────────────────────

/** El `planType` que se propone para un permiso nuevo, según el origen y el código del título. */
export type TipoPlanImportado = "PLANTACION" | "DEMA" | "PMFI" | "PO";

/** Los datos del plan que se crearía. La pantalla los muestra y deja editarlos. */
export interface PlanNuevoPropuesto {
  planType: TipoPlanImportado;
  /** En plantación: el código del registro. En los demás: `null` (el código va en `tituloHabilitante`). */
  planNumber: string | null;
  tituloHabilitante: string | null;
  titularName: string;
  representanteLegal: string | null;
  resolucionNumber: string | null;
  /** Departamento del ORIGEN (casilleros 10-12 de la guía). */
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  /** La ARFFS que registró la guía (`instanciaRegistra`). */
  arffs: string | null;
  /** El permiso (`ForestContrato`) con el mismo código y sin plan: el plan nuevo se ata a él. */
  contratoId: string | null;
}

/** Un plan del negocio que coincide con el código del título de la guía. */
export interface PermisoCandidato {
  planId: string;
  planType: string;
  /** `planNumber` o `tituloHabilitante`, el que coincidió (o el primero que haya). */
  codigo: string | null;
  titularName: string;
  /** Por dónde coincidió: el código del plan o el permiso (`ForestContrato.planId`). */
  via: "plan" | "contrato";
  /** Especies del registro/autorización del plan (vacío = sin cargar: T7 no juzga). */
  especies: string[];
}

export type PermisoDetectado =
  /** Un solo plan con ese código: las trozas van ahí. */
  | { estado: "existente"; plan: PermisoCandidato }
  /** Ningún plan: se crea con `propuesta`. */
  | { estado: "nuevo"; propuesta: PlanNuevoPropuesto }
  /** Dos o más planes con ese código: la persona elige a cuál va. */
  | { estado: "ambiguo"; candidatos: PermisoCandidato[]; propuesta: PlanNuevoPropuesto };

/** A qué plan va la guía, como lo confirma la persona. */
export type PlanDestino =
  | { tipo: "existente"; planId: string }
  | { tipo: "nuevo"; plan: PlanNuevoPropuesto };

// ── Lo que se va a asentar ──────────────────────────────────────────────────

/** Qué pasa con una troza de la guía al importarla. */
export type EstadoTrozaImportada =
  /** Se crea su línea de Trozado. */
  | "nueva"
  /** Ya tiene Trozado en ESTE plan (de una importación anterior de la misma guía o cargada a mano): se usa ésa. */
  | "ya_trozada"
  /**
   * ADR-477 (antes ADR-474): su código DE LA GUÍA ya salió con OTRA guía del
   * MISMO permiso (plantación con códigos repetidos entre guías). Entra como
   * troza nueva con su código único (`12A-0002`, como toda troza que entra
   * desde una guía); `codificacionGuia` sigue diciendo «12A». Nunca automático:
   * la importación la exige confirmada (`ItemImportarGuia.confirmaRenombres`):
   * si fuera la MISMA troza física, su volumen se contaría dos veces.
   */
  | "renombrada"
  /** Choca con el libro (otro plan, otra especie o ya salió): la guía no se importa hasta resolverlo. */
  | "conflicto";

export interface TrozaImportada {
  /** Posición en la lista de trozas de la guía (1, 2, 3…). */
  indice: number;
  /** La codificación tal como la publica la guía («186A», «173-D», «-»). */
  codificacionGuia: string | null;
  /**
   * El código ÚNICO con que queda en el libro (ADR-477): SIEMPRE
   * `<código en la guía>-<correlativo corto>` («12A-0001»; otro talonario con
   * el mismo correlativo → «12A-019/0001»), `SC-<registro>-<n>` si no tiene
   * código, o el del libro si la troza ya estaba (`ya_trozada`: registrada a
   * mano o importada antes de ADR-477 con el código crudo).
   */
  trozaCode: string;
  /** El árbol («186A» → «186»). `null` en las sin código: no se trazan a un árbol. */
  treeCode: string | null;
  sinCodigo: boolean;
  speciesCommon: string | null;
  speciesScientific: string | null;
  /** D1 y D2 de la guía en METROS (la guía los publica en cm). */
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  /** El volumen de la GUÍA (dato oficial, no se recalcula). */
  volumeM3: number | null;
  estado: EstadoTrozaImportada;
  /** Por qué choca, o qué línea se reutiliza. */
  detalle: string | null;
  /** `renombrada`: el N° de la otra guía del permiso con la que ya salió su código (ADR-477). */
  repiteGuia?: string | null;
}

/** Qué pasa con la tala referencial de un árbol. */
export type EstadoTalaReferencial =
  /** Se crea la tala referencial. */
  | "nueva"
  /** El árbol ya tiene una tala referencial de otra guía en este plan: se le suman estas trozas. */
  | "ampliar"
  /** El árbol ya tiene una tala medida en campo en este plan: se usa ésa (no se toca). */
  | "existente"
  /** La tala del árbol es de otro plan, o la medida no alcanza (T4): la guía no se importa. */
  | "conflicto";

/**
 * La tala que se arma desde las trozas de un árbol: largo = Σ largos, D1 = el
 * mayor, D2 = el menor, m³ = Σ m³ de sus trozas (así «trozado ≤ tala» cierra).
 */
export interface TalaReferencial {
  treeCode: string;
  /** Las trozas de ESTA guía que la forman («186A», «186B»). */
  trozas: string[];
  speciesCommon: string | null;
  speciesScientific: string | null;
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumeM3: number | null;
  estado: EstadoTalaReferencial;
  /** La tala que ya está en el libro (si `ampliar`, `existente` o `conflicto`). */
  talaExistente: { lineNo: number; volumeM3: number | null; planId: string | null } | null;
  detalle: string | null;
  /** El choque sólo existe si se crea la tala (el árbol tiene trozas en otro permiso y ninguna tala). */
  soloConTala?: boolean;
}

// ── Avisos ──────────────────────────────────────────────────────────────────

export type CodigoAvisoImportacion =
  | "anulada"
  | "ya_importada"
  | "mes_cerrado"
  | "sin_trozas"
  | "sin_numero"
  | "sin_fecha"
  | "sin_codigo"
  | "medidas_incompletas"
  | "conflicto_troza"
  | "conflicto_tala"
  | "ambiguo"
  | "plan_nuevo_sin_especies"
  | "especie_fuera_del_plan"
  | "no_verificada"
  | "volumen_distinto"
  /**
   * T6: lo despachado de una especie pasaría lo autorizado del permiso. Bloquea
   * (no admite motivo) salvo la guía VERIFICADA en SERFOR vista por admin o
   * dueño (ADR-468): ésa no lleva este aviso, va con `t6ConMotivo`.
   */
  | "exceso_autorizado"
  /** La tala nueva va con otra especie que la del censo del árbol (`TALA_ESPECIE_DISTINTA_AL_CENSO`). */
  | "especie_distinta_al_censo"
  /** ADR-474: trozas con el código de otra guía del mismo permiso entran con un código único; hay que confirmarlo. */
  | "troza_renombrada";

export interface AvisoImportacion {
  /** `bloquea` = la guía no se importa así; `atencion` = se importa, pero conviene mirarlo; `info` = para saber. */
  nivel: "bloquea" | "atencion" | "info";
  codigo: CodigoAvisoImportacion;
  mensaje: string;
  /** Sólo cuenta si se crean las talas referenciales (con el interruptor apagado, no aplica). */
  soloConTala?: boolean;
}

// ── Vista previa ────────────────────────────────────────────────────────────

/** La identidad de la guía, como la dice el documento. */
export interface GuiaResumen {
  numeroRegistro: string | null;
  gtfNumber: string | null;
  /** `AAAA-MM-DD` (de `fechaExpedicion` dd/mm/aaaa). `null` si no se pudo leer. */
  fecha: string | null;
  estadoSerfor: string | null;
  anulada: boolean;
  titular: string | null;
  representanteLegal: string | null;
  numeroTitulo: string | null;
  origenRecurso: string | null;
  destinatario: string | null;
  /** Lo que declara la guía (Σ del detalle si no publica el total). */
  volumenDeclaradoM3: number | null;
  /** Σ de la lista de trozas. */
  volumenTrozasM3: number;
  piezas: number;
  especies: string[];
  /** Vino del SNIFFS o de una ficha de SERFOR guardada en el CTP (no de una foto). */
  verificadaEnSerfor: boolean;
}

export type EstadoVistaPrevia =
  /** Se puede importar (con avisos de `atencion`, si los hay). */
  | "lista"
  /** El permiso es ambiguo: falta que la persona elija. */
  | "elegir_permiso"
  /** Ya está en el libro (mismo N° y mismo titular, o mismo N° de registro). */
  | "ya_importada"
  /** Un aviso `bloquea` (anulada, mes cerrado, conflicto…). */
  | "bloqueada"
  /** SERFOR no la encontró, o el ingreso no existe. */
  | "no_encontrada"
  /** SERFOR no respondió. */
  | "sin_respuesta";

export interface GuiaVistaPrevia {
  /** Clave estable para la pantalla: el N° de registro, o el N° de la guía, o el id del ingreso. */
  clave: string;
  /** La fuente tal como vino (para devolverla en el POST de importar). */
  fuente: FuenteImportarGuia;
  /** El estado con las talas referenciales como vienen por defecto (`crearTalaPorDefecto`). */
  estado: EstadoVistaPrevia;
  /** El estado si se importa SIN crear talas (lo que cambia al apagar el interruptor). */
  estadoSinTala: EstadoVistaPrevia;
  /** Una línea para la persona («SERFOR no encontró la guía 1-10-…»). */
  mensaje: string | null;
  guia: GuiaResumen | null;
  permiso: PermisoDetectado | null;
  trozas: TrozaImportada[];
  talas: TalaReferencial[];
  /** Si la tala referencial va prendida por defecto: NO en plantación (ADR-459: allí no es obligatoria). */
  crearTalaPorDefecto: boolean;
  avisos: AvisoImportacion[];
  /**
   * Todos los datos de la guía (titular, propietario, destinatario, transporte,
   * cuadro de productos…), reparados («MUÃ?OZ» → «MUÑOZ»). Sin la lista de
   * trozas: ésa ya va en `trozas`. `null` si no hay ficha.
   */
  ficha?: GtfSerfor | null;
  /** Quién de la guía ya está en el directorio y quién es nuevo. `null` si no se pudo mirar. */
  directorio?: DirectorioDeLaGuia | null;
  /**
   * T9: las especies que esta guía deja por encima de su cupo, medidas con la
   * MISMA regla que la importación (`avisoCupoAlTalar` sobre la lectura de
   * `ForestLothDB.entradaCupoDelPlan`). `conTala`: las talas nuevas + las que
   * se agrandan; `sinTala`: sólo las que se agrandan (se escriben igual con el
   * interruptor apagado). `null`/ausente = el plan no tiene contra qué medir.
   */
  sobreCupo?: { conTala: SobreCupoDeLaGuia[]; sinTala: SobreCupoDeLaGuia[] } | null;
  /**
   * T6: las especies que esta guía DESPACHARÍA por encima de lo autorizado
   * (`despachoT6DeLaGuia` sobre `ForestLothDB.medidaT6`, la lectura del
   * despacho). Si hay alguna, la guía va `bloqueada` con `exceso_autorizado`,
   * salvo con `t6ConMotivo`.
   */
  sobreAutorizado?: SobreAutorizadoDeLaGuia[] | null;
  /**
   * T6 con motivo (ADR-468): la guía pasa lo autorizado de despacho, está
   * VERIFICADA en SERFOR (`guia.verificadaEnSerfor`, del servidor) y quien mira
   * es admin o dueño. No se bloquea: pide el motivo (el mismo de T9) y las
   * cuentas van en `sobreAutorizado`. La importación lo vuelve a decidir.
   */
  t6ConMotivo?: boolean;
  /**
   * La revisión ANTES de lo que depende de la tanda (T6, T9) y del censo
   * (especie): `rehacerTanda` parte siempre de acá. `null` = sin ficha.
   */
  base?: BaseDeLaGuia | null;
}

/** La revisión de la guía sin T6/T9: de acá se rehace la tanda. */
export interface BaseDeLaGuia {
  /** El plan EXISTENTE al que va (`null` = permiso nuevo: no hay contra qué medir). */
  planId: string | null;
  plantacion: boolean;
  /** El permiso lo eligió la persona (o se detectó sin dudas). */
  elegido: boolean;
  /** Ya está en el libro: ni T6 ni T9 (sus trozas ya cuentan en la base). */
  yaImportada: boolean;
  /** La revisión la dio por «lista»: las guías siguientes la vieron en el libro (sus trozas, su tala). */
  avanzaLibro: boolean;
  avisos: AvisoImportacion[];
  /** Las talas como las armó la revisión (contando a TODAS las guías anteriores de la tanda). */
  talas: TalaReferencial[];
  /** Lo que despacharía para T6: especie y volumen de la línea de Trozado de cada troza. */
  despachoT6: { speciesCommon: string | null; speciesScientific: string | null; volumeM3: number | null }[];
  /**
   * ADR-468: por qué esta guía, aunque esté verificada, NO puede pasar T6 con
   * motivo (`porQueNoAplicaExcepcionT6`: título de otro permiso, trozas del
   * libro con otro volumen que la guía). `null`/ausente = no hay reparo.
   */
  noAplicaT6ConMotivo?: string | null;
}

/** Lo que el servidor leyó por plan para T9 y T6 (sin lock): la tanda se rehace con esto. */
export interface ContextoTanda {
  cupos: { planId: string; entrada: EntradaCupo }[];
  t6: {
    planId: string;
    delPlan: EspecieReconocible[];
    medidas: { clave: string; autorizado: number | null; movilizado: number }[];
  }[];
  /** ADR-468: quien mira es admin o dueño (del JWT): una guía verificada que pasa T6 pide motivo en vez de bloquearse. */
  puedePasarT6?: boolean;
}

/** T6 de UNA especie de la guía (vista previa): el tope legal de lo despachado. */
export interface SobreAutorizadoDeLaGuia {
  especie: string;
  /** Lo autorizado del permiso (o lo registrado de la plantación), m³. */
  autorizadoM3: number;
  /** Lo que ya salió de la especie (más lo de las guías anteriores de la tanda), m³. */
  yaSalioM3: number;
  /** Lo que despacha esta guía de la especie, m³. */
  despachaM3: number;
  excesoM3: number;
  plantacion: boolean;
  /** «despacha 50.000 m³ de Azúcar huayo y el permiso autoriza 45.000 m³». */
  mensaje: string;
}

/** Una especie que la guía deja por encima de su cupo (vista previa). */
export interface SobreCupoDeLaGuia {
  especie: string;
  /** `autorizado` = lo del plan (pide motivo); `censo` = lo censado (sólo avisa). */
  fuente: "autorizado" | "censo";
  /** Lo autorizado (o censado) de la especie, m³. */
  cupoM3: number;
  /** Lo talado de la especie después de importar la guía, m³. */
  totalConLaGuiaM3: number;
  excesoM3: number;
  pct: number;
  /** Contra lo autorizado: sin motivo, la importación rechaza la guía (422 `T9_CUPO_ESPECIE`). */
  exigeMotivo: boolean;
  /** «Con este árbol, Tornillo llega a 114 % de lo autorizado (8 de 7 m³).» */
  mensaje: string;
}

/** Cuerpo de `POST …/importar-guia/vista-previa`. */
export interface PedidoVistaPrevia {
  fuentes: FuenteImportarGuia[];
  /**
   * Opcional, alineado con `fuentes`: el plan que la persona eligió para esa
   * guía (p. ej. tras un `ambiguo`). Recalcula los choques contra ese plan.
   */
  planes?: (string | null)[];
}

/**
 * Las guías salen en el orden pedido, pero se revisan como se importarían:
 * por fecha. Una guía ve lo que dejan las anteriores de la MISMA tanda (el
 * árbol 173 con 173-A en la guía 7 y 173-D en la 8 → la 8 «amplía» la tala).
 */
export interface RespuestaVistaPrevia {
  guias: GuiaVistaPrevia[];
  /** Para rehacer T6/T9 con las guías marcadas (opcional: un servidor viejo no lo manda). */
  tanda?: ContextoTanda;
}

// ── Importar ────────────────────────────────────────────────────────────────

/** Cuerpo de `POST …/importar-guia`. Se importan por fecha; cada guía en su propia transacción. */
export interface PedidoImportar {
  items: ItemImportarGuia[];
}

export interface ItemImportarGuia {
  fuente: FuenteImportarGuia;
  planDestino: PlanDestino;
  /** Crear (o ampliar) las talas referenciales. Default: según `crearTalaPorDefecto`. */
  crearTala: boolean;
  /** Qué guardar en el directorio DESPUÉS de anotar la guía (si entró). */
  directorio?: PedidoDirectorio;
  /**
   * T9: por qué la guía pasa lo AUTORIZADO de una especie (5 letras o más).
   * Queda en la tala y en `loth_tala_sobre_cupo`. Sólo vale con rol admin o
   * dueño, que decide el servidor por la sesión (nunca este cuerpo).
   * T6 (ADR-468): el MISMO motivo vale para el despacho de una guía verificada
   * en SERFOR que pasa lo autorizado (`loth_despacho_sobre_autorizado`).
   */
  motivoSobreCupo?: string;
  /**
   * T6 (ADR-468): la persona VIO el despacho sobre lo autorizado en la vista
   * previa (`t6ConMotivo`) y lo firma con el motivo. Es consentimiento, no
   * permiso: el permiso sigue siendo rol + verificada + motivo. Sin esto, un
   * motivo escrito para T9 no destraba un exceso de T6 que nadie vio.
   */
  confirmaDespacho?: boolean;
  /**
   * ADR-474: los códigos ÚNICOS (`TrozaImportada.trozaCode` de las
   * `renombrada`) que la persona confirmó como trozas DISTINTAS de las que ya
   * salieron con otra guía. La importación vuelve a revisar y rechaza la guía
   * (`renombre_sin_confirmar`) si renombra alguna que no esté acá.
   */
  confirmaRenombres?: string[];
}

export type EstadoImportacion = "importada" | "ya_estaba" | "rechazada";

export interface ResultadoImportarGuia {
  clave: string;
  estado: EstadoImportacion;
  mensaje: string;
  /** El código del rechazo (`T1_TROZA_YA_MOVILIZADA`, `PERIODO_CERRADO`, `conflicto_troza`…). */
  codigo: string | null;
  gtfId: string | null;
  gtfNumber: string | null;
  planId: string | null;
  /** Se creó el plan con esta guía (no existía). */
  planCreado: boolean;
  lineas: {
    talasNuevas: number;
    talasAmpliadas: number;
    trozadosNuevos: number;
    trozadosReusados: number;
    despachos: number;
  } | null;
  volumenM3: number | null;
  /** Lo que pasó con el directorio (sólo si la guía entró y se pidió guardar algo). */
  directorio?: ResultadoDirectorio[];
}

export interface RespuestaImportar {
  resultados: ResultadoImportarGuia[];
  importadas: number;
  yaEstaban: number;
  rechazadas: number;
}

// ── Candidatas (guías ya recibidas en el aserradero) ────────────────────────

export interface GuiaCandidata {
  /** Un ingreso de la guía (cualquiera: hay uno por especie). Va como `{ tipo: "ctp", woodEntryId }`. */
  woodEntryId: string;
  numeroRegistro: string | null;
  gtfNumber: string;
  /** `AAAA-MM-DD`. */
  fecha: string | null;
  titular: string | null;
  especies: string[];
  piezas: number;
  volumenM3: number | null;
  estadoSerfor: string | null;
  anulada: boolean;
  /** Trozas sin código en la guía («-»). */
  sinCodigo: number;
}

export interface GrupoCandidatas {
  /** El código del título habilitante como lo dice la guía. */
  titulo: string;
  origenRecurso: string | null;
  titular: string | null;
  permiso: PermisoDetectado;
  guias: GuiaCandidata[];
  piezas: number;
  volumenM3: number;
}

export interface RespuestaCandidatas {
  grupos: GrupoCandidatas[];
  /** Guías distintas pendientes de importar. */
  total: number;
  /** Guías del CTP que ya están en el Libro TH (no se listan). */
  yaEnElLibro: number;
  /** Ingresos con una ficha guardada que no se puede leer (no se listan; el detalle va al log). */
  ilegibles?: number;
}

// ── Deshacer una importación (ADR-461 §12, 02-10-2026) ──────────────────────

/** Una tala referencial que toca deshacer la importación. */
export interface TalaDeshecha {
  id: string;
  lineNo: number;
  treeCode: string;
  /**
   * `anular`: la armó sólo esta guía. `reducir`: otra guía también la sostiene;
   * queda con las trozas que siguen vivas del árbol (la misma regla del importador).
   */
  accion: "anular" | "reducir";
  antesM3: number | null;
  despuesM3: number | null;
  /** En `reducir`: las otras guías que la siguen sosteniendo. */
  otrasGuias: string[];
}

/**
 * Qué deshace «Deshacer la importación» de una guía (y qué no). La vista previa
 * (`GET …/deshacer?gtfId=`) y el POST corren la MISMA revisión; el POST la
 * corre bajo los candados y la escribe en una transacción.
 */
export interface DeshacerImportacion {
  gtfId: string;
  gtfNumber: string;
  /** El N° de registro SERFOR que cita la guía (o `null`). */
  registro: string | null;
  volumenM3: number | null;
  /** Líneas de Despacho de trozas de la guía (se anulan). */
  despachos: number;
  /** Trozados que creó ESTA importación (se anulan). */
  trozados: number;
  /** Trozados que ya estaban antes de importar: quedan, sólo pierden este despacho. */
  trozadosQueQuedan: number;
  talas: TalaDeshecha[];
  /** El permiso de la guía: si lo creó una importación y queda vacío, se da de baja. */
  plan: { id: string; nombre: string; baja: boolean; motivo: string } | null;
  /** Por qué no se puede. La vista previa lo muestra; el POST responde 409/422 con él. */
  bloqueo: { codigo: string; mensaje: string; libroNros?: (number | null)[] } | null;
  /** `true` en la respuesta del POST: ya se deshizo. */
  hecho: boolean;
}

export interface RespuestaDeshacer {
  deshacer: DeshacerImportacion;
}

// ── El directorio (02-10 noche) ─────────────────────────────────────────────
//
// Brandon: «opción para poder guardar en el directorio si es dato o permiso
// nuevo: RUC nuevo, razón social nueva, permiso nuevo → agregar al directorio
// para luego reutilizar». La guía nombra hasta cuatro partes, un vehículo y un
// permiso; cada uno se busca en el directorio (por documento, placa o código
// tramo a tramo) y la persona decide qué se agrega o se completa.

/** Quién es cada parte en la guía. */
export type ClaveParteGuia = "titular" | "propietario" | "destinatario" | "transportista";
export type ClaveDirectorio = ClaveParteGuia | "vehiculo" | "permiso";

/** Lo que la guía trae de una parte, en los campos de su ficha del directorio. */
export interface DatosParteGuia {
  direccion: string | null;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  /** Licencia de conducir (el conductor). */
  licencia: string | null;
  /** Del titular: el título habilitante, la resolución, el tipo de plan, la ARFFS y el representante. */
  tituloHabilitante: string | null;
  resolucion: string | null;
  planManejo: string | null;
  arffs: string | null;
  representante: string | null;
}
export type CampoParteGuia = keyof DatosParteGuia;

/**
 * `nuevo`: no está → se ofrece agregar. `existe`: ya está (se puede completar
 * lo que le falta). `propio`: es este mismo negocio → no se ofrece.
 * `no_valido`: el dato de la guía no sirve para una ficha (una placa que no es placa).
 */
export type EstadoEnDirectorio = "nuevo" | "existe" | "propio" | "no_valido";

export interface ExistenteEnDirectorio {
  id: string;
  /** Cómo figura en el directorio. */
  nombre: string;
  /** Por qué se reconoció. Por nombre = la guía no trae documento: sólo se avisa, no se completa. */
  por: "documento" | "nombre" | "placa" | "codigo";
  /** El nombre del directorio y el de la guía son la misma persona. */
  mismoNombre: boolean;
  /** Lo que la guía trae y la ficha no tiene: «Completar con la guía» lo agrega sin pisar nada. */
  faltan: string[];
  /** Papeles que la guía le da y la ficha todavía no tiene (p. ej. ya es proveedor y ahora es destinatario). */
  rolesQueFaltan: RolParte[];
}

export interface ParteEnLaGuia {
  clave: ClaveParteGuia;
  /** Cómo la nombra la guía: «Titular y propietario», «Destinatario»… */
  papel: string;
  roles: RolParte[];
  nombre: string;
  docTipo: "RUC" | "DNI" | null;
  docNumero: string | null;
  datos: DatosParteGuia;
  estado: EstadoEnDirectorio;
  existente: ExistenteEnDirectorio | null;
  /**
   * Nueva por su documento, pero el directorio ya tiene a alguien con el MISMO
   * nombre y OTRO documento: puede ser la misma escrita dos veces. No se
   * fusiona sola; se avisa y no se marca para agregar.
   */
  parecida?: { id: string; nombre: string; docTipo: string | null; docNumero: string | null } | null;
  /** Una línea para la persona (la guía no publica su RUC, figura con otro nombre…). */
  aviso: string | null;
}

export interface VehiculoEnLaGuia {
  /** Como se lee en el papel: «V2H-901». */
  placa: string;
  placaRemolque: string | null;
  tipo: string | null;
  estado: EstadoEnDirectorio;
  existente: ExistenteEnDirectorio | null;
  aviso: string | null;
}

export interface PermisoEnLaGuia {
  codigo: string;
  /** El tipo que se deduce del código (PER-FMP, PER-FMC, REG-PLT…). */
  tipo: string;
  titularNombre: string;
  resolucionNumero: string | null;
  arffs: string | null;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  estado: "nuevo" | "existe";
  existente: (ExistenteEnDirectorio & { titularId: string | null; planId: string | null }) | null;
  aviso: string | null;
}

export interface DirectorioDeLaGuia {
  partes: ParteEnLaGuia[];
  vehiculo: VehiculoEnLaGuia | null;
  permiso: PermisoEnLaGuia | null;
}

/** `agregar` = darlo de alta (sólo si es nuevo); `completar` = sumarle lo que le falta (sólo si existe). */
export type AccionDirectorio = "agregar" | "completar";

export interface PedidoDirectorioParte {
  clave: ClaveParteGuia;
  accion: AccionDirectorio;
  /** Lo corregido en la pantalla, sólo al agregar (si no viene, va lo de la guía). */
  nombre?: string;
  docTipo?: "RUC" | "DNI" | null;
  docNumero?: string | null;
}

export interface PedidoDirectorio {
  partes: PedidoDirectorioParte[];
  vehiculo?: { accion: AccionDirectorio; placa?: string } | null;
  permiso?: { accion: AccionDirectorio } | null;
}

export type EstadoResultadoDirectorio = "agregado" | "completado" | "ya_existia" | "omitido" | "fallo";

export interface ResultadoDirectorio {
  clave: ClaveDirectorio;
  /** El nombre, la placa o el código. */
  nombre: string;
  estado: EstadoResultadoDirectorio;
  mensaje: string;
  /** La ficha del directorio (parte, vehículo o permiso). */
  id: string | null;
}
