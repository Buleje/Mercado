/**
 * Shared DB retry utility with exponential backoff.
 * Use for any database operation that may fail due to transient connection issues.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isConnectionError =
        err instanceof Error &&
        (err.message.includes("Connection") ||
          err.message.includes("ECONNREFUSED") ||
          err.message.includes("ETIMEDOUT") ||
          err.message.includes("connection") ||
          err.message.includes("timeout") ||
          err.message.includes("fetch failed") ||
          err.message.includes("socket hang up"));
      if (!isConnectionError || i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 300 * Math.pow(2, i))); // 300ms, 600ms
    }
  }
  throw new Error("Unreachable");
}
