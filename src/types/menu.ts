export type OrderStatus =
  | "received"
  | "accepted"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "pay_on_pickup" | "pix_on_pickup" | "card_on_pickup" | "cash_on_pickup";
export type PaymentStatus = "pending" | "paid" | "cancelled";
export type StoreRole = "owner" | "admin" | "kitchen" | "attendant";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  description: string;
  phone?: string;
  address?: string;
  openingHours?: string;
  logoUrl?: string;
  owners: string[];
  adminUsers: string[];
  isActive: boolean;
  isAcceptingOrders: boolean;
  pausedMessage: string;
  estimatedPrepMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreTheme {
  id: string;
  storeId: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  fontFamily: string;
  borderRadius: number;
  logoUrl?: string;
  bannerUrl?: string;
  visualStyle: string;
  updatedAt: string;
}

export interface Table {
  id: string;
  label: string;
  code: string;
  qrCodeUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  order: number;
  isActive: boolean;
}

export interface OptionChoice {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  needsReview?: boolean;
}

export interface OptionGroup {
  id: string;
  name: string;
  minSelected: number;
  maxSelected: number;
  choices: OptionChoice[];
  isRequired: boolean;
}

export interface MenuItem {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  order: number;
  optionsGroups: OptionGroup[];
  createdAt: string;
  updatedAt: string;
  needsReview?: boolean;
  reviewNote?: string;
}

export interface CartSelectedOption {
  groupId: string;
  groupName: string;
  choiceId: string;
  choiceName: string;
  price: number;
}

export interface CartLine {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  observation?: string;
  selectedOptions: CartSelectedOption[];
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  observation?: string;
  selectedOptions: CartSelectedOption[];
  lineTotal: number;
}

export interface Order {
  id: string;
  storeId: string;
  code: string;
  tableId?: string;
  tableLabel?: string;
  customerName: string;
  customerPhone?: string;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  observation?: string;
  items: OrderItem[];
  subtotal: number;
  serviceFee: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface StoreBundle {
  store: Store;
  theme: StoreTheme;
  tables: Table[];
  categories: Category[];
  menuItems: MenuItem[];
}
