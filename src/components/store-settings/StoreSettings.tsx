"use client";

import { Clock3, Eye, ImagePlus, Loader2, Palette, Save, Store as StoreIcon, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type FormEvent } from "react";
import { updateStoreSettings, uploadStoreAsset } from "@/lib/services/store-service";
import { formatPhoneInput, isValidBrazilianPhone } from "@/lib/utils/input-format";
import { formatCurrency } from "@/lib/utils/money";
import {
  deriveStoreThemeColors,
  getReadableBrandColor,
  getReadableTextColor,
  mixHex,
  rgbToHex,
} from "@/lib/utils/theme-colors";
import type { Category, MenuItem, Store, StoreTheme } from "@/types/menu";
import "./store-settings.scss";

interface StoreSettingsProps {
  store: Store;
  theme: StoreTheme;
  categories: Category[];
  menuItems: MenuItem[];
  onSaved: () => void | Promise<void>;
  onFeedback: (message: string, variant?: "success" | "error" | "info") => void;
}

interface StoreSettingsForm {
  name: string;
  description: string;
  phone: string;
  address: string;
  pausedMessage: string;
  isActive: boolean;
  isAcceptingOrders: boolean;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  borderRadius: string;
  visualStyle: string;
}

interface OpeningDay {
  id: string;
  label: string;
  shortLabel: string;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
}

interface PreviewMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
}

type PreviewThemeStyle = CSSProperties & Record<`--${string}`, string>;

const maxImageSizeInBytes = 5 * 1024 * 1024;

const weekDays = [
  { id: "monday", label: "Segunda-feira", shortLabel: "Seg" },
  { id: "tuesday", label: "Terça-feira", shortLabel: "Ter" },
  { id: "wednesday", label: "Quarta-feira", shortLabel: "Qua" },
  { id: "thursday", label: "Quinta-feira", shortLabel: "Qui" },
  { id: "friday", label: "Sexta-feira", shortLabel: "Sex" },
  { id: "saturday", label: "Sábado", shortLabel: "Sáb" },
  { id: "sunday", label: "Domingo", shortLabel: "Dom" },
];

const colorFields = [
  ["primaryColor", "Primária"],
  ["secondaryColor", "Secundária"],
] as const;

const createDefaultOpeningDays = (): OpeningDay[] =>
  weekDays.map((day, index) => ({
    ...day,
    isOpen: index < 5,
    opensAt: "09:00",
    closesAt: "17:00",
  }));

const parseOpeningHours = (openingHours?: string): OpeningDay[] => {
  const trimmedOpeningHours = openingHours?.trim();

  if (!trimmedOpeningHours) {
    return createDefaultOpeningDays();
  }

  const parsedDays = weekDays.map((day) => ({
    ...day,
    isOpen: false,
    opensAt: "09:00",
    closesAt: "17:00",
  }));
  let hasParsedDay = false;

  trimmedOpeningHours.split(",").forEach((rawPart) => {
    const match = rawPart.trim().match(/^(Seg|Ter|Qua|Qui|Sex|Sáb|Dom)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/u);

    if (!match) {
      return;
    }

    const [, shortLabel, opensAt, closesAt] = match;
    const day = parsedDays.find((candidate) => candidate.shortLabel === shortLabel);

    if (day) {
      day.isOpen = true;
      day.opensAt = opensAt;
      day.closesAt = closesAt;
      hasParsedDay = true;
    }
  });

  return hasParsedDay ? parsedDays : createDefaultOpeningDays();
};

const serializeOpeningHours = (openingDays: OpeningDay[]) => {
  const openDays = openingDays.filter((day) => day.isOpen);

  if (!openDays.length) {
    return "Fechado";
  }

  return openDays.map((day) => `${day.shortLabel} ${day.opensAt}-${day.closesAt}`).join(", ");
};

const getColorScore = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = (r + g + b) / 3;

  return saturation * 2 + (brightness > 34 && brightness < 236 ? 1 : 0);
};

const getPaletteFromLogo = (file: File): Promise<Partial<StoreSettingsForm>> =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const sampleSize = 48;

      canvas.width = sampleSize;
      canvas.height = sampleSize;

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        resolve({});
        return;
      }

      context.drawImage(image, 0, 0, sampleSize, sampleSize);

      const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
      const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];

        if (alpha < 128) {
          continue;
        }

        const color = {
          r: pixels[index],
          g: pixels[index + 1],
          b: pixels[index + 2],
        };
        const brightness = (color.r + color.g + color.b) / 3;

        if (brightness < 24 || brightness > 244 || getColorScore(color) < 0.24) {
          continue;
        }

        const bucket = {
          r: Math.round(color.r / 24) * 24,
          g: Math.round(color.g / 24) * 24,
          b: Math.round(color.b / 24) * 24,
        };
        const key = `${bucket.r}-${bucket.g}-${bucket.b}`;
        const current = buckets.get(key);

        buckets.set(key, current ? { ...current, count: current.count + 1 } : { ...bucket, count: 1 });
      }

      URL.revokeObjectURL(objectUrl);

      const rankedColors = [...buckets.values()]
        .sort((first, second) => second.count * getColorScore(second) - first.count * getColorScore(first))
        .slice(0, 2)
        .map(rgbToHex);

      const primaryColor = rankedColors[0];

      if (!primaryColor) {
        resolve({});
        return;
      }

      const secondaryColor = rankedColors[1] || mixHex(primaryColor, getReadableTextColor(primaryColor), 0.42);

      resolve({
        primaryColor,
        secondaryColor,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    };

    image.src = objectUrl;
  });

const fallbackPreviewItems: PreviewMenuItem[] = [
  {
    id: "preview-1",
    name: "Cappuccino clássico",
    description: "Café cremoso preparado na hora.",
    price: 12,
    imageUrl: "/placeholder-item.svg",
  },
  {
    id: "preview-2",
    name: "Pão de queijo",
    description: "Tradicional, quentinho e crocante.",
    price: 8,
    imageUrl: "/placeholder-item.svg",
  },
  {
    id: "preview-3",
    name: "Sanduíche artesanal",
    description: "Ingredientes frescos e molho da casa.",
    price: 18,
    imageUrl: "/placeholder-item.svg",
  },
];

export function StoreSettings({ store, theme, categories, menuItems, onSaved, onFeedback }: StoreSettingsProps) {
  const [form, setForm] = useState<StoreSettingsForm>({
    name: store.name,
    description: store.description,
    phone: formatPhoneInput(store.phone || ""),
    address: store.address || "",
    pausedMessage: store.pausedMessage,
    isActive: store.isActive,
    isAcceptingOrders: store.isAcceptingOrders,
    logoUrl: theme.logoUrl || store.logoUrl || "",
    bannerUrl: theme.bannerUrl || "",
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    fontFamily: theme.fontFamily,
    borderRadius: String(theme.borderRadius),
    visualStyle: theme.visualStyle,
  });
  const [openingDays, setOpeningDays] = useState(() => parseOpeningHours(store.openingHours));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState("");
  const [draggingAsset, setDraggingAsset] = useState<"logo" | "banner" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExtractingPalette, setIsExtractingPalette] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [error, setError] = useState("");

  const logoDisplayUrl = logoPreviewUrl || form.logoUrl;
  const bannerDisplayUrl = bannerPreviewUrl || form.bannerUrl;
  const previewLogoUrl = logoDisplayUrl || "/placeholder-logo.svg";
  const previewBannerUrl = bannerDisplayUrl || "/placeholder-banner.svg";
  const derivedThemeColors = useMemo(
    () => deriveStoreThemeColors(form.primaryColor, form.secondaryColor),
    [form.primaryColor, form.secondaryColor],
  );
  const previewCategories = useMemo(() => {
    const activeCategories = categories.filter((category) => category.isActive).slice(0, 2);

    return activeCategories.length ? activeCategories.map((category) => category.name) : ["Lanches", "Bebidas"];
  }, [categories]);
  const previewMenuItems = useMemo<PreviewMenuItem[]>(() => {
    const activeCategoryIds = new Set(categories.filter((category) => category.isActive).map((category) => category.id));
    const activeItems = menuItems
      .filter((item) => item.isAvailable && (!activeCategoryIds.size || activeCategoryIds.has(item.categoryId)))
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        imageUrl: item.imageUrl || "/placeholder-item.svg",
      }));

    return activeItems.length ? activeItems : fallbackPreviewItems;
  }, [categories, menuItems]);
  const previewBorderRadius = Number(form.borderRadius);
  const previewThemeStyle: PreviewThemeStyle = {
    "--color-primary": form.primaryColor,
    "--color-secondary": form.secondaryColor,
    "--color-accent": derivedThemeColors.accentColor,
    "--color-on-primary": getReadableTextColor(form.primaryColor),
    "--color-on-secondary": getReadableTextColor(form.secondaryColor),
    "--color-primary-readable": getReadableBrandColor(form.primaryColor, derivedThemeColors.surfaceColor),
    "--color-secondary-readable": getReadableBrandColor(form.secondaryColor, derivedThemeColors.surfaceColor),
    "--color-background": derivedThemeColors.backgroundColor,
    "--color-surface": derivedThemeColors.surfaceColor,
    "--color-surface-strong": derivedThemeColors.surfaceColor,
    "--color-text": derivedThemeColors.textColor,
    "--color-text-muted": derivedThemeColors.mutedTextColor,
    "--color-border": derivedThemeColors.borderColor,
    "--focus-ring": `0 0 0 3px color-mix(in srgb, ${form.secondaryColor} 26%, transparent)`,
    "--radius-md": `${Number.isFinite(previewBorderRadius) ? previewBorderRadius : theme.borderRadius}px`,
    "--radius-sm": `${Math.max(4, (Number.isFinite(previewBorderRadius) ? previewBorderRadius : theme.borderRadius) - 2)}px`,
    "--radius-lg": `${(Number.isFinite(previewBorderRadius) ? previewBorderRadius : theme.borderRadius) + 6}px`,
    "--font-sans": form.fontFamily,
  };

  useEffect(() => {
    return () => {
      if (logoPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }
    };
  }, [bannerPreviewUrl]);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPreviewOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPreviewOpen]);

  const updateField = <Field extends keyof StoreSettingsForm>(field: Field, value: StoreSettingsForm[Field]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateOpeningDay = (dayId: string, patch: Partial<Pick<OpeningDay, "isOpen" | "opensAt" | "closesAt">>) => {
    setOpeningDays((current) => current.map((day) => (day.id === dayId ? { ...day, ...patch } : day)));
  };

  const selectImageFile = async (assetType: "logo" | "banner", file?: File) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }

    if (file.size > maxImageSizeInBytes) {
      setError("A imagem deve ter até 5 MB.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setError("");

    if (assetType === "logo") {
      setLogoFile(file);
      setLogoPreviewUrl(previewUrl);
      setIsExtractingPalette(true);

      try {
        const extractedPalette = await getPaletteFromLogo(file);

        if (Object.keys(extractedPalette).length) {
          setForm((current) => ({ ...current, ...extractedPalette }));
          onFeedback("Paleta atualizada a partir da logo.", "info");
        }
      } finally {
        setIsExtractingPalette(false);
      }

      return;
    }

    setBannerFile(file);
    setBannerPreviewUrl(previewUrl);
  };

  const removeImageAsset = (assetType: "logo" | "banner") => {
    if (isSaving) {
      return;
    }

    setDraggingAsset(null);
    setError("");

    if (assetType === "logo") {
      setLogoFile(null);
      setLogoPreviewUrl("");
      updateField("logoUrl", "");
      return;
    }

    setBannerFile(null);
    setBannerPreviewUrl("");
    updateField("bannerUrl", "");
  };

  const dragImageAsset = (assetType: "logo" | "banner", event: DragEvent<HTMLElement>) => {
    event.preventDefault();

    if (!isSaving) {
      setDraggingAsset(assetType);
    }
  };

  const leaveImageAsset = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDraggingAsset(null);
  };

  const dropImageAsset = (assetType: "logo" | "banner", event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDraggingAsset(null);

    if (isSaving) {
      return;
    }

    void selectImageFile(assetType, event.dataTransfer.files[0]);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const borderRadius = Number(form.borderRadius);
    const hasInvalidOpeningHours = openingDays.some(
      (day) => day.isOpen && (!day.opensAt || !day.closesAt || day.opensAt >= day.closesAt),
    );

    if (!form.name.trim() || Number.isNaN(borderRadius)) {
      setError("Informe o nome da loja antes de salvar.");
      return;
    }

    if (form.phone.trim() && !isValidBrazilianPhone(form.phone)) {
      setError("Informe um telefone válido com DDD.");
      return;
    }

    if (hasInvalidOpeningHours) {
      setError("Revise os horários: a abertura precisa ser antes do fechamento.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const [uploadedLogoUrl, uploadedBannerUrl] = await Promise.all([
        logoFile ? uploadStoreAsset(store.id, logoFile, "logo") : Promise.resolve(form.logoUrl.trim()),
        bannerFile ? uploadStoreAsset(store.id, bannerFile, "banner") : Promise.resolve(form.bannerUrl.trim()),
      ]);

      await updateStoreSettings(store.id, {
        store: {
          name: form.name.trim(),
          description: form.description.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          openingHours: serializeOpeningHours(openingDays),
          pausedMessage: form.pausedMessage.trim(),
          isActive: form.isActive,
          isAcceptingOrders: form.isAcceptingOrders,
        },
        theme: {
          logoUrl: uploadedLogoUrl,
          bannerUrl: uploadedBannerUrl,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          accentColor: derivedThemeColors.accentColor,
          backgroundColor: derivedThemeColors.backgroundColor,
          surfaceColor: derivedThemeColors.surfaceColor,
          textColor: derivedThemeColors.textColor,
          mutedTextColor: derivedThemeColors.mutedTextColor,
          borderColor: derivedThemeColors.borderColor,
          fontFamily: form.fontFamily.trim(),
          borderRadius,
          visualStyle: form.visualStyle.trim(),
        },
      });

      setForm((current) => ({
        ...current,
        logoUrl: uploadedLogoUrl,
        bannerUrl: uploadedBannerUrl,
      }));
      setLogoFile(null);
      setBannerFile(null);
      setLogoPreviewUrl("");
      setBannerPreviewUrl("");
      await onSaved();
      onFeedback("Configurações salvas.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Não foi possível salvar as configurações.";
      setError(message);
      onFeedback(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="store-settings">
      <form className="store-settings__panel" onSubmit={submit}>
        <div className="store-settings__section">
          <div className="store-settings__section-heading">
            <StoreIcon size={18} aria-hidden />
            <h2 className="store-settings__section-title">Dados da loja</h2>
          </div>

          <label className="store-settings__field">
            <span className="store-settings__label">Nome *</span>
            <input
              className="store-settings__control"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
            />
          </label>

          <label className="store-settings__field">
            <span className="store-settings__label">Descrição</span>
            <textarea
              className="store-settings__textarea"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={3}
            />
          </label>

          <div className="store-settings__grid">
            <label className="store-settings__field">
              <span className="store-settings__label">Telefone/WhatsApp</span>
              <input
                className="store-settings__control"
                value={form.phone}
                onChange={(event) => updateField("phone", formatPhoneInput(event.target.value))}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={15}
              />
            </label>

            <label className="store-settings__field">
              <span className="store-settings__label">Endereço</span>
              <input
                className="store-settings__control"
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="store-settings__section">
          <div className="store-settings__section-heading">
            <ImagePlus size={18} aria-hidden />
            <h2 className="store-settings__section-title">Imagens da loja</h2>
          </div>

          <div className="store-settings__uploads">
            <label className="store-settings__upload-field">
              <span className="store-settings__label">Logo</span>
              <span
                className={`store-settings__upload store-settings__upload--logo${
                  draggingAsset === "logo" ? " store-settings__upload--dragging" : ""
                }`}
                onDragEnter={(event) => dragImageAsset("logo", event)}
                onDragOver={(event) => dragImageAsset("logo", event)}
                onDragLeave={leaveImageAsset}
                onDrop={(event) => dropImageAsset("logo", event)}
              >
                <input
                  className="store-settings__file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void selectImageFile("logo", event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  disabled={isSaving}
                />
                {logoDisplayUrl ? (
                  <Image
                    className="store-settings__upload-preview"
                    src={logoDisplayUrl}
                    alt=""
                    width={92}
                    height={92}
                    unoptimized
                  />
                ) : (
                  <span className="store-settings__upload-placeholder">
                    <ImagePlus size={20} aria-hidden />
                    Selecionar
                  </span>
                )}
                {logoDisplayUrl ? (
                  <button
                    className="store-settings__remove-image"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      removeImageAsset("logo");
                    }}
                    disabled={isSaving}
                    aria-label="Remover logo"
                    title="Remover logo"
                  >
                    <X size={16} aria-hidden />
                  </button>
                ) : null}
              </span>
            </label>

            <label className="store-settings__upload-field">
              <span className="store-settings__label">Banner</span>
              <span
                className={`store-settings__upload store-settings__upload--banner${
                  draggingAsset === "banner" ? " store-settings__upload--dragging" : ""
                }`}
                onDragEnter={(event) => dragImageAsset("banner", event)}
                onDragOver={(event) => dragImageAsset("banner", event)}
                onDragLeave={leaveImageAsset}
                onDrop={(event) => dropImageAsset("banner", event)}
              >
                <input
                  className="store-settings__file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void selectImageFile("banner", event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  disabled={isSaving}
                />
                {bannerDisplayUrl ? (
                  <Image
                    className="store-settings__upload-preview"
                    src={bannerDisplayUrl}
                    alt=""
                    width={640}
                    height={280}
                    unoptimized
                  />
                ) : (
                  <span className="store-settings__upload-placeholder">
                    <ImagePlus size={20} aria-hidden />
                    Selecionar banner
                  </span>
                )}
                {bannerDisplayUrl ? (
                  <button
                    className="store-settings__remove-image"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      removeImageAsset("banner");
                    }}
                    disabled={isSaving}
                    aria-label="Remover banner"
                    title="Remover banner"
                  >
                    <X size={16} aria-hidden />
                  </button>
                ) : null}
              </span>
            </label>
          </div>
        </div>

        <div className="store-settings__section">
          <div className="store-settings__section-heading">
            <Clock3 size={18} aria-hidden />
            <h2 className="store-settings__section-title">Horário de funcionamento</h2>
          </div>

          <div className="store-settings__hours">
            {openingDays.map((day) => (
              <div
                className={`store-settings__day-row${day.isOpen ? "" : " store-settings__day-row--closed"}`}
                key={day.id}
              >
                <label className="store-settings__day-switch">
                  <input
                    className="store-settings__switch-input"
                    type="checkbox"
                    checked={day.isOpen}
                    onChange={(event) => updateOpeningDay(day.id, { isOpen: event.target.checked })}
                  />
                  <span className="store-settings__switch-control" />
                  <span className="store-settings__day-name">{day.label}</span>
                </label>

                {day.isOpen ? (
                  <div className="store-settings__time-range">
                    <input
                      className="store-settings__time-control"
                      type="time"
                      value={day.opensAt}
                      onChange={(event) => updateOpeningDay(day.id, { opensAt: event.target.value })}
                      aria-label={`Horário de abertura de ${day.label}`}
                      required={day.isOpen}
                    />
                    <span className="store-settings__time-separator">até</span>
                    <input
                      className="store-settings__time-control"
                      type="time"
                      value={day.closesAt}
                      onChange={(event) => updateOpeningDay(day.id, { closesAt: event.target.value })}
                      aria-label={`Horário de fechamento de ${day.label}`}
                      required={day.isOpen}
                    />
                  </div>
                ) : (
                  <span className="store-settings__closed-text">Fechado</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="store-settings__section">
          <h2 className="store-settings__section-title">Operação</h2>
          <div className="store-settings__switches">
            <label className="store-settings__switch">
              <input
                className="store-settings__switch-input"
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateField("isActive", event.target.checked)}
              />
              <span className="store-settings__switch-control" />
              <span className="store-settings__switch-copy">Loja ativa</span>
            </label>

            <label className="store-settings__switch">
              <input
                className="store-settings__switch-input"
                type="checkbox"
                checked={form.isAcceptingOrders}
                onChange={(event) => updateField("isAcceptingOrders", event.target.checked)}
              />
              <span className="store-settings__switch-control" />
              <span className="store-settings__switch-copy">Aceitando pedidos</span>
            </label>
          </div>

          <label className="store-settings__field">
            <span className="store-settings__label">Mensagem de pausa</span>
            <input
              className="store-settings__control"
              value={form.pausedMessage}
              onChange={(event) => updateField("pausedMessage", event.target.value)}
            />
          </label>
        </div>

        <div className="store-settings__section">
          <div className="store-settings__section-heading">
            <Palette size={18} aria-hidden />
            <h2 className="store-settings__section-title">Cores da marca</h2>
          </div>
          <p className="store-settings__palette-note">
            Escolha a cor principal e a cor de apoio. Fundos, bordas e textos são ajustados automaticamente para manter leitura.
          </p>

          <div className="store-settings__colors">
            {colorFields.map(([field, label]) => (
              <label className="store-settings__color-field" key={field}>
                <span className="store-settings__label">{label} *</span>
                <input
                  className="store-settings__color-control"
                  type="color"
                  value={form[field]}
                  onChange={(event) => updateField(field, event.target.value)}
                  required
                />
              </label>
            ))}
          </div>

          {isExtractingPalette ? (
            <p className="store-settings__palette-note">
              <Loader2 className="store-settings__spinner" size={15} aria-hidden /> Lendo cores da logo...
            </p>
          ) : null}
        </div>

        <footer className="store-settings__footer">
          {error ? <p className="store-settings__error">{error}</p> : null}
          <button className="store-settings__save" type="submit" disabled={isSaving || isExtractingPalette}>
            {isSaving ? <Loader2 className="store-settings__spinner" size={17} aria-hidden /> : <Save size={17} aria-hidden />}
            {isSaving ? "Salvando" : "Salvar configurações"}
          </button>
        </footer>
      </form>

      <button
        className="store-settings__preview-fab"
        type="button"
        onClick={() => setIsPreviewOpen(true)}
        aria-haspopup="dialog"
      >
        <Eye size={18} aria-hidden />
        Pré-visualizar
      </button>

      {isPreviewOpen ? (
        <div className="store-settings__preview-overlay" role="presentation" onMouseDown={() => setIsPreviewOpen(false)}>
          <section
            className="store-settings__preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="store-settings-preview-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="store-settings__preview-header">
              <div className="store-settings__preview-heading">
                <span className="store-settings__label">Pré-visualização</span>
                <h2 className="store-settings__section-title" id="store-settings-preview-title">
                  Como a loja vai aparecer
                </h2>
              </div>
              <button
                className="store-settings__preview-close"
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                aria-label="Fechar pré-visualização"
              >
                <X size={20} aria-hidden />
              </button>
            </header>

            <div className="store-settings__phone" style={previewThemeStyle}>
              <div className="store-settings__phone-screen">
                <header className="store-settings__phone-header">
                  <div className="store-settings__phone-banner">
                    <Image
                      className="store-settings__phone-banner-image"
                      src={previewBannerUrl}
                      alt=""
                      width={360}
                      height={160}
                      unoptimized
                    />
                  </div>

                  <div className="store-settings__phone-brand">
                    <Image className="store-settings__phone-logo" src={previewLogoUrl} alt="" width={56} height={56} unoptimized />
                    <span className="store-settings__phone-brand-copy">
                      <small className="store-settings__phone-eyebrow">Cardápio digital</small>
                      <strong className="store-settings__phone-title">{form.name || "Nome da loja"}</strong>
                      <span className="store-settings__phone-description">
                        {form.description || "Descrição curta da loja aparece aqui."}
                      </span>
                    </span>
                    <span className="store-settings__phone-status">
                      <span className="store-settings__phone-status-dot" />
                      Aberto
                    </span>
                  </div>
                </header>

                <nav className="store-settings__phone-tabs" aria-label="Categorias do preview">
                  {previewCategories.map((categoryName, index) => (
                    <span
                      className={`store-settings__phone-tab${index === 0 ? " store-settings__phone-tab--active" : ""}`}
                      key={categoryName}
                    >
                      {categoryName}
                    </span>
                  ))}
                </nav>

                <section className="store-settings__phone-items" aria-label="Itens do preview">
                  <div className="store-settings__phone-section">
                    <span className="store-settings__phone-eyebrow">Explore o cardápio</span>
                    <strong className="store-settings__phone-section-title">{previewCategories[0]}</strong>
                  </div>

                  {previewMenuItems.map((item) => (
                    <article className="store-settings__phone-item" key={item.id}>
                      <Image
                        className="store-settings__phone-item-image"
                        src={item.imageUrl || "/placeholder-item.svg"}
                        alt=""
                        width={72}
                        height={72}
                        unoptimized
                      />
                      <span className="store-settings__phone-item-copy">
                        <strong className="store-settings__phone-item-title">{item.name}</strong>
                        <small className="store-settings__phone-item-description">{item.description}</small>
                        <span className="store-settings__phone-item-footer">
                          <strong className="store-settings__phone-price">{formatCurrency(item.price)}</strong>
                          <span className="store-settings__phone-add">Adicionar</span>
                        </span>
                      </span>
                    </article>
                  ))}
                </section>

                <footer className="store-settings__phone-cart">
                  <span className="store-settings__phone-cart-count">{previewMenuItems.length}</span>
                  <span className="store-settings__phone-cart-copy">
                    <strong>Ver carrinho</strong>
                    <small className="store-settings__phone-cart-detail">
                      {previewMenuItems.length} itens selecionados
                    </small>
                  </span>
                  <strong>{formatCurrency(previewMenuItems.reduce((total, item) => total + item.price, 0))}</strong>
                </footer>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
