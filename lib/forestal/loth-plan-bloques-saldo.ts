/**
 * El saldo de cada bloque o zona del plan (Brandon 25-10: «en la sección por
 * bloque quiero las guías usadas en cada uno, el saldo y otros detalles; si se
 * pasa del volumen en un bloque, una advertencia para ver y corregir»).
 *
 * De dónde sale cada cifra de un bloque, por especie:
 *  · autorizado = lo que dice el reparto por bloque (`loth-plan-bloques:`);
 *  · usado = lo REGISTRADO en el libro (el mismo m³ que mide el freno) de las
 *    guías cuyo bloque se sabe con certeza. Medido 25-10: el libro NO guarda el
 *    bloque (despacho → troza → árbol → censo llegó a 30 de 91 árboles y a 0
 *    parcelas). Lo único que lo dice es la GTF preliminar con el mismo N.º:
 *    la persona escribió ahí de qué bloque salió cada especie. Si esa
 *    preliminar trae la especie en un solo bloque, lo del libro va a ese
 *    bloque; si la reparte en varios, sólo si los m³ del libro son los de la
 *    preliminar (si no, partirlos sería inventar). Lo demás queda «sin bloque
 *    asignado», aparte y con su motivo: nunca se reparte a ojo.
 *  · pendiente = las preliminares que todavía descuentan (`cuenta`), con su bloque.
 *  · saldo = autorizado − usado; si se registran = saldo − pendiente.
 *  · se pasa = usado + pendiente > autorizado con `excedeTechoM3` (3 decimales,
 *    la misma tolerancia del freno). Es un AVISO: el freno legal (T6) no lee
 *    esto y sigue midiendo por especie del plan.
 *
 * Puro: sin base ni React. Lo calcula el servidor (`ForestPlanPreliminaresDB.delPlan`)
 * y la ventana de la preliminar lo previsualiza con esta misma función.
 */
import { claveEspecie } from "./loth-constants";
import { claveDeNumeroGtf, type EspecieDelSaldo, type GtfPreliminarVista, type LineaPreliminar } from "./loth-plan-preliminares";
import { excedeTechoM3 } from "./loth-t6";

/* `|| 0`: un −0,0004 redondea a −0 y la tarjeta decía «-0.000 m³». */
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000 || 0;

/** Lo que el saldo dice que se llevó una guía de una especie (`UsoDeLaGuia` + su guía). */
export interface UsoParaBloques {
  gtfNumber: string | null;
  m3: number;
  trozas: number;
  sinPlan: boolean;
  gtfId?: string | null;
}

export type EspecieConUsos = EspecieDelSaldo & { guias?: readonly UsoParaBloques[] };

/** Lo autorizado de un bloque (la forma de `BloqueDelPlan`, sólo lo que se usa acá). */
export interface BloqueAutorizado {
  nombre: string;
  especies: readonly { speciesCommon: string; volumenM3: number }[];
}

/**
 * registrada = está en el libro y ya descuenta · pendiente = preliminar que
 * descuenta en «si se registran» · sin_descontar = preliminar marcada como
 * registrada (o ya en el libro) cuyo despacho todavía no descuenta en el libro.
 */
export type EstadoGuiaDelBloque = "registrada" | "pendiente" | "sin_descontar";

export interface GuiaDelBloque {
  key: string;
  /** `null` = despachos del libro sin N.º de guía. */
  numeroGtf: string | null;
  numerosLt: string[];
  clave: string;
  especie: string;
  trozas: number;
  m3: number;
  estado: EstadoGuiaDelBloque;
  /** La preliminar de esa guía (para ir a corregirla o anularla). */
  preliminarId: string | null;
  gtfId: string | null;
}

export interface EspecieEnElBloque {
  clave: string;
  especie: string;
  /** Lo del reparto; 0 = esa especie no está en este bloque. */
  autorizadoM3: number;
  /** Está en el reparto de este bloque. */
  enElReparto: boolean;
  usadoM3: number;
  usadoTrozas: number;
  pendienteM3: number;
  pendienteTrozas: number;
  quedaM3: number;
  quedaSiSeRegistranM3: number;
  /** usado + pendiente pasa lo autorizado del bloque. */
  excede: boolean;
  /** Ya lo pasa con lo registrado solo (no lo arregla anular una preliminar). */
  excedeHoy: boolean;
  /** Cuánto lo pasa (> 0) si `excede`; si no, 0. */
  pasaPorM3: number;
}

export interface SaldoDelBloque {
  nombre: string;
  especies: EspecieEnElBloque[];
  total: { autorizadoM3: number; usadoM3: number; pendienteM3: number; quedaM3: number; quedaSiSeRegistranM3: number };
  excede: boolean;
  guias: GuiaDelBloque[];
}

export type MotivoSinBloque = "sin_numero" | "sin_preliminar" | "otra_especie" | "varios_bloques" | "bloque_no_existe";

export type GuiaSinBloque = GuiaDelBloque & { motivo: MotivoSinBloque };

/** Lo de una especie que no se sabe de qué bloque salió: cuenta en el saldo del PLAN, no en el de un bloque. */
export interface EspecieSinBloque {
  clave: string;
  especie: string;
  usadoM3: number;
  pendienteM3: number;
  guias: GuiaSinBloque[];
}

export interface ExcesoDeBloque {
  bloque: string;
  clave: string;
  especie: string;
  autorizadoM3: number;
  usadoM3: number;
  pendienteM3: number;
  pasaPorM3: number;
  enElReparto: boolean;
  /** Lo registrado solo ya lo pasa. */
  excedeHoy: boolean;
  /** Las preliminares pendientes de ese bloque y especie: las que se corrigen o anulan. */
  preliminarIds: string[];
}

export interface SaldoPorBloques {
  /** El reparto tal cual (para que la ventana previsualice con esta misma función). */
  reparto: BloqueAutorizado[];
  bloques: SaldoDelBloque[];
  sinBloque: { especies: EspecieSinBloque[]; usadoM3: number; pendienteM3: number };
  excesos: ExcesoDeBloque[];
}

export const SIN_BLOQUES: SaldoPorBloques = { reparto: [], bloques: [], sinBloque: { especies: [], usadoM3: 0, pendienteM3: 0 }, excesos: [] };

interface Acc {
  clave: string;
  especie: string;
  autorizadoM3: number;
  enElReparto: boolean;
  usadoM3: number;
  usadoTrozas: number;
  pendienteM3: number;
  pendienteTrozas: number;
}

const ORDEN_ESTADO: Record<EstadoGuiaDelBloque, number> = { pendiente: 0, registrada: 1, sin_descontar: 2 };
const porNumero = (a: GuiaDelBloque, b: GuiaDelBloque) =>
  ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || (a.numeroGtf ?? "").localeCompare(b.numeroGtf ?? "", "es", { numeric: true }) || a.especie.localeCompare(b.especie, "es");

type Preliminar = Pick<GtfPreliminarVista, "id" | "numeroGtf" | "numerosLt" | "estado" | "cuenta" | "lineas" | "gtfId">;

/**
 * El saldo de cada bloque, lo sin bloque y lo que se pasa. Sin reparto
 * (`reparto` vacío) no hay bloques: `SIN_BLOQUES` (el saldo es el del plan).
 */
export function saldoPorBloques(reparto: readonly BloqueAutorizado[], especies: readonly EspecieConUsos[], preliminares: readonly Preliminar[]): SaldoPorBloques {
  if (reparto.length === 0) return SIN_BLOQUES;
  const nombreDe = new Map(reparto.map((b) => [b.nombre.trim().toLowerCase(), b.nombre.trim()]));
  const bloqueDe = (b: string | null | undefined) => (b ? nombreDe.get(b.trim().toLowerCase()) ?? null : null);
  const nombreDeEspecie = new Map(especies.map((e) => [e.clave || claveEspecie(e.especie), e.especie]));

  const accs = new Map<string, Map<string, Acc>>();
  const guiasDe = new Map<string, GuiaDelBloque[]>(reparto.map((b) => [b.nombre.trim(), []]));
  const accDe = (bloque: string, clave: string, especie: string): Acc => {
    const delBloque = accs.get(bloque) ?? new Map<string, Acc>();
    accs.set(bloque, delBloque);
    const a = delBloque.get(clave) ?? {
      clave, especie: nombreDeEspecie.get(clave) ?? especie, autorizadoM3: 0, enElReparto: false, usadoM3: 0, usadoTrozas: 0, pendienteM3: 0, pendienteTrozas: 0,
    };
    delBloque.set(clave, a);
    return a;
  };
  for (const b of reparto) {
    for (const e of b.especies) {
      const k = claveEspecie(e.speciesCommon);
      if (!k) continue;
      const a = accDe(b.nombre.trim(), k, e.speciesCommon.trim());
      a.autorizadoM3 = r3(a.autorizadoM3 + e.volumenM3);
      a.enElReparto = true;
    }
  }

  const sinBloque = new Map<string, EspecieSinBloque>();
  const aSinBloque = (clave: string, especie: string) => {
    const s = sinBloque.get(clave) ?? { clave, especie: nombreDeEspecie.get(clave) ?? especie, usadoM3: 0, pendienteM3: 0, guias: [] };
    sinBloque.set(clave, s);
    return s;
  };

  /* Las preliminares que pueden decir el bloque de una guía del libro: vivas y que ya no
     descuentan (las que descuentan no están en el libro, por cómo se calcula `cuenta`). */
  const delLibroPorClave = new Map<string, Preliminar>();
  for (const p of preliminares) {
    const k = claveDeNumeroGtf(p.numeroGtf);
    if (k && p.estado !== "anulada" && !p.cuenta && !delLibroPorClave.has(k)) delLibroPorClave.set(k, p);
  }
  /** «guía|especie» de las líneas de preliminar que encontraron su m³ en el libro. */
  const consumidas = new Set<string>();

  for (const e of especies) {
    const clave = e.clave || claveEspecie(e.especie);
    if (!clave) continue;
    const usos = e.guias ?? [];
    /* Mismo N.º en una guía del plan y en una sin plan: la del plan es la de la preliminar
       (como `guiaDelLibroDe`); la otra es de otro titular. */
    const conPlan = new Set(usos.filter((u) => !u.sinPlan).map((u) => claveDeNumeroGtf(u.gtfNumber)));
    let atribuido = 0;
    for (const [i, u] of usos.entries()) {
      const k = claveDeNumeroGtf(u.gtfNumber);
      const base = { numeroGtf: u.gtfNumber, clave, especie: e.especie, estado: "registrada" as const, gtfId: u.gtfId ?? null };
      const p = k && !(u.sinPlan && conPlan.has(k)) ? delLibroPorClave.get(k) : undefined;
      const lineas = p ? p.lineas.filter((l) => claveEspecie(l.especie) === clave) : [];
      const bloques = lineas.map((l) => bloqueDe(l.bloque));
      let motivo: MotivoSinBloque | null = null;
      if (!k) motivo = "sin_numero";
      else if (!p) motivo = "sin_preliminar";
      else if (lineas.length === 0) motivo = "otra_especie";
      else if (bloques.some((b) => b == null)) motivo = "bloque_no_existe";
      else if (lineas.length > 1 && r3(u.m3) !== r3(lineas.reduce((a, l) => a + l.m3, 0))) motivo = "varios_bloques";
      if (motivo || !p) {
        aSinBloque(clave, e.especie).guias.push({ ...base, key: `u${i}|${clave}|${k ?? "-"}`, numerosLt: p?.numerosLt ?? [], trozas: u.trozas, m3: r3(u.m3), preliminarId: p?.id ?? null, motivo: motivo ?? "sin_preliminar" });
        continue;
      }
      consumidas.add(`${p.id}|${clave}`);
      const partes = lineas.length === 1 ? [{ bloque: bloques[0]!, m3: u.m3, trozas: u.trozas }] : lineas.map((l, j) => ({ bloque: bloques[j]!, m3: l.m3, trozas: l.trozas }));
      for (const parte of partes) {
        const a = accDe(parte.bloque, clave, e.especie);
        a.usadoM3 = r3(a.usadoM3 + parte.m3);
        a.usadoTrozas += parte.trozas;
        atribuido = r3(atribuido + parte.m3);
        guiasDe.get(parte.bloque)?.push({ ...base, key: `u${i}|${clave}|${k}|${parte.bloque}`, numerosLt: p.numerosLt, trozas: parte.trozas, m3: r3(parte.m3), preliminarId: p.id });
      }
    }
    /* Lo del libro que no se pudo atar a un bloque (incluye lo que el freno mide sin guía). */
    const resto = r3(e.usadoM3 - atribuido);
    if (resto > 0) aSinBloque(clave, e.especie).usadoM3 = resto;
  }

  for (const p of preliminares) {
    if (p.estado === "anulada") continue;
    for (const [j, l] of p.lineas.entries()) {
      const clave = claveEspecie(l.especie);
      if (!clave) continue;
      const estado: EstadoGuiaDelBloque | null = p.cuenta ? "pendiente" : consumidas.has(`${p.id}|${clave}`) ? null : "sin_descontar";
      if (!estado) continue;
      const bloque = bloqueDe(l.bloque);
      const guia: GuiaDelBloque = { key: `p${p.id}|${j}`, numeroGtf: p.numeroGtf, numerosLt: p.numerosLt, clave, especie: nombreDeEspecie.get(clave) ?? l.especie, trozas: l.trozas, m3: r3(l.m3), estado, preliminarId: p.id, gtfId: p.gtfId };
      if (!bloque) {
        const s = aSinBloque(clave, l.especie);
        if (estado === "pendiente") s.pendienteM3 = r3(s.pendienteM3 + l.m3);
        s.guias.push({ ...guia, motivo: "bloque_no_existe" });
        continue;
      }
      if (estado === "pendiente") {
        const a = accDe(bloque, clave, l.especie);
        a.pendienteM3 = r3(a.pendienteM3 + l.m3);
        a.pendienteTrozas += l.trozas;
      }
      guiasDe.get(bloque)?.push(guia);
    }
  }

  const excesos: ExcesoDeBloque[] = [];
  const bloques: SaldoDelBloque[] = reparto.map((b) => {
    const nombre = b.nombre.trim();
    const filas = [...(accs.get(nombre)?.values() ?? [])].map((a): EspecieEnElBloque => {
      const quedaM3 = r3(a.autorizadoM3 - a.usadoM3);
      const excede = excedeTechoM3(a.usadoM3 + a.pendienteM3, a.autorizadoM3);
      return {
        ...a,
        quedaM3,
        quedaSiSeRegistranM3: r3(quedaM3 - a.pendienteM3),
        excede,
        excedeHoy: excedeTechoM3(a.usadoM3, a.autorizadoM3),
        pasaPorM3: excede ? r3(r3(a.usadoM3 + a.pendienteM3) - r3(a.autorizadoM3)) : 0,
      };
    });
    const guias = (guiasDe.get(nombre) ?? []).sort(porNumero);
    for (const f of filas.filter((x) => x.excede)) {
      excesos.push({
        bloque: nombre,
        clave: f.clave,
        especie: f.especie,
        autorizadoM3: f.autorizadoM3,
        usadoM3: f.usadoM3,
        pendienteM3: f.pendienteM3,
        pasaPorM3: f.pasaPorM3,
        enElReparto: f.enElReparto,
        excedeHoy: f.excedeHoy,
        preliminarIds: [...new Set(guias.filter((g) => g.estado === "pendiente" && g.clave === f.clave && g.preliminarId).map((g) => g.preliminarId as string))],
      });
    }
    const suma = (k: "autorizadoM3" | "usadoM3" | "pendienteM3") => r3(filas.reduce((s, f) => s + f[k], 0));
    const autorizadoM3 = suma("autorizadoM3");
    const usadoM3 = suma("usadoM3");
    const pendienteM3 = suma("pendienteM3");
    return {
      nombre,
      especies: filas,
      total: { autorizadoM3, usadoM3, pendienteM3, quedaM3: r3(autorizadoM3 - usadoM3), quedaSiSeRegistranM3: r3(autorizadoM3 - usadoM3 - pendienteM3) },
      excede: filas.some((f) => f.excede),
      guias,
    };
  });

  const sin = [...sinBloque.values()].filter((s) => s.usadoM3 > 0 || s.pendienteM3 > 0 || s.guias.length > 0).map((s) => ({ ...s, guias: s.guias.sort(porNumero) }));
  return {
    reparto: reparto.map((b) => ({ nombre: b.nombre.trim(), especies: b.especies.map((e) => ({ speciesCommon: e.speciesCommon, volumenM3: e.volumenM3 })) })),
    bloques,
    sinBloque: { especies: sin, usadoM3: r3(sin.reduce((a, s) => a + s.usadoM3, 0)), pendienteM3: r3(sin.reduce((a, s) => a + s.pendienteM3, 0)) },
    excesos,
  };
}

/** La guía que se está escribiendo en la ventana, para previsualizarla como una pendiente más. */
export const ID_ESCRIBIENDO = "__escribiendo__";

/**
 * Cómo quedan los bloques con lo que se está escribiendo (la ventana): sin la
 * preliminar que se corrige (`exceptoId`) y con la escrita como pendiente. Con
 * un solo bloque, lo escrito va a ése (como `prepararPreliminar`).
 */
export function previsualizarBloques(
  porBloque: Pick<SaldoPorBloques, "reparto">,
  especies: readonly EspecieConUsos[],
  preliminares: readonly Preliminar[],
  escrito: { numeroGtf: string; numerosLt: string[]; lineas: readonly LineaPreliminar[] },
  exceptoId?: string,
): { antes: SaldoPorBloques; con: SaldoPorBloques } {
  const otras = preliminares.filter((g) => g.id !== exceptoId);
  const unico = porBloque.reparto.length === 1 ? porBloque.reparto[0]!.nombre : null;
  const virtual: Preliminar = {
    id: ID_ESCRIBIENDO,
    numeroGtf: escrito.numeroGtf.trim() || "(esta guía)",
    numerosLt: escrito.numerosLt,
    estado: "pendiente",
    cuenta: true,
    gtfId: null,
    lineas: escrito.lineas.map((l) => ({ ...l, bloque: unico ?? l.bloque })),
  };
  return {
    antes: saldoPorBloques(porBloque.reparto, especies, otras),
    con: saldoPorBloques(porBloque.reparto, especies, [...otras, virtual]),
  };
}

/** «Bloque 2 · Tornillo se pasa por 13,261 m³ — revisa y corrige». */
export function textoDeExceso(x: Pick<ExcesoDeBloque, "bloque" | "especie" | "pasaPorM3" | "enElReparto">, fmt: (m3: number) => string = (m) => m.toFixed(3)): string {
  if (!x.enElReparto) return `${x.bloque} · ${x.especie} no está en ese bloque (${fmt(x.pasaPorM3)} m³ anotados) — revisa y corrige`;
  return `${x.bloque} · ${x.especie} se pasa por ${fmt(x.pasaPorM3)} m³ — revisa y corrige`;
}

export const MOTIVO_SIN_BLOQUE: Record<MotivoSinBloque, string> = {
  sin_numero: "despachos del libro sin N.º de guía",
  sin_preliminar: "la guía no se anotó como preliminar: el libro no dice de qué bloque salió",
  otra_especie: "su preliminar no trae esta especie",
  varios_bloques: "su preliminar reparte la especie en varios bloques y los m³ del libro no son los mismos",
  bloque_no_existe: "el bloque de su preliminar ya no está en el reparto",
};
