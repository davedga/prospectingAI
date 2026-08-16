export type Deadline = {
  expired: () => boolean;
  remainingMs: () => number;
};

// Wall-clock budget threaded through every stage of the automation cycle
// so a slow run stops itself cleanly (leaving the rest for the next
// invocation) instead of getting hard-killed mid-write by Vercel's
// function timeout.
export function createDeadline(totalMs: number): Deadline {
  const end = Date.now() + totalMs;
  return {
    expired: () => Date.now() >= end,
    remainingMs: () => Math.max(0, end - Date.now()),
  };
}
