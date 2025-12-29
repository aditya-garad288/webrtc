class PeerService {
  constructor() {
    this.peers = new Map(); // socketId -> { peer: RTCPeerConnection, iceQueue: [] }
  }

  // Helper to create or get an existing peer connection container
  _getPeerEntry(id) {
    if (!this.peers.has(id)) {
      const peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      });
      this.peers.set(id, { peer, iceQueue: [] });
    }
    return this.peers.get(id);
  }

  getPeer(id) {
    return this._getPeerEntry(id).peer;
  }

  async getAnswer(id, offer) {
    const entry = this._getPeerEntry(id);
    const peer = entry.peer;
    
    await peer.setRemoteDescription(offer);
    await this.processIceQueue(id); // Fixed: await queue processing
    const ans = await peer.createAnswer();
    await peer.setLocalDescription(new RTCSessionDescription(ans));
    return ans;
  }

  async setRemoteDescription(id, ans) {
    const entry = this._getPeerEntry(id);
    const peer = entry.peer;
    
    await peer.setRemoteDescription(new RTCSessionDescription(ans));
    await this.processIceQueue(id); // Fixed: await queue processing
  }

  async addIceCandidate(id, candidate) {
    const entry = this._getPeerEntry(id);
    const peer = entry.peer;

    if (peer.remoteDescription) {
      await peer.addIceCandidate(candidate);
    } else {
      entry.iceQueue.push(candidate);
    }
  }

  async processIceQueue(id) {
    const entry = this.peers.get(id);
    if (!entry) return;
    
    while (entry.iceQueue.length > 0) {
      const candidate = entry.iceQueue.shift();
      try {
        await entry.peer.addIceCandidate(candidate);
      } catch (e) {
        console.error("Error adding queued ice candidate for " + id, e);
      }
    }
  }

  async getOffer(id) {
    const entry = this._getPeerEntry(id);
    const peer = entry.peer;

    const offer = await peer.createOffer();
    await peer.setLocalDescription(new RTCSessionDescription(offer));
    return offer;
  }

  reset() {
    this.peers.forEach((entry) => {
      entry.peer.close();
    });
    this.peers.clear();
  }
  
  removePeer(id) {
      if(this.peers.has(id)){
          this.peers.get(id).peer.close();
          this.peers.delete(id);
      }
  }
}

export default new PeerService();
