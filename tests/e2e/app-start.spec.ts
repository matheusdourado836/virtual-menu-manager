import { expect, test } from "@playwright/test";

test("abre no login administrativo", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Entrar no painel", exact: true })).toBeVisible();
});

test("carrega a loja teste no cardapio publico", async ({ page }) => {
  await page.goto("/loja/teste");

  await expect(page.getByRole("heading", { name: "teste", exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Hambúrguer artesanal").first()).toBeVisible({ timeout: 10000 });
});

test("adiciona item e abre a pagina de carrinho pelo botao flutuante", async ({ page }) => {
  await page.goto("/loja/teste/mesa/balcao");

  await page
    .getByRole("button", { name: "Adicionar Hambúrguer artesanal", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Hambúrguer artesanal", exact: true })
    .getByRole("button", { name: /Adicionar/ })
    .click();
  await page.getByRole("link", { name: /Ir para o carrinho/ }).click();

  await expect(page).toHaveURL(/\/loja\/teste\/mesa\/balcao\/carrinho$/);
  await expect(page.getByRole("heading", { name: "Balcão", exact: true })).toBeVisible();
  await expect(page.getByText("Hambúrguer artesanal").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Enviar pedido/ })).toBeVisible();
});

test("usuario dono acessa o painel quando credenciais e2e sao fornecidas", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  if (!email || !password) {
    test.skip(true, "Defina E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD para testar login real.");
    return;
  }

  await page.goto("/admin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();

  await expect(page.getByRole("button", { name: "Pedidos", exact: true })).toBeVisible();
  await expect(page.getByText("teste").first()).toBeVisible();
});
