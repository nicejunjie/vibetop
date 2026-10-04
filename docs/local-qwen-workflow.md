# Local Qwen work handoff

Use `jcoder qwen` for bounded work with a checkable result: a small test, a focused patch, or a source-backed inventory. Give it an isolated copy or worktree, exact files, one deliverable, and the command that determines success. Review its output and run that command independently before bringing a change into the project.

The iOS 27 keyboard exercise showed why the acceptance check must observe the *effect*, not merely the attempted action. An XCTest keyboard object can exist below the screen; require substantial intersection with the display and a shrunken visual viewport. Confirm the active app before interpreting a tap. Confirm a reload with a new page request. Locate repeated controls by their visible frame and `isHittable`, not label alone. If an observation is missing, report the case as unverified.

Keep exploratory audits separate from implementation. An audit finding needs a real trigger, source location, current and expected behavior, and a runnable reproduction or device evidence. A plausible input invented by the model is a hypothesis, not a bug. Broad requests to "test everything" or "find any issue" encourage long searches and weak conclusions.

For a local run, set the task scope in a short `TASK.md` and enforce the time limit outside the model. The wrapper accepts `JCODER_CLAUDE_EFFORT=low` for small tasks:

```sh
JCODER_CLAUDE_EFFORT=low timeout -s INT -k 10s 240s \
  jcoder qwen -p 'Read TASK.md, produce the one requested artifact, run its check, then stop.'
```

The prompt should name: allowed files, forbidden edits, the output artifact, exact validation command, and what to say when proof is unavailable. A prompt-only limit on tool calls is insufficient; use an outer timeout. If the run times out after writing a partial artifact, inspect the diff and run validation yourself. Never count a timed-out or unexecuted test as passed.

The useful artifact in this exercise was one regression test using measured iOS 27 viewport values in `shell/keybar.test.js`. Qwen wrote it just before the timeout; the reviewer checked the diff and ran the test. The open-ended audit took much longer and produced no verified defect. Prefer the former shape of task until a more reliable audit workflow is demonstrated.
