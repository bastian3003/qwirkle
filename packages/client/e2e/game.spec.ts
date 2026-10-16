import { type Page, expect, test } from '@playwright/test';

/** Reads the hand from the DOM and finds the longest line: same color or same shape, all different. */
async function longestLine(page: Page): Promise<{ color: string; shape: string }[]> {
  const hand = await page.getByTestId('hand-tile').evaluateAll((els) =>
    els.map((el) => ({ color: el.getAttribute('data-color')!, shape: el.getAttribute('data-shape')! })),
  );
  let best: { color: string; shape: string }[] = [];
  for (const [key, other] of [
    ['color', 'shape'],
    ['shape', 'color'],
  ] as const) {
    const groups = new Map<string, Map<string, { color: string; shape: string }>>();
    for (const t of hand) {
      if (!groups.has(t[key])) groups.set(t[key], new Map());
      const g = groups.get(t[key])!;
      if (!g.has(t[other])) g.set(t[other], t);
    }
    for (const g of groups.values()) if (g.size > best.length) best = [...g.values()];
  }
  return best;
}

test('two players create, join, play a first move and resume after reload', async ({ browser }) => {
  const mamaContext = await browser.newContext();
  const gabiContext = await browser.newContext();
  const mama = await mamaContext.newPage();
  const gabi = await gabiContext.newPage();

  // Mama starts a room.
  await mama.goto('/');
  await mama.getByLabel('Dein Name').fill('Mama');
  await mama.getByRole('button', { name: 'Neues Spiel starten' }).tap();
  const code = (await mama.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);
  await mama.screenshot({ path: 'test-results/1-warten.png' });

  // Gabi opens the invite link.
  await gabi.goto(`/?raum=${code}`);
  await expect(gabi.getByText(`Raum ${code}`, { exact: false })).toBeVisible();
  await gabi.getByLabel('Dein Name').fill('Gabi');
  await gabi.getByRole('button', { name: 'Mitspielen' }).tap();

  for (const page of [mama, gabi]) await expect(page.getByTestId('hand-tile')).toHaveCount(6);

  // Whoever has the longest line starts.
  const mamaStarts = (await mama.getByTestId('hint').textContent())!.includes('Du fängst an');
  const [starter, other] = mamaStarts ? [mama, gabi] : [gabi, mama];
  await expect(starter.getByTestId('hint')).toContainText('Du fängst an');
  await expect(other.getByTestId('hint')).toContainText('ist dran');
  await starter.screenshot({ path: 'test-results/2-start.png' });

  // Lay the line left to right: tap a tile, then the slot next to the previous one.
  const line = await longestLine(starter);
  // Select by look, not position: the hand closes up after each tile is laid.
  for (const [i, t] of line.entries()) {
    await starter.locator(`[data-testid="hand-tile"][data-color="${t.color}"][data-shape="${t.shape}"]`).first().tap();
    await starter.locator(`[data-testid="slot"][data-x="${i}"][data-y="0"]`).tap();
  }
  await expect(starter.getByTestId('confirm')).toBeEnabled();
  await starter.screenshot({ path: 'test-results/3-gelegt.png' });
  await starter.getByTestId('confirm').tap();

  // The other player sees the move and is next.
  await expect(other.getByTestId('hint')).toContainText('Du bist dran');
  await expect(other.getByTestId('last-move')).toContainText(`${line.length === 1 ? '1 Stein' : `${line.length} Steine`} gelegt`);
  await expect(other.locator('.cell.tile')).toHaveCount(line.length);
  await expect(starter.getByTestId('hand-tile')).toHaveCount(6);
  await other.screenshot({ path: 'test-results/4-gegnerin.png' });

  // After a reload the game is still there.
  await other.reload();
  await expect(other.getByTestId('hand-tile')).toHaveCount(6);
  await expect(other.locator('.cell.tile')).toHaveCount(line.length);
  await expect(other.getByTestId('hint')).toContainText('Du bist dran');

  // An invalid move is not offered: tapping a tile shows only allowed slots, every one of them legal.
  await other.getByTestId('hand-tile').first().tap();
  await expect(other.getByTestId('hint')).toContainText(/markiertes Feld|passt gerade nirgends/);
  await other.screenshot({ path: 'test-results/6-auswahl.png' });

  await mamaContext.close();
  await gabiContext.close();
});

test('a wrong room code shows a German error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Dein Name').fill('Eva');
  await page.getByLabel('Raum-Code').fill('ZZZZZ');
  await page.getByRole('button', { name: 'Beitreten' }).tap();
  await expect(page.getByTestId('toast')).toHaveText('Diesen Raum gibt es nicht. Stimmt der Code?');
  await page.screenshot({ path: 'test-results/5-start.png' });
});
