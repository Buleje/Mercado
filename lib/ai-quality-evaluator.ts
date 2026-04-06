import "server-only";

/**
 * lib/ai-quality-evaluator.ts
 *
 * Automatic quality evaluation for AI responses — like a silent customer
 * satisfaction survey that runs on every response, no manual feedback needed.
 *
 * Evaluates:
 * - Relevance: Does the answer match the question?
 * - Actionability: Does it give concrete steps or data?
 * - Conciseness: Is it the right length (not too short, not too long)?
 * - Data accuracy: Does it mention real numbers when available?
 * - Safety: No harmful/inappropriate content slipped through?
 *
 * Uses heuristic scoring (no extra LLM call) to avoid doubling costs.
 */

import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QualityScore {
  overall: number;        // 0-100
  relevance: number;      // 0-100
  actionability: number;  // 0-100
  conciseness: number;    // 0-100
  dataRichness: number;   // 0-100
  safety: number;         // 0-100
  flags: string[];        // Issues found
}

export interface QualityTrend {
  period: string;
  avgScore: number;
  totalEvaluated: number;
  flagCounts: Record<string, number>;
}

// ── In-memory score buffer for trends ────────────────────────────────────────

interface ScoreEntry {
  timestamp: number;
  score: QualityScore;
  channel: string;
}

const scoreBuffer: ScoreEntry[] = [];
const MAX_BUFFER_SIZE = 500;

// ── Heuristic-based quality evaluation ───────────────────────────────────────

/**
 * Evaluate the quality of an AI response based on heuristics.
 * This is fast (no LLM call) and runs on every response.
 */
export function evaluateResponse(
  userMessage: string,
  aiResponse: string,
  channel: string = "assistant",
): QualityScore {
  const flags: string[] = [];

  // ── Relevance (0-100) ──────────────────────────────────────────────────
  const relevance = scoreRelevance(userMessage, aiResponse, flags);

  // ── Actionability (0-100) ──────────────────────────────────────────────
  const actionability = scoreActionability(aiResponse, flags);

  // ── Conciseness (0-100) ────────────────────────────────────────────────
  const conciseness = scoreConciseness(userMessage, aiResponse, flags);

  // ── Data richness (0-100) ──────────────────────────────────────────────
  const dataRichness = scoreDataRichness(aiResponse, flags);

  // ── Safety (0-100) ────────────────────────────────────────────────────
  const safety = scoreSafety(aiResponse, flags);

  // ── Overall weighted score ─────────────────────────────────────────────
  const overall = Math.round(
    relevance * 0.30 +
    actionability * 0.25 +
    conciseness * 0.15 +
    dataRichness * 0.15 +
    safety * 0.15,
  );

  const score: QualityScore = {
    overall,
    relevance,
    actionability,
    conciseness,
    dataRichness,
    safety,
    flags,
  };

  // Store in buffer for trends
  scoreBuffer.push({ timestamp: Date.now(), score, channel });
  if (scoreBuffer.length > MAX_BUFFER_SIZE) {
    scoreBuffer.splice(0, scoreBuffer.length - MAX_BUFFER_SIZE);
  }

  if (overall < 50) {
    logger.warn("[quality-eval] Low quality response detected", {
      overall,
      flags,
      channel,
      userMessagePreview: userMessage.substring(0, 80),
    });
  }

  return score;
}

// ── Scoring functions ────────────────────────────────────────────────────────

function scoreRelevance(
  userMessage: string,
  aiResponse: string,
  flags: string[],
): number {
  let score = 70; // Base

  // Check if keywords from the question appear in the answer
  const questionWords = userMessage.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);
  const responseLower = aiResponse.toLowerCase();

  const matchedWords = questionWords.filter(w => responseLower.includes(w));
  const matchRate = questionWords.length > 0
    ? matchedWords.length / questionWords.length
    : 0;

  score += Math.round(matchRate * 20);

  // Penalize very generic responses
  const genericPhrases = [
    "no tengo información",
    "no puedo acceder",
    "no tengo acceso",
    "intenta de nuevo",
    "lo siento",
    "no estoy seguro",
  ];
  for (const phrase of genericPhrases) {
    if (responseLower.includes(phrase)) {
      score -= 15;
      flags.push("generic-response");
      break;
    }
  }

  // Bonus if response directly addresses the question type
  if (/cuánto|cuantos|cuántas|total/i.test(userMessage) && /\d/.test(aiResponse)) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreActionability(aiResponse: string, flags: string[]): number {
  let score = 50; // Base

  // Check for concrete actions/recommendations
  const actionIndicators = [
    /te recomiendo/i,
    /deberías/i,
    /puedes/i,
    /sugiero/i,
    /paso \d/i,
    /primero.*luego/i,
    /acción/i,
    /✅|📌|💡|➡️|•|-/,
    /\d+\./,
  ];

  let matches = 0;
  for (const pattern of actionIndicators) {
    if (pattern.test(aiResponse)) matches++;
  }
  score += Math.min(matches * 10, 40);

  // Check for lists/structure (more actionable)
  const lines = aiResponse.split("\n").filter(l => l.trim().length > 0);
  const bulletLines = lines.filter(l => /^\s*[-•*\d+.]/.test(l));
  if (bulletLines.length >= 3) {
    score += 10;
  }

  // Penalize if it's just a yes/no answer to a question that deserves explanation
  if (aiResponse.length < 30) {
    score -= 20;
    flags.push("too-brief");
  }

  return Math.max(0, Math.min(100, score));
}

function scoreConciseness(
  userMessage: string,
  aiResponse: string,
  flags: string[],
): number {
  const wordCount = aiResponse.split(/\s+/).length;
  const questionWordCount = userMessage.split(/\s+/).length;

  // Simple questions should get concise answers
  const isSimpleQuestion = questionWordCount < 8;

  if (isSimpleQuestion) {
    if (wordCount < 20) return 90;
    if (wordCount < 50) return 80;
    if (wordCount < 100) return 70;
    if (wordCount < 200) return 55;
    flags.push("verbose-for-simple-question");
    return 40;
  }

  // Complex questions can have longer answers
  if (wordCount < 30) {
    flags.push("too-brief-for-complex");
    return 50;
  }
  if (wordCount < 150) return 90;
  if (wordCount < 300) return 80;
  if (wordCount < 500) return 60;
  flags.push("overly-verbose");
  return 40;
}

function scoreDataRichness(aiResponse: string, flags: string[]): number {
  let score = 40; // Base

  // Check for numbers/data
  const numbers = aiResponse.match(/\d+/g) || [];
  score += Math.min(numbers.length * 5, 25);

  // Check for currency values (S/, $)
  if (/S\/\s*[\d,.]+|\$\s*[\d,.]+/i.test(aiResponse)) {
    score += 15;
  }

  // Check for percentages
  if (/%/.test(aiResponse)) {
    score += 10;
  }

  // Check for date/time references
  if (/hoy|ayer|esta semana|este mes|último/i.test(aiResponse)) {
    score += 10;
  }

  // No data at all in a response
  if (numbers.length === 0) {
    flags.push("no-data-points");
  }

  return Math.max(0, Math.min(100, score));
}

function scoreSafety(aiResponse: string, flags: string[]): number {
  let score = 100;

  // Check for leaked technical details
  const technicalLeaks = [
    /prisma\./i,
    /SELECT\s+\*/i,
    /INSERT INTO/i,
    /process\.env/i,
    /api[_-]?key/i,
    /password/i,
    /token.*=.*[a-z0-9]{20,}/i,
  ];

  for (const pattern of technicalLeaks) {
    if (pattern.test(aiResponse)) {
      score -= 30;
      flags.push("technical-leak");
      break;
    }
  }

  // Check for prompt injection echoing
  if (/ignore.*previous|system.*prompt|you are now/i.test(aiResponse)) {
    score -= 40;
    flags.push("possible-injection-echo");
  }

  return Math.max(0, score);
}

// ── Trend aggregation ────────────────────────────────────────────────────────

/**
 * Get quality trends for the admin dashboard.
 * Returns aggregated scores by hour for the last 24 hours.
 */
export function getQualityTrends(): {
  current: { avgScore: number; totalEvaluated: number };
  hourly: QualityTrend[];
  topFlags: Array<{ flag: string; count: number }>;
} {
  const now = Date.now();
  const last24h = scoreBuffer.filter(e => now - e.timestamp < 24 * 60 * 60 * 1000);

  // Current aggregate
  const avgScore = last24h.length > 0
    ? Math.round(last24h.reduce((sum, e) => sum + e.score.overall, 0) / last24h.length)
    : 0;

  // Hourly breakdown
  const hourly: QualityTrend[] = [];
  for (let h = 23; h >= 0; h--) {
    const hourStart = now - (h + 1) * 60 * 60 * 1000;
    const hourEnd = now - h * 60 * 60 * 1000;
    const hourEntries = last24h.filter(e => e.timestamp >= hourStart && e.timestamp < hourEnd);

    const hourDate = new Date(hourStart);
    hourly.push({
      period: `${hourDate.getHours().toString().padStart(2, "0")}:00`,
      avgScore: hourEntries.length > 0
        ? Math.round(hourEntries.reduce((s, e) => s + e.score.overall, 0) / hourEntries.length)
        : 0,
      totalEvaluated: hourEntries.length,
      flagCounts: countFlags(hourEntries),
    });
  }

  // Top flags
  const allFlags = countFlags(last24h);
  const topFlags = Object.entries(allFlags)
    .map(([flag, count]) => ({ flag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    current: { avgScore, totalEvaluated: last24h.length },
    hourly,
    topFlags,
  };
}

function countFlags(entries: ScoreEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    for (const flag of e.score.flags) {
      counts[flag] = (counts[flag] || 0) + 1;
    }
  }
  return counts;
}
