import { CartPage } from "@/components/cart-page/CartPage";

interface TableCartPageProps {
  params: Promise<{
    slug: string;
    tableId: string;
  }>;
}

export default async function TableCartPage({ params }: TableCartPageProps) {
  const { slug, tableId } = await params;
  return <CartPage slug={slug} tableId={tableId} />;
}
