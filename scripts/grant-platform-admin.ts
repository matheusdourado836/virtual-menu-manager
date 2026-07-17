import * as admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const loadEnvFile = (path: string) => {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/u);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/gu, "");

    if (!value.startsWith("TODO_CONFIG")) {
      process.env[key] ??= value;
    }
  }
};

loadEnvFile(".env");
loadEnvFile(".env.local");

const fail = (message: string): never => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

const email = (process.argv[2] || process.env.PLATFORM_ADMIN_EMAIL)?.trim().toLowerCase();
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const credentialPathArgument = process.argv[3]?.trim();
const credentialPathFromEnvironment = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
const credentialPath = credentialPathArgument || credentialPathFromEnvironment;
const applicationDefaultCredentialsPath = join(
  homedir(),
  ".config",
  "gcloud",
  "application_default_credentials.json",
);

if (!email) {
  fail("Passe o e-mail após -- ou defina PLATFORM_ADMIN_EMAIL.");
}

if (!projectId) {
  fail("Defina FIREBASE_PROJECT_ID ou NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
}

const resolveAdminCredential = (): admin.credential.Credential => {
  if (credentialPath) {
    const resolvedCredentialPath = resolve(credentialPath);

    if (!existsSync(resolvedCredentialPath)) {
      fail(`Arquivo de credencial não encontrado: ${resolvedCredentialPath}`);
    }

    return admin.credential.cert(resolvedCredentialPath);
  }

  if (existsSync(applicationDefaultCredentialsPath)) {
    return admin.credential.applicationDefault();
  }

  return fail([
    "Nenhuma credencial do Firebase Admin SDK foi encontrada.",
    "O comando `firebase login` autentica o CLI, mas não o Admin SDK.",
    "Baixe uma chave JSON em Firebase Console > Configurações do projeto > Contas de serviço > Gerar nova chave privada.",
    "Salve a chave fora do repositório e execute:",
    "npm run platform-admin:grant -- seu-email@exemplo.com \"/caminho/para/service-account.json\"",
  ].join("\n"));
};

admin.initializeApp({ projectId, credential: resolveAdminCredential() });

async function grantPlatformAdmin() {
  const user = await admin.auth().getUserByEmail(email!);
  await admin.auth().setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    platformAdmin: true,
  });

  console.log(`Acesso platformAdmin concedido a ${email} (${user.uid}).`);
  console.log("Saia e entre novamente no aplicativo para renovar o token de autenticação.");
}

grantPlatformAdmin().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nNão foi possível conceder o acesso platformAdmin:\n${message}\n`);
  process.exitCode = 1;
});
