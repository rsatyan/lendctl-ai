import { tool } from 'ai';
import { z } from 'zod';

/**
 * Mortgage qualification and calculations
 * Pure calculation - no CLI dependency
 */
export const qualifyMortgage = tool({
  description: 'Check mortgage eligibility and calculate key metrics (LTV, PMI, monthly payment)',
  parameters: z.object({
    loanAmount: z.number().describe('Requested loan amount'),
    propertyValue: z.number().describe('Property value or purchase price'),
    creditScore: z.number().describe('Borrower credit score'),
    annualIncome: z.number().describe('Gross annual income'),
    monthlyDebts: z.number().optional().describe('Monthly debt obligations'),
    downPayment: z.number().optional().describe('Down payment amount'),
    interestRate: z.number().optional().describe('Interest rate (e.g., 6.5 for 6.5%)'),
    loanTermYears: z.number().optional().describe('Loan term in years'),
  }),
  execute: async ({ 
    loanAmount, 
    propertyValue, 
    creditScore, 
    annualIncome, 
    monthlyDebts = 0,
    downPayment,
    interestRate = 7.0,
    loanTermYears = 30
  }) => {
    // Calculate LTV
    const actualDownPayment = downPayment ?? (propertyValue - loanAmount);
    const ltv = (loanAmount / propertyValue) * 100;
    
    // Monthly payment calculation (P&I)
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTermYears * 12;
    const monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    
    // Estimate taxes and insurance (1.5% of property value annually)
    const monthlyTaxesInsurance = (propertyValue * 0.015) / 12;
    
    // PMI if LTV > 80%
    const pmiRequired = ltv > 80;
    const monthlyPMI = pmiRequired ? (loanAmount * 0.005) / 12 : 0; // ~0.5% annual PMI
    
    const totalMonthlyPayment = monthlyPI + monthlyTaxesInsurance + monthlyPMI;
    
    // Calculate DTI
    const grossMonthlyIncome = annualIncome / 12;
    const frontEndDTI = (totalMonthlyPayment / grossMonthlyIncome) * 100;
    const backEndDTI = ((totalMonthlyPayment + monthlyDebts) / grossMonthlyIncome) * 100;
    
    // Determine eligibility
    const creditEligible = creditScore >= 620;
    const dtiEligible = backEndDTI <= 43;
    const ltvEligible = ltv <= 97;
    
    // Determine loan program eligibility
    const conventionalEligible = creditScore >= 620 && ltv <= 97;
    const fhaEligible = creditScore >= 580 && ltv <= 96.5;
    const vaEligible = ltv <= 100; // VA allows 100% financing
    
    return {
      loanAmount,
      propertyValue,
      downPayment: actualDownPayment,
      downPaymentPercent: Math.round((actualDownPayment / propertyValue) * 100 * 100) / 100,
      ltv: Math.round(ltv * 100) / 100,
      creditScore,
      interestRate,
      loanTermYears,
      monthlyPayment: {
        principalAndInterest: Math.round(monthlyPI * 100) / 100,
        taxesAndInsurance: Math.round(monthlyTaxesInsurance * 100) / 100,
        pmi: Math.round(monthlyPMI * 100) / 100,
        total: Math.round(totalMonthlyPayment * 100) / 100,
      },
      pmiRequired,
      dti: {
        frontEnd: Math.round(frontEndDTI * 100) / 100,
        backEnd: Math.round(backEndDTI * 100) / 100,
      },
      eligibility: {
        overall: creditEligible && dtiEligible && ltvEligible,
        creditEligible,
        dtiEligible,
        ltvEligible,
      },
      programs: {
        conventional: conventionalEligible,
        fha: fhaEligible,
        va: vaEligible,
      },
      recommendation: creditEligible && dtiEligible && ltvEligible ? 'APPROVE' : 'REVIEW',
      source: 'calculated',
    };
  },
});

export const calculateAmortization = tool({
  description: 'Calculate loan amortization schedule and totals',
  parameters: z.object({
    loanAmount: z.number().describe('Loan amount'),
    interestRate: z.number().describe('Annual interest rate (e.g., 6.5)'),
    loanTermYears: z.number().describe('Loan term in years'),
  }),
  execute: async ({ loanAmount, interestRate, loanTermYears }) => {
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTermYears * 12;
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    
    const totalPayments = monthlyPayment * numPayments;
    const totalInterest = totalPayments - loanAmount;
    
    return {
      loanAmount,
      interestRate,
      loanTermYears,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      interestToLoanRatio: Math.round((totalInterest / loanAmount) * 100 * 100) / 100,
      source: 'calculated',
    };
  },
});

export const compareLoanPrograms = tool({
  description: 'Compare conventional, FHA, and VA loan programs',
  parameters: z.object({
    loanAmount: z.number().describe('Loan amount'),
    propertyValue: z.number().describe('Property value'),
    creditScore: z.number().describe('Credit score'),
  }),
  execute: async ({ loanAmount, propertyValue, creditScore }) => {
    const ltv = (loanAmount / propertyValue) * 100;
    
    return {
      conventional: {
        eligible: creditScore >= 620 && ltv <= 97,
        minCreditScore: 620,
        maxLTV: 97,
        pmiRequired: ltv > 80,
        downPaymentRequired: Math.max(0, propertyValue * 0.03),
      },
      fha: {
        eligible: creditScore >= 580 && ltv <= 96.5,
        minCreditScore: 580,
        maxLTV: 96.5,
        mipRequired: true,
        downPaymentRequired: propertyValue * 0.035,
      },
      va: {
        eligible: ltv <= 100,
        minCreditScore: 'None (lender varies)',
        maxLTV: 100,
        fundingFeeRequired: true,
        downPaymentRequired: 0,
      },
      recommendation: creditScore >= 740 && ltv <= 80 ? 'conventional' : 
                       creditScore >= 620 ? 'conventional' : 
                       creditScore >= 580 ? 'fha' : 'subprime',
      source: 'calculated',
    };
  },
});

export const mortctlTools = {
  qualifyMortgage,
  calculateAmortization,
  compareLoanPrograms,
};
