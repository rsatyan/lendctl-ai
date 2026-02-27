/**
 * Agent Reporter
 * Generates human-readable reports from analysis results
 */

import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { Plan } from './planner';
import type { StepResult } from './executor';
import type { ValidationResult } from './validator';

/**
 * Report generation options
 */
export interface ReportOptions {
  model?: string;
  stream?: boolean;
  format?: 'detailed' | 'summary' | 'adverse_action';
  includeCompliance?: boolean;
}

/**
 * System prompt for the reporter
 */
const REPORTER_SYSTEM_PROMPT = `You are a senior loan officer explaining a lending analysis to a customer or colleague.

Guidelines:
1. Lead with the RECOMMENDATION (approved/declined/conditional)
2. Cite specific NUMBERS from the analysis
3. Explain in PLAIN LANGUAGE that a non-expert can understand
4. If DECLINED, explain what would be needed for approval
5. If CONDITIONAL, specify exactly what's needed
6. Always mention relevant COMPLIANCE considerations (QM, ATR, etc.)
7. Be professional but approachable

Format your response with clear sections:
- **Summary**: One-line verdict
- **Key Numbers**: The important metrics
- **Analysis**: What the numbers mean
- **Recommendation**: What to do next
- **Compliance Notes**: Regulatory considerations (if relevant)`;

/**
 * Generate a detailed report
 */
export async function generateReport(
  query: string,
  plan: Plan,
  results: StepResult[],
  validation: ValidationResult,
  options: ReportOptions = {}
): Promise<string | AsyncIterable<string>> {
  const { model = 'gpt-4o', stream = false, format = 'detailed', includeCompliance = true } = options;
  
  // Build context from results
  const successfulResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);
  
  const userPrompt = `Query: ${query}

Plan Understanding: ${plan.understanding}

Assumptions Made:
${plan.assumptions.map(a => `- ${a}`).join('\n')}

Analysis Results:
${successfulResults.map(r => `
### ${r.description}
Tool: ${r.tool}
Output: ${JSON.stringify(r.output, null, 2)}
`).join('\n')}

${failedResults.length > 0 ? `
Failed Steps:
${failedResults.map(r => `- ${r.description}: ${r.error}`).join('\n')}
` : ''}

Validation:
- Valid: ${validation.isValid}
- Issues: ${validation.issues.length > 0 ? validation.issues.map(i => `\n  - [${i.severity}] ${i.message}`).join('') : 'None'}
${validation.complianceFlags.length > 0 ? `
- Compliance Flags: ${validation.complianceFlags.join(', ')}` : ''}

${validation.suggestions.length > 0 ? `
Suggestions: ${validation.suggestions.join('; ')}` : ''}

Generate a ${format} report explaining this lending analysis.
${includeCompliance ? 'Include compliance considerations.' : ''}
${format === 'adverse_action' ? 'Focus on adverse action notice requirements and specific reasons for denial.' : ''}`;

  if (stream) {
    const result = await streamText({
      model: openai(model),
      system: REPORTER_SYSTEM_PROMPT,
      prompt: userPrompt,
    });
    return result.textStream;
  }

  const { text } = await generateText({
    model: openai(model),
    system: REPORTER_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  return text;
}

/**
 * Generate a quick summary (no LLM call)
 */
export function generateQuickSummary(
  results: StepResult[],
  validation: ValidationResult
): string {
  const lines: string[] = [];
  
  // Find key results
  const dtiResult = results.find(r => r.tool === 'calculateDTI' && r.success);
  const mortgageResult = results.find(r => r.tool === 'qualifyMortgage' && r.success);
  const creditResult = results.find(r => r.tool === 'analyzeCredit' && r.success);
  
  // Overall status
  const hasErrors = validation.issues.some(i => i.severity === 'error');
  const status = hasErrors ? '❌ Issues Found' : validation.isValid ? '✅ Analysis Complete' : '⚠️ Review Needed';
  lines.push(`**Status:** ${status}`);
  lines.push('');
  
  // Key metrics
  lines.push('**Key Metrics:**');
  
  if (dtiResult?.output) {
    const { frontEnd, backEnd } = dtiResult.output;
    lines.push(`- Front-end DTI: ${frontEnd?.toFixed(1)}%`);
    lines.push(`- Back-end DTI: ${backEnd?.toFixed(1)}%`);
  }
  
  if (mortgageResult?.output) {
    const { ltv, loanAmount, payment } = mortgageResult.output;
    lines.push(`- LTV: ${ltv?.toFixed(1)}%`);
    lines.push(`- Loan Amount: $${loanAmount?.toLocaleString()}`);
    if (payment?.total) {
      lines.push(`- Monthly Payment: $${payment.total?.toLocaleString()}`);
    }
  }
  
  if (creditResult?.output) {
    const { representativeScore, tier } = creditResult.output;
    lines.push(`- Credit Score: ${representativeScore} (${tier})`);
  }
  
  // Issues
  if (validation.issues.length > 0) {
    lines.push('');
    lines.push('**Issues:**');
    for (const issue of validation.issues.slice(0, 5)) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${icon} ${issue.message}`);
    }
    if (validation.issues.length > 5) {
      lines.push(`... and ${validation.issues.length - 5} more`);
    }
  }
  
  return lines.join('\n');
}
