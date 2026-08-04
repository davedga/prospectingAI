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

export default async function ExclusionsPage() {
  const brands = await prisma.excludedBrand.findMany({
    orderBy: { addedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Exclusions</h1>
        <p className="text-sm text-neutral-500">
          Brands already contacted or off-limits. Checked (fuzzy,
          case-insensitive) before any company can be selected out of
          Discovery.
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
          <CardTitle className="text-sm font-semibold">
            Excluded brands ({brands.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No excluded brands yet.
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
