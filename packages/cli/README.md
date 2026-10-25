# @vibetracker/cli

![VibeTracker demo](https://raw.githubusercontent.com/shantanugopale/vibetracker/main/assets/demo.gif)

The `vibetracker` CLI — track your vibe-coding progress with any AI agent
(Claude Code, OpenCode, Codex, Gemini CLI, Cursor) or none. Agent shims hook
`verify-now` into session-idle events; a local web dashboard streams live
progress at `127.0.0.1:4321`.

```bash
npx vibetracker init        # scaffold ROADMAP.md + .vibetracker/config.json
npx vibetracker status      # print the scoreboard
npx vibetracker verify-now  # run configured gates, update state
npx vibetracker serve       # live dashboard
npx vibetracker export      # badge.svg + report.html
```

Requires Node >= 20. Zero API keys — deterministic gates only.

Docs: <https://github.com/shantanugopale/vibetracker> · License: MIT
