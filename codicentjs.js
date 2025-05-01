(function (window) {
  const signalRScript = document.createElement('script');
  signalRScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/3.1.0/signalr.js';
  signalRScript.onload = () => {
    initCodicent();
  };
  document.head.appendChild(signalRScript);

  const initCodicent = () => {
    window.Codicent = {
      baseUrl: 'https://codicent.com/',
      token: null,
      signalRHost: "https://codicent-prod-pubsub.azurewebsites.net/hub",
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
          const response = await fetch(`${baseUrl}app/UploadFile?filename=${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: {
              "Authorization": `Bearer ${token}`,
            },
            body: formData,
          });
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
          const response = await fetch(`${baseUrl}app/GetFileInfo?fileId=${fileId}`, {
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
          const response = await fetch(`${baseUrl}app/AddChatMessage`, {
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
          const response = await fetch(`${baseUrl}app/GetChatMessages?start=${start}&length=${length}&search=${encodeURIComponent(search)}${afterTimestamp ? `&afterTimestamp=${afterTimestamp.toISOString()}` : ""}${beforeTimestamp ? `&beforeTimestamp=${beforeTimestamp.toISOString()}` : ""}${props.skipContent !== true ? "&includeContent=true" : ""}`,
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
          const response = await fetch(`${baseUrl}app/FindDataMessages?project=${codicent}${search ? "&search=" + encodeURIComponent(search) : ""}`,
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
          const timeoutId = setTimeout(() => controller.abort(), 5 * 60000); // 5 minutes timeout
          const response = await fetch(`${baseUrl}api/GetChatReply2?message=${encodeURIComponent(message)}`,
            {
              method: "GET",
              headers: [["Authorization", `Bearer ${token}`]],
              signal,
            }
          );
          clearTimeout(timeoutId);
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
          const timeoutId = setTimeout(() => controller.abort(), 5 * 60000); // 5 minutes timeout
          const response = await fetch(`${baseUrl}app/GetAi2ChatReply?message=${encodeURIComponent(message)}&project=${codicent}${messageId ? `&messageId=${messageId}` : ""}`,
            {
              method: "GET",
              headers: [["Authorization", `Bearer ${token}`]],
              signal,
            }
          );
          clearTimeout(timeoutId);
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
          const timeoutId = setTimeout(() => controller.abort(), 5 * 60000); // 5 minutes timeout
          const response = await fetch(`${baseUrl}app/GetAi2ChatReply`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ message, project: codicent, messageId }),
            signal,
          });
          clearTimeout(timeoutId);
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
          const tagString = `#${tag}`;
          const message = `${tagString} ${JSON.stringify(data)}`;
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
        update: async ({ id, data }) => {
          // Fetch the old message to get its tag
          const oldMessages = await window.Codicent.getMessages({ search: id, length: 1 });
          if (!oldMessages.length) throw new Error("Old message not found");
          const oldMsg = oldMessages[0];
          // Extract the first tag from the message content
          const tagMatch = oldMsg.content.match(/#([a-zA-Z0-9_-]+)/);
          const tagString = tagMatch ? tagMatch[0] : "#data";
          const message = `${tagString} ${JSON.stringify(data)}`;
          return window.Codicent.postMessage({ message, parentId: id });
        },

        /**
         * Delete a data message (post #hidden with parentId ref to old)
         * @param {Object} params
         * @param {string} params.id - ID of message to delete
         * @returns {Promise<string>} - ID of delete message
         */
        delete: async ({ id }) => {
          return window.Codicent.postMessage({ message: "#hidden", parentId: id });
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
