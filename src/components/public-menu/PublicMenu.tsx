"use client";

import { AlertTriangle, Clock3, Coffee, MapPin, Plus, Search, ShoppingBag, Utensils, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MenuItemDialog } from "@/components/menu-item-dialog/MenuItemDialog";
import { ThemeScope } from "@/components/theme-scope/ThemeScope";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import { Snackbar } from "@/components/ui/snackbar/Snackbar";
import {
  createCartLine,
  describeCartReconciliation,
  getCartQuantity,
  getCartSubtotal,
  readStoredCart,
  reconcileCartWithMenu,
  writeStoredCart,
} from "@/features/cart/cart-utils";
import {
  readAndClearMenuNotice,
  readStoredOrderReference,
} from "@/features/order-tracking/order-tracking-storage";
import { reportCartReconciliation } from "@/lib/errors/order-submission-error";
import { getStoreBundleBySlug } from "@/lib/services/store-service";
import { getStoreOpenState } from "@/lib/utils/opening-hours";
import { formatCurrency } from "@/lib/utils/money";
import { normalizeSearchText } from "@/lib/utils/search";
import type { CartLine, CartSelectedOption, MenuItem, StoreBundle } from "@/types/menu";
import "./public-menu.scss";

interface PublicMenuProps {
  slug: string;
  tableId?: string;
}

const minuteInMilliseconds = 60 * 1000;

const getVisibleCategories = (bundle: StoreBundle) => {
  const availableCategoryIds = new Set(
    bundle.menuItems
      .filter((item) => item.isAvailable)
      .map((item) => item.categoryId),
  );

  return bundle.categories.filter((category) => category.isActive && availableCategoryIds.has(category.id));
};

export function PublicMenu({ slug, tableId }: PublicMenuProps) {
  const [bundle, setBundle] = useState<StoreBundle | null>(null);
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [previewItem, setPreviewItem] = useState<MenuItem | null>(null);
  const [trackedOrderId, setTrackedOrderId] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedCart, setHasLoadedCart] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;

    getStoreBundleBySlug(slug)
      .then((loadedBundle) => {
        if (!isMounted) {
          return;
        }

        const loadedTable = loadedBundle?.tables.find((candidate) => candidate.id === tableId && candidate.isActive);
        const storedCart = loadedBundle ? readStoredCart(loadedBundle.store.id, loadedTable?.id) : [];
        const reconciliation = loadedBundle
          ? reconcileCartWithMenu(storedCart, loadedBundle.menuItems)
          : { lines: [], changes: [] };
        const navigationNotice = loadedBundle
          ? readAndClearMenuNotice(
            loadedTable?.id ? `/loja/${loadedBundle.store.slug}/mesa/${loadedTable.id}` : `/loja/${loadedBundle.store.slug}`,
          ) || ""
          : "";
        const reconciliationNotice = reconciliation.changes.length
          ? describeCartReconciliation(reconciliation.changes)
          : "";

        setBundle(loadedBundle);
        setSelectedCategory(loadedBundle ? getVisibleCategories(loadedBundle)[0]?.id || "" : "");
        setCartLines(reconciliation.lines);
        setTrackedOrderId(
          loadedBundle ? readStoredOrderReference(loadedBundle.store.id, loadedTable?.id)?.orderId || "" : "",
        );
        setNotice([navigationNotice, reconciliationNotice].filter(Boolean).join(" "));

        if (loadedBundle && reconciliation.changes.length) {
          writeStoredCart(loadedBundle.store.id, loadedTable?.id, reconciliation.lines);
          reportCartReconciliation(reconciliation.changes, {
            storeId: loadedBundle.store.id,
            storeSlug: loadedBundle.store.slug,
            tableId: loadedTable?.id,
          });
        }

        setHasLoadedCart(Boolean(loadedBundle));
        setLoadError("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setBundle(null);
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o cardápio.");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [slug, tableId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), minuteInMilliseconds);
    return () => window.clearInterval(intervalId);
  }, []);

  const table = useMemo(
    () => bundle?.tables.find((candidate) => candidate.id === tableId && candidate.isActive),
    [bundle, tableId],
  );
  const visibleCategories = useMemo(
    () => bundle ? getVisibleCategories(bundle) : [],
    [bundle],
  );

  const normalizedSearch = normalizeSearchText(search);
  const visibleItems = useMemo(() => {
    if (!bundle) {
      return [];
    }

    const available = bundle.menuItems.filter((item) => item.isAvailable);

    if (normalizedSearch) {
      return available.filter(
        (item) =>
          normalizeSearchText(item.name).includes(normalizedSearch)
          || normalizeSearchText(item.description).includes(normalizedSearch),
      );
    }

    return available.filter((item) => item.categoryId === selectedCategory);
  }, [bundle, selectedCategory, normalizedSearch]);

  useEffect(() => {
    if (!bundle || !hasLoadedCart) {
      return;
    }

    writeStoredCart(bundle.store.id, table?.id, cartLines);
  }, [bundle, cartLines, hasLoadedCart, table?.id]);

  const toggleOption = (item: MenuItem, groupId: string, choiceId: string, maxSelected: number) => {
    const current = selectedOptions[item.id] || [];
    const group = item.optionsGroups.find((candidate) => candidate.id === groupId);

    if (!group) {
      return;
    }

    const groupChoiceIds = group.choices.map((choice) => choice.id);
    const selectedInGroup = current.filter((candidate) => groupChoiceIds.includes(candidate));

    const next = current.includes(choiceId)
      ? current.filter((candidate) => candidate !== choiceId)
      : selectedInGroup.length < maxSelected
        ? [...current, choiceId]
        : current;

    setSelectedOptions((state) => ({
      ...state,
      [item.id]: next,
    }));
  };

  const getSelectedOptionDetails = (item: MenuItem): CartSelectedOption[] => {
    const optionIds = selectedOptions[item.id] || [];

    return item.optionsGroups.flatMap((group) =>
      group.choices
        .filter((choice) => optionIds.includes(choice.id))
        .map((choice) => ({
          groupId: group.id,
          groupName: group.name,
          choiceId: choice.id,
          choiceName: choice.name,
          price: choice.price,
        })),
    );
  };

  const addItem = (item: MenuItem, quantity = 1) => {
    const line = {
      ...createCartLine(item, getSelectedOptionDetails(item), notes[item.id]),
      quantity,
    };
    setCartLines((lines) => [...lines, line]);
    setSelectedOptions((state) => ({ ...state, [item.id]: [] }));
    setNotes((state) => ({ ...state, [item.id]: "" }));
    setSelectedItem(null);
  };

  const closeItem = useCallback(() => setSelectedItem(null), []);
  const closePreview = useCallback(() => setPreviewItem(null), []);

  useEffect(() => {
    if (!previewItem) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreview();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closePreview, previewItem]);

  const cartLink = table?.id ? `/loja/${slug}/mesa/${table.id}/carrinho` : `/loja/${slug}/carrinho`;
  const cartQuantity = getCartQuantity(cartLines);
  const cartSubtotal = getCartSubtotal(cartLines);
  const activeCategory = visibleCategories.find((category) => category.id === selectedCategory);
  const totalAvailableItems = bundle ? bundle.menuItems.filter((item) => item.isAvailable).length : 0;
  const storeOpenState = useMemo(() => (bundle ? getStoreOpenState(bundle.store, now) : null), [bundle, now]);
  const canReceiveOrders = storeOpenState?.isOpen ?? false;

  const openItem = (item: MenuItem) => {
    if (!canReceiveOrders) {
      setNotice(storeOpenState?.message || "");
      return;
    }

    setSelectedItem(item);
  };

  const openItemImage = (event: MouseEvent<HTMLButtonElement>, item: MenuItem) => {
    event.stopPropagation();
    setPreviewItem(item);
  };

  if (isLoading) {
    return <LoadingState label="Carregando cardápio" />;
  }

  if (!bundle) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} aria-hidden />}
        title={loadError ? "Não foi possível carregar o cardápio" : "Loja não encontrada"}
        text={loadError || "Verifique se o QR Code ou link está correto."}
      />
    );
  }

  return (
    <ThemeScope theme={bundle.theme}>
      <main className="public-menu">
        <header className="public-menu__header">
          <div className="public-menu__header-main">
            <div className="public-menu__brand">
              <Image
                className="public-menu__logo"
                src={bundle.theme.logoUrl || "/placeholder-logo.svg"}
                width={56}
                height={56}
                alt=""
                unoptimized
              />
              <div className="public-menu__brand-copy">
                <h1 className="public-menu__title">{bundle.store.name}</h1>
              </div>
            </div>

            <span
              className={`public-menu__status${
                canReceiveOrders ? " public-menu__status--online" : " public-menu__status--paused"
              }`}
            >
              <span className="public-menu__status-dot" />
              {canReceiveOrders ? "Aberto" : "Fechado"}
            </span>
          </div>

          <p className="public-menu__description">{bundle.store.description}</p>

          <div className="public-menu__meta">
            <span className="public-menu__meta-item">
              <MapPin size={15} aria-hidden />
              {table?.label || "Retirada no balcão"}
            </span>
          </div>
        </header>

        {visibleCategories.length ? (
          <nav className="public-menu__category-tabs" role="tablist" aria-label="Categorias">
            {visibleCategories.map((category) => (
              <button
                className={`public-menu__category-tab${
                  selectedCategory === category.id ? " public-menu__category-tab--active" : ""
                }`}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category.id}
                key={category.id}
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSearch("");
                }}
              >
                {category.name === "Bebidas" ? <Coffee size={16} aria-hidden /> : <Utensils size={16} aria-hidden />}
                {category.name}
              </button>
            ))}
          </nav>
        ) : null}

        {totalAvailableItems > 6 ? (
          <div className="public-menu__search">
            <Search size={18} aria-hidden />
            <input
              className="public-menu__search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              type="search"
              placeholder="Buscar no cardápio"
              aria-label="Buscar no cardápio"
            />
          </div>
        ) : null}

        {!canReceiveOrders ? (
          <div className="public-menu__notice" role="status">
            <AlertTriangle size={18} aria-hidden />
            {storeOpenState?.message}
          </div>
        ) : null}

        <section className="public-menu__content" aria-label="Itens do cardápio">
          <header className="public-menu__section-header">
            <div>
              <span className="public-menu__section-eyebrow">Explore o cardápio</span>
              <h2 className="public-menu__section-title">
                {normalizedSearch ? "Resultados" : activeCategory?.name || "Itens"}
              </h2>
            </div>
            <span className="public-menu__section-count">
              {visibleItems.length} {visibleItems.length === 1 ? "item" : "itens"}
            </span>
          </header>

          <div className="public-menu__items">
            {visibleItems.map((item) => (
              <article
                className="public-menu__item"
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openItem(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openItem(item);
                  }
                }}
                aria-label={`Adicionar ${item.name}`}
              >
                <button
                  className="public-menu__item-image-button"
                  type="button"
                  onClick={(event) => openItemImage(event, item)}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={`Ver foto de ${item.name}`}
                  title={`Ver foto de ${item.name}`}
                >
                  <Image
                    className="public-menu__item-image"
                    src={item.imageUrl || "/placeholder-item.svg"}
                    alt=""
                    width={92}
                    height={92}
                    sizes="92px"
                  />
                </button>
                <div className="public-menu__item-body">
                  <div className="public-menu__item-copy">
                    <h3 className="public-menu__item-title">{item.name}</h3>
                    <p className="public-menu__item-description">{item.description}</p>
                  </div>

                  <div className="public-menu__item-footer">
                    <strong className="public-menu__price">{formatCurrency(item.price)}</strong>
                    <span className="public-menu__customize" aria-hidden="true">
                      <Plus size={16} aria-hidden />
                      Adicionar
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {normalizedSearch && !visibleItems.length ? (
            <p className="public-menu__no-results" role="status">
              Nenhum item encontrado para “{search.trim()}”.
            </p>
          ) : null}
        </section>

        {cartQuantity > 0 ? (
          <Link className="public-menu__cart-bar" href={cartLink} aria-label="Ir para o carrinho">
            <span className="public-menu__cart-icon">
              <ShoppingBag size={18} aria-hidden />
              <span className="public-menu__cart-count">{cartQuantity}</span>
            </span>
            <span className="public-menu__cart-label">
              <strong>Ver carrinho</strong>
              <small className="public-menu__cart-detail">
                {cartQuantity} {cartQuantity === 1 ? "item" : "itens"}
              </small>
            </span>
            <strong className="public-menu__cart-total">{formatCurrency(cartSubtotal)}</strong>
          </Link>
        ) : null}

        {trackedOrderId ? (
          <Link
            className={`public-menu__order-fab${
              cartQuantity > 0 ? " public-menu__order-fab--with-cart" : ""
            }`}
            href={`/pedido/${trackedOrderId}`}
            aria-label="Acompanhar pedido"
            title="Acompanhar pedido"
          >
            <Clock3 size={22} aria-hidden />
            <span className="public-menu__order-fab-label">Acompanhar pedido</span>
          </Link>
        ) : null}

        {selectedItem ? (
          <MenuItemDialog
            item={selectedItem}
            note={notes[selectedItem.id] || ""}
            selectedOptionIds={selectedOptions[selectedItem.id] || []}
            isImagePreviewOpen={Boolean(previewItem)}
            onClose={closeItem}
            onImagePreview={() => setPreviewItem(selectedItem)}
            onNoteChange={(note) => setNotes((state) => ({ ...state, [selectedItem.id]: note }))}
            onToggleOption={(groupId, choiceId, maxSelected) =>
              toggleOption(selectedItem, groupId, choiceId, maxSelected)
            }
            onAdd={(quantity) => {
              if (!canReceiveOrders) {
                setNotice(storeOpenState?.message || "");
                setSelectedItem(null);
                return;
              }

              addItem(selectedItem, quantity);
            }}
          />
        ) : null}

        {previewItem ? (
          <div className="public-menu__image-preview" role="presentation" onMouseDown={closePreview}>
            <section
              className="public-menu__image-preview-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`Foto de ${previewItem.name}`}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                className="public-menu__image-preview-close"
                type="button"
                onClick={closePreview}
                aria-label="Fechar foto"
              >
                <X size={20} aria-hidden />
              </button>
              <Image
                className="public-menu__image-preview-image"
                src={previewItem.imageUrl || "/placeholder-item.svg"}
                alt={previewItem.name}
                width={960}
                height={960}
                unoptimized
              />
              <strong className="public-menu__image-preview-title">{previewItem.name}</strong>
            </section>
          </div>
        ) : null}

        {notice ? <Snackbar message={notice} onDismiss={() => setNotice("")} /> : null}
      </main>
    </ThemeScope>
  );
}
