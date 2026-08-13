import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BulkImportBox } from "@/components/exclusions/bulk-import-box";
import { addExcludedBrand, removeExcludedBrand } from "./actions";

const PAGE_SIZE = 200;

export default async function ExclusionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  const where = query
    ? { name: { contains: query, mode: "insensitive" as const } }
    : undefined;

  const [brands, totalCount] = await Promise.all([
    prisma.excludedBrand.findMany({
      where,
      orderBy: { addedAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.excludedBrand.count(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Exclusions</h1>
        <p className="text-sm text-neutral-500">
          Brands already contacted or off-limits — checked (fuzzy,
          case-insensitive) before any company can be selected out of
          Discovery. If you prospect a brand manually, outside the app, add
          it here too so Discovery never re-suggests it.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Add a brand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addExcludedBrand} className="flex gap-2">
              <Input name="name" placeholder="Brand name" required />
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Bulk import
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BulkImportBox />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-sm font-semibold">
              Excluded brands ({totalCount.toLocaleString()})
            </CardTitle>
            <form className="flex gap-2">
              <Input
                name="q"
                placeholder="Search by name..."
                defaultValue={query ?? ""}
                className="w-64"
              />
              <Button type="submit" variant="outline" size="sm">
                Search
              </Button>
            </form>
          </div>
          {query && (
            <p className="text-xs text-neutral-500">
              Showing matches for &quot;{query}&quot; (up to {PAGE_SIZE}).
            </p>
          )}
          {!query && totalCount > PAGE_SIZE && (
            <p className="text-xs text-neutral-500">
              Showing the {PAGE_SIZE} most recently added — search to find a
              specific brand across all {totalCount.toLocaleString()}.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {query ? "No matches." : "No excluded brands yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((brand) => (
                  <TableRow key={brand.id}>
                    <TableCell className="font-medium">
                      {brand.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{brand.source}</Badge>
                    </TableCell>
                    <TableCell className="text-neutral-500">
                      {brand.addedAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <form
                        action={async () => {
                          "use server";
                          await removeExcludedBrand(brand.id);
                        }}
                      >
                        <Button type="submit" variant="ghost" size="sm">
                          Remove
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
