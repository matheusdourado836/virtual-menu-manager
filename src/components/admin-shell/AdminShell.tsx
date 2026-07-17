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
  Loader2,
  LogOut,
  MessageSquareText,
  Palette,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Store,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AdminOrderDialog } from "@/components/admin-order-dialog/AdminOrderDialog";
import { FeedbacksManager } from "@/components/feedbacks-manager/FeedbacksManager";
import { MenuManager, type MenuManagerHandle } from "@/components/menu-manager/MenuManager";
import { OrdersBoard, type OrderGroup } from "@/components/orders-board/OrdersBoard";
import { StoreSettings } from "@/components/store-settings/StoreSettings";
import { TablesManager } from "@/components/tables-manager/TablesManager";
import { ThemeScope } from "@/components/theme-scope/ThemeScope";
import { ConfirmDialog } from "@/components/ui/confirm-dialog/ConfirmDialog";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import { Snackbar } from "@/components/ui/snackbar/Snackbar";
import { FinancialReport } from "@/features/financial-report/components/financial-report/FinancialReport";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";
import { canManageStore } from "@/lib/permissions/store-permissions";
import { getAdminStoreBundleBySlug, getStoreBundleBySlug, subscribeStoreOrders } from "@/lib/services/store-service";
import { playUiSound, UI_SOUNDS } from "@/lib/utils/audio";
import { formatCurrency } from "@/lib/utils/money";
import { fallbackAdminTheme } from "@/theme/admin-theme";
import type { Order, StoreBundle } from "@/types/menu";
import "./admin-shell.scss";

type AdminTab = "orders" | "history" | "tables" | "menu" | "finance" | "feedbacks" | "settings";
type DashboardMetricTarget = OrderGroup | "finance";

interface DashboardMetric {
  label: string;
  helper: string;
  value: number | string;
  icon: LucideIcon;
  target: DashboardMetricTarget;
}

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
  { id: "feedbacks", label: "Feedbacks", icon: MessageSquareText },
  { id: "settings", label: "Configurações", icon: Palette },
];

const tabDescriptions: Record<AdminTab, string> = {
  orders: "Acompanhe a operação em tempo real.",
  history: "Consulte todos os pedidos registrados.",
  tables: "Organize os pontos de atendimento e QR Codes.",
  menu: "Gerencie categorias, itens, adicionais e disponibilidade.",
  finance: "Veja faturamento, produtos vendidos e pagamentos.",
  feedbacks: "Acompanhe avaliações internas dos clientes.",
  settings: "Edite dados da loja, operação e identidade visual.",
};

interface AdminShellProps {
  slug: string;
}

export function AdminShell({ slug }: AdminShellProps) {
  const [bundle, setBundle] = useState<StoreBundle | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersBoardGroup, setOrdersBoardGroup] = useState<OrderGroup>("all");
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState<"email" | "google" | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [orderDialog, setOrderDialog] = useState<{ tableId?: string } | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => new Date().getTime());
  const knownOrderIds = useRef<Set<string>>(new Set());
  const hasHydratedOrders = useRef(false);
  const menuManagerRef = useRef<MenuManagerHandle>(null);
  const ordersBoardAnchorRef = useRef<HTMLDivElement | null>(null);
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

  const isAuthorized = useMemo(() => {
    if (!bundle) {
      return false;
    }

    return canManageStore(user ? { uid: user.uid, claims } : null, bundle.store);
  }, [bundle, claims, user]);

  useEffect(() => {
    if (!bundle || !user || !isAuthorized) {
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
  }, [bundle, handleOrdersChange, isAuthorized, user]);

  const submitEmailLogin = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (authLoading) {
      return;
    }

    setAuthError("");
    setAuthLoading("email");

    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Falha no login.");
    } finally {
      setAuthLoading(null);
    }
  };

  const submitGoogleLogin = async () => {
    if (authLoading) {
      return;
    }

    setAuthError("");
    setAuthLoading("google");

    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Falha no login com Google.");
    } finally {
      setAuthLoading(null);
    }
  };

  const submitLogout = async () => {
    setIsSigningOut(true);

    try {
      await signOut(firebaseAuth);
      setIsLogoutConfirmOpen(false);
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Não foi possível sair do painel.", "error");
    } finally {
      setIsSigningOut(false);
    }
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

  const todayOrders = useMemo(() => {
    const startOfDay = new Date(currentTimestamp);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const startTimestamp = startOfDay.getTime();
    const endTimestamp = endOfDay.getTime();

    return orders.filter((order) => {
      const createdAt = new Date(order.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= startTimestamp && createdAt < endTimestamp;
    });
  }, [currentTimestamp, orders]);

  const dashboardMetrics = useMemo<DashboardMetric[]>(() => {
    const finalizedToday = todayOrders.filter((order) => order.status === "delivered");

    return [
      {
        label: "Novos",
        helper: "Aguardando confirmação",
        value: todayOrders.filter((order) => ["received", "accepted"].includes(order.status)).length,
        icon: ReceiptText,
        target: "new",
      },
      {
        label: "Em preparo",
        helper: `Tempo estimado ${bundle?.store.estimatedPrepMinutes || 0} min`,
        value: todayOrders.filter((order) => order.status === "preparing").length,
        icon: Clock3,
        target: "preparing",
      },
      {
        label: "Prontos",
        helper: "Aguardando entrega",
        value: todayOrders.filter((order) => order.status === "ready").length,
        icon: BellRing,
        target: "ready",
      },
      {
        label: "Finalizados",
        helper: "Hoje até agora",
        value: finalizedToday.length,
        icon: CheckCheck,
        target: "finalized",
      },
      {
        label: "Faturamento hoje",
        helper: `${finalizedToday.length} pedido${finalizedToday.length === 1 ? "" : "s"} entregue${
          finalizedToday.length === 1 ? "" : "s"
        }`,
        value: formatCurrency(finalizedToday.reduce((total, order) => total + order.total, 0)),
        icon: CircleDollarSign,
        target: "finance",
      },
    ];
  }, [bundle?.store.estimatedPrepMinutes, todayOrders]);

  const greeting =
    now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const storeName = bundle?.store.name || "loja";
  const storeLogoUrl = bundle?.theme.logoUrl || bundle?.store.logoUrl || "/placeholder-logo.svg";
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
  const showFeedback = (message: string, variant: "success" | "error" | "info" = "success") => {
    setFeedback({ message, variant });
  };
  const scrollToOrdersBoard = () => {
    window.requestAnimationFrame(() => {
      ordersBoardAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };
  const selectOrdersMetric = (group: OrderGroup) => {
    setActiveTab("orders");
    setOrdersBoardGroup(group);
    scrollToOrdersBoard();
  };
  const openFinanceFromMetric = () => {
    setActiveTab("finance");
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  };

  if (!isAuthReady) {
    return <LoadingState label="Carregando painel" />;
  }

  if (!user) {
    return (
      <ThemeScope theme={bundle?.theme || fallbackAdminTheme}>
        <main className="admin-shell admin-shell--locked">
          <form className="admin-shell__login" onSubmit={submitEmailLogin} aria-busy={Boolean(authLoading)}>
            <Coffee size={32} aria-hidden />
            <h1 className="admin-shell__login-title">Entrar no painel</h1>
            {loadError ? <p className="admin-shell__error">{loadError}</p> : null}
            <label className="admin-shell__field">
              <span>Email *</span>
              <input
                className="admin-shell__control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                disabled={Boolean(authLoading)}
                required
              />
            </label>
            <label className="admin-shell__field">
              <span>Senha *</span>
              <input
                className="admin-shell__control"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                disabled={Boolean(authLoading)}
                required
              />
            </label>
            {authError ? <p className="admin-shell__error">{authError}</p> : null}
            <button className="admin-shell__primary" type="submit" disabled={Boolean(authLoading)}>
              {authLoading === "email" ? <Loader2 className="admin-shell__spinner" size={17} aria-hidden /> : null}
              {authLoading === "email" ? "Entrando" : "Entrar"}
            </button>
            <button className="admin-shell__secondary" type="button" onClick={submitGoogleLogin} disabled={Boolean(authLoading)}>
              {authLoading === "google" ? <Loader2 className="admin-shell__spinner" size={17} aria-hidden /> : null}
              {authLoading === "google" ? "Conectando" : "Entrar com Google"}
            </button>
          </form>
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
            <button className="admin-shell__logout" type="button" onClick={() => setIsLogoutConfirmOpen(true)}>
              <span className="admin-shell__logout-logo">
                <Image
                  className="admin-shell__logout-image"
                  src={storeLogoUrl}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                />
              </span>
              <span className="admin-shell__user-copy">
                <strong className="admin-shell__sidebar-title">Sair</strong>
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
                  ? `${greeting}, ${bundle.store.name}`
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
                  <button
                    className={`admin-shell__metric${
                      metric.label === "Faturamento hoje" ? " admin-shell__metric--revenue" : ""
                    }`}
                    key={metric.label}
                    type="button"
                    onClick={() => {
                      if (metric.target === "finance") {
                        openFinanceFromMetric();
                        return;
                      }

                      selectOrdersMetric(metric.target);
                    }}
                  >
                    <span className="admin-shell__metric-icon">
                      <Icon size={20} aria-hidden />
                    </span>
                    <strong className="admin-shell__metric-value">{metric.value}</strong>
                    <span className="admin-shell__metric-label">{metric.label}</span>
                    <small className="admin-shell__metric-helper">{metric.helper}</small>
                  </button>
                );
              })}
            </section>
          ) : null}

          <div className="admin-shell__content">
            {activeTab === "orders" ? (
              <div className="admin-shell__orders-anchor" ref={ordersBoardAnchorRef}>
                <OrdersBoard
                  orders={todayOrders}
                  storeId={bundle.store.id}
                  activeGroup={ordersBoardGroup}
                  canFinalizeConfirmed
                  onActiveGroupChange={setOrdersBoardGroup}
                  onFeedback={showFeedback}
                />
              </div>
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
                additionals={bundle.additionals}
                menuItems={bundle.menuItems}
                onChanged={refreshBundle}
                onFeedback={showFeedback}
              />
            ) : null}
            {activeTab === "finance" ? (
              <FinancialReport storeId={bundle.store.id} tables={bundle.tables} />
            ) : null}
            {activeTab === "feedbacks" ? (
              <FeedbacksManager storeId={bundle.store.id} onFeedback={showFeedback} />
            ) : null}
            {activeTab === "settings" ? (
              <StoreSettings
                store={bundle.store}
                theme={bundle.theme}
                categories={bundle.categories}
                menuItems={bundle.menuItems}
                onSaved={refreshBundle}
                onFeedback={showFeedback}
              />
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

        {isLogoutConfirmOpen ? (
          <ConfirmDialog
            title="Sair do painel?"
            description={`Você vai encerrar a sessão administrativa de ${storeName}.`}
            confirmLabel="Sair"
            loadingLabel="Saindo"
            isLoading={isSigningOut}
            onCancel={() => {
              if (!isSigningOut) {
                setIsLogoutConfirmOpen(false);
              }
            }}
            onConfirm={() => void submitLogout()}
          />
        ) : null}

        {feedback ? (
          <Snackbar
            message={feedback.message}
            placement="top"
            variant={feedback.variant}
            onDismiss={() => setFeedback(null)}
          />
        ) : null}
      </>
    </ThemeScope>
  );
}
