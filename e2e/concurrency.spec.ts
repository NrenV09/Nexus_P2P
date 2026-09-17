import { test, expect, Page, BrowserContext } from '@playwright/test';

const APP_URL = 'http://localhost:3000'; 
const PEER_COUNT = 5;

test.describe.serial('Quantum Link Multi-User Concurrency', () => {

  test(`Full mesh connection and concurrent file transfer for ${PEER_COUNT} peers`, async ({ browser }) => {
    test.setTimeout(180000); 
    
    // 1. Isolated Context Instantiation
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];

    const initPromises = Array.from({ length: PEER_COUNT }).map(async (_, i) => {
      const context = await browser.newContext();
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      contexts.push(context);
      
      const page = await context.newPage();
      
      // Inject mock clipboard to reliably transfer SDP between contexts in headless mode
      await page.addInitScript(() => {
        (window as any).mockClipboard = "";
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: async (text: string) => { (window as any).mockClipboard = text; },
            readText: async () => (window as any).mockClipboard,
          },
          configurable: true,
        });
        
        // Trap console logs for stability assertions
        (window as any).appLogs = [];
        const originalError = console.error;
        console.error = (...args) => {
          (window as any).appLogs.push(args.join(' '));
          originalError.apply(console, args);
        };
      });

      pages.push(page);
      return page;
    });

    await Promise.all(initPromises);
    await Promise.all(pages.map(page => page.goto(APP_URL)));

    const hostPage = pages[0];
    const receiverPages = pages.slice(1);

    // Initial setup: Wait for all to load
    for (const page of pages) {
      await expect(page.locator('text=Host Station')).toBeVisible({ timeout: 15000 });
    }

    // 2. Establish Role (Peer 0 -> Host)
    await hostPage.click('text=Host Station');
    await expect(hostPage.locator('text=Init Offer Matrix').or(hostPage.locator('text=Add Another Peer'))).toBeVisible();

    // 3. Sequential Handshakes (Peer 0 connects to Peers 1..N)
    for (let i = 0; i < receiverPages.length; i++) {
      const joinPage = receiverPages[i];
      
      await joinPage.click('text=Join Station');
      await joinPage.click('text=Scan Peer Matrix');
      
      // A. HOST GENERATES OFFER
      const generateOfferBtn = hostPage.locator('text=Init Offer Matrix').or(hostPage.locator('text=Add Another Peer (Generate QR)'));
      await generateOfferBtn.click();
      
      const qrTitleLoc = hostPage.locator('[title="Click to copy protocol matrix"]');
      await qrTitleLoc.waitFor({ state: 'visible' });
      await qrTitleLoc.click();
      
      const offerSdp = await hostPage.evaluate(() => (window as any).mockClipboard);
      expect(offerSdp).toBeTruthy();

      // B. JOINER CONSUMES OFFER
      await joinPage.fill('textarea[placeholder="Paste Protocol Data..."]', offerSdp);
      await joinPage.click('text=Sync Offer Protocol');
      
      // C. JOINER GENERATES ANSWER
      const joinQrTitleLoc = joinPage.locator('[title="Click to copy protocol matrix"]');
      await joinQrTitleLoc.waitFor({ state: 'visible' });
      await joinQrTitleLoc.click();
      
      const answerSdp = await joinPage.evaluate(() => (window as any).mockClipboard);
      expect(answerSdp).toBeTruthy();

      // D. HOST CONSUMES ANSWER
      // In host mode, we click the Monitor button to switch to 'answer' scan mode
      const monitorButton = hostPage.locator('button:has(svg.lucide-monitor)');
      await monitorButton.click();

      // Paste the answer
      await hostPage.fill('textarea[placeholder="Paste Protocol Data..."]', answerSdp);
      
      // Wait for the sync button to be enabled and click it
      await hostPage.locator('text=Sync Answer Protocol').waitFor({ state: 'visible' });
      await hostPage.locator('text=Sync Answer Protocol').click();

      // E. VERIFY CONNECTION
      await expect(hostPage.locator(`text=Relaying connections for ${i + 1} peer(s)`)).toBeVisible({ timeout: 15000 });
      await expect(joinPage.locator('text=Direct Peer-to-Peer Link Active')).toBeVisible({ timeout: 15000 });
    }

    // 4. Simultaneous Non-Mutating Workload: File Transfer
    // Host sends a 2MB file chunk
    const testFileName = 'quantum-test-payload.txt';
    const testFileContent = 'a'.repeat(2 * 1024 * 1024); // 2 MB
    const fileBuffer = Buffer.from(testFileContent);

    // Wait for all data channels to settle
    await hostPage.waitForTimeout(2000);

    // Provide the file to the hidden input on the host
    await hostPage.setInputFiles('input[type="file"]', {
      name: testFileName,
      mimeType: 'text/plain',
      buffer: fileBuffer
    });

    // 5. In-Flight System Assertions: Data Integrity & Zero Interference
    // Verify that all join pages receive the file. We expect a success log on all joiners.
    const fileArrivalPromises = receiverPages.map(page => {
      // The activity log logs: "Payload received: quantum-test-payload.txt"
      return expect(page.locator(`text=Payload received: ${testFileName}`)).toBeVisible({ timeout: 25000 });
    });

    await Promise.all(fileArrivalPromises);

    // Check UI Invariance: Check that settings modal buttons/toggles didn't randomly toggle
    // Verify direct downloads toggle is still visibly OFF (the default)
    const directDownloadsBtn = hostPage.locator('button:has-text("Download Bypass RAM Limits")');
    await expect(directDownloadsBtn.locator('.bg-muted\\/40')).toBeVisible(); // Ensures the toggle indicator is gray/off

    // 6. Resource Stability
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      // Assert no ICE disconnects in the activity log
      const droppedLogs = page.locator('text=Live connection ended');
      expect(await droppedLogs.count()).toBe(0);

      // Check trapped console errors (specifically React render errors)
      const trappedErrors = await page.evaluate(() => (window as any).appLogs as string[]);
      const reactErrors = trappedErrors.filter(err => err.includes('Minified React error') || err.includes('Render'));
      if (reactErrors.length > 0) {
        console.error(`Peer ${i} encountered React errors:`, reactErrors);
      }
      expect(reactErrors.length, `Peer ${i} should not have React rendering errors`).toBe(0);
    }
  });
});
