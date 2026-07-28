export interface MatrixDefinition {
  prompts: string[];
  targetModels: string[];
  loraWeights: number[];
  cfgScales: number[];
  samplers: string[];
}

export interface MatrixJobItem {
  prompt: string;
  model: string;
  loraWeight: number;
  cfgScale: number;
  sampler: string;
}

export function estimateJobTime(jobCount: number, secondsPerJob: number = 30): string {
  const totalSeconds = jobCount * secondsPerJob;
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function generateExecutionMatrix(def: MatrixDefinition): MatrixJobItem[] {
  const activePrompts = def.prompts.length > 0 ? def.prompts : [''];
  const activeModels = def.targetModels.length > 0 ? def.targetModels : [''];
  const activeLoras = def.loraWeights.length > 0 ? def.loraWeights : [0];
  const activeCfgs = def.cfgScales.length > 0 ? def.cfgScales : [7];
  const activeSamplers = def.samplers.length > 0 ? def.samplers : ['euler'];

  const result: MatrixJobItem[] = [];
  for (const prompt of activePrompts) {
    for (const model of activeModels) {
      for (const loraWeight of activeLoras) {
        for (const cfgScale of activeCfgs) {
          for (const sampler of activeSamplers) {
            result.push({ prompt, model, loraWeight, cfgScale, sampler });
          }
        }
      }
    }
  }
  return result;
}

export function formatJobCountWarning(jobCount: number, secondsPerJob?: number): string {
  const time = estimateJobTime(jobCount, secondsPerJob);
  return `This matrix will produce ${jobCount} jobs (est. ${time}). Proceed?`;
}
