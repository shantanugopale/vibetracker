export type Captured<T> = {
  value: T
  logs: string[]
  errors: string[]
}

function sanitize(args: unknown[]): string {
  return args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a) ?? String(a)))
    .join(" ")
}

export async function captureConsole<T>(
  fn: () => Promise<T>,
): Promise<Captured<T>> {
  const logs: string[] = []
  const errors: string[] = []
  const patch = (sink: string[]) => (...args: unknown[]) => {
    sink.push(sanitize(args))
  }
  const originals = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  }
  console.log = patch(logs)
  console.info = patch(logs)
  console.debug = patch(logs)
  console.warn = patch(errors)
  console.error = patch(errors)
  try {
    const value = await fn()
    return { value, logs, errors }
  } finally {
    console.log = originals.log
    console.info = originals.info
    console.debug = originals.debug
    console.warn = originals.warn
    console.error = originals.error
  }
}
