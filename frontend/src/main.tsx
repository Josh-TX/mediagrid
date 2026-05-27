import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Gallery } from "./components/Gallery"
import "./index.css"

const queryClient = new QueryClient()

const root = document.getElementById("root")!
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Gallery />
    </QueryClientProvider>
  </StrictMode>,
)
