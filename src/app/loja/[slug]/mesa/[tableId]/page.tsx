import { PublicMenu } from "@/components/public-menu/PublicMenu";

interface TablePageProps {
  params: Promise<{
    slug: string;
    tableId: string;
  }>;
}

export default async function TablePage({ params }: TablePageProps) {
  const { slug, tableId } = await params;
  return <PublicMenu slug={slug} tableId={tableId} />;
}
