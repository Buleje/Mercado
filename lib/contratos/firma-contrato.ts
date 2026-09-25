import "server-only";
import { ContractsDB } from "@/lib/db/contracts.db";
import { archivarContrato } from "@/lib/contratos/archivar-contrato";
import { logger } from "@/lib/logger";
import type { DbContract, DbContractSigner } from "@/lib/types/contracts";

/**
 * Firma secuencial de un contrato (ADR-307).
 *
 * Las dos partes firman EN ORDEN, cada una con su propio link. El orden importa
 * de verdad: quien firma segundo está aceptando un texto que el primero ya
 * aceptó, y si se permitiera firmar en cualquier orden no habría forma de
 * sostener que ambos vieron lo mismo.
 */

export type MotivoBloqueo = "ya_firmo" | "rechazado" | "no_es_su_turno" | "link_vencido" | "contrato_cerrado";

export interface EstadoDeFirma {
  puedeFirmar: boolean;
  motivo?: MotivoBloqueo;
  /** Quién tiene que firmar antes, para poder decirlo con nombre y apellido. */
  esperandoA?: string;
}

export function estadoDeFirma(
  contrato: DbContract,
  signer: DbContractSigner,
  tokenExpiraEn: Date | null,
): EstadoDeFirma {
  if (signer.estado === "FIRMADO") return { puedeFirmar: false, motivo: "ya_firmo" };
  if (signer.estado === "RECHAZADO") return { puedeFirmar: false, motivo: "rechazado" };
  if (contrato.estado === "ANULADO" || contrato.estado === "TERMINADO") {
    return { puedeFirmar: false, motivo: "contrato_cerrado" };
  }
  if (tokenExpiraEn && tokenExpiraEn.getTime() < Date.now()) {
    return { puedeFirmar: false, motivo: "link_vencido" };
  }

  const anterior = contrato.firmantes
    .filter((f) => f.orden < signer.orden)
    .sort((a, b) => a.orden - b.orden)
    .find((f) => f.estado !== "FIRMADO");
  if (anterior) {
    return { puedeFirmar: false, motivo: "no_es_su_turno", esperandoA: anterior.nombre };
  }
  return { puedeFirmar: true };
}

export interface ResultadoFirma {
  ok: boolean;
  error?: MotivoBloqueo | "no_encontrado" | "firma_invalida";
  status?: number;
  /** True cuando con esta firma quedó firmado por todos. */
  completo?: boolean;
}

/** Una firma es un PNG dibujado a mano; cualquier otra cosa no entra. */
function firmaValida(dataUrl: string): boolean {
  if (!dataUrl.startsWith("data:image/png;base64,")) return false;
  const base64 = dataUrl.slice("data:image/png;base64,".length);
  // Un trazo real ronda los pocos KB; el tope evita que alguien suba un archivo
  // gigante disfrazado de firma.
  return base64.length > 200 && base64.length < 900_000;
}

export async function firmarPorToken(
  token: string,
  datos: { firmaDataUrl: string; ip?: string; userAgent?: string },
): Promise<ResultadoFirma> {
  const encontrado = await ContractsDB.findBySignerToken(token);
  if (!encontrado) return { ok: false, error: "no_encontrado", status: 404 };

  const { signer, contract } = encontrado;
  const propio = contract.firmantes.find((f) => f.id === signer.id);
  if (!propio) return { ok: false, error: "no_encontrado", status: 404 };

  const estado = estadoDeFirma(contract, propio, signer.tokenExpiraEn);
  if (!estado.puedeFirmar) return { ok: false, error: estado.motivo, status: 409 };

  if (!firmaValida(datos.firmaDataUrl)) {
    return { ok: false, error: "firma_invalida", status: 400 };
  }

  const firmado = await ContractsDB.signByToken(token, datos);
  if (!firmado) return { ok: false, error: "ya_firmo", status: 409 };

  await ContractsDB.addEvent(
    contract.tenantId,
    contract.id,
    "FIRMADO",
    `${propio.nombre} firmó el contrato`,
    `firma-externa:${propio.nombre}`,
    { signerId: propio.id, rol: propio.rol, ip: datos.ip },
  );

  // ¿Quedó firmado por todos?
  const actualizado = await ContractsDB.getById(contract.tenantId, contract.id);
  const completo = Boolean(
    actualizado && actualizado.firmantes.length > 0 && actualizado.firmantes.every((f) => f.estado === "FIRMADO"),
  );

  if (completo && actualizado) {
    await ContractsDB.update(contract.tenantId, contract.id, {
      estado: actualizado.estado === "PENDIENTE_FIRMA" ? "VIGENTE" : actualizado.estado,
      firmadoEn: new Date().toISOString(),
    });
    // El PDF se regenera con las firmas adentro y se archiva como versión nueva:
    // recién ahí el contrato firmado existe como archivo.
    await archivarContrato(contract.tenantId, contract.id, "firma-externa", {
      nota: "Contrato firmado por todas las partes",
    }).catch((err) =>
      logger.error("[contratos] no se pudo archivar el firmado", { err: String(err) }),
    );
  }

  return { ok: true, completo };
}

export async function rechazarPorToken(token: string, motivo: string): Promise<ResultadoFirma> {
  const encontrado = await ContractsDB.findBySignerToken(token);
  if (!encontrado) return { ok: false, error: "no_encontrado", status: 404 };

  const { signer, contract } = encontrado;
  const propio = contract.firmantes.find((f) => f.id === signer.id);
  if (!propio) return { ok: false, error: "no_encontrado", status: 404 };
  if (propio.estado === "FIRMADO") return { ok: false, error: "ya_firmo", status: 409 };

  await ContractsDB.rejectByToken(token, motivo);
  await ContractsDB.addEvent(
    contract.tenantId,
    contract.id,
    "RECHAZADO",
    `${propio.nombre} no aceptó firmar: ${motivo.slice(0, 200)}`,
    `firma-externa:${propio.nombre}`,
    { signerId: propio.id },
  );
  return { ok: true };
}
