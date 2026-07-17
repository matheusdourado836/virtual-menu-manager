# Relatório - Pendências do Painel Administrativo e Cardápio

## 1. Arquivos alterados

- `functions/src/index.ts`
- `src/components/admin-shell/AdminShell.tsx`
- `src/components/admin-shell/admin-shell.scss`
- `src/components/admin-order-dialog/AdminOrderDialog.tsx`
- `src/components/orders-board/OrdersBoard.tsx`
- `src/components/orders-board/orders-board.scss`
- `src/components/tables-manager/TablesManager.tsx`
- `src/components/menu-manager/MenuManager.tsx`
- `src/components/menu-manager/menu-manager.scss`
- `src/components/menu-item-editor-dialog/MenuItemEditorDialog.tsx`
- `src/components/menu-item-editor-dialog/menu-item-editor-dialog.scss`
- `src/components/store-settings/StoreSettings.tsx`
- `src/components/store-settings/store-settings.scss`
- `src/components/ui/confirm-dialog/ConfirmDialog.tsx`
- `src/components/ui/confirm-dialog/confirm-dialog.scss`
- `src/components/ui/snackbar/Snackbar.tsx`
- `src/components/ui/snackbar/snackbar.scss`
- `src/components/ui/status-pill/StatusPill.tsx`
- `src/lib/services/store-service.ts`
- `src/theme/scss/_tokens.scss`
- `src/types/menu.ts`
- `design-qa.md`

## 2. Problemas corrigidos

- Exclusão de pedidos agora exige confirmação destrutiva, mostra loading, bloqueia múltiplos cliques e exibe feedback.
- Pedidos criados pelo painel agora nascem com status `accepted` no payload salvo pela Cloud Function.
- Painel ganhou tela real de configurações da loja, com edição de dados básicos, operação e identidade visual.
- Itens do cardápio agora podem ser criados, editados e excluídos pelo painel.
- Criação e edição de item usam modal responsivo com validação.
- Ações importantes do painel compartilham feedback visual via snackbar e estados disabled/loading.
- Layout do admin foi ajustado para listas longas, evitando que a sidebar termine antes do conteúdo.
- Código antigo da tela de tema foi removido após substituição pela tela de configurações.

## 3. Componentes criados/alterados

- Criados:
  - `ConfirmDialog`
  - `MenuItemEditorDialog`
  - `StoreSettings`
- Alterados:
  - `AdminShell`
  - `OrdersBoard`
  - `MenuManager`
  - `AdminOrderDialog`
  - `TablesManager`
  - `Snackbar`
  - `StatusPill`

## 4. Services, helpers e funções alterados

- `store-service.ts` recebeu métodos para categorias, itens de cardápio e configurações da loja.
- `functions/src/index.ts` recebeu validações Zod e Cloud Functions para:
  - criar categoria;
  - criar item;
  - editar item;
  - excluir item;
  - salvar configurações da loja.
- `createAdminOrder` agora usa a regra de criação administrativa com status inicial aceito.
- `getStoreBundleBySlug` agora permite carregar loja inativa no painel sem liberar esse comportamento no cardápio público.

## 5. Fluxo de exclusão de pedidos

O usuário clica em excluir, abre um diálogo destrutivo, confirma a ação, o botão entra em loading e a ação fica bloqueada até a resposta da Cloud Function. Em sucesso, a lista é atualizada e uma snackbar confirma a exclusão. Em erro, a snackbar exibe mensagem amigável e a tela permanece consistente.

## 6. Status de pedidos criados pelo painel

Pedidos criados pelo painel são gravados na origem como `accepted`, com `acceptedAt` preenchido. Isso mantém listagem, filtros, badges, contadores e fluxo operacional consistentes sem correção apenas visual.

## 7. Tela de configurações da loja

A aba de configurações permite editar nome, descrição, telefone, endereço, horário, mensagem de pausa, tempo estimado, status operacional, URLs de logo/banner, cores, fonte, raio e estilo visual. O salvamento usa loading, validação básica e snackbar de sucesso/erro.

## 8. CRUD de itens do cardápio

A criação e edição usam o mesmo modal com nome, descrição, imagem, categoria, preço e disponibilidade. A exclusão usa confirmação destrutiva. Após sucesso, o painel recarrega o bundle da loja para refletir categorias e itens atualizados.

## 9. Feedback de ações no painel

Foi centralizado em `Snackbar`, agora com variantes `success`, `error` e `info`. Ações destrutivas usam `ConfirmDialog`; ações assíncronas usam spinners, disabled state e mensagens consistentes.

## 10. Banco, regras e segurança

As novas mutações administrativas foram implementadas como Cloud Functions com autenticação e validação. A criação administrativa de pedidos foi corrigida no backend, não apenas na interface.

Após a investigação do loading em Firestore, foi adicionada a Function autenticada `getAdminStoreBundle` para carregar loja ativa ou inativa no painel sem ampliar leitura pública em `stores`. A regra Firestore de `stores` também foi separada entre `get` e `list`: listagem pública fica limitada a documentos ativos; acesso administrativo completo fica por autenticação/Function.

## 11. Comandos executados e resultados

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm --prefix functions run build`: passou.
- `npm run build`: passou.
- `npm run test:e2e`: passou com 3 testes OK e 1 teste pulado por ausência de `E2E_ADMIN_EMAIL` e `E2E_ADMIN_PASSWORD`.
- Browser integrado em uma rota `http://localhost:3001/loja/[slug]/mesa/[tableId]`: renderizou o cardápio público no viewport `390 x 844`, com lista longa e dados reais.
- Browser integrado em `http://localhost:3001/admin`: renderizou a tela de login do painel.

## 12. Riscos ou pontos pendentes

- A validação E2E do login real ainda depende de `E2E_ADMIN_EMAIL` e `E2E_ADMIN_PASSWORD`.
- A tela de admin autenticada não pôde ser capturada em QA visual no mesmo estado final por falta de sessão/credenciais no browser de teste.
- Upload real de imagem não foi criado; o modal segue o padrão atual por URL de imagem.
- Para o ambiente Firebase remoto refletir a correção de permissão/admin bundle, é necessário publicar Functions e Firestore rules.
