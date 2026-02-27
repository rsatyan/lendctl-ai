/**
 * LendCtl Tools Registry
 * Exports all tool wrappers for the Vercel AI SDK
 */

export { finctlTool, analyzeIncome, calculateDTI } from './finctl';
export { creditctlTool, analyzeCredit, getRiskTier } from './creditctl';
export { mortctlTool, analyzeMortgage, calculatePayment } from './mortctl';
export { autoloanctlTool, analyzeAutoLoan, calculateAutoPayment } from './autoloanctl';
export { persctlTool, analyzePersonalLoan, calculatePersonalPayment } from './persctl';
export { cardctlTool, analyzeCard, estimateCreditLimit } from './cardctl';
export { compctlTool, checkCompliance, validateQM } from './compctl';
export { auditctlTool, logAuditEntry, getAuditTrail } from './auditctl';

import { finctlTool } from './finctl';
import { creditctlTool } from './creditctl';
import { mortctlTool } from './mortctl';
import { autoloanctlTool } from './autoloanctl';
import { persctlTool } from './persctl';
import { cardctlTool } from './cardctl';
import { compctlTool } from './compctl';
import { auditctlTool } from './auditctl';

/**
 * All tools as a single object for use with generateText/streamText
 */
export const lendctlTools = {
  finctl: finctlTool,
  creditctl: creditctlTool,
  mortctl: mortctlTool,
  autoloanctl: autoloanctlTool,
  persctl: persctlTool,
  cardctl: cardctlTool,
  compctl: compctlTool,
  auditctl: auditctlTool,
};

/**
 * Tool names for validation and routing
 */
export const TOOL_NAMES = [
  'finctl',
  'creditctl',
  'mortctl',
  'autoloanctl',
  'persctl',
  'cardctl',
  'compctl',
  'auditctl',
] as const;

export type ToolName = typeof TOOL_NAMES[number];

/**
 * Validate if a string is a valid tool name
 */
export function isValidTool(name: string): name is ToolName {
  return TOOL_NAMES.includes(name as ToolName);
}
