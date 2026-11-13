/*
 * Who a request to the fake came from, carried in the token gh sends.
 *
 * HTTP carries no working directory and no argv, so the token is the one
 * channel from a gh call to the fake. It names the world the call is answered
 * from, and the call a refusal is reported against, so a refusal lands beside
 * the call that caused it rather than in the answer the agent reads.
 *
 * Encoded rather than joined with a separator, because argv may hold anything.
 *
 * Unsigned, because anything that reaches the fake's port can mint one. The
 * fake acts on nothing in it but the world key; the context is the host's,
 * handed back with each refusal for the host to check before acting on it.
 */
import * as v from 'valibot';

const CallerSchema = v.object({
  argv: v.array(v.string()),
  /**
   * Whatever the host attaches to a call to find it again, such as the run
   * that made it. The fake hands it back with a refusal and never reads it.
   */
  context: v.optional(v.string()),
  world: v.string(),
});

export type Caller = v.InferOutput<typeof CallerSchema>;

/**
 * How much of one argument the token carries. The token travels in a request
 * header, and argv only labels a refusal, so a long `--body` is cut short
 * rather than allowed to outgrow the server's header limit.
 */
const maxArgLength = 200;

const shortened = (arg: string): string =>
  arg.length > maxArgLength ? `${arg.slice(0, maxArgLength)}…` : arg;

export const callerToken = (caller: Caller): string =>
  Buffer.from(JSON.stringify({ ...caller, argv: caller.argv.map(shortened) }))
    .toString('base64url');

/**
 * The caller a token names, or `undefined` for one {@link callerToken} did not
 * mint.
 */
export const callerOf = (token: string): Caller | undefined => {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const parsed = v.safeParse(CallerSchema, decoded);
    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
};
