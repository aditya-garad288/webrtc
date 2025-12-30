import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";
import "./Lobby.css";

const LobbyScreen = () => {
  const [email, setEmail] = useState("");
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const socket = useSocket();
  const navigate = useNavigate();

  const handleJoinRoom = useCallback(
    (data) => {
      const { email, room, name } = data;
      setLoading(false);
      navigate(`/room/${room}`, { state: { email, name } });
    },
    [navigate]
  );

  const handleSubmitForm = useCallback(
    (e) => {
      e.preventDefault();
      setLoading(true);
      // Use acknowledgment callback
      socket.emit("room:join", { email, room, name }, (data) => {
          handleJoinRoom(data);
      });
    },
    [email, room, name, socket, handleJoinRoom]
  );

  const handleRoomFull = useCallback(({ room }) => {
    setLoading(false);
    alert(`Room ${room} is full (max 4 users). Please try another room.`);
  }, []);

  useEffect(() => {
    // socket.on("room:join", handleJoinRoom); // Removed in favor of callback
    socket.on("room:full", handleRoomFull);
    return () => {
      // socket.off("room:join", handleJoinRoom);
      socket.off("room:full", handleRoomFull);
    };
  }, [socket, handleRoomFull]);

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <div className="lobby-header">
          <h1 className="lobby-title">📹 Video Call Lobby</h1>
          <p className="lobby-subtitle">Connect with anyone, anywhere</p>
        </div>

        <form onSubmit={handleSubmitForm} className="lobby-form">
          <div className="form-group">
            <label htmlFor="name" className="form-label">
              👤 Display Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your Name"
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              📧 Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="room" className="form-label">
              🚪 Room Number
            </label>
            <input
              type="text"
              id="room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Enter room number"
              required
              className="form-input"
            />
          </div>

          <button type="submit" className="join-button" disabled={loading}>
            {loading ? (
              <span>⏳ Joining...</span>
            ) : (
              <>
                <span>Join Room</span>
                <span className="arrow">→</span>
              </>
            )}
          </button>
        </form>

        <div className="lobby-footer">
          <p className="info-text">
            💡 Tip: Share the room number with others to join the same call
          </p>
        </div>
      </div>

      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>
    </div>
  );
};

export default LobbyScreen;