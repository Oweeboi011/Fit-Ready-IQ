# Fit-Ready-IQ

An outdoor fitness platform combining route discovery, Strava integration, GPX import, AI chat, and weather.

## Language

### Product

**Trip**:
A single outing by one person to one Route or Place on one date — planned beforehand, then either completed or abandoned. The central concept: readiness, weather, gear, the safety check-in and the eventual record all belong to a Trip.
_Avoid_: Itinerary (the dormant backend entity and `itineraries` collection are the same concept under an older name and are being renamed), adventure, outing.

**Route**:
A way you travel, defined by its geometry — an ordered line of coordinates from which length and elevation gain are derived, never guessed. A Route is real regardless of who produced it: an import, an uploaded track, or one a user drew.
_Avoid_: trail, track, path when you mean the entity. Never use Route for a map pin — that is a Place.

**Place**:
Somewhere you go, identified by a single coordinate — a summit, a campsite, a trailhead. Mountain and Campsite are Place types, not separate concepts.
_Avoid_: destination, spot, POI, and the parallel treatment of "mountains" and "campsites" as if they were different kinds of thing.

**Activity**:
A recorded track of something a person actually did, produced by a device or file import (Strava, Garmin, COROS, Komoot, Apple Health). Evidence of past effort. An Activity may be attached to a completed Trip, but exists independently of any Trip.
_Avoid_: workout, session, effort.

**Check-in**:
A person confirming they are safe — either back from a Trip, or still going. The absence of an expected Check-in is what raises an alert; nothing is inferred from device location.
_Avoid_: check-out, ping, beacon.

**Overdue**:
The state of a Trip whose expected-return time has passed with no Check-in. Judged by the server against the clock, not by the traveller's phone.
_Avoid_: missing, lost, emergency — Overdue is a fact about a Trip, not a claim about a person.

**Emergency contact**:
The person told when a Trip goes Overdue, named on the Trip itself. Not a user of the product.

**Readiness**:
A judgement of whether a person's recent Activities support the demands of a specific Route. Meaningless without real Route geometry.
_Avoid_: fitness score, difficulty match.

**Weather window**:
A span of hours within the forecast when a specific Route is worth doing. A property of a Route-and-forecast pairing, not of a location — the same conditions can be a window for one Route and a no-go for another.
_Avoid_: forecast, conditions, when you mean the recommended span.

### Harness

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
