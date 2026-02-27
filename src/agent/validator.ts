/**
 * Agent Validator
 * Validates execution results for correctness and compliance
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { Plan } from './planner';
import type { StepResult } from './executor';

/**
 * Validation issue
 */
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  step?: number;
  field?: string;
  expected?: any;
  actual?: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
  complianceFlags: string[];
}

/**
 * LLM validation schema
 */
const LLMValidationSchema = z.object({
  isConsistent: z.boolean().describe('Are the calculations mathematically consistent'),
  issues: z.array(z.object({
    severity: z.enum(['error', 'warning', 'info']),
    message: z.string(),
    step: z.number().optional(),
  })),
  suggestions: z.array(z.string()).describe('Suggestions for improving the analysis'),
  complianceFlags: z.array(z.string()).describe('Compliance considerations to highlight'),
});

/**
 * Run rule-based validation checks
 */
function runRuleBasedValidation(results: StepResult[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  // Find relevant results
  const dtiResult = results.find(r => r.tool === 'calculateDTI' && r.success);
  const mortgageResult = results.find(r => r.tool === 'qualifyMortgage' && r.success);
  const creditResult = results.find(r => r.tool === 'analyzeCredit' && r.success);
  const qmResult = results.find(r => r.tool === 'validateQM' && r.success);
  
  // DTI Checks
  if (dtiResult?.output) {
    const { frontEnd, backEnd, grossMonthlyIncome, housingPayment, monthlyDebts } = dtiResult.output;
    
    // Verify DTI math
    if (grossMonthlyIncome && housingPayment) {
      const expectedFrontEnd = (housingPayment / grossMonthlyIncome) * 100;
      if (Math.abs(frontEnd - expectedFrontEnd) > 0.1) {
        issues.push({
          severity: 'error',
          message: `Front-end DTI calculation mismatch: got ${frontEnd}%, expected ${expectedFrontEnd.toFixed(2)}%`,
          step: dtiResult.stepNumber,
          field: 'frontEnd',
          expected: expectedFrontEnd.toFixed(2),
          actual: frontEnd,
        });
      }
    }
    
    // QM safe harbor check
    if (backEnd > 43) {
      issues.push({
        severity: 'warning',
        message: `Back-end DTI ${backEnd.toFixed(1)}% exceeds QM safe harbor limit of 43%`,
        step: dtiResult.stepNumber,
        field: 'backEnd',
      });
    }
    
    // Conventional guideline check
    if (frontEnd > 28) {
      issues.push({
        severity: 'info',
        message: `Front-end DTI ${frontEnd.toFixed(1)}% exceeds conventional guideline of 28%`,
        step: dtiResult.stepNumber,
        field: 'frontEnd',
      });
    }
    
    if (backEnd > 36 && backEnd <= 43) {
      issues.push({
        severity: 'info',
        message: `Back-end DTI ${backEnd.toFixed(1)}% exceeds conventional guideline of 36% (but within QM)`,
        step: dtiResult.stepNumber,
        field: 'backEnd',
      });
    }
  }
  
  // Mortgage/LTV Checks
  if (mortgageResult?.output) {
    const { ltv, pmi, qualification } = mortgageResult.output;
    
    // LTV sanity check
    if (ltv > 100) {
      issues.push({
        severity: 'error',
        message: `LTV ${ltv.toFixed(1)}% exceeds 100% - check down payment calculation`,
        step: mortgageResult.stepNumber,
        field: 'ltv',
      });
    }
    
    // PMI check
    if (ltv > 80 && (!pmi || !pmi.required)) {
      issues.push({
        severity: 'warning',
        message: `LTV ${ltv.toFixed(1)}% > 80% typically requires PMI`,
        step: mortgageResult.stepNumber,
        field: 'pmi',
      });
    }
    
    // Max LTV check
    if (ltv > 97) {
      issues.push({
        severity: 'error',
        message: `LTV ${ltv.toFixed(1)}% exceeds maximum 97% for most programs`,
        step: mortgageResult.stepNumber,
        field: 'ltv',
      });
    }
  }
  
  // Credit Checks
  if (creditResult?.output) {
    const { representativeScore } = creditResult.output;
    
    if (representativeScore < 620) {
      issues.push({
        severity: 'warning',
        message: `Credit score ${representativeScore} below conventional minimum of 620`,
        step: creditResult.stepNumber,
        field: 'representativeScore',
      });
    }
    
    if (representativeScore < 580) {
      issues.push({
        severity: 'warning',
        message: `Credit score ${representativeScore} below FHA minimum of 580 for 3.5% down`,
        step: creditResult.stepNumber,
        field: 'representativeScore',
      });
    }
  }
  
  // QM Compliance
  if (qmResult?.output?.qm) {
    const { compliant, checks } = qmResult.output.qm;
    
    if (!compliant) {
      issues.push({
        severity: 'warning',
        message: 'Loan does not meet QM safe harbor requirements',
        step: qmResult.stepNumber,
      });
      
      if (checks?.prohibitedFeatures?.items?.length > 0) {
        for (const feature of checks.prohibitedFeatures.items) {
          issues.push({
            severity: 'error',
            message: `QM prohibits: ${feature}`,
            step: qmResult.stepNumber,
          });
        }
      }
    }
  }
  
  // Check for failed steps
  const failedSteps = results.filter(r => !r.success);
  for (const failed of failedSteps) {
    issues.push({
      severity: 'error',
      message: `Step ${failed.stepNumber} (${failed.tool}) failed: ${failed.error}`,
      step: failed.stepNumber,
    });
  }
  
  return issues;
}

/**
 * Run LLM-based validation
 */
async function runLLMValidation(
  query: string,
  plan: Plan,
  results: StepResult[],
  model: string = 'gpt-4o'
): Promise<z.infer<typeof LLMValidationSchema>> {
  const { object: validation } = await generateObject({
    model: openai(model),
    schema: LLMValidationSchema,
    system: `You are a senior underwriter reviewing a loan analysis for accuracy and compliance.

Check for:
1. Mathematical consistency (DTI should = total debts / income)
2. Logical errors (e.g., LTV > 100 is impossible)
3. Missing analysis steps
4. Regulatory compliance (QM, ATR, ECOA, TRID)
5. Adverse action requirements if declined

Be thorough but avoid false positives.`,
    prompt: `Original query: ${query}

Execution plan:
${JSON.stringify(plan, null, 2)}

Execution results:
${JSON.stringify(results, null, 2)}

Validate this analysis for correctness and compliance.`,
  });
  
  return validation;
}

/**
 * Validate execution results
 */
export async function validateResults(
  query: string,
  plan: Plan,
  results: StepResult[],
  options: { model?: string; skipLLM?: boolean } = {}
): Promise<ValidationResult> {
  // Run rule-based validation
  const ruleIssues = runRuleBasedValidation(results);
  
  // Run LLM validation unless skipped
  let llmValidation: z.infer<typeof LLMValidationSchema> | null = null;
  if (!options.skipLLM) {
    try {
      llmValidation = await runLLMValidation(query, plan, results, options.model);
    } catch (error) {
      console.error('LLM validation failed:', error);
    }
  }
  
  // Merge issues
  const allIssues: ValidationIssue[] = [
    ...ruleIssues,
    ...(llmValidation?.issues || []).map(i => ({
      severity: i.severity,
      message: i.message,
      step: i.step,
    })),
  ];
  
  // Deduplicate similar issues
  const uniqueIssues = allIssues.filter((issue, index, self) =>
    index === self.findIndex(i => i.message === issue.message)
  );
  
  // Determine overall validity
  const hasErrors = uniqueIssues.some(i => i.severity === 'error');
  const isValid = !hasErrors && (llmValidation?.isConsistent ?? true);
  
  return {
    isValid,
    issues: uniqueIssues,
    suggestions: llmValidation?.suggestions || [],
    complianceFlags: llmValidation?.complianceFlags || [],
  };
}
