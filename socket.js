const socket = require("socket.io");
const server = require("http").createServer();
const io = socket(server, {
    cors: {
        origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

io.on("connection", (socket) => {
    console.log("a user connected");
});

module.exports = io;

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});