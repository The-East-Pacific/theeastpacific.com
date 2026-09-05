export interface SiteNavLink {
  href: string;
  label: string;
  external?: boolean;
}

/**
 * Single source of truth for the site navigation.
 * Used by both the docs header (Starlight pages: home, /blog/) and the
 * blog-post header (SiteHeader), so editing nav here updates every page.
 */
export const siteNav: SiteNavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/blog/', label: 'Blog' },
  { href: 'https://forum.theeastpacific.com', label: 'Forum', external: true },
  { href: 'https://tep.one', label: 'Community', external: true },
  // Discord is intentionally absent: it's already available as an icon
  // next to the search bar on docs pages, and as a footer link everywhere.
];

/** Returns whether a nav link should render as active for the given path. */
export function isNavActive(currentPath: string, link: SiteNavLink): boolean {
  if (link.external) return false;
  return link.href === '/'
    ? currentPath === link.href
    : currentPath.startsWith(link.href);
}