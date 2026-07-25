/**
 * Tensor Art integration tools for the assistant.
 *
 * All tools require a Tensor Art API key
 * (Settings > Integrations > Tensor Art).
 */
import type { AssistantTool, ToolContext } from './types';
import { listTools, createTask, pollTask } from '../tensorartService';

export const tensorArtTools: AssistantTool[] = [
  {
    name: 'tensorart_list_models',
    description: 'Lists all available Tensor Art models (tools) with their names, descriptions, input schemas, and estimated costs. Call this first so the AI knows which models are available before generating.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args: any, ctx: ToolContext) => {
      const key = ctx.settings.tensorartApiKey;
      if (!key) return 'Error: Tensor Art API key not configured. Ask the user to add it in Settings → Integrations → Tensor Art.';
      try {
        const tools = await listTools(key);
        if (!tools.length) return 'No models found on this account.';
        return JSON.stringify(tools.map(t => ({
          name: t.name,
          description: t.description,
          cost: t.estimatedCost,
          tags: t.tags,
          inputs: t.inputs.map(i => ({ name: i.name, type: i.type, description: i.description })),
        })));
      } catch (e: any) {
        return `Error fetching models: ${e?.message || e}`;
      }
    },
  },
  {
    name: 'tensorart_generate',
    description: 'Generates an image or video using a Tensor Art model. Accepts the model name and prompt; optionally width, height, and count. The result URL is returned — tell the user it\'s ready.',
    parameters: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'The exact model/tool name from tensorart_list_models, e.g. strong_text2image_nano_banana2.' },
        prompt: { type: 'string', description: 'The text prompt describing what to generate.' },
        width: { type: 'integer', description: 'Image width in pixels (e.g. 1024). Omit to use the model default.' },
        height: { type: 'integer', description: 'Image height in pixels (e.g. 1024). Omit to use the model default.' },
        count: { type: 'integer', description: 'Number of images to generate (default 1).' },
      },
      required: ['toolName', 'prompt'],
    },
    execute: async (args: any, ctx: ToolContext) => {
      const key = ctx.settings.tensorartApiKey;
      if (!key) return 'Error: Tensor Art API key not configured. Ask the user to add it in Settings → Integrations → Tensor Art.';
      const { toolName, prompt, width, height, count } = args;
      try {
        const tools = await listTools(key);
        const tool = tools.find((t: any) => t.name === toolName);
        if (!tool) {
          const names = tools.map((t: any) => t.name).join(', ');
          return `Error: model "${toolName}" not found. Available: ${names || '(none)'}`;
        }

        const inputs: { type: string; value: any }[] = [];
        for (const input of tool.inputs) {
          const nameL = input.name.toLowerCase();
          let value: any;

          if (nameL === 'prompt' || nameL === 'text' || nameL === 'description') {
            value = prompt || '';
          } else if (nameL === 'image' && input.type === 'FILE') {
            value = args.imageUrl || null;
          } else if (input.type === 'STRING' && (nameL === 'negative_prompt' || nameL === 'negative')) {
            value = '';
          } else if (input.type === 'INTEGER' && (nameL === 'width' || nameL === 'w')) {
            value = width ?? 1024;
          } else if (input.type === 'INTEGER' && (nameL === 'height' || nameL === 'h')) {
            value = height ?? 1024;
          } else if (input.type === 'INTEGER' && (nameL === 'count' || nameL === 'num' || nameL === 'n' || nameL === 'number')) {
            value = count ?? 1;
          } else if (input.type === 'INTEGER' && (nameL === 'steps' || nameL === 'num_steps')) {
            value = 20;
          } else if (input.type === 'NUMBER' && (nameL === 'cfg' || nameL === 'guidance_scale')) {
            value = 7.0;
          } else if (input.type === 'STRING' && nameL.includes('prompt')) {
            value = prompt || '';
          } else if (input.type === 'INTEGER') {
            value = input.description?.toLowerCase().includes('count') ? (count ?? 1) :
              input.description?.toLowerCase().includes('width') ? (width ?? 1024) :
              input.description?.toLowerCase().includes('height') ? (height ?? 1024) :
              input.description?.toLowerCase().includes('step') ? 20 :
              input.description?.toLowerCase().includes('seed') ? 0 : 0;
          } else if (input.type === 'NUMBER') {
            value = 0;
          } else if (input.type === 'BOOLEAN') {
            value = false;
          } else if (input.type === 'ARRAY') {
            value = [];
          } else if (input.type === 'OBJECT') {
            value = {};
          } else {
            value = input.type === 'STRING' ? '' : 0;
          }
          inputs.push({ type: input.type, value });
        }

        const task = await createTask(key, toolName, inputs);
        const result = await pollTask(key, task.taskId, 30, 3000);

        if (result.status === 'FINISH' && result.outputs?.length) {
          const files = result.outputs
            .filter((o: any) => (o.type === 'FILE' || o.type === 'IMAGE' || o.type === 'VIDEO') && o.url)
            .map((o: any) => o.url);
          if (files.length) {
            return `Generation complete! Result URL${files.length > 1 ? 's' : ''}: ${files.join(', ')}`;
          }
          return `Generation complete (status: FINISH) but no output URLs returned. Full result: ${JSON.stringify(result.outputs)}`;
        }
        if (result.status === 'EXCEPTION') {
          return `Generation failed: ${result.error || 'Unknown error'}`;
        }
        return `Task ${task.taskId} is still processing (status: ${result.status}). Ask the user to check back later.`;
      } catch (e: any) {
        return `Error generating with Tensor Art: ${e?.message || e}`;
      }
    },
  },
];
