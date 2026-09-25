/**
 * Post-commit auto-review hook
 *
 * Trigger: After any successful git commit (PostToolUse on Bash containing "git commit")
 * Action: Suggests running code-reviewer on the committed changes
 *
 * This hook does NOT block — it emits a recommendation after the commit succeeds.
 * The agent decides whether to act on it based on task complexity.
 */

export default {
  name: "post-commit-review",
  description: "Auto-suggest code review after git commits",

  // Match Bash tool calls that contain git commit
  hooks: [
    {
      event: "PostToolUse",
      matcher: {
        toolName: "Bash",
        command: "git commit"
      },
      handler: async ({ toolInput, toolOutput }) => {
        // Only trigger on successful commits (exit code 0)
        if (toolOutput?.exitCode !== 0) return;

        // Extract commit info from output
        const output = toolOutput?.stdout || "";

        // Don't trigger on merge commits or doc-only commits
        if (output.includes("Merge") || output.includes("docs:")) return;

        // Don't trigger on chore commits (low risk)
        if (output.includes("chore:") || output.includes("style:")) return;

        return {
          message: [
            "Post-commit review recommendation:",
            "Consider running code-reviewer agent on this commit for quality assurance.",
            "For feat/fix commits touching critical zones, this is MANDATORY per Regla 14.",
            "Command: Agent({ subagent_type: 'code-reviewer', prompt: 'Review latest commit' })"
          ].join("\n")
        };
      }
    }
  ]
};
