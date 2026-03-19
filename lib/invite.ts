import "server-only";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InviteRole = "admin" | "editor" | "viewer";
export type InviteStatus = "pending" | "accepted" | "expired";

export interface InviteRecord {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Invitations expire after this many hours. */
const EXPIRY_HOURS = 72;

const VALID_ROLES: InviteRole[] = ["admin", "editor", "viewer"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Create a new invitation for `email` to join `tenantId`.
 * Any previous pending invite for the same email+tenant is invalidated first.
 */
export async function createInvite(
  tenantId: string,
  email: string,
  role: InviteRole = "editor"
): Promise<{ token: string; expiresAt: Date }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) throw new Error("Invalid email");
  if (!VALID_ROLES.includes(role)) throw new Error("Invalid role");

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);

  // Invalidate any previous pending invite for the same email+tenant
  await prisma.tenantInvitation.updateMany({
    where: { tenantId, email: normalizedEmail, status: "pending" },
    data: { status: "expired" },
  });

  await prisma.tenantInvitation.create({
    data: { tenantId, email: normalizedEmail, role, token, status: "pending", expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Verify that a token is valid and not used/expired.
 */
export async function verifyInvite(
  token: string
): Promise<
  | { valid: true; invite: InviteRecord }
  | { valid: false; reason: "not_found" | "already_accepted" | "expired" }
> {
  if (!token || token.length !== 64) {
    return { valid: false, reason: "not_found" };
  }

  const invite = await prisma.tenantInvitation.findUnique({ where: { token } });
  if (!invite) return { valid: false, reason: "not_found" };
  if (invite.status === "accepted") return { valid: false, reason: "already_accepted" };
  if (invite.status === "expired" || invite.expiresAt < new Date()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, invite: invite as InviteRecord };
}

/**
 * Mark an invitation as accepted (call after user registration/login is complete).
 * Returns false if the token is invalid or already used.
 */
export async function acceptInvite(token: string): Promise<boolean> {
  const result = await verifyInvite(token);
  if (!result.valid) return false;

  await prisma.tenantInvitation.update({
    where: { token },
    data: { status: "accepted" },
  });
  return true;
}

/**
 * List all pending invitations for a tenant.
 */
export async function listPendingInvites(tenantId: string) {
  return prisma.tenantInvitation.findMany({
    where: { tenantId, status: "pending", expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
