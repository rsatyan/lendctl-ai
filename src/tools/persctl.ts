import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

/**
 * Personal Loan Tools
 * Wraps persctl CLI for unsecured personal loan calculations
 */
export const qualifyPersonalLoan = tool({
  description: 'Check eligibility for unsecured personal loan and calculate terms',
  parameters: z.object({
    requestedAmount: z.number().describe('Requested loan amount'),
    creditScore: z.number().describe('Borrower credit score'),
    annualIncome: z.number().describe('Annual income'),
    monthlyDebts: z.number().describe('Current monthly debt obligations'),
    purpose: z.enum(['debt_consolidation', 'home_improvement', 'major_purchase', 'medical', 'other']).optional().describe('Loan purpose'),
    termMonths: z.number().optional().describe('Desired term in months'),
  }),
  execute: async (params) => {
    try {
      const args = ['qualify'];
      args.push('--amount', String(params.requestedAmount));
      args.push('--score', String(params.creditScore));
      args.push('--income', String(params.annualIncome));
      args.push('--debts', String(params.monthlyDebts));
      if (params.purpose) args.push('--purpose', params.purpose);
      if (params.termMonths) args.push('--term', String(params.termMonths));
      args.push('--json');
      
      const result = execSync(`persctl ${args.join(' ')}`, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback calculation
      const monthlyIncome = params.annualIncome / 12;
      const dti = (params.monthlyDebts / monthlyIncome) * 100;
      
      // Credit-based rate tiers
      let baseRate = 12.0;
      if (params.creditScore >= 760) baseRate = 7.5;
      else if (params.creditScore >= 720) baseRate = 9.0;
      else if (params.creditScore >= 680) baseRate = 11.0;
      else if (params.creditScore >= 640) baseRate = 15.0;
      else if (params.creditScore >= 600) baseRate = 20.0;
      else baseRate = 28.0;
      
      // Eligibility
      const minScore = 580;
      const maxDTI = 50;
      const minIncome = 24000;
      
      const eligible = params.creditScore >= minScore && dti <= maxDTI && params.annualIncome >= minIncome;
      
      // Max amount based on income and credit
      let maxAmount = params.annualIncome * 0.5;
      if (params.creditScore < 680) maxAmount = params.annualIncome * 0.3;
      if (params.creditScore < 620) maxAmount = params.annualIncome * 0.2;
      maxAmount = Math.min(maxAmount, 50000);
      
      const approvedAmount = Math.min(params.requestedAmount, maxAmount);
      
      // Calculate payments for different terms
      const terms = [36, 48, 60];
      const options = terms.map(term => {
        const monthlyRate = baseRate / 100 / 12;
        const payment = approvedAmount * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
        const totalPayments = payment * term;
        return {
          termMonths: term,
          monthlyPayment: Math.round(payment * 100) / 100,
          totalInterest: Math.round(totalPayments - approvedAmount),
          apr: baseRate,
        };
      });
      
      const reasons = [];
      if (params.creditScore < minScore) reasons.push(`Credit score ${params.creditScore} below ${minScore} minimum`);
      if (dti > maxDTI) reasons.push(`DTI ${dti.toFixed(1)}% exceeds ${maxDTI}% maximum`);
      if (params.annualIncome < minIncome) reasons.push(`Income below $${minIncome.toLocaleString()} minimum`);
      if (params.requestedAmount > maxAmount) reasons.push(`Requested amount exceeds maximum of $${maxAmount.toLocaleString()}`);
      
      return {
        requestedAmount: params.requestedAmount,
        approvedAmount: eligible ? approvedAmount : 0,
        maxAmount,
        eligible,
        reasons,
        dti: Math.round(dti * 100) / 100,
        estimatedAPR: baseRate,
        options: eligible ? options : [],
        purpose: params.purpose,
        source: 'calculated',
      };
    }
  },
});

export const compareDebtConsolidation = tool({
  description: 'Compare personal loan vs balance transfer for debt consolidation',
  parameters: z.object({
    totalDebt: z.number().describe('Total debt to consolidate'),
    currentAPR: z.number().describe('Current average APR on existing debt'),
    creditScore: z.number().describe('Credit score'),
    monthlyPayment: z.number().describe('Current monthly payment on debt'),
  }),
  execute: async ({ totalDebt, currentAPR, creditScore, monthlyPayment }) => {
    // Personal loan option
    let personalLoanRate = 12.0;
    if (creditScore >= 760) personalLoanRate = 7.5;
    else if (creditScore >= 720) personalLoanRate = 9.0;
    else if (creditScore >= 680) personalLoanRate = 11.0;
    else if (creditScore >= 640) personalLoanRate = 15.0;
    
    const plMonthlyRate = personalLoanRate / 100 / 12;
    const plTerm = 48;
    const plPayment = totalDebt * (plMonthlyRate * Math.pow(1 + plMonthlyRate, plTerm)) / (Math.pow(1 + plMonthlyRate, plTerm) - 1);
    const plTotalInterest = (plPayment * plTerm) - totalDebt;
    
    // Balance transfer option (0% intro, then higher rate)
    const btIntroMonths = creditScore >= 700 ? 18 : 12;
    const btPostIntroRate = 22.0;
    const btTransferFee = totalDebt * 0.03;
    const btPayoffDuringIntro = totalDebt / btIntroMonths;
    
    // Current payoff timeline
    const currentMonthlyRate = currentAPR / 100 / 12;
    let currentBalance = totalDebt;
    let currentMonths = 0;
    let currentTotalInterest = 0;
    while (currentBalance > 0 && currentMonths < 120) {
      const interest = currentBalance * currentMonthlyRate;
      currentTotalInterest += interest;
      currentBalance = currentBalance + interest - monthlyPayment;
      currentMonths++;
    }
    
    // Calculate savings
    const plSavings = currentTotalInterest - plTotalInterest;
    const btSavings = currentTotalInterest - btTransferFee;
    
    return {
      currentSituation: {
        totalDebt,
        currentAPR,
        monthlyPayment,
        monthsToPayoff: currentMonths,
        totalInterest: Math.round(currentTotalInterest),
      },
      personalLoan: {
        apr: personalLoanRate,
        termMonths: plTerm,
        monthlyPayment: Math.round(plPayment),
        totalInterest: Math.round(plTotalInterest),
        savings: Math.round(plSavings),
        pros: ['Fixed rate', 'Fixed payment', 'Clear payoff date'],
        cons: ['Higher rate than BT intro period', 'Hard credit inquiry'],
      },
      balanceTransfer: {
        introAPR: 0,
        introMonths: btIntroMonths,
        postIntroAPR: btPostIntroRate,
        transferFee: Math.round(btTransferFee),
        paymentToPayoffInIntro: Math.round(btPayoffDuringIntro),
        savings: Math.round(btSavings),
        pros: ['0% intro APR', 'Potential for no interest'],
        cons: ['Must pay off in intro period', 'High rate after intro', 'Transfer fee'],
      },
      recommendation: plSavings > btSavings ? 'personal_loan' : 'balance_transfer',
      explanation: plSavings > btSavings 
        ? `Personal loan saves $${Math.round(plSavings - btSavings)} more in this scenario`
        : `Balance transfer saves $${Math.round(btSavings - plSavings)} if paid off in intro period`,
    };
  },
});

export const persctlTools = {
  qualifyPersonalLoan,
  compareDebtConsolidation,
};
