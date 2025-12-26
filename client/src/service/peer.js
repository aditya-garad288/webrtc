class PeerService {
  constructor() {
    if (!this.peer) {
      this.peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      });
      this.iceCandidateQueue = [];
    }
  }

  async getAnswer(offer) {
    if (this.peer) {
      await this.peer.setRemoteDescription(offer);
      this.processIceQueue();
      const ans = await this.peer.createAnswer();
      await this.peer.setLocalDescription(new RTCSessionDescription(ans));
      return ans;
    }
  }

  async setRemoteDescription(ans) {
    if (this.peer) {
      await this.peer.setRemoteDescription(new RTCSessionDescription(ans));
      this.processIceQueue();
    }
  }

  async addIceCandidate(candidate) {
    if (this.peer) {
      if (this.peer.remoteDescription) {
        await this.peer.addIceCandidate(candidate);
      } else {
        this.iceCandidateQueue.push(candidate);
      }
    }
  }

  async processIceQueue() {
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      try {
        await this.peer.addIceCandidate(candidate);
      } catch (e) {
        console.error("Error adding queued ice candidate", e);
      }
    }
  }

  async getOffer() {
    if (this.peer) {
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(new RTCSessionDescription(offer));
      return offer;
    }
  }

  reset() {
    if (this.peer) {
      this.peer.close();
      this.peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      });
      this.iceCandidateQueue = [];
    }
  }
}

export default new PeerService();
