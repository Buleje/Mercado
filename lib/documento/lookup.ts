/**
 * Un número, dos padrones.
 *
 * En el mostrador nadie piensa «voy a consultar RENIEC»: escribe el número que
 * le dictaron. Si tiene 8 dígitos es un DNI y lo sabe RENIEC; si tiene 11 es un
 * RUC y lo sabe SUNAT. Esa decisión la toma el LARGO, no un selector que el
 * usuario tenga que acertar antes de tipear.
 *
 * Las dos integraciones ya existían por separado (`lib/reniec.ts` y
 * `lib/integrations/sunat-ruc.ts`, de vendor onboarding); acá se unifican
 * detrás de una sola respuesta para que la pantalla no tenga que saber cuál
 * llamó.
 *
 * Es `server-only`: los tokens de los padrones no salen al navegador. Las
 * reglas que la pantalla también necesita (normalizar, decidir el tipo) viven
 * en `./tipos`, sin esa marca.
 */

import "server-only";
import { logger } from "@/lib/logger";
import { lookupDniInReniec } from "@/lib/reniec";
import { verifyRuc } from "@/lib/integrations/sunat-ruc";
import { normalizarNumero, tipoDeDocumento, type ResultadoDocumento } from "./tipos";

export type * from "./tipos";

/**
 * Techo de espera para toda la consulta.
 *
 * `lookupDniInReniec` encadena varios proveedores con 5 s cada uno: medido en
 * dev, un DNI que ningún proveedor contesta tardó **10,9 s** en fallar. Del
 * otro lado hay alguien mirando un spinner con la persona esperando su plata:
 * pasados 6 s conviene decir «cargalo a mano» que seguir intentando.
 */
const TECHO_MS = 6000;

function conTecho<T>(promesa: Promise<T>, alVencer: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(alVencer()), TECHO_MS);
    promesa.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(alVencer()); },
    );
  });
}

/** Consulta el padrón que corresponda al largo del número. */
export async function consultarDocumento(numeroCrudo: string): Promise<ResultadoDocumento> {
  return conTecho(consultarSinTecho(numeroCrudo), () => {
    const numero = normalizarNumero(numeroCrudo);
    const tipo = tipoDeDocumento(numero);
    logger.warn("[documento/lookup] el padrón no contestó a tiempo", { tipo, ultimos4: numero.slice(-4) });
    return {
      encontrado: false,
      tipo: tipo ?? undefined,
      numero,
      motivo: `${tipo === "RUC" ? "SUNAT" : "RENIEC"} está tardando demasiado. Cargá los datos a mano.`,
    };
  });
}

async function consultarSinTecho(numeroCrudo: string): Promise<ResultadoDocumento> {
  const numero = normalizarNumero(numeroCrudo);
  const tipo = tipoDeDocumento(numero);

  if (!tipo) {
    return {
      encontrado: false,
      numero,
      motivo:
        numero.length === 11
          ? "Un RUC de 11 dígitos arranca con 10, 15, 16, 17 o 20."
          : "Escribí 8 dígitos para un DNI u 11 para un RUC.",
    };
  }

  try {
    if (tipo === "DNI") {
      const persona = await lookupDniInReniec(numero);
      return {
        encontrado: true,
        tipo,
        numero,
        nombre: persona.nombreCompleto,
        fuente: "RENIEC",
      };
    }

    const ruc = await verifyRuc(numero);
    if (!ruc.ok || !ruc.razonSocial) {
      return {
        encontrado: false,
        tipo,
        numero,
        motivo:
          ruc.reason === "not_found"
            ? "SUNAT no tiene ese RUC. Revisá el número."
            : "No se pudo consultar SUNAT ahora. Cargá los datos a mano.",
      };
    }
    /* `source: "mock"` con un provider real configurado significa que se cayó
       al mock: el dato SIRVE para seguir trabajando pero no es de SUNAT, y eso
       se declara en vez de disfrazarlo. */
    const esDemo = ruc.source === "mock";
    return {
      encontrado: true,
      tipo,
      numero,
      nombre: ruc.razonSocial,
      razonSocial: ruc.razonSocial,
      direccion: ruc.direccion,
      departamento: ruc.departamento,
      provincia: ruc.provincia,
      distrito: ruc.distrito,
      estado: ruc.estado,
      condicion: ruc.condicion,
      fuente: esDemo ? "datos de demostración" : `SUNAT${ruc.source === "cache" ? " (guardado)" : ""}`,
      demo: esDemo || undefined,
      avisoConfig:
        ruc.reason === "bad_credentials"
          ? "El token de SUNAT no es válido: revisá SUNAT_RUC_API_TOKEN."
          : ruc.reason === "provider_unavailable"
            ? "SUNAT no contestó: estos datos son de ejemplo."
            : undefined,
    };
  } catch (e) {
    /**
     * Que el padrón esté caído no puede frenar una alta: la persona está en el
     * mostrador esperando su plata. Se avisa y se sigue a mano.
     */
    logger.warn("[documento/lookup] la consulta falló", {
      tipo,
      ultimos4: numero.slice(-4),
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      encontrado: false,
      tipo,
      numero,
      motivo: `No se pudo consultar ${tipo === "DNI" ? "RENIEC" : "SUNAT"} ahora. Cargá los datos a mano.`,
    };
  }
}
