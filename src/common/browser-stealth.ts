import type { BrowserContext } from 'playwright';

import { log } from './logger.js';

export const GUEST_SESSION_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
export const GUEST_SESSION_LOCALE = 'de-AT';
export const GUEST_SESSION_TIMEZONE = 'Europe/Vienna';

const guestSessionInitScript = `
(() => {
  const overrideGetter = (object, property, getter) => {
    try {
      Object.defineProperty(object, property, { configurable: true, get: getter });
    } catch {}
  };

  const makePluginArray = () => {
    const plugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
    ];
    plugins.item = (index) => plugins[index] ?? null;
    plugins.namedItem = (name) => plugins.find((plugin) => plugin.name === name) ?? null;
    return plugins;
  };

  const brands = [
    { brand: 'Chromium', version: '135' },
    { brand: 'Google Chrome', version: '135' },
    { brand: 'Not.A/Brand', version: '24' },
  ];

  overrideGetter(Navigator.prototype, 'webdriver', () => undefined);
  overrideGetter(Navigator.prototype, 'languages', () => ['de-AT', 'de', 'en-US', 'en']);
  overrideGetter(Navigator.prototype, 'platform', () => 'MacIntel');
  overrideGetter(Navigator.prototype, 'hardwareConcurrency', () => 8);
  overrideGetter(Navigator.prototype, 'deviceMemory', () => 8);
  overrideGetter(Navigator.prototype, 'maxTouchPoints', () => 0);
  overrideGetter(Navigator.prototype, 'plugins', () => makePluginArray());
  overrideGetter(Navigator.prototype, 'userAgent', () => '${GUEST_SESSION_USER_AGENT}');
  overrideGetter(Navigator.prototype, 'userAgentData', () => ({
    brands,
    mobile: false,
    platform: 'macOS',
    getHighEntropyValues: async (hints) => {
      const values = {
        architecture: 'x86',
        bitness: '64',
        brands,
        mobile: false,
        model: '',
        platform: 'macOS',
        platformVersion: '15.0.0',
        uaFullVersion: '135.0.0.0',
        fullVersionList: brands.map((brand) => ({ ...brand, version: '135.0.0.0' })),
        wow64: false,
      };
      return Object.fromEntries((hints || []).map((hint) => [hint, values[hint]]));
    },
    toJSON: () => ({ brands, mobile: false, platform: 'macOS' }),
  }));

  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { app: {}, runtime: {}, csi: () => undefined, loadTimes: () => undefined },
    });
  } else if (!window.chrome.runtime) {
    Object.defineProperty(window.chrome, 'runtime', { configurable: true, value: {} });
  }

  if (window.outerWidth === 0) {
    Object.defineProperty(window, 'outerWidth', { configurable: true, get: () => window.innerWidth });
  }
  if (window.outerHeight === 0) {
    Object.defineProperty(window, 'outerHeight', { configurable: true, get: () => window.innerHeight + 88 });
  }

  const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
  if (originalQuery) {
    window.navigator.permissions.query = async (parameters) => {
      if (parameters?.name === 'notifications') {
        return { state: Notification.permission };
      }
      return originalQuery(parameters);
    };
  }

  const patchWebGL = (contextName) => {
    const context = window[contextName]?.prototype;
    if (!context?.getParameter) return;
    const originalGetParameter = context.getParameter;
    context.getParameter = function(parameter) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel(R) Iris(TM) Plus Graphics OpenGL Engine';
      return originalGetParameter.call(this, parameter);
    };
  };

  patchWebGL('WebGLRenderingContext');
  patchWebGL('WebGL2RenderingContext');
})();
`;

export const applyGuestSessionStealth = async (context: BrowserContext): Promise<void> => {
    log.info('Applying guest-session browser stealth hardening.');
    await context.setExtraHTTPHeaders({ 'Accept-Language': 'de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7' });
    await context.addInitScript({ content: guestSessionInitScript });
};
