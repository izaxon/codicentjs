// global.d.ts

export {}; // Ensure this file is treated as a module

declare global {
  interface CodicentConfig {
    token: string;
    signalRHost?: string;
  }

  interface PostMessageConfig {
    message: string;
    parentId?: string;
    type?: string;
  }

  interface GetMessagesConfig {
    start?: number;
    length?: number;
    search?: string;
    afterTimestamp?: Date;
  }

  interface Message {
    id: string;
    content: string;
    parentId?: string;
    type?: string;
    timestamp: Date;
    // Add other relevant fields based on your application's needs
  }

  interface Codicent {
    /**
     * Initializes the Codicent library with the provided configuration.
     * @param config - Configuration object containing the API token and optional SignalR host.
     */
    init(config: CodicentConfig): void;

    /**
     * Uploads a file to Codicent.
     * @param formData - FormData object containing the file to upload.
     * @param fileName - Name of the file being uploaded.
     * @returns A promise that resolves to the ID of the uploaded file.
     */
    upload(formData: FormData, fileName: string): Promise<string>;

    /**
     * Posts a message to Codicent.
     * @param config - Configuration object containing message details.
     * @returns A promise that resolves to the ID of the posted message.
     */
    postMessage(config: PostMessageConfig): Promise<string>;

    /**
     * Retrieves messages from Codicent.
     * @param config - Configuration object specifying message retrieval parameters.
     * @returns A promise that resolves to an array of messages.
     */
    getMessages(config?: GetMessagesConfig): Promise<Message[]>;

    /**
     * Handles incoming messages. Assign a function to process new messages.
     */
    handleMessage: (message: Message) => void;

    /**
     * Handles logging from Codicent. Assign a function to process log messages.
     */
    log: (message: any) => void;

    /**
     * Retrieves a chat reply from Codicent AI.
     * @param message - The message to get a reply for.
     * @returns A promise that resolves to the AI's reply.
     */
    getChatReply(message: string): Promise<string>;

    /**
     * Creates a custom HTML element for Codicent UI.
     * @param tagName - The name of the custom element to create.
     * @param html - The HTML content of the custom element.
     */
    createCustomElement(tagName: string, html: string): void;
  }

  interface Window {
    /**
     * The Codicent global object provided by the Codicent JavaScript library.
     */
    Codicent: Codicent;
  }
}
