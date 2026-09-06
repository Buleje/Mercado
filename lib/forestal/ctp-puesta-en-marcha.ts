/**
 * ctp-puesta-en-marcha — qué del libro está construido y todavía sin estrenar.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * En una sola sesión de trabajo se buscaron cinco cosas para construir y cuatro
 * YA ESTABAN: la rentabilidad entera (ADR-141), el panel para cargar costos, el
 * cierre mensual (ADR-139) y hasta el aviso de «ingresos sin costo», cableado de
 * punta a punta. Ninguna se estaba usando, y no había forma de enterarse salvo
 * entrar a cada pestaña y verla vacía.
 *
 * Con un módulo de este tamaño, el riesgo ya no es que falte una capacidad: es
 * que esté ahí y nadie lo sepa. Esto lo mide.
 *
 * ── Qué NO es ──────────────────────────────────────────────────────────────
 * No es el checklist de cierre (`ctp-cierre-checklist`), que pregunta «¿conviene
 * cerrar ESTE mes?» y se responde todos los meses. Ni la lista de pendientes
 * (`ctp-pendientes`), que es el trabajo de hoy. Esto se responde UNA vez por
 * capacidad y después calla para siempre: es estructural, no operativo.
 *
 * ── La regla que lo hace útil ──────────────────────────────────────────────
 * Cada capacidad se juzga por el DATO, no por si la pantalla existe. «Tenés la
 * pestaña de rentabilidad» no le sirve a nadie; «0 de 3 ingresos con costo, así
 * que ningún despacho va a poder decir su margen» sí. Y una capacidad que no
 * aplica todavía —despachar cuando no hay producto— no se muestra como deuda:
 * se calla hasta que tenga sentido.
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

export type EstadoCapacidad = "en_uso" | "a_medias" | "sin_estrenar" | "no_aplica";

export interface Capacidad {
  clave: string;
  /** Cómo se llama en el libro. */
  titulo: string;
  /** Qué te da cuando la usás. En una línea, en términos del negocio. */
  queDa: string;
  estado: EstadoCapacidad;
  /** El número que lo prueba. Sin esto es una opinión. */
  medida: string;
  /** Qué hacer, en imperativo. `null` cuando ya está en uso. */
  paso: string | null;
  /** Pestaña del libro donde se activa. */
  vista: string;
  /** Qué otras capacidades quedan bloqueadas mientras ésta no arranque. */
  desbloquea?: string[];
}

export interface DatosPuestaEnMarcha {
  ingresos: { total: number; sinCosto: number; sinConstancia: number; conPiezas: number };
  produccion: { corridas: number; sinDeclarar: number; conPaquetes: number };
  despachos: { total: number; sinGtf: number; conVenta: number; conAnexo: number };
  /** Meses cerrados (ADR-139). */
  cierres: number;
  /** Producto terminado disponible: define si «despachar» ya aplica. */
  stockDisponibleM3: number;
  ficha: { tieneIdentidad: boolean; tieneSerieGtf: boolean };
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Estado de una capacidad medida sobre «cuántos de N la tienen».
 *
 * Sin universo (`total === 0`) NO es «sin estrenar»: es que todavía no aplica.
 * Marcar como deuda algo que no tiene sobre qué aplicarse llena la lista de
 * rojos que nadie puede resolver, y esa lista se deja de leer.
 */
function porCobertura(conElDato: number, total: number): EstadoCapacidad {
  if (total === 0) return "no_aplica";
  if (conElDato === 0) return "sin_estrenar";
  return conElDato >= total ? "en_uso" : "a_medias";
}

export function capacidadesDelLibro(d: DatosPuestaEnMarcha): Capacidad[] {
  const { ingresos: i, produccion: p, despachos: s } = d;
  const conCosto = i.total - i.sinCosto;
  const conConstancia = i.total - i.sinConstancia;
  const conGtf = s.total - s.sinGtf;

  const todas: Capacidad[] = [
    {
      clave: "ficha",
      titulo: "Ficha del CTP",
      queDa: "Tu identidad en los papeles: razón social, código de CTP y la serie de GTF que autorizó la ARFFS.",
      estado: d.ficha.tieneIdentidad && d.ficha.tieneSerieGtf ? "en_uso" : d.ficha.tieneIdentidad ? "a_medias" : "sin_estrenar",
      medida: !d.ficha.tieneIdentidad
        ? "sin identidad cargada"
        : d.ficha.tieneSerieGtf
          ? "identidad y serie de GTF cargadas"
          : "identidad cargada, falta la serie de GTF",
      paso: d.ficha.tieneIdentidad && d.ficha.tieneSerieGtf ? null : "Completá la Ficha: sin la serie autorizada no se puede emitir una guía de salida.",
      vista: "ficha",
      desbloquea: d.ficha.tieneSerieGtf ? undefined : ["Guías de salida"],
    },
    {
      clave: "ingresos",
      titulo: "Ingresos de madera",
      queDa: "El origen legal de todo: sin la guía de entrada, nada de lo que salga se puede amparar.",
      estado: i.total > 0 ? "en_uso" : "sin_estrenar",
      medida: i.total > 0 ? `${plural(i.total, "guía cargada", "guías cargadas")}` : "todavía sin guías",
      paso: i.total > 0 ? null : "Cargá la primera guía de ingreso.",
      vista: "ingresos",
      desbloquea: i.total > 0 ? undefined : ["Todo lo demás"],
    },
    {
      clave: "piezas",
      titulo: "Trozas pieza por pieza",
      queDa: "Contar el patio como lo cuenta un fiscalizador: por palo, no por metro cúbico.",
      estado: porCobertura(i.conPiezas, i.total),
      medida: i.total === 0 ? "sin ingresos todavía" : `${i.conPiezas} de ${plural(i.total, "guía", "guías")} con sus piezas`,
      paso: i.conPiezas >= i.total ? null : "Cargá la lista de trozas de las guías que faltan.",
      vista: "trozas",
    },
    {
      clave: "costos",
      titulo: "Costo de la madera",
      queDa: "La mitad de la cuenta: sin lo que se pagó, ningún despacho puede decir cuánto dejó.",
      estado: porCobertura(conCosto, i.total),
      medida: i.total === 0 ? "sin ingresos todavía" : `${conCosto} de ${plural(i.total, "guía valorizada", "guías valorizadas")} (${pct(conCosto, i.total)} %)`,
      paso: conCosto >= i.total ? null : "Cargá lo que pagaste por cada guía en Rentabilidad.",
      vista: "rentabilidad",
      desbloquea: conCosto > 0 ? undefined : ["Margen por despacho", "Rentabilidad del período"],
    },
    {
      clave: "sniffs",
      titulo: "Constancia del SNIFFS",
      queDa: "Poder probar que SERFOR conoce tus guías. Es lo primero que se pide en una fiscalización.",
      estado: porCobertura(conConstancia, i.total),
      medida: i.total === 0 ? "sin ingresos todavía" : `${conConstancia} de ${plural(i.total, "guía", "guías")} con constancia`,
      paso: conConstancia >= i.total ? null : "Consultá cada guía en el SNIFFS y guardá su constancia.",
      vista: "ingresos",
    },
    {
      clave: "produccion",
      titulo: "Producción declarada",
      queDa: "Qué salió de la sierra: sin esto el consumo queda a medias y el rendimiento no se puede calcular.",
      estado: p.corridas === 0 ? "sin_estrenar" : p.sinDeclarar > 0 ? "a_medias" : "en_uso",
      medida:
        p.corridas === 0
          ? "todavía sin corridas"
          : p.sinDeclarar > 0
            ? `${plural(p.sinDeclarar, "corrida", "corridas")} sin declarar de ${p.corridas}`
            : `${plural(p.corridas, "corrida declarada", "corridas declaradas")}`,
      paso: p.corridas > 0 && p.sinDeclarar === 0 ? null : "Declará qué salió de las corridas abiertas.",
      vista: "produccion",
    },
    {
      clave: "despachos",
      titulo: "Guías de salida",
      queDa: "La única forma legal de que la madera salga de la planta, con tu serie y correlativo.",
      /* Tres situaciones distintas, y confundirlas escondía la más importante:
         sin producto Y sin despachos, despachar no aplica (no es deuda); con
         producto listo y NINGUNA guía emitida, sí es deuda —es exactamente el
         caso que hay que ver—; con despachos, se mide la cobertura.
         `porCobertura` sola devolvía «no aplica» para el caso del medio, porque
         su universo son los despachos y ahí todavía no hay ninguno. */
      estado:
        d.stockDisponibleM3 <= 0 && s.total === 0
          ? "no_aplica"
          : s.total === 0
            ? "sin_estrenar"
            : porCobertura(conGtf, s.total),
      medida:
        s.total === 0
          ? d.stockDisponibleM3 > 0
            ? `${d.stockDisponibleM3.toFixed(2)} m³ listos y ninguna guía emitida`
            : "todavía no hay producto que despachar"
          : `${conGtf} de ${plural(s.total, "despacho", "despachos")} con GTF`,
      paso: s.total === 0 && d.stockDisponibleM3 > 0 ? "Emití la primera guía de salida." : conGtf >= s.total ? null : "Emití la GTF de los despachos que faltan.",
      vista: "despacho",
    },
    {
      clave: "venta",
      titulo: "Precio de venta",
      queDa: "La otra mitad de la cuenta. Con el costo cargado, es lo que cierra el margen.",
      estado: porCobertura(s.conVenta, s.total),
      medida: s.total === 0 ? "sin despachos todavía" : `${s.conVenta} de ${plural(s.total, "despacho", "despachos")} con precio`,
      paso: s.conVenta >= s.total ? null : "Cargá el precio de venta de cada despacho.",
      vista: "rentabilidad",
    },
    {
      clave: "anexo04",
      titulo: "ANEXO N° 04",
      queDa: "La lista de productos transformados que acompaña a la guía de salida.",
      estado: porCobertura(s.conAnexo, s.total),
      medida: s.total === 0 ? "sin despachos todavía" : `${s.conAnexo} de ${plural(s.total, "despacho", "despachos")} con anexo`,
      paso: s.conAnexo >= s.total ? null : "Emití el anexo de los despachos que faltan.",
      vista: "despacho",
    },
    {
      clave: "cierre",
      titulo: "Cierre mensual",
      queDa: "Lo que convierte la consulta en libro: congela el mes y hereda su saldo al siguiente.",
      /* Sin nada registrado no hay mes que cerrar. */
      estado: d.cierres > 0 ? "en_uso" : i.total === 0 && p.corridas === 0 ? "no_aplica" : "sin_estrenar",
      medida: d.cierres > 0 ? `${plural(d.cierres, "mes cerrado", "meses cerrados")}` : "ningún mes cerrado",
      paso: d.cierres > 0 ? null : "Cerrá el primer mes: sin cierres, cada período arranca en cero.",
      vista: "cierre",
      desbloquea: d.cierres > 0 ? undefined : ["Existencia de apertura heredada"],
    },
  ];

  /* Se ocultan las que no aplican: una lista con deudas imposibles se deja de
     leer, y la que no aplica hoy va a aparecer sola cuando aplique. */
  return todas.filter((c) => c.estado !== "no_aplica");
}

export interface ResumenPuestaEnMarcha {
  enUso: number;
  aMedias: number;
  sinEstrenar: number;
  total: number;
  /** 0-100. Cuánto del libro está realmente en funcionamiento. */
  pct: number;
  /** Una línea honesta para el encabezado. */
  frase: string;
}

export function resumirPuestaEnMarcha(caps: readonly Capacidad[]): ResumenPuestaEnMarcha {
  const enUso = caps.filter((c) => c.estado === "en_uso").length;
  const aMedias = caps.filter((c) => c.estado === "a_medias").length;
  const sinEstrenar = caps.filter((c) => c.estado === "sin_estrenar").length;
  const total = caps.length;
  /* Media capacidad cuenta medio: con «a medias» valiendo 1 el porcentaje
     miente hacia arriba, y con 0 castiga a quien ya arrancó. */
  const pctVal = total > 0 ? Math.round(((enUso + aMedias * 0.5) / total) * 100) : 0;
  return {
    enUso,
    aMedias,
    sinEstrenar,
    total,
    pct: pctVal,
    frase:
      sinEstrenar === 0 && aMedias === 0
        ? "El libro está funcionando entero."
        : sinEstrenar > 0
          ? `${plural(sinEstrenar, "parte del libro está construida y sin estrenar", "partes del libro están construidas y sin estrenar")}.`
          : `${plural(aMedias, "parte", "partes")} a medio arrancar.`,
  };
}
