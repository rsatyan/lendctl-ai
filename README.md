# LendCtl AI

🏦 **Autonomous Lending Decision Agent** — powered by the [LendCtl CLI Suite](https://github.com/rsatyan/lendctl-skill)

[![npm version](https://img.shields.io/npm/v/lendctl-ai.svg)](https://www.npmjs.com/package/lendctl-ai)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Ask lending questions in plain English. Get instant, compliant decisions with full audit trails.

```bash
lendctl-ai ask "Can I qualify for a $400k mortgage with $90k income and 720 credit?"
```

## Features

- 🤖 **Natural Language Interface** — Ask lending questions like you'd ask a loan officer
- 📋 **Autonomous Planning** — Decomposes complex questions into tool calls
- ✅ **Self-Validation** — Verifies calculations and compliance automatically
- 📊 **8 Integrated Tools** — Income, credit, mortgage, auto, personal, card, compliance, audit
- 📝 **Audit Trail** — Every decision logged for regulatory compliance
- 🔌 **Multi-Channel** — CLI, REST API, WhatsApp, Telegram

## Quick Start

```bash
# Install globally
npm install -g lendctl-ai

# Set your OpenAI API key
export OPENAI_API_KEY=your-key

# Ask a question
lendctl-ai ask "I make $85,000/year with a 720 credit score. Can I afford a $350,000 house?"

# Interactive chat
lendctl-ai chat

# Start API server
lendctl-ai serve
```

## Example

```
$ lendctl-ai ask "I make $85,000/year and want to buy a $350,000 home with 10% down. 
                  I have a 720 credit score and $400/month in car payments."

╔═══════════════════════════════════════════════════════════╗
║  LendCtl AI - Autonomous Lending Decision Agent           ║
╚═══════════════════════════════════════════════════════════╝

📋 Question: I make $85,000/year and want to buy...

📝 Report:

**Summary**: ✅ You likely qualify for this mortgage

**Key Numbers**:
- Gross Monthly Income: $7,083
- Est. Housing Payment: $2,100 (PITI)
- Front-end DTI: 29.6%
- Back-end DTI: 35.3%
- LTV: 90% (PMI required)

**Analysis**:
Your debt-to-income ratios are within acceptable limits for conventional
financing. With a 720 credit score, you qualify for competitive rates.
The 10% down payment means you'll need PMI until you reach 20% equity.

**Recommendation**:
Approved for conventional financing. Consider:
1. Increasing down payment to 20% to eliminate PMI
2. Shopping multiple lenders for best rate with your credit profile

**Compliance Notes**:
- QM Safe Harbor: ✓ (DTI under 43%)
- ATR: Income and debts verified

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session: lendctl-abc123
Iterations: 1 | Time: 4823ms
```

## Integrated Tools

| Tool | Description |
|------|-------------|
| `finctl` | Income analysis, DTI calculation |
| `creditctl` | Credit score analysis, rapid rescore simulation |
| `mortctl` | Mortgage qualification, LTV, PMI, amortization |
| `autoloanctl` | Auto loan calculations, GAP insurance |
| `persctl` | Personal loan eligibility, debt consolidation |
| `cardctl` | Credit limit estimation, balance transfer analysis |
| `compctl` | QM/ATR validation, TRID timing, adverse action |
| `auditctl` | Immutable audit trail, compliance exports |

## API

Start the server:

```bash
lendctl-ai serve --port 5055
```

Query endpoint:

```bash
curl -X POST http://localhost:5055/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Can I qualify for a $400k mortgage with $90k income?",
    "model": "gpt-4o",
    "stream": false
  }'
```

Response:

```json
{
  "sessionId": "lendctl-abc123",
  "success": true,
  "iterations": 1,
  "totalDurationMs": 4823,
  "plan": {
    "understanding": "User wants to know if they qualify for a $400,000 mortgage...",
    "steps": [...]
  },
  "results": [...],
  "validation": {
    "isValid": true,
    "issues": []
  },
  "report": "**Summary**: ✅ You likely qualify..."
}
```

## Architecture

```
User Query → Planner (LLM) → Executor (Tools) → Validator → Reporter
                                    ↓
                        ┌──────────────────────┐
                        │   LendCtl CLI Suite  │
                        │ finctl · creditctl   │
                        │ mortctl · autoloanctl│
                        │ persctl · cardctl    │
                        │ compctl · auditctl   │
                        └──────────────────────┘
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional) | - |
| `PORT` | API server port | 5055 |

## Evaluation

Run the test suite:

```bash
lendctl-ai eval

# Run subset
lendctl-ai eval --sample 5
```

## Related

- [LendCtl Suite](https://github.com/rsatyan/lendctl-skill) — The 8 CLI tools powering this agent
- [finctl](https://github.com/rsatyan/finctl) — Income & DTI calculator
- [creditctl](https://github.com/rsatyan/creditctl) — Credit report analyzer
- [mortctl](https://github.com/rsatyan/mortctl) — Mortgage underwriting
- [compctl](https://github.com/rsatyan/compctl) — Compliance checker

## License

Apache-2.0 © [Satyan Avatara](https://github.com/rsatyan)

---

Built with ❤️ by [Avatar Consulting](https://github.com/rsatyan)
