/**
 * LendCtl AI - Evaluation Runner
 * Tests the agent against a dataset of lending questions
 */

import chalk from 'chalk';
import { LendCtlAgent } from '../src/agent';
import dataset from './dataset.json';

interface TestCase {
  id: string;
  question: string;
  expectedTools: string[];
  expectedOutcome: string;
  category: string;
}

interface EvalResult {
  id: string;
  passed: boolean;
  toolsUsed: string[];
  expectedTools: string[];
  toolCoverage: number;
  durationMs: number;
  error?: string;
}

export async function runEvals(sampleSize?: number): Promise<EvalResult[]> {
  let testCases = dataset as TestCase[];
  
  if (sampleSize) {
    testCases = testCases
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);
  }
  
  console.log(chalk.blue(`\n🧪 Running ${testCases.length} evaluations\n`));
  console.log(chalk.gray('━'.repeat(60)));
  
  const results: EvalResult[] = [];
  const agent = new LendCtlAgent({ skipLLMValidation: true });
  
  for (const testCase of testCases) {
    process.stdout.write(chalk.gray(`[${testCase.category}] ${testCase.id.padEnd(25)}`));
    
    const startTime = Date.now();
    
    try {
      const result = await agent.quickQuery(testCase.question);
      const durationMs = Date.now() - startTime;
      
      // Check tool coverage
      const toolsUsed = result.results.map(r => r.tool);
      const expectedTools = testCase.expectedTools || [];
      const matchedTools = expectedTools.filter(t => toolsUsed.includes(t));
      const toolCoverage = expectedTools.length > 0 
        ? matchedTools.length / expectedTools.length 
        : 1;
      
      const passed = toolCoverage >= 0.8; // 80% tool coverage threshold
      
      results.push({
        id: testCase.id,
        passed,
        toolsUsed,
        expectedTools,
        toolCoverage,
        durationMs,
      });
      
      if (passed) {
        console.log(chalk.green('✓ ') + chalk.gray(`(${durationMs}ms)`));
      } else {
        console.log(chalk.red('✗ ') + chalk.gray(`(${durationMs}ms) - tool coverage: ${(toolCoverage * 100).toFixed(0)}%`));
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      
      results.push({
        id: testCase.id,
        passed: false,
        toolsUsed: [],
        expectedTools: testCase.expectedTools || [],
        toolCoverage: 0,
        durationMs,
        error: error.message,
      });
      
      console.log(chalk.red('✗ ERROR: ') + chalk.gray(error.message.substring(0, 50)));
    }
  }
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const accuracy = (passed / total * 100).toFixed(1);
  const avgDuration = (results.reduce((sum, r) => sum + r.durationMs, 0) / total / 1000).toFixed(1);
  
  console.log(chalk.gray('\n' + '━'.repeat(60)));
  console.log(chalk.blue('\n📊 Evaluation Results\n'));
  
  console.log(`  Passed:       ${chalk.green(passed)}/${total} (${accuracy}%)`);
  console.log(`  Avg Duration: ${avgDuration}s`);
  
  // Category breakdown
  const categories = [...new Set(testCases.map(t => t.category))];
  console.log('\n  By Category:');
  for (const cat of categories) {
    const catResults = results.filter((r, i) => testCases[i].category === cat);
    const catPassed = catResults.filter(r => r.passed).length;
    console.log(`    ${cat.padEnd(12)} ${catPassed}/${catResults.length}`);
  }
  
  // Failed cases
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log(chalk.red('\n  Failed Cases:'));
    for (const f of failed) {
      const reason = f.error || `Tool coverage: ${(f.toolCoverage * 100).toFixed(0)}%`;
      console.log(chalk.red(`    • ${f.id}: ${reason}`));
    }
  }
  
  console.log();
  
  return results;
}

// Run if called directly
if (import.meta.main) {
  runEvals().catch(console.error);
}
