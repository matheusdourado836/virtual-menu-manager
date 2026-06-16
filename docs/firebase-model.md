# Modelo Firebase

```txt
users/{userId}
  name
  email
  photoURL
  createdAt
  updatedAt

stores/{storeId}
  name
  slug
  description
  logoUrl
  owners: string[]
  adminUsers: string[]
  isActive
  isAcceptingOrders
  pausedMessage
  estimatedPrepMinutes
  createdAt
  updatedAt

stores/{storeId}/theme/default
  primaryColor
  secondaryColor
  accentColor
  backgroundColor
  surfaceColor
  textColor
  mutedTextColor
  borderColor
  fontFamily
  borderRadius
  logoUrl
  bannerUrl
  visualStyle
  updatedAt

stores/{storeId}/tables/{tableId}
  label
  code
  qrCodeUrl
  isActive
  createdAt

stores/{storeId}/categories/{categoryId}
  name
  order
  isActive

stores/{storeId}/menuItems/{itemId}
  name
  description
  price
  imageUrl
  categoryId
  isAvailable
  order
  optionsGroups[]
  needsReview
  reviewNote
  createdAt
  updatedAt

stores/{storeId}/orders/{orderId}
  code
  tableId
  tableLabel
  customerName
  customerPhone
  status
  paymentMethod
  paymentStatus
  observation
  items[]
  subtotal
  serviceFee
  total
  trackingEnabled
  createdAt
  updatedAt
  acceptedAt
  preparingAt
  readyAt
  deliveredAt
  cancelledAt

stores/{storeId}/counters/orders
  nextCode

orderLookup/{orderId}
  storeId
  orderId
  createdAt
```

## Observações

- `stores/{storeId}/orders` é subcoleção para isolamento por loja.
- `orderLookup` existe para a rota `/pedido/[orderId]` localizar a loja sem expor listagem de pedidos.
- `counters/orders` é privado e só alterado por Cloud Functions.
- `optionsGroups` foi mantido dentro do item para simplificar o MVP; se houver muitos adicionais globais, pode virar subcoleção.
