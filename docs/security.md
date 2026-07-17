# Segurança

## Autenticação

O painel usa Firebase Auth com Email/Senha e Google Sign-In. Em produção, usuários administrativos precisam estar em:

- `stores/{storeId}.owners`
- `stores/{storeId}.adminUsers`
- ou ter custom claim `{ platformAdmin: true }`

O front-end usa essa informação apenas para UX. A autorização real fica em Firestore Rules e Cloud Functions.

## Operações sensíveis

- `setUserClaims`: exige `platformAdmin`.
- `createStore`: exige `platformAdmin`.
- `listPlatformStores`, `listPlatformUsers`, `createPlatformUser` e `updatePlatformStore`: exigem `platformAdmin`.
- `listManagedStores`: exige autenticação e retorna somente vínculos em `owners`/`adminUsers`; para `platformAdmin`, retorna todas as lojas.
- `createOrder`: pública, mas calcula preço/total no backend usando cardápio oficial.
- O diagnóstico do checkout no Sentry não inclui nome, telefone nem observações; usa somente metadados operacionais e IDs técnicos.
- `updateOrderStatus`: exige dono/admin da loja ou `platformAdmin`.
- `generateTableQrCode`: exige dono/admin da loja ou `platformAdmin`.

## Firestore Rules

As rules permitem leitura pública somente de dados necessários do cardápio ativo. Escritas administrativas exigem permissão por loja. Criação direta de pedido no Firestore é bloqueada para forçar o cálculo no backend.

## Pontos para produção

- `TODO_SECURITY`: substituir `trackingEnabled` por token público não enumerável ou documento público mínimo de acompanhamento.
- Adicionar App Check para reduzir abuso de Functions públicas.
- Criar rate limit por IP/sessão em `createOrder`.
- Restringir upload de imagens por loja. Storage Rules atuais permitem escrita apenas para `platformAdmin`.
- Registrar auditoria de mudanças administrativas em uma coleção dedicada.
