import "@testing-library/jest-dom"
import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./mocks/server"

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// jsdom doesn't implement IntersectionObserver, ResizeObserver, or scrollTo
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

window.scrollTo = () => {}
