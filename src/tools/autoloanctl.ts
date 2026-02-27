import { tool } from 'ai';
import { z } from 'zod';

/**
 * Auto loan calculation tools
 * Pure calculation - no CLI dependency
 */
export const calculateAutoLoan = tool({
  description: 'Calculate auto loan payment and affordability',
  parameters: z.object({
    vehiclePrice: z.number().describe('Vehicle purchase price'),
    downPayment: z.number().optional().describe('Down payment amount'),
    tradeInValue: z.number().optional().describe('Trade-in value'),
    interestRate: z.number().describe('Annual interest rate (e.g., 6.5)'),
    loanTermMonths: z.number().describe('Loan term in months (36, 48, 60, 72)'),
    creditScore: z.number().optional().describe('Credit score'),
  }),
  execute: async ({ 
    vehiclePrice, 
    downPayment = 0, 
    tradeInValue = 0, 
    interestRate, 
    loanTermMonths,
    creditScore
  }) => {
    const amountFinanced = vehiclePrice - downPayment - tradeInValue;
    const monthlyRate = interestRate / 100 / 12;
    const monthlyPayment = amountFinanced * (monthlyRate * Math.pow(1 + monthlyRate, loanTermMonths)) / (Math.pow(1 + monthlyRate, loanTermMonths) - 1);
    
    const totalPayments = monthlyPayment * loanTermMonths;
    const totalInterest = totalPayments - amountFinanced;
    const ltv = (amountFinanced / vehiclePrice) * 100;
    
    return {
      vehiclePrice,
      downPayment,
      tradeInValue,
      amountFinanced,
      interestRate,
      loanTermMonths,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      ltv: Math.round(ltv * 100) / 100,
      gapRecommended: ltv > 100,
      source: 'calculated',
    };
  },
});

export const recommendGAP = tool({
  description: 'Recommend GAP insurance based on loan-to-value',
  parameters: z.object({
    vehiclePrice: z.number().describe('Vehicle price'),
    loanAmount: z.number().describe('Loan amount'),
    vehicleAge: z.number().optional().describe('Vehicle age in years'),
  }),
  execute: async ({ vehiclePrice, loanAmount, vehicleAge = 0 }) => {
    const ltv = (loanAmount / vehiclePrice) * 100;
    const depreciationRate = vehicleAge === 0 ? 0.20 : 0.15; // New cars depreciate faster
    const yearOneValue = vehiclePrice * (1 - depreciationRate);
    const potentialGap = loanAmount - yearOneValue;
    
    return {
      vehiclePrice,
      loanAmount,
      ltv: Math.round(ltv * 100) / 100,
      estimatedYearOneValue: Math.round(yearOneValue * 100) / 100,
      potentialGap: Math.max(0, Math.round(potentialGap * 100) / 100),
      gapRecommended: ltv > 80 || potentialGap > 0,
      recommendation: ltv > 100 ? 'STRONGLY_RECOMMENDED' : ltv > 80 ? 'RECOMMENDED' : 'OPTIONAL',
      typicalCost: '$400-$700',
      source: 'calculated',
    };
  },
});

export const autoloanctlTools = {
  calculateAutoLoan,
  recommendGAP,
};
