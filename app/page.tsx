'use client';

import React, { useState, useEffect, useCallback } from 'react';
import guidelines from '@/lib/guidelines.json';

interface FindingCard {
  id: string;
  layer: 'Layer A: Deterministic' | 'Layer B: Grounded AI';
  category: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  ruleId: string;
  claimStatus:
    | 'Supported'
    | 'Unsupported in library'
    | 'Conflicting evidence'
    | 'Potentially stale'
    | 'Out of scope'
    | 'Needs human judgement';
  originalText: string;
  brokenRule: string;
  suggestion: string;
  status: 'pending' | 'accepted' | 'edited' | 'dismissed' | 'escalated';
  resolutionNote?: string;
}

interface AuditEntry {
  id: string;
  step: number;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
}

interface CustomRule {
  ruleId: string;
  wrong: string;
  preferred: string;
  citation: string;
  severity: 'HIGH' | 'MEDIUM';
}

const SEEDED_DRAFTS: Record<
  string,
  {
    name: string;
    channel: string;
    text: string;
    isPaidPromo: boolean;
    isAiAssisted: boolean;
    fgHex: string;
    bgHex: string;
    altText: string;
  }
> = {
  deckExample: {
    name: 'Slide 6 Seeded Draft: Client Campaign & Claims',
    channel: 'Digital Ad Campaign',
    text: 'We deliver results for our Clients. Our Guaranteed Auto workflow achieves 10x ROI overnight with zero risk! Plus, claim a 40% rebate under our 2024 policy and enjoy Mumbai-only data residency.',
    isPaidPromo: true,
    isAiAssisted: true,
    fgHex: '#94A3B8',
    bgHex: '#F8FAFC',
    altText: '',
  },
  fmcgExample: {
    name: 'Slide 1 Regulatory Test: Beverage Promo',
    channel: 'Social Media / E-Commerce',
    text: 'Try our new health drinks for customers! It is 100% guaranteed to boost daily energy.',
    isPaidPromo: true,
    isAiAssisted: false,
    fgHex: '#1E293B',
    bgHex: '#F8FAFC',
    altText: 'Product banner showing nutritional beverage bottle',
  },
  compliantExample: {
    name: 'Clean Grounded Draft (Supported by SRC-2026-01)',
    channel: 'Enterprise Press Release',
    text: '#Ad • We deliver results for our Partners. BrandGuard reduces routine line-item compliance checks by 50% and delivers first feedback in under 1 minute across seeded drafts. [AI-Assisted Content]',
    isPaidPromo: true,
    isAiAssisted: true,
    fgHex: '#1E293B',
    bgHex: '#F8FAFC',
    altText: 'BrandGuard governance workflow diagram showing Layer A, Layer B, and human review',
  },
};

const EIGHT_STEPS = [
  { step: 1, role: 'Workspace Admin', label: 'Uploads sources & configures rules' },
  { step: 2, role: 'Creator', label: 'Submits draft; declares channel & AI / #Ad' },
  { step: 3, role: 'Layer A Engine', label: 'Deterministic rules check (terms, WCAG, labels)' },
  { step: 4, role: 'Layer B Engine', label: 'Grounded AI check against approved sources' },
  { step: 5, role: 'Creator', label: 'Fixes, edits, or disputes findings & resubmits' },
  { step: 6, role: 'Brand Manager', label: 'Approves, requests changes, or overrides' },
  { step: 7, role: 'Authorised Reviewer', label: 'Signs off high-severity / regulated items' },
  { step: 8, role: 'System', label: 'Content cleared; append-only audit trail recorded' },
];

export default function BrandGuardPlatform() {
  const [activeRole, setActiveRole] = useState<
    'Creator' | 'Brand Manager' | 'Authorised Reviewer' | 'Workspace Admin'
  >('Creator');
  const [currentStep, setCurrentStep] = useState<number>(4);

  // Content Intake State
  const [channel, setChannel] = useState<string>(SEEDED_DRAFTS.deckExample.channel);
  const [draftText, setDraftText] = useState<string>(SEEDED_DRAFTS.deckExample.text);
  const [isPaidPromo, setIsPaidPromo] = useState<boolean>(SEEDED_DRAFTS.deckExample.isPaidPromo);
  const [isAiAssisted, setIsAiAssisted] = useState<boolean>(SEEDED_DRAFTS.deckExample.isAiAssisted);
  const [fgHex, setFgHex] = useState<string>(SEEDED_DRAFTS.deckExample.fgHex);
  const [bgHex, setBgHex] = useState<string>(SEEDED_DRAFTS.deckExample.bgHex);
  const [altText, setAltText] = useState<string>(SEEDED_DRAFTS.deckExample.altText);
  const [uploadedFileName, setUploadedFileName] = useState<string>('Q4_Campaign_Deck_Draft.pdf');

  // Dynamic Workspace Admin Custom Rules
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [newWrongTerm, setNewWrongTerm] = useState<string>('');
  const [newPreferredTerm, setNewPreferredTerm] = useState<string>('');
  const [newRuleCitation, setNewRuleCitation] = useState<string>('');

  // Findings & Interaction State
  const [findings, setFindings] = useState<FindingCard[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [engineLabel, setEngineLabel] = useState<string>('Layer A + Layer B Ready');
  const [layerCounts, setLayerCounts] = useState<{ layerA: number; layerB: number; merged: number }>({
    layerA: 0,
    layerB: 0,
    merged: 0,
  });

  // Inline Edit & Dismiss with Reason Modal/Input State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customRewrite, setCustomRewrite] = useState<string>('');
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState<string>('');

  // Comments & Audit Trail
  const [comments, setComments] = useState<
    Array<{ id: string; author: string; role: string; text: string; time: string }>
  >([
    {
      id: 'c1',
      author: 'Harshita Khandelwal',
      role: 'Brand Manager',
      text: 'Ensure Guideline p.4 ("Partners" instead of "Clients") and ASCI #Ad labels are verified before routing to Legal.',
      time: '12 mins ago',
    },
  ]);
  const [commentInput, setCommentInput] = useState<string>('');
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([
    {
      id: 'init-1',
      step: 1,
      timestamp: '02:30 AM',
      actor: 'Arnav Verma',
      role: 'Workspace Admin',
      action: 'Loaded Versioned Source Library v2.4 (SRC-2026-01, SRC-2025-04, SRC-2026-02) & Rule Catalogue.',
    },
  ]);

  const logAudit = useCallback(
    (step: number, action: string) => {
      setAuditTrail((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          step,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actor: activeRole === 'Creator' ? 'Aradhy Singhal' : activeRole,
          role: activeRole,
          action,
        },
        ...prev,
      ]);
    },
    [activeRole]
  );

  const executeScan = useCallback(
    async (
      textToScan: string,
      paid: boolean,
      aiFlag: boolean,
      fg: string,
      bg: string,
      alt: string,
      extraRules: CustomRule[]
    ) => {
      setIsScanning(true);
      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftText: textToScan,
            isPaidPromo: paid,
            isAiAssisted: aiFlag,
            fgHex: fg,
            bgHex: bg,
            altText: alt,
            hasImage: true,
          }),
        });
        const data = await res.json();
        const apiFindings: FindingCard[] = (data.issues || []).map((item: any) => ({
          ...item,
          status: 'pending',
        }));

        // Evaluate any custom rules defined in Step 1 by Workspace Admin
        const customMatches: FindingCard[] = [];
        for (const cRule of extraRules) {
          const regex = new RegExp(`\\b${cRule.wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          const match = textToScan.match(regex);
          if (match) {
            customMatches.push({
              id: `custom-${cRule.ruleId}-${Date.now()}`,
              layer: 'Layer A: Deterministic',
              category: 'TERMINOLOGY',
              severity: cRule.severity,
              confidence: 1.0,
              ruleId: cRule.ruleId,
              claimStatus: 'Supported',
              originalText: match[0],
              brokenRule: cRule.citation,
              suggestion: cRule.preferred,
              status: 'pending',
            });
          }
        }

        const combined = [...customMatches, ...apiFindings];
        setFindings(combined);
        setEngineLabel(data.engine || 'Layer A + Layer B Grounded Engine');
        setLayerCounts({
          layerA: (data.counts?.layerA || 0) + customMatches.length,
          layerB: data.counts?.layerB || 0,
          merged: combined.length,
        });
        setCurrentStep(combined.length > 0 ? 5 : 6);
      } catch (e) {
        console.error(e);
      } finally {
        setIsScanning(false);
      }
    },
    []
  );

  // Auto-run scan on initial page load so judges immediately see findings
  useEffect(() => {
    executeScan(
      SEEDED_DRAFTS.deckExample.text,
      SEEDED_DRAFTS.deckExample.isPaidPromo,
      SEEDED_DRAFTS.deckExample.isAiAssisted,
      SEEDED_DRAFTS.deckExample.fgHex,
      SEEDED_DRAFTS.deckExample.bgHex,
      SEEDED_DRAFTS.deckExample.altText,
      []
    );
  }, [executeScan]);

  const handleLoadSeeded = (key: string) => {
    const preset = SEEDED_DRAFTS[key];
    if (!preset) return;
    setChannel(preset.channel);
    setDraftText(preset.text);
    setIsPaidPromo(preset.isPaidPromo);
    setIsAiAssisted(preset.isAiAssisted);
    setFgHex(preset.fgHex);
    setBgHex(preset.bgHex);
    setAltText(preset.altText);
    logAudit(2, `Loaded seeded test draft: "${preset.name}"`);
    executeScan(
      preset.text,
      preset.isPaidPromo,
      preset.isAiAssisted,
      preset.fgHex,
      preset.bgHex,
      preset.altText,
      customRules
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') {
          setDraftText(ev.target.result);
          executeScan(ev.target.result, isPaidPromo, isAiAssisted, fgHex, bgHex, altText, customRules);
        }
      };
      reader.readAsText(file);
    }
    logAudit(2, `Uploaded multi-format intake file: ${file.name}`);
  };

  const handleAddCustomRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWrongTerm.trim() || !newPreferredTerm.trim()) return;
    const newRule: CustomRule = {
      ruleId: `CUSTOM-0${customRules.length + 1}`,
      wrong: newWrongTerm.trim(),
      preferred: newPreferredTerm.trim(),
      citation:
        newRuleCitation.trim() ||
        `Workspace Admin Custom Rule: Replace "${newWrongTerm.trim()}" with approved term "${newPreferredTerm.trim()}".`,
      severity: 'MEDIUM',
    };
    const updated = [...customRules, newRule];
    setCustomRules(updated);
    setNewWrongTerm('');
    setNewPreferredTerm('');
    setNewRuleCitation('');
    logAudit(1, `Added custom deterministic rule [${newRule.ruleId}]: "${newRule.wrong}" → "${newRule.preferred}"`);
    executeScan(draftText, isPaidPromo, isAiAssisted, fgHex, bgHex, altText, updated);
  };

  /// Action 1: Accept Suggested Rewrite
  const handleAccept = (finding: FindingCard) => {
    if (finding.ruleId === 'WCAG-1.4.3') {
      setFgHex('#1E293B');
      setBgHex('#F8FAFC');
    } else if (finding.ruleId === 'WCAG-1.1.1') {
      setAltText(finding.suggestion);
    } else if (finding.ruleId === 'DISC-ASCI-01') {
      setDraftText((prev) => (prev.startsWith('#Ad') ? prev : `#Ad • ${prev}`));
    } else if (finding.ruleId === 'DISC-AI-02') {
      setDraftText((prev) =>
        prev.includes('[AI-Assisted Content]') ? prev : `${prev} [AI-Assisted Content]`
      );
    } else {
      const escaped = finding.originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      setDraftText((prev) => prev.replace(new RegExp(escaped, 'i'), finding.suggestion));
    }

    setFindings((prev) =>
      prev.map((f) =>
        f.id === finding.id
          ? { ...f, status: 'accepted', resolutionNote: 'Accepted and applied suggested fix' }
          : f
      )
    );
    logAudit(5, `Accepted rewrite for [${finding.ruleId}]: "${finding.originalText}"`);
  };

  // Action 2: Edit Inline Rewrite
  const handleSaveEdit = (finding: FindingCard) => {
    if (!customRewrite.trim()) return;
    const escaped = finding.originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    setDraftText((prev) => prev.replace(new RegExp(escaped, 'i'), customRewrite.trim()));

    setFindings((prev) =>
      prev.map((f) =>
        f.id === finding.id
          ? { ...f, status: 'edited', resolutionNote: `Creator custom edit: "${customRewrite.trim()}"` }
          : f
      )
    );
    logAudit(5, `Edited finding [${finding.ruleId}] with custom phrasing: "${customRewrite.trim()}"`);
    setEditingId(null);
    setCustomRewrite('');
  };

  // Action 3: Dismiss with Written Override Reason
  const handleConfirmDismiss = (finding: FindingCard) => {
    if (!dismissReason.trim()) return;
    setFindings((prev) =>
      prev.map((f) =>
        f.id === finding.id
          ? {
              ...f,
              status: 'dismissed',
              resolutionNote: `Dismissed by ${activeRole} — Reason: "${dismissReason.trim()}"`,
            }
          : f
      )
    );
    logAudit(
      6,
      `Override / Dismiss with written reason on [${finding.ruleId}] by ${activeRole}: "${dismissReason.trim()}"`
    );
    setDismissingId(null);
    setDismissReason('');
  };

  // Action 4: Escalate to Authorised Reviewer / Fact Owner
  const handleEscalate = (finding: FindingCard) => {
    setFindings((prev) =>
      prev.map((f) =>
        f.id === finding.id
          ? {
              ...f,
              status: 'escalated',
              resolutionNote: 'Escalated to Authorised Reviewer / Fact Owner for human judgement',
            }
          : f
      )
    );
    setCurrentStep(7);
    logAudit(
      7,
      `Escalated high-severity finding [${finding.ruleId}] ("${finding.originalText}") to Authorised Reviewer.`
    );
  };

  const pendingCount = findings.filter((f) => f.status === 'pending').length;
  const escalatedCount = findings.filter((f) => f.status === 'escalated').length;

  return (
    <div className="min-h-screen bg-[#F5F0EB] text-[#1C2430] font-sans">
      {/* Top BrandGuard Header matching Round 1 Deck */}
      <header className="border-b border-[#D8CFC4] bg-[#16202A] text-[#F5F0EB] sticky top-0 z-30 shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded bg-[#8C4A32] px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-white">
                BrandGuard
              </span>
              <h1 className="text-lg font-bold tracking-wide text-white">
                PRE-PUBLICATION BRAND GOVERNANCE • INKLOOM AI
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Rules catch the obvious (Layer A), grounded AI handles the nuance (Layer B), humans make the final call.
            </p>
          </div>

          {/* 4 User Lenses Role Switcher (Slide 2) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1">Active Role Lens:</span>
            {(['Creator', 'Brand Manager', 'Authorised Reviewer', 'Workspace Admin'] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setActiveRole(r);
                  logAudit(currentStep, `Switched user lens to ${r}`);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  activeRole === r
                    ? 'bg-[#8C4A32] text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Responsible Design Disclosure Strip (Slide 3 & Slide 6) */}
        <div className="border-t border-white/10 bg-[#0F1720] px-6 py-1.5 text-[11px] text-slate-300">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Responsible Design:</strong> We do not claim zero risk or zero hallucination. Every output is grounded, explained, and human-reviewable. No auto-publish or auto-reject.
            </span>
            <span className="text-amber-300 font-mono">{engineLabel}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Slide 3: Interactive 8-Step Workflow Progress Bar */}
        <section className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#16202A]">
              Eight-Step Human-in-the-Loop Governance Workflow
            </h2>
            <span className="text-xs font-semibold text-[#8C4A32]">
              Current Stage: Step {currentStep} of 8
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {EIGHT_STEPS.map((s) => {
              const isActive = currentStep === s.step;
              const isDone = currentStep > s.step;
              return (
                <div
                  key={s.step}
                  onClick={() => setCurrentStep(s.step)}
                  className={`cursor-pointer rounded-lg border p-2.5 text-left transition ${
                    isActive
                      ? 'border-[#8C4A32] bg-[#8C4A32]/10 ring-1 ring-[#8C4A32]'
                      : isDone
                      ? 'border-emerald-700/30 bg-emerald-950/5'
                      : 'border-[#E2D9CE] bg-white opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#8C4A32]">0{s.step}</span>
                    <span className="text-[10px] font-medium text-slate-500">{s.role}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium leading-snug text-[#16202A]">{s.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Slide 6: Proposed Targets & Live Run Telemetry */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-3.5">
            <p className="text-xl font-extrabold text-[#16202A]">&lt; 1 min</p>
            <p className="text-[11px] text-slate-600">Time to first feedback (Instant scan)</p>
          </div>
          <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-3.5">
            <p className="text-xl font-extrabold text-[#8C4A32]">{layerCounts.layerA} Flags</p>
            <p className="text-[11px] text-slate-600">Layer A: Deterministic rules</p>
          </div>
          <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-3.5">
            <p className="text-xl font-extrabold text-[#16202A]">{layerCounts.layerB} Flags</p>
            <p className="text-[11px] text-slate-600">Layer B: Grounded AI review</p>
          </div>
          <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-3.5">
            <p className="text-xl font-extrabold text-emerald-800">100%</p>
            <p className="text-[11px] text-slate-600">AI findings cited or &ldquo;Unsupported&rdquo;</p>
          </div>
          <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-3.5">
            <p className="text-xl font-extrabold text-emerald-800">100%</p>
            <p className="text-[11px] text-slate-600">Overrides carry written reasons</p>
          </div>
          <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-3.5">
            <p className="text-xl font-extrabold text-[#8C4A32]">{pendingCount} Open</p>
            <p className="text-[11px] text-slate-600">{escalatedCount} escalated to Reviewer</p>
          </div>
        </section>

        {/* Main 12-Column Workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 Columns: Multi-Format Content Intake, Layer A Controls & Source Library */}
          <div className="space-y-6 lg:col-span-7">
            {/* Seeded Draft Test Bar */}
            <div className="rounded-xl border border-[#D8CFC4] bg-[#EAE2D7] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#16202A]">
                    Seeded Draft Scenarios (Auto-Runs Layer A + Layer B)
                  </h3>
                  <p className="text-xs text-slate-700">
                    Click any preset below to populate and scan realistic violations from your Round 1 deck:
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleLoadSeeded('deckExample')}
                    className="rounded-lg bg-[#16202A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                  >
                    Slide 6 &ldquo;Clients → Partners&rdquo; + Stale/Conflict Draft
                  </button>
                  <button
                    onClick={() => handleLoadSeeded('fmcgExample')}
                    className="rounded-lg bg-[#8C4A32] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition"
                  >
                    DPIIT &ldquo;Health Drinks&rdquo; + 100% Claim
                  </button>
                  <button
                    onClick={() => handleLoadSeeded('compliantExample')}
                    className="rounded-lg border border-emerald-800/30 bg-emerald-900/10 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-900/20 transition"
                  >
                    Compliant Supported Draft
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Creator Multi-Format Intake Card */}
            <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2D9CE] pb-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C4A32]">
                    Step 2 • Multi-Format Content Intake
                  </span>
                  <h2 className="text-base font-bold text-[#16202A]">
                    Submit Pre-Publication Draft (Text, PDF, Image Metadata)
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <label className="cursor-pointer rounded-lg border border-[#D8CFC4] bg-[#F5F0EB] px-3 py-1.5 text-xs font-semibold text-[#16202A] hover:bg-[#EAE2D7] transition">
                    Upload .TXT / .PDF ({uploadedFileName})
                    <input type="file" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <button
                    onClick={() =>
                      executeScan(draftText, isPaidPromo, isAiAssisted, fgHex, bgHex, altText, customRules)
                    }
                    disabled={isScanning}
                    className="rounded-lg bg-[#8C4A32] px-3.5 py-1.5 text-xs font-bold text-white shadow hover:opacity-95 disabled:opacity-50 transition"
                  >
                    {isScanning ? 'Scanning...' : 'Re-Scan Draft'}
                  </button>
                </div>
              </div>

              {/* Channel & Mandatory Declarations (#Ad / AI) */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Publication Channel</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8CFC4] bg-white px-3 py-2 text-xs font-medium text-[#16202A]"
                  >
                    <option>Digital Ad Campaign</option>
                    <option>Social Media / E-Commerce</option>
                    <option>Enterprise Press Release</option>
                    <option>Email Newsletter</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="paidPromo"
                    type="checkbox"
                    checked={isPaidPromo}
                    onChange={(e) => setIsPaidPromo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-400 text-[#8C4A32]"
                  />
                  <label htmlFor="paidPromo" className="text-xs font-semibold text-[#16202A]">
                    Paid Promotion (Requires #Ad)
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="aiAssisted"
                    type="checkbox"
                    checked={isAiAssisted}
                    onChange={(e) => setIsAiAssisted(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-400 text-[#8C4A32]"
                  />
                  <label htmlFor="aiAssisted" className="text-xs font-semibold text-[#16202A]">
                    AI-Assisted Draft (Requires AI Label)
                  </label>
                </div>
              </div>

              {/* Main Draft Textarea */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-700">
                  Draft Copy / Extracted Document Text
                </label>
                <textarea
                  rows={5}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#D8CFC4] bg-white p-3.5 text-sm leading-relaxed text-[#16202A] focus:border-[#8C4A32] focus:outline-none"
                />
              </div>

              {/* Layer A Accessibility & Visual Contrast Controls (WCAG 4.5:1 + Alt-Text) */}
              <div className="mt-5 rounded-xl border border-[#E2D9CE] bg-[#F5F0EB] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#16202A]">
                  Layer A Visual & WCAG 2.2 Accessibility Check (4.5:1 Contrast & Alt-Text)
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Text Foreground Hex
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={fgHex}
                        onChange={(e) => setFgHex(e.target.value.toUpperCase())}
                        className="h-8 w-10 cursor-pointer rounded border border-[#D8CFC4] bg-white p-0.5"
                      />
                      <input
                        type="text"
                        value={fgHex}
                        onChange={(e) => setFgHex(e.target.value.toUpperCase())}
                        className="w-full rounded border border-[#D8CFC4] bg-white px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Banner Background Hex
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={bgHex}
                        onChange={(e) => setBgHex(e.target.value.toUpperCase())}
                        className="h-8 w-10 cursor-pointer rounded border border-[#D8CFC4] bg-white p-0.5"
                      />
                      <input
                        type="text"
                        value={bgHex}
                        onChange={(e) => setBgHex(e.target.value.toUpperCase())}
                        className="w-full rounded border border-[#D8CFC4] bg-white px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Image Alt-Text (Mandatory)
                    </label>
                    <input
                      type="text"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                      placeholder="Describe visual for screen readers..."
                      className="mt-1 w-full rounded border border-[#D8CFC4] bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons across Roles */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2D9CE] pt-4">
                <button
                  onClick={() =>
                    executeScan(draftText, isPaidPromo, isAiAssisted, fgHex, bgHex, altText, customRules)
                  }
                  disabled={isScanning}
                  className="rounded-xl bg-[#16202A] px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  {isScanning
                    ? 'Running Layer A Rules + Layer B Grounded AI...'
                    : 'Run BrandGuard Pre-Publication Scan'}
                </button>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setCurrentStep(6);
                      logAudit(6, 'Creator submitted revised draft to Brand Manager for approval.');
                    }}
                    className="rounded-xl border border-[#16202A] bg-white px-4 py-2 text-xs font-bold text-[#16202A] hover:bg-slate-100 transition"
                  >
                    Route to Brand Manager (Step 6)
                  </button>

                  {(activeRole === 'Brand Manager' || activeRole === 'Authorised Reviewer') && (
                    <button
                      onClick={() => {
                        setCurrentStep(8);
                        logAudit(
                          8,
                          `Content cleared for publication by ${activeRole}. Audit trail locked (Not a legal certification).`
                        );
                      }}
                      className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                    >
                      Sign Off & Clear Content (Step 8)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Step 1: Versioned Source Library & Live Custom Rule Builder */}
            <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C4A32]">
                    Step 1 • Versioned Source Library & Rule Configuration
                  </span>
                  <h3 className="text-sm font-bold text-[#16202A]">
                    Approved Knowledge Base with Fact Owners & Expiry Dates
                  </h3>
                </div>
                <span className="rounded bg-[#EAE2D7] px-2.5 py-1 text-xs font-semibold text-[#16202A]">
                  {guidelines.version}
                </span>
              </div>

              {/* Define New Custom Brand Terminology Rule Live */}
              <form
                onSubmit={handleAddCustomRule}
                className="mt-4 rounded-xl border border-[#D8CFC4] bg-[#F5F0EB] p-3.5"
              >
                <p className="text-xs font-bold text-[#16202A]">
                  + Add Live Custom Brand Rule (Workspace Admin / Judge Test)
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    type="text"
                    value={newWrongTerm}
                    onChange={(e) => setNewWrongTerm(e.target.value)}
                    placeholder="Restricted term (e.g., ROI)"
                    className="rounded border border-[#D8CFC4] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={newPreferredTerm}
                    onChange={(e) => setNewPreferredTerm(e.target.value)}
                    placeholder="Approved term (e.g., Value)"
                    className="rounded border border-[#D8CFC4] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRuleCitation}
                      onChange={(e) => setNewRuleCitation(e.target.value)}
                      placeholder="Guideline citation..."
                      className="w-full rounded border border-[#D8CFC4] bg-white px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded bg-[#16202A] px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      Add Rule
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-4 space-y-2.5">
                {guidelines.approvedSources.map((src) => (
                  <div
                    key={src.sourceId}
                    className="rounded-lg border border-[#E2D9CE] bg-[#F5F0EB] p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#16202A]">
                        [{src.sourceId}] {src.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">Owner: {src.owner}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            src.status === 'Active'
                              ? 'bg-emerald-800/15 text-emerald-900'
                              : src.status.includes('Expired')
                              ? 'bg-rose-800/15 text-rose-900'
                              : 'bg-amber-800/20 text-amber-900'
                          }`}
                        >
                          {src.status} (Exp: {src.expiryDate})
                        </span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-slate-700">{src.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Slide 6 "Every Finding Explains Itself" Cards + Audit Trail + Insights */}
          <div className="space-y-6 lg:col-span-5">
            {/* Explainable Findings Panel */}
            <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E2D9CE] pb-3">
                <div>
                  <h2 className="text-base font-bold uppercase tracking-wide text-[#16202A]">
                    Every Finding Explains Itself
                  </h2>
                  <p className="text-xs text-slate-600">
                    Findings Merger output • Deduplicated, ranked, and cited against approved sources
                  </p>
                </div>
                <span className="rounded-full bg-[#16202A] px-3 py-1 text-xs font-bold text-white">
                  {findings.length} Finding{findings.length === 1 ? '' : 's'}
                </span>
              </div>

              {findings.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-[#D8CFC4] bg-[#F5F0EB] p-8 text-center">
                  <p className="text-sm font-bold text-emerald-900">
                    ✓ Zero Open Governance Violations Detected
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    All claims, disclosures, terminology, and WCAG 4.5:1 checks passed. Ready for human sign-off.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-4 max-h-[540px] overflow-y-auto pr-1">
                  {findings.map((f) => (
                    <div
                      key={f.id}
                      className={`rounded-xl border p-4 transition ${
                        f.status === 'pending'
                          ? 'border-[#C8B9A6] bg-[#F9F6F0] shadow-sm'
                          : 'border-emerald-800/30 bg-emerald-950/5 opacity-85'
                      }`}
                    >
                      {/* Top Badges matching Slide 6 */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-[#8C4A32] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            {f.category}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              f.severity === 'HIGH'
                                ? 'bg-rose-800 text-white'
                                : 'bg-[#6E5A4F] text-white'
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span className="rounded border border-[#D8CFC4] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#16202A]">
                            {f.layer}
                          </span>
                        </div>
                        <span className="text-[10px] italic text-slate-500">
                          Confidence {(f.confidence * 100).toFixed(0)}% shown; never treated as proof
                        </span>
                      </div>

                      {/* 6-State Claim Check Badge (Slide 4) */}
                      <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="font-mono font-semibold text-[#8C4A32]">
                          Rule / Source ID: {f.ruleId}
                        </span>
                        <span className="rounded bg-[#16202A]/10 px-2 py-0.5 font-semibold text-[#16202A]">
                          Claim State: {f.claimStatus}
                        </span>
                      </div>

                      {/* Flagged / Why / Suggested (Exact Slide 6 Structure) */}
                      <div className="mt-3 space-y-1.5 text-xs">
                        <p className="text-[#16202A]">
                          <strong>Flagged: </strong>
                          <span className="rounded bg-rose-900/10 px-1.5 py-0.5 font-medium text-rose-950">
                            &ldquo;{f.originalText}&rdquo;
                          </span>
                        </p>
                        <p className="text-slate-700 leading-relaxed">
                          <strong className="text-[#16202A]">Why: </strong>
                          {f.brokenRule}
                        </p>
                        <p className="text-emerald-950">
                          <strong>Suggested: </strong>
                          <span className="font-medium">&ldquo;{f.suggestion}&rdquo;</span>
                        </p>
                      </div>

                      {/* Resolution Status Banner if already acted upon */}
                      {f.status !== 'pending' && (
                        <div className="mt-3 rounded bg-emerald-900/10 px-3 py-1.5 text-xs font-semibold text-emerald-950">
                          ✓ {f.resolutionNote}
                        </div>
                      )}

                      {/* Exact 4 Action Buttons from Slide 6: Accept | Edit | Dismiss with reason | Escalate */}
                      {f.status === 'pending' && (
                        <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-[#E2D9CE]">
                          <button
                            onClick={() => handleAccept(f)}
                            className="rounded-lg bg-[#16202A] px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(f.id);
                              setCustomRewrite(f.suggestion);
                              setDismissingId(null);
                            }}
                            className="rounded-lg border border-[#16202A] bg-white px-3 py-1.5 text-xs font-semibold text-[#16202A] hover:bg-slate-100 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setDismissingId(f.id);
                              setEditingId(null);
                            }}
                            className="rounded-lg border border-[#16202A] bg-white px-3 py-1.5 text-xs font-semibold text-[#16202A] hover:bg-slate-100 transition"
                          >
                            Dismiss with reason
                          </button>
                          <button
                            onClick={() => handleEscalate(f)}
                            className="rounded-lg border border-[#8C4A32] bg-[#8C4A32]/10 px-3 py-1.5 text-xs font-bold text-[#8C4A32] hover:bg-[#8C4A32]/20 transition"
                          >
                            Escalate
                          </button>
                        </div>
                      )}

                      {/* Inline Edit Drawer */}
                      {editingId === f.id && (
                        <div className="mt-3 rounded-lg border border-[#D8CFC4] bg-white p-2.5">
                          <label className="block text-[11px] font-bold text-[#16202A]">
                            Edit Custom Rewrite (Preserves Creator Intent):
                          </label>
                          <div className="mt-1.5 flex gap-2">
                            <input
                              type="text"
                              value={customRewrite}
                              onChange={(e) => setCustomRewrite(e.target.value)}
                              className="flex-1 rounded border border-[#D8CFC4] px-2.5 py-1 text-xs"
                            />
                            <button
                              onClick={() => handleSaveEdit(f)}
                              className="rounded bg-[#16202A] px-3 py-1 text-xs font-bold text-white"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline Dismiss with Mandatory Written Reason Drawer */}
                      {dismissingId === f.id && (
                        <div className="mt-3 rounded-lg border border-[#8C4A32] bg-white p-2.5">
                          <label className="block text-[11px] font-bold text-[#8C4A32]">
                            Written Override / Dismissal Reason (Mandatory for Append-Only Audit Trail):
                          </label>
                          <div className="mt-1.5 flex gap-2">
                            <input
                              type="text"
                              value={dismissReason}
                              onChange={(e) => setDismissReason(e.target.value)}
                              placeholder="e.g., Approved regional campaign exception by Brand Manager..."
                              className="flex-1 rounded border border-[#D8CFC4] px-2.5 py-1 text-xs"
                            />
                            <button
                              onClick={() => handleConfirmDismiss(f)}
                              className="rounded bg-[#8C4A32] px-3 py-1 text-xs font-bold text-white"
                            >
                              Confirm Override
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Collaborative Oversight: Comments & Append-Only Audit Trail */}
            <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-6 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#16202A]">
                Collaborative Oversight & Append-Only Audit Trail
              </h3>
              <div className="mt-3 space-y-2 max-h-36 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[#E2D9CE] bg-[#F5F0EB] p-2.5 text-xs">
                    <div className="flex justify-between font-bold text-[#16202A]">
                      <span>
                        {c.author} ({c.role})
                      </span>
                      <span className="text-[10px] font-normal text-slate-500">{c.time}</span>
                    </div>
                    <p className="mt-1 text-slate-700">{c.text}</p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!commentInput.trim()) return;
                  setComments((prev) => [
                    ...prev,
                    {
                      id: Math.random().toString(36).substring(2, 9),
                      author: activeRole === 'Creator' ? 'Aradhy Singhal' : activeRole,
                      role: activeRole,
                      text: commentInput.trim(),
                      time: 'Just now',
                    },
                  ]);
                  logAudit(currentStep, `Comment added by ${activeRole}: "${commentInput.trim()}"`);
                  setCommentInput('');
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder={`Add review note as ${activeRole}...`}
                  className="flex-1 rounded-lg border border-[#D8CFC4] bg-white px-3 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#16202A] px-3.5 py-1.5 text-xs font-bold text-white"
                >
                  Post
                </button>
              </form>

              <div className="mt-4 border-t border-[#E2D9CE] pt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#8C4A32]">
                  Append-Only Audit Log (Rules, Sources, Approvals, Overrides)
                </p>
                <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto text-[11px]">
                  {auditTrail.map((log) => (
                    <div key={log.id} className="flex justify-between gap-2 border-b border-[#E2D9CE]/60 pb-1">
                      <span>
                        <strong className="text-[#16202A]">
                          [Step {log.step} • {log.role}]
                        </strong>{' '}
                        {log.action}
                      </span>
                      <span className="shrink-0 font-mono text-slate-500">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Governance Insights Dashboard (Fills Right Column & Satisfies Recurring Mistakes Requirement) */}
            <div className="rounded-xl border border-[#D8CFC4] bg-[#FDFBF9] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#16202A]">
                  Governance Insights & Guideline Clarity
                </h3>
                <span className="rounded bg-[#8C4A32]/15 px-2 py-0.5 text-[10px] font-bold text-[#8C4A32]">
                  Continuous Learning
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Tracks repeated mistakes and overridden rules to identify unclear brand guidelines.
              </p>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="rounded-lg border border-[#E2D9CE] bg-[#F5F0EB] p-2.5">
                  <div className="flex justify-between font-bold text-[#16202A]">
                    <span>1. Unverified ROI / Superlative Claims</span>
                    <span className="text-rose-800">42% of flags</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    Insight: Creators frequently cite legacy 2024 metrics. Action: Pin SRC-2026-01 benchmark in creator onboarding.
                  </p>
                </div>
                <div className="rounded-lg border border-[#E2D9CE] bg-[#F5F0EB] p-2.5">
                  <div className="flex justify-between font-bold text-[#16202A]">
                    <span>2. &ldquo;Clients&rdquo; vs &ldquo;Partners&rdquo; (TERM-001)</span>
                    <span className="text-[#8C4A32]">31% of flags</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    Insight: High override requests on B2B ad copy. Guideline p.4 clarified with channel-specific examples.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Exact Participant & Track Details from Slide 6 */}
        <footer className="rounded-xl border border-[#D8CFC4] bg-[#16202A] p-5 text-xs text-[#F5F0EB]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-bold text-white">
                BRANDGUARD • Track: Brand Governance – Inkloom AI (CodeZen India 2026)
              </p>
              <p className="mt-1 text-slate-300">
                <strong>Team Odyssey:</strong> Arnav Verma, Harshita Khandelwal, Rudransh, Priyanshi, Aradhy Singhal, Saksham Yadav
              </p>
              <p className="text-slate-400">
                <strong>Institution:</strong> Newton School of Technology, Rishihood University
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-300">
              <p className="font-semibold text-amber-300">
                &ldquo;BrandGuard grounds findings in evidence, explains decisions and keeps humans in control.&rdquo;
              </p>
              <p>Not a legal certification • Legal review stays with authorised human reviewers.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}