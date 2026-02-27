import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

/**
 * Income Analysis Tool
 * Wraps finctl CLI for income calculation and DTI analysis
 */
export const analyzeIncome = tool({
  description: 'Analyze borrower income from multiple sources (W-2, self-employment, other) and calculate qualifying income',
  parameters: z.object({
    w2Income: z.number().optional().describe('Annual W-2 wage income'),
    selfEmploymentIncome: z.number().optional().describe('Self-employment income (use 2-year average)'),
    otherIncome: z.number().optional().describe('Other income (rental, investments, alimony, etc.)'),
  }),
  execute: async ({ w2Income, selfEmploymentIncome, otherIncome }) => {
    const args: string[] = ['analyze'];
    
    if (w2Income) args.push('--w2', String(w2Income));
    if (selfEmploymentIncome) args.push('--self-emp', String(selfEmploymentIncome));
    if (otherIncome) args.push('--other', String(otherIncome));
    args.push('--json');
    
    try {
      const result = execSync(`finctl ${args.join(' ')}`, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (error: any) {
      return { error: error.message, stderr: error.stderr?.toString() };
    }
  },
});

export const calculateDTI = tool({
  description: 'Calculate front-end and back-end debt-to-income ratios',
  parameters: z.object({
    grossMonthlyIncome: z.number().describe('Gross monthly income'),
    housingPayment: z.number().describe('Monthly housing payment (PITI: principal, interest, taxes, insurance)'),
    monthlyDebts: z.number().describe('Total monthly debt obligations (car, student loans, credit cards, etc.)'),
  }),
  execute: async ({ grossMonthlyIncome, housingPayment, monthlyDebts }) => {
    try {
      const result = execSync(
        `finctl dti --income ${grossMonthlyIncome} --housing ${housingPayment} --debts ${monthlyDebts} --json`,
        { encoding: 'utf-8' }
      );
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback calculation if CLI fails
      const frontEnd = (housingPayment / grossMonthlyIncome) * 100;
      const backEnd = ((housingPayment + monthlyDebts) / grossMonthlyIncome) * 100;
      return {
        grossMonthlyIncome,
        housingPayment,
        monthlyDebts,
        frontEnd: Math.round(frontEnd * 100) / 100,
        backEnd: Math.round(backEnd * 100) / 100,
        qmCompliant: backEnd <= 43,
        source: 'calculated'
      };
    }
  },
});

export const finctlTools = {
  analyzeIncome,
  calculateDTI,
};
