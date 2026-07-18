"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ArrowRight, LogOut, RefreshCw, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import { ThemeScope } from "@/components/theme-scope/ThemeScope";
import { firebaseAuth } from "@/lib/firebase/client";
import { getFriendlyErrorMessage } from "@/lib/errors/friendly-error";
import { getManagedStores, type ManagedStoreSummary } from "@/lib/services/store-service";
import { fallbackAdminTheme } from "@/theme/admin-theme";

const accessLabel: Record<ManagedStoreSummary["accessRole"], string> = {
  owner: "Proprietário",
  admin: "Administrador",
  platformAdmin: "Acesso global",
};

const storeAdminHref = (slug: string) => `/admin/${encodeURIComponent(slug)}`;

export function AdminEntry() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [stores, setStores] = useState<ManagedStoreSummary[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadStores = useCallback(async () => {
    let navigationStarted = false;

    setIsLoadingStores(true);
    setLoadError("");

    try {
      const nextStores = await getManagedStores();
      const directStores = nextStores.filter((store) => store.accessRole !== "platformAdmin");
      const automaticStore = directStores.length === 1
        ? directStores[0]
        : directStores.length === 0 && nextStores.length === 1
          ? nextStores[0]
          : null;

      if (automaticStore) {
        router.replace(storeAdminHref(automaticStore.slug));
        navigationStarted = true;
        return;
      }

      setStores(nextStores);
    } catch (error) {
      setLoadError(getFriendlyErrorMessage(error, "Não foi possível localizar seus restaurantes."));
    } finally {
      if (!navigationStarted) setIsLoadingStores(false);
    }
  }, [router]);

  useEffect(() => onAuthStateChanged(firebaseAuth, (updatedUser) => {
    setUser(updatedUser);
    setStores([]);
    setLoadError("");
    setIsLoadingStores(Boolean(updatedUser));
    setIsAuthReady(true);

    if (updatedUser) void loadStores();
  }), [loadStores]);

  useEffect(() => {
    if (isAuthReady && !user) {
      router.replace("/login");
    }
  }, [isAuthReady, user, router]);

  const logout = async () => {
    await signOut(firebaseAuth);
  };

  if (!isAuthReady || (user && isLoadingStores)) {
    return (
      <ThemeScope theme={fallbackAdminTheme}>
        <main className="admin-entry admin-entry--centered">
          <LoadingState label={isAuthReady ? "Localizando seus restaurantes" : "Verificando acesso"} />
        </main>
      </ThemeScope>
    );
  }

  if (!user) {
    return (
      <ThemeScope theme={fallbackAdminTheme}>
        <main className="admin-entry admin-entry--centered">
          <LoadingState label="Redirecionando" />
        </main>
      </ThemeScope>
    );
  }

  if (loadError) {
    return (
      <ThemeScope theme={fallbackAdminTheme}>
        <main className="admin-entry admin-entry--centered">
          <EmptyState
            icon={<Store size={28} aria-hidden />}
            title="Não foi possível carregar seus restaurantes"
            text={loadError}
            action={(
              <div className="admin-entry__empty-actions">
                <button className="admin-entry__primary" type="button" onClick={() => void loadStores()}>
                  <RefreshCw size={17} aria-hidden /> Tentar novamente
                </button>
                <button className="admin-entry__secondary" type="button" onClick={logout}>Trocar de conta</button>
              </div>
            )}
          />
        </main>
      </ThemeScope>
    );
  }

  if (stores.length === 0) {
    return (
      <ThemeScope theme={fallbackAdminTheme}>
        <main className="admin-entry admin-entry--centered">
          <EmptyState
            icon={<Store size={28} aria-hidden />}
            title="Nenhum restaurante vinculado"
            text="Esta conta ainda não aparece como proprietária ou administradora de um restaurante."
            action={<button className="admin-entry__secondary" type="button" onClick={logout}>Trocar de conta</button>}
          />
        </main>
      </ThemeScope>
    );
  }

  return (
    <ThemeScope theme={fallbackAdminTheme}>
      <main className="admin-entry">
        <header className="admin-entry__header">
          <div>
            <p className="admin-entry__eyebrow">Virtual menu manager</p>
            <h1>Escolha um restaurante</h1>
            <p>Encontramos mais de um painel disponível para {user.email || "esta conta"}.</p>
          </div>
          <button className="admin-entry__secondary" type="button" onClick={logout}>
            <LogOut size={17} aria-hidden /> Sair
          </button>
        </header>

        <section className="admin-entry__store-grid" aria-label="Restaurantes disponíveis">
          {stores.map((store) => (
            <Link className="admin-entry__store-card" href={storeAdminHref(store.slug)} key={store.id}>
              <span className="admin-entry__store-icon"><Store size={22} aria-hidden /></span>
              <span className="admin-entry__store-copy">
                <span className="admin-entry__store-heading">
                  <strong>{store.name}</strong>
                  <small>{accessLabel[store.accessRole]}</small>
                </span>
                <span className="admin-entry__store-slug">/{store.slug}</span>
                <span className="admin-entry__store-description">{store.description || "Sem descrição cadastrada."}</span>
                <span className="admin-entry__statuses">
                  <span>{store.isActive ? "Cardápio ativo" : "Cardápio inativo"}</span>
                  <span>{store.isAcceptingOrders ? "Recebendo pedidos" : "Pedidos pausados"}</span>
                </span>
              </span>
              <ArrowRight className="admin-entry__arrow" size={20} aria-hidden />
            </Link>
          ))}
        </section>
      </main>
    </ThemeScope>
  );
}
