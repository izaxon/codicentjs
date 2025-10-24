(function (window) {
  // Queue to store function calls made before SignalR loads
  let pendingCalls = [];
  let isSignalRLoaded = false;

  // Helper function to queue or execute calls
  const queueOrExecute = (fnName, args) => {
    if (isSignalRLoaded) {
      return window.Codicent[fnName](...args);
    } else {
      return new Promise((resolve, reject) => {
        pendingCalls.push({ fnName, args, resolve, reject });
      });
    }
  };

  // Initialize Codicent object immediately with version info
  window.Codicent = {
    version: '1.0.0',
    baseUrl: 'https://codicent.com/',
    token: null,
    signalRHost: "https://pubsub.codicent.com/hub",
    state: {},
    log: () => { },
    handleMessage: () => { },
    // Queue functions until SignalR loads
    init: (...args) => queueOrExecute('init', args),
    postMessage: (...args) => queueOrExecute('postMessage', args),
    getMessages: (...args) => queueOrExecute('getMessages', args)
  };

  const signalRScript = document.createElement('script');
  signalRScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/3.1.0/signalr.js';
  signalRScript.onload = () => {
    initCodicent();
    // Process queued calls
    isSignalRLoaded = true;
    pendingCalls.forEach(({ fnName, args, resolve, reject }) => {
      try {
        const result = window.Codicent[fnName](...args);
        if (result && typeof result.then === 'function') {
          result.then(resolve).catch(reject);
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(error);
      }
    });
    pendingCalls = [];
  };
  signalRScript.onerror = () => {
    // Even if SignalR fails to load, keep the version info available
    console.warn('SignalR failed to load. Some Codicent features may not be available.');
    // Provide a fallback init function that doesn't require SignalR
    window.Codicent.init = (props = {}) => {
      window.Codicent = { ...window.Codicent, ...props };
      console.warn('Codicent initialized in fallback mode. Real-time features are not available.');
    };
    // Reject all pending calls
    isSignalRLoaded = true;
    pendingCalls.forEach(({ reject }) => {
      reject(new Error('SignalR failed to load. Codicent features are not available.'));
    });
    pendingCalls = [];
  };
  document.head.appendChild(signalRScript);

  const initCodicent = () => {
    // Private function for robust fetch with retries
    const robustFetch = async (url, options = {}, retryOptions = {}) => {
      const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 120000,  // 2 minutes
        exponentialBase = 2,
        jitterFactor = 0.1,
        retryOn = [408, 429, 500, 502, 503, 504],
        timeout = 30000
      } = retryOptions;

      const { log } = window.Codicent;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let controller;
        let timeoutId;

        try {
          // Create abort controller for timeout
          controller = new AbortController();
          let signal = controller.signal;

          // Handle combining signals manually for compatibility
          if (options.signal) {
            // Create a new controller that will abort when either signal aborts
            const combinedController = new AbortController();
            signal = combinedController.signal;

            // Listen for abort on the original signal
            if (options.signal.aborted) {
              combinedController.abort();
            } else {
              options.signal.addEventListener('abort', () => {
                combinedController.abort();
              }, { once: true });
            }

            // Listen for abort on the timeout controller
            if (controller.signal.aborted) {
              combinedController.abort();
            } else {
              controller.signal.addEventListener('abort', () => {
                combinedController.abort();
              }, { once: true });
            }
          }

          // Set timeout
          timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(url, {
            ...options,
            signal
          });

          clearTimeout(timeoutId);

          // Check if response status should trigger a retry
          if (!response.ok && retryOn.includes(response.status) && attempt < maxRetries) {
            const delay = calculateRetryDelay(attempt, baseDelay, exponentialBase, maxDelay, jitterFactor);
            log(`HTTP ${response.status} error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(delay);
            continue;
          }

          return response;

        } catch (error) {
          clearTimeout(timeoutId);

          // Don't retry on user abort or non-network errors unless it's the last attempt
          if (error.name === 'AbortError' && options.signal?.aborted) {
            throw error;
          }

          if (attempt === maxRetries) {
            throw error;
          }

          // Check if error should trigger a retry (network errors, timeouts)
          const shouldRetry = error.name === 'AbortError' || // timeout
            error.name === 'TypeError' || // network error
            error.name === 'NetworkError' ||
            error.message?.includes('fetch');

          if (shouldRetry) {
            const delay = calculateRetryDelay(attempt, baseDelay, exponentialBase, maxDelay, jitterFactor);
            log(`Network error: ${error.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(delay);
            continue;
          }

          throw error;
        }
      }
    };

    // Helper function to calculate retry delay with exponential backoff and jitter
    const calculateRetryDelay = (attempt, baseDelay, exponentialBase, maxDelay, jitterFactor) => {
      const exponentialDelay = baseDelay * Math.pow(exponentialBase, attempt);
      const jitter = exponentialDelay * jitterFactor * (Math.random() * 2 - 1);
      return Math.min(exponentialDelay + jitter, maxDelay);
    };

    // Helper function to sleep for a given number of milliseconds
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Enhance the existing Codicent object with full functionality
    const fullCodicentObject = {
      version: '1.0.0',
      baseUrl: 'https://codicent.com/',
      token: null,
      signalRHost: "https://pubsub.codicent.com/hub",
      state: {},
      log: () => { },
      handleMessage: () => { },
      init: (props = {}) => {
        window.Codicent = { ...window.Codicent, ...props };
        const { token, signalRHost, log, handleMessage } = window.Codicent;
        if (!token || token.trim() === "") {
          throw new Error('Token is required to initialize Codicent');
        }

        if (!signalRHost || signalRHost.trim() === "") {
          throw new Error('SignalR Host is required to initialize Codicent');
        }

        window.Codicent.state.connection = new signalR.HubConnectionBuilder()
          .withUrl(signalRHost, {
            accessTokenFactory: () => token,
          })
          .configureLogging(signalR.LogLevel.None)
          .withAutomaticReconnect()
          .build();

        const { connection } = window.Codicent.state;
        let connectionErrorLogged = false;
        let connectionAttempts = 0;
        const maxConnectionAttempts = props.maxConnectionAttempts || 5;
        let baseRetryDelay = 10000; // Starting with 10 seconds instead of 5
        let reconnectTimeout = null;
        let isConnecting = false;

        const startSignalR = async () => {
          // Don't try to connect if another connection attempt is in progress
          if (isConnecting) {
            log("Connection attempt already in progress, skipping redundant attempt");
            return;
          }

          if (connectionAttempts >= maxConnectionAttempts) {
            log(`Maximum connection attempts (${maxConnectionAttempts}) reached. Stopping reconnection attempts.`);
            return;
          }

          try {
            isConnecting = true;
            await connection.start();
            // Reset flags and connection attempts when connection succeeds
            connectionErrorLogged = false;
            connectionAttempts = 0;
            baseRetryDelay = 10000; // Reset delay on successful connection
            log("SignalR connection established successfully.");
            isConnecting = false;
          } catch (err) {
            connectionAttempts++;

            // Check specifically for CORS errors
            const isCorsError = err.message && (
              err.message.includes("CORS") ||
              err.message.includes("Failed to fetch") ||
              err.message.includes("NetworkError")
            );

            // Only log the error once or when the error type changes
            if (!connectionErrorLogged) {
              if (isCorsError) {
                log(`SignalR connection CORS error detected. This may be due to cross-origin restrictions. Attempts: ${connectionAttempts}/${maxConnectionAttempts}`);
              } else {
                log(`SignalR connection error: ${err}. Attempts: ${connectionAttempts}/${maxConnectionAttempts}`);
              }
              connectionErrorLogged = true;
            }

            // Clear any existing timeout to avoid multiple reconnection attempts
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
            }

            // Exponential backoff with jitter
            // More aggressive growth factor (2 instead of 1.5) and higher starting point
            const exponentialDelay = baseRetryDelay * Math.pow(2, Math.min(connectionAttempts - 1, 6));
            const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
            const retryDelay = exponentialDelay + jitter;

            // Cap at 2 minutes (120000ms)
            const cappedDelay = Math.min(retryDelay, 120000);

            log(`Reconnecting in ${Math.round(cappedDelay / 1000)} seconds (attempt ${connectionAttempts}/${maxConnectionAttempts})`);

            isConnecting = false;

            if (connectionAttempts < maxConnectionAttempts) {
              reconnectTimeout = setTimeout(startSignalR, cappedDelay);
            }
          }
        };

        connection.onclose(async () => {
          // Reset connectionErrorLogged so we log the first error after a disconnect
          connectionErrorLogged = false;
          log("SignalR connection closed. Attempting to reconnect...");

          // Clear any existing reconnection timeout
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
          }

          // Add a small delay before first reconnection attempt
          reconnectTimeout = setTimeout(startSignalR, 1000);
        });

        startSignalR();

        connection.on("NewMessage", (message) => {
          log(message);
          handleMessage(message);
        });

        refreshUI();
      },
      refresh: () => refreshUI(),
      upload: async (formData, filename) => {
        const { log, baseUrl, token } = window.Codicent;
        try {
          const response = await robustFetch(`${baseUrl}app/UploadFile?filename=${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: {
              "Authorization": `Bearer ${token}`,
            },
            body: formData,
          }, { timeout: 60000 }); // Longer timeout for file uploads

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const id = await response.json();
          log(`File uploaded successfully. ID: ${id}`);
          return id;
        } catch (error) {
          log('Error uploading file:', error);
          throw error;
        }
      },
      getFileInfo: async (fileId) => {
        const { log, baseUrl, token } = window.Codicent;
        try {
          const response = await robustFetch(`${baseUrl}app/GetFileInfo?fileId=${fileId}`, {
            method: 'GET',
            headers: {
              "Authorization": `Bearer ${token}`,
            },
          });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const fileInfo = await response.json();
          log(`File info retrieved successfully. ID: ${fileId}`);
          const { id, filename, createdAt, contentType } = fileInfo;
          return { id, filename, createdAt: new Date(createdAt), contentType };
        } catch (error) {
          log('Error getting file info:', error);
          throw error;
        }
      },
      postMessage: async ({ message, parentId, type }) => {
        const { token, log, baseUrl } = window.Codicent;
        // check that message and codicent are set
        if (!message || message.trim() === "") {
          throw new Error('Parameter message is required to post a message');
        }

        try {
          const response = await robustFetch(`${baseUrl}app/AddChatMessage`, {
            method: "POST",
            headers: [
              ["Content-Type", "application/json; charset=utf-8"],
              ["Authorization", `Bearer ${token}`],
            ],
            body: JSON.stringify({
              id: undefined,
              content: message,
              type: type || "info",
              nickname: undefined,
              createdAt: new Date(),
              isNew: false,
              parentId: parentId || undefined,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }

          const result = await response.json();
          return result.id;
        } catch (error) {
          log(`Error posting message: ${error.message}`);
          throw error;
        }
      },
      getMessages: async (props = {}) => {
        const { token, log, baseUrl } = window.Codicent;
        const { start, length, search, afterTimestamp, beforeTimestamp } = { ...{ start: 0, length: 10, search: "" }, ...props };
        try {
          const response = await robustFetch(`${baseUrl}app/GetChatMessages?start=${start}&length=${length}&search=${encodeURIComponent(search)}${afterTimestamp ? `&afterTimestamp=${afterTimestamp.toISOString()}` : ""}${beforeTimestamp ? `&beforeTimestamp=${beforeTimestamp.toISOString()}` : ""}${props.skipContent !== true ? "&includeContent=true" : ""}`,
            {
              method: "GET",
              headers: [
                ["Content-Type", "application/json; charset=utf-8"],
                ["Authorization", `Bearer ${token}`],
              ],
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }

          let messages = await response.json();
          messages.forEach((m) => {
            m.createdAt = new Date(Date.parse(m.createdAt));
          });

          return messages;
        } catch (error) {
          log(`Error getting messages: ${error.message}`);
          throw error;
        }
      },
      getDataMessages: async ({ codicent, tags, search }) => {
        const { token, log, baseUrl } = window.Codicent;
        try {
          const response = await robustFetch(`${baseUrl}app/FindDataMessages?project=${codicent}${search ? "&search=" + encodeURIComponent(search) : ""}`,
            {
              method: "POST",
              headers: [
                ["Content-Type", "application/json; charset=utf-8"],
                ["Authorization", `Bearer ${token}`],
              ],
              body: JSON.stringify({ tags }),
            }
          );
          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }

          const data = await response.json();
          return data;
        } catch (error) {
          log(`Error getting data messages: ${error.message}`);
          throw error;
        }
      },
      getChatReply: async (message) => {
        const { token, log, baseUrl } = window.Codicent;
        const controller = new AbortController();
        const signal = controller.signal;
        try {
          const response = await robustFetch(`${baseUrl}api/GetChatReply2?message=${encodeURIComponent(message)}`,
            {
              method: "GET",
              headers: [["Authorization", `Bearer ${token}`]],
              signal,
            },
            { maxRetries: 1, timeout: 5 * 60000 } // Fewer retries for AI calls, 5 minute timeout
          );

          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }

          const reply = await response.text();
          return reply;
        } catch (error) {
          log(`Error getting chat reply: ${error.message}`);
          throw error;
        }
      },
      getChatReply2: async ({ message, codicent, messageId }) => {
        const { token, log, baseUrl } = window.Codicent;
        const controller = new AbortController();
        const signal = controller.signal;
        try {
          const response = await robustFetch(`${baseUrl}app/GetAi2ChatReply?message=${encodeURIComponent(message)}&project=${codicent}${messageId ? `&messageId=${messageId}` : ""}`,
            {
              method: "GET",
              headers: [["Authorization", `Bearer ${token}`]],
              signal,
            },
            { maxRetries: 1, timeout: 5 * 60000 } // Fewer retries for AI calls, 5 minute timeout
          );

          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }

          const reply = await response.json();
          return { id: reply.id, content: reply.content.substring(codicent.length + 2) };
        } catch (error) {
          log(`Error getting chat reply: ${error.message}`);
          throw error;
        }
      },

      getChatReply3: async ({ message, codicent, messageId }) => {
        const { token, log, baseUrl } = window.Codicent;
        const controller = new AbortController();
        const signal = controller.signal;
        try {
          const response = await robustFetch(`${baseUrl}app/GetAi2ChatReply`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ message, project: codicent, messageId }),
            signal,
          }, { maxRetries: 1, timeout: 5 * 60000 }); // Fewer retries for AI calls, 5 minute timeout

          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }

          const reply = await response.json();
          return { id: reply.id, content: reply.content.substring(codicent.length + 2) };
        } catch (error) {
          log(`Error getting chat reply: ${error.message}`);
          throw error;
        }
      },

      getChatReply4: async ({ message, codicent, messageId, maxPollingTime = 5 * 60 * 1000, pollingInterval = 2000 }) => {
        const { token, log, baseUrl } = window.Codicent;

        // Step 1: Start the async AI chat request
        const startPayload = {
          project: codicent,
          message,
        };

        if (messageId) {
          startPayload.messageId = messageId;
        }

        let promptMessageId;
        try {
          const startResponse = await robustFetch(`${baseUrl}app/StartAi2ChatAsync`, {
            method: "POST",
            headers: [
              ["Content-Type", "application/json; charset=utf-8"],
              ["Authorization", `Bearer ${token}`],
            ],
            body: JSON.stringify(startPayload),
          });

          if (!startResponse.ok) {
            if (startResponse.status === 401) {
              // Unauthorized, clear the token if needed
              // token = '';
            }
            log(`Failed to start AI chat: ${startResponse.status}`);
            return undefined;
          }

          const startJson = await startResponse.json();
          promptMessageId = startJson.promptMessageId;

          if (!promptMessageId) {
            log("No promptMessageId returned from server");
            return undefined;
          }
        } catch (error) {
          log("Error starting AI chat:", error);
          return undefined;
        }

        // Step 2: Poll for the result
        const startTime = Date.now();

        while (Date.now() - startTime < maxPollingTime) {
          try {
            const statusResponse = await robustFetch(`${baseUrl}app/GetAi2ChatReplyStatus?promptMessageId=${promptMessageId}`, {
              method: "GET",
              headers: [["Authorization", `Bearer ${token}`]],
            });

            if (statusResponse.status === 202) {
              // Still processing, wait and try again
              await new Promise((resolve) => setTimeout(resolve, pollingInterval));
              continue;
            }

            if (!statusResponse.ok) {
              log(`Error polling AI chat status: ${statusResponse.status}`);
              return undefined;
            }

            // Got a result!
            const json = await statusResponse.json();
            const reply = json;

            // Remove project mentions and trim
            return reply.content.replace(`@${codicent}`, "").replace("@codicent-mini", "").trim();
          } catch (error) {
            log("Error polling AI chat status:", error);
            return undefined;
          }
        }

        // Timeout reached
        log("Polling timeout reached for AI chat");
        return undefined;
      },
      /**
       * CRUD methods for data messages (create, read, update, delete)
       */
      data: {
        /**
         * Create a data message (with a single tag and JSON data)
         * @param {Object} params
         * @param {string} params.codicent - Project/codicent name
         * @param {string} params.tag - Single tag (table name)
         * @param {Object} params.data - Data object to store
         * @returns {Promise<string>} - ID of created message
         */
        create: async ({ codicent, tag, data }) => {
          if (!codicent) throw new Error('codicent is required');
          const tagString = `#${tag}`;
          const mention = `@${codicent}`;
          const message = `${mention} ${tagString} ${JSON.stringify(data)}`;
          return window.Codicent.postMessage({ message });
        },

        /**
         * Read/list data messages (uses getDataMessages)
         * @param {Object} params
         * @param {string} params.codicent - Project/codicent name
         * @param {string} params.tag - Single tag (table name)
         * @param {string} [params.search] - Search string
         * @returns {Promise<Array>} - Array of data messages
         */
        read: async ({ codicent, tag, search = undefined }) => {
          // If search is undefined, do not pass it to getDataMessages
          const params = { codicent, tags: [tag], search };
          return window.Codicent.getDataMessages(params);
        },

        /**
         * Read a single data message by id (uses getMessages)
         * @param {string} id - Message ID
         * @returns {Promise<Object|null>} - Message or null
         */
        readOne: async (id) => {
          const messages = await window.Codicent.getMessages({ search: id, length: 1 });
          return messages.length ? messages[0] : null;
        },

        /**
         * Update a data message (post new message with parentId ref to old, keeps tag from old message)
         * @param {Object} params
         * @param {string} params.id - ID of message to update
         * @param {Object} params.data - New data object
         * @returns {Promise<string>} - ID of new message
         */
        update: async ({ id, data, codicent }) => {
          if (!codicent) throw new Error('codicent is required');
          // Fetch the old message to get its tag
          const oldMessages = await window.Codicent.getMessages({ search: id, length: 1 });
          if (!oldMessages.length) throw new Error("Old message not found");
          const oldMsg = oldMessages[0];
          // Extract all tags from the message content
          const tagMatch = oldMsg.content.match(/#[a-zA-Z0-9_-]+/g) || [];
          if (!tagMatch.length) throw new Error("No tags found in old message");
          const tagString = tagMatch.join(" ").trim();
          const mention = `@${codicent}`;
          const message = `${mention} ${tagString} ${JSON.stringify(data)}`;
          return window.Codicent.postMessage({ message, parentId: id });
        },

        /**
         * Delete a data message (post #hidden with parentId ref to old)
         * @param {Object} params
         * @param {string} params.id - ID of message to delete
         * @returns {Promise<string>} - ID of delete message
         */
        delete: async ({ id, codicent }) => {
          return window.Codicent.postMessage({ message: `@${codicent} #hidden`, parentId: id });
        }
      },

      createCustomElement: createCustomElement = (elementName, template) => {
        class CustomElement extends HTMLElement {
          constructor() {
            super();
            this.attachShadow({ mode: 'open' });
          }

          static get observedAttributes() {
            const regex = /{{(.*?)}}/g;
            const matches = [...template.matchAll(regex)];
            return matches.map(match => match[1]);
          }

          attributeChangedCallback(name, oldValue, newValue) {
            this.render();
          }

          connectedCallback() {
            this.render();
          }

          render() {
            let renderedTemplate = template;

            // Handle collections first
            const dataAttr = this.getAttribute('data');
            if (dataAttr) {
              const data = JSON.parse(dataAttr);
              const collectionRegex = /{{#each}}([\s\S]*?){{\/each}}/g;
              renderedTemplate = renderedTemplate.replace(collectionRegex, (match, p1) => {
                return data.map(item => {
                  let itemTemplate = p1;
                  Object.keys(item).forEach(key => {
                    const itemRegex = new RegExp(`{{${key}}}`, 'g');
                    itemTemplate = itemTemplate.replace(itemRegex, item[key]);
                  });
                  return itemTemplate;
                }).join('');
              });
            }

            // Handle individual attributes
            CustomElement.observedAttributes.forEach(attr => {
              const value = this.getAttribute(attr) || '';
              const regex = new RegExp(`{{${attr}}}`, 'g');
              renderedTemplate = renderedTemplate.replace(regex, value);
            });

            this.shadowRoot.innerHTML = renderedTemplate;
          }
        }

        customElements.define(elementName, CustomElement);
      },
    };

    // Merge the full functionality with the existing Codicent object
    window.Codicent = { ...window.Codicent, ...fullCodicentObject };

    const isData = (message) => {
      if (!message) return false;
      const start = message.indexOf("{");
      const end = message.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const data = message.substring(start, end + 1);
        try {
          JSON.parse(data);
          return true;
        } catch {
          return false;
        }
      }

      return false;
    };

    const getContentWithoutData = (message) => {
      if (isData(message)) {
        const start = message.indexOf("{");
        const end = message.lastIndexOf("}");
        const content = message.substring(0, start) + message.substring(end + 1);
        return content;
      }

      return message;
    };

    const getMentions = (text) => {
      const matches = getContentWithoutData(text).match(/(\s|^)@[a-zA-Z0-9_-]+/g);
      if (!matches) {
        return [];
      }
      return matches.map((m) => m.trim());
    };

    const getTags = (text) => {
      if (!text) {
        return [];
      }

      const matches = getContentWithoutData(text).match(/(\s|^)#[a-zA-Z0-9_-]+/g);
      if (!matches) {
        return [];
      }
      return matches.map((m) => m.trim());
    };

    const refreshUI = () => {
      // Select all buttons with the data-codicent-type attribute
      const codicentButtons = document.querySelectorAll('button[data-codicent-type]');
      codicentButtons.forEach(button => {
        button.addEventListener('click', function () {
          const messageType = button.getAttribute('data-codicent-type');
          const message = button.getAttribute('data-codicent-message');
          if (messageType === 'send') {
            window.Codicent.postMessage({ message });
          }
        });
      });

      // Select all elements with the data-codicent-type="counter" attribute
      const counterElements = document.querySelectorAll('[data-codicent-type="counter"]');
      counterElements.forEach(element => {
        const searchQuery = element.getAttribute('data-codicent-search');
        const skipContent = !!element.getAttribute('data-codicent-skip-content');
        let search = { search: searchQuery, length: 100000, skipContent };
        const afterTimestamp = element.getAttribute('data-codicent-after');
        if (afterTimestamp) {
          search.afterTimestamp = new Date(afterTimestamp);
        }
        const beforeTimestamp = element.getAttribute('data-codicent-before');
        if (beforeTimestamp) {
          search.beforeTimestamp = new Date(beforeTimestamp);
        }
        window.Codicent.getMessages(search).then(messages => {
          const messageCount = messages.length;
          element.textContent = messageCount;
        }).catch(console.error);
      });
    };
  };

  // document.addEventListener('DOMContentLoaded', refreshUI);
})(window);
