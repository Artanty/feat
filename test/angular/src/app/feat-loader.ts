import { Injectable, InjectionToken, inject } from '@angular/core';

/**
 * Where the feat router lives. In dev the local router; in prod an app provides
 * its own value, e.g.
 *   { provide: FEAT_BASE_URL, useValue: 'https://feat.example.com' }
 */
export const FEAT_BASE_URL = new InjectionToken<string>('featBaseUrl', {
  providedIn: 'root',
  factory: () => 'http://127.0.0.1:5099',
});

// module-level: one load per versioned URL per page lifetime
// (bundles are immutable, reloading them would just re-define custom elements)
const loaded = new Set<string>();

@Injectable({ providedIn: 'root' })
export class FeatLoader {
  private readonly base = inject(FEAT_BASE_URL);

  /**
   * Resolve a feature the way a real consumer does in prod:
   *
   *   1. request  <base>/<feature>/latest/<ns>   (302 — flip propagates here)
   *   2. take response.url                       (final versioned URL, immutable)
   *   3. load that URL as a script and await it
   *
   * Returns the resolved URL so callers can show what was actually loaded.
   */
  async load(feature: string, ns: string): Promise<string> {
    const res = await fetch(`${this.base}/${feature}/latest/${ns}`, {
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`feat: ${feature}/${ns} unresolved (HTTP ${res.status})`);
    }

    const url = res.url; // e.g. http://…/version-display/v1/js-web/
    if (loaded.has(url)) {
      return url;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`feat: failed to load ${url}`));
      document.head.appendChild(script);
    });

    loaded.add(url);
    return url;
  }
}
