/**
 * SVJ PERFORMANCE OS — Phase 2 (Challenges + Character Matrix) regressions.
 *
 * Focused source contracts:
 *  - Challenges still render real challenge state (no invented states)
 *  - Character Matrix preserves the six attributes, vector icons, no emoji
 *  - SVG remains present and responsive (viewBox, overflow-visible, no filters)
 *  - completion UI does not mutate XP directly (server/ledger authoritative)
 *  - reduced-motion fallback exists wherever animation was added
 *  - hierarchy: primary (Today's focus) > secondary (list) > tertiary (rank)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (rel: string) => readFile(new URL(rel, import.meta.url), "utf8");

const view = await read("../src/app/views/ChallengesView.tsx");
const card = await read("../src/app/components/ChallengeCard.tsx");
const matrix = await read("../src/app/components/CharacterMatrix.tsx");
const xpStrip = await read("../src/app/components/XpLevelStrip.tsx");
const banner = await read("../src/app/components/ChallengeCompletionBanner.tsx");
const designTokens = await read("../src/app/lib/designTokens.ts");

describe("Challenges — real state, clear hierarchy", () => {
  it("derives only supported challenge states (available/completing/completed/locked)", async () => {
    // The four visual states map to real fields: pending RPC, completed +
    // completion-locked, plain available. No invented failed/expired states.
    const states = await read("../src/app/lib/challengeUI.ts");
    assert.match(states, /"available"\s*\|\s*"completing"\s*\|\s*"completed"\s*\|\s*"locked"/);
    // No dedicated failed/expired state exists in the type union.
    const typeLine = states.slice(
      states.indexOf("export type ChallengeVisualState"),
      states.indexOf("export function getChallengeVisualState"),
    );
    assert.doesNotMatch(typeLine, /"failed"|"expired"|\'failed\'|\'expired\'/);
  });

  it("keeps the primary → secondary → tertiary hierarchy", () => {
    // Primary objective: highest-XP incomplete task flagged "Today's focus".
    assert.match(view, /primaryObjective/);
    assert.match(view, /isPrimary=\{primaryObjective\?\.id === challenge\.id\}/);
    // Tertiary context: global rank is supporting, not louder than the list.
    assert.match(view, /Global rank #\{userRank\}/);
  });

  it("renders real challenge state, not fake demo data", () => {
    assert.doesNotMatch(view, /Lorem ipsum|DEMO CHALLENGE/);
    assert.match(view, /displayChallenges/);
  });

  it("uses the primitives for empty / loading / error", () => {
    assert.match(view, /<SVJSkeleton/);
    assert.match(view, /<SVJEmptyState/);
    assert.match(view, /<SVJErrorState/);
  });

  it("personalized rows complete through the server RPC only", () => {
    assert.match(view, /handlePersonalizedComplete/);
    assert.match(view, /callCompletePersonalized\(\{/);
    assert.doesNotMatch(
      view.slice(
        view.indexOf("handlePersonalizedComplete"),
        view.indexOf("handlePersonalizedComplete") + 700,
      ),
      /applyActivityXp/,
    );
  });
});

describe("ChallengeCard", () => {
  it("communicates category, difficulty, progress, XP and action", () => {
    assert.match(card, /categoryColor\(challenge\.category\)/);
    assert.match(card, /difficultyMeta\(challenge\.difficulty\)/);
    assert.match(card, /earned = challenge\.earnedXP \?\? challenge\.xp/);
    assert.match(card, /aria-label=\{`\$\{challenge\.completed \? "Uncomplete" : "Complete"\}/);
  });

  it("uses category attribute colors semantically — no random gradient per card", () => {
    assert.match(card, /backgroundColor: categoryHex/);
    assert.doesNotMatch(card, /bg-gradient-to-|linear-gradient/);
  });

  it("has visually distinct, labeled states", () => {
    assert.match(card, /staticBorders: Record</);
    assert.match(card, /state === "completing"/);
    assert.match(card, /state === "locked"/);
    assert.match(card, /aria-checked=\{challenge\.completed\}/);
  });

  it("touch target is at least 44px", () => {
    assert.match(card, /h-11 w-11/);
  });
});

describe("Character Matrix", () => {
  it("preserves all six attributes in the canonical order", async () => {
    // The matrix defines its six axes through the shared AttributeKey model.
    assert.match(matrix, /ANGLES: Record<AttributeKey, number>/);
    for (const key of ["physical", "discipline", "mental", "intellect", "ambition", "social"]) {
      assert.match(matrix, new RegExp(`\\b${key}\\b`), `matrix missing ${key}`);
    }
    // Canonical order (Physical at top, clockwise) lives in the shared helper.
    assert.match(matrix, /ATTRIBUTE_ORDER/);
    const helpers = await read("../src/app/lib/challengeUI.ts");
    assert.match(
      helpers,
      /"physical",\s*\n\s*"ambition",\s*\n\s*"intellect",\s*\n\s*"mental",\s*\n\s*"social",\s*\n\s*"discipline"/,
    );
    assert.match(view, /CharacterMatrix/, "matrix wired into Challenges");
  });

  it("replaces emoji with vector iconography", () => {
    assert.doesNotMatch(matrix, /💪|👑|📖|🧠|👥|⚔️/);
    assert.match(matrix, /ICONS: Record<AttributeKey, LucideIcon>/);
    assert.match(matrix, /physical: Activity/);
    assert.match(matrix, /discipline: Dumbbell/);
    assert.match(matrix, /mental: Brain/);
    assert.match(matrix, /ambition: Crown/);
    assert.match(matrix, /social: Users/);
  });

  it("builds a responsive, structured SVG (viewBox, groups, no heavy filters)", () => {
    assert.match(matrix, /viewBox=\{`0 0 \$\{W\} \$\{H\}`\}/);
    assert.match(matrix, /overflow-visible/);
    assert.match(matrix, /id="grid"/);
    assert.match(matrix, /id="nodes"/);
    assert.match(matrix, /id="axis-labels"/);
    assert.doesNotMatch(matrix, /feGaussianBlur|<filter/);
  });

  it("has an accessible text equivalent (title + desc)", () => {
    assert.match(matrix, /<title/);
    assert.match(matrix, /<desc/);
    assert.match(matrix, /aria-label="Character Matrix"/);
  });

  it("animates the polygon only when values actually change", () => {
    assert.match(matrix, /hasMeaningfulChange/);
    assert.match(matrix, /key=\{hasMeaningfulChange \? valuePoints : "static-value"\}/);
  });

  it("only shows provenance the data supports", () => {
    assert.match(matrix, /No recent task data for this attribute yet/);
    assert.match(matrix, /contributions/);
  });
});

describe("XP / motion", () => {
  it("XP strip presents one premium progression (read-only)", () => {
    assert.match(xpStrip, /role="progressbar"/);
    assert.match(xpStrip, /levelProgress\(totalXp\)/);
    // The module comment mentions applyActivityXp only as a reference to the
    // canonical level formula; it never calls it.
    assert.doesNotMatch(xpStrip, /applyActivityXp\(|setTotalXp|awardXp\(/);
  });

  it("completion banner never mutates XP and honors reduced motion", () => {
    assert.match(banner, /useReducedMotion/);
    assert.match(banner, /aria-live="polite"/);
    // Banner takes figures from the caller — no client XP math.
    assert.doesNotMatch(banner, /applyActivityXp|setUser|useSVJ/);
  });

  it("matrix + banner gate animation behind prefers-reduced-motion", () => {
    assert.match(matrix, /useReducedMotion/);
    assert.match(banner, /useReducedMotion/);
    assert.match(xpStrip, /useReducedMotion/);
  });

  it("challenge completion drops the confetti burst (single restrained moment)", async () => {
    // The concise banner is the celebration for challenge completion; the
    // legacy confetti burst is gone from the toggle path (still used by
    // workout/nutrition/reward/onboarding flows it was built for).
    const context = await read("../src/app/context/SVJContext.tsx");
    const toggle = context.slice(
      context.indexOf("const toggleChallenge ="),
      context.indexOf("const logWorkout ="),
    );
    assert.doesNotMatch(toggle, /triggerConfetti\(\)/);
    assert.match(toggle, /No confetti here/);
  });
});

describe("tokens", () => {
  it("six attribute colors remain the semantic category palette", () => {
    for (const hex of ["#10B981", "#A855F7", "#F59E0B", "#EAB308", "#3B82F6", "#F43F5E"]) {
      assert.ok(designTokens.includes(hex), `designTokens missing ${hex}`);
    }
  });
});
