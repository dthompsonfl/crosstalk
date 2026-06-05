// This file defines the task, pipeline, and question tools for autonomous feature implementation.

import { tool } from '@opencode-ai/plugin';
import type { ToolContext } from './types';
import {
  addTaskToPipeline,
  advancePipeline,
  claimTask,
  createPipeline,
  getPipeline,
  getPendingQuestions,
  getPipelinesBySession,
  updateTask,
  addQuestion,
  answerQuestion,
} from './room';
import {
  pipelineCreatedResult,
  pipelineStatusResult,
  taskCreatedResult,
  taskClaimedResult,
  taskCompletedResult,
  taskFailedResult,
  questionAskedResult,
  questionBatchResult,
  pipelineCompleteResult,
} from './prompts';

export function createPipelineTool() {
  return tool({
    description:
      'Manage autonomous feature pipelines. Actions: create (start new pipeline), status (view progress), start (begin execution after questions answered), cancel (stop pipeline).',
    args: {
      action: tool.schema.string().describe('Action: create, status, start, cancel'),
      pipeline_id: tool.schema.string().optional().describe('Pipeline ID (required for status, start, cancel)'),
      title: tool.schema.string().optional().describe('Pipeline title (required for create)'),
      context: tool.schema.string().optional().describe('JSON string of shared context for the pipeline'),
    },
    async execute(args, _context: ToolContext) {
      const action = args.action?.trim();

      if (action === 'create') {
        if (!args.title) {
          return 'Error: title is required for pipeline(action="create")';
        }
        let ctx = {};
        if (args.context) {
          try {
            ctx = JSON.parse(args.context);
          } catch {
            return 'Error: context must be valid JSON';
          }
        }
        const pipeline = await createPipeline(_context.sessionID, args.title, ctx);
        return pipelineCreatedResult(pipeline);
      }

      if (action === 'status') {
        if (args.pipeline_id) {
          const pipeline = await getPipeline(args.pipeline_id);
          if (!pipeline) {
            return `Error: Pipeline ${args.pipeline_id} not found`;
          }
          return pipelineStatusResult(pipeline);
        }

        // Show all pipelines for this session
        const pipelines = await getPipelinesBySession(_context.sessionID);
        if (pipelines.length === 0) {
          return 'No pipelines found. Create one with pipeline(action="create", title="...")';
        }

        const lines = [`Pipelines (${pipelines.length}):`];
        for (const p of pipelines) {
          const tasks = Object.values(p.tasks);
          const done = tasks.filter((t) => t.state === 'done').length;
          lines.push(`  - [${p.state}] ${p.title} (ID: ${p.id}, ${done}/${tasks.length} tasks done)`);
        }
        return lines.join('\n');
      }

      if (action === 'start') {
        if (!args.pipeline_id) {
          return 'Error: pipeline_id is required for pipeline(action="start")';
        }
        const pipeline = await advancePipeline(args.pipeline_id);
        return pipelineStatusResult(pipeline);
      }

      if (action === 'cancel') {
        if (!args.pipeline_id) {
          return 'Error: pipeline_id is required for pipeline(action="cancel")';
        }
        const { updateTask: updateTaskFn } = await import('./room');
        // Set all non-done tasks to failed
        const pipeline = await getPipeline(args.pipeline_id);
        if (!pipeline) {
          return `Error: Pipeline ${args.pipeline_id} not found`;
        }
        for (const task of Object.values(pipeline.tasks)) {
          if (task.state !== 'done') {
            await updateTask(args.pipeline_id, task.id, { state: 'failed', error: 'Pipeline cancelled' });
          }
        }
        const updated = await getPipeline(args.pipeline_id);
        return `Pipeline "${updated?.title || args.pipeline_id}" cancelled.`;
      }

      return 'Error: action must be one of: create, status, start, cancel';
    },
  });
}

export function createTaskTool() {
  return tool({
    description:
      'Manage tasks in a pipeline. Actions: create (add task), claim (pick up work), complete (finish with output), update (change state).',
    args: {
      action: tool.schema.string().describe('Action: create, claim, complete, update'),
      pipeline_id: tool.schema.string().describe('Pipeline ID'),
      task_id: tool.schema.string().optional().describe('Task ID (required for claim, complete, update)'),
      title: tool.schema.string().optional().describe('Task title (required for create)'),
      description: tool.schema.string().optional().describe('Task description (required for create)'),
      role: tool.schema.string().optional().describe('Task role: planner, builder, tester (required for create)'),
      depends_on: tool.schema.string().optional().describe('Comma-separated task IDs this depends on'),
      input: tool.schema.string().optional().describe('JSON string of structured input for the task'),
      state: tool.schema.string().optional().describe('New state (for update): claimed, running, done, failed'),
      output: tool.schema.string().optional().describe('JSON string of structured output (for complete/update)'),
      files_changed: tool.schema.string().optional().describe('Comma-separated file paths changed'),
      error: tool.schema.string().optional().describe('Error message (for failed state)'),
    },
    async execute(args, context: ToolContext) {
      const action = args.action?.trim();

      if (action === 'create') {
        if (!args.title || !args.role) {
          return 'Error: title and role are required for task(action="create")';
        }
        const role = args.role as 'planner' | 'builder' | 'tester';
        if (!['planner', 'builder', 'tester'].includes(role)) {
          return 'Error: role must be one of: planner, builder, tester';
        }

        let deps: string[] = [];
        if (args.depends_on) {
          deps = args.depends_on.split(',').map((s) => s.trim()).filter(Boolean);
        }

        let input = {};
        if (args.input) {
          try {
            input = JSON.parse(args.input);
          } catch {
            return 'Error: input must be valid JSON';
          }
        }

        const task = await addTaskToPipeline(args.pipeline_id, {
          title: args.title,
          description: args.description || args.title,
          role,
          assignee: undefined,
          dependsOn: deps,
          input,
        });

        const pipeline = await getPipeline(args.pipeline_id);
        return taskCreatedResult(task, pipeline?.title || args.pipeline_id);
      }

      if (action === 'claim') {
        if (!args.task_id) {
          return 'Error: task_id is required for task(action="claim")';
        }
        const task = await claimTask(args.pipeline_id, args.task_id, context.sessionID);
        return taskClaimedResult(task);
      }

      if (action === 'complete') {
        if (!args.task_id) {
          return 'Error: task_id is required for task(action="complete")';
        }

        let output = {};
        if (args.output) {
          try {
            output = JSON.parse(args.output);
          } catch {
            return 'Error: output must be valid JSON';
          }
        }

        let filesChanged: string[] | undefined;
        if (args.files_changed) {
          filesChanged = args.files_changed.split(',').map((s) => s.trim()).filter(Boolean);
        }

        const task = await updateTask(args.pipeline_id, args.task_id, {
          state: 'done',
          output,
          filesChanged,
        });

        // Auto-advance pipeline
        await advancePipeline(args.pipeline_id);
        return taskCompletedResult(task);
      }

      if (action === 'update') {
        if (!args.task_id || !args.state) {
          return 'Error: task_id and state are required for task(action="update")';
        }

        const state = args.state as 'pending' | 'claimed' | 'running' | 'done' | 'failed';
        if (!['pending', 'claimed', 'running', 'done', 'failed'].includes(state)) {
          return 'Error: state must be one of: pending, claimed, running, done, failed';
        }

        let output: Record<string, unknown> | undefined;
        if (args.output) {
          try {
            output = JSON.parse(args.output);
          } catch {
            return 'Error: output must be valid JSON';
          }
        }

        let filesChanged: string[] | undefined;
        if (args.files_changed) {
          filesChanged = args.files_changed.split(',').map((s) => s.trim()).filter(Boolean);
        }

        const task = await updateTask(args.pipeline_id, args.task_id, {
          state,
          output,
          filesChanged,
          error: args.error,
        });

        if (state === 'done' || state === 'failed') {
          await advancePipeline(args.pipeline_id);
        }

        return state === 'failed' ? taskFailedResult(task) : taskCompletedResult(task);
      }

      return 'Error: action must be one of: create, claim, complete, update';
    },
  });
}

export function createQuestionTool() {
  return tool({
    description:
      'Manage batched questions in a pipeline. Actions: ask (add question), answer (respond to question), list (view pending questions).',
    args: {
      action: tool.schema.string().describe('Action: ask, answer, list'),
      pipeline_id: tool.schema.string().describe('Pipeline ID'),
      task_id: tool.schema.string().optional().describe('Task ID (required for ask)'),
      question: tool.schema.string().optional().describe('Question text (required for ask)'),
      context: tool.schema.string().optional().describe('Context for the question (required for ask)'),
      options: tool.schema.string().optional().describe('Comma-separated answer options'),
      question_id: tool.schema.string().optional().describe('Question ID (required for answer)'),
      answer: tool.schema.string().optional().describe('Answer text (required for answer)'),
    },
    async execute(args, _context: ToolContext) {
      const action = args.action?.trim();

      if (action === 'ask') {
        if (!args.task_id || !args.question || !args.context) {
          return 'Error: task_id, question, and context are required for question(action="ask")';
        }

        let options: string[] | undefined;
        if (args.options) {
          options = args.options.split(',').map((s) => s.trim()).filter(Boolean);
        }

        const q = await addQuestion(args.pipeline_id, args.task_id, args.question, args.context, options);

        // Auto-advance to questions state
        await advancePipeline(args.pipeline_id);
        return questionAskedResult(q);
      }

      if (action === 'answer') {
        if (!args.question_id || !args.answer) {
          return 'Error: question_id and answer are required for question(action="answer")';
        }

        const q = await answerQuestion(args.pipeline_id, args.question_id, args.answer);

        // Auto-advance pipeline
        await advancePipeline(args.pipeline_id);
        return `Question answered: "${q.question}" → "${q.answer}"`;
      }

      if (action === 'list') {
        const questions = await getPendingQuestions(args.pipeline_id);
        return questionBatchResult(questions);
      }

      return 'Error: action must be one of: ask, answer, list';
    },
  });
}
