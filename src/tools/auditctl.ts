import { tool } from 'ai';
import { z } from 'zod';

/**
 * Audit Trail Tools
 * Manages immutable audit logging for compliance
 */

// In-memory audit store (would use SQLite in production)
const auditStore: Map<string, any[]> = new Map();

export const createAuditEntry = tool({
  description: 'Create an audit trail entry for a decision or action',
  parameters: z.object({
    sessionId: z.string().describe('Session ID for the loan analysis'),
    action: z.string().describe('Action being logged'),
    details: z.record(z.any()).describe('Details of the action'),
    decision: z.string().optional().describe('Decision made (if applicable)'),
    rationale: z.string().optional().describe('Rationale for decision'),
  }),
  execute: async ({ sessionId, action, details, decision, rationale }) => {
    const entry = {
      id: `${sessionId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      sessionId,
      action,
      details,
      decision,
      rationale,
      hash: null as string | null,
    };
    
    // Generate simple hash for integrity
    const content = JSON.stringify({ ...entry, hash: undefined });
    entry.hash = Buffer.from(content).toString('base64').slice(0, 16);
    
    // Store entry
    if (!auditStore.has(sessionId)) {
      auditStore.set(sessionId, []);
    }
    auditStore.get(sessionId)!.push(entry);
    
    return {
      success: true,
      entryId: entry.id,
      timestamp: entry.timestamp,
      hash: entry.hash,
    };
  },
});

export const getAuditTrail = tool({
  description: 'Retrieve the audit trail for a session',
  parameters: z.object({
    sessionId: z.string().describe('Session ID'),
    format: z.enum(['json', 'summary']).optional().describe('Output format'),
  }),
  execute: async ({ sessionId, format }) => {
    const entries = auditStore.get(sessionId) || [];
    
    if (format === 'summary') {
      return {
        sessionId,
        entryCount: entries.length,
        firstEntry: entries[0]?.timestamp,
        lastEntry: entries[entries.length - 1]?.timestamp,
        actions: entries.map(e => ({
          timestamp: e.timestamp,
          action: e.action,
          decision: e.decision,
        })),
      };
    }
    
    return {
      sessionId,
      entryCount: entries.length,
      entries,
    };
  },
});

export const exportAuditTrail = tool({
  description: 'Export audit trail in exam-ready format',
  parameters: z.object({
    sessionId: z.string().describe('Session ID'),
    format: z.enum(['json', 'csv', 'text']).optional().describe('Export format'),
    includeHash: z.boolean().optional().describe('Include integrity hashes'),
  }),
  execute: async ({ sessionId, format = 'json', includeHash = true }) => {
    const entries = auditStore.get(sessionId) || [];
    
    if (entries.length === 0) {
      return { error: 'No audit entries found for session' };
    }
    
    if (format === 'csv') {
      const headers = ['Timestamp', 'Action', 'Decision', 'Details', includeHash ? 'Hash' : null].filter(Boolean);
      const rows = entries.map(e => [
        e.timestamp,
        e.action,
        e.decision || '',
        JSON.stringify(e.details),
        includeHash ? e.hash : null,
      ].filter((_, i) => i < headers.length));
      
      const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
      return { format: 'csv', content: csv };
    }
    
    if (format === 'text') {
      const lines = entries.map(e => {
        let line = `[${e.timestamp}] ${e.action}`;
        if (e.decision) line += ` -> ${e.decision}`;
        if (e.rationale) line += `\n  Rationale: ${e.rationale}`;
        return line;
      });
      return { format: 'text', content: lines.join('\n\n') };
    }
    
    // JSON format
    return {
      format: 'json',
      sessionId,
      exportedAt: new Date().toISOString(),
      entryCount: entries.length,
      entries: includeHash ? entries : entries.map(({ hash, ...e }) => e),
    };
  },
});

export const verifyAuditIntegrity = tool({
  description: 'Verify the integrity of an audit trail (check for tampering)',
  parameters: z.object({
    sessionId: z.string().describe('Session ID to verify'),
  }),
  execute: async ({ sessionId }) => {
    const entries = auditStore.get(sessionId) || [];
    
    if (entries.length === 0) {
      return { error: 'No audit entries found' };
    }
    
    const results = entries.map(entry => {
      const content = JSON.stringify({ ...entry, hash: undefined });
      const computedHash = Buffer.from(content).toString('base64').slice(0, 16);
      return {
        entryId: entry.id,
        timestamp: entry.timestamp,
        valid: computedHash === entry.hash,
      };
    });
    
    const allValid = results.every(r => r.valid);
    
    return {
      sessionId,
      totalEntries: entries.length,
      integrityValid: allValid,
      invalidEntries: results.filter(r => !r.valid),
      verifiedAt: new Date().toISOString(),
    };
  },
});

// Helper function for direct calls (not through tool interface)
export async function logAuditEntry(
  sessionId: string,
  action: string,
  details: Record<string, any>,
  decision?: string,
  rationale?: string
) {
  return createAuditEntry.execute({ sessionId, action, details, decision, rationale });
}

export const auditctlTools = {
  createAuditEntry,
  getAuditTrail,
  exportAuditTrail,
  verifyAuditIntegrity,
};
