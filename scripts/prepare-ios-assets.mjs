if (process.env.SVJ_RESPONSIVE_LOCAL === "1") {
  await import("./prepare-responsive-capacitor.mjs");
} else {
  const { access, cp, mkdir, writeFile } = await import("node:fs/promises");

  // TanStack Start serves HTML on the server; Capacitor still requires a bundled
  // entry point even when server.url loads the hosted app.
  await access(".output/public");
  await mkdir("dist/client", { recursive: true });
  await cp(".output/public", "dist/client", { recursive: true });
  await writeFile(
    "dist/client/index.html",
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SVJ</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B0B0C;color:#fff;font-family:system-ui}main{text-align:center;padding:24px}img{width:80px;height:80px}a{color:#fff;background:#C81E3A;padding:12px 24px;display:inline-block;border-radius:8px;text-decoration:none}</style></head>
<body><main><img src="icon-192.png" alt="SVJ"><h1>SVJ</h1><p>Connect to the internet to open your account.</p><a href="https://savaje-com.lovable.app">Open SVJ</a></main></body></html>`,
  );
}
