/**
 * Agent Executor
 * Executes plan steps by calling tools
 */

import { tools, getTool } from '../tools/registry';
import { logAuditEntry } from '../tools/auditctl';
import type { Plan, PlanStep } from './planner';

/**
 * Result of executing a single step
 */
export interface StepResult {
  stepNumber: number;
  tool: string;
  description: string;
  input: Record<string, any>;
  output: any;
  durationMs: number;
  success: boolean;
  error?: string;
}

/**
 * Result of executing the full plan
 */
export interface ExecutionResult {
  success: boolean;
  steps: StepResult[];
  totalDurationMs: number;
  failedSteps: number[];
}

/**
 * Resolve parameter references like ${step1.dti.backEnd}
 */
function resolveParameters(
  params: Record<string, any>,
  stepOutputs: Map<number, any>
): Record<string, any> {
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('${step')) {
      // Parse reference like ${step1.dti.backEnd}
      const match = value.match(/\$\{step(\d+)\.(.+)\}/);
      if (match) {
        const stepNum = parseInt(match[1]);
        const pathParts = match[2].split('.');
        let result = stepOutputs.get(stepNum);
        
        for (const part of pathParts) {
          if (result === undefined || result === null) break;
          result = result[part];
        }
        
        resolved[key] = result;
      } else {
        resolved[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve nested objects
      resolved[key] = resolveParameters(value, stepOutputs);
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * Check if step dependencies are satisfied
 */
function dependenciesSatisfied(
  step: PlanStep,
  completedSteps: Set<number>,
  failedSteps: Set<number>
): { satisfied: boolean; missing: number[]; failed: number[] } {
  const deps = step.dependsOn || [];
  const missing = deps.filter(d => !completedSteps.has(d) && !failedSteps.has(d));
  const failed = deps.filter(d => failedSteps.has(d));
  
  return {
    satisfied: missing.length === 0 && failed.length === 0,
    missing,
    failed,
  };
}

/**
 * Execute a single plan step
 */
async function executeStep(
  step: PlanStep,
  stepOutputs: Map<number, any>,
  sessionId: string
): Promise<StepResult> {
  const startTime = Date.now();
  
  try {
    // Get the tool
    const tool = getTool(step.tool);
    if (!tool) {
      throw new Error(`Unknown tool: ${step.tool}`);
    }
    
    // Parse parameters from JSON string
    let params: Record<string, any> = {};
    try {
      params = JSON.parse(step.parametersJson || '{}');
    } catch (e) {
      // If not valid JSON, try to use as-is
      params = {};
    }
    
    // Resolve parameter references
    const resolvedParams = resolveParameters(params, stepOutputs);
    
    // Execute the tool
    const output = await tool.execute(resolvedParams);
    const durationMs = Date.now() - startTime;
    
    // Log to audit trail (skip if this IS the audit tool)
    if (step.tool !== 'createAuditEntry') {
      await logAuditEntry(sessionId, `tool:${step.tool}`, {
        step: step.stepNumber,
        input: resolvedParams,
        output,
        durationMs,
      });
    }
    
    return {
      stepNumber: step.stepNumber,
      tool: step.tool,
      description: step.description,
      input: resolvedParams,
      output,
      durationMs,
      success: true,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    // Log failure to audit
    await logAuditEntry(sessionId, `tool:${step.tool}:failed`, {
      step: step.stepNumber,
      error: error.message,
      durationMs,
    });
    
    let failedParams: Record<string, any> = {};
    try {
      failedParams = JSON.parse(step.parametersJson || '{}');
    } catch (e) {
      failedParams = {};
    }
    
    return {
      stepNumber: step.stepNumber,
      tool: step.tool,
      description: step.description,
      input: failedParams,
      output: null,
      durationMs,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute a complete plan
 */
export async function executePlan(
  plan: Plan,
  sessionId: string
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const results: StepResult[] = [];
  const stepOutputs = new Map<number, any>();
  const completedSteps = new Set<number>();
  const failedSteps = new Set<number>();
  
  // Sort steps by step number (should already be sorted, but ensure)
  const sortedSteps = [...plan.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  
  for (const step of sortedSteps) {
    // Check dependencies
    const depStatus = dependenciesSatisfied(step, completedSteps, failedSteps);
    
    if (depStatus.failed.length > 0) {
      // Skip if dependencies failed
      let skipParams: Record<string, any> = {};
      try {
        skipParams = JSON.parse(step.parametersJson || '{}');
      } catch (e) {
        skipParams = {};
      }
      results.push({
        stepNumber: step.stepNumber,
        tool: step.tool,
        description: step.description,
        input: skipParams,
        output: null,
        durationMs: 0,
        success: false,
        error: `Skipped: dependencies failed (steps ${depStatus.failed.join(', ')})`,
      });
      failedSteps.add(step.stepNumber);
      continue;
    }
    
    if (depStatus.missing.length > 0) {
      // This shouldn't happen with sorted steps, but handle it
      let waitParams: Record<string, any> = {};
      try {
        waitParams = JSON.parse(step.parametersJson || '{}');
      } catch (e) {
        waitParams = {};
      }
      results.push({
        stepNumber: step.stepNumber,
        tool: step.tool,
        description: step.description,
        input: waitParams,
        output: null,
        durationMs: 0,
        success: false,
        error: `Skipped: waiting for steps ${depStatus.missing.join(', ')}`,
      });
      failedSteps.add(step.stepNumber);
      continue;
    }
    
    // Execute the step
    const result = await executeStep(step, stepOutputs, sessionId);
    results.push(result);
    
    if (result.success) {
      stepOutputs.set(step.stepNumber, result.output);
      completedSteps.add(step.stepNumber);
    } else {
      failedSteps.add(step.stepNumber);
    }
  }
  
  return {
    success: failedSteps.size === 0,
    steps: results,
    totalDurationMs: Date.now() - startTime,
    failedSteps: Array.from(failedSteps),
  };
}

/**
 * Get outputs from completed steps as a map
 */
export function getStepOutputsMap(results: StepResult[]): Map<number, any> {
  const map = new Map<number, any>();
  for (const result of results) {
    if (result.success) {
      map.set(result.stepNumber, result.output);
    }
  }
  return map;
}
