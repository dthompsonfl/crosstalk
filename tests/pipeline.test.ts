// Tests for pipeline CRUD, state transitions, and dependency resolution.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  createPipeline,
  getPipeline,
  getPipelinesBySession,
  addTaskToPipeline,
  claimTask,
  updateTask,
  advancePipeline,
  getReadyTasks,
  roomPath,
} from '../src/room';
import { __resetForTests } from '../src/test-support';

let testDir: string;

beforeEach(async () => {
  __resetForTests();
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crosstalk-pipeline-test-'));
  process.env.OPENCODE_CROSSTALK_DIR = testDir;
});

afterEach(async () => {
  __resetForTests();
  delete process.env.OPENCODE_CROSSTALK_DIR;
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('pipeline CRUD', () => {
  test('creates a pipeline with planning state', async () => {
    const pipeline = await createPipeline('s1', 'Build user dashboard');

    expect(pipeline.id).toBeDefined();
    expect(pipeline.title).toBe('Build user dashboard');
    expect(pipeline.state).toBe('planning');
    expect(pipeline.creatorSessionId).toBe('s1');
    expect(pipeline.tasks).toEqual({});
    expect(pipeline.questions).toEqual([]);
  });

  test('gets a pipeline by ID', async () => {
    const created = await createPipeline('s1', 'Test pipeline');
    const fetched = await getPipeline(created.id);

    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.title).toBe('Test pipeline');
  });

  test('gets pipelines by session', async () => {
    const p1 = await createPipeline('s1', 'Pipeline 1');
    const p2 = await createPipeline('s2', 'Pipeline 2');
    await createPipeline('s1', 'Pipeline 3');

    const s1Pipelines = await getPipelinesBySession('s1');
    expect(s1Pipelines.length).toBe(2);

    const s2Pipelines = await getPipelinesBySession('s2');
    expect(s2Pipelines.length).toBe(1);
  });

  test('returns undefined for nonexistent pipeline', async () => {
    const result = await getPipeline('nonexistent');
    expect(result).toBeUndefined();
  });
});

describe('task lifecycle', () => {
  test('adds a task to a pipeline', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const task = await addTaskToPipeline(pipeline.id, {
      title: 'Design auth flow',
      description: 'Design the authentication flow',
      role: 'planner',
      dependsOn: [],
      input: {},
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Design auth flow');
    expect(task.role).toBe('planner');
    expect(task.state).toBe('pending');
    expect(task.dependsOn).toEqual([]);
  });

  test('claims a pending task', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const task = await addTaskToPipeline(pipeline.id, {
      title: 'Build API',
      description: 'Implement the API',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    const claimed = await claimTask(pipeline.id, task.id, 'alice');
    expect(claimed.state).toBe('claimed');
    expect(claimed.assignee).toBe('alice');
    expect(claimed.claimedAt).toBeDefined();
  });

  test('cannot claim a non-pending task', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const task = await addTaskToPipeline(pipeline.id, {
      title: 'Task',
      description: 'Desc',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    await claimTask(pipeline.id, task.id, 'alice');

    try {
      await claimTask(pipeline.id, task.id, 'bob');
      expect(true).toBe(false); // Should not reach
    } catch (e: unknown) {
      expect((e as Error).message).toContain('not pending');
    }
  });

  test('updates task with output and files', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const task = await addTaskToPipeline(pipeline.id, {
      title: 'Build',
      description: 'Build it',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    const updated = await updateTask(pipeline.id, task.id, {
      state: 'done',
      output: { filesCreated: 5 },
      filesChanged: ['src/api.ts', 'src/routes.ts'],
    });

    expect(updated.state).toBe('done');
    expect(updated.output).toEqual({ filesCreated: 5 });
    expect(updated.filesChanged).toEqual(['src/api.ts', 'src/routes.ts']);
    expect(updated.completedAt).toBeDefined();
  });

  test('marks task as failed with error', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const task = await addTaskToPipeline(pipeline.id, {
      title: 'Risky task',
      description: 'Might fail',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    const failed = await updateTask(pipeline.id, task.id, {
      state: 'failed',
      error: 'Build failed: module not found',
    });

    expect(failed.state).toBe('failed');
    expect(failed.error).toBe('Build failed: module not found');
  });
});

describe('dependency resolution', () => {
  test('getReadyTasks returns tasks with no unmet deps', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const t1 = await addTaskToPipeline(pipeline.id, {
      title: 'Design',
      description: 'Design phase',
      role: 'planner',
      dependsOn: [],
      input: {},
    });
    const t2 = await addTaskToPipeline(pipeline.id, {
      title: 'Build',
      description: 'Build phase',
      role: 'builder',
      dependsOn: [t1.id],
      input: {},
    });
    const t3 = await addTaskToPipeline(pipeline.id, {
      title: 'Test',
      description: 'Test phase',
      role: 'tester',
      dependsOn: [t2.id],
      input: {},
    });

    // Only t1 should be ready (no deps)
    const fresh = await getPipeline(pipeline.id);
    const ready = getReadyTasks(fresh!);
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe(t1.id);
  });

  test('getReadyTasks includes tasks whose deps are done', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const t1 = await addTaskToPipeline(pipeline.id, {
      title: 'Design',
      description: 'Design phase',
      role: 'planner',
      dependsOn: [],
      input: {},
    });
    const t2 = await addTaskToPipeline(pipeline.id, {
      title: 'Build',
      description: 'Build phase',
      role: 'builder',
      dependsOn: [t1.id],
      input: {},
    });

    // Complete t1
    await updateTask(pipeline.id, t1.id, { state: 'done' });

    // Now t2 should be ready
    const fresh = await getPipeline(pipeline.id);
    const ready = getReadyTasks(fresh!);
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe(t2.id);
  });

  test('parallel tasks with no deps are all ready', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    await addTaskToPipeline(pipeline.id, {
      title: 'Build API',
      description: 'API',
      role: 'builder',
      dependsOn: [],
      input: {},
    });
    await addTaskToPipeline(pipeline.id, {
      title: 'Build UI',
      description: 'UI',
      role: 'builder',
      dependsOn: [],
      input: {},
    });
    await addTaskToPipeline(pipeline.id, {
      title: 'Write Tests',
      description: 'Tests',
      role: 'tester',
      dependsOn: [],
      input: {},
    });

    const fresh = await getPipeline(pipeline.id);
    const ready = getReadyTasks(fresh!);
    expect(ready.length).toBe(3);
  });
});

describe('pipeline state transitions', () => {
  test('advances from planning to running when tasks exist and no questions', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    await addTaskToPipeline(pipeline.id, {
      title: 'Task',
      description: 'Do it',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    const advanced = await advancePipeline(pipeline.id);
    expect(advanced.state).toBe('running');
  });

  test('advances from planning to questions when questions exist', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    await addTaskToPipeline(pipeline.id, {
      title: 'Task',
      description: 'Do it',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    // Simulate adding a question via room
    const { addQuestion } = await import('../src/room');
    await addQuestion(pipeline.id, 'task1', 'Which auth?', 'OAuth or email');

    const advanced = await advancePipeline(pipeline.id);
    expect(advanced.state).toBe('questions');
  });

  test('advances from questions to running when all answered', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    await addTaskToPipeline(pipeline.id, {
      title: 'Task',
      description: 'Do it',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    const { addQuestion, answerQuestion } = await import('../src/room');
    const q = await addQuestion(pipeline.id, 'task1', 'Which auth?', 'OAuth or email');
    await advancePipeline(pipeline.id);

    // Answer the question
    await answerQuestion(pipeline.id, q.id, 'OAuth');
    const advanced = await advancePipeline(pipeline.id);
    expect(advanced.state).toBe('running');
  });

  test('advances to done when all tasks complete', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const t1 = await addTaskToPipeline(pipeline.id, {
      title: 'Task 1',
      description: 'First',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    await advancePipeline(pipeline.id); // → running
    await updateTask(pipeline.id, t1.id, { state: 'done' });
    const advanced = await advancePipeline(pipeline.id);
    expect(advanced.state).toBe('done');
  });

  test('advances to failed when any task fails', async () => {
    const pipeline = await createPipeline('s1', 'Test');
    const t1 = await addTaskToPipeline(pipeline.id, {
      title: 'Task 1',
      description: 'First',
      role: 'builder',
      dependsOn: [],
      input: {},
    });

    await advancePipeline(pipeline.id); // → running
    await updateTask(pipeline.id, t1.id, { state: 'failed', error: 'oops' });
    const advanced = await advancePipeline(pipeline.id);
    expect(advanced.state).toBe('failed');
  });

  test('stays in planning with no tasks', async () => {
    const pipeline = await createPipeline('s1', 'Empty');
    const advanced = await advancePipeline(pipeline.id);
    expect(advanced.state).toBe('planning');
  });
});
