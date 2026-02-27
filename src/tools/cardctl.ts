import { tool } from 'ai';
import { z } from 'zod';

/**
 * Credit card calculation tools
 * Pure calculation - no CLI dependency
 */
export const calculateCreditLimit = tool({
  description: 'Estimate credit limit based on income and credit',
  parameters: z.object({
    annualIncome: z.number().describe('Annual income'),
    creditScore: z.number().describe('Credit score'),
    existingCreditLimits: z.number().optional().describe('Total existing credit limits'),
    requestedLimit: z.number().optional().describe('Requested credit limit'),
  }),
  execute: async ({ annualIncome, creditScore, existingCreditLimits = 0, requestedLimit }) => {
    // Estimate credit limit as percentage of income based on credit score
    let limitMultiplier: number;
    if (creditScore >= 760) limitMultiplier = 0.50; // Up to 50% of income
    else if (creditScore >= 700) limitMultiplier = 0.35;
    else if (creditScore >= 660) limitMultiplier = 0.25;
    else if (creditScore >= 620) limitMultiplier = 0.15;
    else limitMultiplier = 0.10;
    
    const maxPotentialLimit = annualIncome * limitMultiplier;
    const availableCapacity = Math.max(0, maxPotentialLimit - existingCreditLimits);
    
    let recommendedLimit = Math.min(availableCapacity, requestedLimit || availableCapacity);
    recommendedLimit = Math.round(recommendedLimit / 500) * 500; // Round to nearest $500
    
    // Estimate APR
    let estimatedAPR: number;
    if (creditScore >= 760) estimatedAPR = 15.99;
    else if (creditScore >= 700) estimatedAPR = 18.99;
    else if (creditScore >= 660) estimatedAPR = 22.99;
    else estimatedAPR = 26.99;
    
    return {
      annualIncome,
      creditScore,
      existingCreditLimits,
      maxPotentialLimit: Math.round(maxPotentialLimit),
      availableCapacity: Math.round(availableCapacity),
      recommendedLimit,
      estimatedAPR,
      approved: recommendedLimit >= 500,
      source: 'calculated',
    };
  },
});

export const analyzeBalanceTransfer = tool({
  description: 'Analyze balance transfer savings opportunity',
  parameters: z.object({
    currentBalance: z.number().describe('Current credit card balance'),
    currentAPR: z.number().describe('Current APR (e.g., 24.99)'),
    transferAPR: z.number().describe('Balance transfer APR (e.g., 0 for 0%)'),
    transferFee: z.number().describe('Transfer fee percentage (e.g., 3)'),
    promoMonths: z.number().describe('Promotional period in months'),
    monthlyPayment: z.number().describe('Planned monthly payment'),
  }),
  execute: async ({ currentBalance, currentAPR, transferAPR, transferFee, promoMonths, monthlyPayment }) => {
    const transferFeeAmount = currentBalance * (transferFee / 100);
    const balanceAfterFee = currentBalance + transferFeeAmount;
    
    // Calculate interest saved during promo period
    const currentMonthlyRate = currentAPR / 100 / 12;
    const transferMonthlyRate = transferAPR / 100 / 12;
    
    // Simple interest calculation for comparison
    let currentInterest = 0;
    let transferInterest = 0;
    let currentRemainingBalance = currentBalance;
    let transferRemainingBalance = balanceAfterFee;
    
    for (let month = 0; month < promoMonths; month++) {
      if (currentRemainingBalance > 0) {
        const currentMonthInterest = currentRemainingBalance * currentMonthlyRate;
        currentInterest += currentMonthInterest;
        currentRemainingBalance = currentRemainingBalance + currentMonthInterest - monthlyPayment;
      }
      if (transferRemainingBalance > 0) {
        const transferMonthInterest = transferRemainingBalance * transferMonthlyRate;
        transferInterest += transferMonthInterest;
        transferRemainingBalance = transferRemainingBalance + transferMonthInterest - monthlyPayment;
      }
    }
    
    const netSavings = currentInterest - transferInterest - transferFeeAmount;
    
    return {
      currentBalance,
      currentAPR,
      transferAPR,
      transferFee,
      transferFeeAmount: Math.round(transferFeeAmount * 100) / 100,
      promoMonths,
      monthlyPayment,
      currentInterestCost: Math.round(currentInterest * 100) / 100,
      transferInterestCost: Math.round(transferInterest * 100) / 100,
      netSavings: Math.round(netSavings * 100) / 100,
      breakEvenMonths: transferFeeAmount > 0 ? Math.ceil(transferFeeAmount / (currentBalance * currentMonthlyRate)) : 0,
      recommendation: netSavings > 100 ? 'RECOMMENDED' : netSavings > 0 ? 'MARGINAL' : 'NOT_RECOMMENDED',
      source: 'calculated',
    };
  },
});

export const cardctlTools = {
  calculateCreditLimit,
  analyzeBalanceTransfer,
};
