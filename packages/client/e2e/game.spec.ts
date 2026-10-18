import { type Locator, type Page, expect, test } from '@playwright/test';
import { TURN_TIME_MS } from '../playwright.config';

type Point = { x: number; y: number };

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element not visible');
  return b;
}
const centerOf = async (l: Locator): Promise<Point> => {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const rightOf = async (l: Locator): Promise<Point> => {
  const b = await box(l);
  return { x: b.x + b.width * 1.5, y: b.y + b.height / 2 };
};
const leftOf = async (l: Locator): Promise<Point> => {
  const b = await box(l);
  return { x: b.x - b.width / 2, y: b.y + b.height / 2 };
};
const aboveOf = async (l: Locator): Promise<Point> => {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y - b.height / 2 };
};

/** Drags with the mouse in small steps, like a finger would. */
async function dragTo(page: Page, from: Locator, to: Point) {
  const start = await centerOf(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y - 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

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

test('two players create, join, drag a first move, resume after reload and run out of time', async ({ browser }) => {
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

  // Lay the line left to right by dragging each tile next to the previous one.
  const line = await longestLine(starter);
  for (const [i, t] of line.entries()) {
    const handTile = starter.locator(`[data-testid="hand-tile"][data-color="${t.color}"][data-shape="${t.shape}"]`).first();
    const target =
      i === 0 ? await centerOf(starter.getByTestId('board')) : await rightOf(starter.locator('.cell.pending').last());
    await dragTo(starter, handTile, target);
    await expect(starter.locator('.cell.pending')).toHaveCount(i + 1);
  }
  // No placement boxes anywhere.
  await expect(starter.locator('.cell.slot')).toHaveCount(0);
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

  // Tapping still works: select a tile, then tap a free cell left of the row (no box is shown there).
  const firstOnBoard = other.locator('.cell.tile[data-x="0"][data-y="0"]');
  await other.getByTestId('hand-tile').first().tap();
  await expect(other.getByTestId('hint')).toContainText('Tippe aufs Spielfeld');
  const left = await leftOf(firstOnBoard);
  await other.touchscreen.tap(left.x, left.y);
  await expect(other.locator('.cell.pending[data-x="-1"][data-y="0"]')).toHaveCount(1);

  // A pending tile can be dragged to another cell: above the first tile. Now the two are not in one line.
  const above = await aboveOf(firstOnBoard);
  await dragTo(other, other.locator('.cell.pending'), above);
  await expect(other.locator('.cell.pending[data-x="0"][data-y="-1"]')).toHaveCount(1);
  await dragTo(other, other.getByTestId('hand-tile').first(), await leftOf(firstOnBoard));
  await expect(other.locator('.cell.pending')).toHaveCount(2);

  // The rules are only checked when confirming.
  await other.getByTestId('confirm').tap();
  await expect(other.getByTestId('hint')).toContainText('So geht das nicht');
  await other.screenshot({ path: 'test-results/7-abgelehnt.png' });

  // Dragging a pending tile back onto the hand returns it.
  const handBox = (await other.locator('.hand').boundingBox())!;
  await dragTo(other, other.locator('.cell.pending').first(), { x: handBox.x + handBox.width - 20, y: handBox.y + handBox.height / 2 });
  await expect(other.locator('.cell.pending')).toHaveCount(1);
  await other.getByRole('button', { name: 'Zurücknehmen', exact: true }).tap();
  await expect(other.getByTestId('hand-tile')).toHaveCount(6);

  // Waiting too long: a countdown appears for both, then the turn is forfeited.
  await expect(other.getByTestId('countdown')).toBeVisible({ timeout: TURN_TIME_MS });
  await expect(starter.getByTestId('countdown')).toContainText('muss sich beeilen');
  await other.screenshot({ path: 'test-results/8-countdown.png' });
  await expect(starter.getByTestId('last-move')).toContainText('war zu langsam', { timeout: TURN_TIME_MS });
  await expect(starter.getByTestId('hint')).toContainText('Du bist dran');

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
