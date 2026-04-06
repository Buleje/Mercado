/**
 * Session & Refresh Token rotation — unit tests
 *
 * Covers:
 *   - createSessionToken() / getSessionPayload() round-trip
 *   - createRefreshToken() / getRefreshPayload() round-trip
 *   - Token type enforcement (refresh rejects access, etc.)
 *   - Expiry validation (access = 15 min, refresh = 7 days)
 *   - Tampered token rejection
 *   - Role validation
 *   - SESSION / REFRESH config constants
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests-minimum-32-chars";
});

// ─────────────────────────────────────────────────────────────────────────────
// Imports — must come after env setup so getSecret() picks up AUTH_SECRET
// ─────────────────────────────────────────────────────────────────────────────

import {
  createSessionToken,
  createRefreshToken,
  getSessionPayload,
  getRefreshPayload,
  SESSION,
  REFRESH,
} from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("lib/session.ts — token creation & verification", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Config constants ─────────────────────────────────────────────────────

  describe("SESSION / REFRESH constants", () => {
    it('SESSION.COOKIE_NAME equals "bsm-admin-sess"', () => {
      expect(SESSION.COOKIE_NAME).toBe("bsm-admin-sess");
    });

    it('REFRESH.COOKIE_NAME equals "bsm-admin-refresh"', () => {
      expect(REFRESH.COOKIE_NAME).toBe("bsm-admin-refresh");
    });

    it("SESSION.MAX_AGE is 900 (15 min in seconds)", () => {
      expect(SESSION.MAX_AGE).toBe(900);
    });

    it("REFRESH.MAX_AGE is 604800 (7 days in seconds)", () => {
      expect(REFRESH.MAX_AGE).toBe(604800);
    });
  });

  // ── Access token round-trip ──────────────────────────────────────────────

  describe("createSessionToken() + getSessionPayload()", () => {
    it("creates a valid token that getSessionPayload() can decode", async () => {
      const token = await createSessionToken("cajero", "juan", "tenant-1", "Juan");
      const payload = await getSessionPayload(token);

      expect(payload).not.toBeNull();
      expect(payload!.role).toBe("cajero");
      expect(payload!.username).toBe("juan");
      expect(payload!.tenantId).toBe("tenant-1");
      expect(payload!.name).toBe("Juan");
    });

    it("uses default values when arguments are omitted", async () => {
      const token = await createSessionToken();
      const payload = await getSessionPayload(token);

      expect(payload).not.toBeNull();
      expect(payload!.role).toBe("admin");
      expect(payload!.username).toBe("admin");
      expect(payload!.tenantId).toBe("main");
    });
  });

  // ── Refresh token round-trip ─────────────────────────────────────────────

  describe("createRefreshToken() + getRefreshPayload()", () => {
    it('creates a token with type "refresh" that getRefreshPayload() accepts', async () => {
      const token = await createRefreshToken("almacenero", "pedro", "tenant-2", "Pedro");
      const payload = await getRefreshPayload(token);

      expect(payload).not.toBeNull();
      expect(payload!.role).toBe("almacenero");
      expect(payload!.username).toBe("pedro");
      expect(payload!.tenantId).toBe("tenant-2");
      expect(payload!.name).toBe("Pedro");
    });

    it("accepts valid refresh tokens", async () => {
      const token = await createRefreshToken("admin", "admin", "main");
      const payload = await getRefreshPayload(token);
      expect(payload).not.toBeNull();
    });
  });

  // ── Type enforcement ─────────────────────────────────────────────────────

  describe("Token type enforcement", () => {
    it("getRefreshPayload() rejects access tokens (type !== 'refresh')", async () => {
      const accessToken = await createSessionToken("admin", "admin", "main");
      const payload = await getRefreshPayload(accessToken);
      expect(payload).toBeNull();
    });

    it("getSessionPayload() rejects refresh tokens", async () => {
      // getSessionPayload() rejects tokens with type === "refresh" to prevent
      // refresh tokens from being used as session tokens.
      const refreshToken = await createRefreshToken("admin", "admin", "main");
      const payload = await getSessionPayload(refreshToken);
      expect(payload).toBeNull();
    });
  });

  // ── Token expiry ─────────────────────────────────────────────────────────

  describe("Token expiry", () => {
    it("access token expires after 15 minutes", async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const token = await createSessionToken("admin", "admin", "main");

      // Still valid at 14 minutes
      vi.setSystemTime(now + 14 * 60 * 1000);
      const validPayload = await getSessionPayload(token);
      expect(validPayload).not.toBeNull();

      // Expired at 16 minutes
      vi.setSystemTime(now + 16 * 60 * 1000);
      const expiredPayload = await getSessionPayload(token);
      expect(expiredPayload).toBeNull();
    });

    it("refresh token expires after 7 days", async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const token = await createRefreshToken("admin", "admin", "main");

      // Still valid at 6 days
      vi.setSystemTime(now + 6 * 24 * 60 * 60 * 1000);
      const validPayload = await getRefreshPayload(token);
      expect(validPayload).not.toBeNull();

      // Expired at 8 days
      vi.setSystemTime(now + 8 * 24 * 60 * 60 * 1000);
      const expiredPayload = await getRefreshPayload(token);
      expect(expiredPayload).toBeNull();
    });
  });

  // ── Tampered tokens ──────────────────────────────────────────────────────

  describe("Tampered token rejection", () => {
    it("rejects a token whose payload was modified after signing", async () => {
      const token = await createSessionToken("admin", "admin", "main");
      const [encoded, sig] = token.split(".");

      // Decode, tamper, re-encode
      const decoded = JSON.parse(decodeURIComponent(escape(atob(encoded))));
      decoded.role = "owner"; // tamper the role
      const tampered = btoa(unescape(encodeURIComponent(JSON.stringify(decoded))));

      const tamperedToken = `${tampered}.${sig}`;
      const payload = await getSessionPayload(tamperedToken);
      expect(payload).toBeNull();
    });

    it("rejects a token with a truncated signature", async () => {
      const token = await createSessionToken("admin", "admin", "main");
      const dotIdx = token.lastIndexOf(".");
      const truncated = token.slice(0, dotIdx) + "." + token.slice(dotIdx + 1, dotIdx + 5);
      const payload = await getSessionPayload(truncated);
      expect(payload).toBeNull();
    });

    it("rejects a token without a dot separator", async () => {
      const payload = await getSessionPayload("nodots");
      expect(payload).toBeNull();
    });

    it("rejects an empty string token", async () => {
      const payload = await getSessionPayload("");
      expect(payload).toBeNull();
    });
  });

  // ── Role validation ──────────────────────────────────────────────────────

  describe("Role validation", () => {
    it("accepts all valid roles", async () => {
      const validRoles = ["admin", "cajero", "almacenero", "owner", "manager", "analista"] as const;
      for (const role of validRoles) {
        const token = await createSessionToken(role, "user", "main");
        const payload = await getSessionPayload(token);
        expect(payload).not.toBeNull();
        expect(payload!.role).toBe(role);
      }
    });

    it("rejects tokens with an invalid role (forged payload)", async () => {
      // Manually create a token with an invalid role by forging the payload
      const secret = process.env.AUTH_SECRET!;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const fakePayload = JSON.stringify({
        role: "superadmin", // not a valid role
        username: "hacker",
        tenantId: "main",
        name: "",
        type: "access",
        exp: Date.now() + 900_000,
      });
      const encoded = btoa(unescape(encodeURIComponent(fakePayload)));
      const rawSig = await crypto.subtle.sign("HMAC", key, enc.encode(encoded));
      const sig = btoa(String.fromCharCode(...new Uint8Array(rawSig)));

      const forgedToken = `${encoded}.${sig}`;
      const payload = await getSessionPayload(forgedToken);
      expect(payload).toBeNull();
    });
  });
});
