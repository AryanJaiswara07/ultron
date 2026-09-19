import { describe, expect, it } from "vitest";

import {
  normalizeUtterance,
  routeIntent,
} from "../src/lib/ultron/brain/intents";

describe("normalizeUtterance", () => {
  it("strips wake word and politeness", () => {
    expect(normalizeUtterance("Ultron, open VS Code.")).toBe("open VS Code");
    expect(normalizeUtterance("Can you open Chrome?")).toBe("open Chrome");
    expect(normalizeUtterance("please launch the terminal")).toBe(
      "launch the terminal",
    );
  });
});

describe("app.open intent — phrasing variations map to the same action", () => {
  const cases = [
    "Open VS Code.",
    "Can you open VS Code?",
    "Ultron, get VS Code up.",
    "Launch Visual Studio Code.",
    "Start my editor.",
    "Fire up my editor.",
    "Bring chrome up.",
    "Open the terminal.",
  ];
  for (const phrase of cases) {
    it(`routes: "${phrase}"`, () => {
      const r = routeIntent(phrase);
      expect(r.intent).toBe("app.open");
      expect(r.action.kind).toBe("tool");
      expect(r.confidence).toBeGreaterThan(0.8);
      expect(r.speech.length).toBeGreaterThan(3);
    });
  }

  it("maps synonyms to stable app ids", () => {
    for (const p of ["Open VS Code.", "Launch Visual Studio Code.", "Start my editor."]) {
      const r = routeIntent(p);
      expect(r.action).toMatchObject({ kind: "tool", tool: "apps.open" });
      if (r.action.kind === "tool") expect(r.action.args.app).toBe("vscode");
    }
    const chrome = routeIntent("Open the web browser.");
    if (chrome.action.kind === "tool") expect(chrome.action.args.app).toBe("chrome");
  });
});

describe("system intents", () => {
  it("'what is using my RAM' → system.top by rss", () => {
    const r = routeIntent("Ultron, what is using so much RAM?");
    expect(r.intent).toBe("system.top");
    if (r.action.kind === "tool") expect(r.action.args.metric).toBe("rss");
    expect(r.speech).toBe("I'll check.");
  });

  it("cpu phrasings → system.top by cpu", () => {
    const r = routeIntent("What's using my CPU?");
    if (r.action.kind === "tool") expect(r.action.args.metric).toBe("cpu");
  });

  it("'how is my laptop doing' → system.info", () => {
    expect(routeIntent("Ultron, how is my laptop doing?").intent).toBe("system.info");
    expect(routeIntent("system status").intent).toBe("system.info");
  });
});

describe("memory intents", () => {
  it("remember → memory.remember with note", () => {
    const r = routeIntent("Remember that my main project is Nova");
    expect(r.intent).toBe("memory.remember");
    if (r.action.kind === "tool") {
      expect(r.action.tool).toBe("memory.remember");
      expect(r.action.args.note).toBe("my main project is Nova");
    }
  });
  it("recall", () => {
    expect(routeIntent("What do you remember?").intent).toBe("memory.recall");
  });
});

describe("project.create intent", () => {
  it("extracts name and 3d kind", () => {
    const r = routeIntent("Build me a 3D website called Nova.");
    expect(r.intent).toBe("project.create");
    if (r.action.kind === "tool") {
      expect(r.action.args.name).toBe("nova");
      expect(r.action.args.kind).toBe("3d-site");
    }
  });
  it("react kind", () => {
    const r = routeIntent("Create a React project called Vega");
    if (r.action.kind === "tool") expect(r.action.args.kind).toBe("react-app");
  });
  it("game kind", () => {
    const r = routeIntent("Make a game called Starfall");
    if (r.action.kind === "tool") expect(r.action.args.kind).toBe("game");
  });
});

describe("wake variants — the phrase people actually say", () => {
  const wakes = ["Ultron.", "ultron", "hey ultron", "Hey Ultron!", "ok ultron", "okay ultron", "hey", "yo ultron"];
  for (const phrase of wakes) {
    it(`"${phrase}" → wake affirmation, never unresolved`, () => {
      const r = routeIntent(phrase);
      expect(r.intent).toBe("wake");
      expect(r.action.kind).toBe("reply");
      expect(r.speech.length).toBeGreaterThan(2);
    });
  }

  it("wake + command in one breath routes the command", () => {
    const r = routeIntent("hey ultron, open chrome");
    expect(r.intent).toBe("app.open");
    if (r.action.kind === "tool") expect(r.action.args.app).toBe("chrome");
  });

  it("wake without comma still routes", () => {
    const r = routeIntent("ultron open vs code");
    expect(r.intent).toBe("app.open");
  });

  it("normalizeUtterance returns empty for wake-only phrases", () => {
    expect(normalizeUtterance("hey ultron")).toBe("");
    expect(normalizeUtterance("okay, ultron.")).toBe("");
    expect(normalizeUtterance("hey ultron open chrome")).toBe("open chrome");
  });
});

describe("capabilities intent", () => {
  it("'what can you do' / 'help' answers truthfully", () => {
    for (const phrase of ["what can you do", "help", "capabilities"]) {
      const r = routeIntent(phrase);
      expect(r.intent).toBe("help");
      expect(r.speech).toContain("open applications");
    }
  });
});

describe("steering + wake + unresolved", () => {
  it("bare wake affirms", () => {
    const r = routeIntent("Ultron.");
    expect(r.intent).toBe("wake");
    expect(r.action).toMatchObject({ kind: "reply" });
  });
  it("stop/pause/resume", () => {
    expect(routeIntent("Ultron, stop.").intent).toBe("task.stop");
    expect(routeIntent("wait").intent).toBe("task.pause");
    expect(routeIntent("continue").intent).toBe("task.resume");
  });
  it("unknown input stays unresolved (fails closed)", () => {
    const r = routeIntent("explain quantum chromodynamics");
    expect(r.intent).toBe("unresolved");
    expect(r.action.kind).toBe("unresolved");
  });
});
