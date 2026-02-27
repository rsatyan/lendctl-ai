#!/usr/bin/env node
/**
 * LendCtl AI - Autonomous Lending Decision Agent
 * CLI Entry Point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import { LendCtlAgent } from './agent';
import 'dotenv/config';

const program = new Command();

// ASCII art banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('LendCtl AI')} - Autonomous Lending Decision Agent        ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Powered by LendCtl CLI Suite')}                            ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}
`;

/**
 * Convert markdown to terminal-friendly formatted text
 */
function renderMarkdownToTerminal(md: string): string {
  let result = md;
  
  // Headers: ### Header -> bold underlined
  result = result.replace(/^### (.+)$/gm, (_, h) => chalk.bold.underline(h));
  result = result.replace(/^## (.+)$/gm, (_, h) => chalk.bold.cyan(h));
  result = result.replace(/^# (.+)$/gm, (_, h) => chalk.bold.cyan.underline(h));
  
  // Bold: **text** -> bold
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, t) => chalk.bold(t));
  
  // Italic: *text* or _text_ -> italic (dim in terminal)
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, t) => chalk.italic(t));
  result = result.replace(/_([^_]+)_/g, (_, t) => chalk.italic(t));
  
  // Code: `code` -> yellow
  result = result.replace(/`([^`]+)`/g, (_, c) => chalk.yellow(c));
  
  // Lists: - item -> • item with indent
  result = result.replace(/^- (.+)$/gm, (_, item) => `  ${chalk.cyan('•')} ${item}`);
  result = result.replace(/^\* (.+)$/gm, (_, item) => `  ${chalk.cyan('•')} ${item}`);
  
  // Numbered lists: 1. item -> 1. with color
  result = result.replace(/^(\d+)\. (.+)$/gm, (_, num, item) => `  ${chalk.cyan(num + '.')} ${item}`);
  
  // Checkmarks
  result = result.replace(/✓/g, chalk.green('✓'));
  result = result.replace(/✗/g, chalk.red('✗'));
  result = result.replace(/⚠️/g, chalk.yellow('⚠'));
  
  // Horizontal rules
  result = result.replace(/^---+$/gm, chalk.gray('─'.repeat(50)));
  result = result.replace(/^===+$/gm, chalk.gray('═'.repeat(50)));
  
  return result;
}

/**
 * Format result as JSON
 */
function formatAsJson(result: any): string {
  return JSON.stringify({
    sessionId: result.sessionId,
    success: result.success,
    iterations: result.iterations,
    totalDurationMs: result.totalDurationMs,
    plan: result.plan,
    results: result.results,
    validation: result.validation,
    report: typeof result.report === 'string' ? result.report : '[streaming]',
  }, null, 2);
}

program
  .name('lendctl-ai')
  .description('Autonomous lending decision agent powered by LendCtl CLI suite')
  .version('0.2.1');

program
  .command('ask')
  .description('Ask a lending question')
  .argument('<question>', 'Your lending question')
  .option('-m, --model <model>', 'LLM model to use', 'gpt-4o')
  .option('-i, --iterations <n>', 'Max planning iterations', '3')
  .option('-v, --verbose', 'Show detailed output')
  .option('-j, --json', 'Output as JSON')
  .option('-f, --format <format>', 'Output format: plain, json, markdown', 'plain')
  .option('--quick', 'Quick mode (skip LLM report generation)')
  .action(async (question, options) => {
    // Determine output format
    const outputJson = options.json || options.format === 'json';
    const outputMarkdown = options.format === 'markdown';
    
    if (!outputJson) {
      console.log(banner);
    }
    
    const agent = new LendCtlAgent({
      model: options.model,
      maxIterations: parseInt(options.iterations),
      verbose: options.verbose,
    });
    
    if (!outputJson) {
      console.log(chalk.blue(`📋 Question: ${question}\n`));
    }
    
    try {
      if (options.quick) {
        if (!outputJson) {
          console.log(chalk.gray('Running in quick mode...\n'));
        }
        const result = await agent.quickQuery(question);
        
        if (outputJson) {
          console.log(JSON.stringify({
            sessionId: result.sessionId,
            summary: result.summary,
            results: result.results,
            validation: result.validation,
          }, null, 2));
        } else {
          console.log(outputMarkdown ? result.summary : renderMarkdownToTerminal(result.summary));
          console.log(chalk.gray(`\nSession: ${result.sessionId}`));
        }
      } else {
        let spinnerInterval: NodeJS.Timeout | undefined;
        
        if (!outputJson) {
          const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
          let i = 0;
          spinnerInterval = setInterval(() => {
            process.stdout.write(`\r${chalk.cyan(spinner[i++ % spinner.length])} Analyzing...`);
          }, 100);
        }
        
        const result = await agent.query(question);
        
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
          process.stdout.write('\r' + ' '.repeat(20) + '\r');
        }
        
        if (outputJson) {
          console.log(formatAsJson(result));
          return;
        }
        
        if (options.verbose) {
          console.log(chalk.yellow('\n📋 Plan:'));
          console.log(chalk.gray(`Understanding: ${result.plan.understanding}`));
          console.log(chalk.gray(`Steps: ${result.plan.steps.length}`));
          
          console.log(chalk.yellow('\n📊 Results:'));
          for (const step of result.results) {
            const status = step.success ? chalk.green('✓') : chalk.red('✗');
            console.log(`  ${status} ${step.description} (${step.durationMs}ms)`);
          }
          
          console.log(chalk.yellow('\n✓ Validation:'));
          console.log(`  Status: ${result.validation.isValid ? chalk.green('VALID') : chalk.red('INVALID')}`);
          if (result.validation.issues.length > 0) {
            for (const issue of result.validation.issues) {
              const color = issue.severity === 'error' ? chalk.red : issue.severity === 'warning' ? chalk.yellow : chalk.gray;
              console.log(`  ${color(`[${issue.severity}]`)} ${issue.message}`);
            }
          }
        }
        
        console.log(chalk.green('\n📝 Report:\n'));
        
        if (typeof result.report === 'string') {
          console.log(outputMarkdown ? result.report : renderMarkdownToTerminal(result.report));
        } else {
          // Stream the report and collect for rendering
          let fullReport = '';
          for await (const chunk of result.report) {
            fullReport += chunk;
          }
          console.log(outputMarkdown ? fullReport : renderMarkdownToTerminal(fullReport));
        }
        
        console.log(chalk.gray(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
        console.log(chalk.gray(`Session: ${result.sessionId}`));
        console.log(chalk.gray(`Iterations: ${result.iterations} | Time: ${result.totalDurationMs}ms`));
      }
    } catch (error: any) {
      if (outputJson) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
        if (options.verbose) {
          console.error(error.stack);
        }
      }
      process.exit(1);
    }
  });

program
  .command('chat')
  .description('Interactive chat mode')
  .option('-m, --model <model>', 'LLM model to use', 'gpt-4o')
  .option('-j, --json', 'Output responses as JSON')
  .action(async (options) => {
    const outputJson = options.json;
    
    if (!outputJson) {
      console.log(banner);
      console.log(chalk.gray('Type your lending questions. Press Ctrl+C or type "quit" to exit.\n'));
    }
    
    const agent = new LendCtlAgent({
      model: options.model,
      stream: true,
    });
    
    // Handle SIGINT gracefully
    process.on('SIGINT', () => {
      if (!outputJson) {
        console.log(chalk.gray('\n\nGoodbye! 👋'));
      }
      process.exit(0);
    });
    
    while (true) {
      let question: string;
      
      try {
        question = await input({ message: outputJson ? '> ' : chalk.blue('You:') });
      } catch (error: any) {
        // Handle Ctrl+C during input (ExitPromptError)
        if (error.name === 'ExitPromptError' || error.message?.includes('SIGINT') || error.message?.includes('force closed')) {
          if (!outputJson) {
            console.log(chalk.gray('\n\nGoodbye! 👋'));
          }
          process.exit(0);
        }
        throw error;
      }
      
      if (question.toLowerCase() === 'quit' || question.toLowerCase() === 'exit') {
        if (!outputJson) {
          console.log(chalk.gray('\nGoodbye! 👋'));
        }
        break;
      }
      
      if (!question.trim()) {
        continue;
      }
      
      if (!outputJson) {
        console.log(chalk.green('\nAgent:'));
      }
      
      try {
        const result = await agent.query(question);
        
        if (outputJson) {
          console.log(formatAsJson(result));
        } else {
          let reportText = '';
          if (typeof result.report === 'string') {
            reportText = result.report;
          } else {
            for await (const chunk of result.report) {
              reportText += chunk;
            }
          }
          console.log(renderMarkdownToTerminal(reportText));
          console.log(chalk.gray(`\n[${result.iterations} iterations, ${result.totalDurationMs}ms]\n`));
        }
      } catch (error: any) {
        if (outputJson) {
          console.log(JSON.stringify({ error: error.message }, null, 2));
        } else {
          console.error(chalk.red(`Error: ${error.message}\n`));
        }
      }
    }
  });

program
  .command('serve')
  .description('Start the API server')
  .option('-p, --port <port>', 'Port to listen on', '5055')
  .action(async (options) => {
    console.log(banner);
    console.log(chalk.cyan(`Starting API server on port ${options.port}...`));
    
    // Dynamic import to avoid loading server code unless needed
    const { default: server } = await import('./server');
    console.log(chalk.green(`✓ Server running at http://localhost:${options.port}`));
    console.log(chalk.gray('\nEndpoints:'));
    console.log(chalk.gray('  POST /api/v1/query - Submit a lending question'));
    console.log(chalk.gray('  GET  /api/v1/sessions - List sessions'));
    console.log(chalk.gray('  GET  /api/v1/sessions/:id - Get session details'));
    console.log(chalk.gray('  GET  /health - Health check'));
  });

program
  .command('eval')
  .description('Run evaluation suite')
  .option('-s, --sample <n>', 'Random sample size')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    console.log(banner);
    console.log(chalk.cyan('Running evaluation suite...\n'));
    
    try {
      const { runEvals } = await import('./evals/run');
      await runEvals(options.sample ? parseInt(options.sample) : undefined);
    } catch (error: any) {
      console.error(chalk.red(`Evaluation failed: ${error.message}`));
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
