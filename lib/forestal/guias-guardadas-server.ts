import "server-only";

/**
 * Guías guardadas (ADR-442) — lo que sale a la red: pedir la ficha a SERFOR y
 * fusionarla con lo que tipeó la persona. La ficha la pide SIEMPRE el servidor
 * (la del navegador no se acepta: el alta desde SERFOR confía en ella si SERFOR
 * no responde, y una ficha fabricada entraría al libro con sello de verificada).
 */
import { logger } from "@/lib/logger";
import { esNumeroRegistroValido, normalizarNumeroRegistro, type GtfSerfor } from "./serfor-gtf";
import { consultarGtfEnSerfor } from "./serfor-gtf-fetch";
import { documentoDelTitular } from "./serfor-titular";
import { fusionarConFicha, type CamposDeGuia, type GuiaGuardadaInput } from "./guias-guardadas";
import type { DatosNuevos } from "@/lib/db/guias-guardadas.db";

export type Preparada =
  | { ok: true; datos: DatosNuevos; corregidos: string[]; aviso: string | null }
  | { ok: false; status: number; error: string; message: string };

/** Lo que ya tiene la guía (al editar), para completar lo que el PATCH no manda. */
export interface Base extends CamposDeGuia {
  contratoId: string | null;
  notas: string | null;
  serforGtf: GtfSerfor | null;
  serforConsultadaEn: Date | null;
}

const VACIA: Base = {
  numeroRegistro: null,
  gtfNumber: null,
  gtfDate: null,
  titularNombre: null,
  titularDoc: null,
  permisoCodigo: null,
  contratoId: null,
  notas: null,
  serforGtf: null,
  serforConsultadaEn: null,
};

/** Campo ausente en el cuerpo = queda lo que había; `null` = vaciar. */
const tomar = <T>(nuevo: T | undefined, antes: T): T => (nuevo === undefined ? antes : nuevo);

export async function prepararGuia(input: GuiaGuardadaInput, base: Base = VACIA): Promise<Preparada> {
  const reg = tomar(input.numeroRegistro, base.numeroRegistro);
  const numero = reg ? normalizarNumeroRegistro(reg) : null;
  if (numero && !esNumeroRegistroValido(numero)) {
    return {
      ok: false,
      status: 400,
      error: "numero_invalido",
      message: "El N° de registro va con sus guiones, como lo imprime la guía. Ejemplo: 110-19-0469779.",
    };
  }

  const tipeado: CamposDeGuia = {
    numeroRegistro: numero,
    gtfNumber: tomar(input.gtfNumber, base.gtfNumber),
    gtfDate: tomar(input.gtfDate, base.gtfDate),
    titularNombre: tomar(input.titularNombre, base.titularNombre),
    titularDoc: tomar(input.titularDoc, base.titularDoc),
    permisoCodigo: tomar(input.permisoCodigo, base.permisoCodigo),
  };

  /* Se cambió el N° de registro: la ficha vieja ya no es de esta guía. */
  let ficha = numero && numero === base.numeroRegistro ? base.serforGtf : null;
  let consultadaEn = ficha ? base.serforConsultadaEn : null;
  let aviso: string | null = null;

  if (input.consultarSerfor) {
    if (!numero) {
      return {
        ok: false,
        status: 400,
        error: "falta_registro",
        message: "Para buscar en SERFOR escribe el N° de registro de la guía.",
      };
    }
    const c = await consultarGtfEnSerfor(numero);
    /* Un 200 con una página de mantenimiento vuelve `ok` con estado
       «sin_respuesta»: tampoco es un veredicto de SERFOR. */
    if (!c.ok || c.resultado.estado === "sin_respuesta") {
      /* Sin SERFOR no se frena el trabajo: se guarda lo tipeado y se dice. */
      logger.warn("[guias-guardadas] SERFOR sin respuesta", { numero });
      aviso = ficha
        ? "SERFOR no respondió: la guía conserva la ficha que ya tenía."
        : "SERFOR no respondió: se guardó con lo que escribiste. Vuelve a buscarla más tarde.";
    } else if (c.resultado.estado !== "encontrada" || !c.resultado.gtf) {
      return {
        ok: false,
        status: 404,
        error: "guia_no_encontrada",
        /* El texto crudo de SERFOR trae su pie de sistema: se dice con palabras propias. */
        message: `SERFOR no encontró una guía con el N° de registro ${numero}. Revisa los guiones o guárdala a mano.`,
      };
    } else {
      ficha = c.resultado.gtf;
      consultadaEn = new Date();
    }
  }

  const { campos, corregidos } = fusionarConFicha(
    tipeado,
    ficha,
    ficha ? (documentoDelTitular(ficha)?.numero ?? null) : null,
  );
  return {
    ok: true,
    datos: {
      ...campos,
      contratoId: tomar(input.contratoId, base.contratoId),
      notas: tomar(input.notas, base.notas),
      serforGtf: ficha,
      serforConsultadaEn: consultadaEn,
    },
    corregidos,
    aviso,
  };
}
