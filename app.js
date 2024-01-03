// Nama : Mochammad Faisal
// NIM  : 121203006
// Prodi: Teknik Informatika

const express = require("express");
const http = require("http");
const io = require("socket.io");
const path = require("path");
const MongoClient = require("mongodb").MongoClient;

const app = express();
const server = http.createServer(app);
const socketIo = io(server);

const PORT = process.env.PORT || 3000;
const mongoURL = "mongodb://localhost:27017";
const dbName = "AP3_UAS";

let chatCollection;

// Koneksi ke MongoDB

async function connectToMongo() {
  try {
    client = await MongoClient.connect(mongoURL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const db = client.db(dbName);
    chatCollection = db.collection("chat");

    console.log("Terhubung ke MongoDB");
  } catch (err) {
    console.error("Gagal terhubung ke MongoDB:", err);
    process.exit(1);
  }
}

connectToMongo();

const users = {};
const chatHistory = [];

app.use(express.static(path.join(__dirname, "public")));

socketIo.on("connection", async (socket) => {
  console.log("A user connected");

  // Mengirimkan riwayat chat dari database ke user yang baru bergabung
  try {
    const chatHistoryFromDB = await getChatHistoryFromDatabase();
    socket.emit("chat history", chatHistoryFromDB);
  } catch (err) {
    console.error("Error retrieving chat history from database:", err);
  }

  socket.on("setUsername", (username) => {
    const loginTime = new Date().toLocaleTimeString();
    users[socket.id] = { username, loginTime };
    const message = `${username} joined the chat`;
    socketIo.emit("chat message", { username: "Server", message });
    console.log(`${username} connected at ${loginTime}`);

    saveLoginInfoToDatabase(username, socket.id);
  });

  socket.on("chat message", async (msg) => {
    const username = users[socket.id].username;
    const messageData = { username, message: msg };

    // Hanya menyimpan pesan ke database jika bukan perintah khusus
    if (!isSpecialCommand(msg)) {
      await saveMessageToDatabase(username, msg);
    }

    socketIo.emit("chat message", messageData);

    if (msg === "!jam") {
      const currentTime = new Date().toLocaleTimeString();
      socket.emit("chat message", {
        username: "Server",
        message: `Current time on server: ${currentTime}`,
      });
    } else if (msg === "!users") {
      // Balas hanya kepada pengirim pesan
      socket.emit("chat message", {
        username: "Server",
        message: getUsersTable(),
      });
    } else if (msg === "!time") {
      // Balas hanya kepada pengirim pesan
      socket.emit("chat message", {
        username: "Server",
        message: `Current server time in WIB: ${new Date().toLocaleTimeString(
          "en-US",
          { timeZone: "Asia/Jakarta" }
        )}`,
      });
    }
  });

  socket.on("disconnect", () => {
    const username = users[socket.id];
    if (username) {
      const message = `${username.username} left the chat`;
      socketIo.emit("chat message", { username: "Server", message });
      console.log(
        `${
          username.username
        } disconnected at ${new Date().toLocaleTimeString()}`
      );
    }
    delete users[socket.id];
  });
});

function isSpecialCommand(msg) {
  const specialCommands = ["!jam", "!server", "!time", "!users"];
  return specialCommands.includes(msg.trim());
}

async function saveMessageToDatabase(username, message) {
  if (chatCollection) {
    try {
      const chatMessage = {
        username,
        message,
        timestamp: new Date().toISOString(),
      };
      await chatCollection.insertOne(chatMessage);
      console.log("Message inserted to database:", chatMessage);
    } catch (err) {
      console.error("Error inserting message to database:", err);
    }
  }
}

async function saveLoginInfoToDatabase(username, socketId) {
  if (chatCollection) {
    try {
      await chatCollection.insertOne({
        username,
        loginTime: new Date().toISOString(),
        socketId,
        type: "login",
      });
      console.log("Login info inserted to database:", username);
    } catch (err) {
      console.error("Error inserting login info to database:", err);
    }
  }
}

function getUsersTable() {
  const userTableHeader = "<table><tr><th>User</th><th>Login Time</th></tr>";
  const userRows = Object.entries(users)
    .map(
      ([socketId, { username, loginTime }]) =>
        `<tr><td>${username}</td><td>${loginTime}</td></tr>`
    )
    .join("");
  const userTableFooter = "</table>";
  return `${userTableHeader}${userRows}${userTableFooter}`;
}

async function getChatHistoryFromDatabase() {
  if (chatCollection) {
    try {
      const chatHistoryFromDB = await chatCollection
        .find({})
        .sort({ _id: 1 }) // Urutkan berdasarkan id secara ascending
        .toArray();
      return chatHistoryFromDB;
    } catch (err) {
      console.error("Error retrieving chat history from database:", err);
      throw err;
    }
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on localhost:${PORT}`);
});
