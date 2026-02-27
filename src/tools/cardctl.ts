import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

/**
 * Credit Card Tools
 * Wraps cardctl CLI for credit card decisioning
 */
export const calculateCreditLimit = tool({
  description: 'Calculate recommended credit limit based on income and credit profile',
  parameters: z.object({
    annualIncome: z.number().describe('Annual income'),
    creditScore: z.number().describe('Credit score'),
    existingCreditLimits: z.number().optional().describe('Total existing credit limits'),
    monthlyDebt: z.number().optional().describe('Monthly debt payments'),
    cardType: z.enum(['basic', 'rewards', 'premium', 'secured']).optional().describe('Type of card'),
  }),
  execute: async (params) => {
    try {
      const args = ['limit'];
      args.push('--income', String(params.annualIncome));
      args.push('--score', String(params.creditScore));
      if (params.existingCreditLimits) args.push('--existing', String(params.existingCreditLimits));
      if (params.cardType) args.push('--type', params.cardType);
      args.push('--json');
      
      const result = execSync(`cardctl ${args.join(' ')}`, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback calculation
      let baseMultiplier = 0.5;
      let minLimit = 500;
      let maxLimit = 50000;
      
      // Adjust based on credit score
      if (params.creditScore >= 760) {
        baseMultiplier = 0.75;
        maxLimit = 100000;
      } else if (params.creditScore >= 720) {
        baseMultiplier = 0.6;
        maxLimit = 50000;
      } else if (params.creditScore >= 680) {
        baseMultiplier = 0.4;
        maxLimit = 25000;
      } else if (params.creditScore >= 640) {
        baseMultiplier = 0.25;
        maxLimit = 10000;
      } else {
        baseMultiplier = 0.15;
        maxLimit = 3000;
        minLimit = 300;
      }
      
      // Card type adjustments
      if (params.cardType === 'secured') {
        minLimit = 200;
        maxLimit = 2500;
        baseMultiplier = 0;
      } else if (params.cardType === 'premium' && params.creditScore < 700) {
        return {
          eligible: false,
          reason: 'Premium cards typically require 700+ credit score',
          alternative: 'Consider a rewards or basic card',
        };
      }
      
      let recommendedLimit = params.annualIncome * baseMultiplier;
      
      // Consider existing credit exposure
      if (params.existingCreditLimits) {
        const totalExposure = params.existingCreditLimits + recommendedLimit;
        const maxExposure = params.annualIncome * 1.5;
        if (totalExposure > maxExposure) {
          recommendedLimit = Math.max(minLimit, maxExposure - params.existingCreditLimits);
        }
      }
      
      recommendedLimit = Math.max(minLimit, Math.min(maxLimit, recommendedLimit));
      
      // Estimate APR
      let purchaseAPR = 24.0;
      if (params.creditScore >= 760) purchaseAPR = 16.0;
      else if (params.creditScore >= 720) purchaseAPR = 18.0;
      else if (params.creditScore >= 680) purchaseAPR = 21.0;
      else if (params.creditScore >= 640) purchaseAPR = 24.0;
      else purchaseAPR = 28.0;
      
      return {
        eligible: true,
        recommendedLimit: Math.round(recommendedLimit),
        minLimit,
        maxLimit,
        estimatedPurchaseAPR: purchaseAPR,
        cardType: params.cardType || 'basic',
        creditTier: params.creditScore >= 760 ? 'excellent' : params.creditScore >= 700 ? 'good' : params.creditScore >= 640 ? 'fair' : 'building',
        source: 'calculated',
      };
    }
  },
});

export const analyzeBalanceTransfer = tool({
  description: 'Analyze balance transfer options and calculate savings',
  parameters: z.object({
    balanceToTransfer: z.number().describe('Balance amount to transfer'),
    currentAPR: z.number().describe('Current APR on existing card'),
    creditScore: z.number().describe('Credit score'),
    monthlyPayment: z.number().describe('Planned monthly payment'),
  }),
  execute: async ({ balanceToTransfer, currentAPR, creditScore, monthlyPayment }) => {
    // Determine BT offer based on credit score
    let introAPR = 0;
    let introMonths = 0;
    let transferFeePercent = 3;
    let postIntroAPR = 22;
    let eligible = false;
    
    if (creditScore >= 720) {
      introMonths = 21;
      postIntroAPR = 18;
      eligible = true;
    } else if (creditScore >= 680) {
      introMonths = 15;
      postIntroAPR = 21;
      eligible = true;
    } else if (creditScore >= 640) {
      introMonths = 12;
      postIntroAPR = 24;
      transferFeePercent = 5;
      eligible = true;
    } else {
      eligible = false;
    }
    
    if (!eligible) {
      return {
        eligible: false,
        reason: 'Balance transfer cards typically require 640+ credit score',
        alternative: 'Consider a secured card to build credit first',
      };
    }
    
    const transferFee = balanceToTransfer * (transferFeePercent / 100);
    const monthsToPayoff = Math.ceil(balanceToTransfer / monthlyPayment);
    
    // Calculate with current card
    let currentBalance = balanceToTransfer;
    let currentMonths = 0;
    let currentInterest = 0;
    const currentMonthlyRate = currentAPR / 100 / 12;
    
    while (currentBalance > 0 && currentMonths < 120) {
      const interest = currentBalance * currentMonthlyRate;
      currentInterest += interest;
      currentBalance = currentBalance + interest - monthlyPayment;
      currentMonths++;
    }
    
    // Calculate with BT card
    let btBalance = balanceToTransfer;
    let btMonths = 0;
    let btInterest = 0;
    
    while (btBalance > 0 && btMonths < 120) {
      const rate = btMonths < introMonths ? 0 : postIntroAPR / 100 / 12;
      const interest = btBalance * rate;
      btInterest += interest;
      btBalance = btBalance + interest - monthlyPayment;
      btMonths++;
    }
    
    const totalBTCost = btInterest + transferFee;
    const savings = currentInterest - totalBTCost;
    const paidOffInIntro = monthsToPayoff <= introMonths;
    
    return {
      eligible: true,
      balanceToTransfer,
      transferFee: Math.round(transferFee),
      transferFeePercent,
      introAPR,
      introMonths,
      postIntroAPR,
      analysis: {
        currentCard: {
          monthsToPayoff: currentMonths,
          totalInterest: Math.round(currentInterest),
        },
        balanceTransfer: {
          monthsToPayoff: btMonths,
          totalInterest: Math.round(btInterest),
          totalCost: Math.round(totalBTCost),
        },
      },
      savings: Math.round(savings),
      paidOffInIntro,
      monthlyPaymentToPayInIntro: Math.round(balanceToTransfer / introMonths),
      recommendation: savings > 0 ? 'Balance transfer recommended' : 'Keep current card - no savings',
      warning: !paidOffInIntro ? `Warning: At $${monthlyPayment}/mo, balance won't be paid off in intro period` : null,
    };
  },
});

export const cardctlTools = {
  calculateCreditLimit,
  analyzeBalanceTransfer,
};
