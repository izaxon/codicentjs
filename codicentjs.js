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
    },
    upload: async (formData) => {
      const { log, baseUrl, token } = window.Codicent;
      try {
        const response = await fetch(`${baseUrl}app/UploadFile`, {
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

        const messages = await response.json();
        messages.forEach((m) => {
          m.createdAt = new Date(Date.parse(m.createdAt));
        });

        return messages;
      } catch (error) {
        log(`Error getting messages: ${error.message}`);
        throw error;
      }
    },
  };
})(window);
