# @vibetracker/mcp

MCP server for [VibeTracker](https://github.com/shantanugopale/vibetracker)
(Model Context Protocol, stdio) — lets any MCP client (Claude Code, opencode,
Cursor, …) read the progress tracker and commit audited criteria.

Tools:

- `track_init` — scaffold `ROADMAP.md` + `.vibetracker/config.json`
- `track_status` — the full scoreboard (every phase/task/criterion with status)
- `verify_now` — run configured quality gates and update tracked criteria
- `flag_blocked` — park a criterion as `blocked`

Install as an MCP server:

```json
{ "command": "npx", "args": ["-y", "@vibetracker/mcp"] }
```

Docs: <https://github.com/shantanugopale/vibetracker> · License: MIT
