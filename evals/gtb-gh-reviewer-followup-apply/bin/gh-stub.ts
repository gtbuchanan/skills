#!/usr/bin/env node
/*
 * Fake `gh` for this write-path eval. It never touches the
 * network: it appends the invocation (argv) as a JSON line to $STUB_LOG so the
 * checker can assert exactly which GitHub calls the skill made, and returns
 * canned JSON so the skill can proceed.
 *
 * Reached as `gh`: the runner installs a wrapper into STUB_BINDIR, at the front
 * of the eval PATH, that execs this file. The real gh CLI is never reachable
 * from a suite.
 *
 * Failure injection: any invocation whose args contain the token FAIL exits
 * non-zero with an error, so a fixture can verify the skill reports the failure
 * instead of claiming success.
 */
import { joined, logCall, writeJson } from '@gtbuchanan/agent-skills-harness/stub';

logCall('gh');

if (joined.includes('FAIL')) {
  process.stderr.write('gh: GraphQL: Could not resolve to a node (HTTP 422)\n');
  process.exit(1);
}

/*
 * `unresolveReviewThread` is checked before `resolveReviewThread` because the
 * latter is a substring of the former — a plain `includes('resolveReviewThread')`
 * would otherwise swallow every unresolve call.
 */
if (joined.includes('unresolveReviewThread')) {
  const threadId =
    /threadId=(?<threadId>\S+)/v.exec(joined)?.groups?.['threadId'] ?? '';
  writeJson({
    data: {
      unresolveReviewThread: { thread: { id: threadId, isResolved: false } },
    },
  });
} else if (joined.includes('resolveReviewThread')) {
  const threadId =
    /threadId=(?<threadId>\S+)/v.exec(joined)?.groups?.['threadId'] ?? '';
  writeJson({
    data: { resolveReviewThread: { thread: { id: threadId, isResolved: true } } },
  });
} else if (/comments\/\d+\/reactions/v.test(joined)) {
  const id =
    /comments\/(?<id>\d+)\/reactions/v.exec(joined)?.groups?.['id'] ?? '0';
  writeJson({ content: 'rocket', id: Number(id) + 1 });
} else if (/comments\/\d+\/replies/v.test(joined)) {
  const id =
    /comments\/(?<id>\d+)\/replies/v.exec(joined)?.groups?.['id'] ?? '0';
  writeJson({
    html_url: `https://example.test/pull/42#discussion_r${id}`,
    id: Number(id) + 1,
  });
} else if (joined.includes('api user')) {
  writeJson({ login: 'reviewer' });
} else if (joined.includes('repo view')) {
  writeJson({ nameWithOwner: 'acme/widgets' });
} else {
  writeJson({});
}

process.exit(0);
