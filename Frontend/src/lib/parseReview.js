export function parseReview(input) {
  const text = (input || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  const normalized = (s) => s
    .toLowerCase()
    .replace(/[`*_~>#:\-]/g, " ")
    .replace(/[❌✅✔✖️✖💡•▪–—\[]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let section = null;
  const out = { badCode: "", issues: [], recommendedFix: "", improvements: [], suggestions: [] };
  const blocks = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const norm = normalized(raw);

    if (/^\s*```/.test(raw)) {
      // Capture fenced blocks even if heading missing
      const start = i + 1;
      let end = start;
      while (end < lines.length && !/^\s*```/.test(lines[end])) end++;
      const code = lines.slice(start, end).join("\n").trim();
      if (section === 'badCode') {
        out.badCode = code;
      } else if (section === 'recommendedFix') {
        out.recommendedFix = code;
      } else {
        blocks.push(code);
      }
      i = end + 1;
      continue;
    }

    if (/(^|\s)bad code(\s|$)/.test(norm)) { section = 'badCode'; i++; continue; }
    if (/(^|\s)issues(\s|$)/.test(norm)) { section = 'issues'; i++; continue; }
    if (/recommended fix|correct code|fixed code|solution|refactored code/.test(norm)) { section = 'recommendedFix'; i++; continue; }
    if (/improvements?/.test(norm)) { section = 'improvements'; i++; continue; }
    if (/suggestions?/.test(norm)) { section = 'suggestions'; i++; continue; }

    // Collect bullets or paragraphs
    const cleaned = raw
      .replace(/^\s*[•\-\*\+\d+\.]+\s*/, "")
      .replace(/^\s*[❌✖️✖✅✔💡]\s*/, "")
      .trim();

    if (section === 'issues' && cleaned) {
      out.issues.push(cleaned);
    } else if (section === 'improvements' && cleaned) {
      out.improvements.push(cleaned);
    } else if (section === 'suggestions' && cleaned) {
      out.suggestions.push(cleaned);
    }

    i++;
  }

  // Fallback mapping if headings were missing
  if (!out.badCode && blocks.length > 0) out.badCode = blocks[0];
  if (!out.recommendedFix && blocks.length > 1) out.recommendedFix = blocks[1];

  return out;
}
