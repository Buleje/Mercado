import "server-only";
import { NextResponse } from "next/server";
import { SettingsDB } from "@/lib/jsondb";
import { createSessionToken, SESSION } from "@/lib/session";
import type { AdminRole } from "@/lib/session";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

type LegacyAdminUser = { id: string; username: string; password: string; role: AdminRole; name: string };

const LEGACY_FILE = path.join(process.cwd(), "local-data", "admin-users.json");

async function getLegacyUsers(): Promise<LegacyAdminUser[]> {
  try {
    return JSON.parse(await fs.readFile(LEGACY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/** Check password against a stored value — supports bcrypt hashes and plain text (legacy). */
async function checkPassword(input: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2")) {
    return compare(input, stored);
  }
  return input === stored;
}

function makeCookie(token: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION.MAX_AGE,
    path: "/",
  };
}

export async function POST(req: Request) {
  const body = await req.json() as { username?: string; password?: string };
  const { username, password } = body;

  if (!password) {
    return NextResponse.json({ error: "password required" }, { status: 400 });
  }

  // ── Primary: query AdminUser table in Prisma ──────────────────────────────
  const dbUsers = await prisma.adminUser.findMany({
    where: { active: true, ...(username ? { username } : {}) },
  });

  for (const u of dbUsers) {
    if (await checkPassword(password, u.passwordHash)) {
      const token = await createSessionToken(u.role as AdminRole, u.username);
      const response = NextResponse.json({ ok: true, role: u.role, name: u.name });
      response.cookies.set(SESSION.COOKIE_NAME, token, makeCookie(token));
      return response;
    }
  }

  // ── Fallback: legacy admin-users.json (used during migration window) ──────
  if (dbUsers.length === 0) {
    const legacyUsers = await getLegacyUsers();
    const candidates = username ? legacyUsers.filter((u) => u.username === username) : legacyUsers;
    for (const u of candidates) {
      if (await checkPassword(password, u.password)) {
        const token = await createSessionToken(u.role, u.username);
        const response = NextResponse.json({ ok: true, role: u.role, name: u.name });
        response.cookies.set(SESSION.COOKIE_NAME, token, makeCookie(token));
        return response;
      }
    }
  }

  // ── Final fallback: admin password stored in Settings ────────────────────
  const settings = await SettingsDB.get();
  const adminPassword = settings.adminPassword ?? "admin2024";
  if (await checkPassword(password, adminPassword)) {
    const token = await createSessionToken("admin", "admin");
    const response = NextResponse.json({ ok: true, role: "admin", name: "Administrador" });
    response.cookies.set(SESSION.COOKIE_NAME, token, makeCookie(token));
    return response;
  }

  return NextResponse.json({ error: "incorrect credentials" }, { status: 401 });
}

