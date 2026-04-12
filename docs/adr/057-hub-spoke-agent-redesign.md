# ADR-057: Hub & Spoke Agent Redesign

## Status
Accepted

## Date
2026-04-12

## Context
The project has 38 agents with 9 static squads, 28 static routing rules in orchestrator-config.json, and an escalation chain referencing phantom agents. Agent Teams Level 3 is enabled but misconfigured (teammateMode in env vars instead of ~/.claude.json). The result: confusion about which agent to use, poor coordination between agents, wasted tokens on routing overhead, and broken squads referencing deleted agents.

## Decision
Consolidate 38 agents into 15 using a Hub & Spoke architecture:
- 3 Hubs: BUILD (5 teammates), QUALITY (4), OPS (3)
- 1 Director (Opus) as sole orchestrator with dynamic decision tree routing
- 1 Healer (Sonnet) for auto-repair
- Native Agent Teams coordination via TeamCreate + SendMessage
- Streaming sprint pipeline (features flow BUILD→QUALITY→OPS individually)
- Eliminate orchestrator-config.json (replaced by Director decision tree)
- Eliminate a2a-state.json (replaced by native SendMessage)

## Consequences
### Positive
- 61% fewer agents (38→15): less confusion, lower maintenance
- Dynamic routing via Director instead of static JSON: more flexible, self-updating
- Native Agent Teams coordination: real-time SendMessage vs file-based polling
- Streaming pipeline: features enter next phase without waiting for batch
- Proper teammateMode configuration
- Fallback chain with real agents (no phantoms)

### Negative
- Migration effort: 4 phases over multiple sessions
- Temporary coexistence of old and new agents during migration
- Loss of granular agent specialization (mitigated by on-demand skills)
- Learning curve for new Hub model

## Alternatives Considered
1. **Surgical Fix Only** — Fix broken references without restructuring. Low effort but doesn't reduce complexity.
2. **Autonomous Swarm** — 8 polymath agents with full mesh communication. Too experimental, unpredictable token cost.

## References
- Spec: docs/superpowers/specs/2026-04-12-agent-hub-spoke-redesign-design.md
- Plan: docs/superpowers/plans/2026-04-12-agent-hub-spoke-redesign.md
- Claude Code Agent Teams docs: https://code.claude.com/docs/en/agent-teams
