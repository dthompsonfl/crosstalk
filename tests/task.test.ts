// Tests for the task tool interface.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createTaskTool, createPipelineTool } from '../src/tools';
import { getPipeline, roomPath } from '../src/room';
import { __resetForTests } from '../src/test-support';

let testDir: string;
let taskTool: ReturnType<typeof createTaskTool>;
let pipelineTool: ReturnType<typeof createPipelineTool>;

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
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crosstalk-task-test-'));
  process.env.OPENCODE_CROSSTALK_DIR = testDir;
  taskTool = createTaskTool();
  pipelineTool = createPipelineTool();
});

afterEach(async () => {
  __resetForTests();
  delete process.env.OPENCODE_CROSSTALK_DIR;
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('task tool', () => {
  test('creates a task via tool', async () => {
    // First create a pipeline
    const result = await pipelineTool.execute(
      { action: 'create', title: 'Test Pipeline' },
      toolContext('s1'),
    );
    expect(result).toContain('Pipeline created');

    // Extract pipeline ID from result
    const match = (result as string).match(/ID: (\w+)/);
    expect(match).toBeDefined();
    const pipelineId = match![1];

    // Create a task
    const taskResult = await taskTool.execute(
      {
        action: 'create',
        pipeline_id: pipelineId,
        title: 'Build auth',
        description: 'Implement authentication',
        role: 'builder',
      },
      toolContext('s1'),
    );

    expect(taskResult).toContain('Task created');
    expect(taskResult).toContain('Build auth');
  });

  test('claims a task via tool', async () => {
    // Create pipeline + task
    const pResult = await pipelineTool.execute(
      { action: 'create', title: 'Test' },
      toolContext('s1'),
    );
    const pipelineId = (pResult as string).match(/ID: (\w+)/)![1];

    const cResult = await taskTool.execute(
      {
        action: 'create',
        pipeline_id: pipelineId,
        title: 'Task',
        description: 'Desc',
        role: 'builder',
      },
      toolContext('s1'),
    );
    const taskId = (cResult as string).match(/ID: (\w+)/)![1];

    // Claim it
    const claimResult = await taskTool.execute(
      { action: 'claim', pipeline_id: pipelineId, task_id: taskId },
      toolContext('alice'),
    );

    expect(claimResult).toContain('Task claimed');
    expect(claimResult).toContain('assigned');
  });

  test('completes a task via tool', async () => {
    const pResult = await pipelineTool.execute(
      { action: 'create', title: 'Test' },
      toolContext('s1'),
    );
    const pipelineId = (pResult as string).match(/ID: (\w+)/)![1];

    const cResult = await taskTool.execute(
      {
        action: 'create',
        pipeline_id: pipelineId,
        title: 'Task',
        description: 'Desc',
        role: 'builder',
      },
      toolContext('s1'),
    );
    const taskId = (cResult as string).match(/ID: (\w+)/)![1];

    await taskTool.execute(
      { action: 'claim', pipeline_id: pipelineId, task_id: taskId },
      toolContext('s1'),
    );

    // Complete it
    const completeResult = await taskTool.execute(
      {
        action: 'complete',
        pipeline_id: pipelineId,
        task_id: taskId,
        output: JSON.stringify({ filesCreated: 3 }),
        files_changed: 'src/auth.ts,src/routes.ts',
      },
      toolContext('s1'),
    );

    expect(completeResult).toContain('Task completed');

    // Verify pipeline advanced
    const pipeline = await getPipeline(pipelineId);
    expect(pipeline?.tasks[taskId].state).toBe('done');
  });

  test('validates required fields for create', async () => {
    const pResult = await pipelineTool.execute(
      { action: 'create', title: 'Test' },
      toolContext('s1'),
    );
    const pipelineId = (pResult as string).match(/ID: (\w+)/)![1];

    const result = await taskTool.execute(
      { action: 'create', pipeline_id: pipelineId },
      toolContext('s1'),
    );

    expect(result).toContain('Error');
  });

  test('returns error for unknown action', async () => {
    const result = await taskTool.execute(
      { action: 'bogus', pipeline_id: 'x' },
      toolContext('s1'),
    );
    expect(result).toContain('Error');
  });
});
