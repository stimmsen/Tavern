// Push-to-talk keyboard controller for outgoing audio track transmission.

type PushToTalkOptions = {
  key?: string;
  target?: Document;
};

export class PushToTalk {
  private key: string;
  private enabled = false;
  private transmitting = false;
  private readonly target: Document;
  private outgoingTrack: MediaStreamTrack | null = null;
  private listening = false;

  public constructor(options?: PushToTalkOptions) {
    this.key = options?.key ?? "`";
    this.target = options?.target ?? document;
  }

  public setKey(key: string): void {
    this.key = key;
    console.log("[ptt] PTT key updated", { key: this.key });
  }

  public getKey(): string {
    return this.key;
  }

  public setEnabled(enabled: boolean): void {
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

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isTransmitting(): boolean {
    return this.transmitting;
  }

  public start(outgoingTrack: MediaStreamTrack): void {
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

  public stop(): void {
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

  public press(): void {
    if (!this.enabled || !this.outgoingTrack) {
      return;
    }

    this.transmitting = true;
    this.outgoingTrack.enabled = true;
  }

  public release(): void {
    if (!this.enabled || !this.outgoingTrack) {
      return;
    }

    this.transmitting = false;
    this.outgoingTrack.enabled = false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !this.outgoingTrack) {
      return;
    }

    if (event.repeat || event.key !== this.key) {
      return;
    }

    this.press();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!this.enabled || !this.outgoingTrack) {
      return;
    }

    if (event.key !== this.key) {
      return;
    }

    this.release();
  };
}
