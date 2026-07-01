# Capabilities Index

> **Boilerplate status:** The spec-writer sub-agent creates one file per capability in this directory. Each file describes exactly one discrete thing the agent can do.

---

## What Is a Capability?

A capability is a single, discrete action or behavior the agent performs. Examples:
- "Search the web for companies matching criteria X"
- "Draft a personalized email given a lead profile"
- "Send a Slack notification when a threshold is crossed"

## Capabilities in This Project

| Capability | Phase | File |
|-----------|-------|------|
| Capture Transcript (Google Meet live captions) | 1 | [capture-transcript.md](capture-transcript.md) |
| Meeting Library | 1 | [meeting-library.md](meeting-library.md) |
| Transcript View | 1 | [transcript-view.md](transcript-view.md) |
| AI Title (Gemini auto-titling) | 1 | [ai-title.md](ai-title.md) |
| AI Summary (TL;DR + key points + action items) | 2 (stub in P1) | [ai-summary.md](ai-summary.md) |
| Action Items with Owners | 2 (stub in P1) | [action-items.md](action-items.md) |
| Grounded Q&A on a Meeting | 3 (stub in P1) | [qa.md](qa.md) |
| Slack Auto-Post of Summary | 4 (deferred) | [slack-post.md](slack-post.md) |
| Saved Recording | 4 (deferred) | [saved-recording.md](saved-recording.md) |
| Cross-Meeting Search | 5 (stub in P1, built last) | [cross-meeting-search.md](cross-meeting-search.md) |

## How to Add a New Capability

Run `/zero-shot-build [description]` on the existing spec. The spec-writer sub-agent will:
1. Create a new file in this directory (`<name>.md`, no number prefix)
2. Update this index
3. Flag any dependencies on existing capabilities
4. Self-review that it fits the architecture and data model before returning

## Capability File Template

Each capability file should answer:
- **What it does** (one sentence)
- **Inputs** (what data it receives)
- **Outputs** (what it produces)
- **External calls** (APIs, LLMs, databases it touches)
- **Error cases** (what can go wrong and how it's handled)
- **Success criteria** (how we test it)
