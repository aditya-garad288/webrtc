import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import { useNavigate } from "react-router-dom";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
import "./Room.css";

const RoomPage = () => {
  const socket = useSocket();
  const navigate = useNavigate();
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();

  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined room`);
    setRemoteSocketId(id);
    socket.emit("user:welcome", { to: id, email });
  }, [socket]);

  const handleWelcome = useCallback(({ from, email }) => {
    console.log(`Welcome from ${email} (${from})`);
    setRemoteSocketId(from);
  }, []);

  const handleCallUser = useCallback(async () => {
    console.log("Starting call...", { remoteSocketId });
    if (!remoteSocketId) {
      console.warn("Cannot call: No remote socket ID");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      console.log("Stream acquired:", stream);
      setMyStream(stream);

      // Add tracks to the peer connection
      stream.getTracks().forEach((track) => {
        peer.peer.addTrack(track, stream);
        console.log("Added track to peer:", track.kind);
      });

      const offer = await peer.getOffer();
      console.log("Offer created:", offer);
      socket.emit("user:call", { to: remoteSocketId, offer });
    } catch (err) {
      console.error("Error during call start:", err);
    }
  }, [remoteSocketId, socket]);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      setRemoteSocketId(from);
      console.log(`Incoming Call`, from, offer);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        setMyStream(stream);

        // Add tracks to the peer connection
        stream.getTracks().forEach((track) => {
          peer.peer.addTrack(track, stream);
          console.log("Added track to peer (incoming):", track.kind);
        });

        const ans = await peer.getAnswer(offer);
        socket.emit("call:accepted", { to: from, ans });
      } catch (err) {
        console.error("Error during incoming call handling:", err);
      }
    },
    [socket]
  );

  const sendStreams = useCallback(() => {
    if (!myStream) return;
    for (const track of myStream.getTracks()) {
      const senders = peer.peer.getSenders();
      const trackAlreadyAdded = senders.some(sender => sender.track === track);
      
      if (!trackAlreadyAdded) {
        peer.peer.addTrack(track, myStream);
        console.log("Track added:", track.kind);
      }
    }
  }, [myStream]);

  const handleCallAccepted = useCallback(
    ({ from, ans }) => {
      peer.setRemoteDescription(ans);
      console.log("Call Accepted!");
      sendStreams();
    },
    [sendStreams]
  );

  const handleIceCandidate = useCallback((event) => {
    if (event.candidate) {
      socket.emit("peer:ice-candidate", {
        to: remoteSocketId,
        candidate: event.candidate,
      });
    }
  }, [remoteSocketId, socket]);

  const handleIncomingIceCandidate = useCallback(async ({ candidate }) => {
    try {
      if (candidate) {
        await peer.addIceCandidate(candidate);
      }
    } catch (e) {
      console.error("Error adding ice candidate", e);
    }
  }, []);

  const handleNegoNeeded = useCallback(async () => {
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }, [remoteSocketId, socket]);

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    peer.peer.addEventListener("icecandidate", handleIceCandidate);
    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
      peer.peer.removeEventListener("icecandidate", handleIceCandidate);
    };
  }, [handleNegoNeeded, handleIceCandidate]);

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }) => {
      const ans = await peer.getAnswer(offer);
      socket.emit("peer:nego:done", { to: from, ans });
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ ans }) => {
    await peer.setRemoteDescription(ans);
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
    socket.on("user:welcome", handleWelcome); // Added listener for welcome
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);
    socket.on("peer:ice-candidate", handleIncomingIceCandidate);

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("user:welcome", handleWelcome);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
      socket.off("peer:ice-candidate", handleIncomingIceCandidate);
    };
  }, [
    socket,
    handleUserJoined,
    handleWelcome,
    handleIncommingCall,
    handleCallAccepted,
    handleNegoNeedIncomming,
    handleNegoNeedFinal,
    handleIncomingIceCandidate,
  ]);

  const handleEndCall = useCallback(() => {
    // Stop all local tracks
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
    }
    setMyStream(null);
    setRemoteStream(null);
    
    // Reset peer connection
    peer.reset();
    
    // Navigate back to lobby
    navigate("/");
  }, [myStream, navigate]);

  return (
    <div className="room-container">
      <div className="header">
        <h1 className="app-title">📹 Video Call</h1>
        <div className="status-badge">
          {remoteSocketId ? (
            <span className="status-online">🟢 Connected to Remote</span>
          ) : (
            <span className="status-offline">⚪ Waiting for someone to join...</span>
          )}
        </div>
      </div>

      <div className="video-grid">
        <div className="video-card local-video">
          {myStream ? (
            <ReactPlayer
              playing
              muted
              height="100%"
              width="100%"
              url={myStream}
              className="video-player"
            />
          ) : (
            <div className="video-placeholder">
              <span>Your Video</span>
            </div>
          )}
          <div className="video-label">You</div>
        </div>

        <div className="video-card remote-video">
          {remoteStream ? (
            <ReactPlayer
              playing
              height="100%"
              width="100%"
              url={remoteStream}
              className="video-player"
            />
          ) : (
            <div className="video-placeholder">
              <span>Remote Video</span>
            </div>
          )}
          <div className="video-label">Remote User</div>
        </div>
      </div>

      <div className="controls-bar">
        {remoteSocketId && !myStream && (
          <button className="btn btn-success" onClick={handleCallUser}>
            📞 Call User
          </button>
        )}
        
        {myStream && (
            <button className="btn btn-danger" onClick={handleEndCall}>
              ❌ End Call
            </button>
        )}
      </div>

      {!myStream && !remoteStream && (
        <div className="instructions">
          <p>
            {remoteSocketId 
              ? "Both users are here! Click 'Call User' to start." 
              : "Share the Room ID with a friend to start chatting."}
          </p>
        </div>
      )}
    </div>
  );
};

export default RoomPage;