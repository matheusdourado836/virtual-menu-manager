import { PublicMenu } from "@/components/public-menu/PublicMenu";

interface StorePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function StorePage({ params }: StorePageProps) {
  const { slug } = await params;
  return <PublicMenu slug={slug} />;
}
