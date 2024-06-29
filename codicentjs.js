(function (window) {
  const signalRScript = document.createElement('script');
  signalRScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/3.1.0/signalr.js';
  document.head.appendChild(signalRScript);

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
      const getMessagesContent = async (ids) => {
        if (ids.length === 0) return [];
        const response = await fetch(`${baseUrl}app/GetMessagesContent`, {
          method: "POST",
          headers: [
            ["Content-Type", "application/json; charset=utf-8"],
            ["Authorization", `Bearer ${token}`],
          ],
          body: JSON.stringify(ids),
        });

        const messages = await response.json();
        messages.forEach((m) => {
          m.createdAt = new Date(Date.parse(m.createdAt));
        });

        return messages;
      };

      try {
        const response = await fetch(`${baseUrl}app/GetChatMessages?start=${start}&length=${length}&search=${encodeURIComponent(search)}${afterTimestamp ? `&afterTimestamp=${afterTimestamp.toISOString()}` : ""}${beforeTimestamp ? `&beforeTimestamp=${beforeTimestamp.toISOString()}` : ""}`,
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

        if (props.skipContent !== true) {
          const messagesLackingContent = messages.filter((m) => !m.content);
          const content = await getMessagesContent(messagesLackingContent.map(m => m.id));
          content.forEach((m, i) => messagesLackingContent[i].content = m.content);
          messages = messages.filter(m => m.content.includes("#hidden") === false);

          if (search) {
            const tags = getTags(search);
            const mentions = getMentions(search);
            messages = messages.filter(m => tags.every(t => getTags(m.content).includes(t)) && mentions.every(x => getMentions(m.content).includes(x)));
          }
        }

        messages.forEach((m) => {
          m.createdAt = new Date(Date.parse(m.createdAt));
        });

        return messages;
      } catch (error) {
        log(`Error getting messages: ${error.message}`);
        throw error;
      }
    },
    getMessages2: async (props = {}) => {
      const { token, log, baseUrl } = window.Codicent;
      const { start, length, search, afterTimestamp, beforeTimestamp, tags, noTags } = { ...{ start: 0, length: 10 }, ...props };
      try {
        const response = await fetch(`${baseUrl}api/GetMessages`,
          {
            method: "POST",
            headers: [
              ["Content-Type", "application/json; charset=utf-8"],
              ["Authorization", `Bearer ${token}`],
            ],
            body: JSON.stringify({ start, length, search, afterTimestamp, beforeTimestamp, tags, noTags }),
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
      try {
        const response = await fetch(`${baseUrl}api/GetChatReply2?message=${encodeURIComponent(message)}`,
          {
            method: "GET",
            headers: [["Authorization", `Bearer ${token}`]],
          }
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
    }
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

  // document.addEventListener('DOMContentLoaded', refreshUI);
})(window);
