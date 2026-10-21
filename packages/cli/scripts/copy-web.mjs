import { cpSync, rmSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const webDir = path.join(cliDir, "dist", "web")
const srcDir = path.resolve(cliDir, "..", "dashboard", "dist")

if (!srcDir || !existsSync(srcDir)) {
  console.error(`dashboard build not found at ${srcDir}; run npm run build -w @vibetracker/dashboard first`)
  process.exit(1)
}
rmSync(webDir, { recursive: true, force: true })
cpSync(srcDir, webDir, { recursive: true })
console.log(`copied ${srcDir} -> ${webDir}`)
