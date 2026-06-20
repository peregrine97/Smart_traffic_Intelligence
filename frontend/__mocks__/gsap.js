// Mock for GSAP (GreenSock Animation Platform)
// This mock must support both CJS `require('gsap')` and ESM `import gsap from 'gsap'`
const gsap = {
  to: jest.fn(),
  from: jest.fn(),
  fromTo: jest.fn(),
  set: jest.fn(),
  timeline: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    fromTo: jest.fn().mockReturnThis(),
    play: jest.fn().mockReturnThis(),
    pause: jest.fn().mockReturnThis(),
    kill: jest.fn(),
  })),
  registerPlugin: jest.fn(),
  context: jest.fn((fn) => {
    try { if (typeof fn === 'function') fn(); } catch(e) {}
    return { revert: jest.fn(), kill: jest.fn() };
  }),
  config: { autoSleep: 120, force3D: 'auto' },
  ticker: { add: jest.fn(), remove: jest.fn() },
  utils: {
    toArray: jest.fn((x) => Array.isArray(x) ? x : [x]),
    clamp: jest.fn((min, max, val) => Math.min(Math.max(val, min), max)),
  },
  killTweensOf: jest.fn(),
  getProperty: jest.fn(),
};

// ScrollTrigger mock
const ScrollTrigger = {
  create: jest.fn(),
  getAll: jest.fn(() => []),
  refresh: jest.fn(),
  update: jest.fn(),
  kill: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// CJS default export — `require('gsap')` returns this directly
module.exports = gsap;
// ESM interop — `import gsap from 'gsap'` resolves to `module.exports.default`
module.exports.default = gsap;
// Named exports
module.exports.gsap = gsap;
module.exports.ScrollTrigger = ScrollTrigger;
// Make sure __esModule is set so TypeScript/Babel ESM interop picks up `default`
module.exports.__esModule = true;
