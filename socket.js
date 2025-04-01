const socket = require("socket.io");
const server = require("http").createServer();
const io = socket(server);

io.on("connection", (socket) => {
    console.log("a user connected");
});

module.exports = io;

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});