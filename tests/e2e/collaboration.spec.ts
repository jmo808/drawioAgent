import { test, expect } from '@playwright/test';

test.describe('Drawio Agent Collaboration E2E Tests', () => {
  test('should support multi-user collaboration session create, join, presence, sync and locks', async ({ browser }) => {
    // 1. Create browser contexts and pages for Alice and Bob
    const aliceContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();

    alicePage.on('console', msg => console.log(`ALICE_LOG [${msg.type()}]: ${msg.text()}`));
    bobPage.on('console', msg => console.log(`BOB_LOG [${msg.type()}]: ${msg.text()}`));

    // 2. Load Draw.io on Alice's page
    await alicePage.goto('/?apiKey=test-api-key&ui=atlas&spin=1&proto=json');
    const aliceSidebarRoot = alicePage.locator('#drawio-agent-sidebar-root');
    await expect(aliceSidebarRoot).toBeVisible({ timeout: 40000 });

    // Handle "Decide later" dialog if any
    const aliceDecideLater = alicePage.locator('text="Decide later"');
    try {
      await aliceDecideLater.waitFor({ state: 'visible', timeout: 3000 });
      await aliceDecideLater.click();
    } catch (e) {}

    // Wait for connection banner to disappear
    const aliceBanner = alicePage.locator('.drawio-agent-connection-banner');
    await expect(aliceBanner).not.toBeVisible({ timeout: 30000 });

    // Click on "Consent & Accept" if the privacy warning banner is visible
    const aliceAcceptConsentBtn = alicePage.locator('[data-testid="accept-consent-btn"]');
    try {
      await aliceAcceptConsentBtn.waitFor({ state: 'visible', timeout: 5000 });
      await aliceAcceptConsentBtn.click();
    } catch (e) {
      // Consent banner didn't appear, ignore
    }

    // 3. Alice clicks "Create Session"
    const aliceCreateBtn = alicePage.locator('.session-controls button:has-text("Create Session")');
    await aliceCreateBtn.click({ force: true });

    // Alice types display name "Alice" and confirms
    const aliceNameInput = alicePage.locator('.modal-overlay .input-field');
    await expect(aliceNameInput).toBeVisible({ timeout: 5000 });
    await aliceNameInput.fill('Alice');
    const aliceConfirmBtn = alicePage.locator('.modal-overlay button:has-text("Confirm")');
    await aliceConfirmBtn.click({ force: true });

    // Wait for session info to appear
    const aliceSessionValue = alicePage.locator('.session-controls .session-value');
    await expect(aliceSessionValue).toBeVisible({ timeout: 10000 });
    const sessionId = await aliceSessionValue.textContent();
    expect(sessionId).toBeTruthy();
    console.log(`E2E_LOG: Created collaboration session with ID: ${sessionId}`);

    // Verify Alice sees herself in presence bar
    const alicePresenceBadges = alicePage.locator('.presence-bar .presence-badge');
    await expect(alicePresenceBadges).toHaveCount(1, { timeout: 5000 });
    await expect(alicePresenceBadges.first()).toHaveText('A');

    // 4. Load Draw.io on Bob's page
    await bobPage.goto('/?apiKey=test-api-key&ui=atlas&spin=1&proto=json');
    const bobSidebarRoot = bobPage.locator('#drawio-agent-sidebar-root');
    await expect(bobSidebarRoot).toBeVisible({ timeout: 40000 });

    // Handle "Decide later" dialog
    const bobDecideLater = bobPage.locator('text="Decide later"');
    try {
      await bobDecideLater.waitFor({ state: 'visible', timeout: 3000 });
      await bobDecideLater.click();
    } catch (e) {}

    const bobBanner = bobPage.locator('.drawio-agent-connection-banner');
    await expect(bobBanner).not.toBeVisible({ timeout: 30000 });

    // Click on "Consent & Accept" if the privacy warning banner is visible
    const bobAcceptConsentBtn = bobPage.locator('[data-testid="accept-consent-btn"]');
    try {
      await bobAcceptConsentBtn.waitFor({ state: 'visible', timeout: 5000 });
      await bobAcceptConsentBtn.click();
    } catch (e) {
      // Consent banner didn't appear, ignore
    }

    // Bob clicks "Join Session"
    const bobJoinBtn = bobPage.locator('.session-controls button:has-text("Join Session")');
    await bobJoinBtn.click({ force: true });

    // Bob enters the session ID
    const bobJoinInput = bobPage.locator('.session-controls .join-form .input-field');
    await expect(bobJoinInput).toBeVisible({ timeout: 5000 });
    await bobJoinInput.fill(sessionId!);
    const bobJoinConfirmBtn = bobPage.locator('.session-controls .join-form button[type="submit"]');
    await bobJoinConfirmBtn.click({ force: true });

    // Bob types display name "Bob" and confirms
    const bobNameInput = bobPage.locator('.modal-overlay .input-field');
    await expect(bobNameInput).toBeVisible({ timeout: 5000 });
    await bobNameInput.fill('Bob');
    const bobConfirmBtn = bobPage.locator('.modal-overlay button:has-text("Confirm")');
    await bobConfirmBtn.click({ force: true });

    // 5. Verify presence synchronization
    // Both Alice and Bob should now see 2 members in the presence bar
    await expect(alicePage.locator('.presence-bar .presence-badge')).toHaveCount(2, { timeout: 10000 });
    await expect(bobPage.locator('.presence-bar .presence-badge')).toHaveCount(2, { timeout: 10000 });

    // Verify Bob sees "A" and "B"
    const bobPresence = bobPage.locator('.presence-bar .presence-badge');
    const initials = await bobPresence.allTextContents();
    expect(initials.sort()).toEqual(['A', 'B']);

    // 6. Test diagram synchronization
    // Alice sets a dummy node XML on canvas (simulating editing draw.io canvas)
    await alicePage.evaluate(() => {
      const ui = (window as any).drawioEditorUi;
      if (ui && ui.editor && ui.editor.graph) {
        const graph = ui.editor.graph;
        const parent = graph.getDefaultParent();
        graph.getModel().beginUpdate();
        try {
          // Insert a vertex representing a test node
          graph.insertVertex(parent, 'test-node-123', 'Shared Node', 20, 20, 80, 30);
        } finally {
          graph.getModel().endUpdate();
        }
      }
    });

    // Wait for the debounced sync to propagate to Bob's canvas
    await expect.poll(async () => {
      return await bobPage.evaluate(() => {
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
    }, { timeout: 15000 }).toContain('test-node-123');

    // 7. Test chat history sharing
    // Bob sends a message
    const bobInput = bobPage.locator('.drawio-agent-input');
    const bobSendBtn = bobPage.locator('.drawio-agent-send-btn');
    await bobInput.fill('Hello from Bob');
    await bobSendBtn.click({ force: true });

    // Verify Alice sees Bob's message
    const aliceLastMsg = alicePage.locator('.drawio-agent-msg-user').last();
    await expect(aliceLastMsg).toContainText('Hello from Bob', { timeout: 10000 });

    // 8. Test AI request queueing & serialization lock
    // Alice sends an AI-triggering prompt
    const aliceInput = alicePage.locator('.drawio-agent-input');
    const aliceSendBtn = alicePage.locator('.drawio-agent-send-btn');
    await aliceInput.fill('Create AWS 3-tier diagram');
    await aliceSendBtn.click({ force: true });

    // Alice should immediately show the active AI working state, and Bob should see "AI is working..."
    const bobStatusText = bobPage.locator('.drawio-agent-ai-status');
    await expect(bobStatusText).toBeVisible({ timeout: 5000 });
    await expect(bobStatusText).toContainText('AI is working for Alice');

    // Verify Bob's input is disabled
    await expect(bobInput).toBeDisabled();

    // Bob tries to send a queued request: "Change color to blue"
    // Bypassing UI disabled states to test server-side queuing
    await bobPage.evaluate(() => {
      (window as any).sendCollabMessage('Change color to blue');
    });

    // Verify Bob gets a message telling him his request is queued
    const bobQueueMsg = bobPage.locator('.drawio-agent-msg-assistant', { hasText: 'Your request has been queued' }).first();
    await expect(bobQueueMsg).toBeVisible({ timeout: 10000 });

    // Wait for Alice's AI command to finish compiling
    const aliceReply = alicePage.locator('.drawio-agent-msg-assistant').last();
    await expect(aliceReply).toContainText('Diagram generated successfully.', { timeout: 25000 });

    // Verify Bob's queued request is automatically triggered and resolves after Alice's completes
    const bobLastReply = bobPage.locator('.drawio-agent-msg-assistant').last();
    await expect(bobLastReply).toContainText('Diagram generated successfully.', { timeout: 25000 });

    // 9. Test temporary disconnect & dim presence avatar badge
    await bobContext.close();

    // Verify Alice sees Bob's badge dim (has disconnected class)
    const bobBadge = alicePage.locator('.presence-bar .presence-badge.disconnected');
    await expect(bobBadge).toBeVisible({ timeout: 10000 });

    // 10. Test leave session
    await alicePage.locator('.session-controls button:has-text("Leave Session")').click({ force: true });
    
    // Verify Alice reverts to single-user mode (Create Session button visible again)
    await expect(aliceCreateBtn).toBeVisible({ timeout: 5000 });

    await aliceContext.close();
  });
});
