# Crosstalk

`crosstalk` is an OpenCode plugin that enables cross-session messaging and autonomous pipeline orchestration.

## Features

- **Cross-session messaging** via `broadcast` tool — agents can talk to each other
- **DAG-based pipelines** — decompose features into parallel tasks with dependencies
- **Batched questions** — pause pipelines for clarification at ambiguous points
- **Task lifecycle** — create, claim, complete, fail tasks across agents

## Commands

### Messaging

- `/crosstalk join [--room ROOM] [name...]` — join a named room
- `/crosstalk status` — show room, peers, and unread count
- `/crosstalk inbox` — read messages and mark as presented
- `/crosstalk drop` — leave the room

### Pipelines

- `/crosstalk pipeline` — show pipeline summary
- `/crosstalk pipeline questions` — list pending questions across pipelines
- `/crosstalk pipeline list` — show all tasks across all pipelines with status
- `/crosstalk pipeline cancel <pipeline_id>` — cancel a pipeline (marks all tasks failed)

## Tools

### broadcast

Send messages between sessions.

- `broadcast(message="...")` — update your status
- `broadcast(send_to="name", message="...")` — direct message
- `broadcast(reply_to=1, message="...")` — reply to a received message

### pipeline

Manage feature implementation pipelines.

- `pipeline(action="create", title="...")` — create a new pipeline
- `pipeline(action="start", pipeline_id="...")` — start pipeline (advances from planning)
- `pipeline(action="status", pipeline_id="...")` — get pipeline status and task summary
- `pipeline(action="cancel", pipeline_id="...")` — cancel pipeline

### task

Manage tasks within a pipeline.

- `task(action="create", pipeline_id="...", title="...", description="...", role="planner|builder|tester")` — create a task
- `task(action="create", pipeline_id="...", title="...", description="...", role="...", depends_on="task_id1,task_id2")` — create a task with dependencies
- `task(action="claim", pipeline_id="...", task_id="...")` — claim a task
- `task(action="update", pipeline_id="...", task_id="...", state="running|done|failed")` — update task state
- `task(action="complete", pipeline_id="...", task_id="...", output="...", files_changed="...")` — complete a task with results

### question

Ask clarifying questions during pipeline execution.

- `question(action="ask", pipeline_id="...", task_id="...", question="...", context="...", options="opt1,opt2")` — add a question
- `question(action="answer", pipeline_id="...", question_id="...", answer="...")` — answer a question
- `question(action="list", pipeline_id="...")` — list pending questions

## Architecture

### Agent Roles

- **orchestrator** — coordinates overall pipeline, delegates to planner
- **planner** — breaks features into tasks with dependencies
- **builder** — implements code for tasks
- **tester** — validates implementations, writes tests

### Pipeline States

```
planning → questions → running → done
                    ↘          ↗
                     → failed →
```

### Task States

```
pending → claimed → running → done
  ↓                              ↓
  └──────────── failed ──────────┘
```

### Persistence

All state is stored in `room.json` under the crosstalk directory (default: `~/.opencode/crosstalk/`). File locking ensures atomic updates across concurrent sessions.

## Testing

```bash
bun test                    # run all tests
bun run build               # build + type check
```

## Installation

Add to your opencode config:

```json
{
  "plugin": ["/path/to/crosstalk"]
}
```

Then restart opencode. Use `/crosstalk join` to get started.
