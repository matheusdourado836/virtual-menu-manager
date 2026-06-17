import { z } from "zod";

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
  customerName: z.string().min(2),
  customerPhone: z.string().optional(),
  paymentMethod: paymentMethodSchema,
  observation: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
        observation: z.string().max(300).optional(),
        selectedOptions: z.array(
          z.object({
            groupId: z.string().min(1),
            choiceId: z.string().min(1),
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
