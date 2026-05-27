import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { Gallery } from "../src/components/Gallery"
import { server } from "./mocks/server"

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
