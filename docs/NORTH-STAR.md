# North star

Anyone can create, incorporate, and operate an automated society in Argentina from a single conversation.

## The journey we are building

1. **Talk.** A founder opens ar-agents and talks to an agent about their idea. The agent researches the market, pressure-tests the idea, and helps shape it into a business that can actually run itself. The coaching draws on lean startup practice and the best available writing on starting companies.
2. **Build.** The agent turns the validated idea into a working system: a deployable agent application on Vercel-native infrastructure, built on the `@ar-agents/*` packages, with approvals, audit logging, and a kill switch from day one.
3. **Incorporate.** The system prepares the society for registration as a Sociedad Automatizada under the draft Ley General de Sociedades reform (art. 14). While the law is pending (`LAW_STATUS=pre`), every step runs in simulation or draft mode; the day the law is live, the same flow files for real.
4. **Operate.** The founder manages the society from a simple dashboard: what the agents did, what needs approval, financial posture, good standing, one red button to stop everything. The software strives to run the business autonomously; the human is prompted only when judgment or law requires it.

Customers for the societies come later. First the machine has to work end to end.

## Pricing

- Creating a society is **free**, all the way to a working, incorporated, operating system.
- Once a society is operational and doing business, we charge a **multiple of its token cost** (currently 5x the AI Gateway cost of the tokens its agents consume). Our revenue scales with our only real cost of goods. Nothing else is metered.
- The free tier runs on free and low-cost models with per-account caps. Operational societies run on the models their work requires.

## Surfaces

- **Open source** (this repo): the packages, RFCs, verifiers, starter, and everything needed to run a society yourself.
- **Hosted** (ar-agents.ar + studio): the conversational builder, managed operation, registry, oracle, and billing. This is the paid surface once a society earns.

## How this document is used

`ROADMAP.md` at the repo root decomposes this vision into ordered, verifiable work items. `docs/AUTONOMY.md` defines how agent sessions execute those items continuously. Every change should trace back to a line in this file.
