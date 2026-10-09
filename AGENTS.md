# Agent Operating Rules & Constraints

## CRITICAL: Forbidden Commands (Zero Tolerance)
The following commands are strictly prohibited from execution:
- `git checkout` (on files or branches)
- `git restore`
- `git reset` (hard, soft, or mixed)
- `git clean`
- `git stash drop` or `git stash pop`
- `git push`

Under NO circumstances may an agent discard, overwrite, or revert working tree changes using git. All file edits must be performed strictly through IDE file editing tools upon explicit user request.

## Interaction Rules
1. **Questions are not change requests**: If a user message contains a question mark (`?`) or asks for advice/opinions, provide an explanation or answer in chat ONLY. Do NOT touch any code or run any file modifications.
2. **Explicit confirmation required**: Only edit files when the user explicitly instructs to update, change, or write code.
3. **NO BACKGROUND OR SPECULATIVE EDITS**: Agents must NEVER edit files in the background, run autonomous refactoring loops, or modify multiple files speculatively. Work strictly under the user's direct, step-by-step guidance.
4. **One step at a time**: Make only the single edit explicitly requested by the user, and stop immediately to let the user verify in their browser/terminal.
5. **No remote actions**: Never push to remote repositories or trigger remote deployments.

