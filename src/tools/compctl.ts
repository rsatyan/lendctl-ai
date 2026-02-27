import { tool } from 'ai';
import { z } from 'zod';

/**
 * Compliance checking tools
 * Pure calculation - no CLI dependency
 */
export const validateQM = tool({
  description: 'Validate Qualified Mortgage (QM) compliance',
  parameters: z.object({
    backEndDTI: z.number().describe('Back-end debt-to-income ratio'),
    loanTermYears: z.number().optional().describe('Loan term in years'),
    hasNegativeAmortization: z.boolean().optional(),
    hasInterestOnly: z.boolean().optional(),
    hasBalloonPayment: z.boolean().optional(),
    pointsAndFees: z.number().optional().describe('Points and fees as percentage of loan'),
  }),
  execute: async ({ 
    backEndDTI, 
    loanTermYears = 30,
    hasNegativeAmortization = false,
    hasInterestOnly = false,
    hasBalloonPayment = false,
    pointsAndFees = 0
  }) => {
    const issues: string[] = [];
    
    // QM requirements
    if (backEndDTI > 43) issues.push(`DTI ${backEndDTI}% exceeds 43% QM limit`);
    if (loanTermYears > 30) issues.push('Loan term exceeds 30 years');
    if (hasNegativeAmortization) issues.push('Negative amortization not allowed');
    if (hasInterestOnly) issues.push('Interest-only payments not allowed');
    if (hasBalloonPayment) issues.push('Balloon payments not allowed');
    if (pointsAndFees > 3) issues.push(`Points/fees ${pointsAndFees}% exceed 3% limit`);
    
    const isQMCompliant = issues.length === 0;
    
    return {
      isQMCompliant,
      safeHarbor: isQMCompliant && backEndDTI <= 43,
      rebuttablePresumption: !isQMCompliant && backEndDTI <= 43,
      issues,
      checks: {
        dtiUnder43: backEndDTI <= 43,
        termUnder30Years: loanTermYears <= 30,
        noNegativeAmortization: !hasNegativeAmortization,
        noInterestOnly: !hasInterestOnly,
        noBalloon: !hasBalloonPayment,
        feesUnder3Percent: pointsAndFees <= 3,
      },
      recommendation: isQMCompliant ? 'COMPLIANT' : 'REVIEW_REQUIRED',
      source: 'calculated',
    };
  },
});

export const checkTRID = tool({
  description: 'Check TRID (TILA-RESPA Integrated Disclosure) timing requirements',
  parameters: z.object({
    applicationDate: z.string().describe('Application date (YYYY-MM-DD)'),
    loanEstimateDate: z.string().optional().describe('Loan Estimate sent date'),
    closingDisclosureDate: z.string().optional().describe('Closing Disclosure sent date'),
    closingDate: z.string().optional().describe('Scheduled closing date'),
  }),
  execute: async ({ applicationDate, loanEstimateDate, closingDisclosureDate, closingDate }) => {
    const appDate = new Date(applicationDate);
    const today = new Date();
    
    // LE must be provided within 3 business days of application
    const leDueDate = new Date(appDate);
    leDueDate.setDate(leDueDate.getDate() + 3);
    
    const issues: string[] = [];
    const checks: Record<string, any> = {};
    
    if (loanEstimateDate) {
      const leDate = new Date(loanEstimateDate);
      const daysDiff = Math.floor((leDate.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));
      checks.loanEstimateTimely = daysDiff <= 3;
      if (daysDiff > 3) issues.push(`LE sent ${daysDiff} days after application (max 3)`);
    } else {
      checks.loanEstimateTimely = null;
    }
    
    if (closingDisclosureDate && closingDate) {
      const cdDate = new Date(closingDisclosureDate);
      const closeDate = new Date(closingDate);
      const daysBefore = Math.floor((closeDate.getTime() - cdDate.getTime()) / (1000 * 60 * 60 * 24));
      checks.closingDisclosureTimely = daysBefore >= 3;
      if (daysBefore < 3) issues.push(`CD sent only ${daysBefore} days before closing (min 3)`);
    } else {
      checks.closingDisclosureTimely = null;
    }
    
    return {
      applicationDate,
      loanEstimateDueBy: leDueDate.toISOString().split('T')[0],
      loanEstimateDate,
      closingDisclosureDate,
      closingDate,
      isCompliant: issues.length === 0,
      issues,
      checks,
      source: 'calculated',
    };
  },
});

export const generateAdverseAction = tool({
  description: 'Generate ECOA-compliant adverse action reasons',
  parameters: z.object({
    creditScore: z.number().optional().describe('Credit score'),
    dti: z.number().optional().describe('DTI ratio'),
    ltv: z.number().optional().describe('LTV ratio'),
    incomeInsufficient: z.boolean().optional(),
    employmentUnstable: z.boolean().optional(),
    derogatoryCreditHistory: z.boolean().optional(),
  }),
  execute: async ({ 
    creditScore, 
    dti, 
    ltv,
    incomeInsufficient = false,
    employmentUnstable = false,
    derogatoryCreditHistory = false
  }) => {
    const reasons: string[] = [];
    
    if (creditScore && creditScore < 620) reasons.push('Credit score below minimum requirement');
    if (dti && dti > 43) reasons.push('Debt-to-income ratio exceeds guidelines');
    if (ltv && ltv > 97) reasons.push('Loan-to-value ratio exceeds maximum');
    if (incomeInsufficient) reasons.push('Insufficient income for loan amount requested');
    if (employmentUnstable) reasons.push('Unable to verify stable employment history');
    if (derogatoryCreditHistory) reasons.push('Derogatory credit history');
    
    return {
      actionRequired: reasons.length > 0,
      reasons: reasons.slice(0, 4), // ECOA requires up to 4 reasons
      noticeRequired: reasons.length > 0,
      noticeDeadline: '30 days from decision',
      requiredDisclosures: [
        'Right to obtain credit score',
        'Credit reporting agency contact information',
        'Right to dispute accuracy of credit report',
      ],
      source: 'calculated',
    };
  },
});

export const compctlTools = {
  validateQM,
  checkTRID,
  generateAdverseAction,
};
