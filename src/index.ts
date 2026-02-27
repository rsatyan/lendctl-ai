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

program
  .name('lendctl-ai')
  .description('Autonomous lending decision agent powered by LendCtl CLI suite')
  .version('0.1.5');

program
  .command('ask')
  .description('Ask a lending question')
  .argument('<question>', 'Your lending question')
  .option('-m, --model <model>', 'LLM model to use', 'gpt-4o')
  .option('-i, --iterations <n>', 'Max planning iterations', '3')
  .option('-v, --verbose', 'Show detailed output')
  .option('--quick', 'Quick mode (skip LLM report generation)')
  .action(async (question, options) => {
    console.log(banner);
    
    const agent = new LendCtlAgent({
      model: options.model,
      maxIterations: parseInt(options.iterations),
      verbose: options.verbose,
    });
    
    console.log(chalk.blue(`📋 Question: ${question}\n`));
    
    try {
      if (options.quick) {
        console.log(chalk.gray('Running in quick mode...\n'));
        const result = await agent.quickQuery(question);
        console.log(result.summary);
        console.log(chalk.gray(`\nSession: ${result.sessionId}`));
      } else {
        const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        const spinnerInterval = setInterval(() => {
          process.stdout.write(`\r${chalk.cyan(spinner[i++ % spinner.length])} Analyzing...`);
        }, 100);
        
        const result = await agent.query(question);
        
        clearInterval(spinnerInterval);
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
        
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
          console.log(result.report);
        } else {
          // Stream the report
          for await (const chunk of result.report) {
            process.stdout.write(chunk);
          }
          console.log();
        }
        
        console.log(chalk.gray(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
        console.log(chalk.gray(`Session: ${result.sessionId}`));
        console.log(chalk.gray(`Iterations: ${result.iterations} | Time: ${result.totalDurationMs}ms`));
      }
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('chat')
  .description('Interactive chat mode')
  .option('-m, --model <model>', 'LLM model to use', 'gpt-4o')
  .action(async (options) => {
    console.log(banner);
    console.log(chalk.gray('Type your lending questions. Enter "quit" to exit.\n'));
    
    const agent = new LendCtlAgent({
      model: options.model,
      stream: true,
    });
    
    while (true) {
      const question = await input({ message: chalk.blue('You:') });
      
      if (question.toLowerCase() === 'quit' || question.toLowerCase() === 'exit') {
        console.log(chalk.gray('\nGoodbye! 👋'));
        break;
      }
      
      if (!question.trim()) {
        continue;
      }
      
      console.log(chalk.green('\nAgent:'));
      
      try {
        const result = await agent.query(question);
        
        if (typeof result.report === 'string') {
          console.log(result.report);
        } else {
          for await (const chunk of result.report) {
            process.stdout.write(chunk);
          }
          console.log();
        }
        
        console.log(chalk.gray(`\n[${result.iterations} iterations, ${result.totalDurationMs}ms]\n`));
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}\n`));
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
