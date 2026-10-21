export function helpText(): string {
  return [
    "vibetracker - track your vibe-coding progress",
    "",
    "Usage: vibetracker <command> [options]",
    "",
    "Commands:",
    "  init          scaffold ROADMAP.md, .vibetracker/config.json, install agent shims",
    "  status        print the roadmap scoreboard from current state",
    "  verify-now    run configured quality gates and update state",
    "  watch         audit automatically on every new commit",
    "  release       write .vibetracker/report.json release snapshot",
    "",
    "Options:",
    "  --quiet        suppress detailed output",
    "  --interval <ms>  watch polling interval (default 2000)",
    "  --skip-hooks   init: skip agent shim installation",
    "  -h, --help     show this help",
  ].join("\n")
}
