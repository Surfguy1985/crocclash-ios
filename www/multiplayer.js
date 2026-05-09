// multiplayer.js — Online Multiplayer Client for Croc Clash (v2.0)
const MP = (() => {
  let ws = null;
  let roomCode = null;
  let playerNum = 0;        // 1 = host, 2 = guest
  let connected = false;
  let retryCount = 0;
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 1500;
  const PING_INTERVAL = 20000;
  const INPUT_RATE_MS = 33;  // ~30 fps input send rate for guest

  let pingTimer = null;
  let lastInputSent = 0;
  let pendingState = null;
  let stateFlushTimer = null;
  let intentionalClose = false;
  let connectResolve = null; // Promise resolver for connect()

  // Callbacks
  let onOpponentInput = null;
  let onStateUpdate = null;
  let onOpponentJoined = null;
  let onOpponentLeft = null;
  let onRoomCreated = null;
  let onJoinedRoom = null;
  let onError = null;
  let onDisconnect = null;
  let onConnected = null;
  let onRematch = null;
  let onLoadout = null;
  let onEvent = null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getWSUrl() {
    // If CROC_SERVER is set (e.g. Railway URL), derive WebSocket URL from it
    if (window.CROC_SERVER) {
      const base = window.CROC_SERVER.replace(/\/$/, '');
      // https → wss, http → ws
      return base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    }
    // Same-origin fallback
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host;
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch (e) { console.warn('[MP] send error:', e); }
    }
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => send({ t: 'ping' }), PING_INTERVAL);
  }

  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  /** Connect to WebSocket server. Returns a promise that resolves when connected. */
  function connect() {
    intentionalClose = false;
    retryCount = 0;
    return new Promise((resolve) => {
      connectResolve = resolve;
      _connect();
    });
  }

  function _connect() {
    // Clean up old socket
    if (ws) {
      try { ws.onclose = null; ws.onerror = null; ws.close(); } catch (_) {}
      ws = null;
    }

    const url = getWSUrl();
    console.log('[MP] Connecting to', url);

    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('[MP] WebSocket creation failed:', e);
      if (onError) onError('Failed to connect. Check your internet connection.');
      if (connectResolve) { connectResolve(false); connectResolve = null; }
      return;
    }

    ws.onopen = () => {
      connected = true;
      retryCount = 0;
      console.log('[MP] WebSocket open');
      startPing();
      // Don't resolve yet — wait for 'welcome' message from server
    };

    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      
      // Handle welcome message (connection fully ready)
      if (msg.t === 'welcome') {
        console.log('[MP] Connected and ready');
        if (connectResolve) { connectResolve(true); connectResolve = null; }
        if (onConnected) onConnected();
        return;
      }
      
      handleMessage(msg);
    };

    ws.onerror = (e) => {
      console.warn('[MP] WebSocket error');
    };

    ws.onclose = (evt) => {
      const wasConnected = connected;
      connected = false;
      stopPing();
      console.log('[MP] Disconnected (code=%d, intentional=%s)', evt.code, intentionalClose);
      
      if (intentionalClose) {
        if (connectResolve) { connectResolve(false); connectResolve = null; }
        if (onDisconnect) onDisconnect();
        return;
      }
      
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = RETRY_DELAY * Math.min(retryCount, 3);
        console.log('[MP] Reconnecting… attempt %d/%d in %dms', retryCount, MAX_RETRIES, delay);
        setTimeout(_connect, delay);
      } else {
        console.warn('[MP] Max reconnect attempts reached.');
        if (connectResolve) { connectResolve(false); connectResolve = null; }
        if (onDisconnect) onDisconnect();
        if (onError) onError('Connection lost. Please refresh and try again.');
      }
    };
  }

  // ── Message Dispatch ───────────────────────────────────────────────────────

  function handleMessage(msg) {
    switch (msg.t) {
      case 'created':
        roomCode = msg.code;
        playerNum = 1;
        if (onRoomCreated) onRoomCreated(msg.code);
        break;

      case 'joined':
        roomCode = msg.code;
        playerNum = msg.num;
        if (onJoinedRoom) onJoinedRoom(msg.num, msg.code);
        break;

      case 'opponent_joined':
        if (onOpponentJoined) onOpponentJoined();
        break;

      case 'opponent_left':
        if (onOpponentLeft) onOpponentLeft();
        break;

      case 'input':
        if (onOpponentInput) onOpponentInput(msg.inp);
        break;

      case 'state':
        if (onStateUpdate) onStateUpdate(msg.s);
        break;

      case 'rematch':
        if (onRematch) onRematch();
        break;

      case 'loadout':
        if (onLoadout) onLoadout(msg.lo, msg.from);
        break;

      case 'event':
        if (onEvent) onEvent(msg.ev);
        break;

      case 'room_closed':
        console.log('[MP] Room closed:', msg.reason);
        roomCode = null;
        playerNum = 0;
        if (onOpponentLeft) onOpponentLeft();
        break;

      case 'error':
        console.warn('[MP] Server error:', msg.msg);
        if (onError) onError(msg.msg || 'Unknown server error.');
        break;

      case 'pong':
        break;

      default:
        console.warn('[MP] Unknown message:', msg.t);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function createRoom() {
    if (!connected) { if (onError) onError('Not connected to server.'); return; }
    send({ t: 'create' });
  }

  function joinRoom(code) {
    if (!connected) { if (onError) onError('Not connected to server.'); return; }
    if (!code || typeof code !== 'string' || code.trim().length < 4) {
      if (onError) onError('Enter a valid 4-character room code.');
      return;
    }
    send({ t: 'join', code: code.trim().toUpperCase() });
  }

  /** P2 only — send input snapshot to host at fixed rate */
  function sendInput(inp) {
    if (!connected || playerNum !== 2) return;
    // Always send — the host needs continuous updates for held keys
    send({ t: 'input', inp });
  }

  /** P1 only — broadcast game state to guest */
  function sendState(state) {
    if (!connected || playerNum !== 1) return;
    // Send immediately — the game loop already throttles to ~20fps
    send({ t: 'state', s: state });
  }

  function sendRematch() {
    send({ t: 'rematch' });
  }

  function sendGameStart() {
    send({ t: 'game_start' });
  }

  /** Send loadout selection to opponent */
  function sendLoadout(lo) {
    send({ t: 'loadout', lo });
  }

  /** Send a game event to the opponent (videos, effects, round transitions) */
  function sendEvent(ev) {
    send({ t: 'event', ev });
  }

  function disconnect() {
    intentionalClose = true;
    stopPing();
    if (stateFlushTimer) { clearTimeout(stateFlushTimer); stateFlushTimer = null; }
    send({ t: 'leave' });
    if (ws) { try { ws.close(1000, 'Client disconnect'); } catch (_) {} ws = null; }
    connected = false;
    roomCode = null;
    playerNum = 0;
  }

  function isHost()       { return playerNum === 1; }
  function isGuest()      { return playerNum === 2; }
  function isConnected()  { return connected; }
  function getRoom()      { return roomCode; }
  function getPlayerNum() { return playerNum; }

  return {
    connect, createRoom, joinRoom, sendInput, sendState, disconnect,
    sendRematch, sendGameStart, sendLoadout, sendEvent,
    isHost, isGuest, isConnected, getRoom, getPlayerNum,
    set onOpponentInput(fn)  { onOpponentInput  = fn; },
    set onStateUpdate(fn)    { onStateUpdate    = fn; },
    set onOpponentJoined(fn) { onOpponentJoined = fn; },
    set onOpponentLeft(fn)   { onOpponentLeft   = fn; },
    set onRoomCreated(fn)    { onRoomCreated    = fn; },
    set onJoinedRoom(fn)     { onJoinedRoom     = fn; },
    set onError(fn)          { onError          = fn; },
    set onDisconnect(fn)     { onDisconnect     = fn; },
    set onConnected(fn)      { onConnected      = fn; },
    set onRematch(fn)        { onRematch        = fn; },
    set onLoadout(fn)        { onLoadout        = fn; },
    set onEvent(fn)          { onEvent          = fn; },
  };
})();
