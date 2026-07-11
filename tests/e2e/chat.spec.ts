import { test, expect } from '@playwright/test';

test.describe('Drawio Agent AI Chat Sidebar E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to draw.io app loaded with our custom sidebar plugin and test api key
    await page.goto('/?apiKey=test-api-key&ui=atlas&spin=1&proto=json');

    // Wait for draw.io editor to initialize and render our sidebar root
    const sidebarRoot = page.locator('#drawio-agent-sidebar-root');
    await expect(sidebarRoot).toBeVisible({ timeout: 20000 });

    // Wait for connection banner to disappear (indicating WebSocket is connected)
    const connectionBanner = page.locator('.drawio-agent-connection-banner');
    await expect(connectionBanner).not.toBeVisible({ timeout: 15000 });
  });

  test('should successfully compile AWS 3-tier diagram from chat prompt and render on canvas', async ({ page }) => {
    const input = page.locator('.drawio-agent-input');
    const sendButton = page.locator('.drawio-agent-send-btn');

    // 1. Enter chat message
    await input.fill('Create an AWS 3-tier diagram');
    await sendButton.click();

    // 2. Verify progress and assistant reply
    const assistantMessage = page.locator('.drawio-agent-msg-assistant').last();
    await expect(assistantMessage).toContainText('Diagram generated successfully.', { timeout: 25000 });

    // 3. Verify diagram XML is updated on draw.io canvas via window.drawioEditorUi
    const canvasXml = await page.evaluate(() => {
      const ui = (window as any).drawioEditorUi;
      return ui ? ui.editor.getGraphXml() : '';
    });

    expect(canvasXml).toContain('<mxGraphModel');
    expect(canvasXml).toContain('rds-db-1');
    expect(canvasXml).toContain('alb-1');
  });

  test('should select AWS 3-tier diagram from Template Library and compile it', async ({ page }) => {
    // Expand category if not already expanded (default is expanded)
    const categoryHeader = page.locator('.drawio-agent-category-header', { hasText: 'Cloud Architecture Templates' });
    await expect(categoryHeader).toBeVisible();

    // Click on template card
    const templateCard = page.locator('.drawio-agent-template-card', { hasText: 'AWS 3-Tier Web App' });
    await templateCard.click();

    // Verify assistant reply
    const assistantMessage = page.locator('.drawio-agent-msg-assistant').last();
    await expect(assistantMessage).toContainText('Diagram generated successfully.', { timeout: 25000 });

    // Verify XML has correct nodes
    const canvasXml = await page.evaluate(() => {
      const ui = (window as any).drawioEditorUi;
      return ui ? ui.editor.getGraphXml() : '';
    });
    expect(canvasXml).toContain('rds-db-1');
  });

  test('should display active provider and support selection dropdown', async ({ page }) => {
    const providerSelect = page.locator('.drawio-agent-select');
    await expect(providerSelect).toBeVisible();

    // Check currently selected option contains openai
    const selectedValue = await providerSelect.inputValue();
    expect(selectedValue).toBe('openai');
  });

  test('should handle prompt compilation error gracefully and show error message', async ({ page }) => {
    const input = page.locator('.drawio-agent-input');
    const sendButton = page.locator('.drawio-agent-send-btn');

    await input.fill('trigger error');
    await sendButton.click();

    // Verify assistant error response is displayed in chat
    const assistantMessage = page.locator('.drawio-agent-msg-assistant').last();
    await expect(assistantMessage).toContainText('Error: I cannot parse this prompt.', { timeout: 20000 });
  });
});
