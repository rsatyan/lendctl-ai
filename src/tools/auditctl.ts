import { tool } from 'ai';
import { z } from 'zod';

// In-memory audit log for session
const auditLog: Map<string, any[]> = new Map();

/**
 * Audit trail tools
 * Pure in-memory implementation - no CLI dependency
 */
export const createAuditEntry = tool({
  description: 'Create an audit log entry for compliance tracking',
  parameters: z.object({
    sessionId: z.string().describe('Session identifier'),
    action: z.string().describe('Action being logged'),
    details: z.any().optional().describe('Additional details'),
  }),
  execute: async ({ sessionId, action, details }) => {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId,
      action,
      details,
    };
    
    if (!auditLog.has(sessionId)) {
      auditLog.set(sessionId, []);
    }
    auditLog.get(sessionId)!.push(entry);
    
    return {
      logged: true,
      entryId: `${sessionId}-${Date.now()}`,
      timestamp: entry.timestamp,
      source: 'in-memory',
    };
  },
});

export const getAuditTrail = tool({
  description: 'Retrieve audit trail for a session',
  parameters: z.object({
    sessionId: z.string().describe('Session identifier'),
  }),
  execute: async ({ sessionId }) => {
    const entries = auditLog.get(sessionId) || [];
    return {
      sessionId,
      entryCount: entries.length,
      entries,
      source: 'in-memory',
    };
  },
});

export const exportAuditTrail = tool({
  description: 'Export audit trail in exam-ready format',
  parameters: z.object({
    sessionId: z.string().describe('Session identifier'),
    format: z.enum(['json', 'csv']).optional().describe('Export format'),
  }),
  execute: async ({ sessionId, format = 'json' }) => {
    const entries = auditLog.get(sessionId) || [];
    
    if (format === 'csv') {
      const header = 'timestamp,sessionId,action,details';
      const rows = entries.map(e => 
        `${e.timestamp},${e.sessionId},${e.action},"${JSON.stringify(e.details || {})}"`
      );
      return {
        format: 'csv',
        data: [header, ...rows].join('\n'),
        entryCount: entries.length,
        source: 'in-memory',
      };
    }
    
    return {
      format: 'json',
      data: entries,
      entryCount: entries.length,
      source: 'in-memory',
    };
  },
});

export const verifyAuditIntegrity = tool({
  description: 'Verify integrity of audit trail',
  parameters: z.object({
    sessionId: z.string().describe('Session identifier'),
  }),
  execute: async ({ sessionId }) => {
    const entries = auditLog.get(sessionId) || [];
    
    // Check chronological order
    let inOrder = true;
    for (let i = 1; i < entries.length; i++) {
      if (new Date(entries[i].timestamp) < new Date(entries[i-1].timestamp)) {
        inOrder = false;
        break;
      }
    }
    
    return {
      sessionId,
      entryCount: entries.length,
      integrityValid: inOrder,
      chronologicalOrder: inOrder,
      firstEntry: entries[0]?.timestamp || null,
      lastEntry: entries[entries.length - 1]?.timestamp || null,
      source: 'in-memory',
    };
  },
});

// Helper function for other tools to log
export async function logAuditEntry(sessionId: string, action: string, details?: any) {
  return createAuditEntry.execute({ sessionId, action, details });
}

export const auditctlTools = {
  createAuditEntry,
  getAuditTrail,
  exportAuditTrail,
  verifyAuditIntegrity,
};
