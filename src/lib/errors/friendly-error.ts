// Traduz códigos de erro do Firebase (Auth e Cloud Functions) para mensagens
// amigáveis em português no painel administrativo. O checkout do cliente já usa
// `describeOrderSubmissionError`; este helper cobre as operações do admin (login,
// relatórios, feedbacks, criação manual) sem vazar jargão do SDK ("internal",
// "auth/invalid-credential", etc.).

interface ErrorLike {
  code?: unknown;
}

const getErrorCode = (error: unknown): string => {
  if (error && typeof error === "object") {
    const code = (error as ErrorLike).code;

    if (typeof code === "string" && code) {
      return code;
    }
  }

  return "";
};

const messageByCode: Record<string, string> = {
  // Cloud Functions
  "functions/unavailable": "Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.",
  "unavailable": "Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.",
  "functions/deadline-exceeded": "A operação demorou mais que o esperado. Verifique sua conexão e tente novamente.",
  "functions/resource-exhausted": "O serviço está ocupado no momento. Aguarde alguns segundos e tente novamente.",
  "functions/permission-denied":
    "Você não tem permissão para esta ação, ou sua sessão expirou. Atualize a página e entre novamente.",
  "permission-denied":
    "Você não tem permissão para esta ação, ou sua sessão expirou. Atualize a página e entre novamente.",
  "functions/unauthenticated": "Sua sessão expirou. Entre novamente para continuar.",
  "unauthenticated": "Sua sessão expirou. Entre novamente para continuar.",
  "functions/failed-precondition":
    "O cardápio ou a disponibilidade mudou. Recarregue a página e revise antes de continuar.",
  "failed-precondition":
    "O cardápio ou a disponibilidade mudou. Recarregue a página e revise antes de continuar.",
  "functions/not-found": "O que você tentou acessar não está mais disponível. Recarregue a página e tente novamente.",
  "not-found": "O que você tentou acessar não está mais disponível. Recarregue a página e tente novamente.",
  "functions/aborted": "Houve uma atualização simultânea. Aguarde um instante e tente novamente.",
  "functions/already-exists": "Este registro já existe. Atualize a página antes de tentar novamente.",
  // Auth
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido. Confira o endereço digitado.",
  "auth/user-disabled": "Esta conta foi desativada. Fale com o responsável pela loja.",
  "auth/too-many-requests": "Muitas tentativas seguidas. Aguarde um momento e tente novamente.",
  "auth/network-request-failed": "Falha de conexão. Verifique sua internet e tente novamente.",
  "auth/popup-closed-by-user": "Login cancelado.",
  "auth/cancelled-popup-request": "Login cancelado.",
  "auth/popup-blocked": "O navegador bloqueou a janela de login. Libere os pop-ups e tente novamente.",
};

export const getFriendlyErrorMessage = (error: unknown, fallback: string): string => {
  const code = getErrorCode(error);

  return messageByCode[code] || fallback;
};
