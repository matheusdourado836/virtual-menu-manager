"use client";

import { MessageSquareText, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { LoadingState } from "@/components/ui/loading-state/LoadingState";
import { getFriendlyErrorMessage } from "@/lib/errors/friendly-error";
import { subscribeStoreFeedbacks } from "@/lib/services/store-service";
import type { StoreFeedback } from "@/types/menu";
import "./feedbacks-manager.scss";

interface FeedbacksManagerProps {
  storeId: string;
  onFeedback: (message: string, variant?: "success" | "error" | "info") => void;
}

const formatFeedbackDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));

export function FeedbacksManager({ storeId, onFeedback }: FeedbacksManagerProps) {
  const [feedbacks, setFeedbacks] = useState<StoreFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const onFeedbackRef = useRef(onFeedback);

  useEffect(() => {
    onFeedbackRef.current = onFeedback;
  }, [onFeedback]);

  useEffect(() => {
    return subscribeStoreFeedbacks(
      storeId,
      (updatedFeedbacks) => {
        setFeedbacks(updatedFeedbacks);
        setIsLoading(false);
      },
      (error) => {
        onFeedbackRef.current(getFriendlyErrorMessage(error, "Não foi possível carregar os feedbacks."), "error");
        setIsLoading(false);
      },
    );
  }, [storeId]);

  const averageRating = useMemo(() => {
    if (!feedbacks.length) {
      return 0;
    }

    return feedbacks.reduce((total, feedback) => total + feedback.rating, 0) / feedbacks.length;
  }, [feedbacks]);
  const commentsCount = feedbacks.filter((feedback) => feedback.comment?.trim()).length;
  const latestFeedback = feedbacks[0];

  if (isLoading) {
    return <LoadingState label="Carregando feedbacks" />;
  }

  return (
    <section className="feedbacks-manager">
      <div className="feedbacks-manager__summary" aria-label="Resumo dos feedbacks">
        <article className="feedbacks-manager__metric">
          <span className="feedbacks-manager__metric-icon feedbacks-manager__metric-icon--rating">
            <Star fill="currentColor" size={20} aria-hidden />
          </span>
          <strong className="feedbacks-manager__metric-value">
            {averageRating ? averageRating.toFixed(1).replace(".", ",") : "0,0"}
          </strong>
          <span className="feedbacks-manager__metric-label">Média geral</span>
        </article>

        <article className="feedbacks-manager__metric">
          <span className="feedbacks-manager__metric-icon">
            <MessageSquareText size={20} aria-hidden />
          </span>
          <strong className="feedbacks-manager__metric-value">{feedbacks.length}</strong>
          <span className="feedbacks-manager__metric-label">Avaliações</span>
        </article>

        <article className="feedbacks-manager__metric">
          <span className="feedbacks-manager__metric-icon">
            <MessageSquareText size={20} aria-hidden />
          </span>
          <strong className="feedbacks-manager__metric-value">{commentsCount}</strong>
          <span className="feedbacks-manager__metric-label">Comentários</span>
        </article>
      </div>

      {latestFeedback ? (
        <article className="feedbacks-manager__highlight">
          <span className="feedbacks-manager__eyebrow">Feedback mais recente</span>
          <strong className="feedbacks-manager__highlight-title">
            Pedido #{latestFeedback.orderCode} · {latestFeedback.customerName}
          </strong>
          <p className="feedbacks-manager__highlight-text">
            {latestFeedback.comment || "Cliente avaliou sem comentário."}
          </p>
        </article>
      ) : null}

      {feedbacks.length ? (
        <div className="feedbacks-manager__list">
          {feedbacks.map((feedback) => (
            <article className="feedbacks-manager__card" key={feedback.id}>
              <header className="feedbacks-manager__card-header">
                <div className="feedbacks-manager__card-heading">
                  <strong className="feedbacks-manager__customer">{feedback.customerName || "Cliente"}</strong>
                  <span className="feedbacks-manager__meta">
                    Pedido #{feedback.orderCode}
                    {feedback.tableLabel ? ` · ${feedback.tableLabel}` : ""} · {formatFeedbackDate(feedback.createdAt)}
                  </span>
                </div>
                <span className="feedbacks-manager__rating">
                  <Star className="feedbacks-manager__rating-star" fill="currentColor" size={16} aria-hidden />
                  {feedback.rating}/5
                </span>
              </header>
              <p className="feedbacks-manager__comment">
                {feedback.comment || "Sem comentário."}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<MessageSquareText size={28} aria-hidden />}
          title="Sem feedbacks ainda"
          text="As avaliações que os clientes deixam ao final do pedido aparecerão aqui."
        />
      )}
    </section>
  );
}
