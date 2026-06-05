// This file owns the user-visible strings and synthetic prompt content for crosstalk.

import type { BatchedQuestion, HandledMessage, Pipeline, SharedMessage, SharedSession, Task, UserMessage } from './types';

const DEFAULT_MODEL_ID = 'unknown';
const DEFAULT_PROVIDER_ID = 'unknown';

export const MAX_MESSAGE_LENGTH = 10000;
export const MAX_STATUS_LENGTH = 300;
export const DEFAULT_ROOM = 'default';

export const SYSTEM_PROMPT = `<instructions tool="crosstalk">
# Crosstalk

You are joined to a shared crosstalk room.

## Messaging

Use \`broadcast\` to communicate with other joined sessions:
- \`broadcast(message="...")\` updates your visible status
- \`broadcast(send_to="name", message="...")\` sends a direct message
- \`broadcast(reply_to=1, message="...")\` replies to a received message and automatically targets the sender

Messages arrive as a synthetic \`broadcast\` tool result with this shape:
\`\`\`
{
  "you_are": "your registered name",
  "sessions": [{ "name": "other", "status": ["..."], "idle": true }],
  "messages": [{ "id": 1, "from": "other", "content": "..." }]
}
\`\`\`

When you receive a direct message, answer with \`broadcast(reply_to=<id>, message="...")\` or send a new direct message with \`send_to\`.

## Pipelines

You can create and manage autonomous feature pipelines:

- \`pipeline(action="create", title="...")\` — start a new pipeline
- \`pipeline(action="status")\` — check pipeline progress
- \`task(action="create", pipeline_id="...", title="...", role="builder", ...)\` — add a task
- \`task(action="claim", pipeline_id="...", task_id="...")\` — pick up work
- \`task(action="complete", pipeline_id="...", task_id="...", output={...})\` — finish work
- \`question(action="ask", pipeline_id="...", task_id="...", question="...", context="...")\` — ask the user
- \`question(action="answer", pipeline_id="...", question_id="...", answer="...")\` — answer a question

When you receive a task assignment via broadcast, claim it, do the work, then complete with structured output.
</instructions>`;

export const BROADCAST_DESCRIPTION =
  "Communicate with other joined crosstalk sessions. Omit send_to for a status update, use send_to for a direct message, or use reply_to to answer a received message.";

export const JOIN_USAGE =
  'Usage: /crosstalk join [--room ROOM] [name...] | /crosstalk status | /crosstalk inbox | /crosstalk drop';
export const NOT_JOINED = "This session is not joined. Use /crosstalk join first.";
export const SELF_MESSAGE = "Warning: You cannot send a message to yourself.";
export const MISSING_MESSAGE = "Error: 'message' parameter is required.";
export const UNKNOWN_REPLY = "Error: Unknown reply target.";

function peerLines(peers: SharedSession[]): string[] {
  if (peers.length === 0) {
    return ['No other joined sessions yet.'];
  }

  const lines = ['Other joined sessions:'];
  for (const peer of peers) {
    const state = peer.status === 'idle' ? 'idle' : 'busy';
    lines.push(`- ${peer.alias} (${state})`);
    for (const status of peer.history) {
      lines.push(`  -> ${status}`);
    }
  }

  return lines;
}

export function joinResult(self: string, room: string, peers: SharedSession[], messages: SharedMessage[]): string {
  const lines = [`Joined crosstalk room ${room} as ${self}.`, '', `Open messages: ${messages.length}`, ''];
  lines.push(...peerLines(peers));
  return lines.join('\n');
}

export function statusResult(self: string, room: string, peers: SharedSession[], messages: SharedMessage[]): string {
  const lines = [`You are ${self} in room ${room}.`, '', `Open messages: ${messages.length}`, ''];
  lines.push(...peerLines(peers));
  return lines.join('\n');
}

export function inboxResult(self: string, room: string, messages: SharedMessage[]): string {
  const lines = [`Broadcast inbox for ${self}`, `Room: ${room}`];

  if (messages.length === 0) {
    lines.push('', 'No unread messages.');
    return lines.join('\n');
  }

  lines.push('', 'Open messages:');
  for (const message of messages) {
    lines.push(`- #${message.msgIndex} from ${message.from}: "${message.body}"`);
  }

  return lines.join('\n');
}

export function normalizeMessage(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}... [truncated]`;
}

export function unknownRecipient(name: string, peers: SharedSession[]): string {
  if (peers.length === 0) {
    return `Error: Unknown recipient \"${name}\". No other joined sessions are available.`;
  }

  return `Error: Unknown recipient \"${name}\". Known sessions: ${peers.map((peer) => peer.alias).join(', ')}`;
}

export function broadcastResult(
  self: string,
  peers: SharedSession[],
  recipients: string[],
  handled?: HandledMessage,
): string {
  const lines = [`You are: ${self}`];

  if (peers.length === 0) {
    lines.push('', 'No other joined sessions available.');
  }

  if (peers.length > 0) {
    lines.push('', 'Available sessions:');
    for (const peer of peers) {
      const state = peer.status === 'idle' ? 'idle' : 'busy';
      lines.push(`- ${peer.alias} (${state})`);
      for (const status of peer.history) {
        lines.push(`  -> ${status}`);
      }
    }
  }

  if (handled) {
    lines.push('', `Replied to #${handled.id} from ${handled.from}:`, `"${handled.body}"`);
    if (recipients.length > 0) {
      lines.push('', `Message sent to: ${recipients.join(', ')}`);
    }
    return lines.join('\n');
  }

  if (recipients.length > 0) {
    lines.push('', `Message sent to: ${recipients.join(', ')}`);
    return lines.join('\n');
  }

  lines.push('', 'Status updated.');
  return lines.join('\n');
}

export function wakePrompt(sender: string): string {
  return `[Crosstalk] New message from ${sender}. Check your broadcast inbox and reply there.`;
}

export function createInboxMessage(
  sessionId: string,
  alias: string,
  peers: SharedSession[],
  messages: SharedMessage[],
  lastUser: UserMessage,
): Record<string, unknown> {
  const now = Date.now();
  const info = lastUser.info;
  const output = JSON.stringify({
    you_are: alias,
    sessions: peers.map((peer) => ({
      name: peer.alias,
      status: peer.history.length > 0 ? peer.history : undefined,
      idle: peer.status === 'idle' || undefined,
    })),
    messages: messages.map((message) => ({
      id: message.msgIndex,
      from: message.from,
      content: message.body,
    })),
  });

  const messageId = `msg_crosstalk_${now}`;
  const partId = `part_crosstalk_${now}`;
  const callId = `call_crosstalk_${now}`;
  const title = messages.length > 0 ? `${messages.length} message(s)` : 'Crosstalk inbox';
  const assistant: Record<string, unknown> = {
    info: {
      id: messageId,
      sessionID: sessionId,
      role: 'assistant',
      agent: info.agent || 'code',
      parentID: info.id,
      modelID: info.model?.modelID || DEFAULT_MODEL_ID,
      providerID: info.model?.providerID || DEFAULT_PROVIDER_ID,
      mode: 'default',
      path: { cwd: '/', root: '/' },
      time: { created: now, completed: now },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      ...(info.variant !== undefined ? { variant: info.variant } : {}),
    },
    parts: [
      {
        id: partId,
        sessionID: sessionId,
        messageID: messageId,
        type: 'tool',
        callID: callId,
        tool: 'broadcast',
        state: {
          status: 'completed',
          input: { synthetic: true },
          output,
          title,
          metadata: {
            incoming_message: messages.length > 0,
            message_count: messages.length,
            session_count: peers.length,
          },
          time: { start: now, end: now },
        },
      },
    ],
  };

  return assistant;
}

// === Pipeline Result Formatters ===

export function pipelineCreatedResult(pipeline: Pipeline): string {
  const lines = [
    `Pipeline created: ${pipeline.title}`,
    `ID: ${pipeline.id}`,
    `State: ${pipeline.state}`,
    '',
    'Add tasks with task(action="create", ...) then start with pipeline(action="start").',
  ];
  return lines.join('\n');
}

export function pipelineStatusResult(pipeline: Pipeline): string {
  const lines = [
    `Pipeline: ${pipeline.title}`,
    `ID: ${pipeline.id}`,
    `State: ${pipeline.state}`,
    `Created: ${new Date(pipeline.createdAt).toISOString()}`,
    '',
  ];

  const tasks = Object.values(pipeline.tasks);
  if (tasks.length === 0) {
    lines.push('No tasks yet.');
  } else {
    lines.push(`Tasks (${tasks.length}):`);
    for (const task of tasks) {
      const status = task.state === 'done' ? 'done' : task.state === 'failed' ? 'FAILED' : task.state;
      const assignee = task.assignee ? ` → ${task.assignee}` : '';
      const deps = task.dependsOn.length > 0 ? ` [deps: ${task.dependsOn.join(', ')}]` : '';
      lines.push(`  - [${status}] ${task.title} (${task.role})${assignee}${deps}`);
    }
  }

  const unanswered = pipeline.questions.filter((q) => !q.answer);
  if (unanswered.length > 0) {
    lines.push('', `Pending questions: ${unanswered.length}`);
  }

  return lines.join('\n');
}

export function taskCreatedResult(task: Task, pipelineTitle: string): string {
  const lines = [
    `Task created in "${pipelineTitle}":`,
    `  ID: ${task.id}`,
    `  Title: ${task.title}`,
    `  Role: ${task.role}`,
    `  State: ${task.state}`,
  ];
  if (task.dependsOn.length > 0) {
    lines.push(`  Depends on: ${task.dependsOn.join(', ')}`);
  }
  return lines.join('\n');
}

export function taskClaimedResult(task: Task): string {
  return `Task claimed: "${task.title}" (ID: ${task.id})\nYou are now assigned. Do the work, then call task(action="complete") with your results.`;
}

export function taskCompletedResult(task: Task): string {
  const files = task.filesChanged && task.filesChanged.length > 0
    ? `\nFiles changed: ${task.filesChanged.join(', ')}`
    : '';
  return `Task completed: "${task.title}"${files}`;
}

export function taskFailedResult(task: Task): string {
  return `Task failed: "${task.title}"\nError: ${task.error || 'Unknown error'}`;
}

export function questionAskedResult(q: BatchedQuestion): string {
  const lines = [
    `Question added to pipeline:`,
    `  "${q.question}"`,
    `  Context: ${q.context}`,
  ];
  if (q.options && q.options.length > 0) {
    lines.push(`  Options: ${q.options.join(' | ')}`);
  }
  lines.push('', 'Answer with question(action="answer", ...)');
  return lines.join('\n');
}

export function questionBatchResult(questions: BatchedQuestion[]): string {
  if (questions.length === 0) {
    return 'No pending questions.';
  }

  const lines = [`Pending questions (${questions.length}):`];
  for (const q of questions) {
    lines.push('');
    lines.push(`  #${q.id} (task: ${q.taskId})`);
    lines.push(`  Q: ${q.question}`);
    lines.push(`  Context: ${q.context}`);
    if (q.options && q.options.length > 0) {
      lines.push(`  Options: ${q.options.join(' | ')}`);
    }
  }
  lines.push('', 'Answer each with question(action="answer", pipeline_id="...", question_id="...", answer="...")');
  return lines.join('\n');
}

export function pipelineCompleteResult(pipeline: Pipeline): string {
  const tasks = Object.values(pipeline.tasks);
  const done = tasks.filter((t) => t.state === 'done').length;
  const failed = tasks.filter((t) => t.state === 'failed').length;

  const lines = [
    `Pipeline complete: ${pipeline.title}`,
    `ID: ${pipeline.id}`,
    `Result: ${failed > 0 ? `${failed} task(s) failed` : 'All tasks completed'}`,
    '',
    `Tasks: ${done}/${tasks.length} done`,
  ];

  for (const task of tasks) {
    const icon = task.state === 'done' ? 'done' : 'FAILED';
    const files = task.filesChanged && task.filesChanged.length > 0 ? ` (${task.filesChanged.length} files)` : '';
    lines.push(`  - [${icon}] ${task.title}${files}`);
  }

  return lines.join('\n');
}

export function taskListResult(pipelines: Pipeline[]): string {
  const lines = [`Pipelines (${pipelines.length}):`];

  for (const p of pipelines) {
    const tasks = Object.values(p.tasks);
    const done = tasks.filter((t) => t.state === 'done').length;
    const active = tasks.filter((t) => t.state === 'claimed' || t.state === 'running').length;
    const pending = tasks.filter((t) => t.state === 'pending').length;
    const failed = tasks.filter((t) => t.state === 'failed').length;

    lines.push('');
    lines.push(`  [${p.state.toUpperCase()}] ${p.title} (ID: ${p.id})`);
    lines.push(`    Tasks: ${done} done / ${active} active / ${pending} pending / ${failed} failed / ${tasks.length} total`);

    for (const task of tasks) {
      const icon = task.state === 'done' ? '+' : task.state === 'failed' ? '!' : task.state === 'claimed' ? '*' : '-';
      const agent = task.assignee ? ` (${task.assignee})` : '';
      const deps = task.dependsOn.length > 0 ? ` [deps: ${task.dependsOn.length}]` : '';
      lines.push(`    [${icon}] ${task.title}${agent}${deps} — ${task.state}`);
    }
  }

  return lines.join('\n');
}
