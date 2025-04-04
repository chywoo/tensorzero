import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Code } from "~/components/ui/code";

interface TagsTableProps {
  tags: Record<string, string>;
}

export function TagsTable({ tags }: TagsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Key</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.keys(tags).length === 0 ? (
          <TableRow className="hover:bg-bg-primary">
            <TableCell
              colSpan={2}
              className="px-3 py-8 text-center text-fg-muted"
            >
              No tags found.
            </TableCell>
          </TableRow>
        ) : (
          Object.entries(tags).map(([key, value]) => (
            <TableRow key={key}>
              <TableCell>
                <Code>{key}</Code>
              </TableCell>
              <TableCell>
                <Code>{value}</Code>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
