/**
 * «Esto que sobra, reprocesalo en lo que falta» — la sugerencia de reproceso de
 * la distribución (ADR-404, pedido de Brandon 2026-09-08).
 *
 * El caso, con sus números: en el saldo hay **comercial**, 25 piezas por 2.215
 * m³, y lo que hay que despachar son **161 paquetes de paquetería por 2.124
 * m³**. Son la misma madera con otra escuadría: pasar comercial por la sierra
 * otra vez da paquetería —más piezas, menos volumen—. Hasta ahora eso se veía
 * mirando dos tablas y haciendo la cuenta a mano.
 *
 * ## La regla dura: el volumen NUNCA crece
 *
 * Un reproceso **pierde** madera (el corte, el recorte, el aserrín). Así que
 * sólo se sugiere convertir hasta lo que hay: `convertir = min(disponible,
 * faltante)`. Si el faltante es mayor que lo disponible, la sugerencia dice
 * cuánto alcanza a cubrir y cuánto sigue faltando — nunca «sale más de lo que
 * entró», que es lo que Brandon marcó como «no tendría sentido».
 *
 * ## Dos formas de detectarlo
 *
 * 1. **Falta amparar** (`motivo: "faltante"`): hay piezas cubicadas de un tipo
 *    que ningún bloque respalda, y hay capacidad LIBRE en bloques de otro tipo.
 *    Un bloque de comercial que no ampara nada porque lo cubicado es paquetería
 *    es madera parada esperando la sierra.
 * 2. **Ya lo está amparando** (`motivo: "amparado"`): el bloque dice comercial
 *    y está respaldando piezas de paquetería. El reparto lo permite —no mira
 *    tipos salvo que se lo pidan con «Lleva sólo»— pero el papel queda
 *    afirmando que esa paquetería salió de un respaldo comercial. Eso es
 *    justamente un reproceso: hay que declararlo, o el libro y el papel dicen
 *    cosas distintas.
 *
 * Los dos se cruzan **dentro de la misma especie**: reprocesar tornillo no
 * produce cachimbo. Y nunca de un tipo hacia sí mismo.
 *
 * ## Y sólo las conversiones que la sierra puede hacer (ADR-407)
 *
 * De comercial sale paquetería, larga angosta y corta; de paquetería larga sale
 * paquetería corta. **Nada vuelve a comercial ni a tabla**: la sierra recorta,
 * no agranda. La matriz vive en `reproceso-reglas.ts` y acá sólo se consulta.
 *
 * Eso parte la detección 2 en dos: si el bloque ampara un tipo que SÍ puede
 * salir de él, es un reproceso a declarar; si ampara uno que **no** puede
 * salir, no es un reproceso — es un respaldo imposible (`amparosImposibles`),
 * y sugerir «declaralo» sería hacer firmar una transformación que la máquina
 * no hace.
 */

import {
  tipoDelBloque,
  type AsignacionMedida,
  type Distribucion,
} from "@/lib/forestal/cubicacion-reparto";
import { etiquetaSinRecorte } from "@/lib/forestal/reparto-anexo";
import { porQueNoSePuede, puedeReprocesarse } from "@/lib/forestal/reproceso-reglas";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Bajo esto no hay madera que reprocesar: es ruido de coma flotante. */
const EPS = 0.0001;

/**
 * El piso para SUGERIR, en la unidad del aserradero y no en la del float.
 *
 * El reparto asigna piezas enteras, así que a un bloque casi siempre le quedan
 * unos litros libres —los de la pieza que ya no entraba—. Sugerir «reprocesá
 * 0.010 m³» es mandar diez litros de madera a la sierra: nadie lo hace, y una
 * lista con esos renglones enseña a ignorar la lista entera (la lección de los
 * siete rojos falsos por redondeo del importador CTP).
 *
 * 0.05 m³ ≈ 21 pie tablar ≈ una tabla de 2×8×10. Menos que eso no es una orden
 * de trabajo.
 */
export const MINIMO_SUGERIBLE_M3 = 0.05;

export interface BloqueOrigen {
  id: string;
  etiqueta: string;
  /** N° de permiso declarado del bloque (`null` si no tiene). */
  permiso: string | null;
  /** Todo lo que el bloque ampara — el número que muestra la tabla de arriba. */
  usadoM3: number;
  /**
   * De eso, lo que ampara de su MISMO tipo: madera que el respaldo cubre tal
   * como está, sin pasar por la sierra otra vez. No es un reproceso y por eso
   * no entra en «lo que sale» — pero sin decirlo, la resta contra el m³ del
   * bloque parece un descuadre (Brandon, 2026-09-09).
   */
  mismoTipoM3: number;
  mismoTipoPiezas: number;
  /** m³ declarados del bloque entero — el tamaño de lo que hay, no lo que se convierte. */
  m3: number;
  libreM3: number;
  /** Piezas que el Libro le declara al bloque, si se saben. */
  piezas: number | null;
}

export type MotivoSugerencia = "faltante" | "amparado";

export interface SugerenciaReproceso {
  especie: string;
  /**
   * `faltante` = hay piezas sin respaldo y capacidad libre de otro tipo.
   * `amparado` = el bloque YA está respaldando piezas de otro tipo, y ese
   * reproceso hay que declararlo para que el papel diga la verdad.
   */
  motivo: MotivoSugerencia;
  /** El tipo que sobra: de acá sale la madera. */
  desdeTipo: string;
  /** El tipo que falta: a esto se convierte. */
  haciaTipo: string;
  /** Capacidad libre de los bloques de `desdeTipo`. */
  disponibleM3: number;
  /** Lo que falta amparar de `haciaTipo`. */
  faltanteM3: number;
  faltantePiezas: number;
  /**
   * Piezas del BLOQUE de origen, si el Libro las declara. Es el tamaño de lo
   * que hay —no las piezas que se convierten, que dependen de la escuadría de
   * salida—: por eso se muestra como contexto y no como la cantidad de la
   * conversión. `null` cuando no se saben: mejor un guion que un número
   * inventado.
   */
  piezasDesde: number | null;
  /** m³ del bloque (o bloques) de origen, para leer de qué tamaño es lo que hay. */
  m3Desde: number;
  /**
   * Las MEDIDAS que salen (2×8×10 · 12 pzas · 0.226 m³), igual que en los
   * bloques distribuidos (Brandon, 2026-09-09: «que tenga ahí las medidas que
   * se usarán… para que todo cuadre según la meta y las medidas»). Sin esto la
   * sugerencia dice un volumen que nadie puede mandar a la sierra: el aserrador
   * corta escuadrías, no metros cúbicos.
   */
  medidas: AsignacionMedida[];
  /** Lo que se puede convertir: nunca más de lo que hay. */
  convertirM3: number;
  /** `true` si con eso el faltante queda cubierto. */
  cubreTodo: boolean;
  /** Lo que seguiría faltando después de reprocesar. */
  restaM3: number;
  /** Lo que quedaría sin usar del origen. */
  sobraM3: number;
  /** Qué parte del origen se aprovecha (%). */
  aprovechaPct: number;
  bloques: BloqueOrigen[];
}

/**
 * Cruza lo que sobra contra lo que falta, especie por especie.
 *
 * Las sugerencias salen ordenadas por volumen convertible: la primera es la que
 * más cuadra la hoja. Un mismo origen puede aparecer para dos destinos —la
 * decisión de cuál hacer es del operario, no del cálculo—, y por eso cada línea
 * dice cuánto hay disponible, no cuánto quedaría después de la otra.
 */
export function sugerenciasDeReproceso(d: Distribucion): SugerenciaReproceso[] {
  const out: SugerenciaReproceso[] = [];

  for (const e of d.especies) {
    /* Lo que sobra, por tipo: sólo bloques cuyo tipo se conoce. Un bloque sin
       tipo declarado no puede decir en qué se convierte. */
    /** Lo que cada bloque ampara de su PROPIO tipo: no necesita reproceso. */
    const propio = new Map<string, { m3: number; piezas: number }>();
    for (const b of e.bloques) {
      const tipo = tipoDelBloque(b.bloque);
      if (!tipo) continue;
      const mias = b.asignado.filter((g) => mismoTipo(tipo, g.label));
      propio.set(b.bloque.id, {
        m3: r4(mias.reduce((a, g) => a + g.m3, 0)),
        piezas: mias.reduce((a, g) => a + g.piezas, 0),
      });
    }

    const libres = new Map<string, BloqueOrigen[]>();
    for (const b of e.bloques) {
      if (!(b.libreM3 > EPS)) continue;
      const tipo = tipoDelBloque(b.bloque);
      if (!tipo) continue;
      const lista = libres.get(tipo) ?? [];
      lista.push({
        id: b.bloque.id,
        etiqueta: etiquetaSinRecorte(b.bloque.etiqueta),
        permiso: (b.bloque.permiso ?? "").trim() || null,
        usadoM3: r4(b.usadoM3),
        mismoTipoM3: propio.get(b.bloque.id)?.m3 ?? 0,
        mismoTipoPiezas: propio.get(b.bloque.id)?.piezas ?? 0,
        m3: r4(Number(b.bloque.m3) || 0),
        libreM3: r4(b.libreM3),
        piezas: b.bloque.piezasOrigen ?? b.bloque.piezasManual ?? null,
      });
      libres.set(tipo, lista);
    }
    /* Sin capacidad libre no hay nada que ofrecer para el faltante, pero el
       motivo 2 (lo que el bloque YA ampara de otro tipo) corre igual: ahí la
       capacidad está toda usada, que es justamente el caso. */
    for (const f of libres.size === 0 ? [] : e.faltante) {
      if (!(f.m3 > EPS)) continue;
      for (const [desdeTipo, bloques] of libres) {
        /* De un tipo hacia sí mismo no hay reproceso que hacer: si sobra
           comercial y falta comercial, lo que hay es capacidad sin usar y de
           eso ya avisa el diagnóstico del reparto.
           Y sólo lo que la sierra puede hacer (ADR-407): ofrecer «reprocesá
           paquetería en comercial» es ofrecer agrandar la madera. */
        if (mismoTipo(desdeTipo, f.label)) continue;
        if (!puedeReprocesarse(desdeTipo, f.label)) continue;
        const disponibleM3 = r4(bloques.reduce((a, b) => a + b.libreM3, 0));
        if (!(disponibleM3 > EPS)) continue;
        const convertirM3 = r4(Math.min(disponibleM3, f.m3));
        if (!(convertirM3 > EPS)) continue;
        out.push({
          especie: e.especie,
          motivo: "faltante",
          desdeTipo,
          haciaTipo: f.label,
          disponibleM3,
          faltanteM3: r4(f.m3),
          faltantePiezas: f.piezas,
          piezasDesde: piezasDe(bloques),
          m3Desde: r4(bloques.reduce((a, b) => a + b.m3, 0)),
          /* Las medidas del FALTANTE: son las piezas que están esperando
             respaldo, con su escuadría. */
          medidas: f.medidas.filter((m) => m.piezas > 0),
          convertirM3,
          cubreTodo: disponibleM3 + EPS >= f.m3,
          restaM3: r4(Math.max(0, f.m3 - convertirM3)),
          sobraM3: r4(Math.max(0, disponibleM3 - convertirM3)),
          aprovechaPct: disponibleM3 > 0 ? r2((convertirM3 / disponibleM3) * 100) : 0,
          bloques,
        });
      }
    }

    /* Motivo 2: el bloque ya está amparando piezas de OTRO tipo. No hace falta
       que sobre capacidad —al contrario, acá está toda usada—: lo que falta es
       declarar el reproceso que ese respaldo está dando por hecho. */
    for (const b of e.bloques) {
      const tipo = tipoDelBloque(b.bloque);
      if (!tipo) continue;
      for (const g of b.asignado) {
        if (!(g.m3 > EPS) || mismoTipo(tipo, g.label)) continue;
        /* Lo que el bloque ampara PERO no puede salir de él no es un reproceso
           a declarar: es un respaldo imposible, y sale por `amparosImposibles`
           como advertencia. Declararlo sería firmar que la sierra agrandó la
           madera (ADR-407). */
        if (!puedeReprocesarse(tipo, g.label)) continue;
        out.push({
          especie: e.especie,
          motivo: "amparado",
          desdeTipo: tipo,
          haciaTipo: g.label,
          /* Para amparar ese volumen hace falta al menos ese volumen de
             origen: el reproceso no crea madera. */
          disponibleM3: r4(g.m3),
          faltanteM3: r4(g.m3),
          faltantePiezas: g.piezas,
          piezasDesde: b.bloque.piezasOrigen ?? b.bloque.piezasManual ?? null,
          m3Desde: r4(Number(b.bloque.m3) || 0),
          /* Las medidas que ese bloque YA está amparando de este tipo. */
          medidas: g.medidas.filter((m) => m.piezas > 0),
          convertirM3: r4(g.m3),
          cubreTodo: true,
          restaM3: 0,
          sobraM3: 0,
          aprovechaPct: 100,
          bloques: [
            {
              id: b.bloque.id,
              etiqueta: etiquetaSinRecorte(b.bloque.etiqueta),
              permiso: (b.bloque.permiso ?? "").trim() || null,
              usadoM3: r4(b.usadoM3),
              mismoTipoM3: propio.get(b.bloque.id)?.m3 ?? 0,
              mismoTipoPiezas: propio.get(b.bloque.id)?.piezas ?? 0,
              m3: r4(Number(b.bloque.m3) || 0),
              libreM3: r4(b.libreM3),
              piezas: b.bloque.piezasOrigen ?? b.bloque.piezasManual ?? null,
            },
          ],
        });
      }
    }
  }

  return out
    .filter((s) => s.convertirM3 >= MINIMO_SUGERIBLE_M3)
    .sort((a, b) => b.convertirM3 - a.convertirM3);
}

/**
 * Un respaldo que la sierra no puede sostener: el bloque ampara un tipo que de
 * él NO sale (ADR-407).
 *
 * No es un reproceso pendiente —no hay reproceso que declarar— es un **error
 * del respaldo**: o el bloque de origen no es el que corresponde, o el tipo de
 * esas piezas está mal puesto. Se muestra aparte y en rojo porque, a diferencia
 * de un reproceso sin declarar, no hay forma de arreglarlo firmando: hay que
 * corregir la distribución antes del papel.
 */
export interface AmparoImposible {
  especie: string;
  bloqueId: string;
  etiqueta: string;
  permiso: string | null;
  /** El tipo del bloque que está respaldando. */
  desdeTipo: string;
  /** El tipo de las piezas que ampara y que de ahí no pueden salir. */
  haciaTipo: string;
  m3: number;
  piezas: number;
  /** Las escuadrías involucradas, para ir a buscarlas en la tabla. */
  medidas: AsignacionMedida[];
  /** Por qué no se puede, en la lengua del patio. */
  porque: string;
}

/**
 * Los respaldos imposibles de toda la distribución.
 *
 * Va aparte de `sugerenciasDeReproceso` a propósito: son dos preguntas
 * distintas —«qué reproceso me falta declarar» y «qué respaldo no se sostiene»—
 * y mezclarlas en una lista fue justamente lo que hacía que la pantalla
 * ofreciera declarar una conversión imposible.
 */
export function amparosImposibles(d: Distribucion): AmparoImposible[] {
  const out: AmparoImposible[] = [];
  for (const e of d.especies) {
    for (const b of e.bloques) {
      const tipo = tipoDelBloque(b.bloque);
      if (!tipo) continue;
      for (const g of b.asignado) {
        if (!(g.m3 > EPS) || mismoTipo(tipo, g.label)) continue;
        if (puedeReprocesarse(tipo, g.label)) continue;
        out.push({
          especie: e.especie,
          bloqueId: b.bloque.id,
          etiqueta: etiquetaSinRecorte(b.bloque.etiqueta),
          permiso: (b.bloque.permiso ?? "").trim() || null,
          desdeTipo: tipo,
          haciaTipo: g.label,
          m3: r4(g.m3),
          piezas: g.piezas,
          medidas: g.medidas.filter((m) => m.piezas > 0),
          porque: porQueNoSePuede(tipo, g.label) ?? "",
        });
      }
    }
  }
  /* Lo más grande primero: es la madera que más pesa en el papel. */
  return out.sort((a, b) => b.m3 - a.m3);
}

/** El permiso de los bloques, si TODOS declaran el mismo. Si no, `null`. */
function unicoPermiso(bloques: readonly BloqueOrigen[]): string | null {
  const unicos = [...new Set(bloques.map((b) => b.permiso).filter((p): p is string => !!p))];
  return unicos.length === 1 ? unicos[0] : null;
}

/** Piezas de los bloques de origen: `null` si alguno no las declara (no se estima). */
function piezasDe(bloques: readonly BloqueOrigen[]): number | null {
  if (bloques.some((b) => b.piezas == null)) return null;
  const total = bloques.reduce((a, b) => a + (b.piezas ?? 0), 0);
  return total > 0 ? total : null;
}

/** Dos etiquetas de tipo son la misma sin importar tildes ni mayúsculas. */
function mismoTipo(a: string, b: string): boolean {
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return norm(a) === norm(b);
}

/** Una salida del reproceso: en qué tipo se convierte y cuánto. */
export interface DestinoDeReproceso {
  tipo: string;
  m3: number;
  piezas: number;
  motivo: MotivoSugerencia;
  cubreTodo: boolean;
  /** Lo que seguiría faltando de ese tipo (sólo en las opciones). */
  restaM3: number;
  /** Con qué escuadrías: lo que el aserrador necesita para cortar. */
  medidas: AsignacionMedida[];
}

/**
 * Todo lo que sale de UN producto original, junto.
 *
 * Brandon, 2026-09-09: «quiero el producto original con su m³ y su cantidad, y
 * lo que se produce de él: de 1.200 de comercial, paquetería larga 1.100 y
 * paquetería corta 0.050». Una línea suelta por par origen→destino no deja ver
 * eso; agrupado por origen, sí — y ahí se lee de una que la suma de las salidas
 * es MENOR que lo que entró.
 *
 * Las salidas van en dos grupos porque no se comportan igual:
 *  · `amparados` **se suman**: el bloque ya está respaldando esas piezas, todas
 *    a la vez. Es lo que hay que declarar.
 *  · `opciones` **compiten**: cada una podría usar la misma capacidad libre, así
 *    que se elige una. Sumarlas diría que con 0.724 m³ se tapan tres huecos.
 */
export interface GrupoDeReproceso {
  clave: string;
  especie: string;
  /** El tipo del producto original. */
  desdeTipo: string;
  /** De qué bloque(s) sale. */
  etiquetas: string[];
  /**
   * El N° de permiso del producto original — **uno solo**, el que declara el
   * bloque (Brandon, 2026-09-09: «poné el permiso según el N° de permiso de
   * Productos disponibles, y poné sólo uno porque dos no tienen sentido»). Si
   * los bloques del grupo declaran permisos distintos queda `null`: elegir uno
   * sería decir que esa madera salió de un título que no se sabe cuál es.
   */
  permiso: string | null;
  /** m³ del original — el tamaño de lo que hay. */
  origenM3: number;
  origenPiezas: number | null;
  /** Capacidad del original que todavía no respalda nada. */
  libreM3: number;
  amparados: DestinoDeReproceso[];
  opciones: DestinoDeReproceso[];
  /** m³ que salen del original (sólo lo ya amparado: eso es lo que ocurre hoy). */
  saleM3: number;
  salePiezas: number;
  /**
   * La suma de las opciones y si **entran todas juntas** en la capacidad libre.
   *
   * Brandon, 2026-09-09: «comercial 5 piezas 2.500 se puede reprocesar a
   * paquetería larga 56 piezas 1.500 m³ y otro por ejemplo larga angosta 19
   * piezas 0.800 m³». Ahí las dos salidas caben (1.500 + 0.800 ≤ 2.500) y
   * decirle «elegí una» sería falso. Compiten sólo cuando la suma se pasa de lo
   * libre — y entonces sí hay que elegir.
   */
  opcionesM3: number;
  opcionesPiezas: number;
  opcionesCabenJuntas: boolean;
  /**
   * Lo que el bloque ampara y **de él no puede salir** (ADR-407). No es
   * reproceso ni es de su mismo tipo: sin este renglón la cuenta del pie
   * —reproceso + mismo tipo = amparado— dejaría de cerrar y se leería como un
   * descuadre inventado.
   */
  imposibleM3: number;
  imposiblePiezas: number;
  /** Lo que quedaría del original después de esas salidas. */
  quedaM3: number;
  /** Todo lo que el bloque ampara — el mismo número de la tabla de bloques. */
  amparadoM3: number;
  /** De eso, lo que ampara de su MISMO tipo: no necesita reproceso. */
  mismoTipoM3: number;
  mismoTipoPiezas: number;
  /**
   * Lo que las salidas se pasan del original, si se pasan.
   *
   * No es un error de esta cuenta ni del reproceso: el reparto tiene un
   * **cierre por diferencia de medición** (hasta 3 piezas sueltas, 50 litros y
   * 1 % del bloque) para que las últimas tablas no queden huérfanas. Medido en
   * un caso real: un bloque de 2.500 m³ amparando 2.520. Se muestra como lo
   * que es en vez de decir «quedan 0.000», que taparía el detalle.
   */
  excedeM3: number;
}

/**
 * Junta las sugerencias por producto original.
 *
 * La clave es el BLOQUE cuando la sugerencia sale de uno solo —es el producto
 * que el operario tiene delante— y `especie|tipo` cuando varios bloques del
 * mismo tipo ofrecen la misma madera.
 */
export function agruparPorOrigen(
  sugerencias: readonly SugerenciaReproceso[],
  /**
   * Lo que esos mismos bloques amparan y no puede salir de ellos. Se pasa
   * aparte —no se recalcula— para que el pie del producto cierre contra el m³
   * que muestra la tabla de bloques.
   */
  imposibles: readonly AmparoImposible[] = [],
): GrupoDeReproceso[] {
  const grupos = new Map<string, GrupoDeReproceso>();
  for (const s of sugerencias) {
    const clave =
      s.bloques.length === 1 ? `b:${s.bloques[0].id}` : `t:${s.especie}|${s.desdeTipo}`;
    const g =
      grupos.get(clave) ??
      ({
        clave,
        especie: s.especie,
        desdeTipo: s.desdeTipo,
        etiquetas: s.bloques.map((b) => b.etiqueta).filter(Boolean),
        permiso: unicoPermiso(s.bloques),
        origenM3: s.m3Desde,
        origenPiezas: s.piezasDesde,
        libreM3: r4(s.bloques.reduce((a, b) => a + b.libreM3, 0)),
        amparados: [],
        opciones: [],
        saleM3: 0,
        salePiezas: 0,
        opcionesM3: 0,
        opcionesPiezas: 0,
        opcionesCabenJuntas: true,
        imposibleM3: 0,
        imposiblePiezas: 0,
        quedaM3: 0,
        excedeM3: 0,
        amparadoM3: r4(s.bloques.reduce((a, b) => a + b.usadoM3, 0)),
        mismoTipoM3: r4(s.bloques.reduce((a, b) => a + b.mismoTipoM3, 0)),
        mismoTipoPiezas: s.bloques.reduce((a, b) => a + b.mismoTipoPiezas, 0),
      } satisfies GrupoDeReproceso);
    const destino: DestinoDeReproceso = {
      tipo: s.haciaTipo,
      m3: s.convertirM3,
      piezas: s.faltantePiezas,
      motivo: s.motivo,
      cubreTodo: s.cubreTodo,
      restaM3: s.restaM3,
      medidas: s.medidas,
    };
    if (s.motivo === "amparado") g.amparados.push(destino);
    else g.opciones.push(destino);
    grupos.set(clave, g);
  }

  /* Lo que cada bloque ampara sin poder darlo. Se indexa por bloque porque un
     amparo es siempre de UNO —el grupo `t:` sólo existe para el faltante—. */
  const imposiblePorBloque = new Map<string, { m3: number; piezas: number }>();
  for (const i of imposibles) {
    const acc = imposiblePorBloque.get(i.bloqueId) ?? { m3: 0, piezas: 0 };
    imposiblePorBloque.set(i.bloqueId, {
      m3: acc.m3 + i.m3,
      piezas: acc.piezas + i.piezas,
    });
  }

  for (const g of grupos.values()) {
    g.amparados.sort((a, b) => b.m3 - a.m3);
    g.opciones.sort((a, b) => b.m3 - a.m3);
    /* Sólo lo YA amparado sale del original: las opciones son alternativas
       sobre la misma capacidad libre, y sumarlas inventaría madera. */
    g.saleM3 = r4(g.amparados.reduce((a, d) => a + d.m3, 0));
    g.salePiezas = g.amparados.reduce((a, d) => a + d.piezas, 0);
    /* Las opciones se suman sólo para PREGUNTAR si entran juntas — nunca se
       cuentan como madera que ya salió. */
    g.opcionesM3 = r4(g.opciones.reduce((a, d) => a + d.m3, 0));
    g.opcionesPiezas = g.opciones.reduce((a, d) => a + d.piezas, 0);
    g.opcionesCabenJuntas = g.opcionesM3 <= g.libreM3 + EPS;
    /* El amparo imposible sale del grupo del bloque (clave `b:`); un grupo de
       varios bloques no lo lleva, para no repartir a ojo lo que es de uno. */
    if (g.clave.startsWith("b:")) {
      const imp = imposiblePorBloque.get(g.clave.slice(2));
      g.imposibleM3 = r4(imp?.m3 ?? 0);
      g.imposiblePiezas = imp?.piezas ?? 0;
    }
    /* Lo que queda es lo que el bloque NO ampara: su m³ menos TODO lo amparado
       —el reproceso y lo de su mismo tipo—. Restarle sólo «lo que sale» daba un
       «quedan 0.803» sobre un bloque cuya tabla decía «ampara 3.077», y eso se
       lee como un descuadre cuando en realidad esos 0.8 están amparando
       comercial (su propio tipo). */
    g.quedaM3 = r4(Math.max(0, g.origenM3 - g.amparadoM3));
    g.excedeM3 = r4(Math.max(0, g.amparadoM3 - g.origenM3));
  }

  return [...grupos.values()].sort(
    (a, b) => b.saleM3 + b.libreM3 - (a.saleM3 + a.libreM3),
  );
}

export interface CuadreDeDistribucion {
  /** Aserrada cubicada que ningún bloque respalda. */
  faltaM3: number;
  faltaPiezas: number;
  /** De eso, lo que taparían los reprocesos sugeridos (sin contar dos veces un destino). */
  cubreReprocesoM3: number;
  /** Capacidad de bloques sin usar — la que ya está del lado correcto. */
  libreM3: number;
  /** Lo que quedaría sin respaldo después de reprocesar. */
  quedaM3: number;
}

/**
 * El cierre: qué falta, con qué se tapa y qué queda — todo en una cuenta.
 *
 * Es la pregunta que el operario hace al final («¿con esto cuadro?») y que
 * hasta ahora había que armar mirando tres bloques distintos de la pantalla.
 * El aporte de los reprocesos se cuenta **una vez por destino**: dos orígenes
 * para la misma paquetería no tapan el doble.
 */
export function cuadreDeDistribucion(
  totales: { faltanteM3: number; libreM3: number },
  faltantePiezas: number,
  sugerencias: readonly SugerenciaReproceso[],
): CuadreDeDistribucion {
  const porDestino = new Map<string, number>();
  for (const s of sugerencias) {
    if (s.motivo !== "faltante") continue;
    const k = `${s.especie}|${s.haciaTipo}`;
    /* El mejor aporte para ese destino, no la suma: los orígenes compiten por
       tapar el mismo hueco, no se acumulan sobre él. */
    porDestino.set(k, Math.max(porDestino.get(k) ?? 0, s.convertirM3));
  }
  const cubreReprocesoM3 = r4([...porDestino.values()].reduce((a, v) => a + v, 0));
  return {
    faltaM3: r4(totales.faltanteM3),
    faltaPiezas: faltantePiezas,
    cubreReprocesoM3,
    /* Un «libre» negativo de milésimas es ruido del reparto (overrides
       declarados a mano, redondeo de piezas enteras); mostrarlo como capacidad
       libre negativa confunde más de lo que informa, y de un descuadre real ya
       avisa la alerta del reparto. */
    libreM3: r4(Math.max(0, totales.libreM3)),
    quedaM3: r4(Math.max(0, totales.faltanteM3 - cubreReprocesoM3)),
  };
}

/** Cuántas sugerencias hay y cuánta madera está en juego — para el título. */
export function resumenDeSugerencias(s: readonly SugerenciaReproceso[]) {
  /* Una vez por destino y quedándose con el MAYOR: dos orígenes que ofrecen
     tapar el mismo hueco no lo tapan dos veces, y el último de la lista no
     tiene por qué ser el que más aporta. */
  const porDestino = new Map<string, number>();
  for (const x of s) {
    const k = `${x.especie}|${x.haciaTipo}`;
    porDestino.set(k, Math.max(porDestino.get(k) ?? 0, x.convertirM3));
  }
  return {
    cuantas: s.length,
    m3EnJuego: r4([...porDestino.values()].reduce((a, v) => a + v, 0)),
  };
}
