"use client";

import { Download, Search, UserRound, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { OrderDetailsDialog } from "@/components/order-details-dialog/OrderDetailsDialog";
import { EmptyState } from "@/components/ui/empty-state/EmptyState";
import type { CustomerDirectoryItem } from "@/features/customer-directory/types/customer-directory.types";
import { buildCustomerDirectory } from "@/features/customer-directory/utils/customer-aggregation";
import { downloadCustomersCsv } from "@/features/customer-directory/utils/export-customers-csv";
import { formatDateTime } from "@/lib/utils/dates";
import { normalizeSearchText } from "@/lib/utils/search";
import { formatDateInput } from "@/features/financial-report/utils/financial-calculations";
import type { Order } from "@/types/menu";
import "./customer-directory.scss";

interface CustomerDirectoryProps {
  orders: Order[];
}

const matchesSearch = (customer: CustomerDirectoryItem, search: string) => {
  const normalizedSearch = normalizeSearchText(search);

  if (!normalizedSearch) {
    return true;
  }

  const phoneDigits = customer.phone.replace(/\D/g, "");
  const searchDigits = normalizedSearch.replace(/\D/g, "");

  return (
    normalizeSearchText(customer.name).includes(normalizedSearch)
    || (searchDigits.length > 0 && (phoneDigits.includes(searchDigits) || customer.id.includes(searchDigits)))
  );
};

export function CustomerDirectory({ orders }: CustomerDirectoryProps) {
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const directory = useMemo(() => buildCustomerDirectory(orders), [orders]);
  const customers = useMemo(
    () => directory.customers.filter((customer) => matchesSearch(customer, search)),
    [directory.customers, search],
  );
  const deliveredOrders = directory.customers.reduce((total, customer) => total + customer.deliveredOrderCount, 0);
  const exportFileName = `clientes-${formatDateInput(new Date())}.csv`;
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  return (
    <section className="customer-directory">
      <div className="customer-directory__toolbar">
        <label className="customer-directory__search">
          <span className="customer-directory__label">Buscar cliente</span>
          <span className="customer-directory__search-control">
            <Search size={17} aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome ou telefone"
              type="search"
            />
          </span>
        </label>

        <button
          className="customer-directory__export"
          type="button"
          onClick={() => downloadCustomersCsv(customers, exportFileName)}
          disabled={!customers.length}
        >
          <Download size={17} aria-hidden />
          Exportar CSV
        </button>
      </div>

      <div className="customer-directory__summary" aria-label="Resumo de clientes">
        <article className="customer-directory__card">
          <span className="customer-directory__card-icon">
            <UsersRound size={19} aria-hidden />
          </span>
          <span>
            <small>Clientes identificados</small>
            <strong>{directory.customers.length}</strong>
            <em>Com telefone válido</em>
          </span>
        </article>
        <article className="customer-directory__card">
          <span className="customer-directory__card-icon">
            <UserRound size={19} aria-hidden />
          </span>
          <span>
            <small>Pedidos finalizados</small>
            <strong>{deliveredOrders}</strong>
            <em>De clientes identificados</em>
          </span>
        </article>
        <article className="customer-directory__card customer-directory__card--muted">
          <span className="customer-directory__card-icon">
            <UserRound size={19} aria-hidden />
          </span>
          <span>
            <small>Sem telefone</small>
            <strong>{directory.ordersWithoutPhone}</strong>
            <em>Não entram na lista</em>
          </span>
        </article>
      </div>

      <p className="customer-directory__notice">
        Clientes são agrupados somente pelo telefone. Nomes iguais sem número não são associados entre si.
      </p>

      {!directory.customers.length ? (
        <EmptyState
          icon={<UsersRound size={28} aria-hidden />}
          title="Nenhum cliente identificado ainda"
          text="Pedidos com telefone válido aparecerão aqui automaticamente. Pedidos sem telefone não são agrupados por nome."
        />
      ) : !customers.length ? (
        <EmptyState
          icon={<Search size={28} aria-hidden />}
          title="Nenhum cliente encontrado"
          text="Tente buscar por outro nome ou número de telefone."
        />
      ) : (
        <div className="customer-directory__list" aria-label="Lista de clientes">
          <div className="customer-directory__list-header" aria-hidden="true">
            <span>Cliente</span>
            <span>Total de pedidos</span>
            <span>Primeiro pedido</span>
            <span>Último pedido</span>
          </div>
          {customers.map((customer) => (
            <article className="customer-directory__row" key={customer.id}>
              <div className="customer-directory__identity">
                <strong>{customer.name}</strong>
                <span>{customer.phone}</span>
              </div>
              <span className="customer-directory__field" data-label="Pedidos" aria-label={`Pedidos: ${customer.orderCount}`}>
                {customer.orderCount}
              </span>
              <span
                className="customer-directory__field"
                data-label="Primeiro pedido"
              >
                <button
                  className="customer-directory__order-link"
                  type="button"
                  onClick={() => setSelectedOrderId(customer.firstOrderId)}
                  aria-label={`Ver detalhes do primeiro pedido, número ${customer.firstOrderCode}, de ${formatDateTime(customer.firstOrderAt)}`}
                >
                  #{customer.firstOrderCode} · {formatDateTime(customer.firstOrderAt)}
                </button>
              </span>
              <span
                className="customer-directory__field"
                data-label="Último pedido"
              >
                <button
                  className="customer-directory__order-link"
                  type="button"
                  onClick={() => setSelectedOrderId(customer.lastOrderId)}
                  aria-label={`Ver detalhes do último pedido, número ${customer.lastOrderCode}, de ${formatDateTime(customer.lastOrderAt)}`}
                >
                  #{customer.lastOrderCode} · {formatDateTime(customer.lastOrderAt)}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}

      {selectedOrder ? <OrderDetailsDialog order={selectedOrder} onClose={() => setSelectedOrderId("")} /> : null}
    </section>
  );
}
