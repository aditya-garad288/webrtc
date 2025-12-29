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

  const [remoteUsers, setRemoteUsers] = useState([]); // Array of { id, name, stream }
  const [myStream, setMyStream] = useState();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

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

  const updateRemoteUserStream = (id, stream) => {
    setRemoteUsers((prev) => {
      const existing = prev.find((u) => u.id === id);
      if (existing) {
        return prev.map((u) => (u.id === id ? { ...u, stream } : u));
      }
      return [...prev, { id, stream, name: "User " + id.substr(0, 4) }];
    });
  };

  const setupPeerConnection = useCallback((id) => {
    const connection = peer.getPeer(id);

    // Handle Negotiation Needed
    const handleNegoNeeded = async () => {
      if (connection.signalingState !== "stable") {
        return;
      }
      const offer = await peer.getOffer(id);
      socket.emit("peer:nego:needed", { offer, to: id });
    };

    // Handle ICE Candidates
    const handleIceCandidate = (event) => {
      if (event.candidate) {
        socket.emit("peer:ice-candidate", {
          to: id,
          candidate: event.candidate,
        });
      }
    };

    // Handle Tracks (Remote Stream)
    const handleTrack = (ev) => {
      const remoteStream = ev.streams[0];
      console.log(`GOT TRACKS from ${id}!!`);
      updateRemoteUserStream(id, remoteStream);
    };

    connection.onnegotiationneeded = handleNegoNeeded;
    connection.onicecandidate = handleIceCandidate;
    connection.ontrack = handleTrack;

    // Add local tracks if available
    if (myStream) {
      myStream.getTracks().forEach((track) => {
        const senders = connection.getSenders();
        const trackAlreadyAdded = senders.some((sender) => sender.track === track);
        if (!trackAlreadyAdded) {
          connection.addTrack(track, myStream);
        }
      });
    }
  }, [socket, myStream]);

  const handleCallUser = useCallback(async (targetId) => {
    console.log("Starting call to", targetId);
    setupPeerConnection(targetId);
    const offer = await peer.getOffer(targetId);
    socket.emit("user:call", { to: targetId, offer });
  }, [setupPeerConnection, socket]);

  const handleUserJoined = useCallback(({ email, id, name }) => {
    console.log(`User ${name} (${email}) joined room`);
    // Add to remote users list with name (stream will come later)
    setRemoteUsers((prev) => {
      if (!prev.find((u) => u.id === id)) {
        return [...prev, { id, name, stream: null }];
      }
      return prev;
    });
    
    socket.emit("user:welcome", { to: id, email: myEmail, name: myName });
    handleCallUser(id);
  }, [socket, myEmail, myName, handleCallUser]);

  const handleWelcome = useCallback(({ from, email, name }) => {
    console.log(`Welcome from ${name} (${email})`);
    setRemoteUsers((prev) => {
      if (!prev.find((u) => u.id === from)) {
        return [...prev, { id: from, name, stream: null }];
      }
      return prev;
    });
  }, []);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      console.log(`Incoming Call from ${from}`);
      setupPeerConnection(from);
      const ans = await peer.getAnswer(from, offer);
      socket.emit("call:accepted", { to: from, ans });
    },
    [socket, setupPeerConnection]
  );

  const handleCallAccepted = useCallback(
    async ({ from, ans }) => {
      console.log("Call Accepted by", from);
      await peer.setRemoteDescription(from, ans);
      // Wait for tracks? They come via 'ontrack'
    },
    []
  );

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }) => {
      const ans = await peer.getAnswer(from, offer);
      socket.emit("peer:nego:done", { to: from, ans });
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ from, ans }) => {
    await peer.setRemoteDescription(from, ans);
  }, []);

  const handleIncomingIceCandidate = useCallback(async ({ from, candidate }) => {
    try {
      await peer.addIceCandidate(from, candidate);
    } catch (e) {
      console.error("Error adding ice candidate", e);
    }
  }, []);

  const handleCallEnded = useCallback((data) => {
    const from = data.from || data.id;
    console.log(`Call ended by ${from}`);
    if (from) {
      peer.removePeer(from);
      setRemoteUsers((prev) => prev.filter((u) => u.id !== from));
    }
  }, []);

  const handleEndCall = useCallback(() => {
    // Notify all remote users
    remoteUsers.forEach(user => {
        socket.emit("call:ended", { to: user.id });
    });

    // Stop all local tracks
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
    }
    setMyStream(null);
    setRemoteUsers([]);
    
    // Reset all peer connections
    peer.reset();
    
    navigate("/");
  }, [myStream, navigate, remoteUsers, socket]);

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

  useEffect(() => {
    if (myStream) {
      remoteUsers.forEach((user) => {
        const connection = peer.getPeer(user.id);
        if (connection) {
          myStream.getTracks().forEach((track) => {
            const senders = connection.getSenders();
            const trackAlreadyAdded = senders.some((s) => s.track === track);
            if (!trackAlreadyAdded) {
              connection.addTrack(track, myStream);
            }
          });
        }
      });
    }
  }, [myStream, remoteUsers]);

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
          {remoteUsers.length > 0 ? (
            <span className="status-online">🟢 Connected ({remoteUsers.length})</span>
          ) : (
            <span className="status-offline">⚪ Waiting for others...</span>
          )}
        </div>
      </div>

      <div className="video-grid">
        {/* Local Video */}
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

        {/* Remote Videos */}
        {remoteUsers.map((user) => (
            <div key={user.id} className="video-card remote-video">
              {user.stream ? (
                <ReactPlayer
                  playing
                  height="100%"
                  width="100%"
                  url={user.stream}
                  className="video-player"
                />
              ) : (
                <div className="video-placeholder">
                  <div className="loader-spinner"></div>
                  <span>Connecting...</span>
                </div>
              )}
              <div className="video-label">{user.name || "User"}</div>
            </div>
        ))}
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

      {remoteUsers.length === 0 && (
        <div className="instructions">
          <p>Share the Room ID with friends to start a group call.</p>
        </div>
      )}
    </div>
  );
};

export default RoomPage;