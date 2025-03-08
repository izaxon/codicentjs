# Codicent JavaScript Library Documentation

## Including the Library in Your HTML

To include the Codicent JavaScript library in your HTML file, add the following script tag in your HTML file:

```html
<script src="https://izaxon.github.io/codicentjs/codicentjs.min.js"></script>
```

## Initialization

To initialize the library, you need to call the `init` function and pass an object with the following properties:

- `token`: Your Codicent API token. This is required.
- `signalRHost`: The URL of your SignalR Host. This is optional. 
- `maxConnectionAttempts`: Maximum number of SignalR connection attempts before giving up. Default is 5.

```javascript
window.onload = () => {
  window.Codicent.init({
    token: 'YOUR_TOKEN',
    maxConnectionAttempts: 3 // Optional, default is 5
  });
}
```

## Upload a File

To upload a file, call the `upload` function and pass a `FormData` object. This function returns the ID of the uploaded file.

```javascript
const formData = new FormData();
formData.append('file', file);
const id = await window.Codicent.upload(formData, file.name);
```

## Post a Message

To post a message, call the `postMessage` function and pass an object with the following properties:

- `message`: The content of your message. This is required.
- `parentId`: The ID of the parent message. This is optional.
- `type`: The type of your message. This is optional.

```javascript
const messageId = await window.Codicent.postMessage({
  message: 'YOUR_MESSAGE_CONTENT',
  parentId: 'PARENT_MESSAGE_ID', // optional
  type: 'YOUR_MESSAGE_TYPE', // optional
});
```

## Get Messages

To get messages, call the `getMessages` function and pass an object with the following properties:

- `start`: The starting index of the messages to fetch. This is optional and defaults to 0.
- `length`: The number of messages to fetch. This is optional and defaults to 10.
- `search`: The search query. This is optional and defaults to an empty string.
- `afterTimestamp`: The timestamp to fetch messages after. This is optional.

```javascript
const messages = await window.Codicent.getMessages({
  start: 0, // optional
  length: 10, // optional
  search: 'YOUR_SEARCH_QUERY', // optional
  afterTimestamp: new Date('2024-01-01'), // optional
});
```

## Handle New Messages

To handle new messages, you can define a `handleMessage` function. This function will be called whenever a new message is received.

```javascript
window.Codicent.handleMessage = function(message) {
  console.log('New message received:', message);
};
```

## Logging

To handle logging, you can define a `log` function. This function will be called whenever there's something to log.

```javascript
window.Codicent.log = function(message) {
  console.log('Codicent log:', message);
};
```

## SignalR Connection Handling

The library implements an advanced connection strategy for SignalR with:

- Exponential backoff between retry attempts
- Maximum retry limit (configurable via `maxConnectionAttempts`)
- CORS error detection and specialized logging
- Automatic reconnection after disconnection

When working in development environments where CORS might be an issue, you can:
1. Set a lower value for `maxConnectionAttempts` to avoid excessive error messages
2. Implement a custom log function to filter out connection errors

```javascript
window.Codicent.init({
  token: 'YOUR_TOKEN',
  maxConnectionAttempts: 3,
  log: (msg) => {
    if (!msg.includes('SignalR connection')) {
      console.log(msg); // Only log non-connection messages
    }
  }
});
```

## Codicent AI chat

To get a chat reply from Codicent AI, call the `getChatReply` function and pass the message you want to get a reply for.

```javascript
const reply = await window.Codicent.getChatReply("Write a short text about Codicent!");
```

## Codicent UI HTML Elements
With `codicentjs` you can easily create Codicent UI elements in your HTML file. Here are some examples:

### Log Button
```html
<button data-codicent-type="send" data-codicent-message="#log button pressed">Send message to codicent</button>
```
The log button automatically attaches to the click handler of the button and sends the message to Codicent in the format `#log button pressed` when clicked.

### Message Counter
```html
<div data-codicent-type="counter" data-codicent-search="@codicent #log"></div>
```
The counter element automatically fetches the number of messages that contain the search query `@codicent #log` and displays the count.

### Custom HTML elements (experimental)
```html
window.Codicent.createCustomElement('send-button', `
  <button onclick="alert('Hello!')">Hello</button>
`);

<send-button></send-button>
```
With the `createCustomElement` function, you can create custom HTML elements that can be used in your HTML file.

## Building

Step: Obfuscate the JavaScript file

To obfuscate the JavaScript file, you can use a tool like UglifyJS or JavaScript Obfuscator. Here, I'll show you how to use UglifyJS.

Install UglifyJS using npm:

npm install -g uglify-js
Then, run the following command to obfuscate the codicentjs.js file:

`uglifyjs codicentjs.js --output codicentjs.min.js`
This will generate a minified and obfuscated version of your JavaScript file, named codicentjs.min.js.
