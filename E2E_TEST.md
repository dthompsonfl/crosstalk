# End-to-End Test Prompt for Crosstalk Pipeline System

Copy and paste the following into opencode to verify all tools and commands work.

## Prerequisites
- Two opencode sessions open (call them Session A and Session B)
- Crosstalk plugin installed and loaded

---

## Session A

```
/crosstalk join alpha
```

Expected: "Joined crosstalk room default as alpha."

```
/crosstalk status
```

Expected: Shows alpha joined, no peers yet.

---

## Session B

```
/crosstalk join beta
```

Expected: "Joined crosstalk room default as beta."

```
/crosstalk status
```

Expected: Shows beta joined, alpha is a peer.

---

## Session A — Create a pipeline

Use the pipeline tool to create an "Auth Feature" pipeline, add tasks with dependencies, ask a question, and verify everything works.

```
pipeline(action="create", title="Auth Feature")
```

Expected: Pipeline created with ID, state: planning.

Copy the pipeline ID from the response. Replace `<PIPELINE_ID>` below with it.

```
task(action="create", pipeline_id="<PIPELINE_ID>", title="Design auth flow", description="Plan the authentication architecture", role="planner")
```

Expected: Task created with ID, state: pending.

Copy the task ID. Replace `<TASK1_ID>` below.

```
task(action="create", pipeline_id="<PIPELINE_ID>", title="Implement auth", description="Build the auth module", role="builder", depends_on="<TASK1_ID>")
```

Expected: Task created, depends_on shows TASK1_ID.

```
question(action="ask", pipeline_id="<PIPELINE_ID>", task_id="<TASK1_ID>", question="Should we use OAuth or email/password auth?", context="Authentication method choice for the new feature", options="OAuth,Email/Password,Both")
```

Expected: Question added to pipeline.

```
pipeline(action="status", pipeline_id="<PIPELINE_ID>")
```

Expected: Shows pipeline in "questions" state with 1 task pending, 1 question pending.

---

## Session B — Answer the question

```
/crosstalk pipeline questions
```

Expected: Shows the pending question from Session A.

```
question(action="list", pipeline_id="<PIPELINE_ID>")
```

Expected: Shows pending question with ID.

Copy the question ID. Replace `<QUESTION_ID>` below.

```
question(action="answer", pipeline_id="<PIPELINE_ID>", question_id="<QUESTION_ID>", answer="OAuth")
```

Expected: "Question answered: ... → OAuth"

```
pipeline(action="status", pipeline_id="<PIPELINE_ID>")
```

Expected: Pipeline state is now "running".

---

## Session A — Claim and complete tasks

```
task(action="claim", pipeline_id="<PIPELINE_ID>", task_id="<TASK1_ID>")
```

Expected: "Task claimed" — you are now assigned.

```
task(action="update", pipeline_id="<PIPELINE_ID>", task_id="<TASK1_ID>", state="running")
```

Expected: Task state updated to running.

```
task(action="complete", pipeline_id="<PIPELINE_ID>", task_id="<TASK1_ID>", output='{"architecture":"OAuth2 with PKCE","files":["docs/auth-design.md"]}', files_changed="docs/auth-design.md")
```

Expected: Task completed.

```
pipeline(action="status", pipeline_id="<PIPELINE_ID>")
```

Expected: Task 1 done, Task 2 (implement auth) is now ready to claim.

---

## Session B — List all tasks

```
/crosstalk pipeline list
```

Expected: Shows pipeline "Auth Feature" with Task 1 done (+), Task 2 pending (-).

```
task(action="claim", pipeline_id="<PIPELINE_ID>", task_id="<TASK2_ID>")
```

(Assume TASK2_ID is the "Implement auth" task — copy from pipeline list output.)

Expected: Task claimed.

```
task(action="complete", pipeline_id="<PIPELINE_ID>", task_id="<TASK2_ID>", output='{"filesCreated":3}', files_changed="src/auth.ts,src/routes.ts,src/middleware.ts")
```

Expected: Task completed.

```
pipeline(action="status", pipeline_id="<PIPELINE_ID>")
```

Expected: Pipeline state is "done". All tasks complete.

---

## Verification Checklist

After running the full flow, verify:

- [ ] Both sessions joined successfully
- [ ] `/crosstalk status` shows peer list
- [ ] Pipeline created with unique ID
- [ ] Tasks created with dependencies
- [ ] Question added and visible via `/crosstalk pipeline questions`
- [ ] Question answered and pipeline advanced to "running"
- [ ] Tasks claimed by different agents
- [ ] Tasks completed with output and files
- [ ] Pipeline state transitions: planning → questions → running → done
- [ ] `/crosstalk pipeline list` shows all tasks with status icons
- [ ] No errors in any tool calls
