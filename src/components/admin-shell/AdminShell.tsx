"use client";

import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from "firebase/auth";
import {
  BellRing,
  CheckCheck,
  CircleDollarSign,
  Clock3,
  Coffee,
  History,
  LayoutDashboard,
  LogOut,
  Palette,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Store,
  Utensils,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminOrderDialog } from "@/components/admin-order-dialog/AdminOrderDialog";
import { MenuManager, type MenuManagerHandle } from "@/components/menu-manager/MenuManager";
import { OrdersBoard } from "@/components/orders-board/OrdersBoard";
import { StoreSettings } from "@/components/store-settings/StoreSettings";
import { TablesManager } from "@/components/tables-manager/TablesManager";
import { ThemeScope } from "@/components/theme-scope/ThemeScope";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import { Snackbar } from "@/components/ui/snackbar/Snackbar";
import { FinancialReport } from "@/features/financial-report/components/financial-report/FinancialReport";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { canManageStore } from "@/lib/permissions/store-permissions";
import { getAdminStoreBundleBySlug, getStoreBundleBySlug, subscribeStoreOrders } from "@/lib/services/store-service";
import { playUiSound, UI_SOUNDS } from "@/lib/utils/audio";
import { formatCurrency } from "@/lib/utils/money";
import type { Order, StoreBundle, StoreTheme } from "@/types/menu";
import "./admin-shell.scss";

type AdminTab = "orders" | "history" | "tables" | "menu" | "finance" | "settings";

const adminTabs: Array<{
  id: AdminTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "orders", label: "Pedidos", icon: LayoutDashboard },
  { id: "history", label: "Histórico", icon: History },
  { id: "tables", label: "Mesas", icon: QrCode },
  { id: "menu", label: "Cardápio", icon: Utensils },
  { id: "finance", label: "Financeiro", icon: CircleDollarSign },
  { id: "settings", label: "Configurações", icon: Palette },
];

const tabDescriptions: Record<AdminTab, string> = {
  orders: "Acompanhe a operação em tempo real.",
  history: "Consulte todos os pedidos registrados.",
  tables: "Organize os pontos de atendimento e QR Codes.",
  menu: "Gerencie categorias, itens e disponibilidade.",
  finance: "Veja faturamento, produtos vendidos e pagamentos.",
  settings: "Edite dados da loja, operação e identidade visual.",
};

const fallbackAdminTheme: StoreTheme = {
  id: "fallback",
  storeId: "fallback",
  primaryColor: "#181818",
  secondaryColor: "#f5f5f2",
  accentColor: "#2f8f6f",
  backgroundColor: "#f7f5f0",
  surfaceColor: "#fffdf8",
  textColor: "#211f1d",
  mutedTextColor: "#6f6962",
  borderColor: "#e8e1d7",
  fontFamily: "var(--font-geist-sans)",
  borderRadius: 14,
  visualStyle: "neutral-admin",
  updatedAt: new Date(0).toISOString(),
};

interface AdminShellProps {
  slug: string;
}

export function AdminShell({ slug }: AdminShellProps) {
  const [bundle, setBundle] = useState<StoreBundle | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderDialog, setOrderDialog] = useState<{ tableId?: string } | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => new Date().getTime());
  const knownOrderIds = useRef<Set<string>>(new Set());
  const hasHydratedOrders = useRef(false);
  const menuManagerRef = useRef<MenuManagerHandle>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    variant: "success" | "error" | "info";
  } | null>(null);

  const handleOrdersChange = useCallback((updatedOrders: Order[]) => {
    const nextOrderIds = new Set(updatedOrders.map((order) => order.id));
    const hasNewOrder =
      hasHydratedOrders.current &&
      updatedOrders.some(
        (order) =>
          !knownOrderIds.current.has(order.id) && !["delivered", "cancelled"].includes(order.status),
      );

    setOrders(updatedOrders);
    knownOrderIds.current = nextOrderIds;
    hasHydratedOrders.current = true;

    if (hasNewOrder) {
      playUiSound(UI_SOUNDS.newOrder);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, async (updatedUser) => {
      setIsLoading(true);
      setLoadError("");
      setUser(updatedUser);

      try {
        setClaims(updatedUser ? (await updatedUser.getIdTokenResult()).claims : {});
      } finally {
        setIsAuthReady(true);
      }
    });
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(new Date().getTime());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isAuthReady) {
      return undefined;
    }

    let isMounted = true;

    const loadBundle = user ? getAdminStoreBundleBySlug(slug) : getStoreBundleBySlug(slug);

    loadBundle
      .then((loadedBundle) => {
        if (!isMounted) {
          return;
        }

        setBundle(loadedBundle);
        setLoadError("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setBundle(null);
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a loja.");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthReady, slug, user]);

  useEffect(() => {
    if (!bundle) {
      return undefined;
    }

    knownOrderIds.current = new Set();
    hasHydratedOrders.current = false;

    return subscribeStoreOrders(bundle.store.id, handleOrdersChange, (error) => {
      setFeedback({
        message: error.message || "Não foi possível acompanhar os pedidos.",
        variant: "error",
      });
    });
  }, [bundle, handleOrdersChange]);

  const isAuthorized = useMemo(() => {
    if (!bundle) {
      return false;
    }

    return canManageStore(user ? { uid: user.uid, claims } : null, bundle.store);
  }, [bundle, claims, user]);

  const submitEmailLogin = async () => {
    setAuthError("");

    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Falha no login.");
    }
  };

  const submitGoogleLogin = async () => {
    setAuthError("");

    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Falha no login com Google.");
    }
  };

  const submitLogout = () => {
    void signOut(firebaseAuth);
  };

  const refreshBundle = async () => {
    setIsRefreshing(true);

    try {
      setBundle(user ? await getAdminStoreBundleBySlug(slug) : await getStoreBundleBySlug(slug));
      setLoadError("");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Não foi possível atualizar a loja.", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const now = new Date(currentTimestamp);

  const recentOrders = useMemo(() => {
    const cutoff = currentTimestamp - 24 * 60 * 60 * 1000;

    return orders.filter((order) => {
      const createdAt = new Date(order.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    });
  }, [currentTimestamp, orders]);

  const dashboardMetrics = useMemo(() => {
    const today = new Date().toDateString();
    const isToday = (isoDate: string) => new Date(isoDate).toDateString() === today;
    const finalizedToday = recentOrders.filter(
      (order) => order.status === "delivered" && isToday(order.deliveredAt || order.updatedAt),
    );

    return [
      {
        label: "Novos",
        helper: "Aguardando confirmação",
        value: recentOrders.filter((order) => ["received", "accepted"].includes(order.status)).length,
        icon: ReceiptText,
      },
      {
        label: "Em preparo",
        helper: `Tempo estimado ${bundle?.store.estimatedPrepMinutes || 0} min`,
        value: recentOrders.filter((order) => order.status === "preparing").length,
        icon: Clock3,
      },
      {
        label: "Prontos",
        helper: "Aguardando entrega",
        value: recentOrders.filter((order) => order.status === "ready").length,
        icon: BellRing,
      },
      {
        label: "Finalizados",
        helper: "Hoje até agora",
        value: finalizedToday.length,
        icon: CheckCheck,
      },
      {
        label: "Faturamento hoje",
        helper: `${finalizedToday.length} pedido${finalizedToday.length === 1 ? "" : "s"} entregue${
          finalizedToday.length === 1 ? "" : "s"
        }`,
        value: formatCurrency(finalizedToday.reduce((total, order) => total + order.total, 0)),
        icon: CircleDollarSign,
      },
    ];
  }, [bundle?.store.estimatedPrepMinutes, recentOrders]);

  const greeting =
    now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const administratorName = user?.displayName?.split(" ")[0] || "Administrador";
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
  const showFeedback = (message: string, variant: "success" | "error" | "info" = "success") => {
    setFeedback({ message, variant });
  };

  if (!isAuthReady) {
    return <LoadingState label="Carregando painel" />;
  }

  if (!user) {
    return (
      <ThemeScope theme={bundle?.theme || fallbackAdminTheme}>
        <main className="admin-shell admin-shell--locked">
          <section className="admin-shell__login">
            <Coffee size={32} aria-hidden />
            <h1 className="admin-shell__login-title">Entrar no painel</h1>
            {loadError ? <p className="admin-shell__error">{loadError}</p> : null}
            <label className="admin-shell__field">
              <span>Email</span>
              <input
                className="admin-shell__control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
              />
            </label>
            <label className="admin-shell__field">
              <span>Senha</span>
              <input
                className="admin-shell__control"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
              />
            </label>
            {authError ? <p className="admin-shell__error">{authError}</p> : null}
            <button className="admin-shell__primary" type="button" onClick={submitEmailLogin}>
              Entrar
            </button>
            <button className="admin-shell__secondary" type="button" onClick={submitGoogleLogin}>
              Entrar com Google
            </button>
          </section>
        </main>
      </ThemeScope>
    );
  }

  if (isLoading) {
    return <LoadingState label="Carregando painel" />;
  }

  if (!bundle) {
    return (
      <ThemeScope theme={fallbackAdminTheme}>
        <main className="admin-shell admin-shell--locked">
          <EmptyState
            icon={<Store size={28} aria-hidden />}
            title="Loja não encontrada"
            text={loadError || "Verifique o slug configurado para o painel administrativo."}
          />
        </main>
      </ThemeScope>
    );
  }

  if (!isAuthorized) {
    return (
      <ThemeScope theme={bundle.theme}>
        <main className="admin-shell admin-shell--locked">
          <EmptyState
            title="Acesso negado"
            text="Este usuário não tem permissão para administrar esta loja. Configure owners/adminUsers ou platformAdmin."
          />
        </main>
      </ThemeScope>
    );
  }

  return (
    <ThemeScope theme={bundle.theme}>
      <>
        <main className="admin-shell">
        <aside className="admin-shell__sidebar">
          <div className="admin-shell__brand">
            <div className="admin-shell__brand-copy">
              <strong className="admin-shell__brand-name">{bundle.store.name}</strong>
              <span className="admin-shell__brand-label">Virtual menu manager</span>
            </div>
          </div>

          <nav className="admin-shell__nav" aria-label="Administração">
            {adminTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  className={`admin-shell__tab${activeTab === tab.id ? " admin-shell__tab--active" : ""}`}
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  aria-pressed={activeTab === tab.id}
                >
                  <Icon size={18} aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="admin-shell__sidebar-footer">
            <div className="admin-shell__store-summary">
              <span className="admin-shell__store-icon">
                <Store size={18} aria-hidden />
              </span>
              <span className="admin-shell__store-copy">
                <strong className="admin-shell__sidebar-title">{bundle.store.name}</strong>
                <small className="admin-shell__sidebar-detail">
                  {bundle.store.isAcceptingOrders ? "Operação online" : "Operação pausada"}
                </small>
              </span>
            </div>

            <button className="admin-shell__logout" type="button" onClick={submitLogout}>
              <span className="admin-shell__user-icon">
                <Coffee size={18} aria-hidden />
              </span>
              <span className="admin-shell__user-copy">
                <strong className="admin-shell__sidebar-title">{administratorName}</strong>
                <small className="admin-shell__sidebar-detail">{user.email}</small>
              </span>
              <LogOut size={17} aria-hidden />
            </button>
          </div>
        </aside>

        <section className="admin-shell__workspace">
          <header className="admin-shell__topbar">
            <div>
              <h1 className="admin-shell__topbar-title">
                {activeTab === "orders"
                  ? `${greeting}, ${administratorName}`
                  : adminTabs.find((tab) => tab.id === activeTab)?.label}
              </h1>
              <p className="admin-shell__topbar-subtitle">
                {activeTab === "orders" ? formattedDate : tabDescriptions[activeTab]}
              </p>
            </div>
            {activeTab === "orders" ? (
              <div className="admin-shell__topbar-actions">
                <button className="admin-shell__refresh" type="button" onClick={refreshBundle} disabled={isRefreshing}>
                  <RefreshCw size={17} aria-hidden />
                  {isRefreshing ? "Atualizando" : "Atualizar"}
                </button>
                <button className="admin-shell__new-order" type="button" onClick={() => setOrderDialog({})}>
                  <Plus size={17} aria-hidden />
                  Novo pedido
                </button>
              </div>
            ) : activeTab === "history" ? (
              <button className="admin-shell__refresh" type="button" onClick={refreshBundle} disabled={isRefreshing}>
                <RefreshCw size={17} aria-hidden />
                {isRefreshing ? "Atualizando" : "Atualizar"}
              </button>
            ) : activeTab === "tables" ? (
              <button className="admin-shell__new-order" type="button" onClick={() => setOrderDialog({})}>
                <Plus size={17} aria-hidden />
                Novo pedido
              </button>
            ) : activeTab === "menu" ? (
              <button className="admin-shell__new-order" type="button" onClick={() => menuManagerRef.current?.openCreateItem()}>
                <Plus size={17} aria-hidden />
                Criar item
              </button>
            ) : null}
          </header>

          {activeTab === "orders" ? (
            <section className="admin-shell__metrics" aria-label="Resumo da operação">
              {dashboardMetrics.map((metric) => {
                const Icon = metric.icon;

                return (
                  <article
                    className={`admin-shell__metric${
                      metric.label === "Faturamento hoje" ? " admin-shell__metric--revenue" : ""
                    }`}
                    key={metric.label}
                  >
                    <span className="admin-shell__metric-icon">
                      <Icon size={20} aria-hidden />
                    </span>
                    <strong className="admin-shell__metric-value">{metric.value}</strong>
                    <span className="admin-shell__metric-label">{metric.label}</span>
                    <small className="admin-shell__metric-helper">{metric.helper}</small>
                  </article>
                );
              })}
            </section>
          ) : null}

          <div className="admin-shell__content">
            {activeTab === "orders" ? (
              <OrdersBoard
                orders={recentOrders}
                storeId={bundle.store.id}
                onFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "history" ? (
              <OrdersBoard
                orders={orders}
                storeId={bundle.store.id}
                onFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "tables" ? (
              <TablesManager
                storeId={bundle.store.id}
                tables={bundle.tables}
                storeSlug={bundle.store.slug}
                onCreateOrder={(tableId) => setOrderDialog({ tableId })}
                onFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "menu" ? (
              <MenuManager
                ref={menuManagerRef}
                storeId={bundle.store.id}
                categories={bundle.categories}
                menuItems={bundle.menuItems}
                onChanged={refreshBundle}
                onFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "finance" ? (
              <FinancialReport storeId={bundle.store.id} tables={bundle.tables} />
            ) : null}
            {activeTab === "settings" ? (
              <StoreSettings store={bundle.store} theme={bundle.theme} onSaved={refreshBundle} onFeedback={showFeedback} />
            ) : null}
          </div>
        </section>
        </main>

        {orderDialog ? (
          <AdminOrderDialog
            bundle={bundle}
            initialTableId={orderDialog.tableId}
            onClose={() => setOrderDialog(null)}
            onCreated={refreshBundle}
            onFeedback={showFeedback}
          />
        ) : null}

        {feedback ? (
          <Snackbar
            message={feedback.message}
            variant={feedback.variant}
            onDismiss={() => setFeedback(null)}
          />
        ) : null}
      </>
    </ThemeScope>
  );
}
