// Push-to-talk keyboard controller for outgoing audio track transmission.
export class PushToTalk {
    key;
    enabled = false;
    transmitting = false;
    target;
    outgoingTrack = null;
    listening = false;
    constructor(options) {
        this.key = options?.key ?? "`";
        this.target = options?.target ?? document;
    }
    setKey(key) {
        this.key = key;
        console.log("[ptt] PTT key updated", { key: this.key });
    }
    getKey() {
        return this.key;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log("[ptt] PTT toggled", { enabled: this.enabled });
        if (!this.outgoingTrack) {
            return;
        }
        if (this.enabled) {
            this.transmitting = false;
            this.outgoingTrack.enabled = false;
            return;
        }
        this.transmitting = false;
        this.outgoingTrack.enabled = true;
    }
    isEnabled() {
        return this.enabled;
    }
    isTransmitting() {
        return this.transmitting;
    }
    start(outgoingTrack) {
        this.outgoingTrack = outgoingTrack;
        if (!this.listening) {
            this.target.addEventListener("keydown", this.handleKeyDown);
            this.target.addEventListener("keyup", this.handleKeyUp);
            this.listening = true;
            console.log("[ptt] Registered key listeners");
        }
        if (this.enabled) {
            this.outgoingTrack.enabled = false;
        }
    }
    stop() {
        if (this.listening) {
            this.target.removeEventListener("keydown", this.handleKeyDown);
            this.target.removeEventListener("keyup", this.handleKeyUp);
            this.listening = false;
            console.log("[ptt] Removed key listeners");
        }
        this.transmitting = false;
        if (this.outgoingTrack) {
            this.outgoingTrack.enabled = true;
        }
        this.outgoingTrack = null;
    }
    handleKeyDown = (event) => {
        if (!this.enabled || !this.outgoingTrack) {
            return;
        }
        if (event.repeat || event.key !== this.key) {
            return;
        }
        this.transmitting = true;
        this.outgoingTrack.enabled = true;
    };
    handleKeyUp = (event) => {
        if (!this.enabled || !this.outgoingTrack) {
            return;
        }
        if (event.key !== this.key) {
            return;
        }
        this.transmitting = false;
        this.outgoingTrack.enabled = false;
    };
}
