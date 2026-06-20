// jest.setup.js
// Runs after the test framework is installed in the environment
require('@testing-library/jest-dom');

// ── Global fetch mock ──────────────────────────────────────────────────────
global.fetch = jest.fn();

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  // Reset fetch mock
  global.fetch.mockReset();
});

// ── Mock next/navigation ───────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
}));

// ── Mock next/image ────────────────────────────────────────────────────────
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    const React = require('react');
    return React.createElement('img', { src: props.src, alt: props.alt, ...props });
  },
}));

// ── Mock framer-motion ─────────────────────────────────────────────────────
jest.mock('framer-motion', () => {
  const React = require('react');
  const createMotionComponent = (tag) => {
    return React.forwardRef((props, ref) => {
      const { children, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    });
  };

  return {
    motion: {
      div: createMotionComponent('div'),
      section: createMotionComponent('section'),
      span: createMotionComponent('span'),
      p: createMotionComponent('p'),
      h1: createMotionComponent('h1'),
      h2: createMotionComponent('h2'),
      h3: createMotionComponent('h3'),
      ul: createMotionComponent('ul'),
      li: createMotionComponent('li'),
      button: createMotionComponent('button'),
      nav: createMotionComponent('nav'),
      header: createMotionComponent('header'),
      footer: createMotionComponent('footer'),
      a: createMotionComponent('a'),
    },
    AnimatePresence: ({ children }) => children,
    useAnimation: () => ({ start: jest.fn(), stop: jest.fn(), set: jest.fn() }),
    useInView: () => [jest.fn(), true],
    useMotionValue: (initial) => ({ get: () => initial, set: jest.fn() }),
    useTransform: () => ({ get: jest.fn() }),
    useSpring: (value) => value,
  };
});

// ── Mock IntersectionObserver ─────────────────────────────────────────────
global.IntersectionObserver = class IntersectionObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  constructor() {}
};

// ── Mock ResizeObserver ───────────────────────────────────────────────────
global.ResizeObserver = class ResizeObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  constructor() {}
};

// ── Mock window.matchMedia ────────────────────────────────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// ── Mock window.scrollTo ──────────────────────────────────────────────────
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: jest.fn(),
});

// ── Mock EventSource (used by SSE) ────────────────────────────────────────
global.EventSource = jest.fn().mockImplementation(() => ({
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn(),
  onmessage: null,
  onerror: null,
  onopen: null,
  readyState: 1,
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
}));

// ── Mock TextEncoder/TextDecoder (for SSE streaming) ──────────────────────
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// ── Mock ReadableStream (jsdom doesn't include it) ────────────────────────
if (typeof global.ReadableStream === 'undefined') {
  const { ReadableStream } = require('stream/web');
  global.ReadableStream = ReadableStream;
}
