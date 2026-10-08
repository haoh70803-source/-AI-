// ESM preload inherited by build children; never used by a runtime server.
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import process from "node:process";
import { syncBuiltinESMExports } from "node:module";
const deny = kind => {
  if (process.env.RELEASE_NETWORK_LOG) fs.appendFileSync(process.env.RELEASE_NETWORK_LOG, JSON.stringify({ kind, pid: process.pid }) + "\n");
  throw new Error("RELEASE_BUILD_NETWORK_DENIED");
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0];
  if (typeof first === "string" && !/^\d+$/.test(first)) return connect.apply(this, args);
  if (first && typeof first === "object" && first.path && !first.port) return connect.apply(this, args);
  return deny("tcp");
};
for (const module of [http, https]) for (const key of ["request","get"]) module[key] = () => deny(key);
tls.connect = () => deny("tls");
globalThis.fetch = async () => deny("fetch");
syncBuiltinESMExports();
