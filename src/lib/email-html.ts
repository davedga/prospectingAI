function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getAppUrl() {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

// Rewrites every href="..." in the HTML to route through the click-tracking
// redirect, preserving the original destination as a query param.
function wrapLinksForTracking(html: string, appUrl: string, emailId: string) {
  return html.replace(/href="([^"]+)"/g, (match, href: string) => {
    if (!/^https?:\/\//i.test(href)) return match;
    const tracked = `${appUrl}/api/track/click/${emailId}?u=${encodeURIComponent(href)}`;
    return `href="${tracked}"`;
  });
}

// Converts a plain-text email body (paragraphs separated by blank lines)
// into simple HTML paragraphs, appends a pre-built HTML signature, rewrites
// links for click tracking, and appends an open-tracking pixel — all
// skipped if APP_URL isn't configured or no emailId is given.
export function bodyToHtml(
  text: string,
  signatureHtml?: string | null,
  emailId?: string
) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const signature = signatureHtml
    ? `<div style="margin-top:16px;">${signatureHtml}</div>`
    : "";

  let html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000;">${paragraphs}${signature}</div>`;

  const appUrl = getAppUrl();
  if (appUrl && emailId) {
    html = wrapLinksForTracking(html, appUrl, emailId);
    html += `<img src="${appUrl}/api/track/open/${emailId}" width="1" height="1" alt="" style="display:none;" />`;
  }

  return html;
}
