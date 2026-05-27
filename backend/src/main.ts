import { BunContext, BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { HttpServer } from "@effect/platform"
import { Effect, Layer } from "effect"
import { router } from "./router"
import { DatabaseLive } from "./db"
import { enqueueScan } from "./tasks"

const PORT = Number(process.env["PORT"] ?? 3000)

const ServerLive = BunHttpServer.layer({ port: PORT })

const LogStartup = Layer.effectDiscard(Effect.sync(() => console.log(`listening on port ${PORT}`)))

const ScanOnStartup = Layer.effectDiscard(Effect.forkDaemon(enqueueScan()))

const app = HttpServer.serve(router).pipe(
  Layer.provide(ScanOnStartup),
  Layer.provide(LogStartup),
  Layer.provide(DatabaseLive),
  Layer.provide(ServerLive),
  Layer.provide(BunContext.layer),
)

BunRuntime.runMain(Layer.launch(app))
