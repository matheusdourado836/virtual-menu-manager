"use client";

import { Clock3, Eye, ImagePlus, Loader2, Palette, Save, Store as StoreIcon, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { updateStoreSettings, uploadStoreAsset } from "@/lib/services/store-service";
import type { Store, StoreTheme } from "@/types/menu";
import "./store-settings.scss";

interface StoreSettingsProps {
  store: Store;
  theme: StoreTheme;
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
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
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

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

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
  ["accentColor", "Destaque"],
  ["backgroundColor", "Fundo"],
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

const getColorChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const rgbToHex = ({ r, g, b }: RgbColor) =>
  `#${[r, g, b].map((channel) => getColorChannel(channel).toString(16).padStart(2, "0")).join("")}`;

const hexToRgb = (hex: string): RgbColor | null => {
  const normalized = hex.trim().replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const mixHex = (baseHex: string, targetHex: string, targetWeight: number) => {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);

  if (!base || !target) {
    return baseHex;
  }

  return rgbToHex({
    r: base.r * (1 - targetWeight) + target.r * targetWeight,
    g: base.g * (1 - targetWeight) + target.g * targetWeight,
    b: base.b * (1 - targetWeight) + target.b * targetWeight,
  });
};

const getColorScore = ({ r, g, b }: RgbColor) => {
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
      const buckets = new Map<string, RgbColor & { count: number }>();

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
        .slice(0, 3)
        .map(rgbToHex);

      const primaryColor = rankedColors[0];

      if (!primaryColor) {
        resolve({});
        return;
      }

      const secondaryColor = rankedColors[1] || mixHex(primaryColor, "#171817", 0.32);
      const accentColor = rankedColors[2] || mixHex(primaryColor, "#ffffff", 0.3);

      resolve({
        primaryColor,
        secondaryColor,
        accentColor,
        backgroundColor: mixHex(primaryColor, "#ffffff", 0.94),
        surfaceColor: "#ffffff",
        textColor: "#171817",
        mutedTextColor: "#686966",
        borderColor: mixHex(primaryColor, "#ffffff", 0.8),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    };

    image.src = objectUrl;
  });

export function StoreSettings({ store, theme, onSaved, onFeedback }: StoreSettingsProps) {
  const [form, setForm] = useState<StoreSettingsForm>({
    name: store.name,
    description: store.description,
    phone: store.phone || "",
    address: store.address || "",
    pausedMessage: store.pausedMessage,
    isActive: store.isActive,
    isAcceptingOrders: store.isAcceptingOrders,
    logoUrl: theme.logoUrl || store.logoUrl || "",
    bannerUrl: theme.bannerUrl || "",
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    backgroundColor: theme.backgroundColor,
    surfaceColor: theme.surfaceColor,
    textColor: theme.textColor,
    mutedTextColor: theme.mutedTextColor,
    borderColor: theme.borderColor,
    fontFamily: theme.fontFamily,
    borderRadius: String(theme.borderRadius),
    visualStyle: theme.visualStyle,
  });
  const [openingDays, setOpeningDays] = useState(() => parseOpeningHours(store.openingHours));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExtractingPalette, setIsExtractingPalette] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [error, setError] = useState("");

  const logoDisplayUrl = logoPreviewUrl || form.logoUrl || "/placeholder-logo.svg";
  const bannerDisplayUrl = bannerPreviewUrl || form.bannerUrl || "/placeholder-banner.svg";

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
          accentColor: form.accentColor,
          backgroundColor: form.backgroundColor,
          surfaceColor: form.surfaceColor,
          textColor: form.textColor,
          mutedTextColor: form.mutedTextColor,
          borderColor: form.borderColor,
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
            <span className="store-settings__label">Nome</span>
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
                onChange={(event) => updateField("phone", event.target.value)}
                inputMode="tel"
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
              <span className="store-settings__upload store-settings__upload--logo">
                <input
                  className="store-settings__file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => void selectImageFile("logo", event.target.files?.[0])}
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
              </span>
            </label>

            <label className="store-settings__upload-field">
              <span className="store-settings__label">Banner</span>
              <span className="store-settings__upload store-settings__upload--banner">
                <input
                  className="store-settings__file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => void selectImageFile("banner", event.target.files?.[0])}
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
                    />
                    <span className="store-settings__time-separator">até</span>
                    <input
                      className="store-settings__time-control"
                      type="time"
                      value={day.closesAt}
                      onChange={(event) => updateOpeningDay(day.id, { closesAt: event.target.value })}
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
            Ao enviar uma logo, o sistema tenta sugerir uma paleta automaticamente. Você ainda pode ajustar as cores.
          </p>

          <div className="store-settings__colors">
            {colorFields.map(([field, label]) => (
              <label className="store-settings__color-field" key={field}>
                <span className="store-settings__label">{label}</span>
                <input
                  className="store-settings__color-control"
                  type="color"
                  value={form[field]}
                  onChange={(event) => updateField(field, event.target.value)}
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

            <div className="store-settings__preview">
              <Image
                className="store-settings__preview-image"
                src={bannerDisplayUrl}
                alt=""
                width={960}
                height={540}
                unoptimized
              />
              <div className="store-settings__preview-card">
                <Image className="store-settings__logo" src={logoDisplayUrl} alt="" width={56} height={56} unoptimized />
                <span className="store-settings__preview-copy">
                  <strong className="store-settings__preview-title">{form.name || "Nome da loja"}</strong>
                  <small className="store-settings__preview-text">{form.visualStyle || "Identidade visual"}</small>
                </span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
