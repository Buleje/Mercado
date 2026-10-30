/**
 * ctp-pendientes — qué le falta hacer al operario en el Libro, hoy.
 *
 * El Libro tiene doce pestañas y la respuesta a "¿qué tengo pendiente?" estaba
 * repartida entre todas: los ingresos sin validar en una, las guías del monte
 * sin ingresar en otra, los despachos sin GTF o sin anexo en otras dos. Esto lo
 * junta y lo ordena por lo que traba primero.
 *
 * PURO: recibe los datos ya cargados (no hace fetch) y decide. Así se testea la
 * priorización sin levantar el módulo entero.
 */

export type UrgenciaPendiente = "bloquea" | "atrasado" | "pendiente";

export interface Pendiente {
  clave: string;
  urgencia: UrgenciaPendiente;
  /** Cuántos casos hay. Un pendiente con 0 no se muestra. */ cantidad: number;
  /** Qué hay que hacer, en imperativo. */ titulo: string;
  /** Por qué importa (una línea). */ detalle: string;
  /** Pestaña del Libro donde se resuelve. */ vista: string;
  /**
   * Filtro que deja puesta la pestaña de destino, para aterrizar en los casos y
   * no en la lista entera. Hoy lo entiende Ingresos: `"pendiente"` (estado) y
   * `"fuera-de-plazo"`.
   */
  filtro?: "pendiente" | "fuera-de-plazo" | "sin-pagar";
}

import type { CorridaSinOrigen } from "./loctp-consumos-analisis";
import type { GuiasSinPagarDeParte } from "./plata-de-guia";
import type { PropuestasDelPatio } from "./propuesta-de-lotes";
import { formatCurrency } from "@/lib/format";

/** Un grupo de madera suelta: lo que entraría en UN lote (una especie, un permiso). */
export interface GrupoSinLote {
  especie: string;
  permiso: string;
  trozas: number;
  m3: number;
}

/**
 * Madera en el patio que todavía no está en ningún lote (Brandon 30-10, «Lote
 * para la madera suelta»): sin lote, la producción se reparte «a ojo» entre las
 * guías. Los grupos son los que ya se pueden armar —guía recibida, especie y
 * permiso conocidos—; lo que no tiene especie o permiso se cuenta aparte porque
 * no hay lote que lo reciba hasta corregir el ingreso.
 */
export interface MaderaSinLote {
  trozas: number;
  m3: number;
  grupos: readonly GrupoSinLote[];
  /** Trozas sin especie o sin permiso: tampoco tienen lote, pero no se pueden armar. */
  sinDato: { trozas: number; m3: number };
  /** El servidor leyó sólo las primeras 5000 trozas del patio: las cifras son «más de». */
  truncado?: true;
}

export interface DatosPendientes {
  /** Ingresos de materia prima en estado "pendiente". */ ingresosPendientes: number;
  /** Ingresos vigentes registrados fuera del plazo legal. */ fueraDePlazo: number;
  /** GTF del monte emitidas que todavía no entraron al CTP. */ guiasSinIngresar: number;
  /** Despachos vivos sin número de GTF de salida. */ despachosSinGtf: number;
  /** Despachos vivos sin ANEXO N° 04 emitido. */ despachosSinAnexo: number;
  /** Corridas de producción sin materia prima atribuida. */ corridasSinOrigen: number;
  /**
   * Cuáles son, con lo que cada una DECLARA de entrada. La que declara volumen
   * y no tiene trozas es la que más duele: el libro afirma cuánta madera entró.
   */
  corridasSinOrigenDetalle?: CorridaSinOrigen[];
  /** Especies con saldo negativo (se despachó más de lo que entró). */ saldosNegativos: number;
  /**
   * Piezas que llevan `TROZAS_VARADAS_DIAS` o más paradas en el patio.
   *
   * No traba ningún cierre —el libro cierra igual— pero es plata perdiéndose
   * sola: la troza tropical se mancha y se raja. Es el único pendiente que no
   * es un papel sino madera.
   */
  trozasVaradas?: number;
  /**
   * Ingresos vigentes sin costo cargado.
   *
   * El único pendiente que no le importa a SERFOR: el libro cierra perfecto sin
   * un solo precio. Le importa al dueño — sin costo no hay COGS, y sin COGS
   * ningún despacho puede decir si dejó plata. Por eso "pendiente" y nunca
   * "bloquea".
   */
  ingresosSinCosto?: number;
  /** m³ de esos ingresos. El conteo solo subestima lo que está en juego. */
  m3SinCosto?: number;
  /**
   * Permisos propios (`ForestContrato`) con la vigencia ya vencida.
   *
   * Lo que está POR vencer va en «se viene» (`ctp-anticipa`), que es donde
   * todavía se puede hacer algo; acá va lo que ya pasó y hay que corregir antes
   * de la próxima compra o el próximo despacho. La vigencia **sin cargar** no
   * cuenta: eso lo reclama el panel «qué le falta a tus permisos».
   */
  permisosVencidos?: number;
  /**
   * Cuáles y hace cuánto. El código solo no alcanza: «vencido» sin el número no
   * distingue el permiso que se pasó ayer del que se pasó hace ocho meses, y
   * son dos urgencias distintas. `dias` viene NEGATIVO (días ya transcurridos).
   */
  permisosVencidosDetalle?: readonly { codigo: string; dias: number }[];
  /**
   * Guías RECIBIDAS sin una sola foto de la carga (2026-09-26, «pedila al
   * recibir»). La foto de la pila es lo que sostiene el papel si la madera
   * que bajó no es la que dice la guía; se saca en el patio o no se saca.
   * Medido: Blas 0 de 12 guías con foto.
   */
  guiasSinFoto?: number;
  /** Cuáles (las más recientes primero) — el detalle nombra las tres primeras. */
  guiasSinFotoDetalle?: readonly { gtf: string }[];
  /**
   * Guías vivas sin fecha de llegada al patio (o con trozas sin decidir), de
   * todo el libro y fuera de meses cerrados (`WoodEntriesDB.guiasSinRecibir`).
   * La fecha de recepción es lo primero que pregunta una fiscalización —el día
   * que la madera bajó del camión— y la que entró por el importador sin la
   * casilla «ya están en el patio» la espera acá.
   */
  guiasSinRecibir?: number;
  /** m³ de esos asientos sin fecha. */
  m3SinRecibir?: number;
  /**
   * Guías de COMPRA con algo por pagar, una fila por proveedor (ADR-437 §10).
   * Tampoco es un papel: es plata que se debe. `atrasado` sólo si la ficha dice
   * crédito y ya pasó el plazo; si no, `pendiente`. Nunca `bloquea`: el libro
   * cierra igual con deudas.
   */
  guiasSinPagar?: readonly GuiasSinPagarDeParte[];
  /**
   * GTF de salida con su Anexo 04 cargado que no están en Despacho (ADR-446,
   * 26-10): la madera ya salió y el libro todavía la cuenta en el patio. Lo
   * cuenta el servidor con la misma regla de la revisión (`?contar=1`), sin
   * período: una guía de agosto sin registrar sigue sin registrar hoy.
   */
  guiasSinDespacho?: number;
  m3SinDespacho?: number;
  /** Madera del patio sin lote (`maderaSinLoteDe`, sobre las propuestas del servidor). */
  maderaSinLote?: MaderaSinLote;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Qué troza cuenta como «madera en patio sin lote»: la que el servidor ya
 * propone para un lote (en el patio, sin lote, sin consumir, elegible por
 * `motivoNoElegible`, con su guía recibida). La que espera su guía NO entra:
 * todavía no está en el patio para el libro, y ese aviso es otro («Guías sin
 * fecha de llegada»). Sin especie o sin permiso: van aparte, en `sinDato`.
 */
export function maderaSinLoteDe(p: PropuestasDelPatio | null | undefined): MaderaSinLote {
  const grupos: GrupoSinLote[] = (p?.propuestas ?? [])
    .filter((g) => g.trozas > 0)
    .map((g) => ({ especie: g.especie, permiso: g.permiso ?? "sin permiso", trozas: g.trozas, m3: r3(g.m3) }))
    .sort((a, b) => b.m3 - a.m3 || a.especie.localeCompare(b.especie, "es"));
  const sinDato = {
    trozas: (p?.sinEspecie?.trozas ?? 0) + (p?.sinPermiso?.trozas ?? 0),
    m3: r3((p?.sinEspecie?.m3 ?? 0) + (p?.sinPermiso?.m3 ?? 0)),
  };
  return {
    trozas: grupos.reduce((a, g) => a + g.trozas, 0),
    m3: r3(grupos.reduce((a, g) => a + g.m3, 0)),
    grupos,
    sinDato,
    ...(p?.truncado ? { truncado: true as const } : {}),
  };
}

/** «Tornillo · PLT-2025-096: 31.09 m³ (12 trozas)», los tres más grandes. */
function detalleMaderaSinLote(m: MaderaSinLote): string {
  const trozas = (n: number) => `${n} ${n === 1 ? "troza" : "trozas"}`;
  const lista = m.grupos
    .slice(0, 3)
    .map((g) => `${g.especie} · ${g.permiso}: ${g.m3.toFixed(2)} m³ (${trozas(g.trozas)})`)
    .join("; ");
  const resto = m.grupos.length > 3 ? ` y ${m.grupos.length - 3} grupos más` : "";
  const sinDato = m.sinDato.trozas > 0
    ? ` Otras ${trozas(m.sinDato.trozas)} no dicen su especie o permiso.`
    : "";
  const corte = m.truncado ? " Hay más de 5000 trozas sin lote: las cifras son de las primeras 5000." : "";
  return `${lista}${resto}. Ármales su lote abajo: así la producción sale exacta por lote.${sinDato}${corte}`;
}

/** A partir de acá una troza parada empieza a costar. Mismo corte que el patio. */
export const TROZAS_VARADAS_DIAS = 60;

/** Día calendario de una fecha *date-only* (guardada a medianoche UTC). */
export function diaDeFechaOnly(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Día calendario de un límite de período (construido en hora LOCAL). */
export function diaDeLimiteLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * ¿Ese día cae dentro del período? Se compara por día calendario y no por
 * instante: `to` es "31 a las 23:59 hora local" y la fecha del documento es
 * medianoche UTC — restarlos como instantes corre el mes de un día (Lima UTC-5).
 * Sin límites (todo el histórico) entra todo.
 */
export function diaEnPeriodo(dia: string, desde: string, hasta: string): boolean {
  if (!dia) return false;
  if (desde && dia < desde) return false;
  if (hasta && dia > hasta) return false;
  return true;
}

/** «GTF 001-123, 001-124, 001-125 y 4 más». */
function detalleGuiasSinFoto(detalle: readonly { gtf: string }[], total: number): string {
  const cola = "Sin foto de la pila no hay cómo probar qué bajó del camión: súbela desde el ingreso.";
  if (detalle.length === 0) return cola;
  const lista = detalle.slice(0, 3).map((g) => g.gtf).join(", ");
  const resto = total > 3 ? ` y ${total - 3} más` : "";
  return `GTF ${lista}${resto}. ${cola}`;
}

const ORDEN: Record<UrgenciaPendiente, number> = { bloquea: 0, atrasado: 1, pendiente: 2 };

/**
 * Cuáles son los permisos vencidos, hace cuánto y qué se rompe.
 *
 * Con uno solo se escribe entero («venció hace 11 días»); con varios se listan
 * los tres primeros con su antigüedad entre paréntesis, porque la línea entra
 * en un renglón del modal y cuatro códigos completos no.
 */
function detallePermisosVencidos(detalle: readonly { codigo: string; dias: number }[]): string {
  const dias = (n: number) => `${Math.abs(n).toLocaleString("es-PE")} ${Math.abs(n) === 1 ? "día" : "días"}`;
  if (detalle.length === 0) return "La guía que emitas con ese papel queda observada.";
  if (detalle.length === 1) {
    const [p] = detalle as [{ codigo: string; dias: number }];
    return `${p.codigo} venció hace ${dias(p.dias)}. La guía que emitas con ese papel queda observada.`;
  }
  const lista = detalle.slice(0, 3).map((p) => `${p.codigo} (hace ${dias(p.dias)})`).join(", ");
  const resto = detalle.length > 3 ? ` y ${detalle.length - 3} más` : "";
  return `${lista}${resto}. La guía que emitas con esos papeles queda observada.`;
}

/**
 * Arma la lista de pendientes, sólo con los que tienen casos, ordenada por lo
 * que traba primero: un saldo negativo invalida el libro entero; un ingreso sin
 * validar es rutina.
 */
export function pendientesDelLibro(d: DatosPendientes): Pendiente[] {
  const todos: Pendiente[] = [
    {
      clave: "saldos-negativos",
      urgencia: "bloquea",
      cantidad: d.saldosNegativos,
      titulo: "Saldos en negativo",
      detalle: "Se despachó más de lo que entró: el libro no cierra así.",
      vista: "saldos",
    },
    {
      clave: "sin-origen",
      urgencia: "bloquea",
      cantidad: d.corridasSinOrigen,
      titulo: "Corridas sin materia prima atribuida",
      detalle: "Sin origen no hay cadena de custodia ni certificado.",
      vista: "produccion",
    },
    /* Va con lo «atrasado» y no con lo que «bloquea»: el libro del mes cierra
       igual con un permiso vencido —`resumenPendientes` habla del cierre—, pero
       cada guía que se emita bajo ese papel nace observada. Mismo nivel que un
       ingreso fuera de plazo: ya pasó, y es lo que mira una fiscalización. */
    {
      clave: "permisos-vencidos",
      urgencia: "atrasado",
      cantidad: d.permisosVencidos ?? 0,
      titulo: (d.permisosVencidos ?? 0) === 1 ? "Permiso con la vigencia vencida" : "Permisos con la vigencia vencida",
      detalle: detallePermisosVencidos(d.permisosVencidosDetalle ?? []),
      vista: "contratos",
    },
    {
      clave: "fuera-de-plazo",
      urgencia: "atrasado",
      cantidad: d.fueraDePlazo,
      titulo: "Ingresos registrados fuera de plazo",
      detalle: "Es lo primero que mira una fiscalización.",
      vista: "cumplimiento",
    },
    {
      clave: "guias-sin-ingresar",
      urgencia: "atrasado",
      cantidad: d.guiasSinIngresar,
      titulo: "Guías del monte sin ingresar al CTP",
      detalle: "La madera salió del bosque y todavía no figura en planta.",
      vista: "ingresos",
    },
    {
      clave: "despachos-sin-gtf",
      urgencia: "atrasado",
      cantidad: d.despachosSinGtf,
      titulo: "Despachos sin GTF de salida",
      detalle: "El producto salió sin guía que lo ampare.",
      vista: "despacho",
    },
    {
      clave: "guias-sin-despacho",
      urgencia: "atrasado",
      cantidad: d.guiasSinDespacho ?? 0,
      titulo: (d.guiasSinDespacho ?? 0) === 1
        ? "Guía que salió sin registrar su despacho"
        : "Guías que salieron sin registrar su despacho",
      detalle: `${(d.m3SinDespacho ?? 0).toFixed(2)} m³ salieron con su Anexo 04 y el libro todavía los cuenta en el patio: revísalas en «Guías sin registrar».`,
      vista: "despacho",
    },
    {
      clave: "ingresos-pendientes",
      urgencia: "pendiente",
      cantidad: d.ingresosPendientes,
      titulo: "Ingresos por validar",
      detalle: "Hasta validarlos no cuentan como materia prima disponible.",
      vista: "ingresos",
      filtro: "pendiente",
    },
    {
      clave: "despachos-sin-anexo",
      urgencia: "pendiente",
      cantidad: d.despachosSinAnexo,
      titulo: "Despachos sin ANEXO N° 04",
      detalle: "La guía viaja con su lista de productos transformados.",
      vista: "despacho",
    },
    /* El único que no es un papel: son troncos parados. No traba el cierre —por
       eso "pendiente" y no "atrasado"— pero se pudre solo mientras espera. */
    {
      clave: "trozas-varadas",
      urgencia: "pendiente",
      cantidad: d.trozasVaradas ?? 0,
      titulo: `Trozas paradas hace ${TROZAS_VARADAS_DIAS} días o más`,
      detalle: "La madera en troza se mancha y se raja: conviene aserrarlas primero.",
      vista: "trozas",
    },
    /* Madera, no papel: el libro cierra igual —por eso «pendiente»—, pero
       sin lote la producción se reparte a ojo entre las guías. */
    {
      clave: "madera-sin-lote",
      urgencia: "pendiente",
      cantidad: d.maderaSinLote?.trozas ?? 0,
      titulo: `Madera en patio sin lote · ${d.maderaSinLote?.truncado ? "más de " : ""}${(d.maderaSinLote?.m3 ?? 0).toFixed(2)} m³`,
      detalle: d.maderaSinLote ? detalleMaderaSinLote(d.maderaSinLote) : "",
      vista: "lotes",
    },
    /* Evidencia, no papel: el libro cierra igual sin fotos —por eso
       «pendiente»—, pero una guía recibida sin foto no tiene cómo probar qué
       bajó del camión si después alguien lo discute. */
    /* La llegada al patio: el libro cierra igual —por eso «pendiente»—, pero
       sin ella la guía no dice cuándo bajó la madera ni desde cuándo está en
       el patio. Se resuelve en Trozas con «Sin recepcionar → Recibir en
       bloque». */
    {
      clave: "guias-sin-recibir",
      urgencia: "pendiente",
      cantidad: d.guiasSinRecibir ?? 0,
      titulo: (d.m3SinRecibir ?? 0) > 0
        ? `${(d.guiasSinRecibir ?? 0) === 1 ? "Guía" : "Guías"} sin fecha de llegada al patio · ${(d.m3SinRecibir ?? 0).toFixed(2)} m³`
        : (d.guiasSinRecibir ?? 0) === 1 ? "Guía sin fecha de llegada al patio" : "Guías sin fecha de llegada al patio",
      detalle: "Una fiscalización pregunta el día que la madera bajó del camión: recíbelas en bloque desde Trozas.",
      vista: "trozas",
    },
    {
      clave: "guias-sin-foto",
      urgencia: "pendiente",
      cantidad: d.guiasSinFoto ?? 0,
      titulo: (d.guiasSinFoto ?? 0) === 1 ? "Guía recibida sin foto de la carga" : "Guías recibidas sin foto de la carga",
      detalle: detalleGuiasSinFoto(d.guiasSinFotoDetalle ?? [], d.guiasSinFoto ?? 0),
      vista: "ingresos",
    },
    /* Tampoco es un papel: es la mitad de la cuenta. El libro cierra igual sin
       costos —a SERFOR no le interesan— pero el margen de todo lo que salga de
       esa madera queda en "no sé". */
    {
      clave: "ingresos-sin-costo",
      urgencia: "pendiente",
      cantidad: d.ingresosSinCosto ?? 0,
      /* El título lleva los m³, no sólo el conteo: «3 ingresos» suena a tres
         papeles y se posterga; «3 · 32.93 m³ sin valorizar» es todo el patio. */
      titulo: (d.m3SinCosto ?? 0) > 0
        ? `Ingresos sin costo · ${(d.m3SinCosto ?? 0).toFixed(2)} m³ sin valorizar`
        : "Ingresos sin costo cargado",
      /* El detalle NO estima cuánto producto queda sin margen: haría falta
         saber qué parte de cada corrida salió de un ingreso sin costo, y eso no
         se sabe sin recorrer la atribución. Un derivado presentado como dato es
         justo lo que este libro no puede permitirse. */
      detalle: "Sin lo que se pagó no hay margen posible en lo que salga de esa madera.",
      vista: "rentabilidad",
    },
  ];

  /* Una línea por proveedor: «3 guías sin pagar a Nelly · S/ 12 400». Juntar a
     todos en un número escondería a quién se le debe, que es la pregunta. */
  for (const d0 of d.guiasSinPagar ?? []) {
    if (d0.guias <= 0 || d0.pendiente <= 0) continue;
    const [, mm, dd] = d0.desde.slice(0, 10).split("-");
    todos.push({
      clave: `guias-sin-pagar:${d0.parteId}`,
      urgencia: d0.nivel,
      cantidad: d0.guias,
      titulo: `${d0.guias} ${d0.guias === 1 ? "guía" : "guías"} sin pagar a ${d0.parteNombre} · ${formatCurrency(d0.pendiente)}`,
      detalle:
        d0.nivel === "atrasado"
          ? `Se pasó el plazo de crédito. La más vieja es del ${dd}/${mm}.`
          : `La más vieja es del ${dd}/${mm}. Se paga desde «Plata de la guía».`,
      vista: "ingresos",
      filtro: "sin-pagar",
    });
  }

  return todos
    .filter((p) => p.cantidad > 0)
    .sort((a, b) => ORDEN[a.urgencia] - ORDEN[b.urgencia] || b.cantidad - a.cantidad);
}

/** Una línea para el encabezado: nada pendiente también es una respuesta. */
export function resumenPendientes(lista: Pendiente[]): string {
  if (lista.length === 0) return "Sin pendientes: el libro está al día.";
  const bloquean = lista.filter((p) => p.urgencia === "bloquea").reduce((a, p) => a + p.cantidad, 0);
  const total = lista.reduce((a, p) => a + p.cantidad, 0);
  return bloquean > 0
    ? `${total} pendientes · ${bloquean} traban el cierre`
    : `${total} pendientes, ninguno traba el cierre`;
}
