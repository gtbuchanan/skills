/*
 * Who a request to the fake came from, carried in the token gh sends.
 *
 * HTTP carries no working directory and no argv, so the token is the one
 * channel from the call to the fake. It names the world the call is answered
 * from, and the call and run a refusal is recorded against, so a refusal lands
 * beside the call that caused it rather than in the answer the agent reads.
 *
 * Encoded rather than joined with a separator, because argv may hold anything.
 *
 * Unsigned, because anything that reaches the fake's port can mint one. What
 * keeps that harmless is that a token names a run, never a path: the fake
 * finds the run's log itself, so a forged token can at most add a refusal to
 * some run's log. A run id is one path segment and nothing else.
 */
import * as v from 'valibot';

/**
 * A run id: one path segment, so the log it names stays in the log directory.
 */
const RunIdSchema = v.pipe(v.string(), v.regex(/^[\w\-]+$/v));

const CallerSchema = v.object({
  argv: v.array(v.string()),
  run: v.optional(RunIdSchema),
  world: v.string(),
});

export type Caller = v.InferOutput<typeof CallerSchema>;

export const callerToken = (caller: Caller): string =>
  Buffer.from(JSON.stringify(caller)).toString('base64url');

/**
 * The caller a token names, or `undefined` for one this module did not mint.
 */
export const callerOf = (token: string): Caller | undefined => {
  try {
    const parsed = v.safeParse(
      CallerSchema,
      JSON.parse(Buffer.from(token, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
};
