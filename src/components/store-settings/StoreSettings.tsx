"use client";

import { Loader2, Save, Store as StoreIcon } from "lucide-react";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { updateStoreSettings } from "@/lib/services/store-service";
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
  openingHours: string;
  pausedMessage: string;
  estimatedPrepMinutes: string;
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

export function StoreSettings({ store, theme, onSaved, onFeedback }: StoreSettingsProps) {
  const [form, setForm] = useState<StoreSettingsForm>({
    name: store.name,
    description: store.description,
    phone: store.phone || "",
    address: store.address || "",
    openingHours: store.openingHours || "",
    pausedMessage: store.pausedMessage,
    estimatedPrepMinutes: String(store.estimatedPrepMinutes),
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = <Field extends keyof StoreSettingsForm>(field: Field, value: StoreSettingsForm[Field]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const estimatedPrepMinutes = Number(form.estimatedPrepMinutes);
    const borderRadius = Number(form.borderRadius);

    if (!form.name.trim() || Number.isNaN(estimatedPrepMinutes) || Number.isNaN(borderRadius)) {
      setError("Revise nome, tempo médio e raio antes de salvar.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      await updateStoreSettings(store.id, {
        store: {
          name: form.name.trim(),
          description: form.description.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          openingHours: form.openingHours.trim(),
          pausedMessage: form.pausedMessage.trim(),
          estimatedPrepMinutes,
          isActive: form.isActive,
          isAcceptingOrders: form.isAcceptingOrders,
        },
        theme: {
          logoUrl: form.logoUrl.trim(),
          bannerUrl: form.bannerUrl.trim(),
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
    <form className="store-settings" onSubmit={submit}>
      <section className="store-settings__preview">
        <Image
          className="store-settings__preview-image"
          src={form.bannerUrl || "/placeholder-banner.svg"}
          alt=""
          width={960}
          height={540}
        />
        <div className="store-settings__preview-card">
          <Image
            className="store-settings__logo"
            src={form.logoUrl || "/placeholder-logo.svg"}
            alt=""
            width={56}
            height={56}
          />
          <span className="store-settings__preview-copy">
            <strong className="store-settings__preview-title">{form.name || "Nome da loja"}</strong>
            <small className="store-settings__preview-text">{form.visualStyle || "Identidade visual"}</small>
          </span>
        </div>
      </section>

      <section className="store-settings__panel">
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
              <span className="store-settings__label">Horário</span>
              <input
                className="store-settings__control"
                value={form.openingHours}
                onChange={(event) => updateField("openingHours", event.target.value)}
                placeholder="Ex.: 08h às 18h"
              />
            </label>
          </div>

          <label className="store-settings__field">
            <span className="store-settings__label">Endereço</span>
            <input
              className="store-settings__control"
              value={form.address}
              onChange={(event) => updateField("address", event.target.value)}
            />
          </label>
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

          <div className="store-settings__grid">
            <label className="store-settings__field">
              <span className="store-settings__label">Tempo médio (min)</span>
              <input
                className="store-settings__control"
                value={form.estimatedPrepMinutes}
                onChange={(event) => updateField("estimatedPrepMinutes", event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="store-settings__field">
              <span className="store-settings__label">Mensagem de pausa</span>
              <input
                className="store-settings__control"
                value={form.pausedMessage}
                onChange={(event) => updateField("pausedMessage", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="store-settings__section">
          <h2 className="store-settings__section-title">Tema e imagens</h2>
          <div className="store-settings__grid">
            <label className="store-settings__field">
              <span className="store-settings__label">Logo</span>
              <input
                className="store-settings__control"
                value={form.logoUrl}
                onChange={(event) => updateField("logoUrl", event.target.value)}
              />
            </label>
            <label className="store-settings__field">
              <span className="store-settings__label">Banner</span>
              <input
                className="store-settings__control"
                value={form.bannerUrl}
                onChange={(event) => updateField("bannerUrl", event.target.value)}
              />
            </label>
          </div>

          <div className="store-settings__colors">
            {(
              [
                ["primaryColor", "Primária"],
                ["secondaryColor", "Secundária"],
                ["accentColor", "Destaque"],
                ["backgroundColor", "Fundo"],
                ["surfaceColor", "Superfície"],
                ["textColor", "Texto"],
                ["mutedTextColor", "Texto suave"],
                ["borderColor", "Borda"],
              ] as const
            ).map(([field, label]) => (
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

          <div className="store-settings__grid">
            <label className="store-settings__field">
              <span className="store-settings__label">Fonte</span>
              <input
                className="store-settings__control"
                value={form.fontFamily}
                onChange={(event) => updateField("fontFamily", event.target.value)}
              />
            </label>
            <label className="store-settings__field">
              <span className="store-settings__label">Raio</span>
              <input
                className="store-settings__control"
                value={form.borderRadius}
                onChange={(event) => updateField("borderRadius", event.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>

          <label className="store-settings__field">
            <span className="store-settings__label">Preset visual</span>
            <input
              className="store-settings__control"
              value={form.visualStyle}
              onChange={(event) => updateField("visualStyle", event.target.value)}
            />
          </label>
        </div>

        <footer className="store-settings__footer">
          {error ? <p className="store-settings__error">{error}</p> : null}
          <button className="store-settings__save" type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="store-settings__spinner" size={17} aria-hidden /> : <Save size={17} aria-hidden />}
            {isSaving ? "Salvando" : "Salvar configurações"}
          </button>
        </footer>
      </section>
    </form>
  );
}
