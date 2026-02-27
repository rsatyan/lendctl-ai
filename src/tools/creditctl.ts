import { tool } from 'ai';
import { z } from 'zod';

/**
 * Credit analysis tools
 * Pure calculation - no CLI dependency
 */
export const analyzeCredit = tool({
  description: 'Analyze credit score and determine risk tier',
  parameters: z.object({
    creditScore: z.number().describe('Credit score (300-850)'),
  }),
  execute: async ({ creditScore }) => {
    let tier: string;
    let rateAdjustment: number;
    let approvalLikelihood: string;
    
    if (creditScore >= 760) {
      tier = 'excellent';
      rateAdjustment = 0;
      approvalLikelihood = 'very_high';
    } else if (creditScore >= 700) {
      tier = 'good';
      rateAdjustment = 0.25;
      approvalLikelihood = 'high';
    } else if (creditScore >= 660) {
      tier = 'fair';
      rateAdjustment = 0.75;
      approvalLikelihood = 'moderate';
    } else if (creditScore >= 620) {
      tier = 'poor';
      rateAdjustment = 1.5;
      approvalLikelihood = 'low';
    } else {
      tier = 'subprime';
      rateAdjustment = 3.0;
      approvalLikelihood = 'very_low';
    }
    
    return {
      creditScore,
      tier,
      rateAdjustment,
      approvalLikelihood,
      meetsConventionalMinimum: creditScore >= 620,
      meetsFHAMinimum: creditScore >= 580,
      qualifiesForBestRates: creditScore >= 740,
      source: 'calculated',
    };
  },
});

export const simulateRescore = tool({
  description: 'Simulate credit score improvement from paying down balances',
  parameters: z.object({
    currentScore: z.number().describe('Current credit score'),
    currentUtilization: z.number().describe('Current credit utilization percentage'),
    targetUtilization: z.number().describe('Target utilization after paydown'),
  }),
  execute: async ({ currentScore, currentUtilization, targetUtilization }) => {
    // Rough estimate: ~20-30 points per 10% utilization reduction
    const utilizationReduction = currentUtilization - targetUtilization;
    const estimatedImprovement = Math.round(utilizationReduction * 2.5);
    const projectedScore = Math.min(850, currentScore + estimatedImprovement);
    
    return {
      currentScore,
      currentUtilization,
      targetUtilization,
      utilizationReduction,
      estimatedImprovement,
      projectedScore,
      timeframe: '30-45 days after balance reports',
      disclaimer: 'Actual results may vary based on individual credit profile',
      source: 'calculated',
    };
  },
});

export const getTradelines = tool({
  description: 'Estimate tradeline impact on credit profile',
  parameters: z.object({
    numAccounts: z.number().describe('Number of open accounts'),
    avgAccountAge: z.number().describe('Average account age in months'),
    numDelinquencies: z.number().describe('Number of delinquent accounts'),
  }),
  execute: async ({ numAccounts, avgAccountAge, numDelinquencies }) => {
    let creditMixScore: string;
    let ageScore: string;
    let delinquencyImpact: string;
    
    if (numAccounts >= 5 && numAccounts <= 10) creditMixScore = 'optimal';
    else if (numAccounts >= 3) creditMixScore = 'good';
    else creditMixScore = 'thin_file';
    
    if (avgAccountAge >= 84) ageScore = 'excellent'; // 7+ years
    else if (avgAccountAge >= 48) ageScore = 'good'; // 4+ years
    else if (avgAccountAge >= 24) ageScore = 'fair'; // 2+ years
    else ageScore = 'young';
    
    if (numDelinquencies === 0) delinquencyImpact = 'none';
    else if (numDelinquencies <= 2) delinquencyImpact = 'moderate';
    else delinquencyImpact = 'severe';
    
    return {
      numAccounts,
      avgAccountAge,
      avgAccountAgeYears: Math.round(avgAccountAge / 12 * 10) / 10,
      numDelinquencies,
      creditMixScore,
      ageScore,
      delinquencyImpact,
      recommendations: delinquencyImpact === 'severe' 
        ? ['Focus on rehabilitating delinquent accounts', 'Consider credit counseling']
        : creditMixScore === 'thin_file'
        ? ['Consider becoming authorized user on established account']
        : ['Maintain current good standing'],
      source: 'calculated',
    };
  },
});

export const creditctlTools = {
  analyzeCredit,
  simulateRescore,
  getTradelines,
};
