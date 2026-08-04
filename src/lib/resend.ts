import "server-only";
import { Resend } from "resend";

// Resend's constructor throws immediately if the key is falsy, which would crash
// module evaluation (and every route importing it) before we get a chance to fail
// gracefully at send time. Fall back to a placeholder so the real failure surfaces
// as an API error from `.emails.send()` instead.
export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export const OUTREACH_FROM_ADDRESS = process.env.ADMIN_EMAIL ?? "";
