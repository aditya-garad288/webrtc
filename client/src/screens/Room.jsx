import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
import "./Room.css";

const RoomPage = () => {
  const socket = useSocket();
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();

  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined room`);
    setRemoteSocketId(id);
  }, []);

  const handleCallUser = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const offer = await peer.getOffer();
    socket.emit("user:call", { to: remoteSocketId, offer });
    setMyStream(stream);
  }, [remoteSocketId, socket]);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      setRemoteSocketId(from);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setMyStream(stream);
      console.log(`Incoming Call`, from, offer);
      const ans = await peer.getAnswer(offer);
      socket.emit("call:accepted", { to: from, ans });
    },
    [socket]
  );

  const sendStreams = useCallback(() => {
    for (const track of myStream.getTracks()) {
      const senders = peer.peer.getSenders();
      const trackAlreadyAdded = senders.some(sender => sender.track === track);
      
      if (!trackAlreadyAdded) {
        peer.peer.addTrack(track, myStream);
        console.log("Track added:", track.kind);
      } else {
        console.log("Track already exists, skipping:", track.kind);
      }
    }
  }, [myStream]);

  const handleCallAccepted = useCallback(
    ({ from, ans }) => {
      peer.setLocalDescription(ans);
      console.log("Call Accepted!");
      sendStreams();
    },
    [sendStreams]
  );

  const handleNegoNeeded = useCallback(async () => {
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }, [remoteSocketId, socket]);

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded]);

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }) => {
      const ans = await peer.getAnswer(offer);
      socket.emit("peer:nego:done", { to: from, ans });
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ ans }) => {
    await peer.setLocalDescription(ans);
  }, []);

  useEffect(() => {
    peer.peer.addEventListener("track", async (ev) => {
      const remoteStream = ev.streams;
      console.log("GOT TRACKS!!");
      setRemoteStream(remoteStream[0]);
    });
  }, []);

  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
    };
  }, [
    socket,
    handleUserJoined,
    handleIncommingCall,
    handleCallAccepted,
    handleNegoNeedIncomming,
    handleNegoNeedFinal,
  ]);

  return (
    <div className="room-container">
      <div className="header">
        <h1 className="app-title">📹 Video Call Room</h1>
        <div className="status-badge">
          {remoteSocketId ? (
            <span className="status-online">🟢 Connected</span>
          ) : (
            <span className="status-offline">⚪ Waiting for others...</span>
          )}
        </div>
      </div>

      <div className="controls-section">
        {remoteSocketId && (
          <button className="btn btn-primary" onClick={handleCallUser}>
            📞 Start Call
          </button>
        )}
        {myStream && (
          <button className="btn btn-secondary" onClick={sendStreams}>
            📤 Send Stream
          </button>
        )}
      </div>

      <div className="video-grid">
        {myStream && (
          <div className="video-card">
            <div className="video-wrapper">
              <ReactPlayer
                playing
                muted
                height="100%"
                width="100%"
                url={myStream}
                className="video-player"
              />
              <div className="video-label">You</div>
            </div>
          </div>
        )}

        {remoteStream && (
          <div className="video-card">
            <div className="video-wrapper">
              <ReactPlayer
                playing
                height="100%"
                width="100%"
                url={remoteStream}
                className="video-player"
              />
              <div className="video-label">Remote User</div>
            </div>
          </div>
        )}
      </div>

      {!myStream && !remoteStream && (
        <div className="empty-state">
          <div className="empty-icon">🎥</div>
          <h2>No Active Streams</h2>
          <p>Start a call to begin video chatting</p>
        </div>
      )}
    </div>
  );
};

export default RoomPage;