/**
 * LendCtl AI Evaluation Suite
 */

import chalk from 'chalk';
import { LendCtlAgent } from '../agent';

interface TestCase {
  name: string;
  query: string;
  expected: {
    toolsUsed?: string[];
    containsKeywords?: string[];
    decision?: 'approve' | 'deny' | 'review';
  };
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Basic mortgage qualification',
    query: 'Can I qualify for a $350,000 mortgage with $85,000 income and 720 credit score?',
    expected: {
      toolsUsed: ['finctl', 'mortctl', 'creditctl'],
      containsKeywords: ['DTI', 'qualify', 'mortgage'],
    },
  },
  {
    name: 'Auto loan calculation',
    query: 'What auto loan can I afford with $5,000/month income and $500/month existing debt?',
    expected: {
      toolsUsed: ['finctl', 'autoloanctl'],
      containsKeywords: ['auto loan', 'payment'],
    },
  },
  {
    name: 'Credit score impact',
    query: 'My credit score is 680. How does this affect my mortgage rate?',
    expected: {
      toolsUsed: ['creditctl'],
      containsKeywords: ['rate', 'credit', 'tier'],
    },
  },
  {
    name: 'Personal loan eligibility',
    query: 'Am I eligible for a $20,000 personal loan with $50k income and 650 credit?',
    expected: {
      toolsUsed: ['persctl', 'creditctl'],
      containsKeywords: ['personal loan', 'eligible'],
    },
  },
  {
    name: 'Credit card recommendation',
    query: 'What credit limit might I qualify for with a 780 credit score?',
    expected: {
      toolsUsed: ['cardctl', 'creditctl'],
      containsKeywords: ['credit limit', 'card'],
    },
  },
  {
    name: 'Debt consolidation',
    query: 'Should I consolidate $15,000 credit card debt at 22% APR?',
    expected: {
      toolsUsed: ['persctl', 'cardctl'],
      containsKeywords: ['consolidat', 'save'],
    },
  },
  {
    name: 'FHA vs Conventional',
    query: 'With 5% down and 680 credit, should I get FHA or conventional?',
    expected: {
      toolsUsed: ['mortctl'],
      containsKeywords: ['FHA', 'conventional', 'PMI', 'MIP'],
    },
  },
  {
    name: 'Income analysis',
    query: 'I have W-2 income of $70k and $20k self-employment. What\'s my qualifying income?',
    expected: {
      toolsUsed: ['finctl'],
      containsKeywords: ['income', 'qualifying'],
    },
  },
];

export async function runEvals(sampleSize?: number): Promise<void> {
  const cases = sampleSize 
    ? TEST_CASES.sort(() => Math.random() - 0.5).slice(0, sampleSize)
    : TEST_CASES;
  
  console.log(chalk.cyan(`\nRunning ${cases.length} evaluation cases...\n`));
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of cases) {
    console.log(chalk.yellow(`📋 ${testCase.name}`));
    console.log(chalk.gray(`   Query: "${testCase.query.substring(0, 60)}..."`));
    
    try {
      const agent = new LendCtlAgent({
        model: 'gpt-4o-mini', // Use cheaper model for evals
        skipLLMValidation: true,
      });
      
      const result = await agent.quickQuery(testCase.query);
      
      // Check expectations
      const toolsUsed = result.results.map(r => r.tool);
      let passedChecks = true;
      const issues: string[] = [];
      
      // Check required tools
      if (testCase.expected.toolsUsed) {
        for (const tool of testCase.expected.toolsUsed) {
          if (!toolsUsed.includes(tool)) {
            passedChecks = false;
            issues.push(`Missing tool: ${tool}`);
          }
        }
      }
      
      // Check keywords in output
      if (testCase.expected.containsKeywords) {
        const output = result.summary.toLowerCase();
        for (const keyword of testCase.expected.containsKeywords) {
          if (!output.includes(keyword.toLowerCase())) {
            passedChecks = false;
            issues.push(`Missing keyword: ${keyword}`);
          }
        }
      }
      
      if (passedChecks) {
        console.log(chalk.green(`   ✓ PASSED`));
        passed++;
      } else {
        console.log(chalk.red(`   ✗ FAILED`));
        for (const issue of issues) {
          console.log(chalk.red(`     - ${issue}`));
        }
        failed++;
      }
    } catch (error: any) {
      console.log(chalk.red(`   ✗ ERROR: ${error.message}`));
      failed++;
    }
    
    console.log();
  }
  
  // Summary
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold(`\nResults: ${passed}/${cases.length} passed`));
  
  if (failed === 0) {
    console.log(chalk.green('\n✓ All tests passed!'));
  } else {
    console.log(chalk.red(`\n✗ ${failed} tests failed`));
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  const sampleArg = process.argv.find(a => a.startsWith('--sample='));
  const sample = sampleArg ? parseInt(sampleArg.split('=')[1]) : undefined;
  runEvals(sample);
}
