import { AdminShell } from "@/components/admin-shell/AdminShell";

interface StoreAdminPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function StoreAdminPage({ params }: StoreAdminPageProps) {
  const { slug } = await params;
  return <AdminShell slug={slug} />;
}
