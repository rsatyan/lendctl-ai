/**
 * Agent Planner
 * Decomposes user queries into executable plans
 */

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getToolDescriptions } from '../tools/registry';

/**
 * Check if OpenAI API key is configured
 */
function checkApiKey(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.error('\n❌ OPENAI_API_KEY not set!\n');
    console.error('To use lendctl-ai, set your OpenAI API key:');
    console.error('  export OPENAI_API_KEY=sk-...\n');
    console.error('Get an API key at: https://platform.openai.com/api-keys\n');
    process.exit(1);
  }
}

/**
 * Plan step schema
 */
const PlanStepSchema = z.object({
  stepNumber: z.number().describe('Sequential step number'),
  description: z.string().describe('What this step accomplishes'),
  tool: z.string().describe('Tool name to execute'),
  parameters: z.record(z.any()).describe('Parameters to pass to the tool'),
  dependsOn: z.array(z.number()).optional().describe('Step numbers this depends on'),
  outputMapping: z.string().optional().describe('How to reference this output in later steps'),
});

/**
 * Complete plan schema
 */
const PlanSchema = z.object({
  understanding: z.string().describe('Restatement of what the user is asking'),
  assumptions: z.array(z.string()).describe('Assumptions being made about missing info'),
  steps: z.array(PlanStepSchema),
  validationChecks: z.array(z.string()).describe('How to verify the result is correct'),
  complianceConsiderations: z.array(z.string()).describe('Relevant regulations to consider'),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;

/**
 * System prompt for the planner
 */
const PLANNER_SYSTEM_PROMPT = `You are an expert loan officer planning how to answer lending questions.
Your job is to decompose complex lending questions into a series of tool calls.

Available tools:
${getToolDescriptions()}

Guidelines:
1. UNDERSTAND the question first - restate what the user is really asking
2. IDENTIFY what calculations are needed
3. PLAN the sequence of tool calls, respecting dependencies
4. Always validate results (e.g., verify DTI = (housing + debts) / income)
5. Consider compliance requirements (QM, ATR, ECOA, TRID)
6. End with audit logging for compliance trail

When referencing outputs from previous steps, use format: \${step1.fieldName}

Example plan for "Can I afford a $400k house with $80k income?":
1. calculateDTI - with estimated housing payment
2. qualifyMortgage - check program eligibility
3. validateQM - ensure compliance
4. createAuditEntry - log the analysis`;

/**
 * Create an execution plan for a user query
 */
export async function createPlan(
  query: string,
  context?: string,
  model: string = 'gpt-4o'
): Promise<Plan> {
  checkApiKey();
  
  const { object: plan } = await generateObject({
    model: openai(model),
    schema: PlanSchema,
    system: PLANNER_SYSTEM_PROMPT,
    prompt: `User query: ${query}
${context ? `\nAdditional context: ${context}` : ''}

Create a step-by-step plan to answer this lending question.
Include all necessary calculations and compliance checks.`,
  });

  return plan;
}

/**
 * Replan after validation failures
 */
export async function replan(
  originalQuery: string,
  previousPlan: Plan,
  validationIssues: string[],
  model: string = 'gpt-4o'
): Promise<Plan> {
  checkApiKey();
  
  const { object: plan } = await generateObject({
    model: openai(model),
    schema: PlanSchema,
    system: PLANNER_SYSTEM_PROMPT,
    prompt: `Original query: ${originalQuery}

Previous plan had these issues:
${validationIssues.map(i => `- ${i}`).join('\n')}

Previous plan:
${JSON.stringify(previousPlan, null, 2)}

Create a revised plan that addresses these issues.`,
  });

  return plan;
}
