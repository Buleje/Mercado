export const dynamic = 'force-dynamic'
import "server-only";
import { NextResponse } from "next/server";
import { SettingsDB } from "@/lib/jsondb";
import { createSessionToken, createRefreshToken, SESSION, REFRESH } from "@/lib/session";
import type { AdminRole } from "@/lib/session";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTenantSlug } from "@/lib/resolve-tenant";
import fs from "fs/promises";
import path from "path";
import { logger } from "@/lib/logger";

type LegacyAdminUser = { id: string; username: string; password: string; role: AdminRole; name: string };

const LEGACY_FILE = path.join(process.cwd(), "local-data", "admin-users.json");

async function getLegacyUsers(): Promise<LegacyAdminUser[]> {
  try {
    return JSON.parse(await fs.readFile(LEGACY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/** Check password against a stored value – supports bcrypt hashes and plain text (legacy). */
async function checkPassword(input: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2")) {
    return compare(input, stored);
  }
  return input === stored;
}

function makeAccessCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION.MAX_AGE,
    path: "/",
  };
}

function makeRefreshCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: REFRESH.MAX_AGE,
    path: "/",
  };
}

export async function POST(req: Request) {
  // Rate limit: 3 failed login attempts per hour (AUTH preset)
  const rateLimitResponse = applyRateLimit(req, "AUTH", "auth:login");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  /** Tenant resolved by edge middleware from the subdomain header. */
  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  const resolvedSlug = (await resolveTenantSlug(rawTenantId)) ?? "main";

  try {
  const body = await req.json() as { username?: string; password?: string };
  const { username, password } = body;

  if (!password) {
    return NextResponse.json({ error: "password required" }, { status: 400 });
  }

  // Step 1: Resolve slug → tenant ID (CUID)
  // Also build a list of possible IDs (CUID + slug) for data that may have inconsistent tenantIds
  let tenantId = resolvedSlug;
  let possibleTenantIds = [resolvedSlug];
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: resolvedSlug }, select: { id: true, slug: true } });
    if (tenant) {
      tenantId = tenant.id;
      possibleTenantIds = [...new Set([tenant.id, tenant.slug, resolvedSlug])];
    }
  } catch { /* use slug as-is */ }

  // Step 2: Find AdminUser for that tenant (search by all possible tenantId values)
  type DbUser = { username: string; passwordHash: string; role: string; name: string; tenantId: string; onboardingCompletedAt: Date | null };
  let dbUsers: DbUser[] = [];
  try {
    dbUsers = await prisma.adminUser.findMany({
      where: { active: true, tenantId: { in: possibleTenantIds }, ...(username ? { username } : {}) },
      select: { username: true, passwordHash: true, role: true, name: true, tenantId: true, onboardingCompletedAt: true },
    });
  } catch { /* DB unavailable */ }

  // Step 2b: If no users found in resolved tenant and username is specified,
  // search globally — the user might be logging in at /admin/login without a tenant context
  if (dbUsers.length === 0 && username) {
    try {
      dbUsers = await prisma.adminUser.findMany({
        where: { active: true, username },
        select: { username: true, passwordHash: true, role: true, name: true, tenantId: true, onboardingCompletedAt: true },
      });
      // If found, resolve the user's actual tenant
      if (dbUsers.length > 0) {
        const userTenantId = dbUsers[0].tenantId;
        // Resolve the user's tenantId to the actual Tenant record
        const userTenant = await prisma.tenant.findFirst({
          where: { OR: [{ id: userTenantId }, { slug: userTenantId }] },
          select: { id: true, slug: true },
        });
        if (userTenant) {
          tenantId = userTenant.id;
          possibleTenantIds = [...new Set([userTenant.id, userTenant.slug])];
        } else {
          tenantId = userTenantId;
        }
      }
    } catch { /* DB unavailable */ }
  }

  for (const u of dbUsers) {
    if (await checkPassword(password, u.passwordHash)) {
      // Always use the canonical Tenant ID (CUID) for the session
      const [token, refreshToken] = await Promise.all([
        createSessionToken(u.role as AdminRole, u.username, tenantId, u.name),
        createRefreshToken(u.role as AdminRole, u.username, tenantId, u.name),
      ]);
      const onboardingPending = !u.onboardingCompletedAt;
      // Find the tenant slug for the active-tenant-slug cookie (used by admin UI)
      let tenantSlug = resolvedSlug;
      try {
        const t = await prisma.tenant.findFirst({
          where: { OR: [{ id: tenantId }, { slug: tenantId }] },
          select: { slug: true },
        });
        if (t) tenantSlug = t.slug;
      } catch { /* use resolvedSlug */ }

      const response = NextResponse.json({ ok: true, role: u.role, name: u.name, onboardingPending, tenantId, tenantSlug });
      response.cookies.set(SESSION.COOKIE_NAME, token, makeAccessCookie());
      response.cookies.set(REFRESH.COOKIE_NAME, refreshToken, makeRefreshCookie());
      // Set active-tenant cookie with the canonical Tenant ID for proxy.ts
      response.cookies.set("active-tenant", tenantId, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });
      // Set active-tenant-slug cookie for the admin UI (readable by client JS)
      response.cookies.set("active-tenant-slug", tenantSlug, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });
      return response;
    }
  }

  // ── Fallback: legacy admin-users.json (used during migration window) ──────
  if (dbUsers.length === 0) {
    const legacyUsers = await getLegacyUsers();
    const candidates = username ? legacyUsers.filter((u) => u.username === username) : legacyUsers;
    for (const u of candidates) {
      if (await checkPassword(password, u.password)) {
        const [token, refreshToken] = await Promise.all([
          createSessionToken(u.role, u.username, tenantId, u.name),
          createRefreshToken(u.role, u.username, tenantId, u.name),
        ]);
        const response = NextResponse.json({ ok: true, role: u.role, name: u.name, onboardingPending: true });
        response.cookies.set(SESSION.COOKIE_NAME, token, makeAccessCookie());
        response.cookies.set(REFRESH.COOKIE_NAME, refreshToken, makeRefreshCookie());
        response.cookies.set("active-tenant", tenantId, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });
        return response;
      }
    }
  }

  // ── Final fallback: admin password stored in Settings (no hardcoded default) ──
  try {
    const settings = await SettingsDB.get(tenantId);
    const adminPassword = settings.adminPassword;
    if (adminPassword && await checkPassword(password, adminPassword)) {
      const [token, refreshToken] = await Promise.all([
        createSessionToken("admin", "admin", tenantId, "Administrador"),
        createRefreshToken("admin", "admin", tenantId, "Administrador"),
      ]);
      const response = NextResponse.json({ ok: true, role: "admin", name: "Administrador", onboardingPending: true });
      response.cookies.set(SESSION.COOKIE_NAME, token, makeAccessCookie());
      response.cookies.set(REFRESH.COOKIE_NAME, refreshToken, makeRefreshCookie());
      response.cookies.set("active-tenant", tenantId, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });
      return response;
    }
  } catch {
    // Settings DB unavailable — skip this fallback
  }

  return NextResponse.json({ error: "incorrect credentials" }, { status: 401 });
  } catch (e) {
    logger.error("[auth/login] Unhandled error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

