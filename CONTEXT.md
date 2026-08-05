# Fit-Ready-IQ

An outdoor fitness platform combining route discovery, Strava integration, GPX import, AI chat, and weather.

## Language

**Agent harness**:
The tooling and instruction files that let an AI coding agent work in this repo — context files, skills, scoped instructions, CI-driven review bots. This repo's canonical harness is Claude Code (`.claude/CLAUDE.md` + `.claude/skills/`); anything else (e.g. GitHub Copilot's `dev-agent`) is a thin pointer at it, not an independent copy.
_Avoid_: "AI tooling," "agent setup" — both used loosely for this in the wild; "harness" is the precise term.

**Harness engineering**:
Building and maintaining the agent harness itself (skills, context files, CI bots) — as opposed to using an agent to write product code.
_Avoid_: conflating with "agentic engineering" (below) — they answer different questions.

**Agentic engineering**:
Using AI agents (Claude Code, Copilot, CI bots) to build and maintain this repo's product code. Distinct from harness engineering (which builds the tools) and from the product itself being "agentic" (below).

**Agentic AI (product sense)**:
An in-product AI capability that autonomously plans and takes multi-step action (tool calls, side effects) rather than answering a single prompt. As of this writing, nothing in the product is agentic in this sense — `ChatBot.tsx` is a single-turn Gemini conversation with no tool use; `match_routes_use_case.py` is a deterministic ranking function, not an LLM-driven agent. **Decided direction (2026-08-04)**: give the chat bot real tool-use — save a route, analyze a route, analyze weather — as its first agentic capability. Scope and tool boundaries not yet specified.
_Avoid_: calling the existing chat feature or route-matching "agentic" — neither takes autonomous multi-step action today.
