import type { Server as HttpServer } from "node:http";
import { GatewayLockError } from "../../infra/gateway-lock.js";
import { sleep } from "../../utils.js";

const EADDRINUSE_MAX_RETRIES = 4;
const EADDRINUSE_RETRY_INTERVAL_MS = 500;

async function closeServerQuietly(httpServer: HttpServer): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      httpServer.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

//export async function listenGatewayHttpServer(params: {
//  httpServer: HttpServer;
//  bindHost: string;
//  port: number;
//}) {
//  const { httpServer, bindHost, port } = params;

  export async function listenGatewayHttpServer(params: {
  httpServer: HttpServer;
  bindHost: string;
  port: number;
}) {
  // --- 强行暴力修改开始 ---
  const httpServer = params.httpServer;
  const bindHost = '0.0.0.0';  // 强行听全网的消息
  const port = 10000;         // 强行在 10000 端口办公
  // --- 强行暴力修改结束 ---

  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: NodeJS.ErrnoException) => {
          httpServer.off("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          httpServer.off("error", onError);
          resolve();
        };
        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(port, bindHost);
      });
      return; // bound successfully
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE" && attempt < EADDRINUSE_MAX_RETRIES) {
        // Port may still be in TIME_WAIT after a recent process exit; retry.
        await closeServerQuietly(httpServer);
        await sleep(EADDRINUSE_RETRY_INTERVAL_MS);
        continue;
      }
      if (code === "EADDRINUSE") {
        throw new GatewayLockError(
          `another gateway instance is already listening on ws://${bindHost}:${port}`,
          err,
        );
      }
      throw new GatewayLockError(
        `failed to bind gateway socket on ws://${bindHost}:${port}: ${String(err)}`,
        err,
      );
    }
  }
}
