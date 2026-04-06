# ADR-002: Stateless JWT Sessions with HMAC-SHA256

## Status: Accepted (2024), Updated (2026-04 — refresh token rotation added)

## Context
The admin panel needs authentication that works across serverless functions without a session store.

## Decision
Custom HMAC-SHA256 signed tokens stored in httpOnly cookies. No JWT library — raw crypto.subtle for Edge runtime compatibility. Access tokens (15 min) + refresh tokens (7 days) with rotation.

## Consequences
- ✅ Works in Edge and Node.js runtimes
- ✅ Zero dependencies (no jsonwebtoken, no next-auth)
- ✅ Stateless — no session store needed
- ✅ Refresh rotation prevents token replay
- ⚠️ Cannot revoke individual sessions (would need a blocklist)
- ⚠️ Token payload is base64 (not encrypted, just signed)
