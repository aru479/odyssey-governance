# BrandGuard — Pre-Publication Brand Governance (Inkloom AI)

**Team Odyssey:** Arnav Verma, Harshita Khandelwal, Rudransh, Priyanshi, Aradhy Singhal, Saksham Yadav  
**Institution:** Newton School of Technology, Rishihood University  
**Track:** Brand Governance – Inkloom AI (CodeZen India 2026 — Round 2 MVP)

> *"Pre-publication brand governance: rules catch the obvious, grounded AI handles the nuance, humans make the final call."*

---

## 1. Architecture & 8-Step Workflow
BrandGuard unifies deterministic rules, grounded AI claim verification, and a human-in-the-loop review pipeline:
1. **Step 1 (Workspace Admin):** Uploads versioned sources (`lib/guidelines.json`) with Fact Owners and Expiry Dates, and configures live custom terminology/claim rules.
2. **Step 2 (Creator):** Submits multi-format drafts (text, `.txt`/`.md`/`.pdf` intake, visual hex palette, and alt-text) and declares channel, `#Ad` paid promotion, and AI assistance.
3. **Step 3 (Layer A — Deterministic Rules Engine):** Instant regex, terminology (`TERM-001` to `TERM-003`), regulatory absolute claims (`CLAIM-101` to `CLAIM-103`), `#Ad`/AI label checks, and W3C WCAG 2.2 AA (`4.5:1` relative luminance contrast ratio + alt-text) verification.
4. **Step 4 (Layer B — Grounded AI Review):** Evaluates nuanced claims strictly against approved source excerpts (`SRC-2026-01`, `SRC-2025-04`, `SRC-2026-02`) using the 6-state claim taxonomy: *Supported*, *Unsupported in library*, *Conflicting evidence*, *Potentially stale*, *Out of scope*, and *Needs human judgement*.
5. **Step 5 (Creator Resolution):** Reviews deduplicated cards in the **Every Finding Explains Itself** panel and chooses **Accept**, **Edit**, **Dismiss with reason**, or **Escalate**.
6. **Step 6 (Brand Manager):** Reviews creator revisions, team comments, and written override justifications.
7. **Step 7 (Authorised Reviewer):** Signs off on escalated, high-severity, or regulated findings.
8. **Step 8 (System Clearance):** Clears content for publication and records an append-only audit trail.

---

## 2. Models, APIs & Libraries Disclosed
* **Frontend & Routing:** Next.js 16.4.6 (App Router, Turbopack), React 19, TypeScript
* **Styling & UI:** Tailwind CSS v4 (Custom BrandGuard theme)
* **AI SDK & Models:** `@google/genai` (Google Gen AI SDK — `gemini-2.0-flash` / `gemini-1.5-flash` with structured JSON schema output and resilient local grounded fallback)
* **Accessibility Math:** Custom W3C WCAG 2.2 relative luminance & contrast ratio calculator (`§1.4.3` & `§1.1.1`)
* **Deployment:** Vercel (Production CI/CD) & GitHub

---

## 3. Local Setup Instructions
```bash
npm install
# Add GEMINI_API_KEY=your_key in .env.local (runs with automatic grounded fallback if omitted)
npm run dev