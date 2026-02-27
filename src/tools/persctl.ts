import { tool } from 'ai';
import { z } from 'zod';

/**
 * Personal loan calculation tools
 * Pure calculation - no CLI dependency
 */
export const qualifyPersonalLoan = tool({
  description: 'Check personal loan eligibility and calculate terms',
  parameters: z.object({
    requestedAmount: z.number().describe('Requested loan amount'),
    creditScore: z.number().describe('Credit score'),
    annualIncome: z.number().describe('Annual income'),
    monthlyDebts: z.number().optional().describe('Monthly debt obligations'),
  }),
  execute: async ({ requestedAmount, creditScore, annualIncome, monthlyDebts = 0 }) => {
    // Estimate rate based on credit score
    let baseRate: number;
    if (creditScore >= 760) baseRate = 7.99;
    else if (creditScore >= 700) baseRate = 11.99;
    else if (creditScore >= 660) baseRate = 15.99;
    else if (creditScore >= 620) baseRate = 21.99;
    else baseRate = 28.99;
    
    // Calculate max loan based on income (typically 10-20% of annual income)
    const maxLoanByIncome = annualIncome * 0.15;
    
    // Calculate payment for 36-month term
    const monthlyRate = baseRate / 100 / 12;
    const termMonths = 36;
    const monthlyPayment = requestedAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
    
    // Check DTI impact
    const grossMonthlyIncome = annualIncome / 12;
    const proposedDTI = ((monthlyDebts + monthlyPayment) / grossMonthlyIncome) * 100;
    
    const eligible = creditScore >= 600 && requestedAmount <= maxLoanByIncome && proposedDTI <= 50;
    
    return {
      requestedAmount,
      creditScore,
      annualIncome,
      estimatedRate: baseRate,
      estimatedMonthlyPayment: Math.round(monthlyPayment * 100) / 100,
      termMonths,
      maxLoanAmount: Math.round(maxLoanByIncome),
      proposedDTI: Math.round(proposedDTI * 100) / 100,
      eligible,
      recommendation: eligible ? 'APPROVE' : 'DECLINE',
      source: 'calculated',
    };
  },
});

export const compareDebtConsolidation = tool({
  description: 'Compare debt consolidation savings',
  parameters: z.object({
    existingDebts: z.array(z.object({
      balance: z.number(),
      rate: z.number(),
      payment: z.number(),
    })).describe('Array of existing debts'),
    consolidationRate: z.number().describe('Consolidation loan rate'),
    consolidationTermMonths: z.number().describe('Consolidation loan term'),
  }),
  execute: async ({ existingDebts, consolidationRate, consolidationTermMonths }) => {
    const totalBalance = existingDebts.reduce((sum, d) => sum + d.balance, 0);
    const totalCurrentPayment = existingDebts.reduce((sum, d) => sum + d.payment, 0);
    const weightedRate = existingDebts.reduce((sum, d) => sum + (d.rate * d.balance), 0) / totalBalance;
    
    // Calculate new payment
    const monthlyRate = consolidationRate / 100 / 12;
    const newPayment = totalBalance * (monthlyRate * Math.pow(1 + monthlyRate, consolidationTermMonths)) / (Math.pow(1 + monthlyRate, consolidationTermMonths) - 1);
    
    const monthlyDifference = totalCurrentPayment - newPayment;
    const totalNewPayments = newPayment * consolidationTermMonths;
    
    return {
      totalExistingBalance: totalBalance,
      totalCurrentPayment: Math.round(totalCurrentPayment * 100) / 100,
      weightedAverageRate: Math.round(weightedRate * 100) / 100,
      consolidationRate,
      consolidationTermMonths,
      newMonthlyPayment: Math.round(newPayment * 100) / 100,
      monthlyDifference: Math.round(monthlyDifference * 100) / 100,
      totalNewPayments: Math.round(totalNewPayments * 100) / 100,
      recommendation: monthlyDifference > 0 && consolidationRate < weightedRate ? 'BENEFICIAL' : 'NOT_RECOMMENDED',
      source: 'calculated',
    };
  },
});

export const persctlTools = {
  qualifyPersonalLoan,
  compareDebtConsolidation,
};
