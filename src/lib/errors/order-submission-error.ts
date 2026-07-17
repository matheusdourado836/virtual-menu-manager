import * as Sentry from "@sentry/nextjs";
import type { CartReconciliationChange } from "@/features/cart/cart-utils";
import { formatCurrency } from "@/lib/utils/money";
import type { PaymentMethod } from "@/types/menu";

interface ErrorLike {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

interface OrderFailureContext {
  storeId: string;
  storeSlug: string;
  tableId?: string;
  paymentMethod: PaymentMethod;
  itemIds: string[];
  unitsCount: number;
  selectedOptionsCount: number;
  hasCustomerPhone: boolean;
  hasObservation: boolean;
}

interface CartReconciliationContext {
  storeId: string;
  storeSlug: string;
  tableId?: string;
}

interface OrderFailureDescription {
  code: string;
  message: string;
  isExpected: boolean;
  supportCode?: string;
  validationFields: string[];
  reason?: string;
  userMessage?: string;
  itemId?: string;
  itemName?: string;
  groupId?: string;
  groupName?: string;
  choiceId?: string;
  choiceName?: string;
  previousPrice?: number;
  currentPrice?: number;
}

interface SanitizedErrorDetails {
  supportCode?: string;
  validationFields: string[];
  reason?: string;
  userMessage?: string;
  itemId?: string;
  itemName?: string;
  groupId?: string;
  groupName?: string;
  choiceId?: string;
  choiceName?: string;
  previousPrice?: number;
  currentPrice?: number;
}

const serverMessageCodes = new Set([
  "functions/already-exists",
  "functions/failed-precondition",
  "functions/invalid-argument",
  "functions/not-found",
  "functions/out-of-range",
]);

const expectedFailureCodes = new Set([
  "functions/already-exists",
  "functions/cancelled",
  "functions/failed-precondition",
  "functions/not-found",
  "functions/out-of-range",
]);

const asErrorLike = (error: unknown): ErrorLike =>
  error && typeof error === "object" ? error as ErrorLike : {};

const getErrorCode = (error: unknown) => {
  const code = asErrorLike(error).code;
  return typeof code === "string" && code ? code : "unknown";
};

const getServerMessage = (error: unknown, code: string) => {
  if (!serverMessageCodes.has(code)) return "";

  const message = asErrorLike(error).message;
  if (typeof message !== "string") return "";

  const trimmedMessage = message.trim();
  const isGenericSdkMessage = !trimmedMessage
    || trimmedMessage.length > 300
    || /^(firebase|internal|unknown|invalid argument|failed precondition)/iu.test(trimmedMessage)
    || trimmedMessage.includes(`(${code})`);

  return isGenericSdkMessage ? "" : trimmedMessage;
};

const sanitizeDetailText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return undefined;

  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
};

const sanitizePrice = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const getSanitizedDetails = (error: unknown): SanitizedErrorDetails => {
  const details = asErrorLike(error).details;

  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { validationFields: [] };
  }

  const rawDetails = details as Record<string, unknown>;
  const rawValidationIssues = rawDetails.validationIssues;
  const supportCode = sanitizeDetailText(rawDetails.supportCode, 32);
  const validationFields = Array.isArray(rawValidationIssues)
    ? rawValidationIssues
      .map((issue) => issue && typeof issue === "object" ? (issue as { field?: unknown }).field : undefined)
      .filter((field): field is string => typeof field === "string")
      .slice(0, 20)
    : [];

  return {
    supportCode,
    validationFields,
    reason: sanitizeDetailText(rawDetails.reason, 64),
    userMessage: sanitizeDetailText(rawDetails.userMessage, 300),
    itemId: sanitizeDetailText(rawDetails.itemId, 160),
    itemName: sanitizeDetailText(rawDetails.itemName, 160),
    groupId: sanitizeDetailText(rawDetails.groupId, 160),
    groupName: sanitizeDetailText(rawDetails.groupName, 160),
    choiceId: sanitizeDetailText(rawDetails.choiceId, 160),
    choiceName: sanitizeDetailText(rawDetails.choiceName, 160),
    previousPrice: sanitizePrice(rawDetails.previousPrice),
    currentPrice: sanitizePrice(rawDetails.currentPrice),
  };
};

const getTranslatedMessage = (error: unknown, code: string, details: SanitizedErrorDetails) => {
  if (serverMessageCodes.has(code) && details.userMessage) return details.userMessage;

  if (code === "validation/invalid-order" || code === "functions/invalid-argument") {
    if (details.validationFields.some((field) => field === "customerName")) {
      return "Confira o nome informado antes de enviar o pedido.";
    }

    if (details.validationFields.some((field) => field.endsWith(".quantity"))) {
      return "A quantidade de um dos itens é inválida. Confira o carrinho antes de continuar.";
    }

    if (details.validationFields.some((field) => field.endsWith(".observation") || field === "observation")) {
      return "Uma das observações ultrapassa o tamanho permitido. Revise o texto antes de continuar.";
    }

    if (details.validationFields.some((field) => field.includes("selectedOptions"))) {
      return "As opções de um dos itens não são mais válidas. Volte ao cardápio e revise esse item.";
    }

    if (details.validationFields.some((field) => field === "paymentMethod")) {
      return "Escolha novamente a forma de pagamento antes de continuar.";
    }
  }

  if (code === "functions/failed-precondition") {
    if (details.reason === "additional_unavailable" && details.choiceName) {
      return `O adicional ${details.choiceName} não está mais disponível.`;
    }

    if (details.reason === "additional_removed" && details.itemName) {
      return `Um adicional de ${details.itemName} não está mais disponível. Revise esse item antes de continuar.`;
    }

    if (details.reason === "item_unavailable" && details.itemName) {
      return `O item ${details.itemName} não está mais disponível. Remova-o do carrinho para continuar.`;
    }

    if (details.reason === "options_group_changed" && details.itemName) {
      return `As opções de ${details.itemName} foram atualizadas. Revise esse item antes de continuar.`;
    }

    if (details.reason === "item_price_changed" && details.itemName && details.currentPrice !== undefined) {
      return `O preço de ${details.itemName} foi atualizado para ${formatCurrency(details.currentPrice)}.`;
    }

    if (details.reason === "additional_price_changed" && details.choiceName && details.currentPrice !== undefined) {
      return `O preço do adicional ${details.choiceName} foi atualizado para ${formatCurrency(details.currentPrice)}.`;
    }
  }

  const serverMessage = getServerMessage(error, code);
  if (serverMessage) return serverMessage;

  switch (code) {
    case "validation/invalid-order":
    case "functions/invalid-argument":
      return "Revise os dados e os itens do pedido antes de tentar novamente.";
    case "functions/failed-precondition":
      return "O cardápio ou a disponibilidade da loja mudou. Volte ao cardápio, revise o pedido e tente novamente.";
    case "functions/not-found":
      return "Um item do pedido não está mais disponível. Volte ao cardápio e revise o carrinho.";
    case "functions/already-exists":
      return "Este pedido já foi registrado. Verifique o acompanhamento antes de tentar novamente.";
    case "functions/cancelled":
      return "O envio do pedido foi cancelado. Tente novamente.";
    case "functions/deadline-exceeded":
      return "O envio demorou mais que o esperado. Verifique sua conexão e confirme se o pedido apareceu antes de tentar novamente.";
    case "functions/resource-exhausted":
      return "O serviço está muito ocupado no momento. Aguarde alguns segundos e tente novamente.";
    case "functions/unavailable":
      return "Não foi possível conectar ao serviço de pedidos. Verifique sua internet e tente novamente.";
    case "functions/permission-denied":
    case "functions/unauthenticated":
      return "Não foi possível autorizar o envio deste pedido. Atualize a página e tente novamente.";
    case "functions/aborted":
      return "O pedido encontrou uma atualização simultânea. Aguarde um instante e tente novamente.";
    default:
      return "Ocorreu uma falha interna ao registrar o pedido. Tente novamente; se continuar, informe o código de suporte ao estabelecimento.";
  }
};

export const describeOrderSubmissionError = (error: unknown): OrderFailureDescription => {
  const code = getErrorCode(error);
  const details = getSanitizedDetails(error);

  return {
    code,
    message: getTranslatedMessage(error, code, details),
    isExpected: expectedFailureCodes.has(code),
    ...details,
  };
};

export const reportOrderSubmissionError = (error: unknown, context: OrderFailureContext) => {
  const description = describeOrderSubmissionError(error);
  const reportableError = error instanceof Error ? error : new Error("Falha desconhecida ao criar pedido");
  const eventId = Sentry.captureException(reportableError, {
    level: description.isExpected ? "warning" : "error",
    fingerprint: ["checkout-create-order", description.code],
    tags: {
      feature: "checkout",
      operation: "create_order",
      error_code: description.code,
      failure_reason: description.reason || "unknown",
      store_id: context.storeId,
      store_slug: context.storeSlug,
      order_mode: context.tableId ? "table" : "pickup",
      payment_method: context.paymentMethod,
    },
    contexts: {
      order_attempt: {
        tableId: context.tableId || null,
        itemIds: context.itemIds,
        itemCount: context.itemIds.length,
        unitsCount: context.unitsCount,
        selectedOptionsCount: context.selectedOptionsCount,
        hasCustomerPhone: context.hasCustomerPhone,
        hasObservation: context.hasObservation,
      },
      validation: {
        fields: description.validationFields,
        supportCode: description.supportCode || null,
      },
      menu_change: {
        reason: description.reason || null,
        itemId: description.itemId || null,
        itemName: description.itemName || null,
        groupId: description.groupId || null,
        groupName: description.groupName || null,
        choiceId: description.choiceId || null,
        choiceName: description.choiceName || null,
        previousPrice: description.previousPrice ?? null,
        currentPrice: description.currentPrice ?? null,
      },
    },
  });

  return { ...description, eventId };
};

export const reportCartReconciliation = (
  changes: CartReconciliationChange[],
  context: CartReconciliationContext,
) => {
  if (!changes.length) return "";

  const changeTypes = [...new Set(changes.map((change) => change.type))];
  const itemIds = [...new Set(changes.map((change) => change.itemId))];
  const choiceIds = [
    ...new Set(
      changes.flatMap((change) => "choiceId" in change ? [change.choiceId] : []),
    ),
  ];

  return Sentry.captureMessage("Carrinho atualizado após mudança no cardápio", {
    level: "warning",
    fingerprint: ["checkout-cart-reconciliation", ...changeTypes.sort()],
    tags: {
      feature: "checkout",
      operation: "reconcile_cart",
      store_id: context.storeId,
      store_slug: context.storeSlug,
      order_mode: context.tableId ? "table" : "pickup",
    },
    contexts: {
      cart_reconciliation: {
        changeTypes,
        changesCount: changes.length,
        itemIds,
        choiceIds,
        tableId: context.tableId || null,
      },
    },
  });
};
