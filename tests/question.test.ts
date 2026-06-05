// Tests for the question tool and batch question flow.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createQuestionTool, createPipelineTool, createTaskTool } from '../src/tools';
import { getPipeline, getPendingQuestions, roomPath } from '../src/room';
import { __resetForTests } from '../src/test-support';

let testDir: string;
let questionTool: ReturnType<typeof createQuestionTool>;
let pipelineTool: ReturnType<typeof createPipelineTool>;
let taskTool: ReturnType<typeof createTaskTool>;

function toolContext(sessionID: string) {
  return {
    sessionID,
    messageID: `tool_${sessionID}`,
    agent: 'build',
    directory: '/tmp',
    worktree: '/tmp',
    abort: new AbortController().signal,
    metadata() {},
    ask() {
      throw new Error('not implemented in test');
    },
  };
}

beforeEach(async () => {
  __resetForTests();
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crosstalk-question-test-'));
  process.env.OPENCODE_CROSSTALK_DIR = testDir;
  questionTool = createQuestionTool();
  pipelineTool = createPipelineTool();
  taskTool = createTaskTool();
});

afterEach(async () => {
  __resetForTests();
  delete process.env.OPENCODE_CROSSTALK_DIR;
  await fs.rm(testDir, { recursive: true, force: true });
});

async function setupPipelineWithTask() {
  const pResult = await pipelineTool.execute(
    { action: 'create', title: 'Auth Feature' },
    toolContext('s1'),
  );
  const pipelineId = (pResult as string).match(/ID: (\w+)/)![1];

  const tResult = await taskTool.execute(
    {
      action: 'create',
      pipeline_id: pipelineId,
      title: 'Design auth',
      description: 'Design the auth flow',
      role: 'planner',
    },
    toolContext('s1'),
  );
  const taskId = (tResult as string).match(/ID: (\w+)/)![1];

  return { pipelineId, taskId };
}

describe('question tool', () => {
  test('asks a question via tool', async () => {
    const { pipelineId, taskId } = await setupPipelineWithTask();

    const result = await questionTool.execute(
      {
        action: 'ask',
        pipeline_id: pipelineId,
        task_id: taskId,
        question: 'Should we use OAuth or email/password?',
        context: 'Authentication method choice',
        options: 'OAuth,Email/Password,Both',
      },
      toolContext('s1'),
    );

    expect(result).toContain('Question added');
    expect(result).toContain('OAuth or email/password');
  });

  test('lists pending questions', async () => {
    const { pipelineId, taskId } = await setupPipelineWithTask();

    await questionTool.execute(
      {
        action: 'ask',
        pipeline_id: pipelineId,
        task_id: taskId,
        question: 'Which auth method?',
        context: 'Auth choice',
      },
      toolContext('s1'),
    );

    await questionTool.execute(
      {
        action: 'ask',
        pipeline_id: pipelineId,
        task_id: taskId,
        question: 'What token expiry?',
        context: 'Security config',
        options: '1h,24h,7d',
      },
      toolContext('s1'),
    );

    const result = await questionTool.execute(
      { action: 'list', pipeline_id: pipelineId },
      toolContext('s1'),
    );

    expect(result).toContain('Pending questions (2)');
    expect(result).toContain('Which auth method?');
    expect(result).toContain('What token expiry?');
  });

  test('answers a question', async () => {
    const { pipelineId, taskId } = await setupPipelineWithTask();

    await questionTool.execute(
      {
        action: 'ask',
        pipeline_id: pipelineId,
        task_id: taskId,
        question: 'OAuth or email?',
        context: 'Auth',
      },
      toolContext('s1'),
    );

    // Get question ID from list (ask result doesn't include it)
    const listResult = await questionTool.execute(
      { action: 'list', pipeline_id: pipelineId },
      toolContext('s1'),
    );

    const questionId = (listResult as string).match(/#(\w+)/)?.[1];
    expect(questionId).toBeDefined();

    const answerResult = await questionTool.execute(
      {
        action: 'answer',
        pipeline_id: pipelineId,
        question_id: questionId!,
        answer: 'OAuth',
      },
      toolContext('s1'),
    );

    expect(answerResult).toContain('Question answered');
    expect(answerResult).toContain('OAuth');
  });

  test('shows no pending questions when empty', async () => {
    const { pipelineId } = await setupPipelineWithTask();

    const result = await questionTool.execute(
      { action: 'list', pipeline_id: pipelineId },
      toolContext('s1'),
    );

    expect(result).toContain('No pending questions');
  });

  test('pipeline advances to questions state when question asked', async () => {
    const { pipelineId, taskId } = await setupPipelineWithTask();

    await questionTool.execute(
      {
        action: 'ask',
        pipeline_id: pipelineId,
        task_id: taskId,
        question: 'Which framework?',
        context: 'Tech choice',
      },
      toolContext('s1'),
    );

    const pipeline = await getPipeline(pipelineId);
    expect(pipeline?.state).toBe('questions');
  });

  test('pipeline advances to running when all questions answered', async () => {
    const { pipelineId, taskId } = await setupPipelineWithTask();

    await questionTool.execute(
      {
        action: 'ask',
        pipeline_id: pipelineId,
        task_id: taskId,
        question: 'Framework?',
        context: 'Choice',
      },
      toolContext('s1'),
    );

    // Get question ID from list
    const listResult = await questionTool.execute(
      { action: 'list', pipeline_id: pipelineId },
      toolContext('s1'),
    );
    const questionId = (listResult as string).match(/#(\w+)/)?.[1];

    await questionTool.execute(
      {
        action: 'answer',
        pipeline_id: pipelineId,
        question_id: questionId!,
        answer: 'React',
      },
      toolContext('s1'),
    );

    const pipeline = await getPipeline(pipelineId);
    expect(pipeline?.state).toBe('running');
  });

  test('validates required fields for ask', async () => {
    const { pipelineId } = await setupPipelineWithTask();

    const result = await questionTool.execute(
      { action: 'ask', pipeline_id: pipelineId },
      toolContext('s1'),
    );

    expect(result).toContain('Error');
  });

  test('returns error for unknown action', async () => {
    const result = await questionTool.execute(
      { action: 'bogus', pipeline_id: 'x' },
      toolContext('s1'),
    );
    expect(result).toContain('Error');
  });
});
