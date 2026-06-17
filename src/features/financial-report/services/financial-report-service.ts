import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Order } from "@/types/menu";

interface GetFinancialReportOrdersParams {
  storeId: string;
  start: Date;
  end: Date;
}

export const getFinancialReportOrders = async ({ storeId, start, end }: GetFinancialReportOrdersParams) => {
  const snapshot = await getDocs(
    query(
      collection(firestore, "stores", storeId, "orders"),
      where("createdAt", ">=", start.toISOString()),
      where("createdAt", "<=", end.toISOString()),
      orderBy("createdAt", "desc"),
    ),
  );

  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as Order);
};
