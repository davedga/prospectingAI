import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <p className="text-lg font-semibold">Page not found</p>
      <p className="text-sm text-neutral-500">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/" className="text-sm underline underline-offset-2">
        Back to dashboard
      </Link>
    </div>
  );
}
