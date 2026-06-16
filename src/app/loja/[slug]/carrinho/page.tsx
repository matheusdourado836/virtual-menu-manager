import { CartPage } from "@/components/cart-page/CartPage";

interface StoreCartPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function StoreCartPage({ params }: StoreCartPageProps) {
  const { slug } = await params;
  return <CartPage slug={slug} />;
}
