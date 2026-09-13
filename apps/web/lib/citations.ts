/**
 * Split an answer into prose and citation markers, so each "[3]" can render as
 * a link to the source it names rather than as literal brackets.
 *
 * Only ids present in `known` become markers. The API already strips invented
 * citations, but the page should not depend on that to avoid rendering a link
 * that goes nowhere.
 */
export type AnswerPart = { type: "text"; value: string } | { type: "cite"; id: number };

export function splitCitations(answer: string, known: Iterable<number>): AnswerPart[] {
  const ids = new Set(known);
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const id = Number(match[1]);
    const at = match.index ?? 0;
    if (at > last) parts.push({ type: "text", value: answer.slice(last, at) });
    if (ids.has(id)) parts.push({ type: "cite", id });
    last = at + match[0].length;
  }
  if (last < answer.length) parts.push({ type: "text", value: answer.slice(last) });
  return parts;
}
