import type { Additional, Category, MenuItem, OptionGroup, Store, StoreBundle, StoreTheme, Table } from "@/types/menu";

const now = "2026-06-02T12:00:00.000Z";

export const cafeCariocaStore: Store = {
  id: "store_cafe_carioca",
  name: "Café Carioca",
  slug: "cafe-carioca",
  description: "Cardápio digital para lanches, cafés, sucos e pedidos rápidos na praça.",
  logoUrl: "/placeholder-logo.svg",
  openingHours: "Seg 09:00-17:00, Ter 09:00-17:00, Qua 09:00-17:00, Qui 09:00-17:00, Sex 09:00-17:00",
  owners: ["TODO_CONFIG_OWNER_UID"],
  adminUsers: ["TODO_CONFIG_ADMIN_UID"],
  isActive: true,
  isAcceptingOrders: true,
  pausedMessage: "Pedidos online pausados no momento. Procure o atendimento no balcão.",
  estimatedPrepMinutes: 18,
  createdAt: now,
  updatedAt: now,
};

export const cafeCariocaTheme: StoreTheme = {
  id: "default",
  storeId: cafeCariocaStore.id,
  primaryColor: "#8a1020",
  secondaryColor: "#1b7f79",
  accentColor: "#f2b84b",
  backgroundColor: "#f8f4ed",
  surfaceColor: "#fffdf8",
  textColor: "#261f1c",
  mutedTextColor: "#685d56",
  borderColor: "#e6ded2",
  fontFamily: "var(--font-geist-sans)",
  borderRadius: 8,
  logoUrl: "/placeholder-logo.svg",
  bannerUrl: "/placeholder-banner.svg",
  visualStyle: "warm-quick-service",
  updatedAt: now,
};

export const cafeCariocaTables: Table[] = [
  {
    id: "balcao",
    label: "Balcão",
    code: "BALCAO",
    qrCodeUrl: "https://pediu.vercel.app/loja/cafe-carioca/mesa/balcao",
    isActive: true,
    createdAt: now,
  },
  {
    id: "mesa-01",
    label: "Mesa 01",
    code: "MESA01",
    qrCodeUrl: "https://pediu.vercel.app/loja/cafe-carioca/mesa/mesa-01",
    isActive: true,
    createdAt: now,
  },
  {
    id: "mesa-02",
    label: "Mesa 02",
    code: "MESA02",
    qrCodeUrl: "https://pediu.vercel.app/loja/cafe-carioca/mesa/mesa-02",
    isActive: true,
    createdAt: now,
  },
];

export const cafeCariocaCategories: Category[] = [
  {
    id: "lanches",
    storeId: cafeCariocaStore.id,
    name: "Lanches",
    order: 1,
    isActive: true,
  },
  {
    id: "bebidas",
    storeId: cafeCariocaStore.id,
    name: "Bebidas",
    order: 2,
    isActive: true,
  },
];

export const cafeCariocaAdditionalGroup: OptionGroup = {
  id: "adicionais-200",
  name: "Adicionais",
  minSelected: 0,
  maxSelected: 8,
  isRequired: false,
  choices: [
    "Mussarela",
    "Requeijão",
    "Presunto",
    "Calabresa",
    "Bacon",
    "Ovo",
    "Carne de sol",
    "Frango Cremoso",
    "Tomate e Cebola",
  ].map((name) => ({
    id: name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-"),
    name,
    price: 2,
    isAvailable: true,
  })),
};

export const cafeCariocaAdditionals: Additional[] = cafeCariocaAdditionalGroup.choices.map((choice, index) => ({
  id: choice.id,
  storeId: cafeCariocaStore.id,
  name: choice.name,
  price: choice.price,
  isAvailable: choice.isAvailable,
  order: index + 1,
  createdAt: now,
  updatedAt: now,
}));

const snack = (
  id: string,
  name: string,
  price: number,
  description = "",
  order = 1,
): MenuItem => ({
  id,
  storeId: cafeCariocaStore.id,
  categoryId: "lanches",
  name,
  description,
  price,
  imageUrl: "/placeholder-item.svg",
  isAvailable: true,
  order,
  optionsGroups: [cafeCariocaAdditionalGroup],
  createdAt: now,
  updatedAt: now,
});

const drink = (
  id: string,
  name: string,
  price: number,
  description = "",
  order = 1,
): MenuItem => ({
  id,
  storeId: cafeCariocaStore.id,
  categoryId: "bebidas",
  name,
  description,
  price,
  imageUrl: "/placeholder-item.svg",
  isAvailable: true,
  order,
  optionsGroups: [],
  createdAt: now,
  updatedAt: now,
});

export const cafeCariocaMenuItems: MenuItem[] = [
  snack("cuscuz-calabresa", "Cuscuz com calabresa", 7, "", 1),
  snack("cuscuz-carne-sol", "Cuscuz com carne de sol", 15, "", 2),
  snack("tapioca-manteiga", "Tapioca na manteiga", 7, "", 3),
  snack("omelete", "Omelete", 15, "", 4),
  snack("pao-chapa", "Pão na chapa", 7, "Com manteiga", 5),
  snack("misto-quente", "Misto quente", 10, "Queijo e presunto", 6),
  snack("misto-completo", "Misto completo", 12, "Queijo, presunto e ovo", 7),
  snack("pao-queijo-90g", "Pão de queijo 90g", 4, "Unidade", 8),
  snack("sanduiche-natural-300g", "Sanduíche Natural 300g", 10, "Com maionese defumada", 9),
  snack("salgado", "Salgado", 7, "Sabores", 10),
  snack("bolo-ft", "Bolo ft", 6, "Milho e formigueiro", 11),
  snack("empada", "Empada", 7, "Sabores", 12),
  drink("suco-polpa-200ml", "Suco - polpa 200ml", 6, "Sabores", 1),
  drink("suco-polpa-300ml", "Suco - polpa 300ml", 7, "Sabores", 2),
  drink("cafe-pequeno", "Café pequeno", 2, "", 3),
  drink("cafe-leite-pequeno", "Café com leite pequeno", 2, "", 4),
  drink("cafe-grande", "Café grande", 4, "", 5),
  drink("cafe-leite-grande", "Café com leite grande", 4, "", 6),
  drink("agua", "Água", 4, "", 7),
  drink("agua-com-gas", "Água com gás", 5, "", 8),
];

export const cafeCariocaBundle: StoreBundle = {
  store: cafeCariocaStore,
  theme: cafeCariocaTheme,
  tables: cafeCariocaTables,
  categories: cafeCariocaCategories,
  additionals: cafeCariocaAdditionals,
  menuItems: cafeCariocaMenuItems,
};

export const seedBundles = [cafeCariocaBundle];
