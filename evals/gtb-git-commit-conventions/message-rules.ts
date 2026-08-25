/*
 * The skill's message rules, as pure functions over a commit.
 *
 * Split from commit-check.ts along the only boundary that matters here: these
 * touch no repository and run no git, so each is decidable from a message and a
 * subject alone. What is left in the checker is the part that reads a real
 * repository and composes these per scenario.
 *
 * Each returns a list of problems rather than a boolean, so one run reports
 * every way a commit went wrong instead of the first.
 */

/**
 * One commit the agent wrote.
 */
export interface NewCommit {
  readonly files: readonly string[];
  readonly message: string;
  readonly sha: string;
  readonly subject: string;
}

/**
 * Which subject grammar a scenario's project calls for. `any` when the
 * scenario is not about the grammar at all.
 */
export type SubjectGrammar = 'any' | 'conventional' | 'plain';

/**
 * `type(scope)!: summary` — the Conventional Commits subject grammar.
 */
const conventional = /^[a-z]+(?:\([^\)]+\))?!?: \S/v;

/**
 * A trailer line, which is exempt from the body wrap: it is one logical line,
 * so folding a long URL would break the parse rather than tidy it.
 */
const trailerLine = /^[A-Za-z][\w\-]*: /v;

/**
 * Counts and measurements describing a *current* state, so they rot while the
 * commit claiming them cannot be edited.
 */
const volatileFigure =
  /\b\d+\s+(?:call sites?|commits?|files?|lines?|places?|tests?)\b/iv;

/**
 * A verification claim. CI reports this, and it is not knowable from the
 * message's own artifact, so it is the other half of the same problem.
 */
const verificationClaim = new RegExp(
  String.raw`\b(?:all|every|full|the whole)\b[^.]{1,40}` +
  String.raw`\b(?:checks?|suites?|tests?)\b[^.]{1,30}` +
  String.raw`\b(?:green|pass|passed|passes|passing|succeed|succeeds)\b`,
  'iv',
);

/**
 * A past or progressive opening word — a proxy for the imperative test, which
 * is why it is opt-in per scenario rather than universal.
 */
const nonImperative = /^\w+(?:ed|ing)$/iv;

const subjectLimit = 72;
const bodyLimit = 72;

/**
 * How much of a sha to show in a failure reason.
 */
const shaAbbrev = 8;

/**
 * A message has a body once it runs past the subject and its blank line.
 */
export const linesBeforeBody = 2;

/**
 * The subject form git itself writes for a revert.
 */
export const revertSubject = 'Revert "';

/**
 * A short label for a commit in a failure reason — a bare sha says nothing
 * about which commit went wrong.
 */
export const label = (commit: NewCommit): string =>
  `${commit.sha.slice(0, shaAbbrev)} "${commit.subject}"`;

export const short = (sha: string): string => sha.slice(0, shaAbbrev);

/**
 * Rules that hold for any commit in any repository.
 */
export const universalProblems = (commit: NewCommit): string[] => {
  const lines = commit.message.split('\n');
  /*
   * The wrap exemption belongs to the FINAL block only. Exempting every
   * trailer-shaped line would let a long `Note: …` mid-body escape the check,
   * and such a line is ordinary prose — nothing parses it as a trailer, so
   * nothing justifies letting it run long.
   */
  const lastBlank = lines.lastIndexOf('');
  const finalBlock = lastBlank === -1 ? lines.length : lastBlank + 1;
  const overlong = lines.filter(
    (line, index) =>
      index >= linesBeforeBody &&
      line.length > bodyLimit &&
      !(index >= finalBlock && trailerLine.test(line)),
  );

  return [
    ...(commit.subject.length > subjectLimit
      ? [
          `${label(commit)}: subject is ${String(commit.subject.length)} ` +
          `chars, over ${String(subjectLimit)}`,
        ]
      : []),
    ...(lines.length > 1 && lines[1] !== ''
      ? [`${label(commit)}: body is not separated by a blank line`]
      : []),
    ...(overlong.length > 0
      ? [
          `${label(commit)}: ${String(overlong.length)} body line(s) over ` +
          `${String(bodyLimit)} chars`,
        ]
      : []),
  ];
};

/**
 * The subject as a command: capitalized, no trailing period, not a past or
 * progressive tense.
 */
export const shapeProblems = (commit: NewCommit): string[] => {
  const { subject } = commit;
  const initial = subject.slice(0, 1);
  const first = subject.split(' ', 1)[0] ?? '';

  return [
    ...(subject !== '' && initial !== initial.toUpperCase()
      ? [`${label(commit)}: subject is not capitalized`]
      : []),
    ...(subject.endsWith('.')
      ? [`${label(commit)}: subject ends with a period`]
      : []),
    ...(nonImperative.test(first)
      ? [`${label(commit)}: subject opens with "${first}", not the imperative`]
      : []),
  ];
};

/**
 * Conventional Commits are off by default and adopted only where the project's
 * own tooling consumes them, so this fails in both directions.
 */
export const grammarProblems = (
  commit: NewCommit,
  grammar: SubjectGrammar,
): string[] => {
  const isMatch = conventional.test(commit.subject);
  if (grammar === 'conventional' && !isMatch) {
    return [
      `${label(commit)}: project uses Conventional Commits, subject has no ` +
      'type prefix',
    ];
  }
  if (grammar === 'plain' && isMatch) {
    return [
      `${label(commit)}: Conventional Commits prefix used in a project with ` +
      'no tooling that consumes it',
    ];
  }

  return [];
};

export const staleFactProblems = (commit: NewCommit): string[] => {
  const figure = volatileFigure.exec(commit.message);
  const claim = verificationClaim.exec(commit.message);

  return [
    ...(figure === null
      ? []
      : [`${label(commit)}: volatile figure "${figure[0]}"`]),
    ...(claim === null
      ? []
      : [`${label(commit)}: verification claim "${claim[0]}"`]),
  ];
};
