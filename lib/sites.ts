// A site adapter tells the timeline where cards may appear on one website.
export type Site = {
  origin: string;
  matches: string[];
  active(location: Location): boolean;
  // Feed items currently in the DOM with a stable ID each, or undefined when the feed isn't rendered.
  items(document: Document): Map<Element,string> | undefined;
  // The feed item a mounted card belongs to.
  itemOf(card: Element): Element | null;
  mount(item: Element, card: HTMLElement): void;
};

const x: Site = {
  origin: 'https://x.com',
  matches: ['https://x.com/*'],
  active: location => location.pathname === '/home',
  items(document) {
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    if (!primary) return;
    const items = new Map<Element,string>();
    for (const cell of primary.querySelectorAll('[data-testid="cellInnerDiv"]')) {
      const link = cell.querySelector('article[data-testid="tweet"]')?.querySelector('time')?.closest('a');
      const id = link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
      if (id) items.set(cell,id);
    }
    return items;
  },
  itemOf: card => card.closest('[data-testid="cellInnerDiv"]'),
  mount: (item, card) => { item.append(card); },
};

export const sites: Site[] = [x];
export const matches = sites.flatMap(site => site.matches);
export function siteFor(url: string | undefined): Site | undefined {
  return sites.find(site => url?.startsWith(`${site.origin}/`));
}
