// Audio player controller for theme music playback

class AudioPlayerController {
  constructor() {
    this.audio = null;
    this.audioContext = null;
    this.gainNode = null;
    this.sourceNode = null;
    this.currentBuffer = null;
    this.isMuted = true;
    this.hasUserInteracted = true;
    this.currentAudioFile = null;
    this.wasPlayingBeforeHidden = false;
    this.loadToken = 0;

    // DOM elements (initialized in init())
    this.muteBtn = null;
    this.unmuteIcon = null;
    this.muteIcon = null;
    this.trackSong = null;
    this.trackArtist = null;
    this.spotifyLink = null;
    this.playerContainer = null;
  }

  init() {
    this.audio = document.getElementById('audio-element');
    this.muteBtn = document.getElementById('mute-btn');
    this.unmuteIcon = document.getElementById('unmute-icon');
    this.muteIcon = document.getElementById('mute-icon');
    this.trackSong = document.getElementById('track-song');
    this.trackArtist = document.getElementById('track-artist');
    this.spotifyLink = document.getElementById('spotify-link');
    this.playerContainer = document.getElementById('audio-player');

    // Keep media element inert so iOS does not expose system media controls.
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.load();
    }

    // Initialize Web Audio graph.
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      this.audioContext = new AudioContextCtor();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.audioContext.destination);
    }

    // Always start muted
    this.updateMuteState();

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Mute/Unmute button
    this.muteBtn.addEventListener('click', () => this.toggleMute());

    // Audio events
    // Pause when page is hidden (e.g., screen off, tab switched)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.wasPlayingBeforeHidden = this.isPlaying();
        this.stopPlayback();
      } else if (this.wasPlayingBeforeHidden && this.hasUserInteracted) {
        void this.startPlayback();
      }
    });
  }

  async loadTrack(paletteInfo) {
    const { song, artist, url, audioFile } = paletteInfo;

    // Update track info display
    this.trackSong.textContent = song;
    this.trackArtist.textContent = artist;
    this.spotifyLink.href = url;

    // Handle missing audio file
    if (!audioFile) {
      this.playerContainer.classList.add('no-audio');
      this.stopPlayback();
      this.currentBuffer = null;
      this.currentAudioFile = null;
      return;
    }

    this.playerContainer.classList.remove('no-audio');
    this.currentAudioFile = audioFile;

    // Load and decode the selected track.
    const token = ++this.loadToken;
    try {
      const response = await fetch(audioFile, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await this.audioContext.decodeAudioData(arrayBuffer);
      if (token !== this.loadToken) {
        return;
      }
      this.currentBuffer = decoded;
      this.stopPlayback();
      if (!this.isMuted && this.hasUserInteracted) {
        await this.startPlayback();
      }
    } catch (error) {
      console.error('Audio decode error:', error);
      this.playerContainer.classList.add('no-audio');
    }
  }

  toggleMute() {
    if (!this.currentAudioFile) return;

    this.isMuted = !this.isMuted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.isMuted ? 0 : 1;
    }
    this.updateMuteState();

    // If unmuting and audio isn't playing, start it.
    if (!this.isMuted && !this.isPlaying()) {
      void this.startPlayback();
    }

    // Stop playback entirely when muted.
    if (this.isMuted) {
      this.stopPlayback();
    }
  }

  updateMuteState() {
    this.unmuteIcon.style.display = this.isMuted ? 'none' : 'block';
    this.muteIcon.style.display = this.isMuted ? 'block' : 'none';
  }

  handleError(e) {
    console.error('Audio error:', e);
    this.playerContainer.classList.add('no-audio');
  }

  async startPlayback() {
    if (!this.audioContext || !this.gainNode || !this.currentBuffer || this.isMuted) {
      return;
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.stopPlayback();
    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;
    source.loop = true;
    source.connect(this.gainNode);
    source.onended = () => {
      if (this.sourceNode === source) {
        this.sourceNode = null;
      }
    };
    source.start(0);
    this.sourceNode = source;
  }

  stopPlayback() {
    if (!this.sourceNode) {
      return;
    }
    this.sourceNode.onended = null;
    try {
      this.sourceNode.stop();
    } catch {
      // Ignore stop race conditions.
    }
    this.sourceNode.disconnect();
    this.sourceNode = null;
  }

  isPlaying() {
    return this.sourceNode != null;
  }
}

export const audioPlayer = new AudioPlayerController();
