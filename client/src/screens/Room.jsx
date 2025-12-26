import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import { useNavigate, useLocation } from "react-router-dom";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
import "./Room.css";

const RoomPage = () => {
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get my info from navigation state
  const myEmail = location.state?.email || "guest@example.com";
  const myName = location.state?.name || "Guest";

  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [remoteName, setRemoteName] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [peerConnection, setPeerConnection] = useState(peer.peer); // Track the current peer connection instance

  useEffect(() => {
    const startMyStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        setMyStream(stream);
      } catch (err) {
        console.error("Error accessing media devices:", err);
      }
    };
    startMyStream();
  }, []);

  const handleCallUser = useCallback(async (targetId) => {
    const id = targetId || remoteSocketId;
    console.log("Starting call...", { id });
    if (!id) {
      console.warn("Cannot call: No remote socket ID");
      return;
    }
    try {
      // Stream is already acquired in useEffect
      if (myStream) {
        // Add tracks to the peer connection
        myStream.getTracks().forEach((track) => {
           // Use peerConnection from state to ensure we check the right one
           const senders = peerConnection.getSenders();
           const trackAlreadyAdded = senders.some(sender => sender.track === track);
           if (!trackAlreadyAdded) {
             peerConnection.addTrack(track, myStream);
             console.log("Added track to peer:", track.kind);
           }
        });
      }

      const offer = await peer.getOffer();
      console.log("Offer created:", offer);
      socket.emit("user:call", { to: id, offer });
    } catch (err) {
      console.error("Error during call start:", err);
    }
  }, [remoteSocketId, socket, myStream, peerConnection]);

  const handleUserJoined = useCallback(({ email, id, name }) => {
    console.log(`User ${name} (${email}) joined room`);
    setRemoteSocketId(id);
    setRemoteName(name); // Store remote user's name
    socket.emit("user:welcome", { to: id, email: myEmail, name: myName });
    // Auto-start call
    handleCallUser(id);
  }, [socket, myEmail, myName, handleCallUser]);

  const handleWelcome = useCallback(({ from, email, name }) => {
    console.log(`Welcome from ${name} (${email})`);
    setRemoteSocketId(from);
    setRemoteName(name); // Store remote user's name
  }, []);

  // Ensure tracks are added whenever stream is ready (handles late getUserMedia)
  useEffect(() => {
    if (myStream) {
      myStream.getTracks().forEach((track) => {
        const senders = peerConnection.getSenders();
        const trackAlreadyAdded = senders.some(sender => sender.track === track);
        if (!trackAlreadyAdded) {
          peerConnection.addTrack(track, myStream);
          console.log("Auto-added track to peer:", track.kind);
        }
      });
    }
  }, [myStream, peerConnection]);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      setRemoteSocketId(from);
      console.log(`Incoming Call`, from, offer);
      try {
        if (myStream) {
           myStream.getTracks().forEach((track) => {
             const senders = peerConnection.getSenders();
             const trackAlreadyAdded = senders.some(sender => sender.track === track);
             if (!trackAlreadyAdded) {
               peerConnection.addTrack(track, myStream);
             }
           });
        }

        const ans = await peer.getAnswer(offer);
        socket.emit("call:accepted", { to: from, ans });
      } catch (err) {
        console.error("Error during incoming call handling:", err);
      }
    },
    [socket, myStream, peerConnection]
  );

  const sendStreams = useCallback(() => {
    if (!myStream) return;
    for (const track of myStream.getTracks()) {
      const senders = peerConnection.getSenders();
      const trackAlreadyAdded = senders.some(sender => sender.track === track);
      
      if (!trackAlreadyAdded) {
        peerConnection.addTrack(track, myStream);
        console.log("Track added:", track.kind);
      }
    }
  }, [myStream, peerConnection]);

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
    if (!remoteSocketId) return;
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }, [remoteSocketId, socket]);

  useEffect(() => {
    peerConnection.addEventListener("negotiationneeded", handleNegoNeeded);
    peerConnection.addEventListener("icecandidate", handleIceCandidate);
    return () => {
      peerConnection.removeEventListener("negotiationneeded", handleNegoNeeded);
      peerConnection.removeEventListener("icecandidate", handleIceCandidate);
    };
  }, [handleNegoNeeded, handleIceCandidate, peerConnection]);

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
    peerConnection.addEventListener("track", async (ev) => {
      const remoteStream = ev.streams;
      console.log("GOT TRACKS!!");
      setRemoteStream(remoteStream[0]);
    });
  }, [peerConnection]);

  const handleEndCall = useCallback(() => {
    // Notify remote user
    if (remoteSocketId) {
      socket.emit("call:ended", { to: remoteSocketId });
    }

    // Stop all local tracks
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
    }
    setMyStream(null);
    setRemoteStream(null);
    
    // Reset peer connection
    peer.reset();
    setPeerConnection(peer.peer); // Update state with new peer instance
    
    // Navigate back to lobby
    navigate("/");
  }, [myStream, navigate, remoteSocketId, socket]);

  const handleCallEnded = useCallback(({ from }) => {
    // If the person who left/ended is the one we are connected to
    // (Or simpler: just reset remote state if anyone leaves for now, assuming 1:1)
    if (remoteSocketId === from || !remoteSocketId) { 
        console.log("Call ended by remote user");
        setRemoteStream(null);
        setRemoteSocketId(null);
        setRemoteName(null);
        peer.reset();
        setPeerConnection(peer.peer); // Update state with new peer instance
    }
  }, [remoteSocketId]);

  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("user:welcome", handleWelcome);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);
    socket.on("peer:ice-candidate", handleIncomingIceCandidate);
    socket.on("call:ended", handleCallEnded);
    socket.on("user:left", handleCallEnded);

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("user:welcome", handleWelcome);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
      socket.off("peer:ice-candidate", handleIncomingIceCandidate);
      socket.off("call:ended", handleCallEnded);
      socket.off("user:left", handleCallEnded);
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
    handleCallEnded
  ]);

  const toggleAudio = useCallback(() => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, [myStream]);

  const toggleVideo = useCallback(() => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  }, [myStream]);

  return (
    <div className="room-container">
      <div className="header">
        <h1 className="app-title">📹 Video Call</h1>
        <div className="status-badge">
          {remoteSocketId ? (
            <span className="status-online">🟢 Connected</span>
          ) : (
            <span className="status-offline">⚪ Waiting for user...</span>
          )}
        </div>
      </div>

      <div className="video-grid">
        <div className="video-card local-video">
          {myStream && !isVideoOff ? (
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
              <img 
                src="https://img.freepik.com/premium-vector/man-avatar-profile-picture-vector-illustration_268834-538.jpg" 
                alt="Avatar" 
                className="avatar-img"
              />
              <span>Your Video Off</span>
            </div>
          )}
          <div className="video-label">{myName} (You) {isMuted && "(Muted)"}</div>
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
              <div className="loader-spinner"></div>
              <span>Waiting for video...</span>
            </div>
          )}
          <div className="video-label">{remoteName || "Remote User"}</div>
        </div>
      </div>

      <div className="controls-bar">
        {myStream && (
          <div className="controls-group">
            <button 
              className={`btn-icon ${isMuted ? 'btn-active' : ''}`} 
              onClick={toggleAudio}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? "🔇" : "🎤"}
            </button>
            <button 
              className={`btn-icon ${isVideoOff ? 'btn-active' : ''}`} 
              onClick={toggleVideo}
              title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
            >
              {isVideoOff ? "📷" : "📹"}
            </button>
            <button className="btn-icon btn-end" onClick={handleEndCall} title="End Call">
              📞
            </button>
          </div>
        )}
      </div>

      {!remoteSocketId && (
        <div className="instructions">
          <p>Share the Room ID with a friend to start chatting.</p>
        </div>
      )}
    </div>
  );
};

export default RoomPage;