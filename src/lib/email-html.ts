function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Converts a plain-text email body (paragraphs separated by blank lines)
// into simple HTML paragraphs, then appends a pre-built HTML signature.
export function bodyToHtml(text: string, signatureHtml?: string | null) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const signature = signatureHtml
    ? `<div style="margin-top:16px;">${signatureHtml}</div>`
    : "";

  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000;">${paragraphs}${signature}</div>`;
}
