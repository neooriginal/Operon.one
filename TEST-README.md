# Socket and Orchestrator Test UI

This is a simple web UI for testing the socket connection and central orchestrator functionality of OperonOne.

## Setup

1. Make sure you have installed all dependencies:

   ```
   npm install
   ```

2. Start the main application (which runs the socket server on port 3000):

   ```
   npm start
   ```

3. In a separate terminal, start the test server (which runs on port 3001):

   ```
   node test-server.js
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3001
   ```

## Usage

1. Enter a task in the text area.
2. Click "Send Task" to submit the task to the central orchestrator.
3. Watch the status updates and event logs as the orchestrator processes the task.
4. All socket events will be displayed in the "Event Log" section.

## Example Tasks

You can test the orchestrator with tasks like:

- "Create a simple to-do list application"
- "Research the history of AI"
- "Write a short story about space exploration"

## Technical Details

- The main socket server runs on port 3000.
- The test web server runs on port 3001.
- The UI communicates with both:
  - Direct socket connection to port 3000 for real-time updates
  - HTTP API calls to port 3001 for submitting tasks

## Troubleshooting

- If you see "Connection Error" in the log, make sure the socket server is running.
- If task submission fails, ensure that the test server is running and can communicate with the main application.
- Check the console logs in both terminal windows for any error messages.
