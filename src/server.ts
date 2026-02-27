/**
 * LendCtl AI - API Server
 * REST API for the lending agent
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { LendCtlAgent } from './agent';

const app = new Hono();

// Enable CORS
app.use('/*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'lendctl-ai',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// Query endpoint
app.post('/api/v1/query', async (c) => {
  try {
    const body = await c.req.json();
    const { question, model, stream, context } = body;
    
    if (!question) {
      return c.json({ error: 'Missing required field: question' }, 400);
    }
    
    const agent = new LendCtlAgent({
      model: model || 'gpt-4o',
      stream: stream || false,
    });
    
    if (stream) {
      // Server-Sent Events for streaming
      return streamSSE(c, async (stream) => {
        try {
          // Send session info
          await stream.writeSSE({
            data: JSON.stringify({ type: 'session', sessionId: agent.getSessionId() }),
          });
          
          const result = await agent.query(question, context);
          
          // Send plan
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'plan',
              understanding: result.plan.understanding,
              steps: result.plan.steps.length,
            }),
          });
          
          // Send results
          for (const stepResult of result.results) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'step_result',
                step: stepResult.stepNumber,
                tool: stepResult.tool,
                success: stepResult.success,
                durationMs: stepResult.durationMs,
                output: stepResult.success ? stepResult.output : null,
                error: stepResult.error,
              }),
            });
          }
          
          // Send validation
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'validation',
              isValid: result.validation.isValid,
              issues: result.validation.issues,
            }),
          });
          
          // Stream report
          if (typeof result.report === 'string') {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'report', content: result.report }),
            });
          } else {
            for await (const chunk of result.report) {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'report_chunk', content: chunk }),
              });
            }
          }
          
          // Send completion
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'done',
              sessionId: result.sessionId,
              iterations: result.iterations,
              totalDurationMs: result.totalDurationMs,
              success: result.success,
            }),
          });
        } catch (error: any) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', message: error.message }),
          });
        }
      });
    }
    
    // Non-streaming response
    const result = await agent.query(question, context);
    
    return c.json({
      sessionId: result.sessionId,
      success: result.success,
      iterations: result.iterations,
      totalDurationMs: result.totalDurationMs,
      plan: {
        understanding: result.plan.understanding,
        assumptions: result.plan.assumptions,
        steps: result.plan.steps.map(s => ({
          step: s.stepNumber,
          description: s.description,
          tool: s.tool,
        })),
      },
      results: result.results.map(r => ({
        step: r.stepNumber,
        tool: r.tool,
        success: r.success,
        durationMs: r.durationMs,
        output: r.success ? r.output : null,
        error: r.error,
      })),
      validation: result.validation,
      report: typeof result.report === 'string' ? result.report : '[streaming]',
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Quick query endpoint (faster, no LLM report)
app.post('/api/v1/quick-query', async (c) => {
  try {
    const body = await c.req.json();
    const { question, model, context } = body;
    
    if (!question) {
      return c.json({ error: 'Missing required field: question' }, 400);
    }
    
    const agent = new LendCtlAgent({ model: model || 'gpt-4o' });
    const result = await agent.quickQuery(question, context);
    
    return c.json({
      sessionId: result.sessionId,
      summary: result.summary,
      validation: result.validation,
      results: result.results.map(r => ({
        step: r.stepNumber,
        tool: r.tool,
        success: r.success,
        output: r.success ? r.output : null,
      })),
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Sessions endpoint (placeholder - would need persistent storage)
app.get('/api/v1/sessions', (c) => {
  return c.json({
    message: 'Session listing requires persistent storage configuration',
    sessions: [],
  });
});

app.get('/api/v1/sessions/:id', (c) => {
  const id = c.req.param('id');
  return c.json({
    message: 'Session details require persistent storage configuration',
    sessionId: id,
  });
});

// Audit export endpoint
app.get('/api/v1/sessions/:id/audit', async (c) => {
  const id = c.req.param('id');
  const format = c.req.query('format') || 'json';
  
  // Would need to implement persistent audit storage
  return c.json({
    message: 'Audit export requires persistent storage configuration',
    sessionId: id,
    format,
  });
});

// Export for Bun
export default {
  port: parseInt(process.env.PORT || '5055'),
  fetch: app.fetch,
};
