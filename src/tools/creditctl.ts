import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

/**
 * Credit Analysis Tools
 * Wraps creditctl CLI for credit report analysis
 */
export const analyzeCredit = tool({
  description: 'Analyze credit scores from all three bureaus and determine representative score and tier',
  parameters: z.object({
    equifax: z.number().optional().describe('Equifax credit score'),
    experian: z.number().optional().describe('Experian credit score'),
    transunion: z.number().optional().describe('TransUnion credit score'),
  }),
  execute: async ({ equifax, experian, transunion }) => {
    const scores = [equifax, experian, transunion].filter(Boolean) as number[];
    
    if (scores.length === 0) {
      return { error: 'At least one credit score is required' };
    }
    
    try {
      const result = execSync(
        `creditctl score ${scores.join(' ')} --json`,
        { encoding: 'utf-8' }
      );
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback calculation
      scores.sort((a, b) => a - b);
      const representativeScore = scores.length >= 2 ? scores[Math.floor(scores.length / 2)] : scores[0];
      
      let tier = 'subprime';
      if (representativeScore >= 760) tier = 'excellent';
      else if (representativeScore >= 700) tier = 'good';
      else if (representativeScore >= 660) tier = 'fair';
      else if (representativeScore >= 620) tier = 'acceptable';
      
      return {
        scores: { equifax, experian, transunion },
        representativeScore,
        tier,
        source: 'calculated'
      };
    }
  },
});

export const simulateRescore = tool({
  description: 'Simulate the impact of paying down debt on credit score (rapid rescore simulation)',
  parameters: z.object({
    currentScore: z.number().describe('Current credit score'),
    accountType: z.enum(['credit_card', 'installment', 'mortgage']).describe('Type of account to pay down'),
    currentBalance: z.number().describe('Current balance on the account'),
    creditLimit: z.number().optional().describe('Credit limit (for revolving accounts)'),
    paydownAmount: z.number().describe('Amount to pay down'),
  }),
  execute: async ({ currentScore, accountType, currentBalance, creditLimit, paydownAmount }) => {
    try {
      const args = [
        'rescore',
        '--score', String(currentScore),
        '--type', accountType,
        '--balance', String(currentBalance),
        '--paydown', String(paydownAmount),
      ];
      if (creditLimit) args.push('--limit', String(creditLimit));
      args.push('--json');
      
      const result = execSync(`creditctl ${args.join(' ')}`, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (error: any) {
      // Fallback simulation for credit cards
      if (accountType === 'credit_card' && creditLimit) {
        const currentUtilization = (currentBalance / creditLimit) * 100;
        const newBalance = currentBalance - paydownAmount;
        const newUtilization = (newBalance / creditLimit) * 100;
        
        // Rough estimate: ~20-50 points for significant utilization drops
        let estimatedGain = 0;
        if (currentUtilization > 30 && newUtilization <= 30) estimatedGain += 20;
        if (currentUtilization > 50 && newUtilization <= 50) estimatedGain += 15;
        if (currentUtilization > 10 && newUtilization <= 10) estimatedGain += 10;
        
        return {
          currentScore,
          estimatedNewScore: currentScore + estimatedGain,
          estimatedGain,
          currentUtilization: Math.round(currentUtilization * 10) / 10,
          newUtilization: Math.round(newUtilization * 10) / 10,
          recommendation: newUtilization > 30 ? 'Consider paying down further to below 30% utilization' : 'Good utilization level',
          source: 'estimated'
        };
      }
      
      return {
        currentScore,
        estimatedNewScore: currentScore + 5,
        estimatedGain: 5,
        note: 'Installment loan paydowns typically have smaller score impact than revolving credit',
        source: 'estimated'
      };
    }
  },
});

export const getTradelines = tool({
  description: 'Analyze tradeline details and identify derogatory marks',
  parameters: z.object({
    includeDerogatory: z.boolean().optional().describe('Include analysis of derogatory items'),
  }),
  execute: async ({ includeDerogatory }) => {
    // This would typically parse a credit report file
    // For now, return a structure for the agent to work with
    return {
      note: 'Tradeline analysis requires credit report file input',
      suggestion: 'Ask user for credit report details or specific account information',
    };
  },
});

export const creditctlTools = {
  analyzeCredit,
  simulateRescore,
  getTradelines,
};
