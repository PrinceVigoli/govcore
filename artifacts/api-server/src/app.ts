import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  (req as unknown as { _clerkDiagStart?: number })._clerkDiagStart = Date.now();
  const authHeader = req.headers.authorization;
  console.log(
    `[diag] Authorization header present: ${!!authHeader}, length: ${authHeader?.length ?? 0}, Cookie header present: ${!!req.headers.cookie}`,
  );
  next();
});
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(req.hostname, process.env.CLERK_PUBLISHABLE_KEY),
  })),
);
app.use((req, _res, next) => {
  const start = (req as unknown as { _clerkDiagStart?: number })._clerkDiagStart;
  console.log(`[diag] clerkMiddleware wall time: ${start ? Date.now() - start : "?"}ms`);
  next();
});

app.use("/api", router);

export default app;
