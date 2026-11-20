#!/usr/bin/env node

import WebSocket from "ws";
import http from "http";
import * as number from "lib0/number";
import { setupWSConnection } from "./utils.js";

const wss = new WebSocket.Server({ noServer: true });
const host = process.env.HOST || "0.0.0.0";
const port = number.parseInt(process.env.PORT || "1234");

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("okay");
});

wss.on("connection", setupWSConnection);

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(port, host, () => {
  console.log(`y-websocket (yjs 13) running at '${host}' on port ${port}`);
});
