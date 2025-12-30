import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import { useNavigate, useLocation, useParams, Navigate } from "react-router-dom";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";
import "./Room.css";

const RoomPage = () => {
  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId } = useParams();

  // Route Guard: Must have state from Lobby
  const hasState = location.state && location.state.email && location.state.name;
  
  // Get my info from navigation state
  const myEmail = location.state?.email || "";
  const myName = location.state?.name || "";

  const [remoteUsers, setRemoteUsers] = useState([]); // Array of { id, name, stream, isMuted, isVideoOff }
  const [myStream, setMyStream] = useState();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Note: Removed the useEffect redirect because we will handle it in the render return.

  useEffect(() => {
    // Only start stream if we are authenticated (have state)
    if (!hasState) return; 

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
    socket.emit("user:call", { to: targetId, offer, name: myName });
  }, [setupPeerConnection, socket, myName]);

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
    async ({ from, offer, name }) => {
      console.log(`Incoming Call from ${from} ${name ? `(${name})` : ''}`);
      
      if (name) {
        setRemoteUsers((prev) => {
          const existing = prev.find((u) => u.id === from);
          if (existing) {
             return prev.map(u => u.id === from ? { ...u, name } : u);
          }
          return [...prev, { id: from, name, stream: null }];
        });
      }

      setupPeerConnection(from);
      const ans = await peer.getAnswer(from, offer);
      socket.emit("call:accepted", { to: from, ans, name: myName });
    },
    [socket, setupPeerConnection, myName]
  );

  const handleCallAccepted = useCallback(
    async ({ from, ans, name }) => {
      console.log("Call Accepted by", from);
      
      if (name) {
        setRemoteUsers((prev) => {
          const existing = prev.find((u) => u.id === from);
          if (existing) {
             return prev.map(u => u.id === from ? { ...u, name } : u);
          }
          return [...prev, { id: from, name, stream: null }];
        });
      }

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

  // --- Toggle State Handlers ---

  const handleRemoteAudioToggled = useCallback(({ id, isMuted }) => {
    setRemoteUsers((prev) => prev.map(u => u.id === id ? { ...u, isMuted } : u));
  }, []);

  const handleRemoteVideoToggled = useCallback(({ id, isVideoOff }) => {
    setRemoteUsers((prev) => prev.map(u => u.id === id ? { ...u, isVideoOff } : u));
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
    
    // State listeners
    socket.on("user:toggled-audio", handleRemoteAudioToggled);
    socket.on("user:toggled-video", handleRemoteVideoToggled);

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
      socket.off("user:toggled-audio", handleRemoteAudioToggled);
      socket.off("user:toggled-video", handleRemoteVideoToggled);
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
    handleCallEnded,
    handleRemoteAudioToggled,
    handleRemoteVideoToggled
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
        const newMutedState = !audioTrack.enabled; // wait, enabled=false means muted
        // Wait, current logic: enabled = !enabled. 
        // If enabled was true, now false (muted). isMuted should be true.
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        socket.emit("user:toggle-audio", { room: roomId, isMuted: !audioTrack.enabled });
      }
    }
  }, [myStream, roomId, socket]);

  const toggleVideo = useCallback(() => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        socket.emit("user:toggle-video", { room: roomId, isVideoOff: !videoTrack.enabled });
      }
    }
  }, [myStream, roomId, socket]);

  if (!hasState) {
    return <Navigate to="/" replace />;
  }

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

      <div className={`video-grid remote-${remoteUsers.length}`}>
        {/* Remote Videos */}
        {remoteUsers.map((user) => (
            <div key={user.id} className="video-card remote-video">
              {user.stream && !user.isVideoOff ? (
                <ReactPlayer
                  playing
                  height="100%"
                  width="100%"
                  url={user.stream}
                  className="video-player"
                />
              ) : (
                <div className="video-placeholder">
                  {user.isVideoOff ? (
                    <div className="avatar-initial">
                        {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                    </div>
                  ) : (
                     <>
                      <div className="loader-spinner"></div>
                      <span>Connecting...</span>
                     </>
                  )}
                </div>
              )}
              <div className="video-label">
                {user.name || "User"} {user.isMuted && "🔇"}
              </div>
            </div>
        ))}
      </div>

      {/* Local Video - Floating/PiP */}
      <div className="floating-local-video">
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
              <div className="avatar-initial">
                 {myName ? myName.charAt(0).toUpperCase() : "U"}
              </div>
            </div>
          )}
          <div className="video-label-mini">You</div>
      </div>

      <div className="controls-bar">
        {myStream && (
          <div className="controls-group">
            <button 
              className={`btn-icon ${isMuted ? 'btn-active' : ''}`} 
              onClick={toggleAudio}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
              )}
            </button>
            <button 
              className={`btn-icon ${isVideoOff ? 'btn-active' : ''}`} 
              onClick={toggleVideo}
              title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
            >
              {isVideoOff ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
              )}
            </button>
            <button className="btn-icon btn-end" onClick={handleEndCall} title="End Call">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(135deg)' }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.19-2.19a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
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