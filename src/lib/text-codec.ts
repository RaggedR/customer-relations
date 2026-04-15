/**
 * Shared Text Codec
 *
 * Escape/unescape and line-unfolding utilities shared by iCal and vCard
 * generators/parsers. Both RFC 5545 (iCalendar) and RFC 6350 (vCard) use
 * the same text encoding rules and continuation-line folding format.
 */

/** Escape text for iCal/vCard property values. */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Unescape iCal/vCard property values back to plain text. */
export function unescapeText(text: string): string {
  return text
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Unfold continuation lines. Both iCal and vCard fold long lines by
 * inserting a CRLF followed by a space or tab. This reverses that.
 */
export function unfoldLines(text: string): string[] {
  const raw = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of raw) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      }
    } else {
      lines.push(line);
    }
  }
  return lines;
}
