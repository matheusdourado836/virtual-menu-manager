import * as admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

interface GroupTemplate {
  id: string;
  name: string;
  additionalIds: string[];
  maxSelected?: number;
}

const itemGroupTemplates: Record<string, GroupTemplate[]> = {
  "demo-hamburguer-artesanal": [
    {
      id: "ingredientes-extras",
      name: "Ingredientes extras",
      additionalIds: [
        "demo-queijo-mussarela",
        "demo-queijo-cheddar",
        "demo-requeijao-cremoso",
        "demo-presunto",
        "demo-bacon",
        "demo-ovo",
        "demo-calabresa",
        "demo-frango-desfiado",
        "demo-hamburguer-extra",
        "demo-cebola-caramelizada",
      ],
    },
    {
      id: "acompanhamentos",
      name: "Acompanhamentos",
      additionalIds: ["demo-batata-frita-adicional", "demo-salada"],
    },
    {
      id: "molhos",
      name: "Molhos",
      additionalIds: [
        "demo-molho-da-casa",
        "demo-molho-barbecue",
        "demo-maionese-temperada",
        "demo-molho-pimenta",
      ],
    },
  ],
  "demo-x-salada": [
    {
      id: "ingredientes-extras",
      name: "Ingredientes extras",
      additionalIds: [
        "demo-queijo-mussarela",
        "demo-queijo-cheddar",
        "demo-requeijao-cremoso",
        "demo-presunto",
        "demo-bacon",
        "demo-ovo",
        "demo-calabresa",
        "demo-frango-desfiado",
        "demo-hamburguer-extra",
        "demo-cebola-caramelizada",
      ],
    },
    {
      id: "acompanhamentos",
      name: "Acompanhamentos",
      additionalIds: ["demo-batata-frita-adicional", "demo-salada"],
    },
    {
      id: "molhos",
      name: "Molhos",
      additionalIds: [
        "demo-molho-da-casa",
        "demo-molho-barbecue",
        "demo-maionese-temperada",
        "demo-molho-pimenta",
      ],
    },
  ],
  "demo-frango-grelhado": [
    {
      id: "acompanhamentos",
      name: "Acompanhamentos",
      additionalIds: [
        "demo-arroz",
        "demo-feijao",
        "demo-batata-frita-adicional",
        "demo-farofa",
        "demo-salada",
      ],
    },
    {
      id: "extras",
      name: "Extras",
      additionalIds: [
        "demo-bacon",
        "demo-ovo",
        "demo-queijo-mussarela",
        "demo-requeijao-cremoso",
        "demo-cebola-caramelizada",
      ],
    },
    {
      id: "molhos",
      name: "Molhos",
      additionalIds: ["demo-molho-da-casa", "demo-molho-barbecue", "demo-molho-pimenta"],
    },
  ],
  "demo-parmegiana-carne": [
    {
      id: "acompanhamentos",
      name: "Acompanhamentos",
      additionalIds: [
        "demo-arroz",
        "demo-feijao",
        "demo-batata-frita-adicional",
        "demo-farofa",
        "demo-salada",
      ],
    },
    {
      id: "extras",
      name: "Extras",
      additionalIds: [
        "demo-queijo-mussarela",
        "demo-queijo-cheddar",
        "demo-requeijao-cremoso",
        "demo-presunto",
        "demo-bacon",
        "demo-ovo",
      ],
    },
    {
      id: "molhos",
      name: "Molhos",
      additionalIds: ["demo-molho-da-casa", "demo-molho-pimenta"],
    },
  ],
  "demo-strogonoff-frango": [
    {
      id: "acompanhamentos",
      name: "Acompanhamentos",
      additionalIds: [
        "demo-arroz",
        "demo-feijao",
        "demo-batata-frita-adicional",
        "demo-farofa",
        "demo-salada",
      ],
    },
    {
      id: "extras",
      name: "Extras",
      additionalIds: [
        "demo-queijo-mussarela",
        "demo-requeijao-cremoso",
        "demo-bacon",
      ],
    },
  ],
  "demo-macarrao-bolonhesa": [
    {
      id: "extras",
      name: "Extras",
      additionalIds: [
        "demo-queijo-mussarela",
        "demo-queijo-cheddar",
        "demo-requeijao-cremoso",
        "demo-presunto",
        "demo-bacon",
        "demo-ovo",
        "demo-calabresa",
        "demo-frango-desfiado",
      ],
    },
    {
      id: "molhos",
      name: "Molhos",
      additionalIds: ["demo-molho-pimenta"],
    },
  ],
  "demo-salada-caesar": [
    {
      id: "proteinas-extras",
      name: "Proteínas extras",
      additionalIds: ["demo-frango-desfiado", "demo-bacon", "demo-ovo", "demo-presunto"],
    },
    {
      id: "queijos",
      name: "Queijos",
      additionalIds: ["demo-queijo-mussarela", "demo-queijo-cheddar", "demo-requeijao-cremoso"],
    },
    {
      id: "molhos",
      name: "Molhos",
      additionalIds: [
        "demo-molho-da-casa",
        "demo-maionese-temperada",
        "demo-molho-barbecue",
        "demo-molho-pimenta",
      ],
    },
  ],
  "demo-batata-frita": [
    {
      id: "coberturas",
      name: "Coberturas e extras",
      additionalIds: [
        "demo-bacon",
        "demo-calabresa",
        "demo-frango-desfiado",
        "demo-queijo-cheddar",
        "demo-queijo-mussarela",
        "demo-requeijao-cremoso",
        "demo-cebola-caramelizada",
      ],
    },
    {
      id: "molhos",
      name: "Molhos",
      additionalIds: [
        "demo-molho-da-casa",
        "demo-molho-barbecue",
        "demo-maionese-temperada",
        "demo-molho-pimenta",
      ],
    },
  ],
  "demo-agua-mineral": [
    {
      id: "personalize-bebida",
      name: "Personalize sua bebida",
      additionalIds: ["demo-gelo", "demo-limao"],
    },
  ],
  "demo-agua-com-gas": [
    {
      id: "personalize-bebida",
      name: "Personalize sua bebida",
      additionalIds: ["demo-gelo", "demo-limao"],
    },
  ],
  "demo-refrigerante-lata": [
    {
      id: "personalize-bebida",
      name: "Personalize sua bebida",
      additionalIds: ["demo-gelo", "demo-limao"],
    },
  ],
  "demo-suco-laranja": [
    {
      id: "personalize-bebida",
      name: "Personalize sua bebida",
      additionalIds: ["demo-gelo", "demo-limao"],
    },
  ],
  "demo-limonada": [
    {
      id: "personalize-bebida",
      name: "Personalize sua bebida",
      additionalIds: ["demo-gelo"],
    },
  ],
  "demo-cha-gelado": [
    {
      id: "personalize-bebida",
      name: "Personalize sua bebida",
      additionalIds: ["demo-gelo", "demo-limao"],
    },
  ],
  "demo-cerveja-long-neck": [
    {
      id: "personalize-bebida",
      name: "Personalize sua bebida",
      additionalIds: ["demo-limao"],
    },
  ],
  "demo-cafe-expresso": [
    {
      id: "personalize-cafe",
      name: "Personalize seu café",
      additionalIds: ["demo-leite", "demo-chantilly", "demo-dose-expresso"],
    },
  ],
};

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
    "Associa adicionais existentes aos itens demo de forma coerente.",
    "",
    "Uso:",
    "  npm run menu:assign-additionals -- <slug> [service-account.json] [--apply] [--overwrite]",
    "",
    "Sem --apply, o comando mostra somente a prévia.",
    "Itens que já possuem opções são preservados, exceto com --overwrite.",
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

if (!slug) fail("Informe o slug do restaurante. Exemplo: npm run menu:assign-additionals -- teste");
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

async function assignMenuAdditionals() {
  const db = admin.firestore();
  const storeQuery = await db.collection("stores").where("slug", "==", slug).limit(2).get();

  if (storeQuery.empty) fail(`Nenhum restaurante encontrado com o slug "${slug}".`);
  if (storeQuery.size > 1) fail(`Mais de um restaurante usa o slug "${slug}".`);

  const storeSnapshot = storeQuery.docs[0];
  const storeRef = storeSnapshot.ref;
  const [itemSnapshots, additionalSnapshots] = await Promise.all([
    storeRef.collection("menuItems").get(),
    storeRef.collection("additionals").get(),
  ]);
  const itemsById = new Map(itemSnapshots.docs.map((snapshot) => [snapshot.id, snapshot]));
  const additionalsById = new Map(additionalSnapshots.docs.map((snapshot) => [snapshot.id, snapshot]));
  const missingAdditionalIds = [
    ...new Set(
      Object.values(itemGroupTemplates)
        .flatMap((groups) => groups)
        .flatMap((group) => group.additionalIds)
        .filter((additionalId) => !additionalsById.has(additionalId)),
    ),
  ];

  if (missingAdditionalIds.length) {
    fail(`Adicionais necessários não encontrados: ${missingAdditionalIds.join(", ")}`);
  }

  const plannedUpdates = Object.entries(itemGroupTemplates).flatMap(([itemId, groupTemplates]) => {
    const itemSnapshot = itemsById.get(itemId);
    if (!itemSnapshot) return [];

    const currentGroups = itemSnapshot.get("optionsGroups");
    if (!shouldOverwrite && Array.isArray(currentGroups) && currentGroups.length > 0) return [];

    const optionsGroups = groupTemplates.map((group) => ({
      id: group.id,
      name: group.name,
      minSelected: 0,
      maxSelected: Math.min(group.maxSelected || group.additionalIds.length, group.additionalIds.length),
      isRequired: false,
      choices: group.additionalIds.map((additionalId) => {
        const additionalSnapshot = additionalsById.get(additionalId)!;
        return {
          id: additionalSnapshot.id,
          name: String(additionalSnapshot.get("name") || "Adicional"),
          price: Number(additionalSnapshot.get("price") || 0),
          isAvailable: additionalSnapshot.get("isAvailable") === true,
        };
      }),
    }));

    return [{
      itemSnapshot,
      optionsGroups,
    }];
  });

  console.log(`\nRestaurante: ${storeSnapshot.get("name")} (${slug})`);
  console.log(`Itens encontrados: ${itemSnapshots.size}`);
  console.log(`Itens que serão atualizados: ${plannedUpdates.length}\n`);

  for (const update of plannedUpdates) {
    console.log(`${update.itemSnapshot.get("name")}:`);
    for (const group of update.optionsGroups) {
      console.log(`  ${group.name}: ${group.choices.map((choice) => choice.name).join(", ")}`);
    }
  }

  if (!shouldApply) {
    console.log("\nPrévia concluída; nenhum dado foi alterado.");
    console.log(`Para aplicar: npm run menu:assign-additionals -- ${slug} "/caminho/para/service-account.json" --apply`);
    return;
  }

  if (!plannedUpdates.length) {
    console.log("\nNenhum item precisa ser atualizado.");
    return;
  }

  const batch = db.batch();
  const updatedAt = new Date().toISOString();

  for (const update of plannedUpdates) {
    batch.set(update.itemSnapshot.ref, { optionsGroups: update.optionsGroups, updatedAt }, { merge: true });
  }

  await batch.commit();
  console.log(`\nAdicionais associados com sucesso em ${plannedUpdates.length} itens.`);
}

assignMenuAdditionals()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nNão foi possível associar os adicionais:\n${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app?.delete()));
  });
