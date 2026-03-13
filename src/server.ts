const HASHCARDS_PORT = 8000;
const LISTEN_PORT = parseInt(Deno.env.get("PORT") ?? "3000");
const COLLECTION_DIR = Deno.env.get("COLLECTION_DIR") ?? "/data";

let hashcardsProcess: Deno.ChildProcess | null = null;
let startPromise: Promise<StartResult> | null = null;
let lastMessage: string | null = null;

interface StartResult {
  ready: boolean;
  message?: string;
}

// Poll until hashcards' port is accepting connections, or timeout.
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const conn = await Deno.connect({ hostname: "127.0.0.1", port });
      conn.close();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return false;
}

function buildHashcardsArgs(): string[] {
  const args = [
    "drill",
    COLLECTION_DIR,
    "--host",
    "0.0.0.0",
    "--port",
    String(HASHCARDS_PORT),
    "--open-browser",
    "false",
  ];

  const extra = Deno.env.get("HASHCARDS_ARGS");
  if (extra) {
    args.push(...extra.split(/\s+/).filter(Boolean));
  }

  return args;
}

// Start hashcards and wait for it to be ready.
// Deduplicates concurrent start requests.
async function startHashcards(): Promise<StartResult> {
  if (hashcardsProcess) {
    return { ready: true };
  }
  if (startPromise) {
    return startPromise;
  }
  startPromise = doStart();
  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

async function doStart(): Promise<StartResult> {
  lastMessage = null;

  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command("hashcards", {
      args: buildHashcardsArgs(),
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    lastMessage = `Failed to start hashcards: ${msg}`;
    return { ready: false, message: lastMessage };
  }

  // Race: either the port opens (server started) or the process exits early
  // (e.g. "No cards due today").
  type RaceResult =
    | { type: "port"; ok: boolean }
    | { type: "exit"; code: number };

  const portResult: Promise<RaceResult> = waitForPort(
    HASHCARDS_PORT,
    10_000,
  ).then((ok) => ({ type: "port" as const, ok }));

  const exitResult: Promise<RaceResult> = child.status.then((s) => ({
    type: "exit" as const,
    code: s.code,
  }));

  const result = await Promise.race([portResult, exitResult]);

  if (result.type === "exit") {
    lastMessage = result.code === 0
      ? "No cards due today."
      : `hashcards exited with code ${result.code}.`;
    return { ready: false, message: lastMessage };
  }

  if (!result.ok) {
    try {
      child.kill();
    } catch {
      /* already dead */
    }
    lastMessage = "Timeout waiting for hashcards to start.";
    return { ready: false, message: lastMessage };
  }

  hashcardsProcess = child;
  console.log("hashcards started");

  // When hashcards exits later (session complete, user clicked Shutdown, etc.),
  // clear the reference so the next request shows the landing page.
  child.status.then((s: Deno.CommandStatus) => {
    console.log(`hashcards exited (code ${s.code})`);
    hashcardsProcess = null;
  });

  return { ready: true };
}

// Forward a request to the hashcards server.
// On connection failure (hashcards exited), redirect to the landing page.
async function proxyRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target =
    `http://127.0.0.1:${HASHCARDS_PORT}${url.pathname}${url.search}`;

  try {
    const resp = await fetch(target, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      redirect: "manual",
    });
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  } catch {
    // hashcards is no longer reachable
    hashcardsProcess = null;
    return new Response(null, { status: 303, headers: { Location: "/" } });
  }
}

const LANDING_HTML = Deno.readTextFileSync(
  new URL("landing.html", import.meta.url),
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function landingPage(message?: string | null): Response {
  const messageHtml = message
    ? `<p class="message">${escapeHtml(message)}</p>`
    : "";

  const html = LANDING_HTML.replace("{{message}}", messageHtml);

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

console.log(`Listening on :${LISTEN_PORT}`);

const server = Deno.serve(
  { port: LISTEN_PORT, hostname: "0.0.0.0" },
  async (req) => {
    // If hashcards is running, proxy everything to it.
    if (hashcardsProcess) {
      return proxyRequest(req);
    }

    // POST /start -> launch hashcards, then redirect into it.
    if (new URL(req.url).pathname === "/start" && req.method === "POST") {
      const result = await startHashcards();
      if (result.ready) {
        return new Response(null, {
          status: 303,
          headers: { Location: "/" },
        });
      }
      return landingPage(result.message);
    }

    // Everything else -> landing page.
    return landingPage(lastMessage);
  },
);

// Clean up child process and HTTP server on shutdown signals.
function shutdown() {
  if (hashcardsProcess) {
    try {
      hashcardsProcess.kill("SIGTERM");
    } catch {
      /* already dead */
    }
  }
  server.shutdown();
}

Deno.addSignalListener("SIGTERM", shutdown);
Deno.addSignalListener("SIGINT", shutdown);
