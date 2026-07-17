# Design QA

## Current Pass

- Source visual truth:
  - `/Users/matheusdourado/Downloads/Imagem 3 gerada.png`
  - `/Users/matheusdourado/Downloads/WhatsApp Image 2026-06-14 at 22.42.38.jpeg`
  - `/Users/matheusdourado/Downloads/WhatsApp Image 2026-06-14 at 22.49.08.jpeg`
  - `/var/folders/pv/47db8sjd2lgfvl_2zzc30b300000gn/T/codex-clipboard-682e3420-e11d-42bc-8e1c-cdaf3cf8146e.png`
  - `/Users/matheusdourado/Downloads/prompt_codex_corrigir_painel_pedidos_cardapio.md`
- Rendered implementation:
  - `/Users/matheusdourado/WebProjects/virtual-menu-manager/design-qa/current-menu-mobile.png`
  - `/Users/matheusdourado/WebProjects/virtual-menu-manager/design-qa/current-menu-dialog-mobile.png`
  - `/Users/matheusdourado/WebProjects/virtual-menu-manager/design-qa/public-menu-current-post-fixes.png`
  - `/Users/matheusdourado/WebProjects/virtual-menu-manager/design-qa/admin-current-post-fixes.png`
- Full-view comparison evidence:
  - `/Users/matheusdourado/WebProjects/virtual-menu-manager/design-qa/public-menu-refinement-comparison.jpg`
- Focused comparison evidence:
  - `/Users/matheusdourado/WebProjects/virtual-menu-manager/design-qa/current-dialog-comparison.png`
- Viewport: `390 x 844`
- Verified state: public menu listing and item customization dialog.

**Findings**

- No actionable P0, P1, or P2 visual findings were found in the public menu and item dialog.
- [Blocked] The updated authenticated admin panel, manual-order dialog, and live order-tracker progression could not be captured in the same-state browser QA pass. The available test browser has no admin credentials or live trackable order, and fresh Playwright contexts remain in the Firebase loading state.
- [Blocked] The local `/admin` page currently renders "Loja não encontrada" in the browser session, so authenticated admin list/modal states were not visually capturable after these changes.
- The long-list admin layout issue from the latest screenshot was addressed in CSS by keeping the desktop sidebar background available across the full scrollable page and preventing the workspace from overflowing horizontally.

**Fidelity Surfaces**

- Fonts and typography: product and option names preserve the existing hierarchy and wrap to two lines without premature ellipsis.
- Spacing and layout rhythm: the mobile menu remains compact; the customization dialog keeps header and footer accessible.
- Colors and visual tokens: new controls reuse the neutral admin tokens and existing store theme variables.
- Image quality and assets: existing store logo, product images, and Lucide icons remain crisp and unchanged.
- Copy and content: labels now distinguish finalized and cancelled orders, and manual-order destination fields use direct operational language.

**Patches Made**

- Simplified customer progress to gray clock and green check states.
- Added finalized-order cleanup, redirect to menu, and completion snackbar.
- Added cancelled-order filtering, permanent deletion, and selected-hover preservation.
- Added a shared manual-order dialog for Orders and Tables, including table creation and person/table destination data.
- Added authenticated `createAdminOrder`, `createTable`, and `deleteOrder` callable functions.
- Added menu item CRUD, store settings editing, destructive confirmations, and shared admin snackbars.
- Fixed the admin long-list layout where large lists exposed a white area below the dark sidebar.

**Verification**

- In-app browser: public menu and item dialog passed responsive interaction and visual checks.
- In-app browser latest pass: public menu rendered at `390 x 844` with real store data and long scroll content.
- In-app browser latest pass after Firebase loading fix: `/admin` rendered the login form and a route `/loja/[slug]/mesa/[tableId]` rendered the public menu on the current dev server.
- Lint passed.
- Typecheck passed.
- Next.js production build passed.
- Firebase Functions TypeScript build passed.
- E2E passed after isolating Playwright from stale dev servers:
  - 3 tests passed.
  - 1 admin credential test skipped because `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` were not provided.

final result: blocked
