/**
 * LendCtl AI Agent
 * Main agent class that orchestrates planning, execution, validation, and reporting
 */

import { createPlan, replan, type Plan } from './planner';
import { executePlan, type ExecutionResult, type StepResult } from './executor';
import { validateResults, type ValidationResult } from './validator';
import { generateReport, generateQuickSummary, type ReportOptions } from './reporter';
import { logAuditEntry } from '../tools/auditctl';

/**
 * Agent configuration options
 */
export interface AgentOptions {
  /** LLM model to use (default: gpt-4o) */
  model?: string;
  /** Maximum planning iterations (default: 3) */
  maxIterations?: number;
  /** Stream the final report (default: false) */
  stream?: boolean;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
  /** Skip LLM validation for faster execution (default: false) */
  skipLLMValidation?: boolean;
}

/**
 * Result of agent query
 */
export interface AgentResult {
  /** Unique session ID */
  sessionId: string;
  /** The execution plan */
  plan: Plan;
  /** Results from each step */
  results: StepResult[];
  /** Validation results */
  validation: ValidationResult;
  /** Generated report (string or stream) */
  report: string | AsyncIterable<string>;
  /** Number of planning iterations */
  iterations: number;
  /** Total execution time in ms */
  totalDurationMs: number;
  /** Whether the analysis succeeded */
  success: boolean;
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `lendctl-${timestamp}-${random}`;
}

/**
 * LendCtl AI Agent
 */
export class LendCtlAgent {
  private sessionId: string;
  private options: Required<AgentOptions>;
  
  constructor(options: AgentOptions = {}) {
    this.sessionId = generateSessionId();
    this.options = {
      model: options.model ?? 'gpt-4o',
      maxIterations: options.maxIterations ?? 3,
      stream: options.stream ?? false,
      verbose: options.verbose ?? false,
      skipLLMValidation: options.skipLLMValidation ?? false,
    };
  }
  
  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
  
  /**
   * Log a message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[${this.sessionId}] ${message}`);
    }
  }
  
  /**
   * Query the agent with a lending question
   */
  async query(
    input: string,
    context?: string,
    reportOptions?: ReportOptions
  ): Promise<AgentResult> {
    const startTime = Date.now();
    let iteration = 0;
    let plan: Plan | null = null;
    let executionResult: ExecutionResult | null = null;
    let validation: ValidationResult | null = null;
    let previousIssues: string[] = [];
    
    // Log the query
    await logAuditEntry(this.sessionId, 'query', {
      input,
      context,
      options: this.options,
    });
    
    this.log(`Starting analysis: "${input.substring(0, 50)}..."`);
    
    // Planning and execution loop
    while (iteration < this.options.maxIterations) {
      iteration++;
      this.log(`\n=== Iteration ${iteration}/${this.options.maxIterations} ===`);
      
      // Step 1: Plan (or replan)
      this.log('Planning...');
      try {
        if (iteration === 1) {
          plan = await createPlan(input, context, this.options.model);
        } else if (plan && previousIssues.length > 0) {
          plan = await replan(input, plan, previousIssues, this.options.model);
        }
      } catch (error: any) {
        this.log(`Planning failed: ${error.message}`);
        await logAuditEntry(this.sessionId, 'planning_failed', { error: error.message, iteration });
        throw error;
      }
      
      if (!plan) {
        throw new Error('Failed to create plan');
      }
      
      this.log(`Plan created with ${plan.steps.length} steps`);
      await logAuditEntry(this.sessionId, 'plan_created', {
        iteration,
        steps: plan.steps.length,
        understanding: plan.understanding,
      });
      
      // Step 2: Execute
      this.log('Executing...');
      try {
        executionResult = await executePlan(plan, this.sessionId);
      } catch (error: any) {
        this.log(`Execution failed: ${error.message}`);
        await logAuditEntry(this.sessionId, 'execution_failed', { error: error.message, iteration });
        throw error;
      }
      
      this.log(`Executed ${executionResult.steps.length} steps (${executionResult.failedSteps.length} failed)`);
      
      // Step 3: Validate
      this.log('Validating...');
      try {
        validation = await validateResults(input, plan, executionResult.steps, {
          model: this.options.model,
          skipLLM: this.options.skipLLMValidation,
        });
      } catch (error: any) {
        this.log(`Validation failed: ${error.message}`);
        // Continue with partial validation
        validation = {
          isValid: false,
          issues: [{ severity: 'error', message: `Validation error: ${error.message}` }],
          suggestions: [],
          complianceFlags: [],
        };
      }
      
      this.log(`Validation: ${validation.isValid ? 'PASSED' : 'FAILED'} (${validation.issues.length} issues)`);
      await logAuditEntry(this.sessionId, 'validation_complete', {
        iteration,
        isValid: validation.isValid,
        issueCount: validation.issues.length,
      });
      
      // Check if we should stop
      if (validation.isValid) {
        this.log('✓ Validation passed');
        break;
      }
      
      // Prepare issues for next iteration
      const errorIssues = validation.issues
        .filter(i => i.severity === 'error')
        .map(i => i.message);
      
      if (errorIssues.length === 0) {
        // Only warnings/info - acceptable
        this.log('⚠ Only warnings found, proceeding');
        break;
      }
      
      if (iteration < this.options.maxIterations) {
        this.log(`✗ Errors found, replanning...`);
        previousIssues = errorIssues;
      }
    }
    
    if (!plan || !executionResult || !validation) {
      throw new Error('Analysis incomplete');
    }
    
    // Step 4: Generate Report
    this.log('Generating report...');
    const report = await generateReport(
      input,
      plan,
      executionResult.steps,
      validation,
      {
        model: this.options.model,
        stream: this.options.stream,
        ...reportOptions,
      }
    );
    
    const totalDurationMs = Date.now() - startTime;
    
    // Final audit log
    await logAuditEntry(
      this.sessionId,
      'analysis_complete',
      {
        iterations: iteration,
        totalDurationMs,
        success: validation.isValid || validation.issues.every(i => i.severity !== 'error'),
      },
      validation.isValid ? 'approved' : 'review_required',
      plan.understanding
    );
    
    this.log(`\nAnalysis complete in ${totalDurationMs}ms (${iteration} iterations)`);
    
    return {
      sessionId: this.sessionId,
      plan,
      results: executionResult.steps,
      validation,
      report,
      iterations: iteration,
      totalDurationMs,
      success: validation.isValid || validation.issues.every(i => i.severity !== 'error'),
    };
  }
  
  /**
   * Get a quick summary without LLM report generation
   */
  async quickQuery(input: string, context?: string): Promise<{
    sessionId: string;
    summary: string;
    results: StepResult[];
    validation: ValidationResult;
  }> {
    const plan = await createPlan(input, context, this.options.model);
    const executionResult = await executePlan(plan, this.sessionId);
    const validation = await validateResults(input, plan, executionResult.steps, {
      skipLLM: true,
    });
    
    const summary = generateQuickSummary(executionResult.steps, validation);
    
    return {
      sessionId: this.sessionId,
      summary,
      results: executionResult.steps,
      validation,
    };
  }
}

// Export types
export type { Plan, PlanStep } from './planner';
export type { StepResult, ExecutionResult } from './executor';
export type { ValidationResult, ValidationIssue } from './validator';
export type { ReportOptions } from './reporter';
