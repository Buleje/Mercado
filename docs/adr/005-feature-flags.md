# ADR-005: Lightweight Feature Flags via Environment Variables

## Status: Accepted (2026-04)

## Context
Need to enable trunk-based development with features hidden behind flags. Options: LaunchDarkly (SaaS), Unleash (self-hosted), or env-var based.

## Decision
Simple `lib/feature-flags.ts` module with typed flag names, env var overrides (FEATURE_X=true), and hardcoded defaults. No external dependency.

## Consequences
- ✅ Zero cost, zero latency
- ✅ Type-safe flag names
- ✅ Easy to migrate to LaunchDarkly/Unleash later
- ⚠️ No per-tenant overrides yet (planned)
- ⚠️ No analytics on flag usage
- ⚠️ Requires redeploy to change flags (unless using Vercel env vars)
