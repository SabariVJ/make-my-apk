import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [320, 360, 375, 390, 430, 600, 768, 1024, 1280];
const PORTRAIT = WIDTHS.map((width) => ({ width, height: Math.max(800, Math.round(width * 1.7)) }));
const LANDSCAPE = [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
];
const ALL_SIZES = [...PORTRAIT, ...LANDSCAPE];

type Geometry = {
  buildRevision: string;
  innerWidth: number;
  visualViewportWidth: number;
  visualViewportScale: number;
  documentWidth: number;
  documentClientWidth: number;
  bodyWidth: number;
  safeLeft: number;
  safeRight: number;
  outsideSafeViewport: string[];
  horizontallyScrollable: string[];
  clippedControls: string[];
  clippedText: string[];
};

const READY: Record<string, string> = {
  challenges: '[data-responsive-screen="challenges"]',
  activity: '[data-responsive-screen="activity"]',
  earn: '[data-responsive-screen="earn"]',
  workouts: '[data-testid="train-tab-today"]',
  recovery: '[data-testid="recovery-sections"]',
  nutrition: '[data-responsive-screen="nutrition"]',
  community: '[data-responsive-screen="community"]',
  leaderboard: '[data-responsive-screen="leaderboard"]',
  sixty: '[data-responsive-screen="sixty"]',
  profile: '[data-responsive-screen="profile"]',
  plan: '[data-responsive-screen="plan"]',
  transform: '[data-responsive-screen="transform"]',
  admin: '[data-testid="admin-users-table"]',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "svj_app_state_v5_feature_flags",
      JSON.stringify({ automated_training_v1: true }),
    );
  });

  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === "http://127.0.0.1:4173") {
      await route.continue();
    } else {
      await route.abort();
    }
  });
});

async function openScreen(page: Page, tab: string) {
  await page.goto(
    `/?tab=${encodeURIComponent(tab)}${tab === "workouts" ? "&automated_training_v1=1" : ""}`,
  );
  await expect(page.getByTestId("app-header")).toBeVisible();
  await expect(page.locator(READY[tab])).toBeVisible();
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const safeProbe = document.createElement("div");
    safeProbe.style.cssText =
      "position:fixed;inset:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);";
    document.body.append(safeProbe);
    const safeLeft = Number.parseFloat(getComputedStyle(safeProbe).paddingLeft) || 0;
    const safeRight = Number.parseFloat(getComputedStyle(safeProbe).paddingRight) || 0;
    safeProbe.remove();

    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        !element.closest(".sr-only")
      );
    };
    const describe = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const testId = element.getAttribute("data-testid");
      const label = element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 35);
      const className =
        typeof element.className === "string" ? element.className.trim().replace(/\s+/g, ".") : "";
      return `${element.tagName.toLowerCase()}${testId ? `[${testId}]` : ""}${className ? `.${className}` : ""}${label ? `(${label})` : ""} x=${Math.round(rect.left)}..${Math.round(rect.right)}`;
    };
    const escapesSafeViewport = (element: Element) => {
      const visualWidth = window.visualViewport?.width ?? window.innerWidth;
      const { left, right } = element.getBoundingClientRect();
      return left < safeLeft - 1 || right > visualWidth - safeRight + 1;
    };

    const content = Array.from(document.body.querySelectorAll("*"));
    const outsideSafeViewport = content
      .filter(visible)
      .filter((element) => !element.closest('[aria-hidden="true"]'))
      .filter(escapesSafeViewport)
      .map(describe)
      .slice(0, 20);

    const horizontallyScrollable = Array.from(document.querySelectorAll("body *"))
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          element.scrollWidth > element.clientWidth + 2
        );
      })
      .map(describe)
      .slice(0, 20);

    const clippedControls = Array.from(
      document.querySelectorAll("button, a, [role=tab], input, select, textarea"),
    )
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          (style.overflowX === "hidden" || style.overflowX === "clip") &&
          style.textOverflow !== "ellipsis" &&
          element.scrollWidth > element.clientWidth + 3
        );
      })
      .map(describe)
      .slice(0, 20);

    const clippedText = Array.from(document.body.querySelectorAll("*"))
      .filter(visible)
      .filter((element) => element.children.length === 0 && element.textContent?.trim())
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        let ancestor: Element | null = element;
        while (ancestor && ancestor !== document.documentElement) {
          const style = getComputedStyle(ancestor);
          if (["hidden", "clip"].includes(style.overflowX)) {
            const clip = ancestor.getBoundingClientRect();
            if (bounds.left < clip.left - 1 || bounds.right > clip.right + 1) return true;
            if (ancestor === element && ancestor.scrollWidth > ancestor.clientWidth + 3)
              return true;
          }
          ancestor = ancestor.parentElement;
        }
        return false;
      })
      .map(describe)
      .slice(0, 20);

    return {
      buildRevision:
        document.querySelector('meta[name="svj-build-revision"]')?.getAttribute("content") ??
        "missing",
      innerWidth: window.innerWidth,
      visualViewportWidth: window.visualViewport?.width ?? -1,
      visualViewportScale: window.visualViewport?.scale ?? -1,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      documentClientWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
      safeLeft,
      safeRight,
      outsideSafeViewport,
      horizontallyScrollable,
      clippedControls,
      clippedText,
    };
  });
}

async function assertFits(page: Page, expectedWidth: number, screen: string) {
  const result = await geometry(page);
  const diagnostic = `${screen}: ${JSON.stringify(result)}`;
  expect(result.buildRevision, diagnostic).not.toBe("missing");
  expect(result.innerWidth, diagnostic).toBe(expectedWidth);
  expect(result.visualViewportWidth, diagnostic).toBeLessThanOrEqual(expectedWidth + 1);
  expect(result.visualViewportWidth, diagnostic).toBeGreaterThanOrEqual(expectedWidth - 8);
  expect(result.visualViewportScale, diagnostic).toBeCloseTo(1, 4);
  expect(result.documentClientWidth, diagnostic).toBeLessThanOrEqual(
    result.visualViewportWidth + 1,
  );
  expect(result.documentWidth, diagnostic).toBeLessThanOrEqual(result.visualViewportWidth + 1);
  expect(result.bodyWidth, diagnostic).toBeLessThanOrEqual(result.visualViewportWidth + 1);
  expect(result.outsideSafeViewport, diagnostic).toEqual([]);
  expect(result.horizontallyScrollable, diagnostic).toEqual([]);
  expect(result.clippedControls, diagnostic).toEqual([]);
  expect(result.clippedText, diagnostic).toEqual([]);
}

test("built shell and default destination fit every portrait and landscape viewport", async ({
  page,
}) => {
  await openScreen(page, "challenges");

  for (const size of ALL_SIZES) {
    await page.setViewportSize(size);
    await assertFits(page, size.width, `challenges ${size.width}x${size.height}`);
  }
});

test("primary destinations reflow at phone, tablet, and desktop widths", async ({ page }) => {
  const screens = [
    "activity",
    "earn",
    "nutrition",
    "community",
    "leaderboard",
    "sixty",
    "profile",
    "plan",
    "transform",
  ];

  for (const screen of screens) {
    await openScreen(page, screen);
    for (const size of ALL_SIZES) {
      await page.setViewportSize(size);
      await assertFits(page, size.width, `${screen} ${size.width}x${size.height}`);
    }
  }
});

test("Training tabs, Recovery sections, and admin user data fit the full viewport matrix", async ({
  page,
}) => {
  for (const screen of ["workouts", "recovery", "admin"]) {
    await openScreen(page, screen);

    if (screen === "workouts") {
      for (const tab of ["today", "templates", "progress", "history", "log"]) {
        await expect(page.getByTestId(`train-tab-${tab}`)).toBeVisible();
      }
    }
    if (screen === "admin") {
      await expect(page.getByText("Viewport Test Athlete")).toBeVisible();
      await expect(page.getByRole("button", { name: "Give Plus" })).toBeVisible();
    }

    for (const size of ALL_SIZES) {
      await page.setViewportSize(size);
      await assertFits(page, size.width, `${screen} ${size.width}x${size.height}`);
    }
  }
});
