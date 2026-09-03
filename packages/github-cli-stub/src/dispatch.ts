/*
 * Dispatch for a fake `gh`, where the default answer is a refusal.
 *
 * A double's fall-through is an answer. Exit 0 with empty output does not read
 * as "I don't know" — it reads as "there is nothing here", and an agent acts on
 * it: an empty template, no dependent pull requests, no review comments. Every
 * assertion about what it *did* call still passes, so the suite reports success
 * for a run that deserved to fail. That is the worst outcome available to a
 * test double, and it is the one you get by forgetting a case.
 *
 * So there is no fall-through to forget. A call reaches an answer only through
 * a handler that claimed it; anything else is refused, loudly, naming the
 * command so the author knows what to model.
 *
 * The dispatch returns an outcome rather than writing and exiting. That keeps
 * it testable in-process, and it is also forced: a library module gets no
 * entry-point exemption from `unicorn/no-process-exit`, which the shared ESLint
 * config grants only under `bin/` and `scripts/`. The executable that calls
 * this does the writing and the exiting.
 */

/**
 * Exit status for a call the double cannot answer. Any non-zero status would
 * do; 1 is what gh uses for an ordinary failure.
 */
const refusedExit = 1;

/**
 * A `gh` invocation, as the double receives it.
 */
export interface StubCall {
  readonly argv: readonly string[];
  readonly stdin: string;
}

/**
 * What a handler decided. Omitted fields mean "nothing on that stream" and, for
 * the status, success.
 */
export interface StubResponse {
  readonly code?: number;
  readonly stderr?: string;
  readonly stdout?: string;
}

/**
 * One canned command. `name` appears in nothing the agent sees — it is there
 * for the author reading a refusal or a stack trace.
 */
export interface StubHandler {
  readonly matches: (call: StubCall) => boolean;
  readonly name: string;
  readonly respond: (call: StubCall) => StubResponse;
}

/**
 * The complete result of a call, ready for the executable to emit.
 */
export interface StubOutcome {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Error marking a call the double will not answer.
 *
 * Thrown rather than returned because it is raised deep inside a handler —
 * `pick` hits an unmodelled field several calls down — and every frame between
 * there and here would otherwise have to thread the failure back by hand.
 */
export class UnmodelledCall extends Error {}

/**
 * Refuses the call in progress, naming what was not canned.
 */
export const unmodelled = (what: string): UnmodelledCall =>
  new UnmodelledCall(what);

/**
 * The refusal an unanswerable call produces.
 *
 * It names the command verbatim, because the author's next move is to model
 * exactly that call, and it says so — a bare non-zero exit would be read as the
 * command legitimately failing.
 */
const refusal = (call: StubCall, what: string): StubOutcome => ({
  code: refusedExit,
  stderr:
    `gh-stub: ${what} for "gh ${call.argv.join(' ')}". ` +
    'Model it rather than letting the call return empty success.\n',
  stdout: '',
});

/**
 * Answers `call` with the first handler that claims it, or refuses.
 *
 * First match rather than best match: the handlers are an ordered list the
 * author controls, and order is how overlapping patterns are resolved — a
 * specific command before the general one it is a substring of.
 */
export const dispatch = (
  call: StubCall,
  handlers: readonly StubHandler[],
): StubOutcome => {
  const handler = handlers.find(candidate => candidate.matches(call));
  if (handler === undefined) return refusal(call, 'no canned response');

  try {
    const response = handler.respond(call);
    return {
      code: response.code ?? 0,
      stderr: response.stderr ?? '',
      stdout: response.stdout ?? '',
    };
  } catch (error) {
    if (error instanceof UnmodelledCall) return refusal(call, error.message);
    throw error;
  }
};
