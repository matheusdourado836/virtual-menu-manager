# Virtual Menu Manager

MVP de pedidos por QR Code para foodtrucks/restaurantes pequenos, com cardápio público, carrinho, acompanhamento de pedido, painel administrativo em tempo real e estrutura Firebase multi-loja.

## Stack escolhida

- **Next.js App Router + React + TypeScript**: entrega web mobile rápida para cliente e painel responsivo no mesmo projeto.
- **Firebase Auth, Firestore, Storage e Cloud Functions**: autenticação, realtime, regras de segurança e cálculo de pedido no backend.
- **SCSS com tokens dinâmicos**: o prompt sugeria Tailwind, mas este projeto tem regra local de SCSS/BEM. A decisão foi usar CSS variables derivadas do tema da loja para evitar cor fixa espalhada no código e manter multi-tenant.
- **Zod**: valida payloads de pedido no front e nas Functions.
- **Sentry**: DSN configurado via `.env.example` e inicialização em client/server/edge.

## Rotas

- `/loja/[slug]`: cardápio público de um restaurante.
- `/loja/[slug]/mesa/[tableId]`: cardápio vinculado a uma mesa.
- `/loja/[slug]/carrinho`: carrinho para retirada no balcão.
- `/loja/[slug]/mesa/[tableId]/carrinho`: carrinho vinculado a uma mesa.
- `/pedido/[orderId]`: acompanhamento do pedido.
- `/admin`: entrada do painel administrativo.
- `/admin/[slug]`: painel operacional de qualquer restaurante pelo slug.

## Rodando localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. A aplicação inicializa diretamente no login administrativo e exige as variáveis Firebase preenchidas.

## Sentry

O monitoramento é inicializado no navegador, servidor Node.js e runtime Edge.
Para receber eventos, configure `NEXT_PUBLIC_SENTRY_DSN` e `SENTRY_DSN` no
ambiente local e no ambiente publicado.

Para gerar releases e enviar source maps legíveis durante o build de produção,
configure também estas variáveis no provedor de deploy:

```bash
SENTRY_ORG=slug-da-organizacao
SENTRY_PROJECT=slug-do-projeto
SENTRY_AUTH_TOKEN=token-da-integracao
```

O token é secreto e não deve ser salvo no repositório. Em desenvolvimento,
acesse `http://localhost:3000/sentry-test` para enviar um evento controlado. Em
produção, essa rota retorna 404, exceto quando `SENTRY_TEST_ENABLED=true` estiver
configurado no momento do build.

Falhas ao finalizar pedidos são registradas com código Firebase, loja, modo do
pedido e IDs dos itens, sem enviar nome, telefone ou observações do cliente. Em
falhas inesperadas, a mensagem mostra um código de suporte que também aparece no
Sentry e no log estruturado da Function `createOrder`.

## Firebase real

1. Crie um projeto Firebase com Auth, Firestore, Storage e Functions.
2. Habilite Email/Senha e Google Sign-In no Firebase Auth.
3. Copie os dados do Web App para `.env.local`.
4. Crie os usuários responsáveis no Firebase Auth e vincule-os às lojas pelo painel global.
5. Aplique rules e indexes:

```bash
firebase use <project-id>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

6. Instale e publique Functions:

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

7. Crie e vincule as lojas pelo `restaurant-admin`. Se precisar de dados de
   demonstração, use os scripts genéricos de cardápio informando o slug da loja.

## Restaurant Admin local

O painel global fica no projeto separado `../restaurant-admin` e roda somente em
localhost, seguindo o mesmo modelo do `clinic-admin`. Ele é restrito a usuários
com a custom claim `platformAdmin: true` e permite:

- listar restaurantes ativos, inativos, recebendo pedidos ou pausados;
- criar uma loja isolada com tema padrão, Balcão e categorias iniciais opcionais;
- definir proprietários e administradores usando contas do Firebase Auth;
- criar uma conta de acesso e enviar o e-mail para definição de senha;
- editar dados, disponibilidade e acessos;
- abrir o cardápio público ou o painel operacional da loja selecionada.

Para conceder o primeiro acesso global, baixe uma chave JSON em **Firebase
Console › Configurações do projeto › Contas de serviço › Gerar nova chave
privada**. Salve a chave fora do repositório e execute:

```bash
npm run platform-admin:grant -- seu-email@exemplo.com "/caminho/para/service-account.json"
```

Depois, saia e entre novamente para renovar o token. As Functions usadas pelo
painel local precisam existir no projeto Firebase:

```bash
cd functions
npm run build
firebase deploy --only functions:listPlatformStores,functions:listPlatformUsers,functions:listManagedStores,functions:createPlatformUser,functions:createStore,functions:updatePlatformStore
```

Para iniciar o painel local:

```bash
cd ../restaurant-admin
npm install
npm run dev
```

O painel global não copia pedidos, avaliações, contadores ou clientes entre lojas.

### Cardápio de demonstração

Para visualizar e depois criar 8 pratos, 8 bebidas e 24 adicionais em uma loja de teste:

```bash
npm run menu:seed -- slug-do-restaurante "/caminho/para/service-account.json"
npm run menu:seed -- slug-do-restaurante "/caminho/para/service-account.json" --apply
npm run menu:assign-additionals -- slug-do-restaurante "/caminho/para/service-account.json"
npm run menu:assign-additionals -- slug-do-restaurante "/caminho/para/service-account.json" --apply
```

Os comandos sem `--apply` são apenas uma prévia. Com `--apply`, o seed cria
somente documentos demo que ainda não existem, e a associação preserva itens
que já possuem opções. Use `--overwrite` junto de `--apply` apenas quando quiser
substituir documentos demo existentes. Os adicionais ficam disponíveis no painel
para serem associados aos itens compatíveis.

## Emuladores

```bash
npm run emulators
```

O Firebase CLI precisa estar instalado globalmente ou via `npx firebase`.

## Segurança

- O cliente não envia preço nem total confiável para produção. `createOrder` nas Cloud Functions recalcula tudo com os preços oficiais do Firestore.
- O painel usa Firebase Auth e valida acesso por `owners`, `adminUsers` ou custom claim `platformAdmin`.
- `setUserClaims` só pode ser chamada por `platformAdmin`.
- Firestore Rules bloqueiam criação direta de pedidos; produção deve criar pedidos via Function.
- `TODO_SECURITY`: acompanhamento público usa `trackingEnabled`. Para produção, prefira token público por pedido ou documento público mínimo.

Documentos complementares:

- [Arquitetura](docs/architecture.md)
- [Modelo Firebase](docs/firebase-model.md)
- [Segurança](docs/security.md)

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test:e2e
npm run menu:seed -- slug-do-restaurante "/caminho/para/service-account.json"
npm run menu:assign-additionals -- slug-do-restaurante "/caminho/para/service-account.json"
```

## TODOs principais

- `TODO_CONFIG`: inserir base URL pública e revisar credenciais de deploy quando necessário.
- `TODO_SECURITY`: endurecer acompanhamento público com token de rastreio antes de produção.
- Persistir edições do painel de mesas/cardápio/tema via Functions específicas.
