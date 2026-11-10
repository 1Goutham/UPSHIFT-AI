/**
 * Approximate token count, with no tokenizer download (it runs in the
 * extension too). Calibrated against OpenAI's o200k tokenizer in tests; other
 * models tokenize differently, so the UI always shows it as approximate.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let n = 0;
  // Roughly how BPE pre-tokenizers split text: words (with a leading space), numbers, punctuation runs, whitespace runs.
  for (const m of text.matchAll(/ ?[A-Za-zÀ-ɏ]+| ?\d+| ?[^\sA-Za-z\dÀ-ɏ]+|\s+/g)) {
    const piece = m[0];
    const t = piece.trim();
    if (!t) {
      // Newlines usually merge; long indentation runs cost a little.
      n += piece.includes("\n") ? 1 : piece.length > 4 ? 1 : 0;
      continue;
    }
    if (/^\d+$/.test(t)) n += Math.ceil(t.length / 3);
    else if (/^[A-Za-zÀ-ɏ]+$/.test(t)) n += t.length <= 10 ? 1 : Math.ceil(t.length / 6); // common words up to ~10 letters are usually one token
    else n += t.length <= 3 ? 1 : Math.ceil(t.length / 3);
  }
  // Non-Latin scripts (CJK, etc.) are roughly a token per character or two.
  const other = text.match(/[^\x00-ɏ\s]/g)?.length ?? 0;
  return n + Math.ceil(other * 0.6);
}

/** "1.2k", "12k", "340". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return n < 10_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(n / 1000)}k`;
}
