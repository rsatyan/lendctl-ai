import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

/**
 * Mortgage Underwriting Tools
 * Wraps mortctl CLI for mortgage calculations
 */
export const qualifyMortgage = tool({
  description: 'Check mortgage qualification, calculate LTV, CLTV, PMI, and determine program eligibility',
  parameters: z.object({
    purchasePrice: z.number().describe('Purchase price of the property'),
    downPayment: z.number().describe('Down payment amount'),
    creditScore: z.number().describe('Borrower credit score'),
    grossMonthlyIncome: z.number().describe('Gross monthly income'),
    monthlyDebts: z.number().describe('Monthly debt payments (excluding new mortgage)'),
    propertyType: z.enum(['single_family', 'condo', 'townhouse', 'multi_unit_2', 'multi_unit_3_4']).optional().describe('Type of property'),
    occupancy: z.enum(['primary', 'secondary', 'investment']).optional().describe('Occupancy type'),
    program: z.enum(['conventional', 'fha', 'va', 'usda']).optional().describe('Loan program to evaluate'),
    county: z.string().optional().describe('County for conforming loan limits'),
  }),
  execute: async (params) => {
    try {
      const args = ['qualify'];
      args.push('--price', String(params.purchasePrice));
      args.push('--down', String(params.downPayment));
      args.push('--score', String(params.creditScore));
      args.push('--income', String(params.grossMonthlyIncome));
      args.push('--debts', String(params.monthlyDebts));
      if (params.propertyType) args.push('--property', params.propertyType);
      if (params.occupancy) args.push('--occupancy', params.occupancy);
      if (params.program) args.push('--program', params.program);
      args.push('--json');
      
      const result = execSync(`mortctl ${args.join(' ')}`, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback calculation
      const loanAmount = params.purchasePrice - params.downPayment;
      const ltv = (loanAmount / params.purchasePrice) * 100;
      
      // Estimate rate based on credit score and LTV
      let baseRate = 6.5;
      if (params.creditScore >= 760) baseRate -= 0.25;
      else if (params.creditScore >= 740) baseRate -= 0.125;
      else if (params.creditScore < 680) baseRate += 0.5;
      else if (params.creditScore < 660) baseRate += 0.75;
      if (ltv > 80) baseRate += 0.125;
      
      // Estimate P&I payment
      const monthlyRate = baseRate / 100 / 12;
      const numPayments = 360; // 30 years
      const piPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
      
      // Estimate taxes and insurance
      const monthlyTaxes = (params.purchasePrice * 0.0125) / 12; // 1.25% annual
      const monthlyInsurance = (params.purchasePrice * 0.005) / 12; // 0.5% annual
      
      // PMI estimate
      let monthlyPMI = 0;
      let pmiRequired = false;
      if (ltv > 80) {
        pmiRequired = true;
        monthlyPMI = (loanAmount * 0.007) / 12; // ~0.7% annual
      }
      
      const totalPITI = piPayment + monthlyTaxes + monthlyInsurance + monthlyPMI;
      const frontEndDTI = (totalPITI / params.grossMonthlyIncome) * 100;
      const backEndDTI = ((totalPITI + params.monthlyDebts) / params.grossMonthlyIncome) * 100;
      
      // Qualification check
      const dtiPasses = backEndDTI <= 43;
      const ltvPasses = ltv <= 97;
      const creditPasses = params.creditScore >= 620;
      const qualified = dtiPasses && ltvPasses && creditPasses;
      
      return {
        loanAmount: Math.round(loanAmount),
        ltv: Math.round(ltv * 100) / 100,
        estimatedRate: Math.round(baseRate * 1000) / 1000,
        payment: {
          principal_interest: Math.round(piPayment),
          taxes: Math.round(monthlyTaxes),
          insurance: Math.round(monthlyInsurance),
          pmi: Math.round(monthlyPMI),
          total: Math.round(totalPITI),
        },
        pmi: {
          required: pmiRequired,
          monthlyAmount: Math.round(monthlyPMI),
          ltvToRemove: 78,
        },
        dti: {
          frontEnd: Math.round(frontEndDTI * 100) / 100,
          backEnd: Math.round(backEndDTI * 100) / 100,
        },
        qualification: {
          qualified,
          reasons: [
            !creditPasses ? `Credit score ${params.creditScore} below 620 minimum` : null,
            !ltvPasses ? `LTV ${ltv.toFixed(1)}% exceeds 97% maximum` : null,
            !dtiPasses ? `Back-end DTI ${backEndDTI.toFixed(1)}% exceeds 43% QM limit` : null,
          ].filter(Boolean),
        },
        source: 'calculated',
      };
    }
  },
});

export const calculateAmortization = tool({
  description: 'Generate amortization schedule showing principal and interest breakdown',
  parameters: z.object({
    loanAmount: z.number().describe('Loan amount'),
    interestRate: z.number().describe('Annual interest rate as percentage (e.g., 6.5 for 6.5%)'),
    termMonths: z.number().describe('Loan term in months (e.g., 360 for 30 years)'),
  }),
  execute: async ({ loanAmount, interestRate, termMonths }) => {
    try {
      const result = execSync(
        `mortctl amortize --amount ${loanAmount} --rate ${interestRate} --term ${termMonths} --json`,
        { encoding: 'utf-8' }
      );
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback calculation
      const monthlyRate = interestRate / 100 / 12;
      const payment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
      
      let balance = loanAmount;
      let totalInterest = 0;
      const schedule = [];
      
      for (let month = 1; month <= Math.min(termMonths, 12); month++) {
        const interestPayment = balance * monthlyRate;
        const principalPayment = payment - interestPayment;
        balance -= principalPayment;
        totalInterest += interestPayment;
        
        schedule.push({
          month,
          payment: Math.round(payment * 100) / 100,
          principal: Math.round(principalPayment * 100) / 100,
          interest: Math.round(interestPayment * 100) / 100,
          balance: Math.round(balance * 100) / 100,
        });
      }
      
      // Calculate total interest over life of loan
      const totalPayments = payment * termMonths;
      const lifetimeInterest = totalPayments - loanAmount;
      
      return {
        loanAmount,
        interestRate,
        termMonths,
        monthlyPayment: Math.round(payment * 100) / 100,
        totalPayments: Math.round(totalPayments),
        totalInterest: Math.round(lifetimeInterest),
        firstYearSchedule: schedule,
        source: 'calculated',
      };
    }
  },
});

export const compareLoanPrograms = tool({
  description: 'Compare different loan programs (Conventional, FHA, VA) for a given scenario',
  parameters: z.object({
    purchasePrice: z.number().describe('Purchase price'),
    creditScore: z.number().describe('Credit score'),
    downPaymentPercent: z.number().describe('Down payment as percentage'),
    isVeteran: z.boolean().optional().describe('Is borrower a veteran (for VA eligibility)'),
    isFirstTimeBuyer: z.boolean().optional().describe('Is borrower a first-time homebuyer'),
  }),
  execute: async ({ purchasePrice, creditScore, downPaymentPercent, isVeteran, isFirstTimeBuyer }) => {
    const downPayment = purchasePrice * (downPaymentPercent / 100);
    const loanAmount = purchasePrice - downPayment;
    const ltv = 100 - downPaymentPercent;
    
    const programs = [];
    
    // Conventional
    if (creditScore >= 620 && downPaymentPercent >= 3) {
      let rate = 6.5;
      if (creditScore >= 760) rate = 6.25;
      else if (creditScore < 680) rate = 7.0;
      
      const monthlyRate = rate / 100 / 12;
      const payment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, 360)) / (Math.pow(1 + monthlyRate, 360) - 1);
      const pmi = ltv > 80 ? loanAmount * 0.007 / 12 : 0;
      
      programs.push({
        program: 'Conventional',
        eligible: true,
        rate,
        payment: Math.round(payment),
        pmi: Math.round(pmi),
        totalMonthly: Math.round(payment + pmi),
        minDown: 3,
        pros: ['PMI removable at 80% LTV', 'Lower fees than FHA', 'No upfront premium'],
        cons: ltv > 80 ? ['PMI required'] : [],
      });
    } else {
      programs.push({
        program: 'Conventional',
        eligible: false,
        reason: creditScore < 620 ? 'Credit score below 620' : 'Down payment below 3%',
      });
    }
    
    // FHA
    if (creditScore >= 500) {
      const minDown = creditScore >= 580 ? 3.5 : 10;
      if (downPaymentPercent >= minDown) {
        let rate = 6.25;
        const upfrontMIP = loanAmount * 0.0175;
        const fhaLoan = loanAmount + upfrontMIP;
        const monthlyMIP = fhaLoan * 0.0055 / 12;
        const monthlyRate = rate / 100 / 12;
        const payment = fhaLoan * (monthlyRate * Math.pow(1 + monthlyRate, 360)) / (Math.pow(1 + monthlyRate, 360) - 1);
        
        programs.push({
          program: 'FHA',
          eligible: true,
          rate,
          payment: Math.round(payment),
          upfrontMIP: Math.round(upfrontMIP),
          monthlyMIP: Math.round(monthlyMIP),
          totalMonthly: Math.round(payment + monthlyMIP),
          minDown,
          pros: ['Lower credit requirements', 'Lower down payment with low credit'],
          cons: ['MIP for life of loan', 'Upfront MIP 1.75%'],
        });
      } else {
        programs.push({
          program: 'FHA',
          eligible: false,
          reason: `Minimum ${minDown}% down required for ${creditScore} credit score`,
        });
      }
    }
    
    // VA
    if (isVeteran) {
      const rate = 6.0;
      const fundingFee = loanAmount * 0.023; // First use, no down payment
      const vaLoan = loanAmount; // Funding fee can be financed
      const monthlyRate = rate / 100 / 12;
      const payment = vaLoan * (monthlyRate * Math.pow(1 + monthlyRate, 360)) / (Math.pow(1 + monthlyRate, 360) - 1);
      
      programs.push({
        program: 'VA',
        eligible: true,
        rate,
        payment: Math.round(payment),
        fundingFee: Math.round(fundingFee),
        totalMonthly: Math.round(payment),
        minDown: 0,
        pros: ['No down payment required', 'No monthly PMI/MIP', 'Best rates'],
        cons: ['VA funding fee (can be financed)', 'VA eligibility required'],
      });
    }
    
    return {
      purchasePrice,
      downPayment: Math.round(downPayment),
      downPaymentPercent,
      creditScore,
      programs,
      recommendation: programs.filter(p => p.eligible).sort((a, b) => (a.totalMonthly || 0) - (b.totalMonthly || 0))[0]?.program || 'None eligible',
    };
  },
});

export const mortctlTools = {
  qualifyMortgage,
  calculateAmortization,
  compareLoanPrograms,
};
