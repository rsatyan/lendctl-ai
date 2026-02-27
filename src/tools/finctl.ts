import { tool } from 'ai';
import { z } from 'zod';

/**
 * Income Analysis Tool
 * Pure calculation - no CLI dependency
 */
export const analyzeIncome = tool({
  description: 'Analyze borrower income from multiple sources (W-2, self-employment, other) and calculate qualifying income',
  parameters: z.object({
    w2Income: z.number().optional().describe('Annual W-2 wage income'),
    selfEmploymentIncome: z.number().optional().describe('Self-employment income (use 2-year average)'),
    otherIncome: z.number().optional().describe('Other income (rental, investments, alimony, etc.)'),
  }),
  execute: async ({ w2Income = 0, selfEmploymentIncome = 0, otherIncome = 0 }) => {
    const totalAnnual = w2Income + selfEmploymentIncome + otherIncome;
    const monthlyIncome = totalAnnual / 12;
    
    return {
      w2Income,
      selfEmploymentIncome,
      otherIncome,
      totalAnnualIncome: totalAnnual,
      grossMonthlyIncome: Math.round(monthlyIncome * 100) / 100,
      incomeBreakdown: {
        w2Percentage: totalAnnual > 0 ? Math.round((w2Income / totalAnnual) * 100) : 0,
        selfEmpPercentage: totalAnnual > 0 ? Math.round((selfEmploymentIncome / totalAnnual) * 100) : 0,
        otherPercentage: totalAnnual > 0 ? Math.round((otherIncome / totalAnnual) * 100) : 0,
      },
      source: 'calculated',
    };
  },
});

export const calculateDTI = tool({
  description: 'Calculate front-end and back-end debt-to-income ratios',
  parameters: z.object({
    grossMonthlyIncome: z.number().describe('Gross monthly income'),
    housingPayment: z.number().describe('Monthly housing payment (PITI: principal, interest, taxes, insurance)'),
    monthlyDebts: z.number().optional().describe('Total monthly debt obligations (car, student loans, credit cards, etc.)'),
  }),
  execute: async ({ grossMonthlyIncome, housingPayment, monthlyDebts = 0 }) => {
    const frontEnd = (housingPayment / grossMonthlyIncome) * 100;
    const backEnd = ((housingPayment + monthlyDebts) / grossMonthlyIncome) * 100;
    
    return {
      grossMonthlyIncome,
      housingPayment,
      monthlyDebts,
      frontEndDTI: Math.round(frontEnd * 100) / 100,
      backEndDTI: Math.round(backEnd * 100) / 100,
      qmCompliant: backEnd <= 43,
      conventionalLimit: backEnd <= 45,
      fhaLimit: backEnd <= 50,
      recommendation: backEnd <= 36 ? 'excellent' : backEnd <= 43 ? 'good' : backEnd <= 50 ? 'marginal' : 'high_risk',
      source: 'calculated',
    };
  },
});

export const finctlTools = {
  analyzeIncome,
  calculateDTI,
};
