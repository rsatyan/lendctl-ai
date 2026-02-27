import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

/**
 * Auto Loan Tools
 * Wraps autoloanctl CLI for vehicle financing calculations
 */
export const calculateAutoLoan = tool({
  description: 'Calculate auto loan terms, payment, and LTV analysis',
  parameters: z.object({
    vehiclePrice: z.number().describe('Vehicle purchase price'),
    downPayment: z.number().describe('Down payment amount'),
    creditScore: z.number().describe('Borrower credit score'),
    termMonths: z.number().optional().describe('Loan term in months (default: 60)'),
    vehicleYear: z.number().optional().describe('Vehicle model year'),
    vehicleMileage: z.number().optional().describe('Vehicle mileage'),
    isNew: z.boolean().optional().describe('Is this a new vehicle'),
  }),
  execute: async (params) => {
    const termMonths = params.termMonths || 60;
    const isNew = params.isNew ?? (params.vehicleYear ? new Date().getFullYear() - params.vehicleYear <= 1 : true);
    
    try {
      const args = ['calculate'];
      args.push('--price', String(params.vehiclePrice));
      args.push('--down', String(params.downPayment));
      args.push('--score', String(params.creditScore));
      args.push('--term', String(termMonths));
      if (params.vehicleYear) args.push('--year', String(params.vehicleYear));
      args.push('--json');
      
      const result = execSync(`autoloanctl ${args.join(' ')}`, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback calculation
      const loanAmount = params.vehiclePrice - params.downPayment;
      const ltv = (loanAmount / params.vehiclePrice) * 100;
      
      // Estimate rate based on credit score and vehicle age
      let baseRate = isNew ? 6.5 : 8.5;
      if (params.creditScore >= 750) baseRate -= 2.0;
      else if (params.creditScore >= 700) baseRate -= 1.0;
      else if (params.creditScore < 650) baseRate += 3.0;
      else if (params.creditScore < 600) baseRate += 6.0;
      
      // Higher rates for longer terms
      if (termMonths > 60) baseRate += 0.5;
      if (termMonths > 72) baseRate += 0.5;
      
      const monthlyRate = baseRate / 100 / 12;
      const payment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
      const totalPayments = payment * termMonths;
      const totalInterest = totalPayments - loanAmount;
      
      // Term recommendations
      const termRecommendations = [];
      if (termMonths > 60 && !isNew) {
        termRecommendations.push('Consider shorter term for used vehicle to avoid negative equity');
      }
      if (ltv > 100) {
        termRecommendations.push('Vehicle is underwater - consider larger down payment');
      }
      
      return {
        vehiclePrice: params.vehiclePrice,
        downPayment: params.downPayment,
        loanAmount,
        ltv: Math.round(ltv * 100) / 100,
        termMonths,
        estimatedRate: Math.round(baseRate * 100) / 100,
        monthlyPayment: Math.round(payment * 100) / 100,
        totalPayments: Math.round(totalPayments),
        totalInterest: Math.round(totalInterest),
        isNew,
        recommendations: termRecommendations,
        source: 'calculated',
      };
    }
  },
});

export const recommendGAP = tool({
  description: 'Analyze if GAP insurance is recommended based on LTV and depreciation risk',
  parameters: z.object({
    vehiclePrice: z.number().describe('Vehicle price'),
    loanAmount: z.number().describe('Loan amount'),
    vehicleYear: z.number().describe('Vehicle model year'),
    termMonths: z.number().describe('Loan term in months'),
  }),
  execute: async ({ vehiclePrice, loanAmount, vehicleYear, termMonths }) => {
    const ltv = (loanAmount / vehiclePrice) * 100;
    const vehicleAge = new Date().getFullYear() - vehicleYear;
    
    // Estimate depreciation
    let yearOneDepreciation = vehicleAge === 0 ? 20 : 15;
    let annualDepreciation = 10;
    
    // Calculate when loan balance might exceed vehicle value
    const monthlyDepreciation = (yearOneDepreciation / 12 + annualDepreciation / 12) / 2;
    const monthsUntilEquity = Math.ceil((ltv - 100) / monthlyDepreciation);
    
    const gapRecommended = ltv > 80 || termMonths > 48;
    const reasons = [];
    
    if (ltv > 100) reasons.push(`LTV ${ltv.toFixed(0)}% exceeds vehicle value`);
    if (ltv > 80) reasons.push(`High LTV ${ltv.toFixed(0)}% increases gap risk`);
    if (termMonths > 60) reasons.push('Longer term increases depreciation exposure');
    if (vehicleAge === 0) reasons.push('New vehicles depreciate 20% in year one');
    
    const estimatedGAPCost = loanAmount * 0.02; // ~2% of loan
    
    return {
      ltv: Math.round(ltv * 100) / 100,
      gapRecommended,
      reasons,
      estimatedGAPCost: Math.round(estimatedGAPCost),
      estimatedMonthlyGAP: Math.round(estimatedGAPCost / termMonths * 100) / 100,
      explanation: gapRecommended 
        ? 'GAP insurance recommended to cover potential gap between insurance payout and loan balance if vehicle is totaled'
        : 'GAP insurance optional - loan-to-value ratio is reasonable',
    };
  },
});

export const autoloanctlTools = {
  calculateAutoLoan,
  recommendGAP,
};
