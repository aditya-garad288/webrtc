const { Server } = require("socket.io");
const https = require("https");
const fs = require("fs");

// Load the self-signed certificate
const options = {
  pfx: fs.readFileSync("server.pfx"),
  passphrase: "password"
};

const httpServer = https.createServer(options);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const emailToSocketIdMap = new Map();
const socketidToEmailMap = new Map();

io.on("connection", (socket) => {
  console.log(`Socket Connected`, socket.id);
  socket.on("room:join", (data, callback) => {
    const { email, room, name } = data;
    
    // Check room size (limit to 4)
    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
    if (roomSize >= 4) {
      socket.emit("room:full", { room });
      return;
    }

    emailToSocketIdMap.set(email, socket.id);
    socketidToEmailMap.set(socket.id, email);
    io.to(room).emit("user:joined", { email, id: socket.id, name });
    socket.join(room);
    
    // Send acknowledgement callback if client provided one
    if (typeof callback === "function") {
        callback(data);
    } else {
        // Fallback for older clients (if any)
        io.to(socket.id).emit("room:join", data);
    }
  });

  socket.on("user:welcome", ({ to, email, name }) => {
    io.to(to).emit("user:welcome", { from: socket.id, email, name });
  });

  socket.on("user:call", ({ to, offer, name }) => {
    console.log(`Call from ${socket.id} to ${to}`);
    io.to(to).emit("incomming:call", { from: socket.id, offer, name });
  });

  socket.on("call:accepted", ({ to, ans, name }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans, name });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    console.log("peer:nego:needed", offer);
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    console.log("peer:nego:done", ans);
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("peer:ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("peer:ice-candidate", { from: socket.id, candidate });
  });

  // State synchronization events
  socket.on("user:toggle-audio", ({ room, isMuted }) => {
    socket.to(room).emit("user:toggled-audio", { id: socket.id, isMuted });
  });

  socket.on("user:toggle-video", ({ room, isVideoOff }) => {
    socket.to(room).emit("user:toggled-video", { id: socket.id, isVideoOff });
  });

  socket.on("call:ended", ({ to }) => {
    io.to(to).emit("call:ended", { from: socket.id });
  });

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((room) => {
      socket.in(room).emit("user:left", { id: socket.id });
    });
  });
});

httpServer.listen(8000, () => {
  console.log("Secure Socket Server running on port 8000");
});