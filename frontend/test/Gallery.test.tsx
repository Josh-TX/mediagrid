import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Gallery } from "../src/components/Gallery"
import { server } from "./mocks/server"
import { MOCK_SHUFFLE_ID } from "./mocks/handlers"

function renderGallery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Gallery />
    </QueryClientProvider>,
  )
}

describe("Gallery", () => {
  it("shows skeleton block while blocks are loading", async () => {
    // Block the blocks response so isFetching stays true after presets load
    server.use(http.get("/api/blocks", () => new Promise<Response>(() => {})))
    renderGallery()
    await waitFor(() => screen.getByTestId("skeleton-block"))
    expect(screen.getByTestId("skeleton-block")).toBeInTheDocument()
  })

  it("renders images after successful fetch", async () => {
    renderGallery()
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2))
  })

  it("shows images with correct src paths", async () => {
    renderGallery()
    await waitFor(() => screen.getAllByRole("img"))
    const srcs = screen.getAllByRole("img").map((img) => (img as HTMLImageElement).src)
    expect(srcs.some((s) => s.includes("a.jpg"))).toBe(true)
    expect(srcs.some((s) => s.includes("b.jpg"))).toBe(true)
  })

  it("shows No results when API returns empty media", async () => {
    server.use(
      http.get("/api/blocks", () => HttpResponse.json({ shuffleId: 100000, totalBlocks: 0, totalMedia: 0, blocks: [] })),
    )
    renderGallery()
    await waitFor(() => screen.getByTestId("gallery-empty"))
    expect(screen.getByTestId("gallery-empty")).toHaveTextContent("No results")
  })

  it("shows end text with result count after all blocks load", async () => {
    renderGallery()
    await waitFor(() => screen.getByTestId("gallery-end"))
    expect(screen.getByTestId("gallery-end")).toHaveTextContent("(2 results)")
  })

  it("shows error toast on API failure", async () => {
    server.use(http.get("/api/blocks", () => HttpResponse.json({}, { status: 500 })))
    renderGallery()
    await waitFor(() => screen.getByText("Failed to load media"))
  })

  it("gallery container is always in the DOM", () => {
    renderGallery()
    expect(screen.getByTestId("gallery")).toBeInTheDocument()
  })

  it("shows full error state when presets fetch fails", async () => {
    server.use(http.get("/api/presets", () => HttpResponse.json({}, { status: 500 })))
    renderGallery()
    await waitFor(() => screen.getByTestId("presets-error"))
  })

  it("renders preset select with loaded presets", async () => {
    renderGallery()
    await waitFor(() => screen.getByRole("combobox", { name: "Active preset" }))
    const select = screen.getByRole("combobox", { name: "Active preset" }) as HTMLSelectElement
    expect(select.value).toBe("default")
  })
})

describe("browser history navigation", () => {
  function renderGallery() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <Gallery />
      </QueryClientProvider>,
    )
  }

  afterEach(() => {
    history.replaceState(null, "", "/")
    vi.restoreAllMocks()
  })

  it("tile click pushes history entry with i param", async () => {
    const pushSpy = vi.spyOn(history, "pushState")
    renderGallery()
    await waitFor(() => screen.getByRole("img", { name: "a.jpg" }))
    fireEvent.click(screen.getByRole("img", { name: "a.jpg" }).closest("button")!)
    const lastCall = pushSpy.mock.calls.at(-1)!
    expect(String(lastCall[2])).toContain("i=0")
    expect(String(lastCall[2])).toContain(`s=${MOCK_SHUFFLE_ID}`)
  })

  it("closing player via back button pushes history entry without i param", async () => {
    const pushSpy = vi.spyOn(history, "pushState")
    renderGallery()
    await waitFor(() => screen.getByRole("img", { name: "a.jpg" }))
    fireEvent.click(screen.getByRole("img", { name: "a.jpg" }).closest("button")!)
    await waitFor(() => screen.getByRole("button", { name: "Back" }))
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    const lastCall = pushSpy.mock.calls.at(-1)!
    expect(String(lastCall[2])).not.toContain("i=")
  })

  it("reshuffle pushes history entry without s param", async () => {
    const pushSpy = vi.spyOn(history, "pushState")
    renderGallery()
    await waitFor(() => screen.getByRole("img", { name: "a.jpg" }))
    fireEvent.click(screen.getByRole("button", { name: "Re-shuffle" }))
    expect(pushSpy).toHaveBeenCalled()
    const lastCall = pushSpy.mock.calls.at(-1)!
    // After reshuffle, shuffleId is null so s= should not be in URL
    expect(String(lastCall[2])).not.toContain("s=")
  })

  it("sort change pushes history entry with sort param", async () => {
    const pushSpy = vi.spyOn(history, "pushState")
    renderGallery()
    await waitFor(() => screen.getByRole("img", { name: "a.jpg" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "az" } })
    expect(pushSpy).toHaveBeenCalled()
    const lastCall = pushSpy.mock.calls.at(-1)!
    expect(String(lastCall[2])).toContain("sort=az")
  })

  it("server shuffle assignment uses replaceState not pushState", async () => {
    // On first load the URL has no s= — server assigns a new shuffleId via replaceState.
    const pushSpy = vi.spyOn(history, "pushState")
    const replaceSpy = vi.spyOn(history, "replaceState")
    renderGallery()
    await waitFor(() => screen.getByRole("img", { name: "a.jpg" }))
    const shuffleCalls = replaceSpy.mock.calls.filter((c) => String(c[2]).includes("s="))
    expect(shuffleCalls.length).toBeGreaterThan(0)
    // pushState should NOT have been called for the initial s= assignment
    const pushShuffleCalls = pushSpy.mock.calls.filter((c) => String(c[2]).includes("s="))
    expect(pushShuffleCalls.length).toBe(0)
  })

  it("initial page load with s and i params opens player immediately", async () => {
    history.replaceState(null, "", `?s=${MOCK_SHUFFLE_ID}&i=0`)
    renderGallery()
    await waitFor(() => screen.getByRole("button", { name: "Back" }))
  })

  it("popstate syncs search state from URL", async () => {
    renderGallery()
    await waitFor(() => screen.getByRole("searchbox", { name: "Search" }))
    // Navigate to a URL with a search query
    history.pushState(null, "", "?q=hello")
    window.dispatchEvent(new PopStateEvent("popstate"))
    await waitFor(() => {
      const input = screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement
      expect(input.value).toBe("hello")
    })
  })
})
