const companyChains = new Map<number, Promise<unknown>>()
let sourcingChain: Promise<unknown> = Promise.resolve()

export async function withCompanyLock<T>(
  companyId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = companyChains.get(companyId) ?? Promise.resolve()
  const run = prev.then(
    () => fn(),
    () => fn(),
  )
  companyChains.set(
    companyId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

export async function withSourcingLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = sourcingChain.then(
    () => fn(),
    () => fn(),
  )
  sourcingChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
