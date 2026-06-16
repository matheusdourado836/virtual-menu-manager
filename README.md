# Virtual Menu Manager

MVP de pedidos por QR Code para foodtrucks/restaurantes pequenos, com cardápio público, carrinho, acompanhamento de pedido, painel administrativo em tempo real e estrutura Firebase multi-loja.

## Stack escolhida

- **Next.js App Router + React + TypeScript**: entrega web mobile rápida para cliente e painel responsivo no mesmo projeto.
- **Firebase Auth, Firestore, Storage e Cloud Functions**: autenticação, realtime, regras de segurança e cálculo de pedido no backend.
- **SCSS com tokens dinâmicos**: o prompt sugeria Tailwind, mas este projeto tem regra local de SCSS/BEM. A decisão foi usar CSS variables derivadas do tema da loja para evitar cor fixa espalhada no código e manter multi-tenant.
- **Zod**: valida payloads de pedido no front e nas Functions.
- **Sentry**: DSN configurado via `.env.example` e inicialização em client/server/edge.

## Rotas

- `/loja/cafe-carioca`: cardápio público.
- `/loja/cafe-carioca/mesa/mesa-01`: cardápio já vinculado a uma mesa.
- `/loja/cafe-carioca/carrinho`: carrinho para retirada no balcão.
- `/loja/cafe-carioca/mesa/mesa-01/carrinho`: carrinho vinculado a uma mesa.
- `/pedido/[orderId]`: acompanhamento do pedido.
- `/admin`: painel administrativo da loja seed.

## Rodando localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. A aplicação inicializa diretamente no login administrativo e exige as variáveis Firebase preenchidas.

## Firebase real

1. Crie um projeto Firebase com Auth, Firestore, Storage e Functions.
2. Habilite Email/Senha e Google Sign-In no Firebase Auth.
3. Copie os dados do Web App para `.env.local`.
4. Defina o usuário dono no Firebase Auth. O seed usa `SEED_OWNER_EMAIL` ou `cafecarioca@gmail.com` por padrão.
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

7. Rode o seed:

```bash
npm run seed
```

## Emuladores

```bash
npm run emulators
```

O Firebase CLI precisa estar instalado globalmente ou via `npx firebase`.

## Dados extraídos da imagem

Loja seed: **Café Carioca**.

Categorias:

- Lanches
- Bebidas

Itens extraídos:

- Cuscuz com calabresa: R$ 7,00
- Cuscuz com carne de sol: R$ 15,00
- Tapioca na manteiga: R$ 7,00
- Omelete: R$ 15,00
- Pão na chapa: R$ 7,00, com manteiga
- Misto quente: R$ 10,00, queijo e presunto
- Misto completo: R$ 12,00, queijo, presunto e ovo
- Pão de queijo 90g: R$ 4,00, unidade
- Sanduíche Natural 300g: R$ 10,00, com maionese defumada
- Salgado: R$ 7,00, `TODO_REVIEW` sabores
- Bolo ft: R$ 6,00, milho e formigueiro, `TODO_REVIEW` confirmar nome
- Empada: R$ 7,00, `TODO_REVIEW` sabores
- Suco - polpa 200ml: R$ 6,00, `TODO_REVIEW` sabores
- Suco - polpa 300ml: R$ 7,00, `TODO_REVIEW` sabores
- Café pequeno: R$ 2,00
- Café com leite pequeno: R$ 2,00
- Café grande: R$ 4,00
- Café com leite grande: R$ 4,00
- Água: R$ 4,00
- Água com gás: R$ 5,00

Adicionais extraídos: Mussarela, Requeijão, Presunto, Calabresa, Bacon, Ovo, Carne de sol, Frango Cremoso, Tomate e Cebola. Todos foram cadastrados como R$ 2,00.

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
npm run seed
```

## TODOs principais

- `TODO_CONFIG`: inserir base URL pública e revisar credenciais de deploy/seed quando necessário.
- `TODO_REVIEW`: revisar sabores de salgados, empadas e sucos; confirmar o nome `Bolo ft`.
- `TODO_SECURITY`: endurecer acompanhamento público com token de rastreio antes de produção.
- Persistir edições do painel de mesas/cardápio/tema via Functions específicas.
