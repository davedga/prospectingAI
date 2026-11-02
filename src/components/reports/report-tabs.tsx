"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Thin client shell so the (server-rendered) report sections can live under
// switchable tabs. Section content is passed in as already-rendered nodes.
export function ReportTabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <Tabs value={active} onValueChange={setActive}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key} className="space-y-6 pt-5">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
