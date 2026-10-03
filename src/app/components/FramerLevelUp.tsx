import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export const FRAMER_FORGED_URL = "https://framer.com/m/Forged-gK9Ssu.js@HF3NoCK8a3lBwTeVSaXp";

// Framer's export uses bare runtime imports. Keep its React/runtime in a separate
// browser realm so it cannot split the app's hooks, contexts, or server bundle.
// Both Framer imports share one runtime so child variant animations inherit correctly.
export function createFramerLevelUpDocument(level: number): string {
  const safeLevel = Number.isSafeInteger(level) && level > 0 ? level : 1;
  const digits = String(safeLevel).length;
  const numberSize = Math.min(168, Math.floor(340 / (digits * 0.65)));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/unframer@4.2.1/src/styles/framer.css">
<style>
  @font-face {
    font-family: Anton; font-style: normal; font-weight: 400; font-display: swap;
    src: url('https://framerusercontent.com/third-party-assets/fontshare/wf/TPY5PBRHOSXJ53WNSUYZQYX4FZUMAYNF/YHKM2QXXZHS7MS6DJUZXTGRXMIGWH7K5/PCXT6E5YCQO6SSVLT6UZPPGT7QKGXOUS.woff2') format('woff2');
  }
  :root {
    --token-023f864d-400f-48dd-9ace-609407c6224f: #0B0B0C;
    --token-679ae03f-0baa-4296-827d-685cfe73469d: #F5F5F5;
    --token-8866391c-a506-4d73-a520-357786ddab11: #C81E3A;
    --token-3fb4b575-cc48-40ed-bd1e-8b7c0ab68caf: #D4AF37;
  }
  * { box-sizing: border-box; }
  html, body, #root { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0B0B0C; }
  h1, p { margin: 0; --framer-letter-spacing: 0px !important; }
  h1, .framer-1lwad8x p { font-family: Anton, sans-serif !important; }
  .framer-1lwad8x p { --framer-font-size: ${numberSize}px !important; }
</style>
<script type="importmap">{"imports":{
  "react":"https://esm.sh/react@19.2.0",
  "react/jsx-runtime":"https://esm.sh/react@19.2.0/jsx-runtime",
  "react-dom":"https://esm.sh/react-dom@19.2.0?external=react",
  "react-dom/client":"https://esm.sh/react-dom@19.2.0/client?external=react",
  "framer-motion":"https://esm.sh/unframer@4.2.1?external=react,react-dom",
  "framer":"https://esm.sh/unframer@4.2.1?external=react,react-dom"
}}</script></head><body><div id="root"></div>
<script type="module">
  const notify = (status) => parent.postMessage({ type: 'svj-level-up', level: ${safeLevel}, status }, '*');
  window.addEventListener('error', () => notify('failed'));
  window.addEventListener('unhandledrejection', () => notify('failed'));
  try {
    const [React, { createRoot }, { default: Forged }] = await Promise.all([
      import('react'), import('react-dom/client'), import(${JSON.stringify(FRAMER_FORGED_URL)})
    ]);
    class Boundary extends React.Component {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch() { notify('failed'); }
      render() { return this.state.failed ? null : this.props.children; }
    }
    function Animation() {
      React.useEffect(() => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('[data-framer-name="Out"]')) notify('complete');
        });
        observer.observe(document.getElementById('root'), { attributes: true, subtree: true });
        notify('ready');
        return () => observer.disconnect();
      }, []);
      const [size, setSize] = React.useState({ scale: 1, height: innerHeight });
      React.useEffect(() => {
        const resize = () => {
          const scale = Math.min(innerWidth / 390, 1);
          setSize({ scale, height: innerHeight / scale });
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
      }, []);
      return React.createElement(Forged, {
        level: String(${safeLevel}),
        style: { width: 390, height: size.height, position: 'absolute', left: '50%',
          top: '50%', transform: 'translate(-50%, -50%) scale(' + size.scale + ')' }
      });
    }
    createRoot(document.getElementById('root')).render(
      React.createElement(Boundary, null, React.createElement(Animation))
    );
  } catch { notify('failed'); }
</script></body></html>`;
}

export const FramerLevelUp: React.FC<{ level: number; fallback: React.ReactNode }> = ({
  level,
  fallback,
}) => {
  const reducedMotion = useReducedMotion();
  const frame = useRef<HTMLIFrameElement>(null);
  const [document, setDocument] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "complete" | "failed">("loading");

  useEffect(() => {
    if (reducedMotion) return;
    setStatus("loading");
    setDocument(createFramerLevelUpDocument(level));
    let timer = window.setTimeout(() => setStatus("failed"), 12_000);
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "svj-level-up" ||
        event.data.level !== level
      )
        return;
      window.clearTimeout(timer);
      if (event.data.status === "ready") {
        setStatus("playing");
        timer = window.setTimeout(() => setStatus("complete"), 6_500);
      } else if (event.data.status === "complete") {
        setStatus("complete");
      } else {
        setStatus("failed");
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [level, reducedMotion]);

  const playing = !reducedMotion && status === "playing";
  return (
    <div
      className="relative h-full w-full"
      data-animation-state={reducedMotion ? "reduced-motion" : status}
    >
      <div className={`h-full ${playing ? "invisible" : "visible"}`}>{fallback}</div>
      {document && !reducedMotion && (status === "loading" || playing) && (
        <iframe
          ref={frame}
          title="Level-up animation"
          aria-hidden="true"
          tabIndex={-1}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={document}
          className={`pointer-events-none absolute inset-0 h-full w-full border-0 ${playing ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
};
