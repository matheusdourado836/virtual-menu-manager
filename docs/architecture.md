# Arquitetura

O projeto usa Next.js App Router com duas superfícies:

- **Cliente público**: rotas `/loja/[slug]`, `/loja/[slug]/mesa/[tableId]`, rotas de carrinho e `/pedido/[orderId]`.
- **Operação/admin**: rota `/admin`, protegida por Firebase Auth.

## Camadas

- `src/types`: contratos de loja, tema, cardápio, carrinho e pedido.
- `src/data`: seed versionado. O seed inicial vem da imagem do cardápio.
- `src/lib/firebase`: inicialização do SDK client.
- `src/lib/services`: acesso direto a Firestore e Cloud Functions.
- `src/lib/validators`: schemas Zod compartilháveis.
- `src/components`: componentes de UI por domínio, cada um com SCSS colocalizado.
- `src/theme/scss`: tokens globais, base e mixins.
- `functions`: Cloud Functions para operações sensíveis.
- `firebase`: Firestore/Storage rules e indexes.
- `scripts`: seed administrativo.

## Produção

- o cardápio lê `stores/{storeId}` e subcoleções;
- o carrinho é persistido no navegador por loja/mesa até o envio do pedido;
- pedidos são criados pela Function `createOrder`;
- o painel assina `stores/{storeId}/orders`;
- status é alterado pela Function `updateOrderStatus`;
- Auth e Rules restringem acesso administrativo por loja.
