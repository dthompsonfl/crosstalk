// This file defines the SDK, hook, room, pipeline, and task types the plugin uses.

export interface ModelRef {
  providerID?: string;
  modelID?: string;
  variant?: unknown;
}

export interface SessionMessage {
  info: {
    id: string;
    role: string;
    sessionID: string;
    agent?: string;
    model?: ModelRef;
    variant?: unknown;
  };
  parts?: unknown[];
}

export interface PromptBody {
  noReply?: boolean;
  parts: Array<{ type: string; text?: string; ignored?: boolean }>;
  agent?: string;
  model?: { providerID?: string; modelID?: string };
}

export interface OpenCodeSessionClient {
  session: {
    prompt: (params: { path: { id: string }; body: PromptBody }) => Promise<{ data?: unknown }>;
    promptAsync?: (params: { path: { id: string }; body: PromptBody }) => Promise<{ data?: unknown }>;
    messages: (params: { path: { id: string } }) => Promise<{ data?: SessionMessage[] }>;
  };
}

export interface ToolContext {
  sessionID: string;
}

export interface Part {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface CommandInput {
  command: string;
  sessionID: string;
  arguments: string;
}

export interface CommandOutput {
  parts: Part[];
}

export interface ConfigTransformOutput {
  command?: Record<
    string,
    {
      description?: string;
      template: string;
      agent?: string;
      model?: string;
      subtask?: boolean;
    }
  >;
  experimental?: {
    subagent_tools?: string[];
    [key: string]: unknown;
  };
}

export interface UserMessage {
  info: {
    id: string;
    sessionID: string;
    role: string;
    agent?: string;
    model?: ModelRef;
    variant?: unknown;
  };
  parts: unknown[];
}

export interface MessagesTransformOutput {
  messages: UserMessage[];
}

export interface SystemTransformInput {
  sessionID?: string;
}

export interface SystemTransformOutput {
  system: string[];
}

export interface SessionStatusInput {
  sessionID: string;
  status: {
    type: 'idle' | 'busy' | 'retry';
  };
}

export interface SessionIdleInput {
  sessionID: string;
}

export interface SessionDeletedInput {
  sessionID: string;
}

export interface PluginEvent {
  type: string;
  properties: unknown;
}

export interface SharedSession {
  sessionId: string;
  alias: string;
  room: string;
  ownerPid?: number;
  joinedAt: number;
  updatedAt: number;
  heartbeatAt: number;
  status: 'idle' | 'busy';
  history: string[];
  nextMessage: number;
}

export interface SharedMessage {
  id: string;
  msgIndex: number;
  fromSessionId: string;
  from: string;
  toSessionId: string;
  body: string;
  createdAt: number;
  wakeAt?: number;
  handledAt?: number;
  presentedAt?: number;
}

// SharedRoom is defined in the pipeline types section below.

export interface RoomView {
  self?: SharedSession;
  room?: string;
  peers: SharedSession[];
  messages: SharedMessage[];
}

export interface HandledMessage {
  id: number;
  from: string;
  body: string;
}

export interface LocalSession {
  alias: string;
  status: 'idle' | 'busy';
}

export interface WakeCandidate {
  sessionId: string;
  from: string;
  msgIndices: number[];
}

// === Pipeline Types ===

export type PipelineState = 'planning' | 'questions' | 'running' | 'review' | 'done' | 'failed';

export type TaskRole = 'planner' | 'builder' | 'tester';

export type TaskState = 'pending' | 'claimed' | 'running' | 'done' | 'failed';

export interface Task {
  id: string;
  title: string;
  description: string;
  role: TaskRole;
  state: TaskState;
  assignee?: string;
  dependsOn: string[];
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  filesChanged?: string[];
  error?: string;
  createdAt: number;
  claimedAt?: number;
  completedAt?: number;
}

export interface BatchedQuestion {
  id: string;
  taskId: string;
  question: string;
  context: string;
  options?: string[];
  answer?: string;
  askedAt: number;
  answeredAt?: number;
}

export interface Pipeline {
  id: string;
  title: string;
  creatorSessionId: string;
  state: PipelineState;
  tasks: Record<string, Task>;
  questions: BatchedQuestion[];
  context: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SharedRoom {
  version: 2;
  sessions: Record<string, SharedSession>;
  messages: SharedMessage[];
  pipelines: Record<string, Pipeline>;
}

// === Tool Input Types ===

export interface CreateTaskInput {
  pipeline_id: string;
  title: string;
  description: string;
  role: TaskRole;
  depends_on?: string[];
  input?: Record<string, unknown>;
}

export interface ClaimTaskInput {
  pipeline_id: string;
  task_id: string;
}

export interface UpdateTaskInput {
  pipeline_id: string;
  task_id: string;
  state: TaskState;
  output?: Record<string, unknown>;
  files_changed?: string[];
  error?: string;
}

export interface PipelineStatusInput {
  pipeline_id?: string;
}

export interface CreatePipelineInput {
  title: string;
  context?: Record<string, unknown>;
}

export interface AskQuestionInput {
  pipeline_id: string;
  task_id: string;
  question: string;
  context: string;
  options?: string[];
}

export interface AnswerQuestionInput {
  pipeline_id: string;
  question_id: string;
  answer: string;
}
