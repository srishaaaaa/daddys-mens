/* Server actions report expected problems ("That number is already a customer") as a result instead of
   throwing: in production, Next hides the message of a thrown error, so people would only see a generic one. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Server side: run something and turn a thrown Error into a result the screen can show. */
export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Client side: get the value back, or throw an Error carrying the real message. */
export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
