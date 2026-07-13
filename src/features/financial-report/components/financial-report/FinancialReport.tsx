"use client";

import {
  CalendarDays,
  CircleDollarSign,
  Download,
  Loader2,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import { getFinancialReportOrders } from "@/features/financial-report/services/financial-report-service";
import type { FinancialReportFilters } from "@/features/financial-report/types/financial-report.types";
import {
  calculateFinancialReport,
  formatDateInput,
  getDefaultFinancialFilters,
  getFinancialReportRange,
} from "@/features/financial-report/utils/financial-calculations";
import { downloadFinancialCsv } from "@/features/financial-report/utils/export-financial-csv";
import { formatDateTime } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/money";
import { getPaymentMethodLabel } from "@/lib/utils/payment";
import type { Order, Table } from "@/types/menu";
import "./financial-report.scss";

interface FinancialReportProps {
  storeId: string;
  tables: Table[];
}

const periodOptions: Array<{ value: FinancialReportFilters["period"]; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_7_days", label: "Últimos 7 dias" },
  { value: "current_month", label: "Mês atual" },
  { value: "custom", label: "Personalizado" },
];

const statusOptions: Array<{ value: FinancialReportFilters["status"]; label: string }> = [
  { value: "delivered", label: "Finalizados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "all", label: "Todos" },
];

const paymentOptions: Array<{ value: FinancialReportFilters["paymentMethod"]; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "pix_on_pickup", label: "Pix" },
  { value: "card_on_pickup", label: "Cartão" },
  { value: "cash_on_pickup", label: "Dinheiro" },
  { value: "pay_on_pickup", label: "Pagar na retirada" },
];

const originOptions: Array<{ value: FinancialReportFilters["origin"]; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "table", label: "QR Code/mesa" },
  { value: "manual", label: "Manual/balcão" },
];

const formatPercent = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);

const getShortDate = () => formatDateInput(new Date());

export function FinancialReport({ storeId, tables }: FinancialReportProps) {
  const [filters, setFilters] = useState<FinancialReportFilters>(() => getDefaultFinancialFilters());
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const range = useMemo(() => getFinancialReportRange(filters), [filters]);
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();
  const report = useMemo(
    () => calculateFinancialReport(orders, filters, range.groupBy),
    [filters, orders, range.groupBy],
  );
  const largestTimeTotal = Math.max(...report.salesByTime.map((bucket) => bucket.total), 0);

  useEffect(() => {
    let isMounted = true;

    getFinancialReportOrders({ storeId, start: new Date(startIso), end: new Date(endIso) })
      .then((loadedOrders) => {
        if (!isMounted) {
          return;
        }

        setOrders(loadedOrders);
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }

        setOrders([]);
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o relatório.");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [endIso, refreshKey, startIso, storeId]);

  const updateFilter = <Key extends keyof FinancialReportFilters>(key: Key, value: FinancialReportFilters[Key]) => {
    if (["period", "startDate", "endDate"].includes(key)) {
      setIsLoading(true);
      setError("");
    }

    setFilters((current) => ({ ...current, [key]: value }));
  };

  const exportCsv = () => {
    downloadFinancialCsv(report.orders, `relatorio-financeiro-${getShortDate()}.csv`);
  };

  const summaryCards = [
    {
      label: "Faturamento bruto",
      value: formatCurrency(report.summary.grossRevenue),
      helper: "Pedidos finalizados no filtro",
      icon: CircleDollarSign,
    },
    {
      label: "Pedidos finalizados",
      value: String(report.summary.finalizedOrders),
      helper: "Status finalizado",
      icon: ReceiptText,
    },
    {
      label: "Ticket médio",
      value: formatCurrency(report.summary.averageTicket),
      helper: "Faturamento / pedidos",
      icon: TrendingUp,
    },
    {
      label: "Itens vendidos",
      value: String(report.summary.soldItems),
      helper: "Quantidade total",
      icon: ShoppingBag,
    },
    {
      label: "Receita em adicionais",
      value: formatCurrency(report.summary.additionalRevenue),
      helper: "Extras nos pedidos finalizados",
      icon: CircleDollarSign,
    },
    {
      label: "Adicionais vendidos",
      value: String(report.summary.soldAdditionals),
      helper: `${report.summary.ordersWithAdditionals} pedidos com adicionais`,
      icon: ShoppingBag,
    },
    {
      label: "Pedidos cancelados",
      value: String(report.summary.cancelledOrders),
      helper: "Status cancelado",
      icon: XCircle,
    },
    {
      label: "Valor cancelado",
      value: formatCurrency(report.summary.cancelledValue),
      helper: "Pedidos cancelados",
      icon: CircleDollarSign,
    },
    {
      label: "Produto mais vendido",
      value: report.summary.topProductName,
      helper: "Por quantidade",
      icon: PackageCheck,
    },
    {
      label: "Adicional mais usado",
      value: report.summary.topAdditionalName,
      helper: "Por quantidade",
      icon: PackageCheck,
    },
    {
      label: "Melhor horário",
      value: report.summary.bestSalesTime,
      helper: report.groupBy === "hour" ? "Agrupado por hora" : "Agrupado por dia",
      icon: CalendarDays,
    },
  ];

  return (
    <section className="financial-report">
      <div className="financial-report__filters">
        <label className="financial-report__field">
          <span className="financial-report__label">Período</span>
          <select
            className="financial-report__control"
            value={filters.period}
            onChange={(event) => updateFilter("period", event.target.value as FinancialReportFilters["period"])}
          >
            {periodOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {filters.period === "custom" ? (
          <>
            <label className="financial-report__field">
              <span className="financial-report__label">Início *</span>
              <input
                className="financial-report__control"
                type="date"
                value={filters.startDate}
                onChange={(event) => updateFilter("startDate", event.target.value)}
                required
              />
            </label>
            <label className="financial-report__field">
              <span className="financial-report__label">Fim *</span>
              <input
                className="financial-report__control"
                type="date"
                value={filters.endDate}
                onChange={(event) => updateFilter("endDate", event.target.value)}
                required
              />
            </label>
          </>
        ) : null}

        <label className="financial-report__field">
          <span className="financial-report__label">Status</span>
          <select
            className="financial-report__control"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value as FinancialReportFilters["status"])}
          >
            {statusOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="financial-report__field">
          <span className="financial-report__label">Pagamento</span>
          <select
            className="financial-report__control"
            value={filters.paymentMethod}
            onChange={(event) =>
              updateFilter("paymentMethod", event.target.value as FinancialReportFilters["paymentMethod"])
            }
          >
            {paymentOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="financial-report__field">
          <span className="financial-report__label">Origem</span>
          <select
            className="financial-report__control"
            value={filters.origin}
            onChange={(event) => updateFilter("origin", event.target.value as FinancialReportFilters["origin"])}
          >
            {originOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="financial-report__field">
          <span className="financial-report__label">Mesa</span>
          <select
            className="financial-report__control"
            value={filters.tableId}
            onChange={(event) => updateFilter("tableId", event.target.value)}
          >
            <option value="all">Todas</option>
            {tables.map((table) => (
              <option value={table.id} key={table.id}>
                {table.label}
              </option>
            ))}
          </select>
        </label>

        <button className="financial-report__export" type="button" onClick={exportCsv} disabled={!report.orders.length}>
          <Download size={17} aria-hidden />
          Exportar CSV
        </button>
      </div>

      {error ? (
        <div className="financial-report__error">
          <strong>Erro ao carregar relatório</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="financial-report__summary" aria-label="Resumo financeiro">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <article className="financial-report__card" key={card.label}>
              <span className="financial-report__card-icon">
                <Icon size={19} aria-hidden />
              </span>
              <span className="financial-report__card-copy">
                <small className="financial-report__card-label">{card.label}</small>
                <strong className="financial-report__card-value">{card.value}</strong>
                <small className="financial-report__card-helper">{card.helper}</small>
              </span>
            </article>
          );
        })}
      </div>

      {isLoading ? (
        <div className="financial-report__loading">
          <Loader2 className="financial-report__spinner" size={22} aria-hidden />
          Carregando relatório financeiro
        </div>
      ) : !report.orders.length ? (
        <EmptyState
          icon={<ReceiptText size={28} aria-hidden />}
          title="Nenhuma venda encontrada para este período"
          text="Ajuste os filtros ou selecione outro período para visualizar dados financeiros."
        />
      ) : (
        <div className="financial-report__sections">
          <section className="financial-report__panel">
            <div className="financial-report__panel-heading">
              <h2 className="financial-report__panel-title">Vendas por forma de pagamento</h2>
              <span className="financial-report__panel-subtitle">{report.summary.finalizedOrders} pedidos finalizados</span>
            </div>
            <div className="financial-report__rows">
              {report.paymentBreakdown.map((row) => (
                <div className="financial-report__row" key={row.paymentMethod}>
                  <strong className="financial-report__row-title">{row.label}</strong>
                  <span className="financial-report__row-value" data-label="Pedidos">
                    {row.orders} pedidos
                  </span>
                  <span className="financial-report__row-value" data-label="Total">
                    {formatCurrency(row.total)}
                  </span>
                  <span className="financial-report__row-value" data-label="Participação">
                    {formatPercent(row.percentage)}%
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="financial-report__panel">
            <div className="financial-report__panel-heading">
              <h2 className="financial-report__panel-title">Vendas por horário</h2>
              <span className="financial-report__panel-subtitle">
                {report.groupBy === "hour" ? "Agrupado por hora" : "Agrupado por dia"}
              </span>
            </div>
            <div className="financial-report__bars">
              {report.salesByTime.length ? (
                report.salesByTime.map((bucket) => (
                  <div className="financial-report__bar-row" key={bucket.key}>
                    <span className="financial-report__bar-label">{bucket.label}</span>
                    <progress
                      className="financial-report__bar"
                      value={bucket.total}
                      max={largestTimeTotal || 1}
                    />
                    <span className="financial-report__bar-value">
                      {formatCurrency(bucket.total)} · {bucket.orders} pedidos
                    </span>
                  </div>
                ))
              ) : (
                <p className="financial-report__empty-text">Nenhuma venda finalizada neste período.</p>
              )}
            </div>
          </section>

          <section className="financial-report__panel">
            <div className="financial-report__panel-heading">
              <h2 className="financial-report__panel-title">Produtos mais vendidos</h2>
              <span className="financial-report__panel-subtitle">Ordenado por quantidade</span>
            </div>
            <div className="financial-report__rows">
              {report.topProducts.length ? (
                report.topProducts.slice(0, 8).map((product) => (
                  <div className="financial-report__row" key={product.menuItemId}>
                    <strong className="financial-report__row-title">{product.name}</strong>
                    <span className="financial-report__row-value" data-label="Quantidade">
                      {product.quantity} vendidos
                    </span>
                    <span className="financial-report__row-value" data-label="Total">
                      {formatCurrency(product.total)}
                    </span>
                    <span className="financial-report__row-value" data-label="Participação">
                      {formatPercent(product.percentage)}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="financial-report__empty-text">Nenhum produto vendido neste período.</p>
              )}
            </div>
          </section>

          <section className="financial-report__panel">
            <div className="financial-report__panel-heading">
              <h2 className="financial-report__panel-title">Adicionais mais usados</h2>
              <span className="financial-report__panel-subtitle">
                {formatCurrency(report.summary.additionalRevenue)} em adicionais
              </span>
            </div>
            <div className="financial-report__rows">
              {report.topAdditionals.length ? (
                report.topAdditionals.slice(0, 8).map((additional) => (
                  <div className="financial-report__row" key={additional.choiceId}>
                    <strong className="financial-report__row-title">{additional.name}</strong>
                    <span className="financial-report__row-value" data-label="Quantidade">
                      {additional.quantity} vendidos
                    </span>
                    <span className="financial-report__row-value" data-label="Total">
                      {formatCurrency(additional.total)}
                    </span>
                    <span className="financial-report__row-value" data-label="Participação">
                      {formatPercent(additional.percentage)}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="financial-report__empty-text">Nenhum adicional vendido neste período.</p>
              )}
            </div>
          </section>

          <section className="financial-report__panel">
            <div className="financial-report__panel-heading">
              <h2 className="financial-report__panel-title">Cancelamentos</h2>
              <span className="financial-report__panel-subtitle">
                {formatCurrency(report.summary.cancelledValue)} em pedidos cancelados
              </span>
            </div>
            <div className="financial-report__rows">
              {report.cancelledOrders.length ? (
                report.cancelledOrders.slice(0, 8).map((order) => (
                  <div className="financial-report__row" key={order.id}>
                    <strong className="financial-report__row-title">#{order.code}</strong>
                    <span className="financial-report__row-value" data-label="Cliente">
                      {order.customerName}
                    </span>
                    <span className="financial-report__row-value" data-label="Total">
                      {formatCurrency(order.total)}
                    </span>
                    <span className="financial-report__row-value" data-label="Motivo">
                      {order.cancelReason ?? "Não informado"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="financial-report__empty-text">Nenhum pedido cancelado neste período.</p>
              )}
            </div>
          </section>

          <section className="financial-report__panel financial-report__panel--wide">
            <div className="financial-report__panel-heading">
              <h2 className="financial-report__panel-title">Pedidos filtrados</h2>
              <span className="financial-report__panel-subtitle">{report.orders.length} pedidos no CSV</span>
            </div>
            <div className="financial-report__orders">
              {report.orders.slice(0, 10).map((order) => (
                <article className="financial-report__order" key={order.id}>
                  <strong className="financial-report__row-title">#{order.code}</strong>
                  <span className="financial-report__order-field" data-label="Cliente">
                    {order.customerName}
                  </span>
                  <span className="financial-report__order-field" data-label="Pagamento">
                    {getPaymentMethodLabel(order.paymentMethod)}
                  </span>
                  <span className="financial-report__order-field" data-label="Criado em">
                    {formatDateTime(order.createdAt)}
                  </span>
                  <strong className="financial-report__order-total" data-label="Total">
                    {formatCurrency(order.total)}
                  </strong>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <button
        className="financial-report__refresh"
        type="button"
        onClick={() => {
          setIsLoading(true);
          setError("");
          setRefreshKey((current) => current + 1);
        }}
        disabled={isLoading}
      >
        <RefreshCw size={17} aria-hidden />
        Atualizar relatório
      </button>
    </section>
  );
}
