import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { precioManualDelDetalle } from "@/lib/forestal/aserrio-cobro";
import { bloquesDeCorrida, cotizarAserrio, versionVigente } from "@/lib/forestal/tarifa-aserrio";
import type { TarifaCliente } from "@/lib/forestal/precio-cliente";
import {
  idsACobrar,
  proponerArreglo,
  revisarAdelanto,
  tratoDelDetalle,
  tratoParaCotizar,
  type ArregloTratoInput,
  type CorridaDelTrato,
  type PropuestaDelTrato,
  type ResultadoDelArreglo,
} from "@/lib/forestal/trato-sin-cobrar";
import { ForestAserrioDB } from "./forest-aserrio.db";
import { ForestEspeciesDB } from "./forest-especies.db";
import { AdelantoTratoError, ForestParteTarifaDB, ParteNoEncontradaError } from "./forest-parte-tarifa.db";
import { ForestTarifaAserrioDB } from "./forest-tarifa-aserrio.db";

/**
 * ForestTratoSinCobrarDB — las corridas que el trato de un cliente debería
 * cobrar y no cobró, y el arreglo de un clic (ADR-430, caso WASACO 23-09).
 *
 * Lee; no escribe nada propio. El arreglo mueve la vigencia con
 * `ForestParteTarifaDB.adelantar` y cobra con `ForestAserrioDB.cobrarTanda`
 * —la misma vía que «Cobrar en tanda» y que declarar—: cada corrida en su
 * transacción, con su lock, su auditoría y la invalidación del libro y la
 * cuenta. El importe que muestra el aviso sale de la MISMA cotización
 * (`cotizarAserrio` con la tarifa de la planta de su fecha, el trato y los
 * grupos) que corre `cobrarCorrida`.
 *
 * `tenantId` 1er parámetro. Sin caché: decide un cobro (ver ForestParteTarifaDB).
 */

/* Tope de corridas que se miran por cliente. Un cliente con más de 500
   corridas de producción declaradas miraría las 500 más nuevas. */
const TOPE_CORRIDAS = 500;

const num = (v: Prisma.Decimal | null) => (v != null ? Number(v) : null);
const dia = (d: Date) => d.toISOString().slice(0, 10);

interface Evaluacion {
  parteNombre: string;
  /** La parte está dada de baja: se lee su historia, pero no se le cobra ni se le mueve el trato. */
  dadaDeBaja: boolean;
  tratos: TarifaCliente[];
  corridas: CorridaDelTrato[];
}

/** Las versiones del trato y las corridas del cliente, cotizadas con el trato que las cubriría. */
async function evaluar(tenantId: string, parteId: string): Promise<Evaluacion> {
  if (!tenantId) throw new Error("tenantId is required");
  const parte = parteId
    ? await prisma.forestParty.findFirst({
        where: { id: parteId, tenantId },
        select: { id: true, nombre: true, deletedAt: true },
      })
    : null;
  if (!parte) throw new ParteNoEncontradaError();
  const base = { parteNombre: parte.nombre, dadaDeBaja: parte.deletedAt != null };

  const [todas, filas] = await Promise.all([
    ForestParteTarifaDB.listar(tenantId, parte.id),
    prisma.forestCtpEntry.findMany({
      /* Lo mismo que `cobrarCorrida` exige para cobrar: producción, registrada,
         declarada (`quantity`), con este cliente de dueño. */
      where: {
        tenantId,
        duenoParteId: parte.id,
        deletedAt: null,
        section: "produccion",
        status: "registrado",
        quantity: { not: null },
      },
      orderBy: [{ entryDate: "desc" }, { lineNo: "desc" }],
      take: TOPE_CORRIDAS,
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        speciesCommon: true,
        productType: true,
        quantity: true,
        unit: true,
        aserrioImporte: true,
        aserrioDetalle: true,
      },
    }),
  ]);
  const tratos = todas.filter((t) => t.servicio === "aserrio");
  if (tratos.length === 0 || filas.length === 0) return { ...base, tratos, corridas: [] };

  /* Sólo se cotiza lo que puede entrar al aviso: sin cargo; anterior al trato
     (lo que un adelanto recotizaría); o cobrada con la PLANTA con el trato ya
     vigente —un arreglo que movió el trato y se cortó a mitad dejaba ésas con
     la planta, y el reintento no las veía—. Las de precio a mano, nunca; las
     cobradas con el trato, tampoco (corregir un trato no recotiza lo cobrado). */
  const candidatas = filas.filter((f) => {
    if (precioManualDelDetalle(f.aserrioDetalle) != null) return false;
    const t = tratoParaCotizar(tratos, dia(f.entryDate));
    if (!t) return false;
    return f.aserrioImporte == null || t.antes || tratoDelDetalle(f.aserrioDetalle) == null;
  });
  if (candidatas.length === 0) return { ...base, tratos, corridas: [] };

  const [paquetes, tarifario, catalogo] = await Promise.all([
    prisma.forestCtpPaquete.findMany({
      where: { tenantId, ctpEntryId: { in: candidatas.map((c) => c.id) }, deletedAt: null },
      orderBy: { codigo: "asc" },
      select: {
        ctpEntryId: true,
        codigo: true,
        productType: true,
        volumenM3: true,
        espesorCm: true,
        anchoCm: true,
        largoM: true,
        pieTablar: true,
      },
    }),
    ForestTarifaAserrioDB.leer(tenantId),
    ForestEspeciesDB.get(tenantId),
  ]);
  const grupos = catalogo.grupos ?? [];
  const deCorrida = new Map<string, typeof paquetes>();
  for (const p of paquetes) {
    const lista = deCorrida.get(p.ctpEntryId) ?? [];
    lista.push(p);
    deCorrida.set(p.ctpEntryId, lista);
  }

  const corridas = candidatas.flatMap((f): CorridaDelTrato[] => {
    const fecha = dia(f.entryDate);
    const trato = tratoParaCotizar(tratos, fecha);
    /* Los MISMOS argumentos que `cobrarCorrida`: la tarifa de la planta de su
       fecha, el trato que la cubre, los grupos, sin precio a mano. */
    const cotizacion = cotizarAserrio(
      versionVigente(tarifario, fecha),
      bloquesDeCorrida(
        {
          lineNo: f.lineNo,
          speciesCommon: f.speciesCommon,
          productType: f.productType,
          quantity: num(f.quantity),
          unit: f.unit,
        },
        (deCorrida.get(f.id) ?? []).map((p) => ({
          codigo: p.codigo,
          productType: p.productType,
          volumenM3: Number(p.volumenM3),
          espesorCm: num(p.espesorCm),
          anchoCm: num(p.anchoCm),
          largoM: num(p.largoM),
          pieTablar: num(p.pieTablar),
        })),
      ),
      { precioManualPt: null, cliente: trato?.tarifa ?? null, grupos },
    );
    /* Una corrida cuya madera el trato no nombra (un trato sólo por especie)
       no es de este aviso: sin cargo, la cobraría la planta, no el trato; ya
       cobrada, no «pasa al trato». Mismo criterio que la línea (`tratoCubre`). */
    if (cotizacion.clienteTarifaId == null) return [];
    return [
      {
        id: f.id,
        lineNo: f.lineNo,
        fecha,
        especie: f.speciesCommon,
        importeActual: num(f.aserrioImporte),
        manual: false,
        pt: cotizacion.pt,
        importeConTrato: cotizacion.cobrable ? cotizacion.importe : null,
        cobradaConTrato: tratoDelDetalle(f.aserrioDetalle),
      },
    ];
  });
  return { ...base, tratos, corridas };
}

export const ForestTratoSinCobrarDB = {
  /**
   * Lo que el trato de este cliente debería cobrar y no cobró, con el arreglo
   * propuesto. `arreglo: null` = no falta nada (o la parte está dada de baja:
   * no se le cobra, igual que no se le guarda un trato).
   *
   * `desde` = la propuesta para adelantar a ESA fecha: lo que la línea del
   * trato muestra antes de su botón, y lo que el POST con esa fecha cobra.
   *
   * @throws ParteNoEncontradaError si la parte no es de este tenant.
   */
  async propuesta(
    tenantId: string,
    parteId: string,
    opts: { desde?: string | null } = {},
  ): Promise<PropuestaDelTrato> {
    const { parteNombre, dadaDeBaja, tratos, corridas } = await evaluar(tenantId, parteId);
    const desde = opts.desde ?? null;
    return {
      parteId,
      parteNombre,
      desde,
      arreglo: dadaDeBaja ? null : proponerArreglo(parteId, tratos, corridas, desde ? { desde } : {}),
    };
  },

  /**
   * Adelanta el trato (si vienen `tarifaId` + `desde`) y cobra lo que el trato
   * cubre después: exactamente lo que `proponerArreglo` propone para esa
   * fecha, calculado ANTES de mover y con los datos de ahora.
   *
   * Si el adelanto no procede, no se cobra nada (tira antes). El cobro es
   * corrida por corrida: una que falla no deshace a las otras, y lo que quede
   * sin cobrar vuelve a salir en el aviso — ya con el trato vigente — para
   * reintentarlo.
   *
   * Sin `desde` el trato no se mueve y sólo se cobra lo que YA cubre: una
   * corrida anterior al trato no entra (`cobrarCorrida` la cotizaría con la
   * planta, que no es lo que el aviso prometió).
   *
   * @throws ParteNoEncontradaError (también si la parte está dada de baja) · AdelantoTratoError
   */
  async arreglar(tenantId: string, input: ArregloTratoInput, user = "unknown"): Promise<ResultadoDelArreglo> {
    const { parteNombre, dadaDeBaja, tratos, corridas } = await evaluar(tenantId, input.parteId);
    /* Igual que `guardar` y `adelantar`: a una parte dada de baja no se le carga deuda. */
    if (dadaDeBaja) throw new ParteNoEncontradaError("Esa parte está dada de baja en el Directorio: no se le cobra.");
    const desde = input.desde && input.tarifaId ? input.desde : null;

    /* Primero la revisión sin lock: un pedido que no procede no cotiza ni
       cobra nada. La de verdad se repite adentro de `adelantar`, con lock. */
    if (desde && input.tarifaId) {
      const r = revisarAdelanto(tratos, input.tarifaId, desde);
      if (r.motivo) throw new AdelantoTratoError(r.motivo, r.mensaje);
    }
    const arreglo = proponerArreglo(input.parteId, tratos, corridas, desde ? { desde } : { sinMover: true });

    let movio: ResultadoDelArreglo["movio"] = null;
    if (desde && input.tarifaId) {
      const hecho = await ForestParteTarifaDB.adelantar(
        tenantId,
        { parteId: input.parteId, tarifaId: input.tarifaId, desde },
        user,
      );
      if (hecho.movio) movio = { tarifaId: hecho.tarifa.id, de: hecho.de, a: desde };
    }

    const ids = arreglo ? idsACobrar(arreglo) : [];
    /* `{}` = mantener el dueño y el precio de cada corrida (el de a mano no
       entra al arreglo): `cobrarCorrida` relee el trato que rige en SU fecha. */
    const cobro = ids.length > 0 ? await ForestAserrioDB.cobrarTanda(tenantId, ids, {}, user) : null;
    return { parteNombre, movio, arreglo, cobro };
  },
};
