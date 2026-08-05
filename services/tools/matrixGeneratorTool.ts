/**
 * Matrix Generator Tool — WP12 of the Adaptation Roadmap.
 *
 * Exposes the matrix generator as an assistant tool.
 * Keeps checkJobCountGate() at 25 jobs to prevent silent GPU time consumption.
 */

import type { AssistantTool } from './types';
import { generateExecutionMatrix, checkJobCountGate, formatJobCountWarning } from '../matrixGenerator';
import type { MatrixDefinition } from '../matrixGenerator';

export const matrixGeneratorTool: AssistantTool = {
  name: 'generate_matrix',
  description:
    'Generate a matrix of parameter combinations for systematic prompt exploration. ' +
    'Creates all combinations of prompts, models, LoRA weights, CFG scales, and samplers. ' +
    'Maximum 25 jobs per matrix to prevent excessive GPU time. Returns the job list and time estimate.',
  parameters: {
    type: 'object',
    properties: {
      prompts: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of prompts to combine.',
      },
      targetModels: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of model names/checkpoints.',
      },
      loraWeights: {
        type: 'array',
        items: { type: 'number' },
        description: 'LoRA weight values to test.',
      },
      cfgScales: {
        type: 'array',
        items: { type: 'number' },
        description: 'CFG scale values to test.',
      },
      samplers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Sampler names to test.',
      },
    },
    required: ['prompts'],
  },
  execute: async (args) => {
    const def: MatrixDefinition = {
      prompts: Array.isArray(args.prompts) ? args.prompts : [String(args.prompts)],
      targetModels: Array.isArray(args.targetModels) ? args.targetModels : [],
      loraWeights: Array.isArray(args.loraWeights) ? args.loraWeights : [1.0],
      cfgScales: Array.isArray(args.cfgScales) ? args.cfgScales : [7],
      samplers: Array.isArray(args.samplers) ? args.samplers : ['Euler'],
    };

    const jobs = generateExecutionMatrix(def);
    const gate = checkJobCountGate(jobs.length);

    if (!gate.proceed) {
      return `Matrix too large: ${formatJobCountWarning(jobs.length)}. Reduce the parameter space.`;
    }

    const summary = [
      `**Matrix: ${jobs.length} jobs** (${gate.timeEstimate} estimated)`,
      '',
      'Jobs:',
      ...jobs.slice(0, 10).map((j, i) =>
        `${i + 1}. Model: ${j.model || 'default'} | CFG: ${j.cfgScale} | Sampler: ${j.sampler} | LoRA: ${j.loraWeight} | Prompt: ${j.prompt.slice(0, 60)}...`
      ),
      jobs.length > 10 ? `... and ${jobs.length - 10} more` : '',
    ];

    return summary.join('\n');
  },
};
