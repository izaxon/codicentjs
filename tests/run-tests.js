const { strict: assert } = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const librarySource = fs.readFileSync(path.resolve(__dirname, '../codicentjs.js'), 'utf8');

const SIGNALR_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/3.1.0/signalr.js';

const createResponse = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

const createTestEnv = () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>', {
    url: 'https://example.com/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });

  const { window } = dom;
  window.console = console;
  window.Response = window.Response || global.Response;
  window.AbortController = window.AbortController || global.AbortController;
  window.CustomEvent = window.CustomEvent || function CustomEvent() {};
  window.window = window;
  window.globalThis = window;
  window.global = window;
  window.fetch = async () => {
    throw new Error('Unexpected fetch invocation');
  };

  vm.runInContext(librarySource, dom.getInternalVMContext());

  const scriptEl = window.document.head.querySelector(`script[src="${SIGNALR_CDN}"]`);
  if (!scriptEl) {
    throw new Error('SignalR loader script element was not created');
  }

  return { dom, window, scriptEl };
};

const installSignalRStub = (window) => {
  const buildCalls = [];
  const startCalls = [];
  const listeners = {};
  const closeCallbacks = [];

  class Connection {
    constructor(state) {
      this.state = state;
    }

    start() {
      startCalls.push(this.state);
      return Promise.resolve();
    }

    onclose(callback) {
      closeCallbacks.push(callback);
    }

    on(event, callback) {
      listeners[event] = callback;
    }
  }

  class HubConnectionBuilder {
    constructor() {
      this.state = {
        url: null,
        options: null,
        logging: null,
        automaticReconnect: false,
      };
    }

    withUrl(url, options) {
      this.state.url = url;
      this.state.options = options;
      return this;
    }

    configureLogging(level) {
      this.state.logging = level;
      return this;
    }

    withAutomaticReconnect() {
      this.state.automaticReconnect = true;
      return this;
    }

    build() {
      buildCalls.push(this.state);
      return new Connection(this.state);
    }
  }

  window.signalR = {
    HubConnectionBuilder,
    LogLevel: { None: 'None' },
    __getInspection: () => ({ buildCalls, startCalls, listeners, closeCallbacks }),
  };

  return window.signalR;
};

const createFetchStub = (window) => {
  const calls = [];
  const responders = [];

  const stub = async (url, options = {}) => {
    const call = { url, options };
    calls.push(call);

    for (const { predicate, responder } of responders) {
      const match =
        typeof predicate === 'string'
          ? url.includes(predicate)
          : predicate(url, options, call);
      if (match) {
        return responder(url, options, call);
      }
    }

    throw new Error(`No fetch responder registered for ${url}`);
  };

  stub.when = (predicate, responder) => {
    responders.push({ predicate, responder });
  };

  stub.calls = calls;

  window.fetch = stub;

  return stub;
};

const testQueueAndFlush = async () => {
  const { dom, window, scriptEl } = createTestEnv();
  const signalRStub = installSignalRStub(window);
  const fetchStub = createFetchStub(window);

  fetchStub.when('AddChatMessage', async () => createResponse(200, { id: 'message-123' }));
  fetchStub.when('GetChatMessages', async () =>
    createResponse(200, [
      {
        id: '1',
        content: 'hello world',
        createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      },
    ]),
  );

  const initPromise = window.Codicent.init({
    token: 'token-123',
    signalRHost: 'https://pubsub.codicent.com/hub',
    log: () => {},
    handleMessage: () => {},
  });
  const postPromise = window.Codicent.postMessage({ message: '@project #tag {"foo":"bar"}' });
  const getPromise = window.Codicent.getMessages({ search: 'world' });

  scriptEl.onload();

  await initPromise;
  const postResult = await postPromise;
  const messages = await getPromise;

  assert.equal(postResult, 'message-123');
  assert.ok(Array.isArray(messages));
  assert.equal(messages.length, 1);
  assert.ok(messages[0].createdAt instanceof window.Date);

  const inspection = signalRStub.__getInspection();
  assert.equal(inspection.buildCalls.length, 1);
  assert.equal(inspection.startCalls.length, 1);
  assert.equal(inspection.buildCalls[0].url, 'https://pubsub.codicent.com/hub');
  assert.equal(inspection.buildCalls[0].options.accessTokenFactory(), 'token-123');

  assert.equal(fetchStub.calls.filter((call) => call.url.includes('AddChatMessage')).length, 1);
  assert.equal(fetchStub.calls.filter((call) => call.url.includes('GetChatMessages')).length, 1);

  dom.window.close();
};

const testSignalRErrorFallback = async () => {
  const { dom, window, scriptEl } = createTestEnv();

  const initPromise = window.Codicent.init({ token: 'token-123' });
  assert.equal(typeof initPromise?.then, 'function');

  scriptEl.onerror();

  await assert.rejects(initPromise, /SignalR failed to load/);

  window.Codicent.init({ token: 'token-abc', baseUrl: 'https://alt.example/' });
  assert.equal(window.Codicent.token, 'token-abc');
  assert.equal(window.Codicent.baseUrl, 'https://alt.example/');

  dom.window.close();
};

const testImmediateCallsAfterLoad = async () => {
  const { dom, window, scriptEl } = createTestEnv();
  const signalRStub = installSignalRStub(window);
  const fetchStub = createFetchStub(window);

  fetchStub.when('AddChatMessage', async () => createResponse(200, { id: 'post-1' }));

  const firstInit = window.Codicent.init({
    token: 'first-token',
    signalRHost: 'https://pubsub.codicent.com/hub',
    log: () => {},
    handleMessage: () => {},
  });

  scriptEl.onload();
  await firstInit;

  const inspectionAfterFirstInit = signalRStub.__getInspection();
  assert.equal(inspectionAfterFirstInit.startCalls.length, 1);

  const secondInitResult = window.Codicent.init({
    token: 'second-token',
    signalRHost: 'https://pubsub.codicent.com/hub',
    log: () => {},
    handleMessage: () => {},
  });

  assert.equal(secondInitResult, undefined);

  await Promise.resolve();

  const inspectionAfterSecondInit = signalRStub.__getInspection();
  assert.equal(inspectionAfterSecondInit.startCalls.length, 2);
  assert.equal(window.Codicent.token, 'second-token');

  const postId = await window.Codicent.postMessage({ message: '@project #tag {"bar":123}' });
  assert.equal(postId, 'post-1');
  assert.equal(fetchStub.calls.filter((call) => call.url.includes('AddChatMessage')).length, 1);

  dom.window.close();
};

const run = async () => {
  const tests = [
    { name: 'queues calls before SignalR loads and flushes successfully', fn: testQueueAndFlush },
    { name: 'falls back gracefully when SignalR fails to load', fn: testSignalRErrorFallback },
    { name: 'direct calls work immediately after SignalR is ready', fn: testImmediateCallsAfterLoad },
  ];

  for (const test of tests) {
    await test.fn();
    console.log(`✓ ${test.name}`);
  }

  console.log('All tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
