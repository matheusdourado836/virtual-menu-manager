import { z } from "zod";
import {
  MAX_CUSTOMER_NAME_LENGTH,
  MAX_ITEM_OBSERVATION_LENGTH,
  MAX_ORDER_ITEM_QUANTITY,
  MAX_ORDER_OBSERVATION_LENGTH,
  MIN_CUSTOMER_NAME_LENGTH,
} from "@/lib/constants/order";

export const orderStatusSchema = z.enum([
  "received",
  "accepted",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
]);

export const paymentMethodSchema = z.enum([
  "pay_on_pickup",
  "pix_on_pickup",
  "card_on_pickup",
  "cash_on_pickup",
]);

export const createOrderSchema = z.object({
  storeId: z.string().min(1),
  tableId: z.string().optional(),
  tableLabel: z.string().optional(),
  customerName: z.string().trim().min(MIN_CUSTOMER_NAME_LENGTH).max(MAX_CUSTOMER_NAME_LENGTH).optional(),
  customerPhone: z.string().optional(),
  paymentMethod: paymentMethodSchema,
  observation: z.string().max(MAX_ORDER_OBSERVATION_LENGTH).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        expectedUnitPrice: z.number().nonnegative().optional(),
        quantity: z.number().int().min(1).max(MAX_ORDER_ITEM_QUANTITY),
        observation: z.string().max(MAX_ITEM_OBSERVATION_LENGTH).optional(),
        selectedOptions: z.array(
          z.object({
            groupId: z.string().min(1),
            choiceId: z.string().min(1),
            expectedPrice: z.number().nonnegative().optional(),
          }),
        ),
      }),
    )
    .min(1),
});

export const updateOrderStatusSchema = z.object({
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  status: orderStatusSchema,
});

export type CreateOrderPayload = z.infer<typeof createOrderSchema>;
