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
          .configureLogging(signalR.LogLevel.Error)
          .withAutomaticReconnect()
          .build();

        const { connection } = window.Codicent.state;
        const startSignalR = async () => {
          try {
            await connection.start();
          } catch (err) {
            log(err);
            setTimeout(startSignalR, 15000);
          }
        };

        connection.onclose(async () => {
          await startSignalR();
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
      const matches = getContentWithoutData(text).match(/(?<=^|\s|\n)@[a-zA-Z0-9_-]+(?=\s|$|\n)/g);
      if (!matches) {
        return [];
      }
      return matches.map((m) => m.trim());
    };

    const getTags = (text) => {
      if (!text) {
        return [];
      }

      const matches = getContentWithoutData(text).match(/(?<=^|\s|\n)#[a-zA-Z0-9_-]+(?=\s|$|\n)/g);
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
