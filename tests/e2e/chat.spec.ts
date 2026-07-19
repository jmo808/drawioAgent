import { test, expect } from '@playwright/test';

test.describe('Drawio Agent AI Chat Sidebar E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER_LOG [${msg.type()}]: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER_ERROR: ${err.message}`));
    page.on('response', response => {
      if (response.status() >= 400) {
        console.log(`BROWSER_HTTP_ERROR [${response.status()}]: ${response.url()}`);
      }
    });

    // Navigate to draw.io app loaded with our custom sidebar plugin and test api key
    await page.goto('/?apiKey=test-api-key&ui=atlas&spin=1&proto=json');

    const sidebarRoot = page.locator('#drawio-agent-sidebar-root');
    const decideLater = page.locator('text="Decide later"');

    // Wait for draw.io editor to initialize and render our sidebar root
    await expect(sidebarRoot).toBeVisible({ timeout: 40000 });

    // If "Decide later" dialog appears, click it to bypass the storage setup
    try {
      await decideLater.waitFor({ state: 'visible', timeout: 5000 });
      await decideLater.click();
    } catch (e) {
      // Dialog didn't appear, ignore
    }

    // Wait for connection banner to disappear (indicating WebSocket is connected)
    const connectionBanner = page.locator('.drawio-agent-connection-banner');
    await expect(connectionBanner).not.toBeVisible({ timeout: 30000 });

    // Click on "Consent & Accept" if the privacy warning banner is visible
    const acceptConsentBtn = page.locator('[data-testid="accept-consent-btn"]');
    try {
      await acceptConsentBtn.waitFor({ state: 'visible', timeout: 5000 });
      await acceptConsentBtn.click();
    } catch (e) {
      // Consent banner didn't appear, ignore
    }
  });

  test('should successfully compile AWS 3-tier diagram from chat prompt and render on canvas', async ({ page }) => {
    const input = page.locator('.drawio-agent-input');
    const sendButton = page.locator('.drawio-agent-send-btn');

    // 1. Enter chat message
    await input.fill('Create an AWS 3-tier diagram');
    await sendButton.click({ force: true });

    // 2. Verify progress and assistant reply
    const assistantMessage = page.locator('.drawio-agent-msg-assistant').last();
    await expect(assistantMessage).toContainText('Diagram generated successfully.', { timeout: 25000 });

    // 3. Verify diagram XML is updated on draw.io canvas via window.drawioEditorUi
    const canvasXml = await page.evaluate(() => {
      const ui = (window as any).drawioEditorUi;
      if (!ui || !ui.editor) return '';
      const xmlNode = ui.editor.getGraphXml();
      if (!xmlNode) return '';
      const mxUtils = (window as any).mxUtils;
      if (mxUtils && typeof mxUtils.getXml === 'function') {
        return mxUtils.getXml(xmlNode);
      }
      return new XMLSerializer().serializeToString(xmlNode);
    });

    expect(canvasXml).toContain('<mxGraphModel');
    expect(canvasXml).toContain('rds-db-1');
    expect(canvasXml).toContain('alb-1');
  });

  test('should select AWS 3-tier diagram from Template Library and compile it', async ({ page }) => {
    // Expand category if not already expanded (default is expanded)
    const categoryHeader = page.locator('.drawio-agent-category-header', { hasText: 'Cloud Architecture Templates' });
    await expect(categoryHeader).toBeVisible();
    await categoryHeader.click({ force: true });

    // Click on template card
    const templateCard = page.locator('.drawio-agent-template-card', { hasText: 'AWS 3-Tier Web App' });
    await templateCard.click({ force: true });

    // Verify assistant reply
    const assistantMessage = page.locator('.drawio-agent-msg-assistant').last();
    await expect(assistantMessage).toContainText('Diagram generated successfully.', { timeout: 25000 });

    // Verify XML has correct nodes
    const canvasXml = await page.evaluate(() => {
      const ui = (window as any).drawioEditorUi;
      if (!ui || !ui.editor) return '';
      const xmlNode = ui.editor.getGraphXml();
      if (!xmlNode) return '';
      const mxUtils = (window as any).mxUtils;
      if (mxUtils && typeof mxUtils.getXml === 'function') {
        return mxUtils.getXml(xmlNode);
      }
      return new XMLSerializer().serializeToString(xmlNode);
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
    await sendButton.click({ force: true });

    // Verify assistant error response is displayed in chat
    const assistantMessage = page.locator('.drawio-agent-msg-assistant').last();
    await expect(assistantMessage).toContainText('Error: I cannot parse this prompt.', { timeout: 20000 });
  });
});
