"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminLoginForm } from "@/components/admin-login-form/AdminLoginForm";
import { ThemeScope } from "@/components/theme-scope/ThemeScope";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import { firebaseAuth } from "@/lib/firebase/client";
import { fallbackAdminTheme } from "@/theme/admin-theme";

/**
 * Rota /login: só autenticação. Assim que a conta autentica, manda para /admin,
 * onde acontece a escolha da loja e o redirecionamento para a loja correta.
 */
export function AdminLoginScreen() {
  const router = useRouter();
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth, (user) => {
        setIsAuthenticated(Boolean(user));
        setIsAuthReady(true);

        if (user) {
          router.replace("/admin");
        }
      }),
    [router],
  );

  if (!isAuthReady || isAuthenticated) {
    return (
      <ThemeScope theme={fallbackAdminTheme}>
        <main className="admin-entry admin-entry--centered">
          <LoadingState label={isAuthenticated ? "Entrando" : "Verificando acesso"} />
        </main>
      </ThemeScope>
    );
  }

  return (
    <ThemeScope theme={fallbackAdminTheme}>
      <main className="admin-entry admin-entry--centered">
        <AdminLoginForm />
      </main>
    </ThemeScope>
  );
}
