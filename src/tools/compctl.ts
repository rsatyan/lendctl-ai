import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

/**
 * Compliance Tools
 * Wraps compctl CLI for regulatory compliance checks
 */
export const validateQM = tool({
  description: 'Validate loan against Qualified Mortgage (QM) and Ability-to-Repay (ATR) requirements',
  parameters: z.object({
    loanAmount: z.number().describe('Loan amount'),
    annualIncome: z.number().describe('Annual income'),
    monthlyDebts: z.number().describe('Monthly debt obligations'),
    interestRate: z.number().describe('Interest rate'),
    points: z.number().optional().describe('Points and fees'),
    termMonths: z.number().optional().describe('Loan term in months'),
    isInterestOnly: z.boolean().optional().describe('Is this an interest-only loan'),
    hasNegativeAmortization: z.boolean().optional().describe('Does loan have negative amortization'),
    hasBalloonPayment: z.boolean().optional().describe('Does loan have balloon payment'),
  }),
  execute: async (params) => {
    try {
      const args = ['qm'];
      args.push('--amount', String(params.loanAmount));
      args.push('--income', String(params.annualIncome));
      args.push('--debts', String(params.monthlyDebts));
      args.push('--rate', String(params.interestRate));
      if (params.points !== undefined) args.push('--points', String(params.points));
      args.push('--json');
      
      const result = execSync(`compctl ${args.join(' ')}`, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback validation
      const monthlyIncome = params.annualIncome / 12;
      const termMonths = params.termMonths || 360;
      
      // Calculate estimated payment
      const monthlyRate = params.interestRate / 100 / 12;
      const payment = params.loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
      
      // Calculate DTI
      const backEndDTI = ((payment + params.monthlyDebts) / monthlyIncome) * 100;
      
      // Points and fees check (max 3% for QM)
      const pointsPercent = params.points ? (params.points / params.loanAmount) * 100 : 0;
      const pointsCompliant = pointsPercent <= 3;
      
      // QM prohibited features
      const prohibitedFeatures = [];
      if (params.isInterestOnly) prohibitedFeatures.push('Interest-only payments');
      if (params.hasNegativeAmortization) prohibitedFeatures.push('Negative amortization');
      if (params.hasBalloonPayment) prohibitedFeatures.push('Balloon payment');
      if (termMonths > 360) prohibitedFeatures.push('Term exceeds 30 years');
      
      // DTI safe harbor
      const dtiCompliant = backEndDTI <= 43;
      const safeHarbor = dtiCompliant && pointsCompliant && prohibitedFeatures.length === 0;
      
      // ATR documentation requirements
      const atrRequirements = [
        'Verify current income/assets',
        'Verify current employment',
        'Monthly mortgage payment for this loan',
        'Monthly payments on other loans',
        'Monthly payments for property taxes',
        'Monthly insurance premiums',
        'Debt obligations',
        'Monthly DTI ratio or residual income',
      ];
      
      return {
        qm: {
          compliant: safeHarbor,
          safeHarbor,
          checks: {
            dti: {
              value: Math.round(backEndDTI * 100) / 100,
              limit: 43,
              passed: dtiCompliant,
            },
            pointsAndFees: {
              value: Math.round(pointsPercent * 100) / 100,
              limit: 3,
              passed: pointsCompliant,
            },
            prohibitedFeatures: {
              items: prohibitedFeatures,
              passed: prohibitedFeatures.length === 0,
            },
          },
        },
        atr: {
          requirements: atrRequirements,
          note: 'Lender must document ability to repay using verified information',
        },
        warnings: [
          backEndDTI > 43 ? `DTI ${backEndDTI.toFixed(1)}% exceeds 43% QM safe harbor` : null,
          backEndDTI > 36 ? `DTI ${backEndDTI.toFixed(1)}% is elevated (conventional guideline: 36%)` : null,
          ...prohibitedFeatures.map(f => `QM prohibits: ${f}`),
        ].filter(Boolean),
        source: 'calculated',
      };
    }
  },
});

export const checkTRID = tool({
  description: 'Check TRID (TILA-RESPA Integrated Disclosure) timing requirements',
  parameters: z.object({
    applicationDate: z.string().describe('Application date (YYYY-MM-DD)'),
    loanEstimateDate: z.string().optional().describe('Loan Estimate provided date'),
    closingDisclosureDate: z.string().optional().describe('Closing Disclosure provided date'),
    closingDate: z.string().optional().describe('Scheduled closing date'),
  }),
  execute: async ({ applicationDate, loanEstimateDate, closingDisclosureDate, closingDate }) => {
    const appDate = new Date(applicationDate);
    const leDate = loanEstimateDate ? new Date(loanEstimateDate) : null;
    const cdDate = closingDisclosureDate ? new Date(closingDisclosureDate) : null;
    const closeDate = closingDate ? new Date(closingDate) : null;
    
    const businessDays = (start: Date, end: Date): number => {
      let count = 0;
      const curr = new Date(start);
      while (curr <= end) {
        const day = curr.getDay();
        if (day !== 0 && day !== 6) count++;
        curr.setDate(curr.getDate() + 1);
      }
      return count;
    };
    
    const results: any = {
      applicationDate,
      requirements: [],
      compliance: {},
    };
    
    // LE must be provided within 3 business days of application
    const leDeadline = new Date(appDate);
    let daysAdded = 0;
    while (daysAdded < 3) {
      leDeadline.setDate(leDeadline.getDate() + 1);
      if (leDeadline.getDay() !== 0 && leDeadline.getDay() !== 6) daysAdded++;
    }
    
    results.loanEstimate = {
      deadline: leDeadline.toISOString().split('T')[0],
      requirement: 'Within 3 business days of application',
    };
    
    if (leDate) {
      const daysToLE = businessDays(appDate, leDate);
      results.loanEstimate.providedDate = loanEstimateDate;
      results.loanEstimate.businessDays = daysToLE;
      results.loanEstimate.compliant = daysToLE <= 3;
      results.compliance.loanEstimate = daysToLE <= 3;
    }
    
    // CD must be provided at least 3 business days before closing
    if (closeDate) {
      const cdDeadline = new Date(closeDate);
      daysAdded = 0;
      while (daysAdded < 3) {
        cdDeadline.setDate(cdDeadline.getDate() - 1);
        if (cdDeadline.getDay() !== 0 && cdDeadline.getDay() !== 6) daysAdded++;
      }
      
      results.closingDisclosure = {
        deadline: cdDeadline.toISOString().split('T')[0],
        closingDate,
        requirement: 'At least 3 business days before closing',
      };
      
      if (cdDate) {
        const daysBeforeClose = businessDays(cdDate, closeDate) - 1;
        results.closingDisclosure.providedDate = closingDisclosureDate;
        results.closingDisclosure.businessDaysBeforeClose = daysBeforeClose;
        results.closingDisclosure.compliant = daysBeforeClose >= 3;
        results.compliance.closingDisclosure = daysBeforeClose >= 3;
      }
    }
    
    // Changed circumstances that allow revised LE
    results.changedCircumstances = [
      'Changed circumstance affecting settlement charges',
      'Borrower requests change',
      'Information provided was inaccurate',
      'New information not previously relied upon',
    ];
    
    return results;
  },
});

export const generateAdverseAction = tool({
  description: 'Generate ECOA-compliant adverse action notice with specific reasons',
  parameters: z.object({
    applicantName: z.string().describe('Applicant name'),
    applicationDate: z.string().describe('Application date'),
    decisionDate: z.string().describe('Decision date'),
    productType: z.enum(['mortgage', 'auto', 'personal', 'credit_card']).describe('Type of credit'),
    reasons: z.array(z.string()).describe('Specific reasons for adverse action (max 4)'),
    creditScore: z.number().optional().describe('Credit score used'),
    creditScoreSource: z.string().optional().describe('Credit bureau source'),
  }),
  execute: async ({ applicantName, applicationDate, decisionDate, productType, reasons, creditScore, creditScoreSource }) => {
    // ECOA requires notice within 30 days
    const appDate = new Date(applicationDate);
    const decDate = new Date(decisionDate);
    const noticeDeadline = new Date(appDate);
    noticeDeadline.setDate(noticeDeadline.getDate() + 30);
    
    const daysFromApp = Math.floor((decDate.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));
    const timingCompliant = daysFromApp <= 30;
    
    // Standard adverse action reasons (CFPB model codes)
    const standardReasons: Record<string, string> = {
      'credit_score': 'Credit score does not meet minimum requirements',
      'dti': 'Debt-to-income ratio too high',
      'ltv': 'Loan-to-value ratio too high',
      'income': 'Income insufficient for amount requested',
      'employment': 'Unable to verify employment',
      'collateral': 'Insufficient collateral value',
      'delinquency': 'Delinquent credit obligations',
      'bankruptcy': 'Bankruptcy on credit record',
      'collections': 'Collection accounts on credit report',
      'credit_history': 'Insufficient credit history',
    };
    
    // Ensure max 4 reasons per ECOA
    const topReasons = reasons.slice(0, 4);
    
    const notice = {
      type: 'Adverse Action Notice',
      compliance: {
        regulation: 'Equal Credit Opportunity Act (ECOA) - Regulation B',
        timingRequirement: '30 days from application',
        timingCompliant,
        reasonsRequirement: 'Specific reasons must be provided (max 4 principal reasons)',
      },
      notice: {
        date: decisionDate,
        applicant: applicantName,
        applicationDate,
        productType,
        decision: 'Credit application denied',
        reasons: topReasons.map((r, i) => ({
          number: i + 1,
          reason: standardReasons[r] || r,
        })),
      },
      creditScoreDisclosure: creditScore ? {
        required: true,
        score: creditScore,
        source: creditScoreSource || 'Credit Bureau',
        range: '300-850',
        factors: 'Key factors that adversely affected your score',
      } : null,
      requiredStatements: [
        'You have the right to request a copy of the appraisal report (for mortgage applications)',
        'You have the right to know the specific reasons for this decision',
        `Federal law prohibits discrimination based on race, color, religion, national origin, sex, marital status, age, receipt of public assistance, or good faith exercise of rights under the Consumer Credit Protection Act`,
      ],
      contactInfo: {
        note: 'Include creditor name, address, and ECOA notice',
      },
    };
    
    return notice;
  },
});

export const compctlTools = {
  validateQM,
  checkTRID,
  generateAdverseAction,
};
