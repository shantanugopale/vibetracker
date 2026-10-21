#!/usr/bin/env node
import { pathToFileURL } from "node:url"
import { VERSION } from "@vibetracker/core"

export function main(): void {
  console.log(`vibetracker ${VERSION}`)
}

const invoked = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false

if (invoked) {
  main()
}
