/**
 * Tool Registry
 * Central registration of all LendCtl AI tools
 */

import { finctlTools } from './finctl';
import { creditctlTools } from './creditctl';
import { mortctlTools } from './mortctl';
import { autoloanctlTools } from './autoloanctl';
import { persctlTools } from './persctl';
import { cardctlTools } from './cardctl';
import { compctlTools } from './compctl';
import { auditctlTools } from './auditctl';

/**
 * All available tools grouped by category
 */
export const toolsByCategory = {
  income: finctlTools,
  credit: creditctlTools,
  mortgage: mortctlTools,
  auto: autoloanctlTools,
  personal: persctlTools,
  card: cardctlTools,
  compliance: compctlTools,
  audit: auditctlTools,
};

/**
 * Flat registry of all tools
 */
export const tools = {
  // Income & DTI (finctl)
  analyzeIncome: finctlTools.analyzeIncome,
  calculateDTI: finctlTools.calculateDTI,
  
  // Credit (creditctl)
  analyzeCredit: creditctlTools.analyzeCredit,
  simulateRescore: creditctlTools.simulateRescore,
  getTradelines: creditctlTools.getTradelines,
  
  // Mortgage (mortctl)
  qualifyMortgage: mortctlTools.qualifyMortgage,
  calculateAmortization: mortctlTools.calculateAmortization,
  compareLoanPrograms: mortctlTools.compareLoanPrograms,
  
  // Auto (autoloanctl)
  calculateAutoLoan: autoloanctlTools.calculateAutoLoan,
  recommendGAP: autoloanctlTools.recommendGAP,
  
  // Personal (persctl)
  qualifyPersonalLoan: persctlTools.qualifyPersonalLoan,
  compareDebtConsolidation: persctlTools.compareDebtConsolidation,
  
  // Credit Card (cardctl)
  calculateCreditLimit: cardctlTools.calculateCreditLimit,
  analyzeBalanceTransfer: cardctlTools.analyzeBalanceTransfer,
  
  // Compliance (compctl)
  validateQM: compctlTools.validateQM,
  checkTRID: compctlTools.checkTRID,
  generateAdverseAction: compctlTools.generateAdverseAction,
  
  // Audit (auditctl)
  createAuditEntry: auditctlTools.createAuditEntry,
  getAuditTrail: auditctlTools.getAuditTrail,
  exportAuditTrail: auditctlTools.exportAuditTrail,
  verifyAuditIntegrity: auditctlTools.verifyAuditIntegrity,
};

export type ToolName = keyof typeof tools;

/**
 * Get tool descriptions for planner context
 */
export function getToolDescriptions(): string {
  return Object.entries(tools)
    .map(([name, tool]) => `- ${name}: ${tool.description}`)
    .join('\n');
}

/**
 * Get tools array for AI SDK
 */
export function getToolsArray() {
  return Object.values(tools);
}

/**
 * Lookup tool by name
 */
export function getTool(name: string) {
  return tools[name as ToolName];
}
