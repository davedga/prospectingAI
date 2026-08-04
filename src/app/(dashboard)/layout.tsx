import { auth, signOut } from "@/auth";
import { SidebarNav } from "@/components/sidebar-nav";
import { Button } from "@/components/ui/button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-neutral-200 bg-white px-3 py-4">
        <div>
          <div className="px-3 pb-4">
            <p className="text-sm font-semibold tracking-tight">
              DGA Prospecting
            </p>
            <p className="text-xs text-neutral-500">TikTok Shop pipeline</p>
          </div>
          <SidebarNav />
        </div>
        <div className="space-y-2 px-3">
          <p className="truncate text-xs text-neutral-500">
            {session?.user?.email}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full"
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
