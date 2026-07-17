import * as admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

type SeedItem = {
  id: string;
  categoryId: "pratos" | "bebidas";
  name: string;
  description: string;
  price: number;
  order: number;
};

type SeedAdditional = {
  id: string;
  name: string;
  price: number;
  order: number;
};

const menuItems: SeedItem[] = [
  { id: "demo-hamburguer-artesanal", categoryId: "pratos", name: "Hambúrguer artesanal", description: "Pão brioche, carne de 160g, queijo, alface, tomate e molho da casa.", price: 28.9, order: 1 },
  { id: "demo-x-salada", categoryId: "pratos", name: "X-salada", description: "Pão, carne, queijo, presunto, alface, tomate e maionese.", price: 24.9, order: 2 },
  { id: "demo-frango-grelhado", categoryId: "pratos", name: "Frango grelhado", description: "Filé de frango com arroz, feijão, salada e batata frita.", price: 32.9, order: 3 },
  { id: "demo-parmegiana-carne", categoryId: "pratos", name: "Parmegiana de carne", description: "Bife empanado, molho de tomate, queijo, arroz e batata frita.", price: 38.9, order: 4 },
  { id: "demo-strogonoff-frango", categoryId: "pratos", name: "Strogonoff de frango", description: "Acompanha arroz branco e batata palha.", price: 31.9, order: 5 },
  { id: "demo-macarrao-bolonhesa", categoryId: "pratos", name: "Macarrão à bolonhesa", description: "Massa ao molho de tomate com carne moída e parmesão.", price: 29.9, order: 6 },
  { id: "demo-salada-caesar", categoryId: "pratos", name: "Salada Caesar", description: "Alface, frango grelhado, croutons, parmesão e molho Caesar.", price: 25.9, order: 7 },
  { id: "demo-batata-frita", categoryId: "pratos", name: "Porção de batata frita", description: "Batatas crocantes com molho da casa.", price: 19.9, order: 8 },
  { id: "demo-agua-mineral", categoryId: "bebidas", name: "Água mineral", description: "Garrafa 500ml.", price: 4, order: 1 },
  { id: "demo-agua-com-gas", categoryId: "bebidas", name: "Água com gás", description: "Garrafa 500ml.", price: 5, order: 2 },
  { id: "demo-refrigerante-lata", categoryId: "bebidas", name: "Refrigerante lata", description: "Consulte os sabores disponíveis.", price: 7, order: 3 },
  { id: "demo-suco-laranja", categoryId: "bebidas", name: "Suco de laranja", description: "Suco natural, copo 400ml.", price: 9, order: 4 },
  { id: "demo-limonada", categoryId: "bebidas", name: "Limonada", description: "Limonada natural, copo 400ml.", price: 8, order: 5 },
  { id: "demo-cha-gelado", categoryId: "bebidas", name: "Chá gelado", description: "Chá gelado de limão, copo 400ml.", price: 8, order: 6 },
  { id: "demo-cerveja-long-neck", categoryId: "bebidas", name: "Cerveja long neck", description: "Consulte as opções disponíveis.", price: 12, order: 7 },
  { id: "demo-cafe-expresso", categoryId: "bebidas", name: "Café expresso", description: "Café expresso 50ml.", price: 5, order: 8 },
];

const additionals: SeedAdditional[] = [
  { id: "demo-queijo-mussarela", name: "Queijo mussarela", price: 3, order: 1 },
  { id: "demo-queijo-cheddar", name: "Queijo cheddar", price: 4, order: 2 },
  { id: "demo-requeijao-cremoso", name: "Requeijão cremoso", price: 4, order: 3 },
  { id: "demo-presunto", name: "Presunto", price: 3, order: 4 },
  { id: "demo-bacon", name: "Bacon", price: 5, order: 5 },
  { id: "demo-ovo", name: "Ovo", price: 2.5, order: 6 },
  { id: "demo-calabresa", name: "Calabresa", price: 4.5, order: 7 },
  { id: "demo-frango-desfiado", name: "Frango desfiado", price: 5, order: 8 },
  { id: "demo-hamburguer-extra", name: "Hambúrguer extra", price: 8, order: 9 },
  { id: "demo-cebola-caramelizada", name: "Cebola caramelizada", price: 3, order: 10 },
  { id: "demo-arroz", name: "Porção de arroz", price: 5, order: 11 },
  { id: "demo-feijao", name: "Porção de feijão", price: 5, order: 12 },
  { id: "demo-batata-frita-adicional", name: "Batata frita", price: 7, order: 13 },
  { id: "demo-salada", name: "Salada", price: 5, order: 14 },
  { id: "demo-farofa", name: "Farofa", price: 3, order: 15 },
  { id: "demo-molho-da-casa", name: "Molho da casa", price: 2, order: 16 },
  { id: "demo-molho-barbecue", name: "Molho barbecue", price: 2, order: 17 },
  { id: "demo-maionese-temperada", name: "Maionese temperada", price: 2, order: 18 },
  { id: "demo-molho-pimenta", name: "Molho de pimenta", price: 1.5, order: 19 },
  { id: "demo-gelo", name: "Gelo", price: 0, order: 20 },
  { id: "demo-limao", name: "Limão", price: 0, order: 21 },
  { id: "demo-leite", name: "Leite", price: 2, order: 22 },
  { id: "demo-chantilly", name: "Chantilly", price: 3, order: 23 },
  { id: "demo-dose-expresso", name: "Dose extra de café", price: 4, order: 24 },
];

const loadEnvFile = (path: string) => {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^["']|["']$/gu, "");
    if (!value.startsWith("TODO_CONFIG")) process.env[key] ??= value;
  }
};

loadEnvFile(".env");
loadEnvFile(".env.local");

const fail = (message: string): never => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

const args = process.argv.slice(2);
const knownFlags = new Set(["--apply", "--overwrite", "--help"]);
const unknownFlag = args.find((argument) => argument.startsWith("--") && !knownFlags.has(argument));

if (unknownFlag) fail(`Opção desconhecida: ${unknownFlag}`);

if (args.includes("--help")) {
  console.log([
    "Popula Pratos, Bebidas e Adicionais de um restaurante.",
    "",
    "Uso:",
    "  npm run menu:seed -- <slug> [service-account.json] [--apply] [--overwrite]",
    "",
    "Sem --apply, o comando mostra somente a prévia.",
    "Use --overwrite para atualizar itens demo que já existirem.",
  ].join("\n"));
  process.exit(0);
}

const positionalArgs = args.filter((argument) => !argument.startsWith("--"));
const slug = positionalArgs[0]?.trim().toLowerCase();
const credentialPathArgument = positionalArgs[1]?.trim();
const shouldApply = args.includes("--apply");
const shouldOverwrite = args.includes("--overwrite");
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const credentialPath = credentialPathArgument || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
const applicationDefaultCredentialsPath = join(homedir(), ".config", "gcloud", "application_default_credentials.json");

if (!slug) fail("Informe o slug do restaurante. Exemplo: npm run menu:seed -- restaurante-teste");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) fail("O slug deve conter apenas letras minúsculas, números e hífens.");
if (!projectId) fail("Defina FIREBASE_PROJECT_ID ou NEXT_PUBLIC_FIREBASE_PROJECT_ID no arquivo .env.");
if (shouldOverwrite && !shouldApply) fail("A opção --overwrite só pode ser usada junto com --apply.");

const resolveAdminCredential = (): admin.credential.Credential => {
  if (credentialPath) {
    const resolvedCredentialPath = resolve(credentialPath);
    if (!existsSync(resolvedCredentialPath)) fail(`Arquivo de credencial não encontrado: ${resolvedCredentialPath}`);
    return admin.credential.cert(resolvedCredentialPath);
  }

  if (existsSync(applicationDefaultCredentialsPath)) return admin.credential.applicationDefault();

  return fail([
    "Nenhuma credencial do Firebase Admin SDK foi encontrada.",
    "Passe o caminho da chave JSON após o slug ou configure GOOGLE_APPLICATION_CREDENTIALS.",
  ].join("\n"));
};

admin.initializeApp({ projectId, credential: resolveAdminCredential() });

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

async function seedMenu() {
  const db = admin.firestore();
  const storeQuery = await db.collection("stores").where("slug", "==", slug).limit(2).get();

  if (storeQuery.empty) fail(`Nenhum restaurante encontrado com o slug "${slug}".`);
  if (storeQuery.size > 1) fail(`Mais de um restaurante usa o slug "${slug}". Corrija os dados antes de continuar.`);

  const storeSnapshot = storeQuery.docs[0];
  const storeName = String(storeSnapshot.get("name") || slug);
  const storeRef = storeSnapshot.ref;
  const now = new Date().toISOString();
  const categories = [
    { id: "pratos", storeId: storeSnapshot.id, name: "Pratos", order: 1, isActive: true },
    { id: "bebidas", storeId: storeSnapshot.id, name: "Bebidas", order: 2, isActive: true },
  ];
  const documents = [
    ...categories.map((category) => ({
      kind: "categoria" as const,
      ref: storeRef.collection("categories").doc(category.id),
      data: category,
    })),
    ...menuItems.map((item) => ({
      kind: "item" as const,
      ref: storeRef.collection("menuItems").doc(item.id),
      data: {
        ...item,
        storeId: storeSnapshot.id,
        imageUrl: "/placeholder-item.svg",
        isAvailable: true,
        optionsGroups: [],
        createdAt: now,
        updatedAt: now,
      },
    })),
    ...additionals.map((additional) => ({
      kind: "adicional" as const,
      ref: storeRef.collection("additionals").doc(additional.id),
      data: {
        ...additional,
        storeId: storeSnapshot.id,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
      },
    })),
  ];
  const currentSnapshots = await db.getAll(...documents.map((document) => document.ref));
  const currentByPath = new Map(currentSnapshots.map((snapshot) => [snapshot.ref.path, snapshot]));
  const pendingDocuments = documents.filter((document) => shouldOverwrite || !currentByPath.get(document.ref.path)?.exists);
  const skippedCount = documents.length - pendingDocuments.length;

  console.log(`\nRestaurante: ${storeName} (${slug})`);
  console.log(`Projeto Firebase: ${projectId}`);
  console.log("\nCardápio da demonstração:");

  for (const categoryId of ["pratos", "bebidas"] as const) {
    console.log(`\n${categoryId === "pratos" ? "Pratos" : "Bebidas"}:`);
    menuItems
      .filter((item) => item.categoryId === categoryId)
      .forEach((item) => console.log(`  - ${item.name}: ${currency.format(item.price)}`));
  }

  console.log("\nAdicionais:");
  additionals.forEach((additional) => console.log(`  - ${additional.name}: ${currency.format(additional.price)}`));

  console.log(`\nDocumentos a gravar: ${pendingDocuments.length}`);
  console.log(`Documentos preservados: ${skippedCount}`);

  if (!shouldApply) {
    console.log("\nPrévia concluída; nenhum dado foi alterado.");
    console.log(`Para aplicar: npm run menu:seed -- ${slug} \"/caminho/para/service-account.json\" --apply`);
    return;
  }

  if (pendingDocuments.length === 0) {
    console.log("\nO cardápio demo já está populado; nenhuma alteração necessária.");
    return;
  }

  const batch = db.batch();

  for (const document of pendingDocuments) {
    const currentSnapshot = currentByPath.get(document.ref.path);
    const data = document.kind !== "categoria" && currentSnapshot?.exists
      ? { ...document.data, createdAt: currentSnapshot.get("createdAt") || now }
      : document.data;

    batch.set(document.ref, data, { merge: shouldOverwrite });
  }

  await batch.commit();
  console.log(`\nCardápio populado com sucesso em ${storeName}: ${pendingDocuments.length} documentos gravados.`);
}

seedMenu()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nNão foi possível popular o cardápio:\n${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app?.delete()));
  });
