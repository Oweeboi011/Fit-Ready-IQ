# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** A public report is
readable by everyone, including whoever would exploit it, for however long the
fix takes.

Report privately through GitHub's **Security → Report a vulnerability** tab on
this repository, which opens a private advisory visible only to maintainers.

Useful things to include, roughly in order of how much they help:

- what an attacker gets — data read, data written, access gained, cost incurred
- the steps to reproduce it, and the URL or endpoint involved
- whether it needs a signed-in account, an admin account, or nothing at all
- anything you already know about the blast radius

You do not need a proof-of-concept exploit, and you do not need to be certain.
A clear description of something that looks wrong is worth more than a polished
report that arrives a month later.

## What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | 3 working days |
| Initial assessment, with a severity | 10 working days |
| Fix for a critical issue | 30 days, or a documented mitigation |

If we disagree with a severity assessment we will say so and explain why, rather
than quietly downgrading it.

## Scope

In scope: this repository, and the production deployment it builds.

Out of scope, because they are not ours to fix — report these to the vendor:
Google Maps, Places, Routes, Weather and Elevation; Firebase Auth and Firestore;
Strava; Gemini; Vercel's platform.

Also out of scope:

- findings from an automated scanner with no demonstrated impact
- missing headers on endpoints that serve no sensitive content, absent an
  exploitation path
- denial of service through sheer request volume. Every route that spends money
  or third-party quota is rate-limited (`src/frontend/src/lib/rateLimitRules.ts`);
  a report that a limit can be reached is not a finding, a report that one can be
  *bypassed* very much is
- social engineering of maintainers or users

## Testing safely

Use your own accounts and your own data. Do not access, modify, or retain
another user's data; if you reach someone else's data by accident, stop, and say
so in the report — that is the finding.

Do not run load or stress tests against production. If you need volume to
demonstrate something, describe it and we will reproduce it ourselves.

## Known gaps

Issues we already know about are recorded, with their reasoning and remediation
plan, in [`docs/wiki/SECURITY.md`](docs/wiki/SECURITY.md) §12. Reading that first
may save you writing up something already tracked — though a report that one of
those is worse than we assessed is genuinely welcome.

## Safe harbour

We will not pursue or support legal action against anyone who makes a good-faith
effort to follow this policy. If a third party brings action against you for
research conducted under it, we will make that good faith clear.
