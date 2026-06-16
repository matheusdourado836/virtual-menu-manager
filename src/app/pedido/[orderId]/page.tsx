import { OrderTracker } from "@/components/order-tracker/OrderTracker";

interface OrderPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { orderId } = await params;
  return <OrderTracker orderId={orderId} />;
}
