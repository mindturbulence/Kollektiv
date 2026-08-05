/**
 * ComfyUI Workflow Tool — WP12 of the Adaptation Roadmap.
 *
 * Exposes the ComfyUI workflow parser as an assistant tool.
 * NOTE: validateWorkflowOnComfy() actually submits the job — empty node_errors
 * means the job is queued and executing, not merely schema-checked.
 */

import type { AssistantTool } from './types';

export const comfyWorkflowTool: AssistantTool = {
  name: 'parse_comfy_workflow',
  description:
    'Parse and validate a ComfyUI workflow JSON. Detects nodes, inputs, and parameterizable fields. ' +
    'Can auto-detect which fields can be varied for matrix generation. ' +
    'WARNING: If validate is set to true, the workflow is actually submitted to ComfyUI for execution.',
  parameters: {
    type: 'object',
    properties: {
      workflowJson: {
        type: 'string',
        description: 'The ComfyUI workflow JSON string to parse.',
      },
      validate: {
        type: 'boolean',
        description: 'If true, submits the workflow to ComfyUI for validation (actually executes it!). Default: false.',
      },
    },
    required: ['workflowJson'],
  },
  execute: async (args) => {
    const workflowStr = args.workflowJson as string;
    const shouldValidate = args.validate === true;

    let workflow: Record<string, any>;
    try {
      workflow = JSON.parse(workflowStr);
    } catch {
      return 'Error: Invalid JSON. Provide a valid ComfyUI workflow JSON.';
    }

    const { isPromptRequestFormat, autoDetectTargets } = await import('../comfyWorkflowParser');

    // Detect format
    const isPromptFormat = isPromptRequestFormat(workflow);
    const format = isPromptFormat ? 'Prompt Request' : 'API Format';

    // Detect nodes and their inputs
    let nodeCount = 0;
    let parameterizable: string[] = [];

    if (isPromptFormat) {
      // Prompt Request format: { node_id: { class_type, inputs } }
      nodeCount = Object.keys(workflow).length;
      const targets = autoDetectTargets(workflow);
      parameterizable = Object.keys(targets);
    } else {
      // API format: { last_node_id, nodes: [...] }
      nodeCount = workflow.nodes?.length || Object.keys(workflow).length;
    }

    // Validate if requested
    let validationResult = '';
    if (shouldValidate) {
      try {
        const { validateWorkflowOnComfy } = await import('../comfyWorkflowParser');
        const result = await validateWorkflowOnComfy(workflow, {} as any);
        const errors = result.node_errors || {};
        const errorCount = Object.keys(errors).length;
        validationResult = errorCount === 0
          ? '\n\n**Validation: PASSED** (workflow submitted for execution)'
          : `\n\n**Validation: FAILED** — ${errorCount} node errors:\n` +
            Object.entries(errors).map(([id, err]) => `- Node ${id}: ${JSON.stringify(err)}`).join('\n');
      } catch (e) {
        validationResult = `\n\n**Validation error:** ${e}`;
      }
    }

    const summary = [
      `**ComfyUI Workflow** (${format})`,
      `Nodes: ${nodeCount}`,
      parameterizable.length > 0 ? `Parameterizable fields: ${parameterizable.join(', ')}` : '',
      validationResult,
    ].filter(Boolean).join('\n');

    return summary;
  },
};
