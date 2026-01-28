const webSocketURL = (location.hostname === "dictee.djoleden.nl")
  ? `wss://${location.hostname}/ws`
  : `ws://${location.hostname}:7001`;

const ws = new WebSocket(webSocketURL);
