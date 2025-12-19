# WebRTC Video Calling Application

This project implements a **peer-to-peer video calling system** using **WebRTC** with a **Socket.io signaling server** and a **React frontend**.

---

## 📁 Project Structure

```
React-webRTC-main/
│
├── client/        # React frontend (UI)
│   ├── src/
│   ├── public/
│   └── package.json
│
├── server/        # Node.js + Socket.io signaling server
│   ├── index.js
│   └── package.json
│
└── .gitignore
```

> **Note:** `node_modules` folders are intentionally excluded from GitHub.

---

## ✅ Prerequisites

* Node.js (v16 or above recommended)
* npm
* Modern browser (Chrome / Edge / Firefox)
* Camera & Microphone access enabled

---

## ▶️ How to Run the Project (Step-by-Step)

You must run the **server** and **client** in **separate terminals**.

---

## 🔹 Step 1: Run the Backend (Signaling Server)

Open a terminal in the project root:

```cmd
cd server
npm install
node index.js
```

### Expected Behavior

* Terminal stays open
* No error messages
* Server listens on **port 8000**

> Opening `http://localhost:8000` in a browser may show a **404 page** — this is normal. The server is only for Socket.io signaling and does not serve a UI.

---

## 🔹 Step 2: Run the Frontend (React Client)

Open a **new terminal window**:

```cmd
cd client
npm install
npm start
```

* Browser opens automatically at:

  ```
  http://localhost:3000
  ```

---

## 🔗 Step 3: Verify Connection

Open browser **Developer Tools → Console**.

You should see a message like:

```
Connected to signaling server
```

This confirms:

* React app is running (port 3000)
* Socket.io server is running (port 8000)
* Client–server connection is successful

---

## 🎥 Step 4: Run the WebRTC Video Call Demo

1. Open **two browser windows or tabs**
2. In both windows, go to:

   ```
   http://localhost:3000
   ```
3. Enter:

   * Different emails / usernames
   * The **same room ID** (e.g., `123`)
4. Click **Join Room** in both windows
5. In one window, click **Start Call**
6. Allow **camera and microphone permissions**

### Expected Result

* Two-way real-time video and audio
* Low latency (peer-to-peer connection)
* Video does **not** pass through the server

---

## ⚠️ Common Issues & Fixes

### ❌ `ERR_CONNECTION_REFUSED`

* Ensure the server is running on port 8000
* Check client connection URL:

  ```js
  io("http://localhost:8000")
  ```

### ❌ No Video / Audio

* Allow camera and microphone permissions
* Do not use incognito mode

### ❌ Only One Video Visible

* Ensure both users joined the **same room ID**

---

## 🧠 Important Notes

* Port **3000** → Frontend UI
* Port **8000** → Backend signaling server
* A 404 page on `localhost:8000` is **expected**
* WebRTC connections are encrypted using **DTLS/SRTP**

---

## 🛠 Optional (Demo Use)

* OBS Virtual Camera can be used to simulate multiple users
* TURN server can be added later for restricted networks

---

## ✅ Summary

* Peer-to-peer WebRTC video calling works
* Socket.io handles signaling only
* Lightweight, scalable architecture
* Ready for UI, auth, and database integration

---

## 📌 Next Steps (Optional Enhancements)

* Authentication integration
* Call logging (database)
* Screen sharing
* Chat and call controls
