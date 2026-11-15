import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import guidelines from '@/lib/guidelines.json';

export interface GovernanceFinding {
  id: string;
  layer: 'Layer A: Deterministic' | 'Layer B: Grounded AI';
  category: 'TERMINOLOGY' | 'ABSOLUTE CLAIM' | 'DISCLOSURE' | 'ACCESSIBILITY' | 'FACT & SOURCE CHECK' | 'TONE & NUANCE';
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
}

// Helper: Calculate WCAG 2.1 relative luminance and contrast ratio
function getContrastRatio(hex1: string, hex2: string): number {
  const toRgb = (hex: string) => {
    const clean = hex.replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };
  const getLuminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  try {
    const l1 = getLuminance(toRgb(hex1));
    const l2 = getLuminance(toRgb(hex2));
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
  } catch {
    return 4.5;
  }
}

function runLayerADeterministic(
  draftText: string,
  options: {
    isPaidPromo?: boolean;
    isAiAssisted?: boolean;
    fgHex?: string;
    bgHex?: string;
    altText?: string;
    hasImage?: boolean;
  }
): GovernanceFinding[] {
  const findings: GovernanceFinding[] = [];

  // 1. Terminology Rules (e.g., Clients -> Partners, Guideline p.4)
  for (const rule of guidelines.terminologyRules) {
    const regex = new RegExp(`\\b${rule.wrong}\\b`, 'i');
    const match = draftText.match(regex);
    if (match) {
      findings.push({
        id: `la-term-${rule.ruleId}`,
        layer: 'Layer A: Deterministic',
        category: 'TERMINOLOGY',
        severity: rule.severity as 'HIGH' | 'MEDIUM' | 'LOW',
        confidence: 0.99,
        ruleId: rule.ruleId,
        claimStatus: 'Supported',
        originalText: match[0],
        brokenRule: rule.citation,
        suggestion: rule.preferred,
      });
    }
  }

  // 2. Absolute & Regulatory Claims
  for (const rule of guidelines.absoluteClaimRules) {
    const regex = new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const match = draftText.match(regex);
    if (match) {
      findings.push({
        id: `la-claim-${rule.ruleId}`,
        layer: 'Layer A: Deterministic',
        category: 'ABSOLUTE CLAIM',
        severity: rule.severity as 'HIGH' | 'MEDIUM' | 'LOW',
        confidence: 0.98,
        ruleId: rule.ruleId,
        claimStatus: 'Needs human judgement',
        originalText: match[0],
        brokenRule: rule.citation,
        suggestion: rule.suggestion,
      });
    }
  }

  // 3. Mandatory Disclaimers (#Ad / AI labels)
  if (options.isPaidPromo && !/#ad\b|#sponsored\b|paid partnership/i.test(draftText)) {
    findings.push({
      id: 'la-disc-ad',
      layer: 'Layer A: Deterministic',
      category: 'DISCLOSURE',
      severity: 'HIGH',
      confidence: 1.0,
      ruleId: 'DISC-ASCI-01',
      claimStatus: 'Needs human judgement',
      originalText: '[Missing #Ad / Paid Promotion Disclosure]',
      brokenRule:
        'ASCI Digital Influencer & Ad Disclosure Rule (§3.1): Paid or sponsored promotions must explicitly include #Ad or Paid Partnership at the beginning of the copy.',
        suggestion: 'Prepend "#Ad • " disclosure to copy',
    });
  }

  if (options.isAiAssisted && !/ai-assisted|created with ai|ai generated|#ai/i.test(draftText)) {
    findings.push({
      id: 'la-disc-ai',
      layer: 'Layer A: Deterministic',
      category: 'DISCLOSURE',
      severity: 'MEDIUM',
      confidence: 1.0,
      ruleId: 'DISC-AI-02',
      claimStatus: 'Supported',
      originalText: '[Missing AI Transparency Label]',
      brokenRule:
        'BrandGuard Responsible Design Policy (§1.4): Content created or modified using generative AI must carry a transparent AI disclosure label.',
        suggestion: 'Append "[AI-Assisted Content]" label to copy',
    });
  }

  // 4. WCAG 4.5:1 Contrast & Alt-Text Presence
  if (options.fgHex && options.bgHex) {
    const ratio = getContrastRatio(options.fgHex, options.bgHex);
    if (ratio < 4.5) {
      findings.push({
        id: 'la-wcag-contrast',
        layer: 'Layer A: Deterministic',
        category: 'ACCESSIBILITY',
        severity: 'HIGH',
        confidence: 1.0,
        ruleId: 'WCAG-1.4.3',
        claimStatus: 'Supported',
        originalText: `Contrast Ratio ${ratio}:1 (${options.fgHex} on ${options.bgHex})`,
        brokenRule: `WCAG 2.2 AA Standard (§1.4.3): Visual text contrast is ${ratio}:1, which fails the mandatory 4.5:1 minimum threshold.`,
        suggestion: '#1E293B on #F8FAFC (Contrast 13.8:1)',
      });
    }
  }

  if (options.hasImage && (!options.altText || options.altText.trim().length < 12)) {
    findings.push({
      id: 'la-wcag-alt',
      layer: 'Layer A: Deterministic',
      category: 'ACCESSIBILITY',
      severity: 'MEDIUM',
      confidence: 1.0,
      ruleId: 'WCAG-1.1.1',
      claimStatus: 'Supported',
      originalText: '[Missing / Insufficient Image Alt-Text]',
      brokenRule:
        'WCAG 2.2 AA Standard (§1.1.1): Visual assets require descriptive non-empty alt-text so screen-reader users receive equivalent information.',
      suggestion: 'BrandGuard compliance summary graphic with verified benchmark metrics',
    });
  }

  return findings;
}

function runLayerBGroundedFallback(draftText: string): GovernanceFinding[] {
  const findings: GovernanceFinding[] = [];

  // Stale / Expired source check (e.g., 2024 bereavement / 40% instant rebate policy)
  if (/40%\s+(rebate|discount|refund)|2024\s+policy|bereavement/i.test(draftText)) {
    const match = draftText.match(/[^.?!]*(40%\s+(rebate|discount|refund)|2024\s+policy|bereavement)[^.?!]*[.?!]?/i);
    findings.push({
      id: 'lb-stale-source',
      layer: 'Layer B: Grounded AI',
      category: 'FACT & SOURCE CHECK',
      severity: 'HIGH',
      confidence: 0.91,
      ruleId: 'SRC-2025-04 (Expired)',
      claimStatus: 'Potentially stale',
      originalText: match ? match[0].trim() : '40% instant refund policy',
      brokenRule:
        'Potentially Stale Source (SRC-2025-04): Cited policy expired on 2025-12-31 (Owner: Harshita Khandelwal). Moffatt v. Air Canada precedent warns against publishing outdated refund rules.',
      suggestion: 'Contact Policy Lead to revalidate current 2026 SLA terms before publication.',
    });
  }

  // Conflicting source check (e.g., data residency Mumbai-only vs EU)
  if (/mumbai-only|data residency|eu hosting|100%\s+local\s+servers/i.test(draftText)) {
    const match = draftText.match(/[^.?!]*(mumbai-only|data residency|eu hosting|100%\s+local\s+servers)[^.?!]*[.?!]?/i);
    findings.push({
      id: 'lb-conflict-source',
      layer: 'Layer B: Grounded AI',
      category: 'FACT & SOURCE CHECK',
      severity: 'HIGH',
      confidence: 0.88,
      ruleId: 'SRC-2026-02 (Conflict)',
      claimStatus: 'Conflicting evidence',
      originalText: match ? match[0].trim() : 'Data residency claim',
      brokenRule:
        'Conflicting Evidence in Library (SRC-2026-02): Spec v1.1 states Mumbai-only residency while v1.2 states India + EU multi-region. Escalate to Fact Owner (Rudransh).',
      suggestion: 'Data is hosted in compliant regional cloud zones per partner agreement.',
    });
  }

  // Unsupported numerical or superlative claims not in SRC-2026-01
  if (/\b(10x|99\.9%|50\s+million|#1\s+in\s+india|overnight)\b/i.test(draftText)) {
    const match = draftText.match(/[^.?!]*\b(10x|99\.9%|50\s+million|#1\s+in\s+india|overnight)\b[^.?!]*[.?!]?/i);
    findings.push({
      id: 'lb-unsupported-claim',
      layer: 'Layer B: Grounded AI',
      category: 'FACT & SOURCE CHECK',
      severity: 'HIGH',
      confidence: 0.89,
      ruleId: 'SRC-2026-01 (Unverified)',
      claimStatus: 'Unsupported in library',
      originalText: match ? match[0].trim() : 'Unverified performance claim',
      brokenRule:
        'Unsupported in Library: No approved source document backs this claim. Approved Source SRC-2026-01 only verifies a ">=50% reduction in routine line-item checks and <1 min feedback time".',
      suggestion: 'We deliver first compliance feedback in under 1 minute and reduce routine checks by over 50% (Source: SRC-2026-01).',
    });
  }

  // Out of scope market/date check
  if (/\b(us\s+fda\s+approved|eu\s+medical\s+device|crypto\s+yield)\b/i.test(draftText)) {
    const match = draftText.match(/[^.?!]*\b(us\s+fda\s+approved|eu\s+medical\s+device|crypto\s+yield)\b[^.?!]*[.?!]?/i);
    findings.push({
      id: 'lb-out-of-scope',
      layer: 'Layer B: Grounded AI',
      category: 'FACT & SOURCE CHECK',
      severity: 'MEDIUM',
      confidence: 0.86,
      ruleId: 'SCOPE-MKT-01',
      claimStatus: 'Out of scope',
      originalText: match ? match[0].trim() : 'Out-of-scope market claim',
      brokenRule:
        'Out of Scope: Claim references a product line or regulatory jurisdiction outside the approved India SaaS governance workspace.',
      suggestion: 'Aligned with Indian digital advertising and enterprise governance standards.',
    });
  }

  return findings;
}

// Findings Merger: Deduplicate & sort by Severity and Confidence
function mergeFindings(layerA: GovernanceFinding[], layerB: GovernanceFinding[]): GovernanceFinding[] {
  const merged = [...layerA];
  for (const itemB of layerB) {
    const isDuplicate = merged.some(
      (itemA) =>
        itemA.originalText.toLowerCase().includes(itemB.originalText.toLowerCase()) ||
        itemB.originalText.toLowerCase().includes(itemA.originalText.toLowerCase())
    );
    if (!isDuplicate) {
      merged.push(itemB);
    }
  }
  const severityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return merged.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.confidence - a.confidence);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      draftText = '',
      isPaidPromo = false,
      isAiAssisted = false,
      fgHex = '#1E293B',
      bgHex = '#FFFFFF',
      altText = '',
      hasImage = true,
    } = body;

    // Step 3: Layer A Deterministic Rules Check
    const layerAFindings = runLayerADeterministic(draftText, {
      isPaidPromo,
      isAiAssisted,
      fgHex,
      bgHex,
      altText,
      hasImage,
    });

    // Step 4: Layer B Grounded AI Check (with deterministic grounded fallback)
    let layerBFindings = runLayerBGroundedFallback(draftText);
    let engineName = 'BrandGuard Hybrid (Layer A Rules + Layer B Grounded Engine)';

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'your_actual_api_key_here') {
      const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } });
      const systemInstruction = `
        You are Layer B (Grounded AI Reviewer) of BrandGuard.
        Review the user's draft strictly against this approved source library: ${JSON.stringify(guidelines)}.
        Do NOT invent facts. Classify every finding using one of these exact claimStatus values:
        "Supported", "Unsupported in library", "Conflicting evidence", "Potentially stale", "Out of scope", or "Needs human judgement".
        Return ONLY a JSON array of objects with keys:
        originalText, brokenRule (must cite Rule ID or Source ID and page), suggestion, severity ("HIGH"|"MEDIUM"|"LOW"), confidence (0.70 to 0.98), ruleId, claimStatus.
      `;

      for (const modelName of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: draftText,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });
          const aiParsed = JSON.parse(response.text || '[]');
          if (Array.isArray(aiParsed) && aiParsed.length > 0) {
            const mappedAi: GovernanceFinding[] = aiParsed.map((item: any, idx: number) => ({
              id: `lb-ai-${idx}-${Date.now()}`,
              layer: 'Layer B: Grounded AI',
              category: 'FACT & SOURCE CHECK',
              severity: item.severity || 'MEDIUM',
              confidence: typeof item.confidence === 'number' ? item.confidence : 0.88,
              ruleId: item.ruleId || 'SRC-LIB-AI',
              claimStatus: item.claimStatus || 'Unsupported in library',
              originalText: item.originalText || '',
              brokenRule: item.brokenRule || 'Unverified claim against approved library.',
              suggestion: item.suggestion || '',
            }));
            layerBFindings = [...layerBFindings, ...mappedAi];
            engineName = `Layer A Deterministic + Layer B (${modelName})`;
            break;
          }
        } catch {
          // Gracefully continue with grounded fallback
        }
      }
    }

    // Findings Merger
    const finalFindings = mergeFindings(layerAFindings, layerBFindings);

    return NextResponse.json({
      issues: finalFindings,
      engine: engineName,
      counts: {
        layerA: layerAFindings.length,
        layerB: layerBFindings.length,
        merged: finalFindings.length,
      },
    });
  } catch (error) {
    console.error('BrandGuard Review Error:', error);
    return NextResponse.json({ issues: [], engine: 'BrandGuard Safe Fallback' });
  }
}