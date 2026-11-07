import "server-only";
import { prisma } from "@/lib/prisma";
import { MAX_PASSKEYS_VIGENTES, sistemaQueDeclara, type PasskeyDeLaPersona } from "@/lib/adelantos/passkey-tipos";

/**
 * AdelantoPasskeysDB — las passkeys (WebAuthn) del celular de la persona que
 * recibe un adelanto (ADR-513). Cada lectura y escritura lleva `tenantId` en el
 * WHERE: una credencial de otro negocio no existe para este.
 *
 * Nunca se borra una fila: revocar = `revokedAt`. Así una huella ya firmada se
 * puede volver a verificar con su llave pública aunque el celular se haya
 * perdido. El contador sube SÓLO dentro de la transacción que anota la huella
 * (`AdelantoFirmasDB.firmarPorEnlace`), con la condición en el WHERE.
 *
 * Alta (revisión de seguridad 23-10): bajo candado de la persona (`FOR UPDATE`
 * de su fila), así «no tiene ninguna» y «no pasa el tope» valen aunque lleguen
 * dos registros a la vez. Guarda con qué enlace, IP y navegador se registró.
 *
 * Sin caché: se lee una vez por ceremonia y por índice.
 */

export type PasskeyGuardada = {
  id: string;
  beneficiarioId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  rpId: string;
  revokedAt: Date | null;
  /** El enlace de firma con que se registró (null en las de antes del 23-10). */
  enlaceId: string | null;
  creadaEn: Date;
};

const SELECT = {
  id: true,
  beneficiarioId: true,
  credentialId: true,
  publicKey: true,
  counter: true,
  transports: true,
  rpId: true,
  revokedAt: true,
  enlaceId: true,
  createdAt: true,
} as const;

type Fila = {
  id: string;
  beneficiarioId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: string[];
  rpId: string;
  revokedAt: Date | null;
  enlaceId: string | null;
  createdAt: Date;
};

function mapear({ createdAt, ...f }: Fila): PasskeyGuardada {
  return { ...f, publicKey: new Uint8Array(f.publicKey), counter: Number(f.counter), creadaEn: createdAt };
}

export type AltaPasskey = {
  beneficiarioId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  rpId: string;
  enlaceId: string;
  registroIp: string | null;
  registroUserAgent: string | null;
};

/** `ya-tiene` = la persona ya tiene tantas vigentes como permite quien llama; `tope` = llegó a MAX_PASSKEYS_VIGENTES. */
export type ResultadoAlta = { ok: true; passkey: PasskeyGuardada } | { ok: false; motivo: "ya-tiene" | "tope" };

export const AdelantoPasskeysDB = {
  /** Las vigentes de la persona para ESTE dominio. */
  async vigentesDe(tenantId: string, beneficiarioId: string, rpId: string): Promise<PasskeyGuardada[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.adelantoPasskey.findMany({
      where: { tenantId, beneficiarioId, rpId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: SELECT,
      take: 20,
    });
    return filas.map(mapear);
  },

  /** Por la credencial que respondió el celular; sólo de ESTE negocio. Revocadas incluidas (quien llama decide). */
  async porCredencial(tenantId: string, credentialId: string): Promise<PasskeyGuardada | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await prisma.adelantoPasskey.findUnique({ where: { tenantId_credentialId: { tenantId, credentialId } }, select: SELECT });
    return f ? mapear(f) : null;
  },

  /** Cuántas vigentes tiene la persona, en TODOS los dominios. */
  async cuantasVigentes(tenantId: string, beneficiarioId: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.adelantoPasskey.count({ where: { tenantId, beneficiarioId, revokedAt: null } });
  },

  /**
   * Alta bajo candado de la persona. `maxVigentes` = cuántas puede tener ya
   * (el enlace pasa 0: sólo registra si no tiene ninguna, en ningún dominio:
   * otro subdominio permitido no abre la puerta a una segunda llave).
   */
  async crear(tenantId: string, d: AltaPasskey, maxVigentes: number = MAX_PASSKEYS_VIGENTES - 1): Promise<ResultadoAlta> {
    if (!tenantId) throw new Error("tenantId is required");
    try {
      return await prisma.$transaction(async (tx) => {
        /* La persona tiene que ser de ESTE negocio (el FK sólo mira el id) y queda tomada hasta el COMMIT. */
        const persona = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AdelantoBeneficiario" WHERE "tenantId" = ${tenantId} AND id = ${d.beneficiarioId} FOR UPDATE`;
        if (persona.length === 0) throw new Error("La persona no es de este negocio.");
        const vigentes = await tx.adelantoPasskey.count({ where: { tenantId, beneficiarioId: d.beneficiarioId, revokedAt: null } });
        if (vigentes >= MAX_PASSKEYS_VIGENTES) return { ok: false, motivo: "tope" } as const;
        if (vigentes > maxVigentes) return { ok: false, motivo: "ya-tiene" } as const;
        const f = await tx.adelantoPasskey.create({
          data: {
            tenantId,
            beneficiarioId: d.beneficiarioId,
            credentialId: d.credentialId,
            publicKey: Buffer.from(d.publicKey),
            counter: BigInt(Math.max(0, Math.trunc(d.counter))),
            transports: d.transports.slice(0, 8).map((t) => t.slice(0, 20)),
            rpId: d.rpId,
            enlaceId: d.enlaceId,
            registroIp: d.registroIp?.slice(0, 64) ?? null,
            registroUserAgent: d.registroUserAgent?.slice(0, 400) ?? null,
          },
          select: SELECT,
        });
        return { ok: true, passkey: mapear(f) } as const;
      });
    } catch (e) {
      /* La misma credencial entró por otro pedido a la vez: el unique (tenantId, credentialId) la frena. */
      if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") return { ok: false, motivo: "ya-tiene" };
      throw e;
    }
  },

  /** Para la ficha de la persona: todas, también las revocadas (sin la llave). */
  async listarDeLaPersona(tenantId: string, beneficiarioId: string): Promise<PasskeyDeLaPersona[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.adelantoPasskey.findMany({
      where: { tenantId, beneficiarioId },
      orderBy: { createdAt: "desc" },
      select: { id: true, rpId: true, deviceName: true, registroUserAgent: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      take: 50,
    });
    return filas.map((f) => ({
      id: f.id,
      rpId: f.rpId,
      navegador: sistemaQueDeclara(f.registroUserAgent),
      nombrePuesto: f.deviceName,
      creadaEn: f.createdAt.toISOString(),
      usadaEn: f.lastUsedAt?.toISOString() ?? null,
      revocadaEn: f.revokedAt?.toISOString() ?? null,
    }));
  },

  /** Revocar: la condición va en el WHERE (de ESTA persona, de ESTE negocio, todavía vigente). */
  async revocar(tenantId: string, beneficiarioId: string, passkeyId: string, por: string): Promise<"ok" | "no-existe" | "ya-revocada"> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.adelantoPasskey.updateMany({
      where: { tenantId, beneficiarioId, id: passkeyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: por.slice(0, 120) },
    });
    if (r.count === 1) return "ok";
    const existe = await prisma.adelantoPasskey.findFirst({ where: { tenantId, beneficiarioId, id: passkeyId }, select: { id: true } });
    return existe ? "ya-revocada" : "no-existe";
  },
};
